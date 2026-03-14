import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { ensureTabState, getCurrentTabIndex, advanceTab } from './tab-state.mjs';
import { shouldAdvanceAfterClose } from './detail-slot-state.mjs';

const XHS_DISCOVER_URL = 'https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getRuntimeTabSlot(context, tabIndex) {
  const slots = Array.isArray(context?.runtime?.tabPool?.slots)
    ? context.runtime.tabPool.slots
    : [];
  const slotIndex = Math.max(1, Number(tabIndex) || 1);
  return slots.find((slot) => Number(slot?.slotIndex) === slotIndex) || null;
}

function ensureRuntimeTabPool(context = {}) {
  if (!context.runtime || typeof context.runtime !== 'object') {
    context.runtime = {};
  }
  if (!context.runtime.tabPool || typeof context.runtime.tabPool !== 'object') {
    context.runtime.tabPool = {
      slots: [],
      cursor: 0,
      count: 0,
      initializedAt: new Date().toISOString(),
    };
  }
  if (!Array.isArray(context.runtime.tabPool.slots)) {
    context.runtime.tabPool.slots = [];
  }
  return context.runtime.tabPool;
}

function normalizeAndSyncSlots(tabPool, pages = [], activeIndex = null, tabCount = 1) {
  const limit = Math.max(1, Number(tabCount || 1) || 1);
  const pageByIndex = new Map(
    pages
      .filter((page) => Number.isFinite(Number(page?.index)))
      .map((page) => [Number(page.index), page]),
  );
  const existing = Array.isArray(tabPool?.slots)
    ? [...tabPool.slots].sort((a, b) => Number(a?.slotIndex || 0) - Number(b?.slotIndex || 0))
    : [];
  const dedup = new Set();
  const valid = [];
  for (const slot of existing) {
    const tabRealIndex = Number(slot?.tabRealIndex);
    if (!Number.isFinite(tabRealIndex)) continue;
    if (dedup.has(tabRealIndex)) continue;
    const matched = pageByIndex.get(tabRealIndex);
    if (!matched) continue;
    dedup.add(tabRealIndex);
    valid.push({
      slotIndex: valid.length + 1,
      tabRealIndex,
      url: String(matched.url || slot?.url || ''),
    });
    if (valid.length >= limit) break;
  }
  if (valid.length === 0) {
    const active = pages.find((page) => Number(page?.index) === Number(activeIndex)) || null;
    const ordered = [
      ...(active ? [active] : []),
      ...pages.filter((page) => Number(page?.index) !== Number(activeIndex)),
    ];
    for (const page of ordered) {
      const tabRealIndex = Number(page?.index);
      if (!Number.isFinite(tabRealIndex)) continue;
      if (dedup.has(tabRealIndex)) continue;
      dedup.add(tabRealIndex);
      valid.push({
        slotIndex: valid.length + 1,
        tabRealIndex,
        url: String(page?.url || ''),
      });
      if (valid.length >= limit) break;
    }
  }
  tabPool.slots = valid;
  tabPool.count = valid.length;
  return tabPool.slots;
}

function resolveTabSeedUrl({ state, pages = [], activeIndex = null, context = {} }) {
  const activePage = pages.find((page) => Number(page?.index) === Number(activeIndex)) || null;
  const candidates = [
    state?.lastListUrl,
    context?.runtime?.currentTab?.url,
    activePage?.url,
    pages[0]?.url,
    XHS_DISCOVER_URL,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }
  return XHS_DISCOVER_URL;
}

async function ensureTabSlotReady({
  profileId,
  state,
  context,
  tabCount,
  targetTabIndex,
}) {
  const pool = ensureRuntimeTabPool(context);
  let pageList = await callAPI('page:list', { profileId });
  let pages = extractPageList(pageList);
  let activeIndex = extractActiveIndex(pageList);
  normalizeAndSyncSlots(pool, pages, activeIndex, tabCount);

  let createdTabs = 0;
  while (pool.slots.length < targetTabIndex && pool.slots.length < tabCount) {
    const beforeIndexes = new Set(
      pages
        .map((page) => Number(page?.index))
        .filter((index) => Number.isFinite(index)),
    );
    const knownSlotIndexes = new Set(
      pool.slots
        .map((slot) => Number(slot?.tabRealIndex))
        .filter((index) => Number.isFinite(index)),
    );
    const seedUrl = resolveTabSeedUrl({ state, pages, activeIndex, context });
    await callAPI('newPage', { profileId, url: seedUrl });

    let discovered = null;
    for (let poll = 0; poll < 10; poll += 1) {
      if (poll > 0) await sleep(220);
      pageList = await callAPI('page:list', { profileId });
      pages = extractPageList(pageList);
      activeIndex = extractActiveIndex(pageList);
      discovered = pages.find((page) => {
        const index = Number(page?.index);
        if (!Number.isFinite(index)) return false;
        return !beforeIndexes.has(index) && !knownSlotIndexes.has(index);
      }) || null;
      if (discovered) break;
    }
    if (!discovered) {
      discovered = [...pages]
        .filter((page) => {
          const index = Number(page?.index);
          return Number.isFinite(index) && !knownSlotIndexes.has(index);
        })
        .sort((a, b) => Number(b?.index || 0) - Number(a?.index || 0))[0] || null;
    }
    if (!discovered || !Number.isFinite(Number(discovered?.index))) {
      break;
    }
    pool.slots.push({
      slotIndex: pool.slots.length + 1,
      tabRealIndex: Number(discovered.index),
      url: String(discovered.url || ''),
    });
    createdTabs += 1;
    pool.count = pool.slots.length;
  }

  normalizeAndSyncSlots(pool, pages, activeIndex, tabCount);
  const targetSlot = getRuntimeTabSlot(context, targetTabIndex);
  if (!targetSlot || !Number.isFinite(Number(targetSlot?.tabRealIndex))) {
    return {
      ok: false,
      code: 'TAB_POOL_SLOT_MISSING',
      message: `tab slot ${targetTabIndex} is not initialized in runtime tab pool`,
      data: {
        tabIndex: targetTabIndex,
        tabCount,
        runtimeSlots: pool.slots.length,
        createdTabs,
      },
    };
  }
  return {
    ok: true,
    targetSlot,
    pages,
    activeIndex,
    createdTabs,
  };
}

async function rotateToTargetTab({
  profileId,
  state,
  context,
  tabCount,
  targetTabIndex,
  used,
  limit,
  reason = null,
}) {
  const ensured = await ensureTabSlotReady({
    profileId,
    state,
    context,
    tabCount,
    targetTabIndex,
  });
  if (!ensured.ok) return ensured;

  const { targetSlot, pages, activeIndex, createdTabs } = ensured;
  const targetIndex = Number(targetSlot.tabRealIndex);
  const slot = pages.find((page) => Number(page?.index) === targetIndex) || null;
  if (!slot) {
    return {
      ok: false,
      code: 'TAB_POOL_SLOT_CLOSED',
      message: `tab slot ${targetTabIndex} is no longer available`,
      data: { tabIndex: targetTabIndex, targetIndex },
    };
  }
  if (Number(activeIndex) !== targetIndex) {
    await callAPI('page:switch', { profileId, index: targetIndex });
  }
  if (context?.runtime && typeof context.runtime === 'object') {
    context.runtime.currentTab = {
      slotIndex: targetTabIndex,
      tabRealIndex: targetIndex,
      url: String(slot.url || ''),
    };
  }
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'tab switch done',
    data: {
      tabIndex: targetTabIndex,
      used,
      limit,
      targetIndex,
      createdTabs,
      ...(reason ? { reason } : {}),
    },
  };
}

export async function executeSwitchTabIfNeeded({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const tabState = ensureTabState(state, {
    tabCount: params.tabCount,
    commentBudget: params.commentBudget,
  });
  const current = getCurrentTabIndex(state, { tabCount: tabState.tabCount });
  const used = Number(tabState.used[current - 1] || 0);
  const limit = Math.max(0, Number(tabState.limit || 0));
  if (Number(tabState.tabCount || 1) > 1 && shouldAdvanceAfterClose(state, { tabCount: tabState.tabCount, openByLinks: true }) === false) {
    const next = advanceTab(state, { tabCount: tabState.tabCount, commentBudget: tabState.limit });
    return rotateToTargetTab({
      profileId,
      state,
      context,
      tabCount: tabState.tabCount,
      targetTabIndex: next.tabIndex,
      used: next.used,
      limit: next.limit,
      reason: 'paused_slot_rotation',
    });
  }
  if (limit <= 0 || used < limit) {
    return { ok: true, code: 'OPERATION_DONE', message: 'tab switch skipped', data: { tabIndex: current, used, limit } };
  }

  const next = advanceTab(state, { tabCount: tabState.tabCount, commentBudget: tabState.limit });
  return rotateToTargetTab({
    profileId,
    state,
    context,
    tabCount: tabState.tabCount,
    targetTabIndex: next.tabIndex,
    used: next.used,
    limit: next.limit,
  });
}
