import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildDynamicShardPlan,
  fnv1a32,
  getPendingItemsByNoteIds,
  normalizeShard,
  shardFilterByNoteIdHash,
} from '../src/blocks/helpers/sharding.js';

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

test('buildDynamicShardPlan uses sanitized env/keyword path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xhs-sharding-'));
  const env = 'debug:daily';
  const keyword = 'deepseek/2.0';
  const stateDir = path.join(root, 'xiaohongshu', 'debug_daily', 'deepseek_2.0');
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(
    path.join(stateDir, '.collect-state.json'),
    JSON.stringify({
      listCollection: {
        collectedUrls: [
          { noteId: 'n1', safeUrl: 'u1' },
          { noteId: 'n2', safeUrl: 'u2' },
          { noteId: 'n3', safeUrl: 'u3' },
        ],
      },
      detailCollection: { completedNoteIds: ['n2'] },
    }),
    'utf8',
  );

  const plans = await buildDynamicShardPlan({
    keyword,
    env,
    downloadRoot: root,
    validProfiles: ['p1', 'p2'],
  });
  assert.equal(plans.length, 2);
  const assigned = plans.flatMap((it) => it.assignedNoteIds);
  assert.deepEqual(new Set(assigned), new Set(['n1', 'n3']));
});

test('buildDynamicShardPlan honors WEBAUTO_DOWNLOAD_ROOT when no custom root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xhs-sharding-env-'));
  const stateDir = path.join(root, 'xiaohongshu', 'debug', 'seedance2.0');
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(
    path.join(stateDir, '.collect-state.json'),
    JSON.stringify({
      listCollection: { collectedUrls: [{ noteId: 'n1', safeUrl: 'u1' }] },
      detailCollection: { completedNoteIds: [] },
    }),
    'utf8',
  );

  const prev = process.env.WEBAUTO_DOWNLOAD_ROOT;
  process.env.WEBAUTO_DOWNLOAD_ROOT = root;
  try {
    const plans = await buildDynamicShardPlan({
      keyword: 'seedance2.0',
      env: 'debug',
      validProfiles: ['p1'],
    });
    assert.equal(plans[0]?.totalPending, 1);
    assert.deepEqual(plans[0]?.assignedNoteIds, ['n1']);
  } finally {
    if (prev === undefined) delete process.env.WEBAUTO_DOWNLOAD_ROOT;
    else process.env.WEBAUTO_DOWNLOAD_ROOT = prev;
  }
});

test('buildDynamicShardPlan tolerates malformed collectedUrls rows', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xhs-sharding-badrows-'));
  const stateDir = path.join(root, 'xiaohongshu', 'debug', 'kw');
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(
    path.join(stateDir, '.collect-state.json'),
    JSON.stringify({
      listCollection: {
        collectedUrls: [
          null,
          1,
          {},
          { noteId: '' },
          { noteId: 'n1', safeUrl: 'u1' },
          { noteId: 'n1', safeUrl: 'dup' },
          { noteId: 'n2', safeUrl: 'u2' },
        ],
      },
      detailCollection: { completedNoteIds: ['n2'] },
    }),
    'utf8',
  );

  const plans = await buildDynamicShardPlan({
    keyword: 'kw',
    env: 'debug',
    downloadRoot: root,
    validProfiles: ['p1'],
  });
  assert.deepEqual(plans[0]?.assignedNoteIds, ['n1']);
});

test('getPendingItemsByNoteIds returns only requested pending notes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xhs-sharding-noteids-'));
  const stateDir = path.join(root, 'xiaohongshu', 'debug', 'kw2');
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(
    path.join(stateDir, '.collect-state.json'),
    JSON.stringify({
      listCollection: {
        collectedUrls: [
          { noteId: 'n1', safeUrl: 'u1' },
          { noteId: 'n2', safeUrl: 'u2' },
          { noteId: 'n3', safeUrl: 'u3' },
        ],
      },
      detailCollection: { completedNoteIds: ['n2'] },
    }),
    'utf8',
  );

  const pending = await getPendingItemsByNoteIds({
    keyword: 'kw2',
    env: 'debug',
    downloadRoot: root,
    noteIds: ['n1', 'n2', 'n4'],
  });
  assert.deepEqual(pending.map((it) => it.noteId), ['n1']);
});
