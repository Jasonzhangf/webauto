import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeSubmitSearchOperation } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs';
import { executeOpenDetailOperation } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs';
import { getProfileState } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/state.mjs';
import { executeWaitSearchPermitOperation } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/search-gate-ops.mjs';

const profileId = 'xhs-interaction-guard';

function resetState() {
  const state = getProfileState(profileId);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, {
    keyword: null,
    env: null,
    outputRoot: null,
    downloadRoot: null,
    rootDir: null,
    currentNoteId: null,
    currentHref: null,
    lastListUrl: null,
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

describe('xhs interaction guard stops search/open and clears queues', () => {
  it('stops wait_search_permit when the same keyword is rejected by gate', async () => {
    resetState();
    await assert.rejects(
      () => executeWaitSearchPermitOperation({
        profileId,
        params: {
          keyword: 'deepseek',
          sameResourceMaxConsecutive: 3,
        },
        context: {
          testingOverrides: {
            requestGatePermit: async () => ({
              ok: true,
              allowed: false,
              deny: 'consecutive_same_resource_limit',
              consecutiveCount: 3,
            }),
          },
        },
      }),
      (error) => error?.code === 'SEARCH_GATE_REJECTED',
    );
  });

  it('stops submit_search when login guard appears before submit and clears pending queues', async () => {
    const state = resetState();
    state.linksState = {
      sourcePath: '/tmp/links.jsonl',
      queue: [{ key: 'note-1', link: { noteId: 'note-1' }, retryCount: 0 }],
      byTab: { '1': { key: 'note-1', link: { noteId: 'note-1' }, retryCount: 0, done: false } },
      completed: {},
      exhausted: {},
    };

    let guardReads = 0;
    const result = await executeSubmitSearchOperation({
      profileId,
      params: {
        keyword: 'deepseek',
        actionDelayMinMs: 0,
        actionDelayMaxMs: 0,
        settleMinMs: 0,
        settleMaxMs: 0,
        searchReadyPollMinMs: 0,
        searchReadyPollMaxMs: 0,
      },
      context: {
        testingOverrides: {
          readGuardSignal: async () => {
            guardReads += 1;
            if (guardReads >= 2) {
              return { hasLoginGuard: true, hasAccountSignal: true, accountId: 'user-1', url: 'https://www.xiaohongshu.com/explore' };
            }
            return { hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/explore' };
          },
          readSearchInput: async () => ({ ok: true, center: { x: 10, y: 20 }, value: '' }),
          clickPoint: async () => {},
          sleepRandom: async () => {},
          clearAndType: async () => {},
          readLocation: async () => 'https://www.xiaohongshu.com/explore',
          readCandidateWindow: async () => ({ total: 0, window: [] }),
          resolveSelectorTarget: async () => ({ center: { x: 20, y: 30 }, selector: '.input-button .search-icon' }),
          pressKey: async () => {},
          readSearchViewportReady: async () => ({ readySelector: '', visibleNoteCount: 0, href: 'https://www.xiaohongshu.com/explore' }),
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'LOGIN_GUARD_DETECTED');
    assert.equal(state.linksState.queue.length, 0);
    assert.deepEqual(state.linksState.byTab, {});
    assert.equal(state.guardStop?.code, 'LOGIN_GUARD_DETECTED');
  });

  it('stops open_detail when risk guard appears after goto and clears queued links', async () => {
    const state = resetState();
    state.linksCachePath = '/tmp/fake-links.jsonl';
    state.linksCache = [
      { noteId: 'risk-note', noteUrl: 'https://www.xiaohongshu.com/search_result/risk-note?xsec_token=risk' },
      { noteId: 'next-note', noteUrl: 'https://www.xiaohongshu.com/search_result/next-note?xsec_token=next' },
    ];

    let guardReads = 0;
    const result = await executeOpenDetailOperation({
      profileId,
      params: {
        mode: 'next',
        openByLinks: true,
        tabCount: 1,
        sharedHarvestPath: '/tmp/fake-links.jsonl',
        detailLinkRetryMax: 2,
        preClickDelayMinMs: 0,
        preClickDelayMaxMs: 0,
        pollDelayMinMs: 0,
        pollDelayMaxMs: 0,
        postOpenDelayMinMs: 0,
        postOpenDelayMaxMs: 0,
      },
      context: {
        testingOverrides: {
          readGuardSignal: async () => {
            guardReads += 1;
            if (guardReads >= 3) {
              return {
                hasLoginGuard: false,
                hasRiskGuard: true,
                riskUrl: true,
                url: 'https://www.xiaohongshu.com/website-login/error?httpStatus=461&verifyType=400',
              };
            }
            return { hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/explore' };
          },
          callAPI: async () => ({ ok: true }),
          readLocation: async () => 'https://www.xiaohongshu.com/website-login/error?httpStatus=461&verifyType=400',
          sleep: async () => {},
          isDetailVisible: async () => ({ detailVisible: false }),
          readDetailSnapshot: async () => null,
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'RISK_CONTROL_DETECTED');
    assert.equal(state.linksState.queue.length, 0);
    assert.deepEqual(state.linksState.byTab, {});
    assert.equal(state.guardStop?.code, 'RISK_CONTROL_DETECTED');
  });

  it('requeues and continues open_detail when the same link is rejected by open gate', async () => {
    const state = resetState();
    state.linksCachePath = '/tmp/fake-links.jsonl';
    state.linksCache = [
      { noteId: 'same-note', noteUrl: 'https://www.xiaohongshu.com/search_result/same-note?xsec_token=same' },
      { noteId: 'next-note', noteUrl: 'https://www.xiaohongshu.com/search_result/next-note?xsec_token=next' },
    ];

    let openedNext = false;

    const result = await executeOpenDetailOperation({
      profileId,
      params: {
        mode: 'next',
        openByLinks: true,
        tabCount: 1,
        sharedHarvestPath: '/tmp/fake-links.jsonl',
        openGateSameResourceMaxConsecutive: 3,
      },
      context: {
        testingOverrides: {
          readGuardSignal: async () => ({ hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/explore' }),
          requestGatePermit: async (payload) => {
            if (String(payload?.resourceKey || '') === 'same-note') {
              return {
                ok: true,
                allowed: false,
                deny: 'consecutive_same_resource_limit',
                consecutiveCount: 3,
              };
            }
            return { ok: true, allowed: true };
          },
          confirmGateUsage: async () => ({ ok: true, reason: 'confirmed' }),
          callAPI: async (_action, payload) => {
            if (String(payload?.url || '').includes('/explore/next-note')) openedNext = true;
            return { ok: true };
          },
          readLocation: async () => openedNext
            ? 'https://www.xiaohongshu.com/explore/next-note?xsec_token=next'
            : 'https://www.xiaohongshu.com/explore',
          sleep: async () => {},
          isDetailVisible: async () => ({ detailVisible: openedNext }),
          readDetailSnapshot: async () => openedNext
            ? { href: 'https://www.xiaohongshu.com/explore/next-note?xsec_token=next', noteIdFromUrl: 'next-note' }
            : null,
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.noteId, 'next-note');
    assert.equal(state.linksState.queue[0]?.link?.noteId, 'same-note');
  });
});
