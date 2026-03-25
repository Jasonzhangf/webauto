/**
 * Feed-like operations: 点赞搜索结果列表中的 note-item
 *
 * 功能：
 * - 扫描当前搜索结果页面上可见的 .note-item
 * - 检测每个 note-item 上的 .like-lottie 点赞按钮状态
 * - 随机选择未点赞的候选进行点赞
 * - 支持多 tab 轮转（每个 tab 点赞 N 条后切换）
 */

import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitOperationProgress } from './trace.mjs';
import { evaluateReadonly, clickPoint, waitForAnchor, sleep, sleepRandom, pressKey } from './dom-ops.mjs';
import { readSearchViewportReady } from './search-ops.mjs';

const NOTE_ITEM_SELECTOR = '.note-item';

/**
 * 读取当前搜索结果页面上所有可见的 note-item 及其点赞状态
 */
export async function readFeedLikeCandidates(profileId, options = {}) {
  const maxCandidates = Math.max(1, Number(options.maxCandidates || 50) || 50);

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

      const likeBtn = item.querySelector('.like-lottie');
      if (!likeBtn) continue;

      const className = String(likeBtn.className || '');
      const parentClass = String(likeBtn.parentElement?.className || '');
      const ariaPressed = String(likeBtn.getAttribute('aria-pressed') || '').toLowerCase();
      const liked = /active|liked|selected|is-liked/.test(className) ||
                    /active|liked/.test(parentClass) ||
                    ariaPressed === 'true';

      const cover = item.querySelector('a.cover');
      const href = cover ? String(cover.getAttribute('href') || '') : '';
      const noteIdMatch = href.match(/\\/explore\\/([a-zA-Z0-9]+)/);
      const noteId = noteIdMatch ? noteIdMatch[1] : null;

      const rect = likeBtn.getBoundingClientRect();
      const center = {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };

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
 * 执行单次点赞操作
 */
async function executeFeedLikeClick({ profileId, candidate, pushTrace }) {
  if (!candidate || !candidate.center) {
    return { ok: false, code: 'INVALID_CANDIDATE', message: 'candidate missing or no center point' };
  }

  await clickPoint(profileId, candidate.center, { steps: 2 });

  await waitForAnchor(profileId, {
    selectors: ['.note-item', '.feeds-container'],
    timeoutMs: 3000,
    intervalMs: 200,
    description: 'feed_like_post_click_settle',
  });

  pushTrace({
    kind: 'click',
    stage: 'feed_like',
    noteId: candidate.noteId,
    center: candidate.center,
  });

  return { ok: true, code: 'LIKE_DONE', noteId: candidate.noteId };
}

/**
 * 执行搜索结果点赞操作（主入口）
 *
 * 流程：
 * 1. 扫描当前可见的 note-item
 * 2. 筛选未点赞的候选
 * 3. 随机选择并点赞
 * 4. 重复直到达到 maxLikes 或无可选候选
 * 5. 需要时滚动加载更多
 */
export async function executeFeedLikeOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();

  const maxLikes = Math.max(1, Number(params.maxLikesPerRound ?? params.maxLikes ?? 10) || 10);
  const likeIntervalMinMs = Math.max(500, Number(params.likeIntervalMinMs ?? 1000) || 1000);
  const likeIntervalMaxMs = Math.max(likeIntervalMinMs, Number(params.likeIntervalMaxMs ?? 5000) || 5000);
  const maxScrolls = Math.max(1, Number(params.maxScrolls ?? 5) || 5);
  const scrollDelayMs = Math.max(500, Number(params.scrollDelayMs ?? 1500) || 1500);

  if (!state.feedLikeState) {
    state.feedLikeState = { totalLiked: 0, totalSkipped: 0, likedNoteIds: new Set(), scrollCount: 0 };
  }

  let roundLiked = 0;
  let roundSkipped = 0;
  let scrollCount = state.feedLikeState.scrollCount || 0;

  while (roundLiked < maxLikes && scrollCount <= maxScrolls) {
    const scan = await readFeedLikeCandidates(profileId, { maxCandidates: 100 });

    if (!scan?.ok || scan.candidates.length === 0) {
      emitOperationProgress(context, {
        kind: 'feed_like_scan_empty',
        stage: 'feed_like',
        scrollCount,
        roundLiked,
        roundSkipped,
      });
      break;
    }

    const unliked = scan.candidates.filter(
      (c) => !c.liked && c.noteId && !state.feedLikeState.likedNoteIds.has(c.noteId),
    );

    // 保存 unlikedCount 供 tab-switch 判断
    state.feedLikeState.unlikedCount = unliked.length;

    emitOperationProgress(context, {
      kind: 'feed_like_scan_result',
      stage: 'feed_like',
      totalCount: scan.totalCount,
      unlikedCount: unliked.length,
      alreadyLiked: scan.likedCount,
      roundLiked,
      roundSkipped,
    });

    if (unliked.length === 0) {
      if (scrollCount < maxScrolls) {
        await pressKey(profileId, 'PageDown');
        await sleep(scrollDelayMs);
        scrollCount += 1;
        state.feedLikeState.scrollCount = scrollCount;
        continue;
      }
      break;
    }

    // 随机选择一个候选
    const randomIndex = Math.floor(Math.random() * unliked.length);
    const candidate = unliked[randomIndex];

    const result = await executeFeedLikeClick({ profileId, candidate, pushTrace });

    if (result.ok) {
      roundLiked += 1;
      state.feedLikeState.totalLiked += 1;
      if (candidate.noteId) state.feedLikeState.likedNoteIds.add(candidate.noteId);

      emitOperationProgress(context, {
        kind: 'feed_like_done',
        stage: 'feed_like',
        noteId: candidate.noteId,
        roundLiked,
        roundSkipped,
      });

      // 随机间隔（风控）
      if (roundLiked < maxLikes) {
        await sleepRandom(likeIntervalMinMs, likeIntervalMaxMs, null, 'feed_like_interval');
      }
    } else {
      roundSkipped += 1;
      state.feedLikeState.totalSkipped += 1;
    }
  }

  return {
    ok: true,
    code: 'FEED_LIKE_ROUND_DONE',
    data: {
      roundLiked,
      roundSkipped,
      scrollCount,
      totalLiked: state.feedLikeState.totalLiked,
      totalSkipped: state.feedLikeState.totalSkipped,
    },
  };
}

/**
 * Tab 切换操作（多关键字/多 tab 场景）
 */
export async function executeFeedLikeTabSwitch({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);

  const maxFeedTabs = Math.max(1, Number(params.maxFeedTabs ?? 5) || 5);
  const keywords = Array.isArray(params.keywords)
    ? params.keywords
    : (params.keywords
        ? String(params.keywords)
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
        : []);
  const maxLikesPerTab = Math.max(1, Number(params.maxLikesPerTab ?? 10) || 10);

  if (!state.feedLikeTabState) {
    state.feedLikeTabState = { currentTabIndex: 0, tabKeywords: [], tabsOpened: 0 };
  }

  // 获取当前浏览器 tab 列表
  const pageList = await callAPI('page:list', { profileId });
  const pages = pageList?.pages || pageList?.data?.pages || [];

  // 如果当前 tab 还没点赞够且有未点赞候选，不切换
  const currentTabLikes = state.feedLikeState?.totalLiked || 0;
  const unlikedCount = state.feedLikeState?.unlikedCount || 0;

  if (currentTabLikes < maxLikesPerTab && unlikedCount > 0) {
    return {
      ok: true,
      code: 'TAB_SWITCH_SKIPPED',
      message: 'current tab not exhausted',
      data: { currentTabLikes, maxLikesPerTab },
    };
  }

  // 尝试切换到下一个已存在的 tab
  const nextTabIndex = state.feedLikeTabState.currentTabIndex + 1;

  if (nextTabIndex < pages.length && nextTabIndex < maxFeedTabs) {
    await callAPI('page:switch', { profileId, index: pages[nextTabIndex].index });
    await sleep(2000);
    state.feedLikeTabState.currentTabIndex = nextTabIndex;

    // 重置当前 tab 的点赞状态
    state.feedLikeState = { totalLiked: 0, totalSkipped: 0, likedNoteIds: new Set(), scrollCount: 0 };

    return {
      ok: true,
      code: 'TAB_SWITCH_DONE',
      message: 'switched to existing tab',
      data: { newTabIndex: nextTabIndex },
    };
  }

  // 如果还有未使用的关键字，打开新 tab 并搜索
  if (keywords.length > 0 && state.feedLikeTabState.tabsOpened < keywords.length && pages.length < maxFeedTabs) {
    const nextKeywordIndex = state.feedLikeTabState.tabsOpened;
    const nextKeyword = keywords[nextKeywordIndex];

    if (nextKeyword) {
      await callAPI('newTab', { profileId, url: 'https://www.xiaohongshu.com/explore' });
      await sleep(2000);

      const newList = await callAPI('page:list', { profileId });
      const newPages = newList?.pages || newList?.data?.pages || [];
      if (newPages.length > 0) {
        const newTab = newPages[newPages.length - 1];
        await callAPI('page:switch', { profileId, index: newTab.index });
        await sleep(1000);
      }

      state.feedLikeTabState.tabsOpened += 1;
      state.feedLikeTabState.tabKeywords.push(nextKeyword);
      state.feedLikeTabState.currentTabIndex = newPages.length - 1;

      // 重置点赞状态并标记待搜索关键字
      state.feedLikeState = {
        totalLiked: 0,
        totalSkipped: 0,
        likedNoteIds: new Set(),
        scrollCount: 0,
        pendingKeyword: nextKeyword,
      };

      return {
        ok: true,
        code: 'NEW_TAB_OPENED',
        message: 'opened new tab with new keyword',
        data: { newTabIndex: state.feedLikeTabState.currentTabIndex, keyword: nextKeyword, needSearch: true },
      };
    }
  }

  // 所有 tab 都已处理完毕
  return {
    ok: true,
    code: 'ALL_TABS_DONE',
    message: 'all feed tabs processed',
    data: { totalTabs: state.feedLikeTabState.tabsOpened, totalLiked: state.feedLikeState?.totalLiked || 0 },
  };
}
