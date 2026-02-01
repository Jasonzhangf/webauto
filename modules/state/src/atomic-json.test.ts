import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { atomicWriteJson, readJsonMaybe } from './atomic-json.js';

test('readJsonMaybe returns null when file missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-atomic-'));
  const p = path.join(root, 'missing.json');
  const v = await readJsonMaybe(p);
  assert.equal(v, null);
});

test('atomicWriteJson writes json and readJsonMaybe reads it back', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-atomic-'));
  const p = path.join(root, 'state.json');
  await atomicWriteJson(p, { ok: true, n: 1 });
  const v = await readJsonMaybe<any>(p);
  assert.deepEqual(v, { ok: true, n: 1 });
});

test('readJsonMaybe throws on invalid json', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-atomic-'));
  const p = path.join(root, 'bad.json');
  await fs.writeFile(p, '{bad json', 'utf8');
  await assert.rejects(async () => readJsonMaybe(p));
});

