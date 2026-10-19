// -----------------------------------------------------------------------------
// What the integration remembers between two starts, in /data.
//
// A printer switched off when Gladys restarts must still be listed, with the
// supplies it had: its Gladys device was built from its own answer (UUID,
// cartridges), which nobody can ask an absent printer. And a scene trigger
// fires on a CHANGE ("the black ink just went under 15 %"): without the last
// known values, every restart would be a change.
//
// /data is the only writable path of the container (read-only rootfs). The
// file is written to a temporary name then renamed, so a container stopped
// mid-write leaves the previous version, never half a JSON.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

const FILE_NAME = 'printers.json';
const FORMAT_VERSION = 1;

export function emptyState() {
  return { version: FORMAT_VERSION, printers: {}, discovered: {} };
}

/**
 * @param {string} [directory] defaults to `PRINTER_DATA_DIR`, then `/data`
 */
export function createStore(directory = process.env.PRINTER_DATA_DIR || '/data') {
  const file = join(directory, FILE_NAME);
  let writing = Promise.resolve();

  return {
    file,

    /** The saved state, or an empty one when there is none (first start) or it is unreadable. */
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        if (parsed?.version !== FORMAT_VERSION) {
          return emptyState();
        }
        return {
          ...emptyState(),
          printers: parsed.printers ?? {},
          discovered: parsed.discovered ?? {},
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Cannot read ${file}, starting from scratch: ${err.message}`);
        }
        return emptyState();
      }
    },

    /** Save the state. Writes are queued, so two saves never interleave. */
    save(state) {
      const content = JSON.stringify({ ...state, version: FORMAT_VERSION }, null, 2);
      writing = writing.then(async () => {
        try {
          await mkdir(directory, { recursive: true });
          const temporary = `${file}.tmp`;
          await writeFile(temporary, content);
          await rename(temporary, file);
        } catch (err) {
          // Not fatal: the integration works from memory, it only forgets
          // across restarts.
          logger.warn(`Cannot write ${file}: ${err.message}`);
        }
      });
      return writing;
    },

    /** Resolves once every queued save is written. */
    flush() {
      return writing;
    },
  };
}
