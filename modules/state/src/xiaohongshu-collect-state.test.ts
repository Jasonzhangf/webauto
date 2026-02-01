import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import {
  createDefaultXhsCollectState,
  formatXhsCollectStateSummary,
  getXhsPendingItems,
  initializeXhsCollectState,
  loadXhsCollectState,
  markXhsCollectCompleted,
  markXhsCollectFailed,
  resetXhsCollectState,
  resolveXhsCollectStatePath,
  saveXhsCollectState,
  updateXhsDetailCollection,
  updateXhsCollectState,
  updateXhsListCollection,
} from './xiaohongshu-collect-state.js';

test('xhs collect state: load default does not create file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = '工作服';
  const env = 'debug';

  const p = resolveXhsCollectStatePath({ keyword, env, downloadRoot: root });
  const before = await fs
    .stat(p)
    .then(() => true)
    .catch(() => false);
  assert.equal(before, false);

  const state = await loadXhsCollectState({ keyword, env, downloadRoot: root, targetCount: 10 });
  assert.equal(state.version, 2);
  assert.equal(state.keyword, keyword);
  assert.equal(state.env, env);
  assert.equal(state.status, 'idle');
  assert.equal(state.listCollection.targetCount, 10);

  const after = await fs
    .stat(p)
    .then(() => true)
    .catch(() => false);
  assert.equal(after, false);
});

test('xhs collect state: save creates file and de-dupes by noteId', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = '手机膜';
  const env = 'debug';

  const state = createDefaultXhsCollectState({ keyword, env, targetCount: 2 });
  state.status = 'running';
  state.listCollection.collectedUrls.push(
    { noteId: 'a1', safeUrl: 'https://www.xiaohongshu.com/explore/a1?xsec_token=1', timestamp: 1 },
    { noteId: 'a1', safeUrl: 'https://www.xiaohongshu.com/explore/a1?xsec_token=2', timestamp: 2 },
  );

  await saveXhsCollectState(state, { keyword, env, downloadRoot: root });
  const loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.listCollection.collectedUrls.length, 1);
  assert.equal(loaded.listCollection.collectedUrls[0]?.noteId, 'a1');
});

test('xhs collect state: update persists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = '华为';
  const env = 'debug';

  await updateXhsCollectState({ keyword, env, downloadRoot: root, targetCount: 3 }, (draft) => {
    draft.status = 'running';
    draft.listCollection.collectedUrls.push({
      noteId: 'n1',
      safeUrl: 'https://www.xiaohongshu.com/explore/n1?xsec_token=1',
    });
  });

  const loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.status, 'running');
  assert.equal(loaded.listCollection.collectedUrls.length, 1);
});

test('xhs collect state: legacy state-manager shape migrates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = '迁移';
  const env = 'debug';
  const p = resolveXhsCollectStatePath({ keyword, env, downloadRoot: root });
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(
    p,
    JSON.stringify(
      {
        keyword,
        env,
        processedCount: 2,
        completedNotes: ['x1', 'x2'],
        lastUpdatedAt: Date.now(),
      },
      null,
      2,
    ),
    'utf8',
  );

  const loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.version, 2);
  assert.equal(loaded.detailCollection.completed, 2);
  assert.deepEqual(loaded.detailCollection.completedNoteIds, ['x1', 'x2']);
});

test('xhs collect state: legacy v1 shared/state schema migrates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = 'v1';
  const env = 'debug';
  const p = resolveXhsCollectStatePath({ keyword, env, downloadRoot: root });
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(
    p,
    JSON.stringify(
      {
        version: 1,
        keyword,
        env,
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
        status: 'running',
        listCollection: {
          targetCount: 2,
          collectedUrls: [
            { noteId: 'a1', safeDetailUrl: 'https://www.xiaohongshu.com/explore/a1?xsec_token=1', timestamp: 1 },
          ],
          currentUrlIndex: 0,
          scrollRounds: 1,
          lastScrollTime: null,
        },
        detailCollection: {
          total: 1,
          completed: 1,
          failed: 0,
          skipped: 0,
          completedNoteIds: ['a1'],
          failedNoteIds: [],
        },
        stats: { totalDurationMs: 0, phase2DurationMs: 0, phase3DurationMs: 0, phase4DurationMs: 0 },
      },
      null,
      2,
    ),
    'utf8',
  );

  const loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.version, 2);
  assert.equal(loaded.listCollection.collectedUrls.length, 1);
  assert.equal(loaded.detailCollection.completed, 1);
});

test('xhs collect state: initialize writes running state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = 'init';
  const env = 'debug';
  const state = await initializeXhsCollectState({ keyword, env, downloadRoot: root, targetCount: 5 });
  assert.equal(state.status, 'running');
  const loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.listCollection.targetCount, 5);
  assert.equal(loaded.status, 'running');
});

test('xhs collect state: update listCollection appends and de-dupes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = 'list';
  const env = 'debug';

  await updateXhsListCollection({
    keyword,
    env,
    downloadRoot: root,
    newUrls: [
      { noteId: 'n1', safeUrl: 'https://www.xiaohongshu.com/explore/n1?xsec_token=1' },
      { noteId: 'n1', safeUrl: 'https://www.xiaohongshu.com/explore/n1?xsec_token=2' },
      { noteId: 'n2', safeUrl: 'https://www.xiaohongshu.com/explore/n2?xsec_token=1' },
    ],
  });
  const loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.listCollection.collectedUrls.length, 2);
});

test('xhs collect state: update detailCollection is idempotent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = 'detail';
  const env = 'debug';

  await updateXhsDetailCollection({ keyword, env, downloadRoot: root, noteId: 'a', status: 'completed' });
  await updateXhsDetailCollection({ keyword, env, downloadRoot: root, noteId: 'a', status: 'completed' });
  await updateXhsDetailCollection({ keyword, env, downloadRoot: root, noteId: 'b', status: 'failed', error: 'oops' });

  const loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.detailCollection.completed, 1);
  assert.equal(loaded.detailCollection.failed, 1);
  assert.equal(loaded.detailCollection.total, 2);
});

test('xhs collect state: pending items excludes completed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = 'pending';
  const env = 'debug';

  await updateXhsCollectState({ keyword, env, downloadRoot: root }, (draft) => {
    draft.listCollection.collectedUrls = [
      { noteId: 'n1', safeUrl: 'https://www.xiaohongshu.com/explore/n1?xsec_token=1' },
      { noteId: 'n2', safeUrl: 'https://www.xiaohongshu.com/explore/n2?xsec_token=1' },
    ];
  });
  await updateXhsDetailCollection({ keyword, env, downloadRoot: root, noteId: 'n1', status: 'completed' });
  const pending = await getXhsPendingItems({ keyword, env, downloadRoot: root });
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.noteId, 'n2');
});

test('xhs collect state: mark completed/failed updates status', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = 'status';
  const env = 'debug';

  await initializeXhsCollectState({ keyword, env, downloadRoot: root, targetCount: 1 });
  await markXhsCollectFailed({ keyword, env, downloadRoot: root, error: 'boom' });
  let loaded = await loadXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(loaded.status, 'failed');
  assert.equal(loaded.error, 'boom');

  loaded = await markXhsCollectCompleted({ keyword, env, downloadRoot: root });
  assert.equal(loaded.status, 'completed');
  assert.ok((loaded.stats.totalDurationMs || 0) >= 0);
});

test('xhs collect state: reset removes state file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-state-'));
  const keyword = 'reset';
  const env = 'debug';

  await initializeXhsCollectState({ keyword, env, downloadRoot: root, targetCount: 1 });
  const ok = await resetXhsCollectState({ keyword, env, downloadRoot: root });
  assert.equal(ok, true);
  const p = resolveXhsCollectStatePath({ keyword, env, downloadRoot: root });
  const exists = await fs
    .stat(p)
    .then(() => true)
    .catch(() => false);
  assert.equal(exists, false);
});

test('xhs collect state: format summary contains key fields', async () => {
  const state = createDefaultXhsCollectState({ keyword: 'k', env: 'debug', targetCount: 2 });
  const s = formatXhsCollectStateSummary(state);
  assert.ok(s.includes('keyword: k'));
  assert.ok(s.includes('env: debug'));
});
