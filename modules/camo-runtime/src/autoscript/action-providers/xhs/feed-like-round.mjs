import { clickPoint, fillInputValue, pressKey, sleepRandom, waitForAnchor } from './dom-ops.mjs';
import { readSearchButton } from './search-ops.mjs';
import { resolveSearchSubmitMethod } from './utils.mjs';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitOperationProgress } from '../../shared/trace.mjs';
import { readFeedLikeCandidates } from './feed-like-candidates.mjs';
import { executeFeedLikeClick, executeFeedUnlikeClick } from './feed-like-click.mjs';
import { executeFeedLikeTabSwitch } from './feed-like-tabs.mjs';
import { handleNoFeedTargetsLike, handleNoFeedTargetsUnlike } from './feed-like-no-target.mjs';
import {
  LIKES_PER_ROUND,
  MAX_CLICK_FAILURES_PER_NOTE,
  mapFeedLikeKind,
  resolveFeedActionMode,
  resolveFeedLikeKeywords,
  resolveFeedStateKeys,
  keywordsEqual,
  readFeedWindowSignature,
  safeCallAPI,
} from './feed-like-shared.mjs';

export async function executeFeedLikeOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const actionMode = resolveFeedActionMode(params);
  const stage = actionMode === 'unlike' ? 'feed_unlike' : 'feed_like';
  const kind = (value) => mapFeedLikeKind(actionMode, value);
  const desc = (value) => mapFeedLikeKind(actionMode, value);
  const tag = (value) => mapFeedLikeKind(actionMode, value);
  const { tabStateKey, tabStatesKey, globalStateKey, processedKey, totalKey } = resolveFeedStateKeys(actionMode);

  const likesPerRound = Math.max(
    1,
    Number(
      actionMode === 'unlike'
        ? (params.unlikesPerRound ?? params.maxUnlikesPerTab ?? params.likesPerRound ?? LIKES_PER_ROUND)
        : (params.likesPerRound ?? LIKES_PER_ROUND),
    ) || LIKES_PER_ROUND,
  );
  const minTopSafePx = Math.max(60, Number(params.minTopSafePx ?? 90) || 90);
  const likeIntervalMinMs = Math.max(500, Number(params.likeIntervalMinMs ?? 1000) || 1000);
  const likeIntervalMaxMs = Math.max(likeIntervalMinMs, Number(params.likeIntervalMaxMs ?? 5000) || 5000);
  const scrollIntervalMinMs = Math.max(400, Number(params.scrollIntervalMinMs ?? 900) || 900);
  const scrollIntervalMaxMs = Math.max(scrollIntervalMinMs, Number(params.scrollIntervalMaxMs ?? 1600) || 1600);
  const noCandidateLimit = Math.max(1, Number(params.noCandidateLimit ?? 10) || 10);
  const keywords = resolveFeedLikeKeywords(params);

  if (!state[tabStateKey] || !keywordsEqual(state[tabStateKey].tabKeywords || [], keywords)) {
    state[tabStateKey] = {
      currentTabIndex: 0,
      tabKeywords: [...keywords],
      tabsOpened: 0,
    };
    state[tabStatesKey] = {};
    state[globalStateKey] = actionMode === 'unlike'
      ? { totalUnliked: 0, totalSkipped: 0 }
      : { totalLiked: 0, totalSkipped: 0 };
  }

  const tabState = state[tabStateKey];
  const currentTabIndex = tabState?.currentTabIndex ?? 0;
  if (!state[tabStatesKey]) {
    state[tabStatesKey] = {};
  }
  if (!state[tabStatesKey][currentTabIndex]) {
    state[tabStatesKey][currentTabIndex] = {
      [processedKey]: new Set(),
      failedNoteCounts: new Map(),
      blockedNoteIds: new Set(),
      seenWindowSignatures: new Set(),
      scrollCount: 0,
      exhausted: false,
      noCandidateDown: 0,
      noCandidateUp: 0,
      noUnlikeScrolls: 0,
      noUnlikeCycles: 0,
      scrollDirection: 'down',
    };
  }
  const tabData = state[tabStatesKey][currentTabIndex];
  const desiredKeyword = tabState?.tabKeywords?.[currentTabIndex];
  if (desiredKeyword && String(tabData.keyword || '') !== String(desiredKeyword)) {
    tabData.pendingKeyword = desiredKeyword;
    tabData.pendingKeywordAttempts = 0;
  }

  try {
    const pageList = await safeCallAPI('page:list', { profileId }, 8000);
    const pages = pageList?.pages || pageList?.data?.pages || [];
    const activeIndex = Number.isInteger(pageList?.activeIndex)
      ? pageList.activeIndex
      : pages.findIndex((p) => p?.active === true);
    if (pages.length > 0 && currentTabIndex < pages.length) {
      const targetPageIndex = pages[currentTabIndex]?.index;
      const isActive = targetPageIndex === activeIndex || pages[currentTabIndex]?.active === true;
      if (!isActive && Number.isInteger(targetPageIndex)) {
        const switchResult = await safeCallAPI('page:switch', { profileId, index: targetPageIndex }, 10000);
        if (switchResult) {
          await waitForAnchor(profileId, {
            selectors: ['#search-input', '.note-item', '.feeds-container'],
            timeoutMs: 5000,
            intervalMs: 300,
            description: desc('feed_like_tab_realign'),
          }).catch(() => null);
          emitOperationProgress(context, {
            kind: kind('feed_like_tab_realigned'),
            stage,
            fromTabIndex: activeIndex,
            toTabIndex: currentTabIndex,
          });
        }
      }
    }
  } catch {
    // best-effort; continue with current page
  }

  if (tabData.pendingKeyword) {
    const searchKeyword = String(tabData.pendingKeyword || '').trim();
    tabData.pendingKeywordAttempts = Number(tabData.pendingKeywordAttempts || 0) + 1;
    emitOperationProgress(context, {
      kind: kind('feed_like_search_new_tab'),
      stage,
      keyword: searchKeyword,
      tabIndex: currentTabIndex,
      attempt: tabData.pendingKeywordAttempts,
    });

    try {
      const searchInput = await waitForAnchor(profileId, {
        selectors: ['#search-input', 'input.search-input'],
        timeoutMs: 5000,
        intervalMs: 300,
        description: desc('feed_like_search_input'),
      }).catch(() => null);

      if (searchInput?.ok && searchKeyword) {
        const submitMethod = resolveSearchSubmitMethod(params);
        await fillInputValue(profileId, ['#search-input', 'input.search-input'], searchKeyword);
        if (submitMethod === 'click') {
          await waitForAnchor(profileId, {
            selectors: ['.input-button', '.input-button .search-icon'],
            timeoutMs: 5000,
            intervalMs: 300,
            description: desc('feed_like_search_button'),
          }).catch(() => null);
          const button = await readSearchButton(profileId);
          if (!button?.ok || !button.center) {
            throw new Error(`SEARCH_BUTTON_NOT_FOUND:${String(button?.reason || 'unknown')}`);
          }
          try {
            await clickPoint(profileId, button.center, { timeoutMs: 8000 });
          } catch (error) {
            emitOperationProgress(context, {
              kind: kind('feed_like_search_click_error'),
              stage,
              keyword: searchKeyword,
              tabIndex: currentTabIndex,
              error: String(error?.message || error),
            });
          }
        } else {
          try {
            await pressKey(profileId, 'Enter');
          } catch (error) {
            emitOperationProgress(context, {
              kind: kind('feed_like_search_key_error'),
              stage,
              keyword: searchKeyword,
              tabIndex: currentTabIndex,
              error: String(error?.message || error),
            });
          }
        }
        await waitForAnchor(profileId, {
          selectors: [
            '#search-result .note-item:has(a.cover)',
            '.search-result-list .note-item:has(a.cover)',
            '.feeds-container .note-item:has(a.cover)',
          ],
          timeoutMs: 12000,
          intervalMs: 400,
          description: desc('feed_like_search_results'),
        }).catch(() => null);
        tabData.keyword = searchKeyword;
        tabData.pendingKeyword = null;
        tabData.pendingKeywordAttempts = 0;
      }
    } catch (err) {
      emitOperationProgress(context, {
        kind: kind('feed_like_search_error'),
        stage,
        keyword: searchKeyword,
        tabIndex: currentTabIndex,
        error: String(err?.message || err || 'unknown'),
      });
    }

    if (tabData.pendingKeywordAttempts >= 2) {
      tabData.pendingKeyword = null;
      tabData.pendingKeywordAttempts = 0;
    }
  }

  if (!(tabData[processedKey] instanceof Set)) {
    tabData[processedKey] = new Set(Array.isArray(tabData[processedKey]) ? tabData[processedKey] : []);
  }
  if (!(tabData.failedNoteCounts instanceof Map)) {
    const seed = Array.isArray(tabData.failedNoteCounts) ? tabData.failedNoteCounts : [];
    tabData.failedNoteCounts = new Map(seed);
  }
  if (!(tabData.blockedNoteIds instanceof Set)) {
    tabData.blockedNoteIds = new Set(Array.isArray(tabData.blockedNoteIds) ? tabData.blockedNoteIds : []);
  }
  if (!(tabData.seenWindowSignatures instanceof Set)) {
    tabData.seenWindowSignatures = new Set(Array.isArray(tabData.seenWindowSignatures) ? tabData.seenWindowSignatures : []);
  }

  if (!state[globalStateKey]) {
    state[globalStateKey] = actionMode === 'unlike'
      ? { totalUnliked: 0, totalSkipped: 0 }
      : { totalLiked: 0, totalSkipped: 0 };
  }

  const globalState = state[globalStateKey];

  let roundLiked = 0;
  let roundSkipped = 0;
  let scrollCount = tabData.scrollCount || 0;
  let emptyScanRetries = 0;
  let tabExhausted = false;
  let noCandidateDown = Number(tabData.noCandidateDown || 0);
  let noCandidateUp = Number(tabData.noCandidateUp || 0);
  let noUnlikeScrolls = Number(tabData.noUnlikeScrolls || 0);
  let noUnlikeCycles = Number(tabData.noUnlikeCycles || 0);
  let scrollDirection = String(tabData.scrollDirection || 'down').toLowerCase() === 'up' ? 'up' : 'down';

  while (roundLiked < likesPerRound && !tabExhausted) {
    const windowSnapshot = await readFeedWindowSignature(profileId).catch(() => null);
    const windowSignature = String(windowSnapshot?.signature || '').trim();
    if (windowSignature) {
      if (tabData.lastWindowSignature && tabData.lastWindowSignature !== windowSignature) {
        tabData.failedNoteCounts = new Map();
      }
      tabData.lastWindowSignature = windowSignature;
    }

    let scan;
    try {
      scan = await readFeedLikeCandidates(profileId, { maxCandidates: 100, minTopSafePx });
    } catch {
      emitOperationProgress(context, { kind: kind('feed_like_scan_error'), stage });
      tabExhausted = true;
      break;
    }

    if (!scan?.ok || scan.candidates.length === 0) {
      emitOperationProgress(context, {
        kind: kind('feed_like_scan_empty'),
        stage,
        scrollCount,
        roundLiked,
        roundSkipped,
        emptyScanRetries,
      });

      if (emptyScanRetries < 3) {
        emptyScanRetries += 1;
        await waitForAnchor(profileId, {
          selectors: [
            '.note-item:has(a.cover)',
            '.note-item .like-lottie',
            '.note-item .like-wrapper',
            'svg.reds-icon.like-icon',
          ],
          timeoutMs: 3000,
          intervalMs: 200,
          description: desc('feed_like_scan_empty_settle'),
        }).catch(() => null);
        continue;
      }
    }

    emptyScanRetries = 0;

    const keyword = tabData.keyword || tabState?.tabKeywords?.[currentTabIndex] || params.keyword || 'unknown';
    const candidates = scan.candidates
      .map((c) => ({ ...c, keyword }))
      .filter((c) => c.noteId);
    const processedIds = tabData[processedKey];
    const targetCandidates = actionMode === 'unlike'
      ? candidates.filter((c) => c.liked)
      : candidates.filter((c) => !c.liked);

    const failedCounts = tabData.failedNoteCounts || new Map();
    const blocked = tabData.blockedNoteIds || new Set();
    const filteredTargets = targetCandidates
      .filter((c) => !processedIds.has(c.noteId))
      .filter((c) => !blocked.has(c.noteId) && !failedCounts.has(c.noteId));

    tabData.targetCount = filteredTargets.length;
    if (actionMode === 'like') tabData.unlikedCount = filteredTargets.length;
    if (actionMode === 'unlike') tabData.likedCount = filteredTargets.length;

    emitOperationProgress(context, {
      kind: kind('feed_like_scan_result'),
      stage,
      tabIndex: currentTabIndex,
      keyword,
      totalCount: scan.totalCount,
      targetCount: filteredTargets.length,
      likedCount: scan.likedCount,
      unlikedCount: scan.unlikedCount,
      seenWindows: tabData.seenWindowSignatures.size,
      roundLiked,
      roundSkipped,
    });

    if (filteredTargets.length === 0) {
      const result = actionMode === 'unlike'
        ? await handleNoFeedTargetsUnlike({
          profileId,
          context,
          stage,
          currentTabIndex,
          tabData,
          scrollDirection,
          noUnlikeScrolls,
          noUnlikeCycles,
          scrollCount,
          noCandidateLimit,
          scrollIntervalMinMs,
          scrollIntervalMaxMs,
          kind,
          desc,
          tag,
        })
        : await handleNoFeedTargetsLike({
          profileId,
          context,
          stage,
          currentTabIndex,
          tabData,
          scrollDirection,
          noCandidateDown,
          noCandidateUp,
          scrollCount,
          noCandidateLimit,
          scrollIntervalMinMs,
          scrollIntervalMaxMs,
          kind,
          desc,
          tag,
        });

      if (actionMode === 'unlike') {
        scrollDirection = result.scrollDirection || scrollDirection;
        noUnlikeScrolls = result.noUnlikeScrolls ?? noUnlikeScrolls;
        noUnlikeCycles = result.noUnlikeCycles ?? noUnlikeCycles;
        scrollCount = result.scrollCount ?? scrollCount;
      } else {
        scrollDirection = result.scrollDirection || scrollDirection;
        noCandidateDown = result.noCandidateDown ?? noCandidateDown;
        noCandidateUp = result.noCandidateUp ?? noCandidateUp;
        scrollCount = result.scrollCount ?? scrollCount;
      }

      if (result.action === 'exhausted') {
        tabExhausted = true;
        break;
      }
      if (result.action === 'break') {
        break;
      }
      continue;
    }

    noCandidateDown = 0;
    noCandidateUp = 0;
    tabData.noCandidateDown = 0;
    tabData.noCandidateUp = 0;
    if (actionMode === 'unlike') {
      noUnlikeScrolls = 0;
      noUnlikeCycles = 0;
      tabData.noUnlikeScrolls = 0;
      tabData.noUnlikeCycles = 0;
    }

    const randomIndex = Math.floor(Math.random() * filteredTargets.length);
    const candidate = filteredTargets[randomIndex];

    const result = actionMode === 'unlike'
      ? await executeFeedUnlikeClick({ profileId, candidate, pushTrace })
      : await executeFeedLikeClick({ profileId, candidate, pushTrace });

    if (result.ok) {
      roundLiked += 1;
      globalState[totalKey] = Number(globalState?.[totalKey] || 0) + 1;
      if (candidate.noteId) tabData[processedKey].add(candidate.noteId);

      emitOperationProgress(context, {
        kind: kind('feed_like_done'),
        stage,
        tabIndex: currentTabIndex,
        noteId: candidate.noteId,
        selectorChanged: result.selectorChanged === true,
        roundLiked,
        roundSkipped,
        [totalKey]: globalState[totalKey],
      });

      if (roundLiked < likesPerRound) {
        await sleepRandom(likeIntervalMinMs, likeIntervalMaxMs, null, tag('feed_like_interval'));
      }
    } else {
      roundSkipped += 1;
      globalState.totalSkipped = Number(globalState?.totalSkipped || 0) + 1;

      const alreadyDoneCodes = actionMode === 'unlike'
        ? new Set(['NOT_LIKED', 'ALREADY_UNLIKED'])
        : new Set(['ALREADY_LIKED']);

      if (alreadyDoneCodes.has(result.code) && candidate.noteId) {
        tabData[processedKey].add(candidate.noteId);
      } else if (candidate.noteId) {
        const prevCount = Number(tabData.failedNoteCounts?.get(candidate.noteId) || 0);
        const nextCount = prevCount + 1;
        tabData.failedNoteCounts?.set(candidate.noteId, nextCount);
        if (nextCount >= MAX_CLICK_FAILURES_PER_NOTE) {
          tabData.blockedNoteIds?.add(candidate.noteId);
        }
      }

      emitOperationProgress(context, {
        kind: kind('feed_like_click_failed'),
        stage,
        tabIndex: currentTabIndex,
        noteId: candidate.noteId,
        reason: result.code || 'unknown',
        failCount: candidate.noteId ? Number(tabData.failedNoteCounts?.get(candidate.noteId) || 1) : 0,
        blocked: candidate.noteId ? tabData.blockedNoteIds?.has(candidate.noteId) === true : false,
        screenshotPre: result.preShot || null,
        screenshotPost: result.postShot || null,
      });
    }
  }

  tabData.exhausted = tabExhausted;

  const switchResult = await executeFeedLikeTabSwitch({ profileId, params, context });
  if (switchResult.code === 'ALL_TABS_DONE') {
    return {
      ok: true,
      code: 'ALL_TABS_EXHAUSTED',
      data: {
        tabIndex: currentTabIndex,
        roundLiked,
        [totalKey]: Number(globalState?.[totalKey] || 0),
        totalSkipped: Number(globalState?.totalSkipped || 0),
      },
    };
  }

  if (switchResult.data?.needSearch && switchResult.data?.keyword) {
    const searchKeyword = switchResult.data.keyword;
    const state2 = getProfileState(profileId);
    const latestTabState = state2[tabStateKey] || { currentTabIndex: 0 };
    if (state2[tabStatesKey]) {
      const newTabIndex = latestTabState.currentTabIndex ?? 0;
      state2[tabStatesKey][newTabIndex] = state2[tabStatesKey][newTabIndex] || {};
      state2[tabStatesKey][newTabIndex].pendingKeyword = searchKeyword;
    }
  }

  return executeFeedLikeOperation({ profileId, params, context });
}

