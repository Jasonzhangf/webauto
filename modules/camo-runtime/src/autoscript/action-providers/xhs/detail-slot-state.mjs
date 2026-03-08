import { getCurrentTabIndex, readTabSlotState, writeTabSlotState } from './tab-state.mjs';

function ensureDetailLinkState(state) {
  if (!state.detailLinkState || typeof state.detailLinkState !== 'object') {
    state.detailLinkState = {};
  }
  if (!state.detailLinkState.activeByTab || typeof state.detailLinkState.activeByTab !== 'object') {
    state.detailLinkState.activeByTab = {};
  }
  return state.detailLinkState;
}

export function isMultiTabDetailLoop(state, params = {}) {
  const tabCount = Math.max(1, Number(params.tabCount ?? state?.tabState?.tabCount ?? 1) || 1);
  const openByLinks = String(params.openByLinks ?? state?.detailLinkState?.openByLinks ?? '').trim().toLowerCase();
  return tabCount > 1 && (openByLinks === 'true' || openByLinks === '1');
}

export function getActiveDetailTabIndex(state, params = {}) {
  const detailState = ensureDetailLinkState(state);
  return Number(detailState.activeTabIndex || getCurrentTabIndex(state, { tabCount: params.tabCount })) || 1;
}

export function readDetailSlotState(state, tabIndex, params = {}) {
  const slotIndex = Number(tabIndex || getActiveDetailTabIndex(state, params)) || 1;
  const detailState = ensureDetailLinkState(state);
  const detailSlot = detailState.activeByTab[String(slotIndex)];
  const tabSlot = readTabSlotState(state, slotIndex) || {};
  return {
    tabIndex: slotIndex,
    ...tabSlot,
    ...(detailSlot && typeof detailSlot === 'object' ? detailSlot : {}),
    link: detailSlot?.link || tabSlot.link || null,
  };
}

export function writeDetailSlotState(state, tabIndex, patch = {}) {
  const slotIndex = Number(tabIndex || 1) || 1;
  const detailState = ensureDetailLinkState(state);
  const key = String(slotIndex);
  const current = detailState.activeByTab[key] && typeof detailState.activeByTab[key] === 'object'
    ? detailState.activeByTab[key]
    : {};
  const next = {
    ...current,
    ...patch,
    link: Object.prototype.hasOwnProperty.call(patch, 'link') ? (patch.link && typeof patch.link === 'object' ? { ...patch.link } : patch.link) : current.link,
  };
  detailState.activeByTab[key] = next;
  return { ...next };
}

export function markDetailSlotProgress(state, params = {}, outcome = {}) {
  const tabIndex = getActiveDetailTabIndex(state, params);
  const failed = outcome.failed === true;
  const completed = outcome.completed === true;
  const paused = !failed && !completed && outcome.paused === true;
  const status = failed ? 'failed' : (completed ? 'completed' : (paused ? 'paused' : 'active'));
  const detailPatch = {
    status,
    failed,
    completed,
    paused,
    lastHarvestExitReason: outcome.exitReason || null,
    lastCommentsAdded: Math.max(0, Number(outcome.commentsAdded || 0) || 0),
    reachedBottom: outcome.reachedBottom === true,
    commentsEmpty: outcome.commentsEmpty === true,
    budgetExhausted: outcome.budgetExhausted === true,
    lastProgressAt: new Date().toISOString(),
  };
  if (failed) {
    detailPatch.lastFailureCode = String(outcome.failureCode || outcome.exitReason || 'DETAIL_FLOW_FAILED').trim() || 'DETAIL_FLOW_FAILED';
    detailPatch.lastFailureData = outcome.failureData && typeof outcome.failureData === 'object'
      ? { ...outcome.failureData }
      : outcome.failureData || null;
  }
  const detailSlot = writeDetailSlotState(state, tabIndex, detailPatch);
  writeTabSlotState(state, tabIndex, {
    status,
    failed,
    lastHarvestExitReason: outcome.exitReason || null,
    lastCommentsAdded: Math.max(0, Number(outcome.commentsAdded || 0) || 0),
    reachedBottom: outcome.reachedBottom === true,
    commentsEmpty: outcome.commentsEmpty === true,
    budgetExhausted: outcome.budgetExhausted === true,
    lastProgressAt: detailPatch.lastProgressAt,
    lastFailureCode: detailPatch.lastFailureCode || null,
  });
  const detailState = ensureDetailLinkState(state);
  detailState.activeTabIndex = tabIndex;
  detailState.activeFailed = failed;
  detailState.openByLinks = params.openByLinks === true || String(params.openByLinks || '').trim().toLowerCase() === 'true';
  if (failed) {
    detailState.lastFailureCode = detailPatch.lastFailureCode;
    detailState.lastFailureAt = detailPatch.lastProgressAt;
    detailState.lastFailureData = detailPatch.lastFailureData || null;
  }
  return { tabIndex, status, detailSlot };
}

export function shouldCloseCurrentDetail(state, params = {}) {
  if (!isMultiTabDetailLoop(state, params)) return true;
  const slot = readDetailSlotState(state, null, params);
  if (!slot || !slot.link) return true;
  if (slot.failed === true) return true;
  if (slot.completed === true || slot.status === 'completed') return true;
  if (slot.paused === true || slot.status === 'paused') return false;
  return true;
}

export function shouldReuseDetailForCurrentTab(state, params = {}) {
  if (!isMultiTabDetailLoop(state, params)) return false;
  const slot = readDetailSlotState(state, null, params);
  return Boolean(slot?.link && (slot?.paused === true || slot?.status === 'paused'));
}
