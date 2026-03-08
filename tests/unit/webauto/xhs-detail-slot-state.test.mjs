import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  markDetailSlotProgress,
  readDetailSlotState,
  shouldCloseCurrentDetail,
  shouldReuseDetailForCurrentTab,
  writeDetailSlotState,
} from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/detail-slot-state.mjs';

function buildState() {
  return {
    tabState: {
      tabCount: 4,
      limit: 50,
      cursor: 2,
      used: [0, 50, 0, 0],
    },
    detailLinkState: {
      openByLinks: true,
      activeTabIndex: 2,
      activeByTab: {},
    },
    linksState: {
      queue: [],
      byTab: {
        '2': {
          link: { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/explore/note-2?xsec_token=2' },
          retryCount: 1,
          done: false,
        },
      },
      completed: {},
      exhausted: {},
    },
  };
}

describe('xhs detail slot state', () => {
  it('marks budget-exhausted slot as paused and reusable without closing', () => {
    const state = buildState();
    writeDetailSlotState(state, 2, {
      link: { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/explore/note-2?xsec_token=2' },
      lastOpenedNoteId: 'note-2',
      lastOpenedHref: 'https://www.xiaohongshu.com/explore/note-2?xsec_token=2',
      status: 'active',
    });

    markDetailSlotProgress(state, { tabCount: 4, openByLinks: true }, {
      paused: true,
      completed: false,
      failed: false,
      budgetExhausted: true,
      commentsAdded: 50,
      exitReason: 'tab_budget_exhausted',
    });

    const slot = readDetailSlotState(state, 2, { tabCount: 4 });
    assert.equal(slot.status, 'paused');
    assert.equal(slot.paused, true);
    assert.equal(slot.budgetExhausted, true);
    assert.equal(shouldReuseDetailForCurrentTab(state, { tabCount: 4, openByLinks: true }), true);
    assert.equal(shouldCloseCurrentDetail(state, { tabCount: 4, openByLinks: true }), false);
  });

  it('marks reached-bottom slot as completed and closeable', () => {
    const state = buildState();
    writeDetailSlotState(state, 2, {
      link: { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/explore/note-2?xsec_token=2' },
      lastOpenedNoteId: 'note-2',
      lastOpenedHref: 'https://www.xiaohongshu.com/explore/note-2?xsec_token=2',
      status: 'active',
    });

    markDetailSlotProgress(state, { tabCount: 4, openByLinks: true }, {
      completed: true,
      reachedBottom: true,
      commentsAdded: 12,
      exitReason: 'reached_bottom',
    });

    const slot = readDetailSlotState(state, 2, { tabCount: 4 });
    assert.equal(slot.status, 'completed');
    assert.equal(slot.completed, true);
    assert.equal(slot.reachedBottom, true);
    assert.equal(shouldCloseCurrentDetail(state, { tabCount: 4, openByLinks: true }), true);
    assert.equal(shouldReuseDetailForCurrentTab(state, { tabCount: 4, openByLinks: true }), false);
  });

  it('marks failed slot as closeable and not reusable', () => {
    const state = buildState();
    writeDetailSlotState(state, 2, {
      link: { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/explore/note-2?xsec_token=2' },
      lastOpenedNoteId: 'note-2',
      lastOpenedHref: 'https://www.xiaohongshu.com/explore/note-2?xsec_token=2',
      status: 'active',
    });

    markDetailSlotProgress(state, { tabCount: 4, openByLinks: true }, {
      failed: true,
      completed: false,
      paused: false,
      exitReason: 'detail_flow_failed',
      failureCode: 'DETAIL_FLOW_FAILED',
      commentsAdded: 3,
    });

    const slot = readDetailSlotState(state, 2, { tabCount: 4 });
    assert.equal(slot.status, 'failed');
    assert.equal(slot.failed, true);
    assert.equal(slot.lastFailureCode, 'DETAIL_FLOW_FAILED');
    assert.equal(shouldCloseCurrentDetail(state, { tabCount: 4, openByLinks: true }), true);
    assert.equal(shouldReuseDetailForCurrentTab(state, { tabCount: 4, openByLinks: true }), false);
  });
});
