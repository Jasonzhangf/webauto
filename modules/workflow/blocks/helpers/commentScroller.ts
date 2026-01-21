/**
 * Comment Scroller Helper
 *
 * 共享滚动循环：WarmupCommentsBlock / ExpandCommentsBlock
 * - 只负责“滚到评论底部（或空态）”这一件事
 * - 所有操作通过 systemInput（browser-service）发送系统事件
 */

import {
  computeVisibleFocusPoint,
  getCommentEndState,
  getCommentStats,
  getScrollContainerInfo,
  getScrollContainerState,
  getScrollStats,
  getViewport,
  getViewportFirstComment,
  isInputFocused,
  locateCommentsFocusPoint,
  type FocusPoint,
} from './xhsCommentDom.js';
import { systemClickAt, systemHoverAt, systemMouseWheel } from './systemInput.js';

// Back-compat re-exports (older blocks import these from commentScroller.js)
export { getScrollStats, getViewport } from './xhsCommentDom.js';
export { systemMouseWheel } from './systemInput.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScrollOptions {
  controllerUrl: string;
  profile: string;
  browserServiceUrl?: string;
  browserWsUrl?: string;
  maxRounds?: number;
  focusRect?: Rect;
  logPrefix?: string;
  activateComments?: (reason: string) => Promise<void>;
  expand?: (ctx: { round: number; focusPoint: FocusPoint | null }) => Promise<void>;
}

export interface ScrollResult {
  reachedEnd: boolean;
  totalFromHeader: number | null;
  finalCount: number;
  rounds: number;
  focusPoint: FocusPoint | null;
}

export async function scrollCommentSection(options: ScrollOptions): Promise<ScrollResult> {
  const {
    controllerUrl,
    profile,
    browserServiceUrl = 'http://127.0.0.1:7704',
    browserWsUrl = process.env.WEBAUTO_BROWSER_WS_URL || 'ws://127.0.0.1:8765',
    maxRounds,
    focusRect,
    logPrefix = '[WarmupComments]',
    activateComments,
    expand,
  } = options;

  const log = (msg: string) => console.log(`${logPrefix} ${msg}`);
  const warn = (msg: string) => console.warn(`${logPrefix} ${msg}`);

  const viewport = await getViewport(controllerUrl, profile);
  let focusPoint: FocusPoint | null =
    focusRect ? computeVisibleFocusPoint(focusRect, viewport) : null;

  const domFocus = await locateCommentsFocusPoint(controllerUrl, profile);
  if (domFocus) {
    focusPoint = domFocus;
    await systemClickAt(profile, domFocus.x, domFocus.y, browserServiceUrl);
    await new Promise((r) => setTimeout(r, 450));
  }

  if (focusPoint) {
    await systemHoverAt(profile, focusPoint.x, focusPoint.y, browserServiceUrl);
    await new Promise((r) => setTimeout(r, 180));
    if (await isInputFocused(controllerUrl, profile)) {
      log('检测到输入框焦点，点击评论区以切换焦点...');
      await systemClickAt(profile, focusPoint.x, focusPoint.y, browserServiceUrl);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  let lastCount = 0;
  let targetTotal: number | null = null;

  const initialStats = await getCommentStats(controllerUrl, profile);
  lastCount = initialStats.count;
  targetTotal = initialStats.total;

  if (
    initialStats.count === 0 &&
    typeof initialStats.total === 'number' &&
    Number.isFinite(initialStats.total) &&
    initialStats.total > 0 &&
    activateComments
  ) {
    log(`count=0 but headerTotal=${initialStats.total}, try activate comments`);
    try {
      await activateComments('count_zero_but_total_positive');
    } catch (e: any) {
      warn(`activate comments failed: ${e?.message || e}`);
    }
    const domFocus2 = await locateCommentsFocusPoint(controllerUrl, profile);
    if (domFocus2) {
      focusPoint = domFocus2;
      await systemClickAt(profile, domFocus2.x, domFocus2.y, browserServiceUrl);
      await new Promise((r) => setTimeout(r, 450));
    }
    await new Promise((r) => setTimeout(r, 600));
    const after = await getCommentStats(controllerUrl, profile);
    log(`after activate: count=${after.count} total=${after.total} hasMore=${after.hasMore}`);
    lastCount = after.count;
    targetTotal = after.total;
  }

  // 一些详情页会先渲染“评论区骨架/占位”但 headerTotal 不可用（null），需要先点一次 comment_button 激活
  if (
    initialStats.count === 0 &&
    (initialStats.total === null || initialStats.total === 0) &&
    !initialStats.hasMore &&
    activateComments
  ) {
    const endBefore = await getCommentEndState(controllerUrl, profile);
    const noMoreBefore = Boolean(endBefore.endMarkerVisible || endBefore.emptyStateVisible);
    if (!noMoreBefore) {
      log(`count=0 total=${initialStats.total}, try activate comments (total_null_or_zero)`);
      try {
        await activateComments('count_zero_total_null_or_zero');
      } catch (e: any) {
        warn(`activate comments failed: ${e?.message || e}`);
      }
      const domFocus2 = await locateCommentsFocusPoint(controllerUrl, profile);
      if (domFocus2) {
        focusPoint = domFocus2;
        await systemClickAt(profile, domFocus2.x, domFocus2.y, browserServiceUrl);
        await new Promise((r) => setTimeout(r, 450));
      }
      await new Promise((r) => setTimeout(r, 900));
      const after = await getCommentStats(controllerUrl, profile);
      const endAfter = await getCommentEndState(controllerUrl, profile);
      log(
        `after activate(total_null_or_zero): count=${after.count} total=${after.total} hasMore=${after.hasMore} endMarker=${endAfter.endMarkerVisible} empty=${endAfter.emptyStateVisible}`,
      );
      lastCount = after.count;
      targetTotal = after.total;
      if (
        after.count === 0 &&
        (after.total === null || after.total === 0) &&
        !after.hasMore &&
        (endAfter.endMarkerVisible || endAfter.emptyStateVisible)
      ) {
        return {
          reachedEnd: true,
          totalFromHeader: typeof after.total === 'number' ? after.total : null,
          finalCount: 0,
          rounds: 0,
          focusPoint,
        };
      }
    }
  }

  if (
    initialStats.count === 0 &&
    (initialStats.total === null || initialStats.total === 0) &&
    !initialStats.hasMore
  ) {
    // 严格结束条件：仅当 end_marker / empty_state 可见才视为结束
    const endState = await getCommentEndState(controllerUrl, profile);
    const noMore = Boolean(endState.endMarkerVisible || endState.emptyStateVisible);
    log(
      `initial no-comments probe: endMarker=${endState.endMarkerVisible} empty=${endState.emptyStateVisible} noMore=${noMore}`,
    );
    if (noMore) {
      return {
        reachedEnd: true,
        totalFromHeader: typeof initialStats.total === 'number' ? initialStats.total : null,
        finalCount: 0,
        rounds: 0,
        focusPoint,
      };
    }
  }

  const dynamicMaxRounds =
    typeof maxRounds === 'number' && maxRounds > 0
      ? maxRounds
      : targetTotal && targetTotal > 0
        ? Math.min(Math.max(Math.ceil(targetTotal / 6) * 3, 36), 900)
        : 96;

  let noEffectStreak = 0;
  let roundsRan = 0;

  for (let i = 0; i < dynamicMaxRounds; i++) {
    roundsRan = i + 1;
    const viewportBefore = await getViewportFirstComment(controllerUrl, profile);

    const scrollInfo = await getScrollContainerInfo(controllerUrl, profile);
    if (scrollInfo && viewport.innerWidth && viewport.innerHeight) {
      const fx = clamp(scrollInfo.x, 20, viewport.innerWidth - 20);
      const fy = clamp(scrollInfo.y, 120, viewport.innerHeight - 120);
      focusPoint = { x: fx, y: fy };
      log(
        `round=${i} refreshed focus: (${scrollInfo.x}, ${scrollInfo.y}), scrollTop=${scrollInfo.scrollTop}/${scrollInfo.scrollHeight}`,
      );
      await systemHoverAt(profile, fx, fy, browserServiceUrl);
    }

    const scrollTopBefore = scrollInfo?.scrollTop ?? null;
    const scrollHeightBefore = scrollInfo?.scrollHeight ?? null;
    const clientHeightBefore = scrollInfo?.clientHeight ?? null;

    if (expand) {
      try {
        await expand({ round: i, focusPoint });
      } catch (e: any) {
        warn(`round=${i} expand failed: ${e?.message || e}`);
      }
    }

    // 单次滚动不超过 800px（视口安全约束），但尽量加大步长以更快触达底部 end_marker
    const deltaY = 520 + Math.floor(Math.random() * 260);
    try {
      await systemMouseWheel({
        profileId: profile,
        deltaY,
        focusPoint,
        browserServiceUrl,
        browserWsUrl,
      });
      log(`round=${i} system wheel deltaY=${deltaY}`);
    } catch (e: any) {
      warn(`round=${i} system wheel failed: ${e?.message || e}`);
    }

    await new Promise((r) => setTimeout(r, 650 + Math.random() * 650));

    const stats = await getCommentStats(controllerUrl, profile);
    const currentCount = stats.count;

    const viewportAfter = await getViewportFirstComment(controllerUrl, profile);
    if (viewportBefore || viewportAfter) {
      log(
        `round=${i} viewportFirst before=${JSON.stringify(viewportBefore)} after=${JSON.stringify(viewportAfter)}`,
      );
    }

    let scrolled: null | boolean = null;
    try {
      const afterState = await getScrollContainerState(controllerUrl, profile);
      const scrollTopAfter = afterState?.scrollTop ?? null;
      const scrollHeightAfter = afterState?.scrollHeight ?? null;
      const clientHeightAfter = afterState?.clientHeight ?? null;

      const canScroll =
        (scrollHeightAfter ?? scrollHeightBefore ?? 0) -
          (clientHeightAfter ?? clientHeightBefore ?? 0) >
        12;

      if (canScroll && scrollTopBefore !== null && scrollTopAfter !== null) {
        scrolled = Math.abs(scrollTopAfter - scrollTopBefore) > 2;
      }
    } catch {
      // ignore
    }

    const keyBefore = viewportBefore?.key || '';
    const keyAfter = viewportAfter?.key || '';
    const firstChanged = Boolean(keyBefore && keyAfter && keyBefore !== keyAfter);

    if (scrolled === false && !firstChanged && currentCount <= lastCount) {
      noEffectStreak += 1;
      warn(`round=${i} ⚠️ scroll seems ineffective (streak=${noEffectStreak})`);
      // 卡住时：先回滚（向上滚）几次，再继续向下滚（避免虚拟列表“卡在同一批节点”）
      if (noEffectStreak >= 2) {
        const fallbackFocus = (await locateCommentsFocusPoint(controllerUrl, profile)) || focusPoint;
        if (fallbackFocus) focusPoint = fallbackFocus;
        const fp = focusPoint || fallbackFocus;

        if (fp) {
          await systemHoverAt(profile, fp.x, fp.y, browserServiceUrl);
          await new Promise((r) => setTimeout(r, 150));
          await systemClickAt(profile, fp.x, fp.y, browserServiceUrl);
          await new Promise((r) => setTimeout(r, 220));
        }

        // 回滚 2 次
        for (let k = 0; k < 2; k += 1) {
          await systemMouseWheel({
            profileId: profile,
            deltaY: -(320 + Math.floor(Math.random() * 160)),
            focusPoint,
            browserServiceUrl,
            browserWsUrl,
          });
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
        }

        // 再向下 3 次
        for (let k = 0; k < 3; k += 1) {
          await systemMouseWheel({
            profileId: profile,
            deltaY: 540 + Math.floor(Math.random() * 220),
            focusPoint,
            browserServiceUrl,
            browserWsUrl,
          });
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 450));
        }

        noEffectStreak = 0;
      }
    } else {
      noEffectStreak = 0;
    }

    // “到底算结束”：严格仅以 end_marker / empty_state 为准
    const endState = await getCommentEndState(controllerUrl, profile);
    const noMore = Boolean(endState.endMarkerVisible || endState.emptyStateVisible);

    log(
      `round=${i} count=${currentCount}, total=${targetTotal}, hasMoreHint=${stats.hasMore}, endMarker=${endState.endMarkerVisible}, empty=${endState.emptyStateVisible}, noMore=${noMore}`,
    );

    lastCount = currentCount;

    if (noMore) {
      log('stop conditions met');
      break;
    }
  }

  const finalStats = await getCommentStats(controllerUrl, profile);
  const finalEndState = await getCommentEndState(controllerUrl, profile);
  return {
    reachedEnd: Boolean(finalEndState.endMarkerVisible || finalEndState.emptyStateVisible),
    totalFromHeader: finalStats.total,
    finalCount: finalStats.count,
    rounds: roundsRan,
    focusPoint,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
