import { resolveXhsOutputContext, readJsonlRows } from './persistence.mjs';

export function ensureTabState(state, params = {}) {
  const tabCount = Math.max(1, Number(params.tabCount ?? state?.tabState?.tabCount ?? 4) || 4);
  const limit = Math.max(1, Number(params.commentBudget ?? state?.tabState?.limit ?? 50) || 50);
  if (!state.tabState || state.tabState.tabCount !== tabCount || !Array.isArray(state.tabState.used)) {
    state.tabState = {
      tabCount,
      limit,
      cursor: 1,
      used: Array.from({ length: tabCount }, () => 0),
    };
  } else {
    state.tabState.limit = limit;
  }
  return state.tabState;
}

export function getCurrentTabIndex(state, params = {}) {
  const tab = ensureTabState(state, params);
  return Math.max(1, Math.min(tab.tabCount, Number(tab.cursor) || 1));
}

export function consumeTabBudget(state, count = 0, params = {}) {
  const tab = ensureTabState(state, params);
  const index = getCurrentTabIndex(state, params) - 1;
  const add = Math.max(0, Number(count) || 0);
  tab.used[index] = Math.max(0, Number(tab.used[index] || 0)) + add;
  return {
    tabIndex: index + 1,
    used: tab.used[index],
    limit: tab.limit,
    exhausted: tab.used[index] >= tab.limit,
  };
}

export function advanceTab(state, params = {}) {
  const tab = ensureTabState(state, params);
  const current = getCurrentTabIndex(state, params);
  const next = (current % tab.tabCount) + 1;
  tab.cursor = next;
  const nextIdx = next - 1;
  if (Number(tab.used[nextIdx] || 0) >= tab.limit) {
    tab.used[nextIdx] = 0;
  }
  return {
    tabIndex: next,
    used: tab.used[nextIdx],
    limit: tab.limit,
  };
}

function ensureLinksState(state) {
  if (!state.linksState || typeof state.linksState !== 'object') {
    state.linksState = {
      nextIndex: 0,
      byTab: {},
    };
  }
  return state.linksState;
}

export async function loadCollectedLinks(state, params = {}) {
  const outputCtx = resolveXhsOutputContext({ params, state });
  if (!state.linksCache || state.linksCachePath !== outputCtx.linksPath) {
    const rows = await readJsonlRows(outputCtx.linksPath);
    state.linksCache = Array.isArray(rows) ? rows : [];
    state.linksCachePath = outputCtx.linksPath;
  }
  return state.linksCache;
}

export async function getOrAssignLinkForTab(state, params = {}, tabIndex) {
  const linksState = ensureLinksState(state);
  const links = await loadCollectedLinks(state, params);
  const tabKey = String(tabIndex || '1');
  const entry = linksState.byTab[tabKey];
  if (entry && entry.link && entry.done !== true) {
    return entry.link;
  }
  if (linksState.nextIndex >= links.length) return null;
  const link = links[linksState.nextIndex];
  linksState.byTab[tabKey] = {
    index: linksState.nextIndex,
    link,
    done: false,
  };
  linksState.nextIndex += 1;
  return link;
}

export function markTabLinkDone(state, tabIndex) {
  const linksState = ensureLinksState(state);
  const tabKey = String(tabIndex || '1');
  if (!linksState.byTab[tabKey]) {
    linksState.byTab[tabKey] = { index: -1, link: null, done: true };
    return;
  }
  linksState.byTab[tabKey].done = true;
}
