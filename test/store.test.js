// -----------------------------------------------------------------------------
// The /data cache: written whole, read back, tolerant of a bad file.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, emptyState } from '../src/store.js';

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'hpprinter-store-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('a first start reads an empty state', async (t) => {
  const store = createStore(await directory(t));
  assert.deepEqual(await store.load(), emptyState());
});

test('what is saved is read back', async (t) => {
  const store = createStore(await directory(t));
  const state = { ...emptyState(), printers: { a: { id: 'a', name: 'Bureau' } } };
  await store.save(state);
  assert.deepEqual(await store.load(), state);
  assert.equal(JSON.parse(await readFile(store.file, 'utf8')).version, 1);
});

test('a damaged or foreign file is ignored, not fatal', async (t) => {
  const path = await directory(t);
  const store = createStore(path);
  await writeFile(join(path, 'printers.json'), '{ not json');
  assert.deepEqual(await store.load(), emptyState());
  await writeFile(join(path, 'printers.json'), JSON.stringify({ version: 99, printers: { x: 1 } }));
  assert.deepEqual(await store.load(), emptyState());
});

test('a save that cannot write only warns', async (t) => {
  const path = await directory(t);
  await writeFile(join(path, 'file'), '');
  // A directory below a regular file cannot be created.
  const store = createStore(join(path, 'file', 'sub'));
  await store.save(emptyState());
  await store.flush();
});
