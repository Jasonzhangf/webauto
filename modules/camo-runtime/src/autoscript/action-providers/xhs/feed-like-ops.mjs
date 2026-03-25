/**
 * Feed-like operations: 点赞搜索结果列表中的 note-item
 *
 * 多 Tab 轮转策略:
 * - 每个 keyword 打开一个搜索 Tab（最多 4 个 Tab）
 * - Tab1 点 5 个 → Tab2 点 5 个 → Tab3 点 5 个 → Tab4 点 5 个 → Tab1 点 5 个 → ...
 * - 每个 Tab 内 5 个候选随机选择
 * - 当前页点完滚动到下一页继续
 * - 所有 Tab 到底 → 完成
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
const MAX_FEED_TABS = 4; // 最多 4 个 Tab
const LIKES_PER_ROUND = 5; // 每 Tab 每轮点 5 个

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

  const noteId = String(candidate?.noteId || '').trim();
  // 必须使用 [*|href="#liked"]：xlink:href 是命名空间属性，普通 CSS 不匹配
  const likeActiveSelectors = noteId
    ? [
        `.note-item a.cover[href*="${noteId}"] ~ .footer .like-wrapper svg.reds-icon.like-icon use[*|href="#liked"]`,
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
 * 执行单 Tab 单轮点赞（点 N 个后返回，由调度层控制 Tab 切换）
 *
 * - 每轮点 likesPerRound 个（默认 5），不足则点当前页所有 unliked
 * - 当前页点完 → 滚动到下一页继续找 unliked
 * - 当前 Tab 到底 → 返回 tabExhausted: true
 * - 单次 click 失败 → skip，不阻塞
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
  const maxNoProgressScrolls = Math.max(1, Number(params.maxNoProgressScrolls ?? 3) || 3);
  const rollbackMin = Math.max(1, Number(params.rollbackMin ?? 3) || 3);
  const rollbackMax = Math.max(rollbackMin, Number(params.rollbackMax ?? 5) || 5);

  // 获取当前 Tab 的点赞状态
  const tabState = state.feedLikeTabState;
  const currentTabIndex = tabState?.currentTabIndex ?? 0;
  if (!state.feedLikeTabStates) {
    state.feedLikeTabStates = {};
  }
  if (!state.feedLikeTabStates[currentTabIndex]) {
    state.feedLikeTabStates[currentTabIndex] = {
      likedNoteIds: new Set(),
      seenWindowSignatures: new Set(),
      scrollCount: 0,
      exhausted: false,
    };
  }
  const tabData = state.feedLikeTabStates[currentTabIndex];
  if (!(tabData.likedNoteIds instanceof Set)) {
    tabData.likedNoteIds = new Set(Array.isArray(tabData.likedNoteIds) ? tabData.likedNoteIds : []);
  }
  if (!(tabData.seenWindowSignatures instanceof Set)) {
    tabData.seenWindowSignatures = new Set(Array.isArray(tabData.seenWindowSignatures) ? tabData.seenWindowSignatures : []);
  }

  // 全局统计
  if (!state.feedLikeGlobalState) {
    state.feedLikeGlobalState = { totalLiked: 0, totalSkipped: 0 };
  }

  let roundLiked = 0;
  let roundSkipped = 0;
  let scrollCount = tabData.scrollCount || 0;
  let noProgressScrolls = 0;
  let rollbackCycles = 0;
  let emptyScanRetries = 0;
  let tabExhausted = false;

  while (roundLiked < likesPerRound && !tabExhausted) {
    // 扫描
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

      // 持续扫描为空 → Tab 到底
      tabExhausted = true;
      tabData.exhausted = true;
      break;
    }

    emptyScanRetries = 0;

    const keyword = params.keyword || tabState?.tabKeywords?.[currentTabIndex] || 'unknown';
    const unliked = scan.candidates
      .map((c) => ({ ...c, keyword }))
      .filter((c) => !c.liked && c.noteId && !tabData.likedNoteIds.has(c.noteId));

    tabData.unlikedCount = unliked.length;

    emitOperationProgress(context, {
      kind: 'feed_like_scan_result',
      stage: 'feed_like',
      tabIndex: currentTabIndex,
      keyword,
      totalCount: scan.totalCount,
      unlikedCount: unliked.length,
      alreadyLiked: scan.likedCount,
      seenWindows: tabData.seenWindowSignatures.size,
      roundLiked,
      roundSkipped,
    });

    // 当前页没有 unliked → 滚动到下一页
    if (unliked.length === 0) {
      const beforeWindow = await readFeedWindowSignature(profileId).catch(() => null);
      const beforeSignature = String(beforeWindow?.signature || '').trim();
      if (beforeSignature) tabData.seenWindowSignatures.add(beforeSignature);

      try {
        await pressKey(profileId, 'PageDown');
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
      if (progressed) {
        noProgressScrolls = 0;
      } else {
        noProgressScrolls += 1;
      }

      scrollCount += 1;
      tabData.scrollCount = scrollCount;
      emitOperationProgress(context, {
        kind: 'feed_like_scroll_probe',
        stage: 'feed_like',
        tabIndex: currentTabIndex,
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
            // Tab 到底
            tabExhausted = true;
            tabData.exhausted = true;
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

      // 随机间隔（风控）
      if (roundLiked < likesPerRound) {
        await sleepRandom(likeIntervalMinMs, likeIntervalMaxMs, null, 'feed_like_interval');
      }
    } else {
      roundSkipped += 1;
      state.feedLikeGlobalState.totalSkipped += 1;

      if (result.code === 'ALREADY_LIKED' && candidate.noteId) {
        tabData.likedNoteIds.add(candidate.noteId);
      }

      emitOperationProgress(context, {
        kind: 'feed_like_click_failed',
        stage: 'feed_like',
        tabIndex: currentTabIndex,
        noteId: candidate.noteId,
        reason: result.code || 'unknown',
        screenshotPre: result.preShot || null,
        screenshotPost: result.postShot || null,
      });
    }
  }

  tabData.exhausted = tabExhausted;

  // 每轮点完 likesPerRound 个后，切换到下一个 Tab（轮转）
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

  // 新 Tab 需要搜索关键字
  if (switchResult.data?.needSearch && switchResult.data?.keyword) {
    const searchKeyword = switchResult.data.keyword;
    const state2 = getProfileState(profileId);
    const latestTabState = state2.feedLikeTabState || { currentTabIndex: 0 };
    if (state2.feedLikeTabStates) {
      const newTabIndex = latestTabState.currentTabIndex ?? 0;
      state2.feedLikeTabStates[newTabIndex] = state2.feedLikeTabStates[newTabIndex] || {};
      state2.feedLikeTabStates[newTabIndex].pendingKeyword = searchKeyword;
    }

    emitOperationProgress(context, {
      kind: 'feed_like_search_new_tab',
      stage: 'feed_like',
      keyword: searchKeyword,
      tabIndex: latestTabState.currentTabIndex ?? 0,
    });

    // 执行搜索：填入关键字 + 回车
    try {
      const searchInput = await waitForAnchor(profileId, {
        selectors: ['#search-input', 'input.search-input'],
        timeoutMs: 5000,
        intervalMs: 300,
        description: 'feed_like_new_tab_search_input',
      }).catch(() => null);

      if (searchInput?.ok) {
        await safeCallAPI('keyboard:type', {
          profileId,
          selector: '#search-input, input.search-input',
          text: searchKeyword,
          clearFirst: true,
        }, 8000);
        await sleepRandom(300, 600, null, 'feed_like_search_type_settle');
        await safeCallAPI('keyboard:press', {
          profileId,
          key: 'Enter',
        }, 5000);
        await waitForAnchor(profileId, {
          selectors: ['.note-item:has(a.cover)', 'svg.reds-icon.like-icon', '.like-wrapper'],
          timeoutMs: 10000,
          intervalMs: 500,
          description: 'feed_like_new_tab_search_results',
        }).catch(() => null);
      }
    } catch (err) {
      emitOperationProgress(context, {
        kind: 'feed_like_search_error',
        stage: 'feed_like',
        keyword: searchKeyword,
        error: String(err?.message || err || 'unknown'),
      });
    }
  }

  // 递归：在新 Tab 上继续点赞
  return executeFeedLikeOperation({ profileId, params, context });
}

/**
 * 多 Tab 轮转操作
 *
 * 策略: Tab1 → Tab2 → Tab3 → Tab4 → Tab1 → ... 循环
 * - 已有 Tab → page:switch 切换
 * - 还有未使用的 keyword → 打开新 Tab + 搜索
 * - 所有 Tab 都 exhausted → 返回 ALL_TABS_DONE
 *
 * keywords 规则: 最多 4 个，不足则有多少用多少，超过截断
 */
export async function executeFeedLikeTabSwitch({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);

  const keywords = Array.isArray(params.keywords)
    ? params.keywords.slice(0, MAX_FEED_TABS)
    : (params.keywords
        ? String(params.keywords)
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
            .slice(0, MAX_FEED_TABS)
        : []);

  // 初始化 Tab 状态
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

  // 获取当前浏览器 tab 列表
  const pageList = await safeCallAPI('page:list', { profileId }, 10000);
  const pages = pageList?.pages || pageList?.data?.pages || [];
  if (pages.length === 0) {
    return { ok: true, code: 'PAGE_LIST_EMPTY', message: 'no tabs available' };
  }

  const activeTabCount = pages.length;

  // 检查当前 Tab 是否已 exhausted
  const currentTabIndex = tabState.currentTabIndex ?? 0;
  const currentTabData = state.feedLikeTabStates[currentTabIndex];
  const currentExhausted = currentTabData?.exhausted === true;

  // 决定下一个 Tab 索引（轮转）
  let nextTabIndex;
  if (currentExhausted) {
    // 当前 Tab 已到底，切到下一个
    nextTabIndex = (currentTabIndex + 1) % Math.max(activeTabCount, 1);
  } else {
    // 当前 Tab 未到底但本轮点够了，正常轮转到下一个
    nextTabIndex = (currentTabIndex + 1) % Math.max(activeTabCount, 1);
  }

  // 检查所有 Tab 是否都已 exhausted
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

  // 检查是否需要打开新 Tab（还有未使用的 keyword）
  const needNewTab = tabState.tabsOpened < effectiveKeywords.length && activeTabCount < MAX_FEED_TABS;

  if (needNewTab) {
    const nextKeywordIndex = tabState.tabsOpened;
    const nextKeyword = effectiveKeywords[nextKeywordIndex];
    if (!nextKeyword) {
      // 不应该到这里，但安全保护
      tabState.tabsOpened = effectiveKeywords.length;
    } else {
      const newTabResult = await safeCallAPI('newTab', { profileId, url: 'https://www.xiaohongshu.com/explore' }, 15000);
      if (!newTabResult) {
        return { ok: true, code: 'NEW_TAB_FAILED', message: 'newTab failed' };
      }

      // 锚点等待
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

      // 初始化新 Tab 状态
      state.feedLikeTabStates[tabState.currentTabIndex] = {
        likedNoteIds: new Set(),
        seenWindowSignatures: new Set(),
        scrollCount: 0,
        exhausted: false,
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

  // 切换到下一个 Tab（轮转）
  if (nextTabIndex < activeTabCount) {
    const switchResult = await safeCallAPI('page:switch', { profileId, index: pages[nextTabIndex].index }, 10000);
    if (!switchResult) {
      return { ok: true, code: 'TAB_SWITCH_FAILED', message: 'page:switch failed' };
    }

    // 锚点等待
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
