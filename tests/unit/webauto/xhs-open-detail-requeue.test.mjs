import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as detailFlowOps from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs';
import { getProfileState } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/state.mjs';
import { readActiveLinkForTab } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/tab-state.mjs';

const profileId = 'xhs-open-detail-requeue';

describe('xhs open detail link failure recovery', () => {
  beforeEach(() => {
    const state = getProfileState(profileId);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, {
      keyword: null,
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
  });

  it('requeues navigation-failed safe link and continues with the next link in the same open operation', async (t) => {
    const state = getProfileState(profileId);
    state.linksCachePath = '/tmp/fake-links.jsonl';
    state.linksCache = [
      { noteId: 'bad-note', noteUrl: 'https://www.xiaohongshu.com/search_result/bad-note?xsec_token=bad' },
      { noteId: 'good-note', noteUrl: 'https://www.xiaohongshu.com/search_result/good-note?xsec_token=good' },
    ];

    const gotoCalls = [];
    const locationReads = ['https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend'];
    let detailVisibleReads = 0;
    let openedGood = false;

    const testingOverrides = {
      readGuardSignal: async () => ({ hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/explore' }),
      requestGatePermit: async () => ({ ok: true, allowed: true, waitMs: 0 }),
      callAPI: async (action, payload) => {
        assert.equal(action, 'goto');
        const targetUrl = String(payload?.url || '');
        gotoCalls.push(targetUrl);
        if (targetUrl.includes('/explore/bad-note')) {
          throw new Error('page.goto: NS_ERROR_UNKNOWN_HOST');
        }
        openedGood = true;
        return { ok: true };
      },
      readLocation: async () => {
        if (openedGood) return 'https://www.xiaohongshu.com/explore/good-note?xsec_token=good';
        return locationReads.shift() || 'https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend';
      },
      sleep: async () => {},
      isDetailVisible: async () => {
      detailVisibleReads += 1;
      if (!openedGood) return { detailVisible: false };
      return { detailVisible: true };
      },
      readDetailSnapshot: async () => {
        if (!openedGood) return null;
        return {
          href: 'https://www.xiaohongshu.com/explore/good-note?xsec_token=good',
          noteIdFromUrl: 'good-note',
          commentsContextAvailable: true,
        };
      },
    };

    const result = await detailFlowOps.executeOpenDetailOperation({
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
      context: { testingOverrides },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.noteId, 'good-note');
    assert.deepEqual(gotoCalls, [
      'https://www.xiaohongshu.com/explore/bad-note?xsec_token=bad',
      'https://www.xiaohongshu.com/explore/good-note?xsec_token=good',
    ]);
    assert.equal(state.detailLinkState?.lastFailureCode, 'OPEN_DETAIL_NAVIGATION_FAILED');
    assert.equal(state.detailLinkState?.lastRequeue?.requeued, true);
    assert.equal(state.detailLinkState?.lastRequeue?.key, 'bad-note');
    assert.equal(state.detailLinkState?.lastOpenedNoteId, 'good-note');
    assert.equal(readActiveLinkForTab(state, 1)?.link?.noteId, 'good-note');
    assert.equal(state.linksState?.queue?.[0]?.link?.noteId, 'bad-note');
    assert.ok(detailVisibleReads >= 2);
  });

  it('stops immediately on explicit login redirect instead of requeueing every safe link', async () => {
    const state = getProfileState(profileId);
    state.linksCachePath = '/tmp/fake-links.jsonl';
    state.linksCache = [
      { noteId: 'login-note', noteUrl: 'https://www.xiaohongshu.com/search_result/login-note?xsec_token=guard' },
      { noteId: 'next-note', noteUrl: 'https://www.xiaohongshu.com/search_result/next-note?xsec_token=next' },
    ];

    const gotoCalls = [];
    const result = await detailFlowOps.executeOpenDetailOperation({
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
          readGuardSignal: async () => ({ hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/explore' }),
          requestGatePermit: async () => ({ ok: true, allowed: true, waitMs: 0 }),
          callAPI: async (action, payload) => {
            assert.equal(action, 'goto');
            gotoCalls.push(String(payload?.url || ''));
            return { ok: true };
          },
          readLocation: async () => 'https://www.xiaohongshu.com/login?redirectPath=https%3A%2F%2Fwww.xiaohongshu.com%2Fexplore%2Flogin-note%3Fxsec_token%3Dguard',
          sleep: async () => {},
          isDetailVisible: async () => ({ detailVisible: false }),
          readDetailSnapshot: async () => null,
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'LOGIN_GUARD_DETECTED');
    assert.deepEqual(gotoCalls, [
      'https://www.xiaohongshu.com/explore/login-note?xsec_token=guard',
    ]);
    assert.equal(readActiveLinkForTab(state, 1)?.link, undefined);
    assert.equal(state.linksState?.queue?.[0]?.link?.noteId, undefined);
    assert.equal(state.detailLinkState?.lastFailureCode, 'LOGIN_GUARD_DETECTED');
  });

  it('requeues open-link gate rejected safe link and continues with the next link in the same open operation', async () => {
    const state = getProfileState(profileId);
    state.linksCachePath = '/tmp/fake-links.jsonl';
    state.linksCache = [
      { noteId: 'blocked-note', noteUrl: 'https://www.xiaohongshu.com/search_result/blocked-note?xsec_token=blocked' },
      { noteId: 'good-note', noteUrl: 'https://www.xiaohongshu.com/search_result/good-note?xsec_token=good' },
    ];

    const gotoCalls = [];
    let openedGood = false;

    const result = await detailFlowOps.executeOpenDetailOperation({
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
          readGuardSignal: async () => ({ hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/explore' }),
          requestGatePermit: async (payload) => {
            if (String(payload?.resourceKey || '') === 'blocked-note') {
              const error = new Error('OPEN_LINK_GATE_REJECTED');
              error.code = 'OPEN_LINK_GATE_REJECTED';
              error.response = { ok: false, deny: 'consecutive_same_resource_limit', allowed: false };
              throw error;
            }
            return { ok: true, allowed: true, waitMs: 0 };
          },
          callAPI: async (action, payload) => {
            assert.equal(action, 'goto');
            gotoCalls.push(String(payload?.url || ''));
            openedGood = true;
            return { ok: true };
          },
          readLocation: async () => {
            if (openedGood) return 'https://www.xiaohongshu.com/explore/good-note?xsec_token=good';
            return 'https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend';
          },
          sleep: async () => {},
          isDetailVisible: async () => ({ detailVisible: openedGood }),
          readDetailSnapshot: async () => {
            if (!openedGood) return null;
            return {
              href: 'https://www.xiaohongshu.com/explore/good-note?xsec_token=good',
              noteIdFromUrl: 'good-note',
              commentsContextAvailable: true,
            };
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.noteId, 'good-note');
    assert.deepEqual(gotoCalls, [
      'https://www.xiaohongshu.com/explore/good-note?xsec_token=good',
    ]);
    assert.equal(state.detailLinkState?.lastFailureCode, 'OPEN_DETAIL_NAVIGATION_FAILED');
    assert.equal(state.detailLinkState?.lastRequeue?.requeued, true);
    assert.equal(state.detailLinkState?.lastRequeue?.key, 'blocked-note');
    assert.equal(state.linksState?.queue?.[0]?.link?.noteId, 'blocked-note');
    assert.equal(readActiveLinkForTab(state, 1)?.link?.noteId, 'good-note');
  });

  it('stops immediately on website-login risk redirect instead of requeueing', async () => {
    const state = getProfileState(profileId);
    state.linksCachePath = '/tmp/fake-links.jsonl';
    state.linksCache = [
      { noteId: 'risk-note', noteUrl: 'https://www.xiaohongshu.com/search_result/risk-note?xsec_token=risk' },
      { noteId: 'next-note', noteUrl: 'https://www.xiaohongshu.com/search_result/next-note?xsec_token=next' },
    ];

    const gotoCalls = [];
    const result = await detailFlowOps.executeOpenDetailOperation({
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
          readGuardSignal: async () => ({ hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/explore' }),
          requestGatePermit: async () => ({ ok: true, allowed: true, waitMs: 0 }),
          callAPI: async (action, payload) => {
            assert.equal(action, 'goto');
            gotoCalls.push(String(payload?.url || ''));
            return { ok: true };
          },
          readLocation: async () => 'https://www.xiaohongshu.com/website-login/error?appId=xhs-pc-web&redirectPath=https://www.xiaohongshu.com/explore/risk-note?xsec_token=risk&httpStatus=461&verifyType=400',
          sleep: async () => {},
          isDetailVisible: async () => ({ detailVisible: false }),
          readDetailSnapshot: async () => null,
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'RISK_CONTROL_DETECTED');
    assert.deepEqual(gotoCalls, [
      'https://www.xiaohongshu.com/explore/risk-note?xsec_token=risk',
    ]);
    assert.equal(readActiveLinkForTab(state, 1)?.link, undefined);
    assert.equal(state.linksState?.queue?.[0]?.link?.noteId, undefined);
    assert.equal(state.detailLinkState?.lastFailureCode, 'RISK_CONTROL_DETECTED');
  });
});
