// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
//   - printer            one printer: a live gauge per cartridge, its state
//                        and alerts, a Refresh and a Test page button;
//   - printers_overview  every printer on one line: state and lowest level.
//
// The content is declarative (the core renders it with its own theme and
// translations): every text is a `{ en, fr, de, es }` object. The gauges are
// bound to the device features, so they follow the published levels live;
// the computed rows (state, alerts) are refreshed by a nudge after each read
// that changed something (see index.js).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, createLogger } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { endpointLabel } from '../printer/endpoint.js';
import { problemsText, stateText, supplyLabel } from '../printer/labels.js';
import { lowestLevel } from '../printer/status.js';
import { FEATURES, deviceIds } from '../devices/printer.js';
import { PRINT_FAILURES, testPageContent } from '../actions.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = { PRINTER: 'printer', OVERVIEW: 'printers_overview' };

const WIDGET_ACTIONS = { REFRESH: 'refresh', TEST_PAGE: 'test_page' };

const MAX_GAUGES = 5;
const MAX_ROWS = 10;
const TTL_SECONDS = 300;

const TEXTS = {
  state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  alerts: { en: 'Alerts', fr: 'Alertes', de: 'Warnungen', es: 'Alertas' },
  address: { en: 'Address', fr: 'Adresse', de: 'Adresse', es: 'Dirección' },
  pages: { en: 'Pages', fr: 'Pages', de: 'Seiten', es: 'Páginas' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  testPage: { en: 'Test page', fr: 'Page de test', de: 'Testseite', es: 'Página de prueba' },
  refreshed: {
    en: 'Printer read again.',
    fr: 'Imprimante relue.',
    de: 'Drucker neu gelesen.',
    es: 'Impresora leída de nuevo.',
  },
  printed: {
    en: 'Test page sent.',
    fr: 'Page de test envoyée.',
    de: 'Testseite gesendet.',
    es: 'Página de prueba enviada.',
  },
  pickPrinter: {
    en: 'Choose a printer in the settings of this widget.',
    fr: 'Choisissez une imprimante dans les réglages de ce widget.',
    de: 'Wähle in den Einstellungen dieses Widgets einen Drucker.',
    es: 'Elija una impresora en los ajustes de este widget.',
  },
  noPrinter: {
    en: 'No printer yet: add one from the Discovery tab of the integration.',
    fr: "Aucune imprimante pour l'instant : ajoutez-en une depuis l'onglet Découverte.",
    de: 'Noch kein Drucker: Füge einen im Tab „Erkennung“ der Integration hinzu.',
    es: 'Aún no hay impresoras: añada una desde la pestaña Descubrimiento.',
  },
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The colour of a level: red when (nearly) empty, orange under the threshold. */
function levelColor(level, threshold) {
  if (level === null || level === undefined) {
    return WIDGET_COLORS.NEUTRAL;
  }
  if (level <= 5) {
    return WIDGET_COLORS.DANGER;
  }
  return level <= threshold ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

/** The colour of a printer as a whole. */
function printerColor(record, threshold) {
  if (!record.reachable) {
    return WIDGET_COLORS.NEUTRAL;
  }
  if (record.problems.length > 0) {
    return WIDGET_COLORS.DANGER;
  }
  return levelColor(lowestLevel(record), threshold);
}

function printerContent(gladys, record, config) {
  const ids = deviceIds(gladys, record);
  const threshold = config.low_level_threshold;
  const components = [];

  for (const supply of (record.supplies ?? []).slice(0, MAX_GAUGES)) {
    components.push({
      type: 'gauge',
      label: localize((language) => truncate(pick(language, supplyLabel(supply)), 24)),
      device_feature: ids.feature(FEATURES.supply(supply.index)),
      color: levelColor(supply.level, threshold),
    });
  }
  if (record.pages !== null && record.pages !== undefined) {
    components.push({
      type: 'value',
      label: TEXTS.pages,
      icon: 'file-text',
      device_feature: ids.feature(FEATURES.PAGES),
    });
  }

  const state = record.reachable ? record.state : 'offline';
  components.push({
    type: 'status',
    items: [
      {
        label: TEXTS.state,
        icon: 'printer',
        value: localize((language) => stateText(state, language)),
        color: printerColor(record, threshold),
      },
      {
        label: TEXTS.alerts,
        icon: 'alert-triangle',
        value: localize((language) =>
          truncate(problemsText(record.reachable ? record.problems : [], language), 40),
        ),
        color:
          record.reachable && record.problems.length > 0
            ? WIDGET_COLORS.DANGER
            : WIDGET_COLORS.NEUTRAL,
      },
      {
        label: TEXTS.address,
        icon: 'wifi',
        value: truncate(endpointLabel(record.endpoint), 40),
        color: record.reachable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
      },
    ],
  });

  // `params` are declared here and sent back as they are: the handler never
  // receives user input (a dashboard can hang on a public wall).
  components.push(
    {
      type: 'button',
      label: TEXTS.refresh,
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.REFRESH, params: { device: ids.device } },
    },
    {
      type: 'button',
      label: TEXTS.testPage,
      icon: 'printer',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.TEST_PAGE, params: { device: ids.device }, confirm: true },
    },
  );
  return components;
}

function overviewContent(fleet, config) {
  const records = fleet.records();
  if (records.length === 0) {
    return [{ type: 'text', text: TEXTS.noPrinter }];
  }
  const threshold = config.low_level_threshold;
  return [
    {
      type: 'status',
      items: records.slice(0, MAX_ROWS).map((record) => {
        const lowest = lowestLevel(record);
        return {
          label: truncate(record.name, 40),
          icon: 'printer',
          value: localize((language) => {
            if (!record.reachable) {
              return stateText('offline', language);
            }
            const head =
              record.problems.length > 0
                ? problemsText(record.problems, language)
                : stateText(record.state, language);
            return truncate(lowest === null ? head : `${head} · ${lowest} %`, 40);
          }),
          color: printerColor(record, threshold),
        };
      }),
    },
    {
      type: 'button',
      label: TEXTS.refresh,
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.REFRESH },
    },
  ];
}

export const WIDGETS = {
  [WIDGET_KEYS.PRINTER]: {
    async get(gladys, { fleet, settings, config }) {
      const record = settings?.printer ? fleet.findByExternalId(settings.printer) : null;
      if (!record) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: [{ type: 'text', text: TEXTS.pickPrinter }],
        };
      }
      return { ttl_seconds: TTL_SECONDS, components: printerContent(gladys, record, config) };
    },

    async action(gladys, { fleet, actionKey, params, config }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.PRINTER}.${actionKey}`);
      if (actionKey === WIDGET_ACTIONS.REFRESH) {
        await fleet.refreshDevice(params.device);
        return TEXTS.refreshed;
      }
      if (actionKey === WIDGET_ACTIONS.TEST_PAGE) {
        const record = fleet.findByExternalId(params.device);
        if (!record) {
          return PRINT_FAILURES.unknown_device;
        }
        const result = await fleet.print(params.device, testPageContent(record, config.language));
        return result.printed ? TEXTS.printed : PRINT_FAILURES[result.reason];
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },

  [WIDGET_KEYS.OVERVIEW]: {
    async get(gladys, { fleet, config }) {
      return { ttl_seconds: TTL_SECONDS, components: overviewContent(fleet, config) };
    },

    async action(gladys, { fleet, actionKey }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.OVERVIEW}.${actionKey}`);
      if (actionKey === WIDGET_ACTIONS.REFRESH) {
        await fleet.refreshAll();
        return TEXTS.refreshed;
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};

/**
 * Register the widget handlers.
 *
 * @param {object} gladys the SDK client
 * @param {{ fleet: object, getConfig: () => object }} context
 */
export function registerWidgets(gladys, { fleet, getConfig }) {
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) =>
      widget.get(gladys, { ...request, fleet, config: getConfig() }),
    );
    gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
      widget.action(gladys, { fleet, actionKey, params, settings, config: getConfig() }),
    );
  }
}

/**
 * Ask the core to re-pull every widget now (rate-limited core-side, dropped
 * while disconnected): after a read that changed what they show.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.values(WIDGET_KEYS)) {
    gladys.requestWidgetRefresh(key);
  }
}
