// -----------------------------------------------------------------------------
// The fleet against fake printers on the loopback and the SDK's fake Gladys:
// reading, publishing, scene triggers, addresses, printing.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { PrinterFleet, TRIGGERS } from '../src/printer/fleet.js';
import { createStore } from '../src/store.js';
import { endpointPrinterUri } from '../src/printer/endpoint.js';
import { startFakePrinter } from './helpers/fakePrinter.js';

const UUID = '12345678-90ab-cdef-1234-567890abcdef';

async function setUp(t, { config = {}, printers = 1, attributes = {}, now } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'hpprinter-'));
  const fakes = [];
  for (let i = 0; i < printers; i++) {
    fakes.push(await startFakePrinter({ attributes }));
  }
  t.after(async () => {
    await fleet.settle();
    await Promise.all(fakes.map((fake) => fake.close()));
    await rm(directory, { recursive: true, force: true });
  });
  const gladys = createFakeGladys();
  const store = createStore(directory);
  const clock = { now: now ?? new Date('2026-10-19T10:00:00Z') };
  const makeFleet = () =>
    new PrinterFleet({ gladys, store, readPages: async () => 777, now: () => clock.now });
  const fleet = makeFleet();
  const printersConfig = fakes.map((fake) => endpointPrinterUri(fake.endpoint)).join(', ');
  fleet.setConfig(normalizeConfig({ printers: printersConfig, auto_discovery: false, ...config }));
  await fleet.load();
  return { gladys, fleet, fakes, fake: fakes[0], store, clock, makeFleet, printersConfig };
}

test('a printer is read, published as a device and its states sent', async (t) => {
  const { gladys, fleet, fake } = await setUp(t);
  const report = await fleet.refreshAll();
  assert.equal(report.reachable.length, 1);
  assert.equal(report.unreachable.length, 0);

  const [record] = fleet.records();
  assert.equal(record.id, UUID);
  assert.equal(record.pages, 777, 'the LEDM counter fills in what IPP did not say');

  // The fake Gladys refuses what Gladys refuses: unknown categories, units...
  await gladys.publishDiscoveredDevices(fleet.buildDevices());
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'HP OfficeJet Pro 9010 series [A1B2C3]');
  assert.equal(device.external_id, `ext:test-integration:printer:${UUID}`);
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').pop()),
    ['state', 'alerts', 'supply-0', 'supply-1', 'supply-2', 'supply-3', 'pages'],
  );
  assert.deepEqual(
    device.params.find((p) => p.name === 'IPP_URI').value,
    endpointPrinterUri(fake.endpoint),
  );

  const feature = (key) => `${device.external_id}:${key}`;
  assert.equal(gladys.fake.lastState(feature('state')), 'Ready');
  assert.equal(gladys.fake.lastState(feature('alerts')), 'No alert');
  assert.equal(gladys.fake.lastState(feature('supply-3')), 20);
  assert.equal(gladys.fake.lastState(feature('pages')), 777);
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: device.external_id,
    transport: 'local',
  });
  assert.equal(fake.requests[0].path, '/ipp/print');
});

test('texts follow the configured language', async (t) => {
  const { gladys, fleet } = await setUp(t, { config: { language: 'fr' } });
  await fleet.refreshAll();
  const [device] = fleet.buildDevices();
  assert.equal(device.features[0].name, 'État');
  assert.equal(device.features[2].name, 'Encre noir');
  assert.equal(gladys.fake.lastState(`${device.external_id}:state`), 'Prête');
});

test('nothing fires on the first read; then supply low and new problems do, once', async (t) => {
  const { gladys, fleet, fake } = await setUp(t);
  await fleet.refreshAll();
  assert.deepEqual(gladys.fake.sceneEvents, []);

  fake.set({ levels: [60, 40, 30, 15], reasons: ['media-empty-error', 'toner-low-report'] });
  await fleet.refreshAll();
  const device = `ext:test-integration:printer:${UUID}`;
  assert.deepEqual(
    gladys.fake.sceneEvents.map(({ key, data }) => ({ key, data })),
    [
      {
        key: TRIGGERS.SUPPLY_LOW,
        data: { device, color: 'yellow', supply: 'Yellow', level: 15 },
      },
      {
        key: TRIGGERS.PRINTER_PROBLEM,
        data: { device, problem: 'paper_out', label: 'Out of paper' },
      },
    ],
  );
  assert.equal(gladys.fake.lastState(`${device}:alerts`), 'Out of paper');

  // Still low, still out of paper: no new event.
  fake.set({ levels: [60, 40, 30, 14] });
  await fleet.refreshAll();
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('a printer that stops answering goes offline once, keeps its levels and device', async (t) => {
  const { gladys, fleet, fake } = await setUp(t);
  await fleet.refreshAll();
  fake.down();
  const report = await fleet.refreshAll();
  assert.equal(report.reachable.length, 0);
  assert.equal(report.unreachable.length, 1);
  assert.equal(report.unreachable[0].error.code, 'HTTP_503');

  const device = `ext:test-integration:printer:${UUID}`;
  assert.equal(gladys.fake.lastState(`${device}:state`), 'Offline');
  assert.equal(gladys.fake.lastState(`${device}:supply-0`), 60);
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: device,
    transport: 'unreachable',
  });
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.PRINTER_UNREACHABLE],
  );
  assert.equal(fleet.buildDevices().length, 1, 'still listed: its device exists in Gladys');

  await fleet.refreshAll();
  assert.equal(gladys.fake.sceneEvents.length, 1, 'fired on the transition only');

  fake.up();
  await fleet.refreshAll();
  assert.equal(gladys.fake.lastState(`${device}:state`), 'Ready');
});

test('what was known survives a restart, so the next change still fires', async (t) => {
  const { gladys, fleet, fake, makeFleet, printersConfig } = await setUp(t);
  await fleet.refreshAll();

  const restarted = makeFleet();
  restarted.setConfig(normalizeConfig({ printers: printersConfig, auto_discovery: false }));
  await restarted.load();
  assert.equal(restarted.records().length, 1);

  fake.set({ levels: [10, 40, 30, 20] });
  await restarted.refreshAll();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.data.color),
    ['black'],
  );
});

test('a printer removed from the configuration is dropped', async (t) => {
  const { fleet } = await setUp(t);
  await fleet.refreshAll();
  fleet.setConfig(normalizeConfig({ printers: '', auto_discovery: false }));
  await fleet.refreshAll();
  assert.deepEqual(fleet.records(), []);
});

test('the same printer behind two addresses is one device', async (t) => {
  const { fleet, fake } = await setUp(t);
  const sameMachine = `${endpointPrinterUri(fake.endpoint)}, http://localhost:${fake.endpoint.port}/ipp/print`;
  fleet.setConfig(normalizeConfig({ printers: sameMachine, auto_discovery: false }));
  await fleet.refreshAll();
  assert.equal(fleet.records().length, 1);
  assert.equal(fleet.records()[0].endpoint.host, '127.0.0.1', 'the first address wins');
});

test('two printers are two devices, sorted by name', async (t) => {
  const { fleet, fakes } = await setUp(t, { printers: 2 });
  fakes[1].set({ uuid: 'urn:uuid:ffff', info: 'Atelier' });
  await fleet.refreshAll();
  assert.deepEqual(
    fleet.records().map((r) => r.name),
    ['Atelier', 'HP OfficeJet Pro 9010 series [A1B2C3]'],
  );
});

test('a poll reads at the configured pace, without waiting for the printer', async (t) => {
  const { fleet, fake, clock } = await setUp(t, { config: { poll_frequency: 300 } });
  await fleet.refreshAll();
  const id = fleet.externalId(fleet.records()[0]);
  const before = fake.requests.length;

  assert.equal(fleet.poll(id), true);
  assert.equal(fleet.poll(id), false, 'not due yet');
  clock.now = new Date(clock.now.getTime() + 271_000);
  assert.equal(fleet.poll(id), true, 'due within the tolerance');
  assert.equal(fleet.poll('ext:test-integration:printer:unknown'), false);

  await fleet.settle();
  assert.ok(fake.requests.length > before);
});

test('a printer that moved (DHCP) is found again by mDNS', async (t) => {
  const { gladys, fleet, fakes } = await setUp(t, { printers: 2 });
  const [oldAddress, newAddress] = fakes;
  gladys.fake.scanResults = {
    mdns: [
      {
        name: 'HP OfficeJet',
        host: 'hp.local',
        addresses: ['127.0.0.1'],
        port: oldAddress.endpoint.port,
        txt: ['usb_MFG=HP', `UUID=${UUID}`, 'rp=ipp/print'],
      },
    ],
  };
  fleet.setConfig(normalizeConfig({ printers: '', auto_discovery: true }));
  await fleet.discover();
  await fleet.refreshAll();
  const id = fleet.externalId(fleet.records()[0]);
  assert.equal(fleet.records()[0].endpoint.port, oldAddress.endpoint.port);

  oldAddress.down();
  gladys.fake.scanResults.mdns[0].port = newAddress.endpoint.port;
  fleet.lastDiscoveryAt = 0;
  const record = await fleet.refreshDevice(id);
  assert.equal(record.reachable, true);
  assert.equal(record.endpoint.port, newAddress.endpoint.port);
  assert.equal(gladys.fake.scans.length, 2);
});

test('discovery failures are not fatal', async (t) => {
  const { gladys, fleet } = await setUp(t, { config: { auto_discovery: true } });
  t.mock.method(gladys, 'scanNetwork', async () => {
    throw new Error('403 not declared');
  });
  assert.deepEqual(await fleet.discover(), []);
});

test('printing sends a PDF job; a refusal or a missing format says why', async (t) => {
  const { fleet, fake } = await setUp(t);
  await fleet.refreshAll();
  const id = fleet.externalId(fleet.records()[0]);

  assert.deepEqual(await fleet.print(id, { title: 'Courses', text: 'Lait' }), {
    printed: true,
    jobId: 42,
  });
  const [job] = fake.jobs;
  assert.equal(job.attributes['document-format'], 'application/pdf');
  assert.equal(job.attributes['job-name'], 'Courses');
  assert.ok(job.document.toString('latin1').startsWith('%PDF-1.4'));

  fake.refusePrints();
  assert.equal((await fleet.print(id, { text: 'x' })).reason, 'refused');

  fake.set({ formats: ['image/urf'] });
  await fleet.refreshAll();
  assert.equal((await fleet.print(id, { text: 'x' })).reason, 'pdf_unsupported');
  assert.equal((await fleet.print('nope', { text: 'x' })).reason, 'unknown_device');
});
