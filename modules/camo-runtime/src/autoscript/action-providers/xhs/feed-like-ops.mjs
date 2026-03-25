/**
 * Feed-like operations: 点赞搜索结果列表中的 note-item
 *
 * 防阻塞原则：
 * - 每个 await 调用都有超时保护或 try-catch
 * - 固定 sleep 替换为锚点等待（ waitForAnchor ）
 * - 单次点赞失败不阻塞主流程（ catch + skip ）
 * - tab 切换用锚点等待页面就绪而非固定延时
 */

import { callAPI } from '../../../utils/browser-service.mjs';
import path from 'node:path';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitOperationProgress } from './trace.mjs';
import { evaluateReadonly, clickPoint, waitForAnchor, sleepRandom, pressKey } from './dom-ops.mjs';
import { captureScreenshotToFile } from './diagnostic-utils.mjs';

const NOTE_ITEM_SELECTOR = '.note-item';
const NOTE_LIKED_USE_SELECTORS = [
  'svg.reds-icon.like-icon use[*|href="#liked"]',
  'svg.reds-icon.like-icon use[href="#liked"]',
  'svg.reds-icon.like-icon use[xlink\\:href="#liked"]',
];

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

/** 安全 callAPI 包装：超时后返回 null 而非抛异常 */
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
 * 读取当前搜索结果页面上所有可见的 note-item 及其点赞状态
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

      // 点击目标必须尽量落在图标本体，避免命中 wrapper 中的计数文本区域
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
      const hitMatches = !!hit && (
        hit === likeBtn
        || likeBtn.contains(hit)
        || hit.contains(likeBtn)
        || !!hit.closest('svg.reds-icon.like-icon')
        || !!hit.closest('.like-lottie')
      );
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
 * 执行单次点赞操作（防阻塞：超时 + try-catch）
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

  // 构建针对特定 noteId 的 like-active 选择器
  // 小红书的 DOM: .note-item 内有 .like-wrapper.like-active 或 .like-lottie.like-active
  const noteId = String(candidate?.noteId || '').trim();
  const likeActiveSelectors = noteId
    ? [
        `.note-item a.cover[href*="${noteId}"] ~ .footer .like-wrapper svg.reds-icon.like-icon use[href="#liked"]`,
        `.note-item a.cover[href*="${noteId}"] ~ .footer .like-wrapper svg.reds-icon.like-icon use[xlink\\:href="#liked"]`,
      ]
    : [];

  // click 前用锚点检查是否已经 liked（避免重复点击）
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
    await clickPoint(profileId, candidate.center, { clicks: 1, timeoutMs: 10000 });
  } catch {
    pushTrace({
      kind: 'skip',
      stage: 'feed_like',
      noteId: candidate.noteId,
      reason: 'click_timeout_or_error',
    });
    return { ok: false, code: 'CLICK_FAILED', noteId: candidate.noteId, preShot };
  }

  // click 后用锚点等待 .like-active 出现（不用 evaluate）
  const postSelector = likeActiveSelectors.length > 0
    ? await waitForAnchor(profileId, {
        selectors: likeActiveSelectors,
        timeoutMs: 5000,
        intervalMs: 200,
        description: 'feed_like_selector_turned_active',
      }).catch(() => ({ ok: false, reason: 'anchor_timeout' }))
    : { ok: false, reason: 'no_noteId' };

  // 简单的 postStatus（只用锚点结果，不用 evaluate）
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
 * 执行搜索结果点赞操作（主入口）
 *
 * 防阻塞原则：
 * - scan 失败 → 退出（不重试 scan）
 * - 单次 click 失败 → skip，继续下一个
 * - 滚动后用锚点等待而非固定 sleep
 * - 整个函数永远返回 ok: true（局部失败不阻止完成）
 */
export async function executeFeedLikeOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();

  const maxLikes = Math.max(1, Number(params.maxLikesPerRound ?? params.maxLikes ?? 10) || 10);
  const minTopSafePx = Math.max(60, Number(params.minTopSafePx ?? 90) || 90);
  const likeIntervalMinMs = Math.max(500, Number(params.likeIntervalMinMs ?? 1000) || 1000);
  const likeIntervalMaxMs = Math.max(likeIntervalMinMs, Number(params.likeIntervalMaxMs ?? 5000) || 5000);
  const maxNoProgressScrolls = Math.max(1, Number(params.maxNoProgressScrolls ?? 3) || 3);
  const rollbackMin = Math.max(1, Number(params.rollbackMin ?? 3) || 3);
  const rollbackMax = Math.max(rollbackMin, Number(params.rollbackMax ?? 5) || 5);

  if (!state.feedLikeState) {
    state.feedLikeState = {
      totalLiked: 0,
      totalSkipped: 0,
      likedNoteIds: new Set(),
      seenWindowSignatures: new Set(),
      scrollCount: 0,
    };
  }
  if (!(state.feedLikeState.likedNoteIds instanceof Set)) {
    state.feedLikeState.likedNoteIds = new Set(Array.isArray(state.feedLikeState.likedNoteIds) ? state.feedLikeState.likedNoteIds : []);
  }
  if (!(state.feedLikeState.seenWindowSignatures instanceof Set)) {
    state.feedLikeState.seenWindowSignatures = new Set(Array.isArray(state.feedLikeState.seenWindowSignatures) ? state.feedLikeState.seenWindowSignatures : []);
  }

  let roundLiked = 0;
  let roundSkipped = 0;
  let scrollCount = state.feedLikeState.scrollCount || 0;
  let noProgressScrolls = 0;
  let rollbackCycles = 0;
  let emptyScanRetries = 0;

  while (roundLiked < maxLikes) {
    // 扫描：失败直接退出（环境异常，继续无意义）
    let scan;
    try {
      scan = await readFeedLikeCandidates(profileId, { maxCandidates: 100, minTopSafePx });
    } catch {
      emitOperationProgress(context, { kind: 'feed_like_scan_error', stage: 'feed_like' });
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

      // 搜索结果刚渲染时可能出现短暂空窗口：用锚点等待，不做固定 sleep
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

      break;
    }

    emptyScanRetries = 0;

    const unliked = scan.candidates
      .map((c) => ({ ...c, keyword: params.keyword || state.keyword || 'unknown' }))
      .filter((c) => !c.liked && c.noteId && !state.feedLikeState.likedNoteIds.has(c.noteId));

    state.feedLikeState.unlikedCount = unliked.length;

    emitOperationProgress(context, {
      kind: 'feed_like_scan_result',
      stage: 'feed_like',
      totalCount: scan.totalCount,
      unlikedCount: unliked.length,
      alreadyLiked: scan.likedCount,
      seenWindows: state.feedLikeState.seenWindowSignatures.size,
      roundLiked,
      roundSkipped,
    });

    if (unliked.length === 0) {
      const beforeWindow = await readFeedWindowSignature(profileId).catch(() => null);
      const beforeSignature = String(beforeWindow?.signature || '').trim();
      if (beforeSignature) state.feedLikeState.seenWindowSignatures.add(beforeSignature);

      try {
        await pressKey(profileId, 'PageDown');
      } catch {
        emitOperationProgress(context, { kind: 'feed_like_scroll_key_error', stage: 'feed_like' });
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
      if (afterSignature) state.feedLikeState.seenWindowSignatures.add(afterSignature);

      const progressed = changed || (beforeSignature && afterSignature && beforeSignature !== afterSignature);
      if (progressed) {
        noProgressScrolls = 0;
      } else {
        noProgressScrolls += 1;
      }

      scrollCount += 1;
      state.feedLikeState.scrollCount = scrollCount;
      emitOperationProgress(context, {
        kind: 'feed_like_scroll_probe',
        stage: 'feed_like',
        scrollCount,
        noProgressScrolls,
        progressed,
        beforeSignature: beforeSignature ? beforeSignature.slice(0, 120) : null,
        afterSignature: afterSignature ? afterSignature.slice(0, 120) : null,
      });

      if (noProgressScrolls >= maxNoProgressScrolls) {
        const rollbackSteps = Math.floor(rollbackMin + Math.random() * (rollbackMax - rollbackMin + 1));
        emitOperationProgress(context, {
          kind: 'feed_like_scroll_rollback_start',
          stage: 'feed_like',
          rollbackSteps,
          noProgressScrolls,
        });

        const rollbackBaseSig = afterSignature || beforeSignature || '';
        for (let i = 0; i < rollbackSteps; i += 1) {
          try {
            await pressKey(profileId, 'PageUp');
            await waitForAnchor(profileId, {
              selectors: ['.note-item:has(a.cover)', '.feeds-container', '.search-result-list'],
              timeoutMs: 3000,
              intervalMs: 300,
              description: 'feed_like_rollback_pageup_settle',
            });
          } catch {
            break;
          }
        }

        try {
          await pressKey(profileId, 'PageDown');
          await waitForFeedWindowChange(profileId, rollbackBaseSig);
        } catch {
          // ignore
        }

        const rollbackAfter = await readFeedWindowSignature(profileId).catch(() => null);
        const rollbackAfterSig = String(rollbackAfter?.signature || '').trim();
        const rollbackProgressed = Boolean(rollbackAfterSig && rollbackAfterSig !== rollbackBaseSig);

        emitOperationProgress(context, {
          kind: 'feed_like_scroll_rollback_done',
          stage: 'feed_like',
          rollbackSteps,
          rollbackCycles,
          rollbackProgressed,
          rollbackBaseSig: rollbackBaseSig ? rollbackBaseSig.slice(0, 120) : null,
          rollbackAfterSig: rollbackAfterSig ? rollbackAfterSig.slice(0, 120) : null,
        });

        if (rollbackProgressed) {
          noProgressScrolls = 0;
        } else {
          rollbackCycles += 1;
          if (rollbackCycles >= 3) {
            emitOperationProgress(context, {
              kind: 'feed_like_scroll_stalled',
              stage: 'feed_like',
              scrollCount,
              noProgressScrolls,
              rollbackCycles,
              reason: 'rollback_not_progressed',
            });
            break;
          }
        }
      }
      continue;
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
        screenshotPre: result.preShot || null,
        screenshotPost: result.postShot || null,
        postStatus: result.postStatus || null,
        postSelectorOk: result.postSelector?.ok || null,
        selectorChanged: result.selectorChanged === true,
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

      // 已点赞跳过：写入本轮去重，避免同一窗口反复命中同一 noteId 形成死循环
      if (result.code === 'ALREADY_LIKED' && candidate.noteId) {
        state.feedLikeState.likedNoteIds.add(candidate.noteId);
      }

      emitOperationProgress(context, {
        kind: 'feed_like_click_failed',
        stage: 'feed_like',
        noteId: candidate.noteId,
        reason: result.code || 'unknown',
        screenshotPre: result.preShot || null,
        screenshotPost: result.postShot || null,
        postStatus: result.postStatus || null,
        postSelectorOk: result.postSelector?.ok || null,
      });
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
 * Tab ��换操作（多关键字/多 tab 场景）
 *
 * 防阻塞原则：
 * - page:switch / newTab 加超时
 * - 切换后用锚点等待而非固定 sleep
 * - 全部 try-catch 保护，任何失败返回安全的降级结果
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

  // 获取当前浏览器 tab 列表（超时保护）
  const pageList = await safeCallAPI('page:list', { profileId }, 10000);
  const pages = pageList?.pages || pageList?.data?.pages || [];
  if (pages.length === 0) {
    return { ok: true, code: 'PAGE_LIST_EMPTY', message: 'no tabs available' };
  }

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
    const switchResult = await safeCallAPI('page:switch', { profileId, index: pages[nextTabIndex].index }, 10000);
    if (!switchResult) {
      // 切换失败，不阻塞
      return { ok: true, code: 'TAB_SWITCH_FAILED', message: 'page:switch failed' };
    }

    // 锚点等待：切换 tab 后等页面就绪（最大 5s）
    try {
      await waitForAnchor(profileId, {
        selectors: ['#search-input', '.note-item', '.feeds-container'],
        timeoutMs: 5000,
        intervalMs: 300,
        description: 'feed_like_tab_switch_settle',
      });
    } catch {
      // 锚点超时，继续
    }

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
      const newTabResult = await safeCallAPI('newTab', { profileId, url: 'https://www.xiaohongshu.com/explore' }, 15000);
      if (!newTabResult) {
        return { ok: true, code: 'NEW_TAB_FAILED', message: 'newTab failed' };
      }

      // 锚点等待：新 tab 打开后等页面就绪
      try {
        await waitForAnchor(profileId, {
          selectors: ['#search-input', '.note-item', '.feeds-container', '.explore-page'],
          timeoutMs: 8000,
          intervalMs: 300,
          description: 'feed_like_new_tab_settle',
        });
      } catch {
        // 锚点超时，继续
      }

      const newList = await safeCallAPI('page:list', { profileId }, 5000);
      const newPages = newList?.pages || newList?.data?.pages || [];
      if (newPages.length > 0) {
        const newTab = newPages[newPages.length - 1];
        await safeCallAPI('page:switch', { profileId, index: newTab.index }, 10000);
      }

      state.feedLikeTabState.tabsOpened += 1;
      state.feedLikeTabState.tabKeywords.push(nextKeyword);
      state.feedLikeTabState.currentTabIndex = newPages.length > 0 ? newPages.length - 1 : state.feedLikeTabState.currentTabIndex;

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
