import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrAssignLinkForTab,
  markTabLinkDone,
  requeueTabLinkToTail,
  readActiveLinkForTab,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/xhs/tab-state.mjs';

function buildState(noteIds: string[]) {
  return {
    linksCachePath: '/tmp/detail-queue-test.jsonl',
    linksCache: noteIds.map((noteId) => ({
      noteId,
      noteUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=test-${noteId}`,
    })),
  } as any;
}

test('detail queue requeues failed active link to tail and preserves remaining order', async () => {
  const state = buildState(['a', 'b', 'c']);
  const params = { sharedHarvestPath: '/tmp/detail-queue-test.jsonl', detailLinkRetryMax: 2 };

  assert.equal((await getOrAssignLinkForTab(state, params, 1))?.noteId, 'a');
  assert.equal(readActiveLinkForTab(state, 1)?.retryCount, 0);

  const requeued = requeueTabLinkToTail(state, params, 1, { reason: 'detail_failed' });
  assert.equal(requeued.requeued, true);
  assert.equal(requeued.exhausted, false);
  assert.equal(requeued.retryCount, 1);

  assert.equal((await getOrAssignLinkForTab(state, params, 1))?.noteId, 'b');
  assert.equal(markTabLinkDone(state, 1, { reason: 'done_b' }).key, 'b');

  assert.equal((await getOrAssignLinkForTab(state, params, 1))?.noteId, 'c');
  assert.equal(markTabLinkDone(state, 1, { reason: 'done_c' }).key, 'c');

  assert.equal((await getOrAssignLinkForTab(state, params, 1))?.noteId, 'a');
  assert.equal(readActiveLinkForTab(state, 1)?.retryCount, 1);
  assert.equal(markTabLinkDone(state, 1, { reason: 'done_retry_a' }).key, 'a');

  assert.equal(await getOrAssignLinkForTab(state, params, 1), null);
  assert.deepEqual(Object.keys(state.linksState.completed).sort(), ['a', 'b', 'c']);
});

test('detail queue moves link to exhausted after retry limit is exceeded', async () => {
  const state = buildState(['only']);
  const params = { sharedHarvestPath: '/tmp/detail-queue-test.jsonl', detailLinkRetryMax: 2 };

  assert.equal((await getOrAssignLinkForTab(state, params, 1))?.noteId, 'only');
  assert.equal(requeueTabLinkToTail(state, params, 1, { reason: 'fail_1' }).requeued, true);

  assert.equal((await getOrAssignLinkForTab(state, params, 1))?.noteId, 'only');
  assert.equal(requeueTabLinkToTail(state, params, 1, { reason: 'fail_2' }).requeued, true);

  assert.equal((await getOrAssignLinkForTab(state, params, 1))?.noteId, 'only');
  const exhausted = requeueTabLinkToTail(state, params, 1, { reason: 'fail_3' });
  assert.equal(exhausted.requeued, false);
  assert.equal(exhausted.exhausted, true);
  assert.equal(exhausted.retryCount, 3);

  assert.equal(await getOrAssignLinkForTab(state, params, 1), null);
  assert.equal(state.linksState.exhausted.only.retryCount, 3);
});
