import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getOrAssignLinkForTab,
  advanceLinkForTab,
  readActiveLinkForTab,
  requeueTabLinkToTail,
  markTabLinkDone,
} from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/tab-state.mjs';

describe('xhs detail link progression', () => {
  it('advances to the next collected link after a tab finishes one note', async () => {
    const state = {
      linksCachePath: '/tmp/fake-links.jsonl',
      linksCache: [
        { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/search_result/note-1?xsec_token=1' },
        { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/search_result/note-2?xsec_token=2' },
        { noteId: 'note-3', noteUrl: 'https://www.xiaohongshu.com/search_result/note-3?xsec_token=3' },
      ],
    };
    const params = { sharedHarvestPath: '/tmp/fake-links.jsonl' };

    const first = await getOrAssignLinkForTab(state, params, 1);
    assert.equal(first.noteId, 'note-1');

    const second = await advanceLinkForTab(state, params, 1);
    assert.equal(second.noteId, 'note-2');

    const third = await advanceLinkForTab(state, params, 1);
    assert.equal(third.noteId, 'note-3');

    const exhausted = await advanceLinkForTab(state, params, 1);
    assert.equal(exhausted, null);
  });

  it('keeps unique tab assignments and requeues failed links to the tail', async () => {
    const state = {
      linksCachePath: '/tmp/fake-links.jsonl',
      linksCache: [
        { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/search_result/note-1?xsec_token=1' },
        { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/search_result/note-2?xsec_token=2' },
        { noteId: 'note-3', noteUrl: 'https://www.xiaohongshu.com/search_result/note-3?xsec_token=3' },
      ],
    };
    const params = { sharedHarvestPath: '/tmp/fake-links.jsonl', detailLinkRetryMax: 2 };

    const tab1First = await getOrAssignLinkForTab(state, params, 1);
    const tab2First = await getOrAssignLinkForTab(state, params, 2);
    assert.equal(tab1First.noteId, 'note-1');
    assert.equal(tab2First.noteId, 'note-2');
    assert.equal(readActiveLinkForTab(state, 1)?.link?.noteId, 'note-1');
    assert.equal(readActiveLinkForTab(state, 2)?.link?.noteId, 'note-2');

    const requeue = requeueTabLinkToTail(state, params, 1, { reason: 'detail_failed' });
    assert.equal(requeue.requeued, true);
    assert.equal(requeue.exhausted, false);
    assert.equal(requeue.retryCount, 1);

    const tab1Second = await getOrAssignLinkForTab(state, params, 1);
    assert.equal(tab1Second.noteId, 'note-3');

    const doneTab2 = markTabLinkDone(state, 2, { reason: 'detail_done' });
    assert.equal(doneTab2.done, true);
    assert.equal(doneTab2.key, 'note-2');

    const tab2Second = await getOrAssignLinkForTab(state, params, 2);
    assert.equal(tab2Second.noteId, 'note-1');
    assert.equal(readActiveLinkForTab(state, 2)?.retryCount, 1);
  });

  it('caps safe-link detail progression to maxNotes unique links', async () => {
    const state = {
      linksCachePath: '/tmp/fake-links.jsonl',
      linksCacheMaxNotes: 1,
      linksCache: [
        { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/search_result/note-1?xsec_token=1' },
        { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/search_result/note-1?xsec_token=1' },
        { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/search_result/note-2?xsec_token=2' },
      ],
    };
    const params = { sharedHarvestPath: '/tmp/fake-links.jsonl', maxNotes: 1 };

    const first = await getOrAssignLinkForTab(state, params, 1);
    assert.equal(first.noteId, 'note-1');

    const done = markTabLinkDone(state, 1, { reason: 'detail_done' });
    assert.equal(done.done, true);
    assert.equal(done.key, 'note-1');

    const exhausted = await getOrAssignLinkForTab(state, params, 1);
    assert.equal(exhausted, null);
  });
});
