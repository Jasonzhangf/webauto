import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRealtimeJsonlWriter } from '../lib/realtime-jsonl.mjs';

test('createRealtimeJsonlWriter appends unique rows and skips duplicates', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'webauto-realtime-writer-'));
  const jsonl = path.join(dir, 'links.jsonl');

  await writeFile(
    jsonl,
    `${JSON.stringify({ noteId: 'n1', safeUrl: 's1' })}\n${JSON.stringify({ noteId: 'n2', safeUrl: 's2' })}\n`,
    'utf8',
  );

  const writer = await createRealtimeJsonlWriter(jsonl, { dedupeKey: 'noteId' });
  assert.equal(writer.stats().existing, 2);

  assert.deepEqual(await writer.append({ noteId: 'n3', safeUrl: 's3' }), { appended: true });
  assert.deepEqual(await writer.append({ noteId: 'n3', safeUrl: 's3-dupe' }), {
    appended: false,
    reason: 'duplicate',
  });
  assert.deepEqual(await writer.append({ safeUrl: 'missing-note-id' }), {
    appended: false,
    reason: 'missing_key',
  });

  const rows = (await readFile(jsonl, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.noteId),
    ['n1', 'n2', 'n3'],
  );

  assert.deepEqual(writer.stats(), { existing: 2, added: 1, total: 3 });
});
