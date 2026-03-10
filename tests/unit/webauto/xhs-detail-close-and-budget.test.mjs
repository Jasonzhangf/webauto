import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

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

  it('closes safe-link detail by back without goto-list homepage refresh when back succeeds', async () => {
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
    assert.equal(result.data?.method, 'back');
    assert.deepEqual(actions.map((item) => item.action), ['keyboard:press', 'page:back']);
    assert.equal(actions.some((item) => item.action === 'goto'), false);
    assert.equal(state.detailLinkState?.lastQueueOutcome?.response?.removed, true);
    assert.ok(actions.some((item) => item.action === 'page:back'));
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
    assert.equal(state.tabState?.used?.[0], 50);
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
});
