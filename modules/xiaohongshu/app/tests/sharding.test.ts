import test from 'node:test';
import assert from 'node:assert/strict';

import { fnv1a32, normalizeShard, shardFilterByNoteIdHash } from '../src/blocks/helpers/sharding.js';

test('normalizeShard returns null for invalid specs', () => {
  assert.equal(normalizeShard(null), null);
  assert.equal(normalizeShard({ count: 1, index: 0 }), null);
  assert.equal(normalizeShard({ count: 2, index: 2 }), null);
});

test('fnv1a32 is stable', () => {
  assert.equal(fnv1a32('abc'), fnv1a32('abc'));
  assert.notEqual(fnv1a32('abc'), fnv1a32('abcd'));
});

test('shardFilterByNoteIdHash partitions without overlap', () => {
  const items = Array.from({ length: 50 }).map((_, i) => ({ noteId: `id_${i}` }));
  const shard0 = shardFilterByNoteIdHash(items, { index: 0, count: 2, by: 'noteId-hash' });
  const shard1 = shardFilterByNoteIdHash(items, { index: 1, count: 2, by: 'noteId-hash' });

  const set0 = new Set(shard0.map((x) => x.noteId));
  const set1 = new Set(shard1.map((x) => x.noteId));
  let overlap = 0;
  for (const id of set0) {
    if (set1.has(id)) overlap += 1;
  }
  assert.equal(overlap, 0);
  assert.equal(set0.size + set1.size, items.length);
});

