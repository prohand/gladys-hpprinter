// -----------------------------------------------------------------------------
// The whole integration against the SDK's fake Gladys: lifecycle, discovery,
// poll, Configuration screen buttons, scene actions and widgets.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { PrinterFleet } from '../src/printer/fleet.js';
import { endpointPrinterUri } from '../src/printer/endpoint.js';
import { createStore } from '../src/store.js';
import { startFakePrinter } from './helpers/fakePrinter.js';

const DEVICE = 'ext:test-integration:printer:12345678-90ab-cdef-1234-567890abcdef';

async function start(t, config = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'hpprinter-app-'));
  const fake = await startFakePrinter();
  t.after(async () => {
    await fleet.settle();
    await gladys.disconnect();
    await fake.close();
    await rm(directory, { recursive: true, force: true });
  });
  const gladys = createFakeGladys({
    config: { printers: endpointPrinterUri(fake.endpoint), auto_discovery: false, ...config },
  });
  const fleet = new PrinterFleet({
    gladys,
    store: createStore(directory),
    readPages: async () => 1500,
  });
  createApp(gladys, { fleet });
  await gladys.connect();
  return { gladys, fake, fleet };
}

test('on connection the printers are read and published, the status is green', async (t) => {
  const { gladys } = await start(t);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id),
    [DEVICE],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.lastState(`${DEVICE}:supply-0`), 60);
});

test('no printer at all, or none answering, is said in the status', async (t) => {
  const { gladys, fake } = await start(t, { printers: '' });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucune imprimante trouvée/);

  fake.down();
  await gladys.fake.configUpdated({
    printers: endpointPrinterUri(fake.endpoint),
    auto_discovery: false,
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.de, /Kein Drucker antwortet/);
});

test('a scan request searches by mDNS and publishes what answers', async (t) => {
  const { gladys } = await start(t, { auto_discovery: true });
  await gladys.fake.scanRequest();
  assert.ok(gladys.fake.scans.some((scan) => scan.type === 'mdns'));
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('a poll is acked at once; a command is refused', async (t) => {
  const { gladys } = await start(t);
  const [device] = gladys.fake.discoveredDevices;
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  const ack = await gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, false);
});

test('"Test the printers" lists what answered, in every language', async (t) => {
  const { gladys, fake } = await start(t);
  // A port nobody listens on any more: refused at once.
  const closed = await startFakePrinter();
  await closed.close();
  await gladys.fake.configUpdated({
    printers: `${endpointPrinterUri(fake.endpoint)}, ${endpointPrinterUri(closed.endpoint)}, ipps://x`,
    auto_discovery: false,
  });
  const {
    success,
    data: { message: data },
  } = await gladys.fake.action('test_connection', {});
  assert.equal(success, true);
  assert.match(data.en, /^1 printer answered\.\n• HP OfficeJet Pro 9010 series \[A1B2C3\]/);
  assert.match(data.en, /Ready, No alert, lowest level 20 %/);
  assert.match(data.en, /Not answering: 127\.0\.0\.1:\d+ \(ECONNREFUSED\)/);
  assert.match(data.en, /Addresses not understood: ipps:\/\/x/);
  assert.match(data.fr, /1 imprimante a répondu/);
  assert.match(data.de, /1 Drucker hat geantwortet/);
  assert.match(data.es, /1 impresora respondió/);
});

test('"Search for printers" says when discovery is off, or what it found', async (t) => {
  const { gladys } = await start(t);
  const run = async () => (await gladys.fake.action('discover_printers', {})).data.message;
  let data = await run();
  assert.match(data.en, /turned off/);

  await gladys.fake.configUpdated({ ...gladys.fake.config, auto_discovery: true });
  data = await run();
  assert.match(data.fr, /Aucune imprimante HP/);

  // Found, but switched off since: nothing listens on that port any more.
  const gone = await startFakePrinter();
  await gone.close();
  gladys.fake.scanResults = {
    mdns: [
      {
        name: 'HP LaserJet',
        addresses: ['127.0.0.1'],
        port: gone.endpoint.port,
        txt: ['usb_MFG=HP'],
      },
    ],
  };
  data = await run();
  assert.match(data.en, /1 HP printer found on the network: HP LaserJet \(127\.0\.0\.1:\d+\)/);
});

test('"Print a test page" prints on the chosen printer', async (t) => {
  const { gladys, fake } = await start(t);
  const { data } = await gladys.fake.action('print_test_page', { device: DEVICE });
  assert.equal(data.message.en, 'Test page sent to the printer.');
  assert.equal(fake.jobs.length, 1);
  const unknown = await gladys.fake.action('print_test_page', { device: 'x' });
  assert.match(unknown.data.message.en, /not known/);
});

test('scene action "Read a printer" hands its values to the scene', async (t) => {
  const { gladys, fake } = await start(t);
  fake.set({ reasons: ['media-jam-error'], levels: [5, 40, 30, 20] });
  const { success, data } = await gladys.fake.sceneAction('refresh_printer', { device: DEVICE });
  assert.equal(success, true);
  assert.deepEqual(data.outputs ?? data, {
    reachable: true,
    state: 'idle',
    alerts: 'Paper jam',
    lowest_level: 5,
    pages: 1500,
  });

  fake.down();
  const offline = await gladys.fake.sceneAction('refresh_printer', { device: DEVICE });
  assert.equal((offline.data.outputs ?? offline.data).state, 'offline');

  const unknown = await gladys.fake.sceneAction('refresh_printer', { device: 'nope' });
  assert.equal(unknown.success, false);
});

test('scene action "Print a text" prints, and reports a failure as an output', async (t) => {
  const { gladys, fake } = await start(t);
  const printed = await gladys.fake.sceneAction('print_text', {
    device: DEVICE,
    title: 'Courses',
    text: 'Lait\nPain',
  });
  assert.deepEqual(printed.data.outputs ?? printed.data, { printed: true, job_id: 42 });
  assert.equal(fake.jobs.length, 1);

  const empty = await gladys.fake.sceneAction('print_text', { device: DEVICE, text: '  ' });
  assert.deepEqual(empty.data.outputs ?? empty.data, { printed: false, job_id: -1 });

  fake.down();
  const failed = await gladys.fake.sceneAction('print_text', { device: DEVICE, text: 'x' });
  assert.equal(failed.success, true);
  assert.equal((failed.data.outputs ?? failed.data).printed, false);
});

test('the printer widget renders exactly as sent, gauges bound to the levels', async (t) => {
  const { gladys } = await start(t);
  const { data } = await gladys.fake.widgetGet('printer', {
    settings: { printer: DEVICE },
    language: 'fr',
    units: 'metric',
  });
  const content = data.content ?? data;
  assert.deepEqual(validateWidgetContent(content), []);
  const gauges = content.components.filter((c) => c.type === 'gauge');
  assert.deepEqual(
    gauges.map((g) => g.device_feature),
    [0, 1, 2, 3].map((i) => `${DEVICE}:supply-${i}`),
  );
  assert.deepEqual(
    gauges.map((g) => g.color),
    ['success', 'success', 'success', 'success'],
  );
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].value.fr, 'Prête');

  const empty = await gladys.fake.widgetGet('printer', { settings: {}, language: 'en' });
  assert.deepEqual(validateWidgetContent(empty.data.content ?? empty.data), []);
});

test('the widget buttons refresh and print', async (t) => {
  const { gladys, fake } = await start(t);
  const before = fake.requests.length;
  const refreshed = await gladys.fake.widgetAction(
    'printer',
    'refresh',
    { device: DEVICE },
    { settings: { printer: DEVICE } },
  );
  assert.equal(refreshed.success, true);
  assert.ok(fake.requests.length > before);

  await gladys.fake.widgetAction('printer', 'test_page', { device: DEVICE }, { settings: {} });
  assert.equal(fake.jobs.length, 1);

  const unknown = await gladys.fake.widgetAction('printer', 'explode', {}, { settings: {} });
  assert.equal(unknown.success, false);
  assert.ok(gladys.fake.widgetRefreshes.length > 0, 'reads nudge the widgets');
});

test('the overview widget lists every printer, or says there is none', async (t) => {
  const { gladys, fake } = await start(t);
  fake.set({ reasons: ['media-empty'] });
  await gladys.fake.widgetAction('printers_overview', 'refresh', {}, { settings: {} });
  const { data } = await gladys.fake.widgetGet('printers_overview', {
    settings: {},
    language: 'en',
  });
  const content = data.content ?? data;
  assert.deepEqual(validateWidgetContent(content), []);
  const [row] = content.components.find((c) => c.type === 'status').items;
  assert.equal(row.value.en, 'Out of paper · 20 %');
  assert.equal(row.color, 'danger');

  await gladys.fake.configUpdated({ printers: '', auto_discovery: false });
  const none = await gladys.fake.widgetGet('printers_overview', { settings: {}, language: 'en' });
  const noneContent = none.data.content ?? none.data;
  assert.deepEqual(validateWidgetContent(noneContent), []);
  assert.equal(noneContent.components[0].type, 'text');
});
