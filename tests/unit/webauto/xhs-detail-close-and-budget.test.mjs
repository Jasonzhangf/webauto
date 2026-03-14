import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as detailFlowOps from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs';
import * as harvestOps from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs';
import { getProfileState } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/state.mjs';

const closeProfileId = 'xhs-close-detail-behavior';
const budgetProfileId = 'xhs-comments-budget';

function resetState(profileId) {
  const state = getProfileState(profileId);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, {
    keyword: 'deepseek',
    env: 'debug',
    outputRoot: '/tmp',
    downloadRoot: '/tmp',
    rootDir: '/tmp',
    currentNoteId: 'note-1',
    currentHref: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=abc',
    lastListUrl: 'https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend',
    visitedNoteIds: [],
    preCollectedNoteIds: [],
    preCollectedAt: null,
    maxNotes: 0,
    currentComments: [],
    matchedComments: [],
    matchRule: null,
    lastCommentsHarvest: null,
    lastDetail: null,
    lastReply: null,
    metrics: {
      searchCount: 0,
      rollbackCount: 0,
      returnToSearchCount: 0,
      lastSearchAt: null,
      lastRollbackAt: null,
      lastReturnToSearchAt: null,
    },
  });
  return state;
}

describe('xhs detail close and comment budget behavior', () => {
  beforeEach(() => {
    resetState(closeProfileId);
    resetState(budgetProfileId);
  });

  it('finalizes safe-link detail without modal close actions and leaves next hop to open_next_detail goto', async () => {
    const state = getProfileState(closeProfileId);
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=abc' },
          status: 'completed',
          completed: true,
          failed: false,
        },
      },
    };
    state.linksState = {
      sourcePath: '/tmp/fake-links.jsonl',
      queue: [],
      byTab: {
        '1': {
          link: { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=abc' },
          key: 'note-1',
          retryCount: 0,
          done: false,
          gateKey: 'deepseek',
          consumerId: 'tab-1',
        },
      },
      completed: {},
      exhausted: {},
    };

    const actions = [];
    const progress = [];
    let visible = true;
    const result = await detailFlowOps.executeCloseDetailOperation({
      profileId: closeProfileId,
      params: {
        openByLinks: true,
        tabCount: 4,
        allowKeepDetail: false,
      },
      context: {
        emitProgress: (entry) => progress.push(entry),
        testingOverrides: {
          callAPI: async (action, payload) => {
            actions.push({ action, payload });
            if (action === 'page:back') visible = false;
            return { ok: true };
          },
          isDetailVisible: async () => ({ detailVisible: visible }),
          readDetailCloseTarget: async () => ({ found: false, center: null, selector: null }),
          sleep: async () => {},
          completeDetailLink: async () => ({ ok: true, done: true, removed: true, linkKey: 'note-1' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.method, 'link_finalize_only');
    assert.deepEqual(actions.map((item) => item.action), []);
    assert.equal(actions.some((item) => item.action === 'goto'), false);
    assert.equal(state.detailLinkState?.lastQueueOutcome?.response?.removed, true);
    assert.equal(visible, true);
  });

  it('marks a stale-closed safe-link as skipped so open_next_detail will not reopen it', async () => {
    const state = getProfileState(closeProfileId);
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=abc' },
          status: 'completed',
          completed: true,
          failed: false,
        },
      },
    };
    state.linksState = {
      sourcePath: '/tmp/fake-links.jsonl',
      queue: [],
      byTab: {
        '1': {
          link: { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=abc' },
          key: 'note-1',
          retryCount: 0,
          done: false,
          gateKey: 'deepseek',
          consumerId: 'tab-1',
        },
      },
      completed: {},
      exhausted: {},
    };

    const result = await detailFlowOps.executeCloseDetailOperation({
      profileId: closeProfileId,
      params: {
        openByLinks: true,
        tabCount: 4,
        allowKeepDetail: false,
      },
      context: {
        testingOverrides: {
          isDetailVisible: async () => ({ detailVisible: false }),
          sleep: async () => {},
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.queueSkipped, true);
    assert.equal(state.detailLinkState?.lastQueueOutcome?.response?.skipped, true);
    assert.equal(state.detailLinkState?.activeByTab?.['1'], undefined);
  });

  it('completes failed safe-link by default during finalize to avoid re-claim loop', async () => {
    const state = getProfileState(closeProfileId);
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: true,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'note-failed', noteUrl: 'https://www.xiaohongshu.com/explore/note-failed?xsec_token=abc' },
          status: 'failed',
          completed: false,
          failed: true,
        },
      },
    };
    state.linksState = {
      sourcePath: '/tmp/fake-links.jsonl',
      queue: [],
      byTab: {
        '1': {
          link: { noteId: 'note-failed', noteUrl: 'https://www.xiaohongshu.com/explore/note-failed?xsec_token=abc' },
          key: 'note-failed',
          retryCount: 1,
          done: false,
          gateKey: 'deepseek',
          consumerId: 'tab-1',
        },
      },
      completed: {},
      exhausted: {},
    };

    let completeCalls = 0;
    let releaseCalls = 0;
    const result = await detailFlowOps.executeCloseDetailOperation({
      profileId: closeProfileId,
      params: {
        openByLinks: true,
        tabCount: 4,
        allowKeepDetail: false,
      },
      context: {
        testingOverrides: {
          isDetailVisible: async () => ({ detailVisible: true }),
          sleep: async () => {},
          completeDetailLink: async () => {
            completeCalls += 1;
            return { ok: true, done: true, removed: true, linkKey: 'note-failed' };
          },
          releaseDetailLink: async () => {
            releaseCalls += 1;
            return { ok: true, released: true, linkKey: 'note-failed' };
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.method, 'link_finalize_only');
    assert.equal(completeCalls, 1);
    assert.equal(releaseCalls, 0);
    assert.equal(state.detailLinkState?.lastQueueOutcome?.response?.removed, true);
  });

  it('pauses current detail once tab comment budget is reached instead of scrolling to bottom', async () => {
    const state = getProfileState(budgetProfileId);
    state.currentNoteId = 'budget-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/budget-note?xsec_token=budget';
    state.tabState = {
      tabCount: 4,
      limit: 50,
      cursor: 1,
      used: [48, 0, 0, 0],
    };
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'budget-note', noteUrl: 'https://www.xiaohongshu.com/explore/budget-note?xsec_token=budget' },
          status: 'active',
          failed: false,
          completed: false,
          paused: false,
        },
      },
    };

    let snapshotReads = 0;
    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId: budgetProfileId,
      params: {
        tabCount: 4,
        commentBudget: 50,
        commentsLimit: 0,
        maxRounds: 10,
        persistComments: false,
        doLikes: false,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'budget-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => {},
          scrollBySelector: async () => {
            throw new Error('scroll should not happen after budget is reached');
          },
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readVisibleCommentTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.comment-item' }),
          readVisibleCommentTargets: async () => ({
            found: true,
            comments: [
              { commentId: 'c-1-1', author: 'a', content: 'one', index: 1 },
              { commentId: 'c-1-2', author: 'b', content: 'two', index: 2 },
            ],
          }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 20, y: 20 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.note-scroller' }),
          readCommentsSnapshot: async () => {
            snapshotReads += 1;
            return {
              detailVisible: true,
              hasCommentsContext: true,
              expectedCommentsCount: 400,
              collectability: { visibleTextCount: 2 },
              scroll: { atBottom: false, selector: '.note-scroller' },
              comments: [
                { commentId: `c-${snapshotReads}-1`, author: 'a', content: 'one', index: 1 },
                { commentId: `c-${snapshotReads}-2`, author: 'b', content: 'two', index: 2 },
              ],
            };
          },
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.exitReason, 'tab_comment_budget_reached');
    assert.equal(result.data?.budgetExhausted, true);
    assert.equal(result.data?.paused, true);
    assert.equal(result.data?.completed, false);
    assert.equal(result.data?.failed, false);
    assert.equal(result.data?.tabBudget?.tabIndex, 1);
    assert.equal(result.data?.tabBudget?.used, 50);
    assert.equal(state.detailLinkState?.activeByTab?.['1']?.status, 'paused');
    assert.equal(state.detailLinkState?.activeByTab?.['1']?.budgetExhausted, true);
    assert.equal(state.detailLinkState?.activeByTab?.['1']?.resumeAnchor?.first?.commentId, 'c-1-1');
    assert.equal(state.detailLinkState?.activeByTab?.['1']?.resumeAnchor?.second?.commentId, 'c-1-2');
    assert.equal(state.tabState?.used?.[0], 50);
  });

  it('finishes current note when only weak comment anchor is available (comment total without scroll container)', async () => {
    const state = getProfileState(budgetProfileId);
    state.currentNoteId = 'weak-anchor-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/weak-anchor-note?xsec_token=weak';
    state.tabState = {
      tabCount: 4,
      limit: 50,
      cursor: 1,
      used: [0, 0, 0, 0],
    };
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'weak-anchor-note', noteUrl: state.currentHref },
          status: 'active',
          failed: false,
          completed: false,
          paused: false,
        },
      },
    };

    let scrollCalls = 0;
    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId: budgetProfileId,
      params: {
        tabCount: 4,
        commentBudget: 50,
        commentsLimit: 0,
        maxRounds: 6,
        persistComments: false,
        doLikes: false,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'weak-anchor-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => {},
          scrollBySelector: async () => { scrollCalls += 1; },
          readCommentEntryPoint: async () => ({ found: false, reason: 'entry_not_needed' }),
          readVisibleCommentTarget: async () => ({ found: false, center: null, selector: null }),
          readVisibleCommentTargets: async () => ({
            found: true,
            comments: [
              { commentId: 'weak-c1', author: 'a', content: 'one', index: 1 },
              { commentId: 'weak-c2', author: 'b', content: 'two', index: 2 },
            ],
          }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 30 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({ found: false, center: null, selector: null }),
          readCommentsSnapshot: async () => ({
            detailVisible: true,
            hasCommentsContext: true,
            expectedCommentsCount: 44,
            collectability: { visibleTextCount: 2 },
            scroll: { top: 0, clientHeight: 620, scrollHeight: 3100, atBottom: false },
            comments: [
              { commentId: 'weak-c1', author: 'a', content: 'one', index: 1 },
              { commentId: 'weak-c2', author: 'b', content: 'two', index: 2 },
            ],
          }),
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.commentsAdded, 2);
    assert.equal(result.data?.exitReason, 'comment_scroll_anchor_missing');
    assert.equal(result.data?.commentsSkippedReason, 'comment_scroll_anchor_missing');
    assert.equal(result.data?.completed, true);
    assert.equal(result.data?.failed, false);
    assert.equal(scrollCalls, 0);
    assert.equal(state.detailLinkState?.activeByTab?.['1']?.status, 'completed');
  });

  it('rejects non-comment scroll selector anchor and finishes current note with weak-only context', async () => {
    const state = getProfileState(budgetProfileId);
    state.currentNoteId = 'invalid-selector-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/invalid-selector-note?xsec_token=invalid-selector';
    state.tabState = {
      tabCount: 4,
      limit: 50,
      cursor: 1,
      used: [0, 0, 0, 0],
    };
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'invalid-selector-note', noteUrl: state.currentHref },
          status: 'active',
          failed: false,
          completed: false,
          paused: false,
        },
      },
    };

    let scrollCalls = 0;
    let clickCalls = 0;
    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId: budgetProfileId,
      params: {
        tabCount: 4,
        commentBudget: 50,
        commentsLimit: 0,
        maxRounds: 6,
        persistComments: false,
        doLikes: false,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'invalid-selector-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => { clickCalls += 1; },
          scrollBySelector: async () => { scrollCalls += 1; },
          readCommentEntryPoint: async () => ({ found: false, reason: 'entry_not_needed' }),
          readVisibleCommentTarget: async () => ({ found: false, center: null, selector: null }),
          readVisibleCommentTargets: async () => ({
            found: true,
            comments: [
              { commentId: 'weak-c1', author: 'a', content: 'one', index: 1 },
              { commentId: 'weak-c2', author: 'b', content: 'two', index: 2 },
            ],
          }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 30 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({ found: true, center: { x: 420, y: 200 }, selector: '.note-container' }),
          readCommentsSnapshot: async () => ({
            detailVisible: true,
            hasCommentsContext: true,
            expectedCommentsCount: 44,
            collectability: { visibleTextCount: 2 },
            scroll: { top: 0, clientHeight: 620, scrollHeight: 3100, atBottom: false },
            comments: [
              { commentId: 'weak-c1', author: 'a', content: 'one', index: 1 },
              { commentId: 'weak-c2', author: 'b', content: 'two', index: 2 },
            ],
          }),
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.commentsAdded, 2);
    assert.equal(result.data?.exitReason, 'comment_scroll_anchor_missing');
    assert.equal(result.data?.commentsSkippedReason, 'comment_scroll_anchor_missing');
    assert.equal(result.data?.completed, true);
    assert.equal(result.data?.failed, false);
    assert.equal(scrollCalls, 0);
    assert.equal(clickCalls, 0);
    assert.equal(state.detailLinkState?.activeByTab?.['1']?.status, 'completed');
  });

  it('does not treat feed text/image as detail anchor in comments_harvest interaction-state guard', async () => {
    const state = getProfileState(budgetProfileId);
    state.currentNoteId = 'expected-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/expected-note?xsec_token=expected';
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'expected-note', noteUrl: state.currentHref },
          status: 'active',
          failed: false,
          completed: false,
          paused: false,
        },
      },
    };

    const pressed = [];
    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId: budgetProfileId,
      params: {
        tabCount: 4,
        commentBudget: 50,
        commentsLimit: 0,
        maxRounds: 1,
        persistComments: false,
        doLikes: false,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: null,
            commentsContextAvailable: false,
            textPresent: true,
            imageCount: 5,
            videoPresent: false,
          }),
          readDetailState: async () => ({
            href: 'https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend',
            noteIdFromUrl: null,
            detailVisible: false,
          }),
          pressKey: async (_profileId, key) => { pressed.push(key); },
          sleep: async () => {},
          clearVisualHighlight: async () => {},
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'DETAIL_INTERACTION_STATE_INVALID');
    assert.equal(pressed.filter((key) => key === 'Escape').length, 1);
    assert.equal(state.detailLinkState?.activeFailed, true);
    assert.equal(state.detailLinkState?.lastFailureCode, 'DETAIL_INTERACTION_STATE_INVALID');
  });

  it('tries to restore paused detail from a two-comment anchor before continuing', async () => {
    const state = getProfileState(budgetProfileId);
    state.currentNoteId = 'resume-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/resume-note?xsec_token=resume';
    state.tabState = {
      tabCount: 4,
      limit: 50,
      cursor: 1,
      used: [50, 0, 0, 0],
    };
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          link: { noteId: 'resume-note', noteUrl: 'https://www.xiaohongshu.com/explore/resume-note?xsec_token=resume' },
          status: 'paused',
          failed: false,
          completed: false,
          paused: true,
          resumeAnchor: {
            first: { commentId: 'resume-c1', author: 'a', content: 'resume one' },
            second: { commentId: 'resume-c2', author: 'b', content: 'resume two' },
          },
        },
      },
    };

    const clicks = [];
    const progress = [];
    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId: budgetProfileId,
      params: {
        tabCount: 4,
        commentBudget: 50,
        commentsLimit: 0,
        maxRounds: 1,
        persistComments: false,
        doLikes: false,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        emitProgress: (entry) => progress.push(entry),
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'resume-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async (_profileId, center) => { clicks.push(center); },
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readVisibleCommentTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.comment-item' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 20, y: 20 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.note-scroller' }),
          readResumeAnchorPairTarget: async () => ({
            found: true,
            selector: '.comment-item',
            center: { x: 88, y: 166 },
            pairText: 'resume one | resume two',
          }),
          readVisibleCommentTargets: async () => ({ found: true, comments: [] }),
          readCommentsSnapshot: async () => ({
            detailVisible: true,
            hasCommentsContext: true,
            expectedCommentsCount: 400,
            collectability: { visibleTextCount: 2 },
            scroll: { atBottom: false, selector: '.note-scroller' },
            comments: [],
          }),
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(clicks[0], { x: 80, y: 120 });
    assert.deepEqual(clicks[1], { x: 88, y: 166 });
    assert.ok(progress.some((entry) => entry?.kind === 'resume_anchor_probe' && entry?.restored === true));
  });

  it('restores resume anchor by matching current note binding even when tab cursor already rotated away', async () => {
    const state = getProfileState(budgetProfileId);
    state.currentNoteId = 'resume-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/resume-note?xsec_token=resume';
    state.tabState = {
      tabCount: 4,
      limit: 50,
      cursor: 4,
      used: [50, 0, 0, 0],
    };
    state.detailLinkState = {
      activeTabIndex: 4,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          noteId: 'resume-note',
          href: 'https://www.xiaohongshu.com/explore/resume-note?xsec_token=resume',
          link: { noteId: 'resume-note', noteUrl: 'https://www.xiaohongshu.com/explore/resume-note?xsec_token=resume' },
          status: 'paused',
          failed: false,
          completed: false,
          paused: true,
          resumeAnchor: {
            first: { commentId: 'resume-c1', author: 'a', content: 'resume one' },
            second: { commentId: 'resume-c2', author: 'b', content: 'resume two' },
          },
        },
      },
    };

    const progress = [];
    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId: budgetProfileId,
      params: {
        tabCount: 4,
        commentBudget: 50,
        commentsLimit: 0,
        maxRounds: 1,
        persistComments: false,
        doLikes: false,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        emitProgress: (entry) => progress.push(entry),
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'resume-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => {},
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readVisibleCommentTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.comment-item' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 20, y: 20 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.note-scroller' }),
          readResumeAnchorPairTarget: async () => ({
            found: true,
            selector: '.comment-item',
            center: { x: 88, y: 166 },
            pairText: 'resume one | resume two',
          }),
          readVisibleCommentTargets: async () => ({ found: true, comments: [] }),
          readCommentsSnapshot: async () => ({
            detailVisible: true,
            hasCommentsContext: true,
            expectedCommentsCount: 400,
            collectability: { visibleTextCount: 2 },
            scroll: { atBottom: false, selector: '.note-scroller' },
            comments: [],
          }),
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
        },
      },
    });

    assert.equal(result.ok, true);
    const probe = progress.find((entry) => entry?.kind === 'resume_anchor_probe');
    assert.equal(probe?.restored, true);
  });

  it('reuses persisted note comments when paused tab revisits the same detail, preventing repeated budget recount', async () => {
    const state = getProfileState(budgetProfileId);
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xhs-comments-cache-'));
    const noteId = 'persisted-note';
    state.currentNoteId = noteId;
    state.currentHref = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=persisted`;
    state.tabState = {
      tabCount: 4,
      limit: 2,
      cursor: 1,
      used: [0, 0, 0, 0],
    };
    state.detailLinkState = {
      activeTabIndex: 1,
      openByLinks: true,
      activeFailed: false,
      activeByTab: {
        '1': {
          tabIndex: 1,
          noteId,
          href: state.currentHref,
          link: { noteId, noteUrl: state.currentHref },
          status: 'paused',
          failed: false,
          completed: false,
          paused: true,
        },
      },
    };

    const commentsPath = path.join(tmpRoot, 'xiaohongshu', 'debug', 'deepseek', noteId, 'comments.jsonl');
    await fs.mkdir(path.dirname(commentsPath), { recursive: true });
    await fs.writeFile(
      commentsPath,
      [
        JSON.stringify({
          noteId,
          commentId: 'persist-c1',
          userName: 'alice',
          userId: 'u1',
          content: 'same-comment-one',
          level: 0,
        }),
        JSON.stringify({
          noteId,
          commentId: 'persist-c2',
          userName: 'bob',
          userId: 'u2',
          content: 'same-comment-two',
          level: 0,
        }),
      ].join('\n') + '\n',
      'utf8',
    );

    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId: budgetProfileId,
      params: {
        tabCount: 4,
        commentBudget: 2,
        commentsLimit: 0,
        maxRounds: 1,
        persistComments: true,
        doLikes: false,
        env: 'debug',
        keyword: 'deepseek',
        outputRoot: tmpRoot,
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: noteId,
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => {},
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readVisibleCommentTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.comment-item' }),
          readVisibleCommentTargets: async () => ({ found: true, comments: [] }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 30 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.note-scroller' }),
          readCommentsSnapshot: async () => ({
            detailVisible: true,
            hasCommentsContext: true,
            expectedCommentsCount: 2,
            collectability: { visibleTextCount: 2 },
            scroll: { top: 240, clientHeight: 620, scrollHeight: 620, atBottom: true, atTop: false, selector: '.note-scroller' },
            comments: [
              { commentId: 'persist-c1', author: 'alice', content: 'same-comment-one', index: 1 },
              { commentId: 'persist-c2', author: 'bob', content: 'same-comment-two', index: 2 },
            ],
          }),
          mergeCommentsJsonl: async () => ({ filePath: commentsPath }),
          writeCommentsMd: async () => ({ filePath: commentsPath.replace(/\.jsonl$/, '.md') }),
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.commentsAdded, 0);
    assert.equal(result.data?.paused, false);
    assert.equal(result.data?.completed, true);
    assert.equal(result.data?.exitReason, 'reached_bottom');
    assert.equal(result.data?.tabBudget?.used, 0);
    assert.equal(state.tabState?.used?.[0], 0);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('re-reads visible expand-reply targets after each click so stale coordinates cannot drift into media', async () => {
    const clicks = [];
    let reads = 0;
    const result = await harvestOps.executeExpandRepliesOperation({
      profileId: budgetProfileId,
      context: {
        event: {
          elements: [
            {
              visible: true,
              textSnippet: '展开 2 条回复',
              classes: ['show-more'],
              selector: '.show-more',
              rect: { left: 100, top: 200, width: 80, height: 24 },
              path: 'initial-1',
            },
            {
              visible: true,
              textSnippet: '展开 1 条回复',
              classes: ['show-more'],
              selector: '.show-more',
              rect: { left: 100, top: 260, width: 80, height: 24 },
              path: 'initial-2',
            },
          ],
        },
        testingOverrides: {
          readExpandReplyTargets: async () => {
            reads += 1;
            if (reads === 1) {
              return {
                found: true,
                targets: [
                  {
                    text: '展开 2 条回复',
                    rect: { left: 100, top: 200, width: 80, height: 24 },
                    center: { x: 140, y: 212 },
                  },
                  {
                    text: '展开 1 条回复',
                    rect: { left: 100, top: 260, width: 80, height: 24 },
                    center: { x: 140, y: 272 },
                  },
                ],
              };
            }
            if (reads === 2) {
              return {
                found: true,
                targets: [
                  {
                    text: '展开 1 条回复',
                    rect: { left: 110, top: 420, width: 90, height: 24 },
                    center: { x: 155, y: 432 },
                  },
                ],
              };
            }
            return { found: false, targets: [] };
          },
          clickPoint: async (_profileId, center) => {
            clicks.push(center);
          },
          sleep: async () => {},
        },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(clicks, [
      { x: 140, y: 212 },
      { x: 155, y: 432 },
    ]);
    assert.equal(result.data?.expanded, 2);
    assert.ok(reads >= 2);
  });

  it('runs expand replies on every harvest round and aggregates show-more diagnostics across passes', async () => {
    const profileId = 'expand-loop-profile';
    const state = getProfileState(profileId);
    state.currentNoteId = 'loop-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/loop-note?xsec_token=loop';
    const clicks = [];
    const expandTargetSets = [
      [
        {
          text: '展开 4 条回复',
          rect: { left: 10, top: 20, width: 80, height: 20 },
          center: { x: 50, y: 30 },
        },
      ],
      [],
      [
        {
          text: '展开 2 条回复',
          rect: { left: 12, top: 60, width: 80, height: 20 },
          center: { x: 52, y: 70 },
        },
      ],
      [],
    ];
    let expandReadIndex = 0;
    let snapshotReadIndex = 0;
    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId,
      params: {
        tabCount: 1,
        commentBudget: 0,
        commentsLimit: 0,
        maxRounds: 3,
        persistComments: false,
        doLikes: false,
        adaptiveMaxRounds: false,
        scrollDelayMinMs: 1,
        scrollDelayMaxMs: 1,
        settleMinMs: 1,
        settleMaxMs: 1,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'loop-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async (_profileId, center) => {
            clicks.push(center);
          },
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readVisibleCommentTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.comment-item' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 20, y: 20 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({ found: true, center: { x: 80, y: 120 }, selector: '.note-scroller' }),
          readExpandReplyTargets: async () => ({
            found: true,
            targets: expandTargetSets[Math.min(expandReadIndex++, expandTargetSets.length - 1)],
          }),
          readCommentsSnapshot: async () => {
            snapshotReadIndex += 1;
            if (snapshotReadIndex === 1) {
              return {
                detailVisible: true,
                hasCommentsContext: true,
                expectedCommentsCount: 10,
                collectability: { visibleTextCount: 1 },
                scroll: { atBottom: false, selector: '.note-scroller', clientHeight: 900 },
                comments: [
                  { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
                ],
              };
            }
            if (snapshotReadIndex === 2) {
              return {
                detailVisible: true,
                hasCommentsContext: true,
                expectedCommentsCount: 10,
                collectability: { visibleTextCount: 2 },
                scroll: { atBottom: false, selector: '.note-scroller', clientHeight: 900 },
                comments: [
                  { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
                  { commentId: 'c-2', author: 'b', content: 'two', index: 2 },
                ],
              };
            }
            return {
              detailVisible: true,
              hasCommentsContext: true,
              expectedCommentsCount: 10,
              collectability: { visibleTextCount: 3 },
              scroll: { atBottom: true, selector: '.note-scroller', clientHeight: 900 },
              comments: [
                { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
                { commentId: 'c-2', author: 'b', content: 'two', index: 2 },
                { commentId: 'c-3', author: 'c', content: 'three', index: 3 },
              ],
            };
          },
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
          readLocation: async () => state.currentHref,
        },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(clicks, [
      { x: 80, y: 120 },
      { x: 50, y: 30 },
      { x: 52, y: 70 },
      { x: 80, y: 120 },
    ]);
    assert.equal(result.data?.showMore?.passes, 2);
    assert.equal(result.data?.showMore?.clicks, 2);
    assert.equal(result.data?.showMore?.distinctSeen, 2);
    assert.deepEqual(result.data?.showMore?.textsSample, ['展开 4 条回复', '展开 2 条回复']);
    assert.equal(result.data?.showMore?.clickTimeline.length, 2);
    assert.deepEqual(result.data?.showMore?.clickTimeline.map((item) => item.pass), [1, 1]);
  });

  it('reanchors to the scroll container after expand replies changes the DOM so scroll does not keep using a stale comment item anchor', async () => {
    const profileId = 'expand-reanchor-profile';
    const state = getProfileState(profileId);
    state.currentNoteId = 'reanchor-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/reanchor-note?xsec_token=reanchor';

    const clicks = [];
    const scrollCalls = [];
    let snapshotReadIndex = 0;

    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId,
      params: {
        tabCount: 1,
        commentBudget: 0,
        commentsLimit: 0,
        maxRounds: 2,
        persistComments: false,
        doLikes: false,
        adaptiveMaxRounds: false,
        scrollDelayMinMs: 1,
        scrollDelayMaxMs: 1,
        settleMinMs: 1,
        settleMaxMs: 1,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'reanchor-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async (_profileId, center) => {
            clicks.push(center);
          },
          scrollBySelector: async (_profileId, selector, options) => {
            scrollCalls.push({ selector, focusTarget: options.focusTarget });
          },
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 32 }, selector: '.total' }),
          readExpandReplyTargets: async () => ({
            found: true,
            targets: snapshotReadIndex === 0
              ? [{ text: '展开 4 条回复', rect: { left: 120, top: 160, width: 80, height: 24 }, center: { x: 160, y: 172 } }]
              : [],
          }),
          readCommentScrollContainerTarget: async () => ({
            found: true,
            selector: '.note-scroller',
            rect: { left: 300, top: 220, width: 320, height: 520 },
            center: { x: 460, y: 260 },
          }),
          readVisibleCommentTarget: async () => ({
            found: true,
            selector: '.comment-item',
            rect: snapshotReadIndex === 0
              ? { left: 80, top: 180, width: 220, height: 72 }
              : { left: 18, top: 28, width: 220, height: 72 },
            center: snapshotReadIndex === 0
              ? { x: 190, y: 212 }
              : { x: 128, y: 64 },
          }),
          readCommentsSnapshot: async () => {
            snapshotReadIndex += 1;
            if (snapshotReadIndex === 1) {
              return {
                detailVisible: true,
                hasCommentsContext: true,
                expectedCommentsCount: 6,
                collectability: { visibleTextCount: 1 },
                scroll: { atBottom: false, selector: '.note-scroller', clientHeight: 900 },
                comments: [
                  { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
                ],
              };
            }
            return {
              detailVisible: true,
              hasCommentsContext: true,
              expectedCommentsCount: 6,
              collectability: { visibleTextCount: 2 },
              scroll: { atBottom: true, selector: '.note-scroller', clientHeight: 900 },
              comments: [
                { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
                { commentId: 'c-2', author: 'b', content: 'two', index: 2 },
              ],
            };
          },
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
          readLocation: async () => state.currentHref,
        },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(clicks.slice(0, 2), [
      { x: 460, y: 260 },
      { x: 160, y: 172 },
    ]);
    assert.ok(clicks.some((point) => point.x === 460 && point.y === 260));
    assert.ok(!clicks.some((point) => point.x === 190 && point.y === 212));
    assert.equal(scrollCalls.length, 1);
    assert.equal(scrollCalls[0].selector, '.note-scroller');
    assert.deepEqual(scrollCalls[0].focusTarget?.center, { x: 460, y: 260 });
    assert.equal(result.data?.showMore?.clicks, 1);
  });

  it('reports the actual clicked reanchor target as comment_scroll while keeping detected visible_comment diagnostics', async () => {
    const profileId = 'expand-reanchor-logging-profile';
    const state = getProfileState(profileId);
    state.currentNoteId = 'reanchor-log-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/reanchor-log-note?xsec_token=reanchor-log';

    const progress = [];
    let snapshotReadIndex = 0;

    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId,
      params: {
        tabCount: 1,
        commentBudget: 0,
        commentsLimit: 0,
        maxRounds: 2,
        persistComments: false,
        doLikes: false,
        adaptiveMaxRounds: false,
        scrollDelayMinMs: 1,
        scrollDelayMaxMs: 1,
        settleMinMs: 1,
        settleMaxMs: 1,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        emitProgress: (entry) => progress.push(entry),
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'reanchor-log-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => {},
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 32 }, selector: '.total' }),
          readExpandReplyTargets: async () => ({
            found: true,
            targets: snapshotReadIndex === 0
              ? [{ text: '展开 4 条回复', rect: { left: 120, top: 160, width: 80, height: 24 }, center: { x: 160, y: 172 } }]
              : [],
          }),
          readCommentScrollContainerTarget: async () => ({
            found: true,
            selector: '.note-scroller',
            rect: { left: 300, top: 220, width: 320, height: 520 },
            center: { x: 460, y: 260 },
          }),
          readVisibleCommentTarget: async () => ({
            found: true,
            selector: '.comment-item',
            rect: snapshotReadIndex === 0
              ? { left: 80, top: 180, width: 220, height: 72 }
              : { left: 18, top: 28, width: 220, height: 72 },
            center: snapshotReadIndex === 0
              ? { x: 190, y: 212 }
              : { x: 128, y: 64 },
          }),
          readCommentsSnapshot: async () => {
            snapshotReadIndex += 1;
            if (snapshotReadIndex === 1) {
              return {
                detailVisible: true,
                hasCommentsContext: true,
                expectedCommentsCount: 6,
                collectability: { visibleTextCount: 1 },
                scroll: { atBottom: false, selector: '.note-scroller', clientHeight: 900 },
                comments: [
                  { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
                ],
              };
            }
            return {
              detailVisible: true,
              hasCommentsContext: true,
              expectedCommentsCount: 6,
              collectability: { visibleTextCount: 2 },
              scroll: { atBottom: true, selector: '.note-scroller', clientHeight: 900 },
              comments: [
                { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
                { commentId: 'c-2', author: 'b', content: 'two', index: 2 },
              ],
            };
          },
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
          readLocation: async () => state.currentHref,
        },
      },
    });

    assert.equal(result.ok, true);
    const reanchor = progress.find((entry) => entry?.kind === 'after_expand_reanchor');
    assert.ok(reanchor);
    assert.equal(reanchor?.focusSource, 'comment_scroll');
    assert.equal(reanchor?.focusSelector, '.note-scroller');
    assert.equal(reanchor?.detectedFocusSource, 'visible_comment');
    assert.equal(reanchor?.detectedFocusSelector, '.comment-item');
  });

  it('clicks the comment scroll container instead of a visible comment item during initial focus', async () => {
    const profileId = 'comment-scroll-focus-profile';
    const state = getProfileState(profileId);
    state.currentNoteId = 'scroll-focus-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/scroll-focus-note?xsec_token=scroll';

    const clicks = [];

    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId,
      params: {
        tabCount: 1,
        commentBudget: 0,
        commentsLimit: 0,
        maxRounds: 1,
        persistComments: false,
        doLikes: false,
        adaptiveMaxRounds: false,
        scrollDelayMinMs: 1,
        scrollDelayMaxMs: 1,
        settleMinMs: 1,
        settleMaxMs: 1,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'scroll-focus-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async (_profileId, center) => {
            clicks.push(center);
          },
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 32 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({
            found: true,
            selector: '.note-scroller',
            rect: { left: 300, top: 220, width: 320, height: 520 },
            center: { x: 460, y: 260 },
          }),
          readVisibleCommentTarget: async () => ({
            found: true,
            selector: '.comment-item',
            rect: { left: 80, top: 180, width: 220, height: 72 },
            center: { x: 190, y: 212 },
          }),
          readExpandReplyTargets: async () => ({ found: false, targets: [] }),
          readCommentsSnapshot: async () => ({
            detailVisible: true,
            hasCommentsContext: true,
            expectedCommentsCount: 2,
            collectability: { visibleTextCount: 2 },
            scroll: { atBottom: true, selector: '.note-scroller', clientHeight: 900 },
            comments: [
              { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
              { commentId: 'c-2', author: 'b', content: 'two', index: 2 },
            ],
          }),
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(clicks, [{ x: 460, y: 260 }]);
  });

  it('does not click the comment entry again when comment total and scroll container already exist but visible comments have not rendered yet', async () => {
    const profileId = 'comment-entry-skip-profile';
    const state = getProfileState(profileId);
    state.currentNoteId = 'entry-skip-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/entry-skip-note?xsec_token=entry-skip';

    const clicks = [];
    const progress = [];

    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId,
      params: {
        tabCount: 1,
        commentBudget: 0,
        commentsLimit: 0,
        maxRounds: 1,
        persistComments: false,
        doLikes: false,
        adaptiveMaxRounds: false,
        scrollDelayMinMs: 1,
        scrollDelayMaxMs: 1,
        settleMinMs: 1,
        settleMaxMs: 1,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        emitProgress: (entry) => progress.push(entry),
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'entry-skip-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async (_profileId, center) => {
            clicks.push(center);
          },
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.chat-wrapper .count' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 32 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({
            found: true,
            selector: '.note-scroller',
            rect: { left: 300, top: 220, width: 320, height: 520 },
            center: { x: 460, y: 260 },
          }),
          readVisibleCommentTarget: async () => ({ found: false, reason: 'no_visible_comment' }),
          readExpandReplyTargets: async () => ({ found: false, targets: [] }),
          readCommentsSnapshot: async () => ({
            detailVisible: true,
            hasCommentsContext: true,
            expectedCommentsCount: 2,
            collectability: { visibleTextCount: 2 },
            scroll: { atBottom: true, selector: '.note-scroller', clientHeight: 900 },
            comments: [
              { commentId: 'c-1', author: 'a', content: 'one', index: 1 },
              { commentId: 'c-2', author: 'b', content: 'two', index: 2 },
            ],
          }),
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.exitReason, 'reached_bottom');
    assert.deepEqual(clicks, [{ x: 460, y: 260 }]);
    assert.ok(progress.some((entry) => entry?.kind === 'focus_comment_context_entry_skip' && entry?.reason === 'existing_strong_comment_context'));
    assert.equal(progress.some((entry) => entry?.kind === 'focus_comment_context_before_entry_click'), false);
  });

  it('exits with scroll_stalled_after_recovery when visible comments churn without growth and scroll anchor does not move', async () => {
    const profileId = 'comments-stagnation-profile';
    const state = getProfileState(profileId);
    state.currentNoteId = 'stagnation-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/stagnation-note?xsec_token=stagnation';

    const baseComments = Array.from({ length: 20 }, (_, index) => ({
      commentId: `c-${index + 1}`,
      author: `u-${index + 1}`,
      content: `content-${index + 1}`,
      index: index + 1,
    }));
    let snapshotReads = 0;
    const readCommentsSnapshot = async () => {
      snapshotReads += 1;
      const churned = snapshotReads % 2 === 0
        ? [...baseComments.slice(1), baseComments[0]]
        : [...baseComments];
      return {
        detailVisible: true,
        hasCommentsContext: true,
        expectedCommentsCount: 28,
        collectability: { visibleTextCount: churned.length },
        scroll: { top: 120, atBottom: false, selector: '.note-scroller', clientHeight: 900, scrollHeight: 2200 },
        comments: churned,
      };
    };

    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId,
      params: {
        tabCount: 1,
        commentBudget: 0,
        commentsLimit: 0,
        maxRounds: 12,
        persistComments: false,
        doLikes: false,
        adaptiveMaxRounds: false,
        recoveryNoProgressRounds: 3,
        maxRecoveries: 1,
        stagnationExitRounds: 2,
        scrollDelayMinMs: 1,
        scrollDelayMaxMs: 1,
        settleMinMs: 1,
        settleMaxMs: 1,
        noChangeTimeoutMs: 30000,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'stagnation-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => {},
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 32 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({
            found: true,
            selector: '.note-scroller',
            rect: { left: 300, top: 220, width: 320, height: 520 },
            center: { x: 460, y: 260 },
          }),
          readVisibleCommentTarget: async () => ({
            found: true,
            selector: '.comment-item',
            rect: { left: 80, top: 180, width: 220, height: 72 },
            center: { x: 190, y: 212 },
          }),
          readExpandReplyTargets: async () => ({ found: false, targets: [] }),
          readCommentsSnapshot,
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
          readLocation: async () => state.currentHref,
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.exitReason, 'scroll_stalled_after_recovery');
    assert.ok(snapshotReads >= 3);
  });

  it('keeps harvesting when scroll anchor advances even without new comments, and exits on reached_bottom instead of stalled', async () => {
    const profileId = 'comments-scroll-advance-profile';
    const state = getProfileState(profileId);
    state.currentNoteId = 'scroll-advance-note';
    state.currentHref = 'https://www.xiaohongshu.com/explore/scroll-advance-note?xsec_token=scroll-advance';

    const baseComments = Array.from({ length: 12 }, (_, index) => ({
      commentId: `sc-${index + 1}`,
      author: `sa-${index + 1}`,
      content: `stable-content-${index + 1}`,
      index: index + 1,
    }));
    let snapshotReads = 0;
    const scrollTops = [120, 360, 760, 1060];
    const readCommentsSnapshot = async () => {
      const currentIndex = Math.min(snapshotReads, scrollTops.length - 1);
      const top = scrollTops[currentIndex];
      snapshotReads += 1;
      return {
        detailVisible: true,
        hasCommentsContext: true,
        expectedCommentsCount: 40,
        collectability: { visibleTextCount: baseComments.length },
        scroll: {
          top,
          atBottom: currentIndex === scrollTops.length - 1,
          selector: '.note-scroller',
          clientHeight: 900,
          scrollHeight: 2200,
        },
        comments: [...baseComments],
      };
    };

    const result = await harvestOps.executeCommentsHarvestOperation({
      profileId,
      params: {
        tabCount: 1,
        commentBudget: 0,
        commentsLimit: 0,
        maxRounds: 8,
        persistComments: false,
        doLikes: false,
        adaptiveMaxRounds: false,
        recoveryNoProgressRounds: 2,
        maxRecoveries: 1,
        stagnationExitRounds: 2,
        scrollDelayMinMs: 1,
        scrollDelayMaxMs: 1,
        settleMinMs: 1,
        settleMaxMs: 1,
        noChangeTimeoutMs: 30000,
        env: 'debug',
        keyword: 'deepseek',
      },
      context: {
        testingOverrides: {
          readDetailSnapshot: async () => ({
            noteIdFromUrl: 'scroll-advance-note',
            commentsContextAvailable: true,
            textPresent: true,
            imageCount: 0,
            videoPresent: false,
          }),
          readDetailState: async () => ({ href: state.currentHref, checkpoint: 'comments_ready' }),
          pressKey: async () => {},
          sleep: async () => {},
          clearVisualHighlight: async () => {},
          highlightVisualTarget: async () => {},
          clickPoint: async () => {},
          scrollBySelector: async () => {},
          readCommentEntryPoint: async () => ({ found: true, center: { x: 50, y: 60 }, selector: '.comments-entry' }),
          readCommentTotalTarget: async () => ({ found: true, center: { x: 24, y: 32 }, selector: '.total' }),
          readCommentScrollContainerTarget: async () => ({
            found: true,
            selector: '.note-scroller',
            rect: { left: 300, top: 220, width: 320, height: 520 },
            center: { x: 460, y: 260 },
          }),
          readVisibleCommentTarget: async () => ({
            found: true,
            selector: '.comment-item',
            rect: { left: 80, top: 180, width: 220, height: 72 },
            center: { x: 190, y: 212 },
          }),
          readExpandReplyTargets: async () => ({ found: false, targets: [] }),
          readCommentsSnapshot,
          appendLikeStateRows: async () => ({ ok: true }),
          writeLikeSummary: async () => ({ ok: true, filePath: '/tmp/likes.json' }),
          mergeCommentsJsonl: async () => ({ filePath: '/tmp/comments.jsonl' }),
          writeCommentsMd: async () => ({ filePath: '/tmp/comments.md' }),
          readLocation: async () => state.currentHref,
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.exitReason, 'reached_bottom');
    assert.ok(snapshotReads >= 3);
  });
});
