// -----------------------------------------------------------------------------
// Configuration: defaults, form strings, bounds.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { applyLogLevel } from '../src/logging.js';

test('an empty configuration is the defaults', () => {
  const config = normalizeConfig();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    assert.deepEqual(config[key], value, key);
  }
  assert.deepEqual(config.endpoints, []);
  assert.deepEqual(config.invalidPrinters, []);
  assert.deepEqual(normalizeConfig(null).endpoints, []);
});

test('form strings are typed, numbers bounded, unknown languages refused', () => {
  const config = normalizeConfig({
    printers: '192.168.1.20, bad://x',
    auto_discovery: 'false',
    poll_frequency: '10',
    low_level_threshold: '99',
    language: 'it',
    debug_logs: 'true',
  });
  assert.deepEqual(
    config.endpoints.map((e) => e.host),
    ['192.168.1.20'],
  );
  assert.deepEqual(config.invalidPrinters, ['bad://x']);
  assert.equal(config.auto_discovery, false);
  assert.equal(config.poll_frequency, 60);
  assert.equal(config.low_level_threshold, 50);
  assert.equal(config.language, 'en');
  assert.equal(config.debug_logs, true);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 300);
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
});

test('the debug switch raises the log level, and puts the previous one back', () => {
  const before = process.env.LOG_LEVEL;
  try {
    assert.equal(applyLogLevel({ debug_logs: true }), 'debug');
    assert.equal(process.env.LOG_LEVEL, 'debug');
    applyLogLevel({ debug_logs: false });
    assert.equal(process.env.LOG_LEVEL, before);
  } finally {
    if (before === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = before;
    }
  }
});
