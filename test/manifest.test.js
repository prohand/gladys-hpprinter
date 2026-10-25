// -----------------------------------------------------------------------------
// Consistency between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest alone; only these tests know which
// handlers the code registers and which events it fires.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { WIDGET_KEYS } from '../src/capabilities/widgets.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { COLOR_LABELS } from '../src/printer/labels.js';
import { PROBLEMS } from '../src/printer/status.js';

const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../gladys-assistant-integration.json'));
const pkg = JSON.parse(await read('../package.json'));

/** Every handler createApp registers, by kind: { onAction: ['test_connection', ...], ... }. */
function registeredHandlers() {
  const handlers = {};
  const recorder = new Proxy(
    { connected: false },
    {
      get(target, property) {
        if (property in target) {
          return target[property];
        }
        return (key) => {
          if (typeof property === 'string' && property.startsWith('on')) {
            (handlers[property] ??= []).push(key);
          }
        };
      },
    },
  );
  createApp(recorder, { fleet: { setConfig() {}, onChange() {} } });
  return handlers;
}

const allFields = () => [
  ...manifest.config_schema,
  ...(manifest.actions ?? []).flatMap((a) => a.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((w) => w.settings ?? []),
  ...(manifest.scene_triggers ?? []).flatMap((t) => t.fields ?? []),
  ...(manifest.scene_actions ?? []).flatMap((a) => a.fields ?? []),
];

test('every text of the manifest is written in English, French, German and Spanish', () => {
  const missing = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (['label', 'description', 'placeholder'].includes(key) && typeof value === 'object') {
        for (const language of LANGUAGES) {
          if (typeof value[language] !== 'string' || !value[language]) {
            missing.push(`${path}.${key}.${language}`);
          }
        }
      } else {
        walk(value, `${path}.${key}`);
      }
    }
  };
  walk(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('name and catalog description fit what the store allows', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language}: 10-100 characters, got ${text.length}`,
    );
  }
});

test('version, image tag and package.json agree', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-hpprinter:${pkg.version}`);
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/prohand\/gladys-hpprinter\//,
  );
});

/** True when the `gladys_version` minimum is at least `major.minor.0`. */
function floorAtLeast(major, minor) {
  const [floorMajor, floorMinor] = manifest.gladys_version
    .replace(/^>=/, '')
    .split('.')
    .map(Number);
  return floorMajor > major || (floorMajor === major && floorMinor >= minor);
}

test('the Gladys floor covers the widgets and scene declarations', () => {
  assert.ok(floorAtLeast(5, 1), `got ${manifest.gladys_version}`);
});

test('the Gladys floor covers keywords, countries and music (5.3.0)', () => {
  if (manifest.keywords || manifest.countries || manifest.music) {
    assert.ok(floorAtLeast(5, 3), `got ${manifest.gladys_version}`);
  }
});

test('keywords: 1 to 10 unique search terms of 2 to 30 characters', () => {
  assert.ok(Array.isArray(manifest.keywords));
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
});

test('no countries: HP printers are sold worldwide', () => {
  assert.equal(manifest.countries, undefined);
});

test('transport tag: local only (the printer is read on the LAN, no HP cloud)', () => {
  assert.deepEqual(manifest.transports, ['local']);
});

test('categories stay inside the store vocabulary', () => {
  const vocabulary = [
    'climate',
    'lighting',
    'energy',
    'security',
    'multimedia',
    'appliances',
    'environment',
    'protocols',
    'network',
    'notifications',
    'assistants',
    'services',
    'transport',
    'vehicles',
    'servers',
    'leisure',
  ];
  assert.equal(new Set(manifest.categories).size, manifest.categories.length);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(vocabulary.includes(category), category);
  }
});

test('mDNS discovery browses the IPP service', () => {
  assert.deepEqual(manifest.network_discovery, [{ type: 'mdns', service: '_ipp._tcp' }]);
});

test('config defaults and DEFAULT_CONFIG are the same keys and values', () => {
  const stored = manifest.config_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(stored.map((field) => field.key).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    assert.deepEqual(field.default, DEFAULT_CONFIG[field.key], field.key);
  }
  const language = manifest.config_schema.find((field) => field.key === 'language');
  assert.deepEqual(
    language.options.map((option) => option.value),
    LANGUAGES,
  );
});

test('every field uses a type, key and placeholder the store accepts', () => {
  const types = ['string', 'number', 'boolean', 'select', 'multi_select', 'section'];
  for (const field of allFields()) {
    assert.ok(types.includes(field.type), `${field.key}: ${field.type}`);
    assert.match(field.key, /^[a-z0-9_]+$/);
    if (field.placeholder !== undefined) {
      assert.ok(['string', 'number'].includes(field.type), `${field.key}: placeholder`);
    }
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number', `${field.key}: min/max`);
    }
    if (field.source !== undefined) {
      assert.equal(field.source, 'devices');
      assert.equal(field.options, undefined, `${field.key}: source and options`);
      assert.equal(field.default, undefined, `${field.key}: source and default`);
    }
    if (field.type === 'section') {
      for (const link of field.links ?? []) {
        assert.match(link.url, /^https:\/\//);
      }
    }
  }
});

test('every manifest action, scene action and widget has a handler', () => {
  const handlers = registeredHandlers();
  assert.deepEqual(
    [...handlers.onAction].sort(),
    manifest.actions.map((action) => action.key).sort(),
  );
  assert.deepEqual(
    [...handlers.onSceneAction].sort(),
    manifest.scene_actions.map((action) => action.key).sort(),
  );
  assert.deepEqual(Object.keys(SCENE_ACTIONS).sort(), [...handlers.onSceneAction].sort());
  const widgets = manifest.widgets.map((widget) => widget.key).sort();
  assert.deepEqual([...handlers.onWidgetGet].sort(), widgets);
  assert.deepEqual([...handlers.onWidgetAction].sort(), widgets);
  assert.deepEqual(Object.values(WIDGET_KEYS).sort(), widgets);
  for (const widget of manifest.widgets) {
    for (const [language, text] of Object.entries(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `${widget.key}.label.${language}`);
    }
  }
});

test('the triggers the code fires are the ones declared, with their filters and variables', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    [...SCENE_TRIGGERS].sort(),
  );
  // The keys each event carries (src/printer/fleet.js).
  const eventKeys = {
    supply_low: ['device', 'color', 'supply', 'level'],
    printer_problem: ['device', 'problem', 'label'],
    printer_unreachable: ['device', 'name'],
  };
  for (const trigger of manifest.scene_triggers) {
    for (const key of [...(trigger.fields ?? []), ...(trigger.variables ?? [])].map((f) => f.key)) {
      assert.ok(eventKeys[trigger.key].includes(key), `${trigger.key}.${key} is never sent`);
    }
  }
  const options = (trigger, field) =>
    manifest.scene_triggers
      .find((t) => t.key === trigger)
      .fields.find((f) => f.key === field)
      .options.map((option) => option.value);
  assert.deepEqual(options('printer_problem', 'problem'), Object.keys(PROBLEMS));
  assert.deepEqual(options('supply_low', 'color'), [...Object.keys(COLOR_LABELS), 'other']);
});

test('the user documentation exists in every language', async () => {
  for (const language of LANGUAGES) {
    await access(new URL(`../docs/${language}.md`, import.meta.url));
  }
});
