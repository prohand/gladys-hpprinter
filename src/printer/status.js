// -----------------------------------------------------------------------------
// From raw IPP attributes to the snapshot the rest of the integration reads.
//
// A snapshot is a plain object, JSON-safe (it is cached in /data):
//   { reachable, readAt, uuid, serial, model, name, firmware, state, reasons,
//     problems, acceptingJobs, supplies: [{ index, name, color, type, level }],
//     pages, formats }
//
// The printer's words (IPP keywords) are kept as is in `reasons`, for the
// logs; `problems` is what users see and filter scenes on: a short, closed
// list of what actually needs someone to walk to the printer.
// -----------------------------------------------------------------------------

/** IPP `printer-state` enum (RFC 8011 §5.4.11). */
const IPP_STATES = { 3: 'idle', 4: 'printing', 5: 'stopped' };

/** Every value the `state` of a snapshot (and of the Gladys feature) can take. */
export const PRINTER_STATES = ['idle', 'printing', 'stopped', 'offline'];

/**
 * The problems a scene can filter on — keys are stored in scenes: never
 * rename one. Each lists the IPP reasons (suffix removed) it covers.
 */
export const PROBLEMS = {
  paper_out: ['media-empty', 'media-needed'],
  paper_jam: ['media-jam'],
  door_open: ['door-open', 'cover-open', 'interlock-open'],
  supply_problem: [
    'marker-supply-empty',
    'toner-empty',
    'marker-supply-missing',
    'marker-waste-full',
  ],
  output_full: ['output-area-full'],
  tray_missing: ['input-tray-missing'],
  other: [],
};

const REASON_TO_PROBLEM = new Map(
  Object.entries(PROBLEMS).flatMap(([problem, reasons]) =>
    reasons.map((reason) => [reason, problem]),
  ),
);

/**
 * Split an IPP reason into its keyword and severity.
 * `media-empty-error` → { keyword: 'media-empty', severity: 'error' }. A
 * reason without suffix is an error (RFC 8011 §5.4.12).
 */
export function splitReason(reason) {
  const match = /^(.*)-(report|warning|error)$/.exec(reason);
  return match ? { keyword: match[1], severity: match[2] } : { keyword: reason, severity: 'error' };
}

/**
 * The problems behind a list of IPP reasons, in PROBLEMS order, without
 * duplicates. Reports never count; a reason we do not know only counts as
 * `other` when the printer calls it an error.
 *
 * @param {string[]} reasons
 * @returns {string[]}
 */
export function classifyReasons(reasons) {
  const found = new Set();
  for (const reason of reasons) {
    const { keyword, severity } = splitReason(reason);
    if (severity === 'report' || keyword === 'none') {
      continue;
    }
    const problem = REASON_TO_PROBLEM.get(keyword);
    if (problem) {
      found.add(problem);
    } else if (severity === 'error' && !IGNORED_ERRORS.has(keyword)) {
      found.add('other');
    }
  }
  return Object.keys(PROBLEMS).filter((problem) => found.has(problem));
}

// States a printer reports as errors that are not something to fix: it is
// paused on purpose, shutting down, or busy waking up.
const IGNORED_ERRORS = new Set([
  'paused',
  'moving-to-paused',
  'shutdown',
  'connecting-to-device',
  'timed-out',
  'offline',
  'spool-area-full',
]);

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function asText(value) {
  if (value && typeof value === 'object' && 'text' in value) {
    return value.text;
  }
  return typeof value === 'string' ? value : null;
}

/** `printer-device-id` is the IEEE 1284 string: `MFG:HP;MDL:...;SN:CN12345;`. */
export function parseDeviceId(deviceId) {
  const fields = {};
  for (const part of String(deviceId ?? '').split(';')) {
    const separator = part.indexOf(':');
    if (separator > 0) {
      fields[part.slice(0, separator).trim().toUpperCase()] = part.slice(separator + 1).trim();
    }
  }
  return fields;
}

/** Turn a supply colour (`#00FFFF`, `#00FFFF#FF00FF#FFFF00`, `none`) into a word. */
export function colorName(color) {
  const value = String(color ?? '').toUpperCase();
  const known = {
    '#000000': 'black',
    '#00FFFF': 'cyan',
    '#FF00FF': 'magenta',
    '#FFFF00': 'yellow',
  };
  if (known[value]) {
    return known[value];
  }
  if ((value.match(/#/g) ?? []).length > 1) {
    return 'tri-color';
  }
  return 'other';
}

/**
 * Normalize a Get-Printer-Attributes answer.
 *
 * @param {Record<string, any>} attributes the printer group of the answer
 * @param {{ pages?: number | null, now?: Date }} [extra] the LEDM counter, the clock
 * @returns {object} the snapshot
 */
export function buildSnapshot(attributes, { pages = null, now = new Date() } = {}) {
  const deviceId = parseDeviceId(attributes['printer-device-id']);
  const uuid = asText(attributes['printer-uuid'])
    ?.replace(/^urn:uuid:/i, '')
    .toLowerCase();
  const reasons = asArray(attributes['printer-state-reasons']).filter(
    (reason) => typeof reason === 'string' && reason !== 'none',
  );

  const names = asArray(attributes['marker-names']).map(asText);
  const colors = asArray(attributes['marker-colors']).map(asText);
  const types = asArray(attributes['marker-types']).map(asText);
  const levels = asArray(attributes['marker-levels']);
  const supplies = names.map((name, index) => {
    const level = levels[index];
    return {
      index,
      name: name || `Supply ${index + 1}`,
      color: colorName(colors[index]),
      type: types[index] ?? 'other',
      // -1 (unavailable), -2 (unknown), -3 (some left, amount unknown): no number.
      level: Number.isInteger(level) && level >= 0 ? Math.min(level, 100) : null,
    };
  });

  const ippPages = attributes['printer-impressions-completed'];
  const name =
    asText(attributes['printer-info']) ||
    asText(attributes['printer-make-and-model']) ||
    asText(attributes['printer-name']) ||
    'HP printer';

  return {
    reachable: true,
    readAt: now.toISOString(),
    uuid: uuid || null,
    serial: deviceId.SN || deviceId.SERN || null,
    model: asText(attributes['printer-make-and-model']) || deviceId.MDL || deviceId.MODEL || null,
    name,
    firmware: asText(attributes['printer-firmware-string-version']) || null,
    state: IPP_STATES[attributes['printer-state']] ?? 'idle',
    reasons,
    problems: classifyReasons(reasons),
    acceptingJobs: attributes['printer-is-accepting-jobs'] !== false,
    supplies,
    pages: Number.isInteger(ippPages) && ippPages >= 0 ? ippPages : pages,
    formats: asArray(attributes['document-format-supported']).filter((f) => typeof f === 'string'),
  };
}

/**
 * The stable identifier of a printer, used in its Gladys external ids — so it
 * must never change for the same machine: the IPP UUID, else the serial
 * number, else (last resort, documented) the address it was read at.
 */
export function printerId(snapshot, endpoint) {
  if (snapshot.uuid) {
    return snapshot.uuid.replace(/[^a-z0-9-]/g, '');
  }
  if (snapshot.serial) {
    return `sn-${snapshot.serial.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }
  return `host-${endpoint.host.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

/** The lowest known supply level, or null. */
export function lowestLevel(snapshot) {
  const levels = (snapshot?.supplies ?? []).map((s) => s.level).filter((l) => l !== null);
  return levels.length > 0 ? Math.min(...levels) : null;
}
