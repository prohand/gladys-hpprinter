// -----------------------------------------------------------------------------
// The buttons of the Configuration screen (manifest `actions`).
//
//   - test_connection: read every printer now and say what answered;
//   - discover_printers: search the LAN for HP printers (mDNS);
//   - print_test_page: print one page on the chosen printer.
//
// Each handler resolves the multi-language message shown under the button.
// -----------------------------------------------------------------------------

import { localize, pick } from './i18n.js';
import { endpointLabel } from './printer/endpoint.js';
import { problemsText, stateText, supplyLabel } from './printer/labels.js';
import { lowestLevel } from './printer/status.js';

export const ACTION_KEYS = {
  TEST_CONNECTION: 'test_connection',
  DISCOVER_PRINTERS: 'discover_printers',
  PRINT_TEST_PAGE: 'print_test_page',
};

const WORDS = {
  answer: {
    en: (n) => `${n} printer${n === 1 ? '' : 's'} answered`,
    fr: (n) => `${n} imprimante${n > 1 ? 's ont' : ' a'} répondu`,
    de: (n) => `${n} Drucker ${n === 1 ? 'hat' : 'haben'} geantwortet`,
    es: (n) => `${n} impresora${n === 1 ? ' respondió' : 's respondieron'}`,
  },
  silent: {
    en: 'Not answering',
    fr: 'Pas de réponse',
    de: 'Keine Antwort',
    es: 'Sin respuesta',
  },
  invalid: {
    en: 'Addresses not understood',
    fr: 'Adresses non comprises',
    de: 'Unverständliche Adressen',
    es: 'Direcciones no válidas',
  },
  nothing: {
    en: 'No printer to read: type its address, or turn on automatic discovery.',
    fr: 'Aucune imprimante à lire : saisissez son adresse, ou activez la découverte automatique.',
    de: 'Kein Drucker zum Lesen: Gib seine Adresse ein oder aktiviere die automatische Suche.',
    es: 'Ninguna impresora que leer: escriba su dirección o active la detección automática.',
  },
  lowest: {
    en: 'lowest level',
    fr: 'niveau le plus bas',
    de: 'niedrigster Stand',
    es: 'nivel más bajo',
  },
  found: {
    en: (n) => `${n} HP printer${n > 1 ? 's' : ''} found on the network`,
    fr: (n) => `${n} imprimante${n > 1 ? 's' : ''} HP trouvée${n > 1 ? 's' : ''} sur le réseau`,
    de: (n) => `${n} HP-Drucker im Netzwerk gefunden`,
    es: (n) => `${n} impresora${n > 1 ? 's' : ''} HP encontrada${n > 1 ? 's' : ''} en la red`,
  },
  addThem: {
    en: 'Add them from the Discovery tab.',
    fr: "Ajoutez-les depuis l'onglet Découverte.",
    de: 'Füge sie im Tab „Erkennung“ hinzu.',
    es: 'Añádalas desde la pestaña Descubrimiento.',
  },
  noneFound: {
    en: 'No HP printer answered the network search. Type its IP address in the configuration instead.',
    fr: "Aucune imprimante HP n'a répondu à la recherche réseau. Saisissez plutôt son adresse IP dans la configuration.",
    de: 'Kein HP-Drucker hat auf die Netzwerksuche geantwortet. Gib stattdessen seine IP-Adresse in der Konfiguration ein.',
    es: 'Ninguna impresora HP respondió a la búsqueda en la red. Escriba su dirección IP en la configuración.',
  },
  discoveryOff: {
    en: 'Automatic discovery is turned off in the configuration.',
    fr: 'La découverte automatique est désactivée dans la configuration.',
    de: 'Die automatische Suche ist in der Konfiguration ausgeschaltet.',
    es: 'La detección automática está desactivada en la configuración.',
  },
  printed: {
    en: 'Test page sent to the printer.',
    fr: "Page de test envoyée à l'imprimante.",
    de: 'Testseite an den Drucker gesendet.',
    es: 'Página de prueba enviada a la impresora.',
  },
};

/** Why a print did not happen, per `reason` of PrinterFleet.print. */
export const PRINT_FAILURES = {
  unknown_device: {
    en: 'This printer is not known (any more): search for printers again.',
    fr: "Cette imprimante n'est pas (plus) connue : relancez la recherche.",
    de: 'Dieser Drucker ist (nicht mehr) bekannt: Suche erneut.',
    es: 'Esta impresora no es (o ya no es) conocida: vuelva a buscar.',
  },
  unreachable: {
    en: 'The printer did not answer: is it switched on?',
    fr: "L'imprimante n'a pas répondu : est-elle allumée ?",
    de: 'Der Drucker hat nicht geantwortet: Ist er eingeschaltet?',
    es: 'La impresora no respondió: ¿está encendida?',
  },
  pdf_unsupported: {
    en: 'This printer does not accept PDF documents over the network.',
    fr: "Cette imprimante n'accepte pas les documents PDF par le réseau.",
    de: 'Dieser Drucker nimmt keine PDF-Dokumente über das Netzwerk an.',
    es: 'Esta impresora no acepta documentos PDF por la red.',
  },
  refused: {
    en: 'The printer refused the document (see its screen).',
    fr: "L'imprimante a refusé le document (voir son écran).",
    de: 'Der Drucker hat das Dokument abgelehnt (siehe Display).',
    es: 'La impresora rechazó el documento (vea su pantalla).',
  },
};

/** One line per printer that answered: "HP OfficeJet (192.168.1.20): Ready, No alert, lowest level 40 %". */
function printerLine(record, language) {
  const lowest = lowestLevel(record);
  const parts = [stateText(record.state, language), problemsText(record.problems, language)];
  if (lowest !== null) {
    parts.push(`${pick(language, WORDS.lowest)} ${lowest} %`);
  }
  return `${record.name} (${endpointLabel(record.endpoint)}): ${parts.join(', ')}`;
}

/**
 * The message of "Test the printers", from PrinterFleet.refreshAll().
 *
 * @param {{ reachable: object[], unreachable: Array<{ endpoint: object, error?: Error }> }} report
 * @param {string[]} invalid addresses the configuration could not parse
 */
export function connectionReport(report, invalid = []) {
  return localize((language) => {
    if (report.reachable.length === 0 && report.unreachable.length === 0 && invalid.length === 0) {
      return pick(language, WORDS.nothing);
    }
    const lines = [`${pick(language, WORDS.answer)(report.reachable.length)}.`];
    for (const record of report.reachable) {
      lines.push(`• ${printerLine(record, language)}`);
    }
    if (report.unreachable.length > 0) {
      const silent = report.unreachable.map(
        ({ endpoint, error }) =>
          `${endpointLabel(endpoint)}${error?.code ? ` (${error.code})` : ''}`,
      );
      lines.push(`${pick(language, WORDS.silent)}: ${silent.join(', ')}.`);
    }
    if (invalid.length > 0) {
      lines.push(`${pick(language, WORDS.invalid)}: ${invalid.join(', ')}.`);
    }
    return lines.join('\n');
  });
}

/** The message of "Search for printers". */
export function discoveryReport(found, { enabled }) {
  return localize((language) => {
    if (!enabled) {
      return pick(language, WORDS.discoveryOff);
    }
    if (found.length === 0) {
      return pick(language, WORDS.noneFound);
    }
    const names = found.map((printer) => `${printer.name} (${endpointLabel(printer.endpoint)})`);
    return `${pick(language, WORDS.found)(found.length)}: ${names.join(', ')}. ${pick(language, WORDS.addThem)}`;
  });
}

/** The content of the test page: who printed it, when, and the supply levels. */
export function testPageContent(record, language, now = new Date()) {
  const title = {
    en: 'Gladys — test page',
    fr: 'Gladys — page de test',
    de: 'Gladys — Testseite',
    es: 'Gladys — página de prueba',
  };
  const lines = [
    `${record.name}`,
    `${record.model ?? ''}`,
    `${endpointLabel(record.endpoint)} — ${now.toISOString()}`,
    '',
    ...(record.supplies ?? []).map(
      (supply) =>
        `${pick(language, supplyLabel(supply))}: ${supply.level === null ? '?' : `${supply.level} %`}`,
    ),
    '',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789',
    'àâäçéèêëîïôöùûüÿœ ÀÉÈÇ ß ñ ¿¡ € — « »',
  ];
  return { title: pick(language, title), text: lines.join('\n') };
}

/**
 * Register the handlers of the manifest actions.
 *
 * @param {object} gladys the SDK client
 * @param {{ fleet: object, getConfig: () => object }} context
 */
export function registerActions(gladys, { fleet, getConfig }) {
  gladys.onAction(ACTION_KEYS.TEST_CONNECTION, async () => {
    const report = await fleet.refreshAll();
    return connectionReport(report, getConfig().invalidPrinters);
  });

  gladys.onAction(ACTION_KEYS.DISCOVER_PRINTERS, async () => {
    const config = getConfig();
    if (!config.auto_discovery) {
      return discoveryReport([], { enabled: false });
    }
    const found = await fleet.discover();
    await fleet.refreshAll();
    return discoveryReport(found, { enabled: true });
  });

  gladys.onAction(ACTION_KEYS.PRINT_TEST_PAGE, async (fields) => {
    const record = fleet.findByExternalId(fields.device);
    if (!record) {
      return PRINT_FAILURES.unknown_device;
    }
    const content = testPageContent(record, getConfig().language);
    const result = await fleet.print(fields.device, content);
    return result.printed ? WORDS.printed : PRINT_FAILURES[result.reason];
  });
}
