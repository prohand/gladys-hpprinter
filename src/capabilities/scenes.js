// -----------------------------------------------------------------------------
// Scene triggers and actions (Gladys 5.1+).
//
// Triggers — "this happened" — are fired by src/printer/fleet.js when two
// reads of a printer differ:
//   - supply_low           a cartridge / toner went under the threshold
//   - printer_problem      a new problem appeared (no paper, jam, door open...)
//   - printer_unreachable  the printer stopped answering
//
// Actions — operations a scene runs, with a result:
//   - refresh_printer  read a printer now, and hand its values to the scene
//   - print_text       print a text (a shopping list, a reminder...)
//
// Keys are stored in users' scenes: never rename one.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { TRIGGERS } from '../printer/fleet.js';
import { problemsText } from '../printer/labels.js';
import { lowestLevel } from '../printer/status.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = Object.values(TRIGGERS);

export const SCENE_ACTION_KEYS = {
  REFRESH_PRINTER: 'refresh_printer',
  PRINT_TEXT: 'print_text',
};

// Scene outputs are scalars: an absent number is -1, documented, so a scene
// condition "level < 10" is never true for a printer that gave no level.
const UNKNOWN_NUMBER = -1;

export const SCENE_ACTIONS = {
  async [SCENE_ACTION_KEYS.REFRESH_PRINTER](fleet, { fields, config }) {
    logger.info(`Scene action refresh_printer <- ${fields.device}`);
    const record = await fleet.refreshDevice(fields.device);
    if (!record) {
      // Throwing fails this action only; the scene logs it and goes on.
      throw new Error(`Unknown printer ${fields.device}`);
    }
    return {
      reachable: record.reachable,
      state: record.reachable ? record.state : 'offline',
      alerts: problemsText(record.reachable ? record.problems : [], config.language),
      lowest_level: lowestLevel(record) ?? UNKNOWN_NUMBER,
      pages: record.pages ?? UNKNOWN_NUMBER,
    };
  },

  async [SCENE_ACTION_KEYS.PRINT_TEXT](fleet, { fields }) {
    logger.info(`Scene action print_text <- ${fields.device}`);
    const text = String(fields.text ?? '');
    if (!text.trim()) {
      return { printed: false, job_id: UNKNOWN_NUMBER };
    }
    // A failed print is an output, not an error: the scene author decides
    // what to do with it (send a message instead...).
    const result = await fleet.print(fields.device, {
      title: String(fields.title ?? '').trim(),
      text,
    });
    return { printed: result.printed, job_id: result.jobId ?? UNKNOWN_NUMBER };
  },
};

/**
 * Register the scene action handlers.
 *
 * @param {object} gladys the SDK client
 * @param {{ fleet: object, getConfig: () => object }} context
 */
export function registerSceneActions(gladys, { fleet, getConfig }) {
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(fleet, { fields, config: getConfig() }));
  }
}
