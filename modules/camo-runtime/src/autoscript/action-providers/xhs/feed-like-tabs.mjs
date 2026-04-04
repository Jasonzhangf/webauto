import { waitForAnchor } from './dom-ops.mjs';
import { getProfileState } from './state.mjs';
import { emitOperationProgress } from '../../shared/trace.mjs';
import {
  MAX_FEED_TABS,
  mapFeedLikeKind,
  resolveFeedActionMode,
  resolveFeedLikeKeywords,
  resolveFeedStateKeys,
  safeCallAPI,
} from './feed-like-shared.mjs';

export async function executeFeedLikeTabSwitch({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const actionMode = resolveFeedActionMode(params);
  const stage = actionMode === 'unlike' ? 'feed_unlike' : 'feed_like';
  const kind = (value) => mapFeedLikeKind(actionMode, value);
  const desc = (value) => mapFeedLikeKind(actionMode, value);
  const { tabStateKey, tabStatesKey, globalStateKey, processedKey, totalKey } = resolveFeedStateKeys(actionMode);

  const keywords = resolveFeedLikeKeywords(params);

  if (!state[tabStateKey]) {
    state[tabStateKey] = {
      currentTabIndex: 0,
      tabKeywords: [...keywords],
      tabsOpened: 0,
    };
  }
  if (!state[tabStatesKey]) {
    state[tabStatesKey] = {};
  }
  if (!state[globalStateKey]) {
    state[globalStateKey] = { [totalKey]: 0, totalSkipped: 0 };
  }

  const tabState = state[tabStateKey];
  const effectiveKeywords = tabState.tabKeywords.length > 0 ? tabState.tabKeywords : keywords;

  const pageList = await safeCallAPI('page:list', { profileId }, 10000);
  const pages = pageList?.pages || pageList?.data?.pages || [];
  if (pages.length === 0) {
    return { ok: true, code: 'PAGE_LIST_EMPTY', message: 'no tabs available' };
  }

  const activeTabCount = pages.length;
  const currentTabIndex = tabState.currentTabIndex ?? 0;
  const currentTabData = state[tabStatesKey][currentTabIndex];
  const currentExhausted = currentTabData?.exhausted === true;

  let nextTabIndex;
  if (currentExhausted) {
    nextTabIndex = (currentTabIndex + 1) % Math.max(activeTabCount, 1);
  } else {
    nextTabIndex = (currentTabIndex + 1) % Math.max(activeTabCount, 1);
  }

  let allExhausted = true;
  for (let i = 0; i < activeTabCount; i += 1) {
    if (state[tabStatesKey][i]?.exhausted !== true) {
      allExhausted = false;
      break;
    }
  }

  const globalState = state[globalStateKey] || {};
  const totalDone = Number(globalState?.[totalKey] || 0);
  const totalSkipped = Number(globalState?.totalSkipped || 0);

  if (allExhausted && tabState.tabsOpened >= effectiveKeywords.length) {
    emitOperationProgress(context, {
      kind: kind('feed_like_all_tabs_done'),
      stage,
      totalTabs: tabState.tabsOpened,
      [totalKey]: totalDone,
      totalSkipped,
    });
    return {
      ok: true,
      code: 'ALL_TABS_DONE',
      message: 'all feed tabs exhausted',
      data: {
        totalTabs: tabState.tabsOpened,
        [totalKey]: totalDone,
        totalSkipped,
      },
    };
  }

  const needNewTab = tabState.tabsOpened < effectiveKeywords.length && activeTabCount < MAX_FEED_TABS;

  if (needNewTab) {
    const nextKeywordIndex = tabState.tabsOpened;
    const nextKeyword = effectiveKeywords[nextKeywordIndex];
    if (!nextKeyword) {
      tabState.tabsOpened = effectiveKeywords.length;
    } else {
      const newTabResult = await safeCallAPI('newTab', { profileId, url: 'https://www.xiaohongshu.com/explore' }, 15000);
      if (!newTabResult) {
        return { ok: true, code: 'NEW_TAB_FAILED', message: 'newTab failed' };
      }

      try {
        await waitForAnchor(profileId, {
          selectors: ['#search-input', '.note-item', '.feeds-container', '.explore-page'],
          timeoutMs: 8000,
          intervalMs: 300,
          description: desc('feed_like_new_tab_settle'),
        });
      } catch {
        // ignore
      }

      const newList = await safeCallAPI('page:list', { profileId }, 5000);
      const newPages = newList?.pages || newList?.data?.pages || [];
      if (newPages.length > 0) {
        const newTab = newPages[newPages.length - 1];
        await safeCallAPI('page:switch', { profileId, index: newTab.index }, 10000);
      }

      tabState.tabsOpened += 1;
      tabState.currentTabIndex = newPages.length > 0 ? newPages.length - 1 : tabState.currentTabIndex;

      state[tabStatesKey][tabState.currentTabIndex] = {
        [processedKey]: new Set(),
        seenWindowSignatures: new Set(),
        scrollCount: 0,
        exhausted: false,
        noCandidateDown: 0,
        noCandidateUp: 0,
        noUnlikeScrolls: 0,
        noUnlikeCycles: 0,
        scrollDirection: 'down',
        pendingKeyword: nextKeyword,
      };

      emitOperationProgress(context, {
        kind: kind('feed_like_new_tab_opened'),
        stage,
        tabIndex: tabState.currentTabIndex,
        keyword: nextKeyword,
        totalTabsOpened: tabState.tabsOpened,
      });

      return {
        ok: true,
        code: 'NEW_TAB_OPENED',
        message: `opened new tab ${tabState.currentTabIndex} with keyword "${nextKeyword}"`,
        data: {
          newTabIndex: tabState.currentTabIndex,
          keyword: nextKeyword,
          needSearch: true,
          totalTabsOpened: tabState.tabsOpened,
        },
      };
    }
  }

  if (nextTabIndex < activeTabCount) {
    const switchResult = await safeCallAPI('page:switch', { profileId, index: pages[nextTabIndex].index }, 10000);
    if (!switchResult) {
      return { ok: true, code: 'TAB_SWITCH_FAILED', message: 'page:switch failed' };
    }

    try {
      await waitForAnchor(profileId, {
        selectors: ['#search-input', '.note-item', '.feeds-container'],
        timeoutMs: 5000,
        intervalMs: 300,
        description: desc('feed_like_tab_switch_settle'),
      });
    } catch {
      // ignore
    }

    tabState.currentTabIndex = nextTabIndex;

    emitOperationProgress(context, {
      kind: kind('feed_like_tab_switched'),
      stage,
      fromTabIndex: currentTabIndex,
      toTabIndex: nextTabIndex,
      tabExhausted: currentExhausted,
    });

    return {
      ok: true,
      code: 'TAB_SWITCH_DONE',
      message: `switched from tab ${currentTabIndex} to tab ${nextTabIndex}`,
      data: {
        fromTabIndex: currentTabIndex,
        toTabIndex: nextTabIndex,
        tabExhausted: currentExhausted,
      },
    };
  }

  return {
    ok: true,
    code: 'ALL_TABS_DONE',
    message: 'all feed tabs processed',
    data: {
      totalTabs: tabState.tabsOpened,
      [totalKey]: totalDone,
      totalSkipped,
    },
  };
}

