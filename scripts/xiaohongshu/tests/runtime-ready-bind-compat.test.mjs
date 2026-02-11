import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const runtimeReadyPath = path.resolve(__dirname, '..', 'lib', 'runtime-ready.mjs');

test('runtime-ready tolerates missing browser:session:bind action', async () => {
  const src = await readFile(runtimeReadyPath, 'utf8');
  assert.match(src, /Unknown action: browser:session:bind/);
  assert.match(src, /skip bind/);
});

