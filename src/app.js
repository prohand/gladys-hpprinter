// -----------------------------------------------------------------------------
// The handlers of the integration, registered on a Gladys SDK client.
//
// Kept out of index.js so the tests can run the whole integration against the
// SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`): same
// handlers, same lifecycle, no network.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { registerActions } from './actions.js';
import { registerSceneActions } from './capabilities/scenes.js';
import { refreshWidgets, registerWidgets } from './capabilities/widgets.js';
import { normalizeConfig } from './config.js';
import { applyLogLevel } from './logging.js';
import { PrinterFleet } from './printer/fleet.js';

const logger = createLogger({ name: 'app' });

const STATUS_TEXTS = {
  noPrinter: {
    en: 'No printer found: type its IP address in the configuration.',
    fr: 'Aucune imprimante trouvée : saisissez son adresse IP dans la configuration.',
    de: 'Kein Drucker gefunden: Gib seine IP-Adresse in der Konfiguration ein.',
    es: 'No se encontró ninguna impresora: escriba su dirección IP en la configuración.',
  },
  noneAnswers: {
    en: 'No printer answers: are they switched on and on the network?',
    fr: 'Aucune imprimante ne répond : sont-elles allumées et sur le réseau ?',
    de: 'Kein Drucker antwortet: Sind sie eingeschaltet und im Netzwerk?',
    es: 'Ninguna impresora responde: ¿están encendidas y en la red?',
  },
  failed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, prüfe die Logs der Integration.',
    es: 'La inicialización falló, revise los registros de la integración.',
  },
};

/**
 * Register every handler of the integration.
 *
 * @param {object} gladys a GladysIntegration (or the SDK's fake one)
 * @param {{ fleet?: PrinterFleet }} [options] dependencies, for the tests
 * @returns {{ fleet: PrinterFleet, getConfig: () => object }}
 */
export function createApp(gladys, options = {}) {
  let config = normalizeConfig();
  const getConfig = () => config;
  const fleet = options.fleet ?? new PrinterFleet({ gladys });
  fleet.setConfig(config);

  // Whatever a read changed: devices first (an address or a cartridge slot
  // moved), then the widgets showing the computed rows.
  fleet.onChange(({ devicesChanged }) => {
    if (devicesChanged && gladys.connected) {
      gladys
        .publishDiscoveredDevices(fleet.buildDevices())
        .catch((err) => logger.warn(`Publishing the printers failed: ${err.message}`));
    }
    refreshWidgets(gladys);
  });

  async function setUp(rawConfig) {
    config = normalizeConfig(rawConfig);
    applyLogLevel(config);
    fleet.setConfig(config);
    await fleet.load();
    if (config.invalidPrinters.length > 0) {
      logger.warn(`Addresses not understood: ${config.invalidPrinters.join(', ')}`);
    }
    await fleet.discover();
    const report = await fleet.refreshAll();
    await gladys.publishDiscoveredDevices(fleet.buildDevices());
    await reportStatus(report);
  }

  // The connection status of the Configuration screen: green as soon as one
  // printer answers.
  async function reportStatus(report) {
    if (report.reachable.length > 0) {
      await gladys.setConnectionStatus(true);
    } else if (report.unreachable.length > 0) {
      await gladys.setConnectionStatus(false, STATUS_TEXTS.noneAnswers);
    } else {
      await gladys.setConnectionStatus(false, STATUS_TEXTS.noPrinter);
    }
  }

  // --- Discovery: the user opened the Discovery tab, or clicked Scan ---------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> searching and reading the printers');
    await fleet.discover();
    await fleet.refreshAll();
    await gladys.publishDiscoveredDevices(fleet.buildDevices());
  });

  // --- Polling: Gladys asks every minute, the fleet reads at its own pace ----
  // Resolves at once: the read runs in the background (a printer waking up can
  // take longer than Gladys waits for the poll answer).
  gladys.onPoll(async (device) => {
    if (!fleet.poll(device.external_id)) {
      logger.debug(`onPoll skipped (not due) for ${device.external_id}`);
    }
  });

  // No controllable feature: a command can only be a mistake.
  gladys.onSetValue(async (device) => {
    throw new Error(`${device.external_id} has no controllable feature`);
  });

  registerActions(gladys, { fleet, getConfig });
  registerSceneActions(gladys, { fleet, getConfig });
  registerWidgets(gladys, { fleet, getConfig });

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    await setUp(newConfig);
  });

  // The SDK logs the WebSocket lifecycle itself; this only (re)initializes.
  gladys.on('connected', async () => {
    try {
      await setUp(await gladys.getConfig());
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, STATUS_TEXTS.failed).catch(() => {});
    }
  });

  return { fleet, getConfig };
}
