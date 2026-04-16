// 1688 滚动加载模块 - 使用 camo 协议级操作
// 禁止使用页面 JS 触发任何交互行为

import { callAPI } from '../../../utils/browser-service.mjs';
import { evaluateReadonly, sleep } from './dom-ops.mjs';
import { withTimeout } from '../../shared/dom-ops.mjs';
import { collectOfferInfo } from './collect-ops.mjs';
import { SELECTORS, SEARCH_RESULT_READY_SCRIPT } from './selectors.mjs';

// scrollPageByWheel - 协议级滚动（使用 mouse:wheel）
export async function scrollPageByWheel(profileId, options = {}) {
  const deltaY = Number(options.deltaY) > 0 ? Number(options.deltaY) : 500;
  const deltaX = Number(options.deltaX) || 0;
  const anchorX = Number(options.anchorX) > 0 ? Number(options.anchorX) : 400;
  const anchorY = Number(options.anchorY) > 0 ? Number(options.anchorY) : 400;
  const timeoutMs = Math.max(5000, Number(options.timeoutMs) || 15000);
  
  // 先点击页面获得焦点
  await callAPI('mouse:click', {
    profileId,
    x: anchorX,
    y: anchorY,
    button: 'left',
    clicks: 1,
    delay: 30,
  }, { timeoutMs: 10000 });
  
  // 执行 wheel 滚动
  const result = await withTimeout(
    callAPI('mouse:wheel', {
      profileId,
      deltaX,
      deltaY,
      anchorX,
      anchorY,
    }),
    timeoutMs,
    'SCROLL_WHEEL_TIMEOUT',
  );
  
  return result;
}

// 滚动并等待新内容加载
export async function scrollAndWaitForNewContent(profileId, options = {}) {
  const deltaY = Number(options.deltaY) > 0 ? Number(options.deltaY) : 500;
  const waitMs = Number(options.waitMs) > 0 ? Number(options.waitMs) : 2000;
  const maxRetries = Number(options.maxRetries) > 0 ? Number(options.maxRetries) : 3;
  
  // 获取当前商品数量
  const beforeResult = await evaluateReadonly(profileId, SEARCH_RESULT_READY_SCRIPT, { timeoutMs: 8000 });
  const beforeCount = beforeResult?.linkCount || 0;
  
  // 执行协议级滚动
  const scrollResult = await scrollPageByWheel(profileId, { deltaY });
  if (!scrollResult?.ok) {
    return { ok: false, reason: 'scroll_failed', scrollResult };
  }
  
  // 等待页面加载
  await sleep(waitMs);
  
  // 等待新内容出现（锚点检测）
  let retryCount = 0;
  let afterCount = beforeCount;
  
  while (retryCount < maxRetries) {
    const afterResult = await evaluateReadonly(profileId, SEARCH_RESULT_READY_SCRIPT, { timeoutMs: 8000 });
    afterCount = afterResult?.linkCount || 0;
    
    if (afterCount > beforeCount) {
      return {
        ok: true,
        beforeCount,
        afterCount,
        newCount: afterCount - beforeCount,
        scrolled: true,
      };
    }
    
    retryCount++;
    await sleep(1000);
  }
  
  // 没有新内容加载
  return {
    ok: true,
    beforeCount,
    afterCount,
    newCount: 0,
    scrolled: true,
    noNewContent: true,
  };
}

// 批量滚动采集（滚动多次直到无新内容或达到目标数量）
export async function scrollCollectOfferInfo(profileId, options = {}) {
  const targetCount = Number(options.targetCount) > 0 ? Number(options.targetCount) : 100;
  const maxScrolls = Number(options.maxScrolls) > 0 ? Number(options.maxScrolls) : 10;
  const scrollDeltaY = Number(options.scrollDeltaY) > 0 ? Number(options.scrollDeltaY) : 500;
  const waitMs = Number(options.waitMs) > 0 ? Number(options.waitMs) : 2500;
  
  const allResults = [];
  const allOfferIds = new Set();
  const scrollLog = [];
  
  // 初始采集
  const initialResult = await collectOfferInfo(profileId);
  if (!initialResult.ok) {
    return { ok: false, reason: 'initial_collect_failed', initialResult };
  }
  
  // 添加初始结果
  for (const item of initialResult.results || []) {
    if (!allOfferIds.has(item.offerId)) {
      allOfferIds.add(item.offerId);
      allResults.push(item);
    }
  }
  
  scrollLog.push({
    scroll: 0,
    collected: initialResult.count || 0,
    total: allResults.length,
  });
  
  // 滚动采集
  let scrollCount = 0;
  let noNewContentCount = 0;
  
  while (scrollCount < maxScrolls && allResults.length < targetCount) {
    scrollCount++;
    
    const scrollResult = await scrollAndWaitForNewContent(profileId, {
      deltaY: scrollDeltaY,
      waitMs,
      maxRetries: 3,
    });
    
    if (!scrollResult.ok) {
      scrollLog.push({
        scroll: scrollCount,
        error: scrollResult.reason,
      });
      break;
    }
    
    // 采集新内容
    const collectResult = await collectOfferInfo(profileId);
    
    // 去重添加
    const newItems = (collectResult.results || []).filter(item => !allOfferIds.has(item.offerId));
    for (const item of newItems) {
      allOfferIds.add(item.offerId);
      allResults.push(item);
    }
    
    scrollLog.push({
      scroll: scrollCount,
      beforeCount: scrollResult.beforeCount,
      afterCount: scrollResult.afterCount,
      newInScroll: scrollResult.newCount,
      newCollected: newItems.length,
      total: allResults.length,
    });
    
    // 连续无新内容则停止
    if (scrollResult.noNewContent) {
      noNewContentCount++;
      if (noNewContentCount >= 2) {
        break;
      }
    } else {
      noNewContentCount = 0;
    }
    
    // 等待间隔（避免高频）
    await sleep(1500);
  }
  
  return {
    ok: true,
    totalCollected: allResults.length,
    targetCount,
    scrollCount,
    maxScrolls,
    allResults,
    allOfferIds: Array.from(allOfferIds),
    scrollLog,
    stoppedReason: allResults.length >= targetCount ? 'target_reached' : noNewContentCount >= 2 ? 'no_new_content' : 'max_scrolls',
  };
}

// 检测是否到达页面底部
export async function isAtPageBottom(profileId) {
  const result = await evaluateReadonly(profileId, `(() => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 100;
    return { atBottom, scrollTop, scrollHeight, clientHeight };
  })()`, { timeoutMs: 6000 });
  
  return result?.atBottom || false;
}
