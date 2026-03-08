import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { ensureTabState, getCurrentTabIndex, advanceTab } from './tab-state.mjs';

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

export async function executeSwitchTabIfNeeded({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const tabState = ensureTabState(state, {
    tabCount: params.tabCount,
    commentBudget: params.commentBudget,
  });
  const current = getCurrentTabIndex(state, { tabCount: tabState.tabCount });
  const used = Number(tabState.used[current - 1] || 0);
  const limit = Number(tabState.limit || 50);
  if (used < limit) {
    return { ok: true, code: 'OPERATION_DONE', message: 'tab switch skipped', data: { tabIndex: current, used, limit } };
  }

  const next = advanceTab(state, { tabCount: tabState.tabCount, commentBudget: tabState.limit });
  const targetSlot = getRuntimeTabSlot(context, next.tabIndex);
  if (!targetSlot || !Number.isFinite(Number(targetSlot.tabRealIndex))) {
    return {
      ok: false,
      code: 'TAB_POOL_SLOT_MISSING',
      message: `tab slot ${next.tabIndex} is not initialized in runtime tab pool`,
      data: { tabIndex: next.tabIndex },
    };
  }

  const pageList = await callAPI('page:list', { profileId });
  const pages = extractPageList(pageList);
  const activeIndex = extractActiveIndex(pageList);
  const targetIndex = Number(targetSlot.tabRealIndex);
  const slot = pages.find((page) => Number(page?.index) === targetIndex) || null;
  if (!slot) {
    return {
      ok: false,
      code: 'TAB_POOL_SLOT_CLOSED',
      message: `tab slot ${next.tabIndex} is no longer available`,
      data: { tabIndex: next.tabIndex, targetIndex },
    };
  }
  if (Number(activeIndex) !== targetIndex) {
    await callAPI('page:switch', { profileId, index: targetIndex });
  }
  if (context?.runtime && typeof context.runtime === 'object') {
    context.runtime.currentTab = {
      slotIndex: next.tabIndex,
      tabRealIndex: targetIndex,
      url: String(slot.url || ''),
    };
  }
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'tab switch done',
    data: {
      tabIndex: next.tabIndex,
      used: next.used,
      limit: next.limit,
      targetIndex,
    },
  };
}
