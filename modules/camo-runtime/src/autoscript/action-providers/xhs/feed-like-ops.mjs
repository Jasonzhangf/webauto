/**
 * Feed-like operations: 鐐硅禐鎼滅储缁撴灉鍒楄〃涓殑 note-item
 *
 * 澶?Tab 杞浆绛栫暐:
 * - 姣忎釜 keyword 鎵撳紑涓€涓悳绱?Tab锛堟渶澶?4 涓?Tab锛?
 * - Tab1 鐐?5 涓?鈫?Tab2 鐐?5 涓?鈫?Tab3 鐐?5 涓?鈫?Tab4 鐐?5 涓?鈫?Tab1 鐐?5 涓?鈫?...
 * - 姣忎釜 Tab 鍐?5 涓€欓€夐殢鏈洪€夋嫨
 * - 褰撳墠椤电偣瀹屾粴鍔ㄥ埌涓嬩竴椤电户缁?
 * - 鎵€鏈?Tab 鍒板簳 鈫?瀹屾垚
 *
 * 闃查樆濉炲師鍒欙細
 * - 姣忎釜 await 璋冪敤閮芥湁瓒呮椂淇濇姢鎴?try-catch
 * - 鍥哄畾 sleep 鏇挎崲涓洪敋鐐圭瓑寰咃紙 waitForAnchor 锛?
 * - 鍗曟鐐硅禐澶辫触涓嶉樆濉炰富娴佺▼锛?catch + skip 锛?
 * - tab 鍒囨崲鐢ㄩ敋鐐圭瓑寰呴〉闈㈠氨缁€岄潪鍥哄畾寤舵椂
 */

import { callAPI } from '../../../utils/browser-service.mjs';
import path from 'node:path';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitOperationProgress } from './trace.mjs';
import { evaluateReadonly, clickPoint, waitForAnchor, sleepRandom, pressKey, fillInputValue } from './dom-ops.mjs';
import { captureScreenshotToFile } from './diagnostic-utils.mjs';

const NOTE_ITEM_SELECTOR = '.note-item';
const MAX_FEED_TABS = 4; // 鏈€澶?4 涓?Tab
const LIKES_PER_ROUND = 5; // 姣?Tab 姣忚疆鐐?5 涓?
const MAX_CLICK_FAILURES_PER_NOTE = 2;

const NOTE_LIKED_USE_SELECTORS = [
  'svg.reds-icon.like-icon use[*|href="#liked"]',
  'svg.reds-icon.like-icon use[href="#liked"]',
  'svg.reds-icon.like-icon use[xlink\\:href="#liked"]',
];

function resolveFeedLikeKeywords(params = {}) {
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

function keywordsEqual(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] || '') !== String(b[i] || '')) return false;
  }
  return true;
}

async function readFeedWindowSignature(profileId) {
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

async function waitForFeedWindowChange(profileId, beforeSignature) {
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

/** 瀹夊叏 callAPI 鍖呰锛氳秴鏃跺悗杩斿洖 null 鑰岄潪鎶涘紓甯?*/
async function safeCallAPI(action, payload = {}, timeoutMs = 15000) {
  const start = Date.now();
  try {
    const result = await callAPI(action, payload);
    if (Date.now() - start > timeoutMs) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * 璇诲彇褰撳墠鎼滅储缁撴灉椤甸潰涓婃墍鏈夊彲瑙佺殑 note-item 鍙婂叾鐐硅禐鐘舵€?
 */
export async function readFeedLikeCandidates(profileId, options = {}) {
  const maxCandidates = Math.max(1, Number(options.maxCandidates || 50) || 50);
  const minTopSafePx = Math.max(60, Number(options.minTopSafePx || 90) || 90);

  const script = `(() => {
    const items = Array.from(document.querySelectorAll('${NOTE_ITEM_SELECTOR}'));
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);

    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom <= 0 || rect.top >= vh) return false;
      try {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      } catch { return false; }
      return true;
    };

    const candidates = [];
    for (let i = 0; i < items.length && candidates.length < ${maxCandidates}; i++) {
      const item = items[i];
      if (!isVisible(item)) continue;

      const likeBtn = item.querySelector('.like-wrapper svg.reds-icon.like-icon, svg.reds-icon.like-icon, .like-lottie');
      if (!likeBtn) continue;

      const likedUse = item.querySelector(${JSON.stringify(NOTE_LIKED_USE_SELECTORS.join(', '))});
      const likedHref = String(likedUse?.getAttribute('href') || likedUse?.getAttribute('xlink:href') || '').trim();
      const liked = likedHref === '#liked';

      const cover = item.querySelector('a.cover');
      const href = cover ? String(cover.getAttribute('href') || '') : '';
      const noteIdMatch = href.match(/\\/(?:explore|search_result)\\/([a-zA-Z0-9]+)/);
      const noteId = noteIdMatch ? noteIdMatch[1] : null;

      const rect = likeBtn.getBoundingClientRect();
      if (!rect || rect.width <= 2 || rect.height <= 2) continue;
      if (rect.top < ${minTopSafePx}) continue;
      if (rect.bottom > vh - 8) continue;
      const center = {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };

      const hit = document.elementFromPoint(center.x, center.y);
      const stack = (typeof document.elementsFromPoint === 'function')
        ? document.elementsFromPoint(center.x, center.y)
        : (hit ? [hit] : []);
      const hitMatches = stack.some((node) => {
        if (!node) return false;
        return (
          node === likeBtn
          || likeBtn.contains(node)
          || node.contains(likeBtn)
          || !!node.closest('svg.reds-icon.like-icon')
          || !!node.closest('.like-lottie')
          || !!node.closest('.like-wrapper')
        );
      });
      if (!hitMatches) continue;

      candidates.push({
        index: i,
        noteId,
        href,
        liked,
        center,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    return {
      ok: true,
      candidates,
      totalCount: candidates.length,
      likedCount: candidates.filter(c => c.liked).length,
      unlikedCount: candidates.filter(c => !c.liked).length,
    };
  })()`;

  return evaluateReadonly(profileId, script, { timeoutMs: 8000, onTimeout: 'return' });
}

/**
 * 鎵ц鍗曟鐐硅禐鎿嶄綔锛堥槻闃诲锛氳秴鏃?+ try-catch锛?
 */
async function executeFeedLikeClick({ profileId, candidate, pushTrace }) {
  if (!candidate || !candidate.center) {
    return { ok: false, code: 'INVALID_CANDIDATE' };
  }

  const captureLikeSnapshot = async (suffix) => {
    const kw = String(candidate?.keyword || 'unknown').trim() || 'unknown';
    const note = String(candidate?.noteId || 'unknown').trim() || 'unknown';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(
      process.env.HOME || process.env.USERPROFILE || '/tmp',
      '.webauto', 'download', 'xiaohongshu', 'debug', kw, 'diagnostics',
      `feed-like-${suffix}-${note}-${ts}.png`,
    );
    return captureScreenshotToFile({ profileId, filePath }).catch(() => null);
  };

  const preShot = await Promise.race([
    captureLikeSnapshot('pre'),
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const noteId = String(candidate?.noteId || '').trim();
  // 蹇呴』浣跨敤 [*|href="#liked"]锛歺link:href 鏄懡鍚嶇┖闂村睘鎬э紝鏅€?CSS 涓嶅尮閰?
  const likeActiveSelectors = noteId
    ? [
        `.note-item a.cover[href*="${noteId}"] ~ .footer .like-wrapper svg.reds-icon.like-icon use[*|href="#liked"]`,
      ]
    : [];

  // click 鍓嶇敤閿氱偣妫€鏌ユ槸鍚﹀凡缁?liked锛堥伩鍏嶉噸澶嶇偣鍑伙級
  if (likeActiveSelectors.length > 0) {
    const preCheck = await waitForAnchor(profileId, {
      selectors: likeActiveSelectors,
      timeoutMs: 1000,
      intervalMs: 100,
      description: 'feed_like_pre_check_already_liked',
    }).catch(() => null);
    
    if (preCheck?.ok === true) {
      pushTrace({
        kind: 'click',
        stage: 'feed_like',
        noteId: candidate.noteId,
        center: candidate.center,
        selectorChanged: false,
        preShot,
        postShot: null,
        code: 'ALREADY_LIKED',
      });
      return { ok: false, code: 'ALREADY_LIKED', noteId: candidate.noteId, preShot };
    }
  }

  try {
    // Avoid short, non-anchored click timeouts; rely on post-click anchor validation instead.
    await clickPoint(profileId, candidate.center, { clicks: 1 });
  } catch {
    pushTrace({
      kind: 'skip',
      stage: 'feed_like',
      noteId: candidate.noteId,
      reason: 'click_timeout_or_error',
    });
    return { ok: false, code: 'CLICK_FAILED', noteId: candidate.noteId, preShot };
  }

  // click 鍚庣敤閿氱偣绛夊緟 .like-active 鍑虹幇锛堜笉鐢?evaluate锛?
  const postSelector = likeActiveSelectors.length > 0
    ? await waitForAnchor(profileId, {
        selectors: likeActiveSelectors,
        timeoutMs: 5000,
        intervalMs: 200,
        description: 'feed_like_selector_turned_active',
      }).catch(() => ({ ok: false, reason: 'anchor_timeout' }))
    : { ok: false, reason: 'no_noteId' };

  const postStatus = { ok: postSelector?.ok === true, liked: postSelector?.ok === true };

  const postShot = await Promise.race([
    captureLikeSnapshot('post'),
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const selectorChanged = postSelector?.ok === true && postStatus?.ok === true && postStatus?.liked === true;

  pushTrace({
    kind: 'click',
    stage: 'feed_like',
    noteId: candidate.noteId,
    center: candidate.center,
    selectorChanged,
    preShot,
    postShot,
    postStatus,
  });

  return {
    ok: selectorChanged,
    code: selectorChanged ? 'LIKE_DONE' : 'LIKE_SELECTOR_NOT_CHANGED',
    noteId: candidate.noteId,
    preShot,
    postShot,
    selectorChanged,
  };
}

/**
 * 鎵ц鍗?Tab 鍗曡疆鐐硅禐锛堢偣 N 涓悗杩斿洖锛岀敱璋冨害灞傛帶鍒?Tab 鍒囨崲锛?
 *
 * - 姣忚疆鐐?likesPerRound 涓紙榛樿 5锛夛紝涓嶈冻鍒欑偣褰撳墠椤垫墍鏈?unliked
 * - 褰撳墠椤电偣瀹?鈫?婊氬姩鍒颁笅涓€椤电户缁壘 unliked
 * - 褰撳墠 Tab 鍒板簳 鈫?杩斿洖 tabExhausted: true
 * - 鍗曟 click 澶辫触 鈫?skip锛屼笉闃诲
 *
 * @returns {{ ok: boolean, code: string, data: { roundLiked, roundSkipped, tabExhausted } }}
 */
export async function executeFeedLikeOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();

  const likesPerRound = Math.max(1, Number(params.likesPerRound ?? LIKES_PER_ROUND) || LIKES_PER_ROUND);
  const minTopSafePx = Math.max(60, Number(params.minTopSafePx ?? 90) || 90);
  const likeIntervalMinMs = Math.max(500, Number(params.likeIntervalMinMs ?? 1000) || 1000);
  const likeIntervalMaxMs = Math.max(likeIntervalMinMs, Number(params.likeIntervalMaxMs ?? 5000) || 5000);
  const noCandidateLimit = Math.max(1, Number(params.noCandidateLimit ?? 10) || 10);
  const keywords = resolveFeedLikeKeywords(params);

  if (!state.feedLikeTabState || !keywordsEqual(state.feedLikeTabState.tabKeywords || [], keywords)) {
    state.feedLikeTabState = {
      currentTabIndex: 0,
      tabKeywords: [...keywords],
      tabsOpened: 0,
    };
    state.feedLikeTabStates = {};
    state.feedLikeGlobalState = { totalLiked: 0, totalSkipped: 0 };
  }

  // 获取当前 Tab 的点赞状态
  const tabState = state.feedLikeTabState;
  const currentTabIndex = tabState?.currentTabIndex ?? 0;
  if (!state.feedLikeTabStates) {
    state.feedLikeTabStates = {};
  }
  if (!state.feedLikeTabStates[currentTabIndex]) {
    state.feedLikeTabStates[currentTabIndex] = {
      likedNoteIds: new Set(),
      failedNoteCounts: new Map(),
      blockedNoteIds: new Set(),
      seenWindowSignatures: new Set(),
      scrollCount: 0,
      exhausted: false,
      noCandidateDown: 0,
      noCandidateUp: 0,
      scrollDirection: 'down',
    };
  }
  const tabData = state.feedLikeTabStates[currentTabIndex];
  const desiredKeyword = tabState?.tabKeywords?.[currentTabIndex];
  if (desiredKeyword && String(tabData.keyword || '') !== String(desiredKeyword)) {
    tabData.pendingKeyword = desiredKeyword;
    tabData.pendingKeywordAttempts = 0;
  }

  if (tabData.pendingKeyword) {
    const searchKeyword = String(tabData.pendingKeyword || '').trim();
    tabData.pendingKeywordAttempts = Number(tabData.pendingKeywordAttempts || 0) + 1;
    emitOperationProgress(context, {
      kind: 'feed_like_search_new_tab',
      stage: 'feed_like',
      keyword: searchKeyword,
      tabIndex: currentTabIndex,
      attempt: tabData.pendingKeywordAttempts,
    });

    try {
      const searchInput = await waitForAnchor(profileId, {
        selectors: ['#search-input', 'input.search-input'],
        timeoutMs: 5000,
        intervalMs: 300,
        description: 'feed_like_search_input',
      }).catch(() => null);

      if (searchInput?.ok && searchKeyword) {
        await fillInputValue(profileId, ['#search-input', 'input.search-input'], searchKeyword);
        await pressKey(profileId, 'Enter');
        await waitForAnchor(profileId, {
          selectors: [
            '#search-result .note-item:has(a.cover)',
            '.search-result-list .note-item:has(a.cover)',
            '.feeds-container .note-item:has(a.cover)',
          ],
          timeoutMs: 12000,
          intervalMs: 400,
          description: 'feed_like_search_results',
        }).catch(() => null);
        tabData.keyword = searchKeyword;
        tabData.pendingKeyword = null;
        tabData.pendingKeywordAttempts = 0;
      }
    } catch (err) {
      emitOperationProgress(context, {
        kind: 'feed_like_search_error',
        stage: 'feed_like',
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
  if (!(tabData.likedNoteIds instanceof Set)) {
    tabData.likedNoteIds = new Set(Array.isArray(tabData.likedNoteIds) ? tabData.likedNoteIds : []);
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

  // 鍏ㄥ眬缁熻
  if (!state.feedLikeGlobalState) {
    state.feedLikeGlobalState = { totalLiked: 0, totalSkipped: 0 };
  }

  let roundLiked = 0;
  let roundSkipped = 0;
  let scrollCount = tabData.scrollCount || 0;
  let emptyScanRetries = 0;
  let tabExhausted = false;
  let noCandidateDown = Number(tabData.noCandidateDown || 0);
  let noCandidateUp = Number(tabData.noCandidateUp || 0);
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

    // 鎵弿
    let scan;
    try {
      scan = await readFeedLikeCandidates(profileId, { maxCandidates: 100, minTopSafePx });
    } catch {
      emitOperationProgress(context, { kind: 'feed_like_scan_error', stage: 'feed_like' });
      tabExhausted = true;
      break;
    }

    if (!scan?.ok || scan.candidates.length === 0) {
      emitOperationProgress(context, {
        kind: 'feed_like_scan_empty',
        stage: 'feed_like',
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
          description: 'feed_like_scan_empty_settle',
        }).catch(() => null);
        continue;
      }

      // keep probing by scrolling; do not mark exhausted here
    }

    emptyScanRetries = 0;

    const keyword = tabData.keyword || tabState?.tabKeywords?.[currentTabIndex] || params.keyword || 'unknown';
    const unliked = scan.candidates
      .map((c) => ({ ...c, keyword }))
      .filter((c) => !c.liked && c.noteId && !tabData.likedNoteIds.has(c.noteId));

    const failedCounts = tabData.failedNoteCounts || new Map();
    const blocked = tabData.blockedNoteIds || new Set();
    const filteredUnliked = unliked.filter((c) => !blocked.has(c.noteId) && !failedCounts.has(c.noteId));

    tabData.unlikedCount = filteredUnliked.length;

    emitOperationProgress(context, {
      kind: 'feed_like_scan_result',
      stage: 'feed_like',
      tabIndex: currentTabIndex,
      keyword,
      totalCount: scan.totalCount,
      unlikedCount: filteredUnliked.length,
      alreadyLiked: scan.likedCount,
      seenWindows: tabData.seenWindowSignatures.size,
      roundLiked,
      roundSkipped,
    });

    // 褰撳墠椤垫病鏈?unliked 鈫?婊氬姩鍒颁笅涓€椤?
    if (filteredUnliked.length === 0) {
      const beforeWindow = await readFeedWindowSignature(profileId).catch(() => null);
      const beforeSignature = String(beforeWindow?.signature || '').trim();
      if (beforeSignature) tabData.seenWindowSignatures.add(beforeSignature);

      try {
        await pressKey(profileId, scrollDirection === 'up' ? 'PageUp' : 'PageDown');
      } catch {
        emitOperationProgress(context, { kind: 'feed_like_scroll_key_error', stage: 'feed_like' });
        tabExhausted = true;
        tabData.exhausted = true;
        break;
      }

      let changed = false;
      try {
        const changedResult = await waitForFeedWindowChange(profileId, beforeSignature);
        changed = changedResult?.ok === true;
      } catch {
        // ignore
      }

      const afterWindow = await readFeedWindowSignature(profileId).catch(() => null);
      const afterSignature = String(afterWindow?.signature || '').trim();
      if (afterSignature) tabData.seenWindowSignatures.add(afterSignature);

      const progressed = changed || (beforeSignature && afterSignature && beforeSignature !== afterSignature);
      if (scrollDirection === 'up') {
        noCandidateUp += 1;
      } else {
        noCandidateDown += 1;
      }
      tabData.noCandidateDown = noCandidateDown;
      tabData.noCandidateUp = noCandidateUp;

      scrollCount += 1;
      tabData.scrollCount = scrollCount;
      emitOperationProgress(context, {
        kind: 'feed_like_scroll_probe',
        stage: 'feed_like',
        tabIndex: currentTabIndex,
        scrollCount,
        scrollDirection,
        noCandidateDown,
        noCandidateUp,
        progressed,
        beforeSignature: beforeSignature ? beforeSignature.slice(0, 120) : null,
        afterSignature: afterSignature ? afterSignature.slice(0, 120) : null,
      });

      const directionLimitReached = scrollDirection === 'up'
        ? noCandidateUp >= noCandidateLimit
        : noCandidateDown >= noCandidateLimit;
      const shouldSwitchDirection = !progressed || directionLimitReached;
      if (shouldSwitchDirection) {
        scrollDirection = scrollDirection === 'up' ? 'down' : 'up';
        tabData.scrollDirection = scrollDirection;
      }

      if (noCandidateDown >= noCandidateLimit && noCandidateUp >= noCandidateLimit) {
        emitOperationProgress(context, {
          kind: 'feed_like_scroll_exhausted',
          stage: 'feed_like',
          scrollCount,
          noCandidateDown,
          noCandidateUp,
        });
        tabExhausted = true;
        tabData.exhausted = true;
        break;
      }
      continue;
    }

    // 闅忔満閫夋嫨涓€涓€欓€?
    noCandidateDown = 0;
    noCandidateUp = 0;
    tabData.noCandidateDown = 0;
    tabData.noCandidateUp = 0;

    const randomIndex = Math.floor(Math.random() * filteredUnliked.length);
    const candidate = filteredUnliked[randomIndex];

    const result = await executeFeedLikeClick({ profileId, candidate, pushTrace });

    if (result.ok) {
      roundLiked += 1;
      state.feedLikeGlobalState.totalLiked += 1;
      if (candidate.noteId) tabData.likedNoteIds.add(candidate.noteId);

      emitOperationProgress(context, {
        kind: 'feed_like_done',
        stage: 'feed_like',
        tabIndex: currentTabIndex,
        noteId: candidate.noteId,
        selectorChanged: result.selectorChanged === true,
        roundLiked,
        roundSkipped,
        totalLiked: state.feedLikeGlobalState.totalLiked,
      });

      // 闅忔満闂撮殧锛堥鎺э級
      if (roundLiked < likesPerRound) {
        await sleepRandom(likeIntervalMinMs, likeIntervalMaxMs, null, 'feed_like_interval');
      }
    } else {
      roundSkipped += 1;
      state.feedLikeGlobalState.totalSkipped += 1;

      if (result.code === 'ALREADY_LIKED' && candidate.noteId) {
        tabData.likedNoteIds.add(candidate.noteId);
      } else if (candidate.noteId) {
        const prevCount = Number(tabData.failedNoteCounts?.get(candidate.noteId) || 0);
        const nextCount = prevCount + 1;
        tabData.failedNoteCounts?.set(candidate.noteId, nextCount);
        if (nextCount >= MAX_CLICK_FAILURES_PER_NOTE) {
          tabData.blockedNoteIds?.add(candidate.noteId);
        }
      }

      emitOperationProgress(context, {
        kind: 'feed_like_click_failed',
        stage: 'feed_like',
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

  // 姣忚疆鐐瑰畬 likesPerRound 涓悗锛屽垏鎹㈠埌涓嬩竴涓?Tab锛堣疆杞級
  const switchResult = await executeFeedLikeTabSwitch({ profileId, params, context });
  if (switchResult.code === 'ALL_TABS_DONE') {
    return {
      ok: true,
      code: 'ALL_TABS_EXHAUSTED',
      data: {
        tabIndex: currentTabIndex,
        roundLiked,
        totalLiked: state.feedLikeGlobalState.totalLiked,
        totalSkipped: state.feedLikeGlobalState.totalSkipped,
      },
    };
  }

  // 鏂?Tab 闇€瑕佹悳绱㈠叧閿瓧
  if (switchResult.data?.needSearch && switchResult.data?.keyword) {
    const searchKeyword = switchResult.data.keyword;
    const state2 = getProfileState(profileId);
    const latestTabState = state2.feedLikeTabState || { currentTabIndex: 0 };
    if (state2.feedLikeTabStates) {
      const newTabIndex = latestTabState.currentTabIndex ?? 0;
      state2.feedLikeTabStates[newTabIndex] = state2.feedLikeTabStates[newTabIndex] || {};
      state2.feedLikeTabStates[newTabIndex].pendingKeyword = searchKeyword;
    }

    // 搜索在 tab 激活时通过 pendingKeyword 触发
  }

  // 閫掑綊锛氬湪鏂?Tab 涓婄户缁偣璧?
  return executeFeedLikeOperation({ profileId, params, context });
}

/**
 * 澶?Tab 杞浆鎿嶄綔
 *
 * 绛栫暐: Tab1 鈫?Tab2 鈫?Tab3 鈫?Tab4 鈫?Tab1 鈫?... 寰幆
 * - 宸叉湁 Tab 鈫?page:switch 鍒囨崲
 * - 杩樻湁鏈娇鐢ㄧ殑 keyword 鈫?鎵撳紑鏂?Tab + 鎼滅储
 * - 鎵€鏈?Tab 閮?exhausted 鈫?杩斿洖 ALL_TABS_DONE
 *
 * keywords 瑙勫垯: 鏈€澶?4 涓紝涓嶈冻鍒欐湁澶氬皯鐢ㄥ灏戯紝瓒呰繃鎴柇
 */
export async function executeFeedLikeTabSwitch({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);

  const keywords = resolveFeedLikeKeywords(params);

  // 鍒濆鍖?Tab 鐘舵€?
  if (!state.feedLikeTabState) {
    state.feedLikeTabState = {
      currentTabIndex: 0,
      tabKeywords: [...keywords],
      tabsOpened: 0,
    };
  }
  if (!state.feedLikeTabStates) {
    state.feedLikeTabStates = {};
  }
  if (!state.feedLikeGlobalState) {
    state.feedLikeGlobalState = { totalLiked: 0, totalSkipped: 0 };
  }

  const tabState = state.feedLikeTabState;
  const effectiveKeywords = tabState.tabKeywords.length > 0 ? tabState.tabKeywords : keywords;

  // 鑾峰彇褰撳墠娴忚鍣?tab 鍒楄〃
  const pageList = await safeCallAPI('page:list', { profileId }, 10000);
  const pages = pageList?.pages || pageList?.data?.pages || [];
  if (pages.length === 0) {
    return { ok: true, code: 'PAGE_LIST_EMPTY', message: 'no tabs available' };
  }

  const activeTabCount = pages.length;

  // 妫€鏌ュ綋鍓?Tab 鏄惁宸?exhausted
  const currentTabIndex = tabState.currentTabIndex ?? 0;
  const currentTabData = state.feedLikeTabStates[currentTabIndex];
  const currentExhausted = currentTabData?.exhausted === true;

  // 鍐冲畾涓嬩竴涓?Tab 绱㈠紩锛堣疆杞級
  let nextTabIndex;
  if (currentExhausted) {
    // 褰撳墠 Tab 宸插埌搴曪紝鍒囧埌涓嬩竴涓?
    nextTabIndex = (currentTabIndex + 1) % Math.max(activeTabCount, 1);
  } else {
    // 褰撳墠 Tab 鏈埌搴曚絾鏈疆鐐瑰浜嗭紝姝ｅ父杞浆鍒颁笅涓€涓?
    nextTabIndex = (currentTabIndex + 1) % Math.max(activeTabCount, 1);
  }

  // 妫€鏌ユ墍鏈?Tab 鏄惁閮藉凡 exhausted
  let allExhausted = true;
  for (let i = 0; i < activeTabCount; i += 1) {
    if (state.feedLikeTabStates[i]?.exhausted !== true) {
      allExhausted = false;
      break;
    }
  }

  if (allExhausted && tabState.tabsOpened >= effectiveKeywords.length) {
    emitOperationProgress(context, {
      kind: 'feed_like_all_tabs_done',
      stage: 'feed_like',
      totalTabs: tabState.tabsOpened,
      totalLiked: state.feedLikeGlobalState.totalLiked,
      totalSkipped: state.feedLikeGlobalState.totalSkipped,
    });
    return {
      ok: true,
      code: 'ALL_TABS_DONE',
      message: 'all feed tabs exhausted',
      data: {
        totalTabs: tabState.tabsOpened,
        totalLiked: state.feedLikeGlobalState.totalLiked,
        totalSkipped: state.feedLikeGlobalState.totalSkipped,
      },
    };
  }

  // 妫€鏌ユ槸鍚﹂渶瑕佹墦寮€鏂?Tab锛堣繕鏈夋湭浣跨敤鐨?keyword锛?
  const needNewTab = tabState.tabsOpened < effectiveKeywords.length && activeTabCount < MAX_FEED_TABS;

  if (needNewTab) {
    const nextKeywordIndex = tabState.tabsOpened;
    const nextKeyword = effectiveKeywords[nextKeywordIndex];
    if (!nextKeyword) {
      // 涓嶅簲璇ュ埌杩欓噷锛屼絾瀹夊叏淇濇姢
      tabState.tabsOpened = effectiveKeywords.length;
    } else {
      const newTabResult = await safeCallAPI('newTab', { profileId, url: 'https://www.xiaohongshu.com/explore' }, 15000);
      if (!newTabResult) {
        return { ok: true, code: 'NEW_TAB_FAILED', message: 'newTab failed' };
      }

      // 閿氱偣绛夊緟
      try {
        await waitForAnchor(profileId, {
          selectors: ['#search-input', '.note-item', '.feeds-container', '.explore-page'],
          timeoutMs: 8000,
          intervalMs: 300,
          description: 'feed_like_new_tab_settle',
        });
      } catch {
        // anchor timeout, continue
      }

      const newList = await safeCallAPI('page:list', { profileId }, 5000);
      const newPages = newList?.pages || newList?.data?.pages || [];
      if (newPages.length > 0) {
        const newTab = newPages[newPages.length - 1];
        await safeCallAPI('page:switch', { profileId, index: newTab.index }, 10000);
      }

      tabState.tabsOpened += 1;
      tabState.currentTabIndex = newPages.length > 0 ? newPages.length - 1 : tabState.currentTabIndex;

      // 鍒濆鍖栨柊 Tab 鐘舵€?
      state.feedLikeTabStates[tabState.currentTabIndex] = {
        likedNoteIds: new Set(),
        seenWindowSignatures: new Set(),
        scrollCount: 0,
        exhausted: false,
        noCandidateDown: 0,
        noCandidateUp: 0,
        scrollDirection: 'down',
        pendingKeyword: nextKeyword,
      };

      emitOperationProgress(context, {
        kind: 'feed_like_new_tab_opened',
        stage: 'feed_like',
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

  // 鍒囨崲鍒颁笅涓€涓?Tab锛堣疆杞級
  if (nextTabIndex < activeTabCount) {
    const switchResult = await safeCallAPI('page:switch', { profileId, index: pages[nextTabIndex].index }, 10000);
    if (!switchResult) {
      return { ok: true, code: 'TAB_SWITCH_FAILED', message: 'page:switch failed' };
    }

    // 閿氱偣绛夊緟
    try {
      await waitForAnchor(profileId, {
        selectors: ['#search-input', '.note-item', '.feeds-container'],
        timeoutMs: 5000,
        intervalMs: 300,
        description: 'feed_like_tab_switch_settle',
      });
    } catch {
      // anchor timeout, continue
    }

    tabState.currentTabIndex = nextTabIndex;

    emitOperationProgress(context, {
      kind: 'feed_like_tab_switched',
      stage: 'feed_like',
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
      totalLiked: state.feedLikeGlobalState.totalLiked,
      totalSkipped: state.feedLikeGlobalState.totalSkipped,
    },
  };
}
