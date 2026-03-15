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

function limitCollectedLinks(rows, params = {}) {
  const hasMaxNotes = Object.prototype.hasOwnProperty.call(params, 'maxNotes')
    && params.maxNotes !== null
    && params.maxNotes !== '';
  const maxNotes = hasMaxNotes ? Math.max(1, Number(params.maxNotes) || 0) : 0;
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (maxNotes <= 0) return rows.map((row) => cloneLinkPayload(row));

  const seen = new Set();
  const limited = [];
  for (const row of rows) {
    const key = createLinkKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    limited.push(cloneLinkPayload(row));
    if (limited.length >= maxNotes) break;
  }
  return limited;
}

export function ensureTabState(state, params = {}) {
  const tabCount = Math.max(1, Number(params.tabCount ?? state?.tabState?.tabCount ?? 4) || 4);
  const hasCommentBudget = Object.prototype.hasOwnProperty.call(params, 'commentBudget')
    && params.commentBudget !== null
    && params.commentBudget !== undefined
    && params.commentBudget !== '';
  const nextLimit = hasCommentBudget
    ? Math.max(0, Number(params.commentBudget) || 0)
    : Number(state?.tabState?.limit ?? 50);
  const limit = Math.max(0, Number.isFinite(nextLimit) ? nextLimit : 50);
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
  const exhausted = tab.limit > 0 && tab.used[index] >= tab.limit;
  return {
    tabIndex: index + 1,
    used: tab.used[index],
    limit: tab.limit,
    exhausted,
  };
}

export function advanceTab(state, params = {}) {
  const tab = ensureTabState(state, params);
  const current = getCurrentTabIndex(state, params);
  const next = (current % tab.tabCount) + 1;
  tab.cursor = next;
  const nextIdx = next - 1;
  if (tab.limit > 0 && Number(tab.used[nextIdx] || 0) >= tab.limit) {
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
  const cacheRows = limitCollectedLinks(Array.isArray(state.linksCache) ? state.linksCache : [], params);
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
  const hasMaxNotes = Object.prototype.hasOwnProperty.call(params, 'maxNotes')
    && params.maxNotes !== null
    && params.maxNotes !== '';
  const cacheMaxNotes = hasMaxNotes ? Math.max(1, Number(params.maxNotes) || 0) : 0;
  if (!state.linksCache || state.linksCachePath !== linksPath || Number(state.linksCacheMaxNotes || 0) !== cacheMaxNotes) {
    const rows = await readJsonlRows(linksPath);
    state.linksCache = limitCollectedLinks(Array.isArray(rows) ? rows : [], params);
    state.linksCachePath = linksPath;
    state.linksCacheMaxNotes = cacheMaxNotes;
  }
  syncQueueFromCache(state, params);
  return state.linksCache;
}

export function readCollectedLinksCache(state) {
  return Array.isArray(state?.linksCache) ? state.linksCache.map((row) => cloneLinkPayload(row)) : [];
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
  // STRICT DEDUP: skip if already completed or exhausted
  if (nextEntry?.link) {
    const key = String(nextEntry.key || createLinkKey(nextEntry.link)).trim();
    if (linksState.completed[key] || linksState.exhausted[key]) {
      // Drop this entry, it was already processed
      return getOrAssignLinkForTab(state, params, tabIndex);
    }
  }
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

export function readTabSlotState(state, tabIndex) {
  const linksState = ensureLinksState(state);
  const tabKey = String(tabIndex || '1');
  const entry = linksState.byTab[tabKey];
  if (!entry || typeof entry !== 'object') return null;
  return {
    ...entry,
    link: cloneLinkPayload(entry.link),
  };
}

export function writeTabSlotState(state, tabIndex, patch = {}) {
  const linksState = ensureLinksState(state);
  const tabKey = String(tabIndex || '1');
  const current = linksState.byTab[tabKey] && typeof linksState.byTab[tabKey] === 'object'
    ? linksState.byTab[tabKey]
    : { index: -1, link: null, key: null, retryCount: 0, done: true };
  linksState.byTab[tabKey] = {
    ...current,
    ...patch,
    link: Object.prototype.hasOwnProperty.call(patch, 'link') ? cloneLinkPayload(patch.link) : current.link,
  };
  return readTabSlotState(state, tabIndex);
}
