import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { ensureTabState, getCurrentTabIndex, advanceTab } from './tab-state.mjs';
import { shouldAdvanceAfterClose } from './detail-slot-state.mjs';

const XHS_DISCOVER_URL = 'https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend';
const TAB_COUNT = 5;  // 固定5个tab: 1个搜索页 + 4个轮转详情页
const SWITCH_DELAY_MIN_MS = 2000;
const SWITCH_DELAY_MAX_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(delay);
}

function extractPageList(payload) {
  if (payload?.pages && Array.isArray(payload.pages)) return payload.pages;
  if (payload?.data?.pages && Array.isArray(payload.data.pages)) return payload.data.pages;
  return [];
}

function extractActiveIndex(payload) {
  if (Number.isFinite(Number(payload?.activeIndex))) return Number(payload.activeIndex);
  if (Number.isFinite(Number(payload?.data?.activeIndex))) return Number(payload.data.activeIndex);
  return null;
}

/**
 * 确保运行时 tabPool 结构存在
 */
function ensureRuntimeTabPool(context = {}) {
  if (!context.runtime || typeof context.runtime !== 'object') {
    context.runtime = {};
  }
  if (!context.runtime.tabPool || typeof context.runtime.tabPool !== 'object') {
    context.runtime.tabPool = {
      slots: [],
      cursor: 0,
      count: 0,
      initializedAt: null,
    };
  }
  if (!Array.isArray(context.runtime.tabPool.slots)) {
    context.runtime.tabPool.slots = [];
  }
  return context.runtime.tabPool;
}

/**
 * 关闭多余的 tab
 * @param {string} profileId
 * @param {number} keepCount 保留的tab数量
 * @param {object} existingPages 当前页面列表
 */
async function closeExcessTabs(profileId, keepCount, existingPages = null) {
  let pages = existingPages;
  if (!pages) {
    const pageList = await callAPI('page:list', { profileId });
    pages = extractPageList(pageList);
  }

  if (pages.length <= keepCount) {
    return { closed: 0, kept: pages.length };
  }

  // 按index排序，保留前 keepCount 个
  const sortedPages = [...pages].sort((a, b) => Number(a.index) - Number(b.index));
  const toClose = sortedPages.slice(keepCount);
  let closed = 0;

  for (const page of toClose) {
    try {
      await callAPI('page:close', { profileId, index: Number(page.index) });
      closed += 1;
      await sleep(200);  // 短暂等待
    } catch (err) {
      // 忽略关闭失败，继续处理
    }
  }

  return { closed, kept: keepCount };
}

/**
 * 同步 tab pool 状态与实际浏览器
 */
async function syncTabPoolWithBrowser(profileId, context) {
  const pool = ensureRuntimeTabPool(context);

  // 获取实际浏览器中的页面
  const pageList = await callAPI('page:list', { profileId });
  const pages = extractPageList(pageList);
  const activeIndex = extractActiveIndex(pageList);

  // 如果页面数量超过限制，关闭多余的
  if (pages.length > TAB_COUNT) {
    await closeExcessTabs(profileId, TAB_COUNT, pages);

    // 重新获取页面列表
    const newList = await callAPI('page:list', { profileId });
    pages.length = 0;
    pages.push(...extractPageList(newList));
  }

  // 重建 slots
  const sortedPages = [...pages].sort((a, b) => Number(a.index) - Number(b.index));
  pool.slots = sortedPages.slice(0, TAB_COUNT).map((page, idx) => ({
    slotIndex: idx + 1,
    tabRealIndex: Number(page.index),
    url: String(page.url || ''),
  }));
  pool.count = pool.slots.length;

  return { pages: sortedPages, activeIndex, pool };
}

/**
 * 创建新的 tab
 * 只使用 newTab API，确保在同一窗口内创建
 */
async function createNewTab(profileId, url) {
  try {
    await callAPI('newTab', { profileId, url: url || XHS_DISCOVER_URL });

    // 等待新 tab 出现
    for (let i = 0; i < 10; i++) {
      await sleep(300);
      const pageList = await callAPI('page:list', { profileId });
      const pages = extractPageList(pageList);
      if (pages.length > 0) {
        // 找到最新创建的 tab
        const sorted = [...pages].sort((a, b) => Number(b.index) - Number(a.index));
        return sorted[0];
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * 统一 Tab 状态管理
 * 
 * 状态机:
 * 1. CHECKING: 检查当前 tab 数量
 * 2. TOO_MANY: 关闭多余 tab
 * 3. TOO_FEW: 创建新 tab
 * 4. OK: 数量正确，同步状态
 * 
 * Tab 布局:
 * - Tab 1: 搜索页/主页 (collect 遗留)
 * - Tab 2-5: 轮转详情页
 */
async function ensureTabPool({
  profileId,
  state,
  context,
  tabCount = TAB_COUNT,
}) {
  const pool = ensureRuntimeTabPool(context);

  // 第一步：同步当前状态
  const syncResult = await syncTabPoolWithBrowser(profileId, context);
  let { pages, activeIndex } = syncResult;

  // 第二步：如果 tab 数量不足，创建新 tab
  while (pool.slots.length < tabCount) {
    const seedUrl = pool.slots.length === 0
      ? XHS_DISCOVER_URL
      : (state?.lastListUrl || XHS_DISCOVER_URL);

    const newTab = await createNewTab(profileId, seedUrl);
    if (!newTab) {
      break;  // 创建失败，停止尝试
    }

    // 重���同步
    await syncTabPoolWithBrowser(profileId, context);
  }

  // 第三步：确保焦点在第一个 tab（搜索页）
  const firstTab = pool.slots[0];
  if (firstTab && activeIndex !== firstTab.tabRealIndex) {
    await callAPI('page:switch', { profileId, index: firstTab.tabRealIndex });
    await sleep(300);
  }

  pool.count = pool.slots.length;
  pool.initializedAt = new Date().toISOString();

  return {
    ok: true,
    pool,
    pages,
    activeIndex: firstTab?.tabRealIndex || null,
  };
}

/**
 * 确保 Tab Slot 准备好
 */
async function ensureTabSlotReady({
  profileId,
  state,
  context,
  tabCount = TAB_COUNT,
  targetTabIndex,
}) {
  // 首先确保 tab pool 已初始化
  const poolEnsured = await ensureTabPool({ profileId, state, context, tabCount });
  if (!poolEnsured.ok) return poolEnsured;

  const pool = ensureRuntimeTabPool(context);
  const targetSlot = pool.slots.find(s => s.slotIndex === targetTabIndex);

  if (!targetSlot) {
    return {
      ok: false,
      code: 'TAB_SLOT_NOT_FOUND',
      message: `Tab slot ${targetTabIndex} not found`,
    };
  }

  return {
    ok: true,
    targetSlot,
    activeIndex: poolEnsured.activeIndex,
  };
}

/**
 * 切换到目标 Tab
 */
async function rotateToTargetTab({
  profileId,
  state,
  context,
  tabCount = TAB_COUNT,
  targetTabIndex,
}) {
  const ensured = await ensureTabSlotReady({
    profileId,
    state,
    context,
    tabCount,
    targetTabIndex,
  });

  if (!ensured.ok) return ensured;

  const { targetSlot, activeIndex } = ensured;
  const targetIndex = Number(targetSlot.tabRealIndex);

  // 如果不是当前激活的 tab，切换过去
  if (activeIndex !== targetIndex) {
    await callAPI('page:switch', { profileId, index: targetIndex });
    await randomDelay(SWITCH_DELAY_MIN_MS, SWITCH_DELAY_MAX_MS);
  }

  // 更新运行时状态
  if (context?.runtime && typeof context.runtime === 'object') {
    context.runtime.currentTab = {
      slotIndex: targetTabIndex,
      tabRealIndex: targetIndex,
      url: String(targetSlot.url || ''),
    };
  }

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'Tab switch done',
    data: {
      tabIndex: targetTabIndex,
      targetIndex,
    },
  };
}

/**
 * 执行 Tab 切换（如果需要）
 */
export async function executeSwitchTabIfNeeded({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const tabState = ensureTabState(state, {
    tabCount: params.tabCount || TAB_COUNT,
    commentBudget: params.commentBudget,
  });

  const current = getCurrentTabIndex(state, { tabCount: tabState.tabCount });
  const used = Number(tabState.used[current - 1] || 0);
  const limit = Math.max(0, Number(tabState.limit || 0));

  // 检查是否需要切换 tab
  if (limit <= 0 || used < limit) {
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'Tab switch skipped',
      data: { tabIndex: current, used, limit }
    };
  }

  // 切换到下一个 tab
  const next = advanceTab(state, {
    tabCount: tabState.tabCount,
    commentBudget: tabState.limit
  });

  return rotateToTargetTab({
    profileId,
    state,
    context,
    tabCount: tabState.tabCount,
    targetTabIndex: next.tabIndex,
  });
}

/**
 * 清理 Tab Pool（用于任务结束）
 */
export async function cleanupTabPool({ profileId, context }) {
  const pool = ensureRuntimeTabPool(context);

  // 关闭除第一个外的所有 tab
  if (pool.slots.length > 1) {
    const toClose = pool.slots.slice(1);
    for (const slot of toClose) {
      try {
        await callAPI('page:close', { profileId, index: slot.tabRealIndex });
        await sleep(200);
      } catch (err) {
        // 忽略错误
      }
    }
  }

  // 重置状态
  pool.slots = pool.slots.slice(0, 1);
  pool.count = pool.slots.length;
  pool.cursor = 0;

  return { ok: true, message: 'Tab pool cleaned' };
}

// 导出 ensureTabPool 供其他模块使用
export { ensureTabPool, ensureTabSlotReady, rotateToTargetTab, TAB_COUNT };
