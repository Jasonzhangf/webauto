import { callAPI } from '../../../utils/browser-service.mjs';
import { evaluateReadonly, waitForAnchor } from './dom-ops.mjs';

export const NOTE_ITEM_SELECTOR = '.note-item';
export const MAX_FEED_TABS = 4;
export const LIKES_PER_ROUND = 5;
export const MAX_CLICK_FAILURES_PER_NOTE = 2;

export const NOTE_LIKED_USE_SELECTORS = [
  'svg.reds-icon.like-icon use[*|href="#liked"]',
  'svg.reds-icon.like-icon use[href="#liked"]',
  'svg.reds-icon.like-icon use[xlink\\:href="#liked"]',
];

export function resolveFeedActionMode(params = {}) {
  const raw = String(params.mode || params.actionMode || params.feedMode || '').trim().toLowerCase();
  return raw === 'unlike' ? 'unlike' : 'like';
}

export function mapFeedLikeKind(mode, value) {
  if (mode !== 'unlike') return value;
  if (typeof value !== 'string') return value;
  return value.replace(/^feed_like/, 'feed_unlike');
}

export function resolveFeedLikeKeywords(params = {}) {
  if (Array.isArray(params.keywords)) {
    return params.keywords.slice(0, MAX_FEED_TABS).map(k => String(k || '').trim()).filter(Boolean);
  }
  if (params.keywords) {
    return String(params.keywords)
      .split(',')
      .map(k => k.trim())
      .filter(Boolean)
      .slice(0, MAX_FEED_TABS);
  }
  if (params.keyword) {
    const single = String(params.keyword || '').trim();
    return single ? [single].slice(0, MAX_FEED_TABS) : [];
  }
  return [];
}

export function keywordsEqual(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] || '') !== String(b[i] || '')) return false;
  }
  return true;
}

export function resolveFeedStateKeys(actionMode = 'like') {
  const unlike = actionMode === 'unlike';
  return {
    tabStateKey: unlike ? 'feedUnlikeTabState' : 'feedLikeTabState',
    tabStatesKey: unlike ? 'feedUnlikeTabStates' : 'feedLikeTabStates',
    globalStateKey: unlike ? 'feedUnlikeGlobalState' : 'feedLikeGlobalState',
    processedKey: unlike ? 'unlikedNoteIds' : 'likedNoteIds',
    totalKey: unlike ? 'totalUnliked' : 'totalLiked',
  };
}

export async function readFeedWindowSignature(profileId) {
  const script = `(() => {
    const rows = Array.from(document.querySelectorAll('.note-item a.cover'));
    const ids = rows
      .map((a) => String(a.getAttribute('href') || '').trim())
      .filter(Boolean)
      .slice(0, 40);
    const first = ids[0] || '';
    const last = ids[ids.length - 1] || '';
    const list = document.querySelector('.feeds-container, .search-result-list, .feeds-page');
    const scrollTop = Number(list?.scrollTop || 0);
    const scrollHeight = Number(list?.scrollHeight || 0);
    const clientHeight = Number(list?.clientHeight || 0);
    return {
      first,
      last,
      count: ids.length,
      scrollTop,
      scrollHeight,
      clientHeight,
      signature: [first, last, ids.length, scrollTop, scrollHeight, clientHeight].join('|'),
    };
  })()`;
  return evaluateReadonly(profileId, script, { timeoutMs: 6000, onTimeout: 'return' });
}

export async function waitForFeedWindowChange(profileId, beforeSignature) {
  return waitForAnchor(profileId, {
    selectors: [],
    timeoutMs: 5000,
    intervalMs: 300,
    description: 'feed_like_after_scroll_window_change',
    probe: async () => {
      const current = await readFeedWindowSignature(profileId).catch(() => null);
      if (!current?.signature) return false;
      if (!beforeSignature) return true;
      return current.signature !== beforeSignature;
    },
  });
}

export async function safeCallAPI(action, payload = {}, timeoutMs = 15000) {
  const effectiveTimeoutMs = Math.max(500, Number(timeoutMs) || 15000);
  let timer;
  try {
    return await Promise.race([
      callAPI(action, payload),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), effectiveTimeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

