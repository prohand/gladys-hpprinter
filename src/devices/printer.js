// -----------------------------------------------------------------------------
// Device type: PRINTER — one Gladys device per printer.
//
// Features (keys are part of the external ids: never rename one):
//   - state     text   ready / printing / stopped / offline (config language)
//   - alerts    text   what needs someone at the printer, or "No alert"
//   - supply-N  level  one per cartridge / toner, in %, N = the IPP marker
//                      index (the order the printer lists its supplies in,
//                      which does not move when a cartridge is replaced)
//   - pages     counter total pages printed, when the printer tells it
//
// Read-only: nothing here is controllable from Gladys. Printing goes through
// the scene action and the Configuration screen button (src/actions.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { pick } from '../i18n.js';
import { endpointPrinterUri } from '../printer/endpoint.js';
import { problemsText, stateText, supplyLabel } from '../printer/labels.js';

export const DEVICE_TYPE = 'printer';

export const FEATURES = {
  STATE: 'state',
  ALERTS: 'alerts',
  PAGES: 'pages',
  supply: (index) => `supply-${index}`,
};

const FEATURE_NAMES = {
  state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  alerts: { en: 'Alerts', fr: 'Alertes', de: 'Warnungen', es: 'Alertas' },
  pages: {
    en: 'Pages printed',
    fr: 'Pages imprimées',
    de: 'Gedruckte Seiten',
    es: 'Páginas impresas',
  },
  ink: { en: 'Ink', fr: 'Encre', de: 'Tinte', es: 'Tinta' },
  toner: { en: 'Toner', fr: 'Toner', de: 'Toner', es: 'Tóner' },
};

export function deviceIds(gladys, record) {
  return gladys.externalIds(DEVICE_TYPE, record.id);
}

function supplyFeatureName(supply, language) {
  const kind = /toner/i.test(supply.type) ? FEATURE_NAMES.toner : FEATURE_NAMES.ink;
  return `${pick(language, kind)} ${pick(language, supplyLabel(supply)).toLowerCase()}`;
}

/**
 * The discovery payload of one printer.
 *
 * @param {object} gladys the SDK client
 * @param {object} record a printer of src/printer/fleet.js
 * @param {object} config normalized configuration
 */
export function buildDevice(gladys, record, config) {
  const ids = deviceIds(gladys, record);
  const language = config.language;
  const text = (key) => ({
    name: pick(language, FEATURE_NAMES[key]),
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: 0,
  });

  const features = [text(FEATURES.STATE), text(FEATURES.ALERTS)];
  for (const supply of record.supplies ?? []) {
    features.push({
      name: supplyFeatureName(supply, language),
      external_id: ids.feature(FEATURES.supply(supply.index)),
      category: DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR,
      type: DEVICE_FEATURE_TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 100,
    });
  }
  if (record.pages !== null && record.pages !== undefined) {
    features.push({
      name: pick(language, FEATURE_NAMES.pages),
      external_id: ids.feature(FEATURES.PAGES),
      category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 100000000,
    });
  }

  const params = [
    { name: 'IP_ADDRESS', value: record.endpoint.host },
    { name: 'IPP_URI', value: endpointPrinterUri(record.endpoint) },
  ];
  if (record.model) {
    params.push({ name: 'MODEL', value: record.model });
  }
  if (record.serial) {
    params.push({ name: 'SERIAL_NUMBER', value: record.serial });
  }

  return {
    name: record.name,
    external_id: ids.device,
    // Gladys polls once a minute at most; the configured interval (5 minutes
    // by default) is applied by skipping polls, see src/printer/fleet.js.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params,
    features,
  };
}

/**
 * The states of one printer, in the publishStates format. An unreachable
 * printer only changes its state to "offline": its last levels stay, they are
 * still the best information there is.
 */
export function buildStates(gladys, record, config) {
  const ids = deviceIds(gladys, record);
  const language = config.language;
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURES.STATE),
      text: stateText(record.reachable ? record.state : 'offline', language),
    },
  ];
  if (!record.reachable) {
    return states;
  }
  states.push({
    device_feature_external_id: ids.feature(FEATURES.ALERTS),
    text: problemsText(record.problems, language),
  });
  for (const supply of record.supplies ?? []) {
    if (supply.level !== null) {
      states.push({
        device_feature_external_id: ids.feature(FEATURES.supply(supply.index)),
        state: supply.level,
      });
    }
  }
  if (record.pages !== null && record.pages !== undefined) {
    states.push({ device_feature_external_id: ids.feature(FEATURES.PAGES), state: record.pages });
  }
  return states;
}

/** The transport badge: the printer is only ever reached on the LAN. */
export function buildTransport(gladys, record) {
  return {
    external_id: deviceIds(gladys, record).device,
    transport: record.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE,
  };
}
