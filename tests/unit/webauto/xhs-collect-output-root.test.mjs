import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeCollectLinksOperation, executeSubmitSearchOperation } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs';
import { getProfileState } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/state.mjs';
import { buildXhsCollectAutoscript } from '../../../modules/camo-runtime/src/autoscript/xhs-collect-template.mjs';

const profileId = 'xhs-collect-output-root';

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

describe('xhs collect output root persistence', () => {
  it('uses explicit outputRoot when resolving fresh collect persistence path', async () => {
    const state = resetState();
    state.keyword = 'deepseek';
    state.env = 'debug';

    const result = await executeCollectLinksOperation({
      profileId,
      params: {
        keyword: 'deepseek',
        env: 'debug',
        outputRoot: '/tmp/xhs-fresh-links-check',
        maxNotes: 5,
      },
      context: {
        testingOverrides: {
          readJsonlRows: async () => ([
            { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/search_result/note-1?xsec_token=1' },
            { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/search_result/note-2?xsec_token=2' },
            { noteId: 'note-3', noteUrl: 'https://www.xiaohongshu.com/search_result/note-3?xsec_token=3' },
            { noteId: 'note-4', noteUrl: 'https://www.xiaohongshu.com/search_result/note-4?xsec_token=4' },
            { noteId: 'note-5', noteUrl: 'https://www.xiaohongshu.com/search_result/note-5?xsec_token=5' },
          ]),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.collectCount, 5);
    assert.equal(result.data.linksPath, '/tmp/xhs-fresh-links-check/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl');
    assert.equal(state.outputRoot, '/tmp/xhs-fresh-links-check');
  });

  it('uses sharedHarvestPath as the collect/detail handoff path when explicitly configured', async () => {
    const state = resetState();
    state.keyword = 'deepseek';
    state.env = 'debug';

    const result = await executeCollectLinksOperation({
      profileId,
      params: {
        keyword: 'deepseek',
        env: 'debug',
        outputRoot: '/tmp/xhs-fresh-links-check',
        sharedHarvestPath: '/tmp/xhs-phase-handoff/custom-links.jsonl',
        maxNotes: 2,
      },
      context: {
        testingOverrides: {
          readJsonlRows: async () => ([
            { noteId: 'note-1', noteUrl: 'https://www.xiaohongshu.com/search_result/note-1?xsec_token=1' },
            { noteId: 'note-2', noteUrl: 'https://www.xiaohongshu.com/search_result/note-2?xsec_token=2' },
          ]),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.collectCount, 2);
    assert.equal(result.data.linksPath, '/tmp/xhs-phase-handoff/custom-links.jsonl');
    assert.equal(state.outputRoot, '/tmp/xhs-fresh-links-check');
  });

  it('submit_search persists env/outputRoot into profile state for downstream collect/detail ops', async () => {
    resetState();

    const result = await executeSubmitSearchOperation({
      profileId,
      params: {
        keyword: 'deepseek',
        env: 'debug',
        outputRoot: '/tmp/xhs-submit-root',
        actionDelayMinMs: 0,
        actionDelayMaxMs: 0,
        settleMinMs: 0,
        settleMaxMs: 0,
        searchReadyPollMinMs: 0,
        searchReadyPollMaxMs: 0,
      },
      context: {
        testingOverrides: {
          readGuardSignal: async () => ({ hasLoginGuard: false, hasRiskGuard: false, url: 'https://www.xiaohongshu.com/search_result?keyword=deepseek' }),
          readSearchInput: async () => ({ ok: true, center: { x: 10, y: 20 }, value: '' }),
          clickPoint: async () => {},
          sleepRandom: async () => {},
          clearAndType: async () => {},
          readLocation: async () => 'https://www.xiaohongshu.com/search_result?keyword=deepseek',
          readCandidateWindow: async () => ({ total: 0, window: [] }),
          resolveSelectorTarget: async () => ({ center: { x: 20, y: 30 }, selector: '.input-button .search-icon' }),
          pressKey: async () => {},
          readSearchViewportReady: async () => ({ readySelector: '.search-result-list', visibleNoteCount: 5, href: 'https://www.xiaohongshu.com/search_result?keyword=deepseek' }),
        },
      },
    });

    const state = getProfileState(profileId);
    assert.equal(result.ok, true);
    assert.equal(state.keyword, 'deepseek');
    assert.equal(state.env, 'debug');
    assert.equal(state.outputRoot, '/tmp/xhs-submit-root');
    assert.equal(state.downloadRoot, '/tmp/xhs-submit-root');
    assert.equal(state.rootDir, '/tmp/xhs-submit-root');
  });
});

describe('xhs collect subscriptions', () => {
  it('restricts search_result_item subscription to search_result pages', () => {
    const script = buildXhsCollectAutoscript({
      profileId: 'xhs-collect-subscription',
      keyword: 'deepseek',
      outputRoot: '/tmp/fresh-links',
      stage: 'links',
    });

    const sub = (script.subscriptions || []).find((item) => item?.id === 'search_result_item');
    assert.equal(sub?.pageUrlIncludes, undefined);
    assert.match(String(sub?.selector || ''), /search-result/);
    assert.match(String(sub?.selector || ''), /feeds-container/);
  });

  it('keeps collect operations gated by submit_search to avoid homepage false triggers', () => {
    const script = buildXhsCollectAutoscript({
      profileId: 'xhs-collect-deps',
      keyword: 'deepseek',
      outputRoot: '/tmp/fresh-links',
      stage: 'links',
    });

    const collectOps = (script.operations || []).filter((item) =>
      ['verify_collect_subscriptions', 'collect_links'].includes(item?.id),
    );

    assert.equal(collectOps.length, 2);
    for (const op of collectOps) {
      assert.deepEqual(op.dependsOn, ['submit_search']);
    }
  });
});
