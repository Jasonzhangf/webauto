import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getOrAssignLinkForTab,
  advanceLinkForTab,
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
});
