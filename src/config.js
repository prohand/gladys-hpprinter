// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes what Gladys sends (form values may arrive as strings), so the
// rest of the code never deals with `undefined`.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';
import { parseEndpointList } from './printer/endpoint.js';

// Defaults: they MUST stay equal to the `default` values of the manifest
// (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Printer addresses typed by hand, one per line (or comma-separated).
  printers: '',
  // Find the HP printers of the LAN by mDNS (through the Gladys core).
  auto_discovery: true,
  // Seconds between two reads of a printer. Gladys polls at most once a
  // minute: slower intervals skip the polls in between (src/printer/fleet.js).
  poll_frequency: 300,
  // A supply at or under this percentage fires the "supply low" trigger.
  low_level_threshold: 15,
  // Language of the texts published as device states (state, alerts).
  language: 'en',
  // Raise the log level to debug from the Configuration screen.
  debug_logs: false,
};

const POLL_MIN = 60;
const POLL_MAX = 3600;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Merge the user config with the defaults, and parse the printer list.
 *
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  const printers = typeof source.printers === 'string' ? source.printers : DEFAULT_CONFIG.printers;
  const { endpoints, invalid } = parseEndpointList(printers);
  return {
    ...DEFAULT_CONFIG,
    printers,
    auto_discovery: source.auto_discovery !== false && source.auto_discovery !== 'false',
    poll_frequency: boundedNumber(
      source.poll_frequency,
      DEFAULT_CONFIG.poll_frequency,
      POLL_MIN,
      POLL_MAX,
    ),
    low_level_threshold: boundedNumber(
      source.low_level_threshold,
      DEFAULT_CONFIG.low_level_threshold,
      1,
      50,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
    debug_logs: source.debug_logs === true || source.debug_logs === 'true',
    // Derived, never stored: the parsed list and what could not be parsed.
    endpoints,
    invalidPrinters: invalid,
  };
}
