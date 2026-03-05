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
  const pageList = await callAPI('page:list', { profileId });
  const pages = extractPageList(pageList);
  const activeIndex = extractActiveIndex(pageList);
  const targetSlot = next.tabIndex - 1;
  const slot = pages[targetSlot];
  if (!slot || !Number.isFinite(Number(slot.index))) {
    return { ok: false, code: 'TAB_POOL_NOT_READY', message: `tab slot ${next.tabIndex} not available` };
  }
  const targetIndex = Number(slot.index);
  if (Number(activeIndex) !== targetIndex) {
    await callAPI('page:switch', { profileId, index: targetIndex });
  }
  return { ok: true, code: 'OPERATION_DONE', message: 'tab switch done', data: { tabIndex: next.tabIndex, used: next.used, limit: next.limit } };
}
