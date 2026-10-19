// -----------------------------------------------------------------------------
// From IPP attributes to a snapshot: identity, state, problems, supplies.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROBLEMS,
  buildSnapshot,
  classifyReasons,
  colorName,
  lowestLevel,
  parseDeviceId,
  printerId,
  splitReason,
} from '../src/printer/status.js';
import { PROBLEM_LABELS, problemsText, stateText, supplyLabel } from '../src/printer/labels.js';
import { LANGUAGES } from '../src/i18n.js';

const NOW = new Date('2026-10-19T10:00:00Z');

const HP_ATTRIBUTES = {
  'printer-uuid': 'urn:uuid:12345678-90AB-CDEF-1234-567890ABCDEF',
  'printer-info': 'HP LaserJet Pro M404dn [0011AA]',
  'printer-make-and-model': 'HP LaserJet Pro M404-M405',
  'printer-device-id': 'MFG:HP;MDL:HP LaserJet Pro M404-M405;SN:PHB123;',
  'printer-state': 4,
  'printer-state-reasons': ['toner-low-report', 'media-empty-error'],
  'marker-names': 'Black Cartridge HP 59A',
  'marker-colors': '#000000',
  'marker-types': 'toner-cartridge',
  'marker-levels': 12,
  'document-format-supported': ['application/pdf', 'image/urf'],
};

test('a snapshot reads identity, state, problems and supplies', () => {
  const snapshot = buildSnapshot(HP_ATTRIBUTES, { pages: 1234, now: NOW });
  assert.equal(snapshot.reachable, true);
  assert.equal(snapshot.readAt, '2026-10-19T10:00:00.000Z');
  assert.equal(snapshot.uuid, '12345678-90ab-cdef-1234-567890abcdef');
  assert.equal(snapshot.serial, 'PHB123');
  assert.equal(snapshot.name, 'HP LaserJet Pro M404dn [0011AA]');
  assert.equal(snapshot.model, 'HP LaserJet Pro M404-M405');
  assert.equal(snapshot.state, 'printing');
  assert.deepEqual(snapshot.reasons, ['toner-low-report', 'media-empty-error']);
  assert.deepEqual(snapshot.problems, ['paper_out']);
  assert.deepEqual(snapshot.supplies, [
    {
      index: 0,
      name: 'Black Cartridge HP 59A',
      color: 'black',
      type: 'toner-cartridge',
      level: 12,
    },
  ]);
  assert.equal(snapshot.pages, 1234);
  assert.deepEqual(snapshot.formats, ['application/pdf', 'image/urf']);
});

test('negative levels are unknown, not empty; the IPP counter wins over LEDM', () => {
  const snapshot = buildSnapshot(
    {
      ...HP_ATTRIBUTES,
      'marker-names': ['a', 'b', 'c', 'd'],
      'marker-levels': [-1, -2, -3, 150],
      'printer-impressions-completed': 99,
    },
    { pages: 5, now: NOW },
  );
  assert.deepEqual(
    snapshot.supplies.map((s) => s.level),
    [null, null, null, 100],
  );
  assert.equal(snapshot.pages, 99);
});

test('a printer telling almost nothing still gives a usable snapshot', () => {
  const snapshot = buildSnapshot({}, { now: NOW });
  assert.equal(snapshot.name, 'HP printer');
  assert.equal(snapshot.state, 'idle');
  assert.deepEqual(snapshot.problems, []);
  assert.deepEqual(snapshot.supplies, []);
  assert.equal(snapshot.pages, null);
  assert.equal(snapshot.uuid, null);
});

test('reasons: suffix gives the severity, reports and pauses never count', () => {
  assert.deepEqual(splitReason('media-jam-error'), { keyword: 'media-jam', severity: 'error' });
  assert.deepEqual(splitReason('door-open'), { keyword: 'door-open', severity: 'error' });
  assert.deepEqual(classifyReasons(['media-jam-warning', 'cover-open']), [
    'paper_jam',
    'door_open',
  ]);
  assert.deepEqual(
    classifyReasons(['toner-low-report', 'none', 'paused', 'marker-supply-low-warning']),
    [],
  );
  assert.deepEqual(classifyReasons(['fuser-over-temp-error']), ['other']);
  assert.deepEqual(classifyReasons(['fuser-over-temp-warning']), []);
  assert.deepEqual(classifyReasons(['marker-supply-empty-error', 'toner-empty']), [
    'supply_problem',
  ]);
});

test('the stable id: UUID, else serial, else the address', () => {
  const endpoint = { host: '192.168.1.20', port: 631, path: '/ipp/print' };
  assert.equal(printerId({ uuid: 'abc-123', serial: 'X' }, endpoint), 'abc-123');
  assert.equal(printerId({ uuid: null, serial: 'CN 01/23' }, endpoint), 'sn-cn0123');
  assert.equal(printerId({ uuid: null, serial: null }, endpoint), 'host-192-168-1-20');
});

test('colours and IEEE 1284 ids', () => {
  assert.equal(colorName('#00ffff'), 'cyan');
  assert.equal(colorName('#00FFFF#FF00FF#FFFF00'), 'tri-color');
  assert.equal(colorName('none'), 'other');
  assert.deepEqual(parseDeviceId('MFG:HP;MDL:DeskJet 2700;SN:TH12;'), {
    MFG: 'HP',
    MDL: 'DeskJet 2700',
    SN: 'TH12',
  });
});

test('lowest level ignores unknown supplies', () => {
  assert.equal(lowestLevel({ supplies: [{ level: null }, { level: 40 }, { level: 7 }] }), 7);
  assert.equal(lowestLevel({ supplies: [{ level: null }] }), null);
  assert.equal(lowestLevel(null), null);
});

test('every problem and state is written in every language', () => {
  for (const problem of Object.keys(PROBLEMS)) {
    for (const language of LANGUAGES) {
      assert.ok(PROBLEM_LABELS[problem][language], `${problem}.${language}`);
    }
  }
  assert.equal(stateText('printing', 'de'), 'Druckt');
  assert.equal(stateText('offline', 'es'), 'Sin conexión');
  assert.equal(problemsText([], 'fr'), 'Aucune alerte');
  assert.equal(problemsText(['paper_out', 'door_open'], 'fr'), 'Plus de papier, Capot ouvert');
  assert.deepEqual(supplyLabel({ color: 'other', name: 'Tri-color HP 305' }), {
    en: 'Tri-color HP 305',
    fr: 'Tri-color HP 305',
    de: 'Tri-color HP 305',
    es: 'Tri-color HP 305',
  });
});
