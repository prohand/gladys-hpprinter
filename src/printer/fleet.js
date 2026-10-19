// -----------------------------------------------------------------------------
// The printers this integration follows, and everything it knows about them.
//
// One "record" per printer, keyed by its stable id (src/printer/status.js):
//   { id, endpoint, configured, ...snapshot, reachable, problems, lastReadAt }
//
// The fleet reads the printers (IPP, plus the HP page counter), keeps the
// records in /data (src/store.js), publishes their states to Gladys and fires
// the scene triggers on the transitions it sees: a supply going under the
// threshold, a new problem, a printer that stops answering.
//
// Reads never overlap for the same address (a poll and a scene action asking
// at once share the same request), and a poll never waits for the printer:
// Gladys acks a poll in seconds, a sleeping printer can take longer to wake.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ippClient } from '../ipp/client.js';
import { buildDevice, buildStates, buildTransport, deviceIds } from '../devices/printer.js';
import { pick } from '../i18n.js';
import { endpointKey, endpointLabel } from './endpoint.js';
import { parseMdnsPrinters } from './discovery.js';
import { PROBLEM_LABELS, supplyLabel } from './labels.js';
import { readTotalImpressions } from './ledm.js';
import { buildSnapshot, printerId } from './status.js';
import { buildTextPdf } from './pdf.js';
import { createStore } from '../store.js';

const logger = createLogger({ name: 'fleet' });

/** Scene trigger keys, as declared in the manifest: never rename one. */
export const TRIGGERS = {
  SUPPLY_LOW: 'supply_low',
  PRINTER_PROBLEM: 'printer_problem',
  PRINTER_UNREACHABLE: 'printer_unreachable',
};

// Gladys' poll ticks drift by a few milliseconds: a read due within the next
// half-minute runs now, so a 300 s interval does not slip to 360 s.
const POLL_TOLERANCE_MS = 30_000;
// A printer that stopped answering may have changed address (DHCP): look for
// it again by mDNS, but not more than this often.
const REDISCOVERY_INTERVAL_MS = 10 * 60_000;
// A printer found by mDNS once and never seen again since is forgotten.
const DISCOVERED_TTL_MS = 7 * 24 * 3600_000;
const STATE_HEARTBEAT_MS = 30 * 60_000;
const MDNS_TIMEOUT_SECONDS = 5;

export class PrinterFleet {
  /**
   * @param {object} options
   * @param {object} options.gladys the SDK client
   * @param {object} [options.store] src/store.js
   * @param {object} [options.ipp] src/ipp/client.js
   * @param {(endpoint: object) => Promise<number|null>} [options.readPages]
   * @param {() => Date} [options.now]
   */
  constructor({ gladys, store, ipp, readPages, now } = {}) {
    this.gladys = gladys;
    this.store = store ?? createStore();
    this.ipp = ipp ?? ippClient;
    this.readPages = readPages ?? readTotalImpressions;
    this.now = now ?? (() => new Date());
    this.config = null;
    this.state = null;
    this.inFlight = new Map();
    // Reads started by polls, which nobody awaits (see poll()).
    this.background = new Set();
    this.lastDiscoveryAt = 0;
    // Called after anything users can see changed (states, devices).
    this.listeners = [];
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  notify(change) {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (err) {
        logger.error('Change listener failed', err);
      }
    }
  }

  async load() {
    if (!this.state) {
      this.state = await this.store.load();
    }
    return this.state;
  }

  setConfig(config) {
    this.config = config;
  }

  save() {
    return this.store.save(this.state);
  }

  // --- Addresses -------------------------------------------------------------

  /**
   * The addresses to read: the ones typed in the configuration first, then the
   * ones mDNS found (unless they point at a printer already typed by hand).
   */
  endpoints() {
    const result = [];
    const keys = new Set();
    for (const endpoint of this.config.endpoints) {
      keys.add(endpointKey(endpoint));
      result.push({ endpoint, configured: true, uuid: null });
    }
    if (!this.config.auto_discovery) {
      return result;
    }
    const configuredIds = new Set(
      Object.values(this.state.printers)
        .filter((record) => keys.has(endpointKey(record.endpoint)))
        .map((record) => record.uuid),
    );
    for (const entry of Object.values(this.state.discovered)) {
      const key = endpointKey(entry.endpoint);
      if (keys.has(key) || (entry.uuid && configuredIds.has(entry.uuid))) {
        continue;
      }
      keys.add(key);
      result.push({ endpoint: entry.endpoint, configured: false, uuid: entry.uuid });
    }
    return result;
  }

  /**
   * Browse the LAN for HP printers through the Gladys core (mDNS). Resolves
   * with what was found; never throws (an older Gladys or a refused scan only
   * means no automatic discovery).
   */
  async discover() {
    if (!this.config.auto_discovery) {
      return [];
    }
    await this.load();
    this.lastDiscoveryAt = this.now().getTime();
    let found;
    try {
      found = parseMdnsPrinters(
        await this.gladys.scanNetwork('mdns', { timeoutSeconds: MDNS_TIMEOUT_SECONDS }),
      );
    } catch (err) {
      logger.warn(`mDNS discovery failed: ${err.message}`);
      return [];
    }
    const seenAt = this.now().toISOString();
    for (const printer of found) {
      const key = printer.uuid ?? endpointKey(printer.endpoint);
      this.state.discovered[key] = { ...printer, seenAt };
      logger.info(`Found ${printer.name} at ${endpointLabel(printer.endpoint)}`);
    }
    const oldest = this.now().getTime() - DISCOVERED_TTL_MS;
    for (const [key, entry] of Object.entries(this.state.discovered)) {
      if (Date.parse(entry.seenAt) < oldest) {
        delete this.state.discovered[key];
      }
    }
    await this.save();
    return found;
  }

  // --- Reading ---------------------------------------------------------------

  /** Read one address. Resolves with the snapshot, or `{ error }`. */
  read(endpoint) {
    const key = endpointKey(endpoint);
    if (!this.inFlight.has(key)) {
      const reading = this.readNow(endpoint).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, reading);
    }
    return this.inFlight.get(key);
  }

  async readNow(endpoint) {
    try {
      const attributes = await this.ipp.getPrinterAttributes(endpoint);
      const ippPages = attributes['printer-impressions-completed'];
      const pages = Number.isInteger(ippPages) ? null : await this.readPages(endpoint);
      const snapshot = buildSnapshot(attributes, { pages, now: this.now() });
      logger.debug(
        `${endpointLabel(endpoint)}: ${snapshot.state}, reasons [${snapshot.reasons.join(', ')}], ` +
          `levels [${snapshot.supplies.map((s) => `${s.color}=${s.level}`).join(', ')}]`,
      );
      return snapshot;
    } catch (err) {
      logger.debug(`${endpointLabel(endpoint)} did not answer: ${err.message}`);
      return { error: err };
    }
  }

  /**
   * Read every address and bring the records up to date. Records nobody
   * points at any more (an address removed from the configuration, a
   * discovered printer forgotten) are dropped.
   *
   * @returns {Promise<{ reachable: object[], unreachable: Array<{ endpoint: object, error: Error }> }>}
   */
  async refreshAll() {
    // A button pressed while the connection is still initializing.
    await this.load();
    const targets = this.endpoints();
    const results = await Promise.all(targets.map((target) => this.read(target.endpoint)));
    const kept = new Set();
    const events = new Map();
    const report = { reachable: [], unreachable: [] };
    let devicesChanged = false;

    targets.forEach((target, index) => {
      const result = results[index];
      // The same printer behind two addresses: the first one (typed by hand)
      // wins, the other is not a second device.
      if (!result.error && kept.has(printerId(result, target.endpoint))) {
        return;
      }
      const outcome = this.apply(target, result);
      if (!outcome.record) {
        report.unreachable.push({ endpoint: target.endpoint, record: null, error: result.error });
        return;
      }
      kept.add(outcome.record.id);
      events.set(outcome.record.id, outcome.events);
      devicesChanged ||= outcome.devicesChanged;
      if (outcome.record.reachable) {
        report.reachable.push(outcome.record);
      } else {
        report.unreachable.push({
          endpoint: target.endpoint,
          record: outcome.record,
          error: result.error,
        });
      }
    });

    for (const id of Object.keys(this.state.printers)) {
      if (!kept.has(id)) {
        delete this.state.printers[id];
        devicesChanged = true;
      }
    }
    await this.save();
    for (const record of this.records()) {
      await this.publish(record, events.get(record.id));
    }
    this.notify({ devicesChanged });
    return report;
  }

  /**
   * Read the printer behind a Gladys device now.
   *
   * @returns {Promise<object | null>} the record, null for an unknown device
   */
  async refreshDevice(externalId) {
    const record = this.findByExternalId(externalId);
    if (!record) {
      return null;
    }
    let result = await this.read(record.endpoint);
    if (result.error && this.config.auto_discovery && record.uuid) {
      result = await this.rediscover(record, result);
    }
    const outcome = this.apply(
      { endpoint: record.endpoint, configured: record.configured, uuid: record.uuid },
      result,
    );
    await this.save();
    await this.publish(outcome.record, outcome.events);
    this.notify({ devicesChanged: outcome.devicesChanged });
    return outcome.record;
  }

  // A printer that stopped answering at its address may simply have a new one.
  async rediscover(record, failed) {
    if (this.now().getTime() - this.lastDiscoveryAt < REDISCOVERY_INTERVAL_MS) {
      return failed;
    }
    await this.discover();
    const entry = this.state.discovered[record.uuid];
    if (!entry || endpointKey(entry.endpoint) === endpointKey(record.endpoint)) {
      return failed;
    }
    logger.info(`${record.name} moved to ${endpointLabel(entry.endpoint)}`);
    const result = await this.read(entry.endpoint);
    if (!result.error) {
      record.endpoint = entry.endpoint;
    }
    return result;
  }

  /**
   * The poll of one Gladys device: re-read it when its interval elapsed.
   * Never waits for the printer (see the header).
   *
   * @returns {boolean} whether a read was started
   */
  poll(externalId) {
    const record = this.findByExternalId(externalId);
    if (!record) {
      return false;
    }
    const last = record.lastPolledAt ?? 0;
    const now = this.now().getTime();
    if (now - last < this.config.poll_frequency * 1000 - POLL_TOLERANCE_MS) {
      return false;
    }
    record.lastPolledAt = now;
    const task = this.refreshDevice(externalId)
      .catch((err) => logger.error(`Poll of ${record.name} failed`, err))
      .finally(() => this.background.delete(task));
    this.background.add(task);
    return true;
  }

  /** Wait for the reads still running and the last save (shutdown, tests). */
  async settle() {
    await Promise.all([...this.background]);
    await this.store.flush?.();
  }

  /**
   * Merge a read into the records, and list the scene events it causes.
   *
   * @returns {{ record: object | null, events: Array<{ key: string, data: object }>, devicesChanged: boolean }}
   */
  apply(target, result) {
    const key = endpointKey(target.endpoint);
    if (result.error) {
      // Unreachable: the record bound to this address (if any) goes offline.
      const record = Object.values(this.state.printers).find(
        (candidate) => endpointKey(candidate.endpoint) === key,
      );
      if (!record) {
        return { record: null, events: [], devicesChanged: false };
      }
      const events = [];
      if (record.reachable) {
        events.push({
          key: TRIGGERS.PRINTER_UNREACHABLE,
          data: { device: this.externalId(record), name: record.name },
        });
      }
      record.reachable = false;
      record.configured = target.configured;
      return { record, events, devicesChanged: false };
    }

    const snapshot = result;
    const id = printerId(snapshot, target.endpoint);
    const previous = this.state.printers[id];
    const record = {
      ...snapshot,
      id,
      endpoint: target.endpoint,
      configured: target.configured,
      lastReadAt: snapshot.readAt,
      lastPolledAt: previous?.lastPolledAt,
    };
    this.state.printers[id] = record;
    const devicesChanged = !previous || deviceShape(previous) !== deviceShape(record);
    return {
      record,
      events: previous ? this.transitions(previous, record) : [],
      devicesChanged,
    };
  }

  // The scene events between two reads of the same printer. Nothing fires on
  // the first read of a printer: there is no "before" to compare with.
  transitions(previous, record) {
    const device = this.externalId(record);
    const language = this.config.language;
    const threshold = this.config.low_level_threshold;
    const events = [];

    const before = new Map((previous.supplies ?? []).map((s) => [s.index, s.level]));
    for (const supply of record.supplies) {
      const was = before.get(supply.index);
      if (
        supply.level !== null &&
        was !== null &&
        was !== undefined &&
        was > threshold &&
        supply.level <= threshold
      ) {
        events.push({
          key: TRIGGERS.SUPPLY_LOW,
          data: {
            device,
            color: supply.color,
            supply: pick(language, supplyLabel(supply)),
            level: supply.level,
          },
        });
      }
    }

    const known = new Set(previous.problems ?? []);
    for (const problem of record.problems) {
      if (!known.has(problem)) {
        events.push({
          key: TRIGGERS.PRINTER_PROBLEM,
          data: { device, problem, label: pick(language, PROBLEM_LABELS[problem]) },
        });
      }
    }
    return events;
  }

  // --- Publishing ------------------------------------------------------------

  async publish(record, events = []) {
    if (!record) {
      return;
    }
    await this.gladys
      .publishChangedStates(buildStates(this.gladys, record, this.config), {
        heartbeat: STATE_HEARTBEAT_MS,
      })
      .catch((err) => logger.warn(`States of ${record.name} refused: ${err.message}`));
    await this.gladys
      .publishTransports([buildTransport(this.gladys, record)])
      .catch((err) => logger.warn(`Transport of ${record.name} refused: ${err.message}`));
    for (const event of events) {
      logger.info(`Scene trigger ${event.key} (${record.name})`);
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => logger.warn(`Scene trigger ${event.key} refused: ${err.message}`));
    }
  }

  buildDevices() {
    return this.records().map((record) => buildDevice(this.gladys, record, this.config));
  }

  // --- Lookups ---------------------------------------------------------------

  records() {
    return Object.values(this.state?.printers ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  }

  externalId(record) {
    return deviceIds(this.gladys, record).device;
  }

  findByExternalId(externalId) {
    return this.records().find((record) => this.externalId(record) === externalId) ?? null;
  }

  // --- Printing --------------------------------------------------------------

  /**
   * Print a text on the printer behind a Gladys device.
   *
   * @returns {Promise<{ printed: boolean, jobId: number | null, reason?: string }>}
   *   `reason`: 'unknown_device' | 'unreachable' | 'pdf_unsupported' | 'refused'
   */
  async print(externalId, { title, text }) {
    const record = this.findByExternalId(externalId);
    if (!record) {
      return { printed: false, jobId: null, reason: 'unknown_device' };
    }
    if (record.formats?.length > 0 && !record.formats.includes('application/pdf')) {
      return { printed: false, jobId: null, reason: 'pdf_unsupported' };
    }
    try {
      const { jobId } = await this.ipp.printJob(record.endpoint, {
        document: buildTextPdf({ title, text }),
        format: 'application/pdf',
        jobName: title || 'Gladys',
      });
      logger.info(`Job ${jobId ?? '?'} sent to ${record.name}`);
      return { printed: true, jobId };
    } catch (err) {
      logger.warn(`Printing on ${record.name} failed: ${err.message}`);
      return {
        printed: false,
        jobId: null,
        reason: err.code === 'IPP_STATUS' ? 'refused' : 'unreachable',
      };
    }
  }
}

// What the Gladys device is built from: when it changes, the device has to be
// published again (a cartridge slot appeared, the address moved...).
function deviceShape(record) {
  return JSON.stringify([
    record.name,
    record.endpoint,
    record.model,
    record.serial,
    record.pages === null || record.pages === undefined,
    (record.supplies ?? []).map((s) => [s.index, s.name, s.color, s.type]),
  ]);
}
