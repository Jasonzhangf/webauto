import { resolveXhsOutputContext, readJsonlRows } from './persistence.mjs';

function cloneLinkPayload(link) {
  return link && typeof link === 'object' ? { ...link } : link;
}

function createLinkKey(link) {
  if (!link || typeof link !== 'object') return '';
  return String(link.noteId || link.noteUrl || link.url || '').trim();
}

function createQueueEntry(link, retryCount = 0) {
  return {
    link: cloneLinkPayload(link),
    key: createLinkKey(link),
    retryCount: Math.max(0, Number(retryCount) || 0),
  };
}

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
      sourcePath: null,
      queue: [],
      byTab: {},
      completed: {},
      exhausted: {},
    };
  }
  if (!Array.isArray(state.linksState.queue)) state.linksState.queue = [];
  if (!state.linksState.byTab || typeof state.linksState.byTab !== 'object') state.linksState.byTab = {};
  if (!state.linksState.completed || typeof state.linksState.completed !== 'object') state.linksState.completed = {};
  if (!state.linksState.exhausted || typeof state.linksState.exhausted !== 'object') state.linksState.exhausted = {};
  return state.linksState;
}

function syncQueueFromCache(state, params = {}) {
  const linksState = ensureLinksState(state);
  const outputCtx = resolveXhsOutputContext({ params, state });
  const linksPath = String(params.sharedHarvestPath || params.sharedClaimPath || outputCtx.linksPath || '').trim();
  const cachePath = String(state.linksCachePath || '').trim();
  const cacheRows = Array.isArray(state.linksCache) ? state.linksCache : [];
  if (linksState.sourcePath === linksPath && linksState.sourcePath === cachePath) return linksState;
  linksState.sourcePath = linksPath || cachePath || null;
  linksState.queue = cacheRows.map((row) => createQueueEntry(row, 0));
  linksState.byTab = {};
  linksState.completed = {};
  linksState.exhausted = {};
  return linksState;
}

function clearTabAssignment(linksState, tabKey, extra = {}) {
  linksState.byTab[tabKey] = {
    index: -1,
    link: null,
    key: null,
    retryCount: 0,
    done: true,
    ...extra,
  };
}

export async function loadCollectedLinks(state, params = {}) {
  const outputCtx = resolveXhsOutputContext({ params, state });
  const linksPath = String(params.sharedHarvestPath || params.sharedClaimPath || outputCtx.linksPath || '').trim();
  if (!state.linksCache || state.linksCachePath !== linksPath) {
    const rows = await readJsonlRows(linksPath);
    state.linksCache = Array.isArray(rows) ? rows : [];
    state.linksCachePath = linksPath;
  }
  syncQueueFromCache(state, params);
  return state.linksCache;
}

export async function getOrAssignLinkForTab(state, params = {}, tabIndex) {
  const linksState = ensureLinksState(state);
  await loadCollectedLinks(state, params);
  const tabKey = String(tabIndex || '1');
  const entry = linksState.byTab[tabKey];
  if (entry && entry.link && entry.done !== true) {
    return entry.link;
  }
  const nextEntry = linksState.queue.shift() || null;
  if (!nextEntry?.link) return null;
  linksState.byTab[tabKey] = {
    index: -1,
    link: nextEntry.link,
    key: nextEntry.key,
    retryCount: Math.max(0, Number(nextEntry.retryCount) || 0),
    done: false,
    assignedAt: new Date().toISOString(),
  };
  return linksState.byTab[tabKey].link;
}

export async function advanceLinkForTab(state, params = {}, tabIndex) {
  markTabLinkDone(state, tabIndex);
  return getOrAssignLinkForTab(state, params, tabIndex);
}

export function readActiveLinkForTab(state, tabIndex) {
  const linksState = ensureLinksState(state);
  const tabKey = String(tabIndex || '1');
  const entry = linksState.byTab[tabKey];
  return entry && entry.link && entry.done !== true ? { ...entry, link: cloneLinkPayload(entry.link) } : null;
}

export function markTabLinkDone(state, tabIndex, meta = {}) {
  const linksState = ensureLinksState(state);
  const tabKey = String(tabIndex || '1');
  const entry = linksState.byTab[tabKey];
  if (!entry || !entry.link) {
    clearTabAssignment(linksState, tabKey, { reason: meta.reason || 'missing_entry' });
    return { done: false, key: null, link: null };
  }
  const key = String(entry.key || createLinkKey(entry.link)).trim();
  if (key) {
    linksState.completed[key] = {
      completedAt: new Date().toISOString(),
      retryCount: Math.max(0, Number(entry.retryCount) || 0),
      ...meta,
    };
  }
  const result = {
    done: true,
    key,
    link: cloneLinkPayload(entry.link),
    retryCount: Math.max(0, Number(entry.retryCount) || 0),
  };
  clearTabAssignment(linksState, tabKey, { reason: meta.reason || 'done' });
  return result;
}

export function requeueTabLinkToTail(state, params = {}, tabIndex, meta = {}) {
  const linksState = ensureLinksState(state);
  const tabKey = String(tabIndex || '1');
  const entry = linksState.byTab[tabKey];
  if (!entry || !entry.link) {
    clearTabAssignment(linksState, tabKey, { reason: meta.reason || 'missing_entry' });
    return { requeued: false, exhausted: false, key: null, retryCount: 0, link: null };
  }
  const key = String(entry.key || createLinkKey(entry.link)).trim();
  const nextRetryCount = Math.max(0, Number(entry.retryCount) || 0) + 1;
  const retryMax = Math.max(0, Number(params.detailLinkRetryMax ?? state?.detailLinkState?.retryMax ?? 2) || 0);
  const exhausted = nextRetryCount > retryMax;
  if (key && exhausted) {
    linksState.exhausted[key] = {
      exhaustedAt: new Date().toISOString(),
      retryCount: nextRetryCount,
      ...meta,
    };
  }
  if (!exhausted) {
    linksState.queue.push(createQueueEntry(entry.link, nextRetryCount));
  }
  const result = {
    requeued: !exhausted,
    exhausted,
    key,
    retryCount: nextRetryCount,
    retryMax,
    link: cloneLinkPayload(entry.link),
  };
  clearTabAssignment(linksState, tabKey, { reason: exhausted ? 'retry_exhausted' : 'requeued' });
  return result;
}
