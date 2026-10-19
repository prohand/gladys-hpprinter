// -----------------------------------------------------------------------------
// The words users read: printer states, problems and supply colours, in every
// language of the Gladys interface (src/i18n.js).
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';

export const STATE_LABELS = {
  idle: { en: 'Ready', fr: 'Prête', de: 'Bereit', es: 'Lista' },
  printing: { en: 'Printing', fr: 'Impression', de: 'Druckt', es: 'Imprimiendo' },
  stopped: { en: 'Stopped', fr: 'Arrêtée', de: 'Angehalten', es: 'Detenida' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
};

export const PROBLEM_LABELS = {
  paper_out: { en: 'Out of paper', fr: 'Plus de papier', de: 'Kein Papier', es: 'Sin papel' },
  paper_jam: {
    en: 'Paper jam',
    fr: 'Bourrage papier',
    de: 'Papierstau',
    es: 'Atasco de papel',
  },
  door_open: {
    en: 'Door open',
    fr: 'Capot ouvert',
    de: 'Klappe offen',
    es: 'Tapa abierta',
  },
  supply_problem: {
    en: 'Cartridge empty or missing',
    fr: 'Cartouche vide ou absente',
    de: 'Patrone leer oder fehlt',
    es: 'Cartucho vacío o ausente',
  },
  output_full: {
    en: 'Output tray full',
    fr: 'Bac de sortie plein',
    de: 'Ausgabefach voll',
    es: 'Bandeja de salida llena',
  },
  tray_missing: {
    en: 'Paper tray missing',
    fr: 'Bac papier absent',
    de: 'Papierfach fehlt',
    es: 'Falta la bandeja',
  },
  other: {
    en: 'Printer error',
    fr: "Erreur de l'imprimante",
    de: 'Druckerfehler',
    es: 'Error de la impresora',
  },
};

export const NO_PROBLEM = {
  en: 'No alert',
  fr: 'Aucune alerte',
  de: 'Keine Warnung',
  es: 'Sin alertas',
};

export const COLOR_LABELS = {
  black: { en: 'Black', fr: 'Noir', de: 'Schwarz', es: 'Negro' },
  cyan: { en: 'Cyan', fr: 'Cyan', de: 'Cyan', es: 'Cian' },
  magenta: { en: 'Magenta', fr: 'Magenta', de: 'Magenta', es: 'Magenta' },
  yellow: { en: 'Yellow', fr: 'Jaune', de: 'Gelb', es: 'Amarillo' },
  'tri-color': { en: 'Tri-colour', fr: 'Trois couleurs', de: 'Dreifarbig', es: 'Tricolor' },
};

/** A state in one language (`language` outside LANGUAGES falls back to English). */
export function stateText(state, language) {
  return pick(language, STATE_LABELS[state] ?? STATE_LABELS.idle);
}

/** The alerts of a printer in one language: "Out of paper, Door open", or "No alert". */
export function problemsText(problems, language) {
  if (!problems || problems.length === 0) {
    return pick(language, NO_PROBLEM);
  }
  return problems.map((problem) => pick(language, PROBLEM_LABELS[problem])).join(', ');
}

/**
 * How a supply is called: its colour when the printer gives a plain one,
 * otherwise the name the printer gives (`Black Cartridge HP 305`...).
 */
export function supplyLabel(supply) {
  const color = COLOR_LABELS[supply.color];
  if (color) {
    return color;
  }
  return localize(() => supply.name);
}
