/**
 * 状态管理模块（.collect-state.json）
 *
 * 注意：该文件只做兼容转发，唯一实现位于 `modules/state`（TypeScript）。
 * 运行前请确保已构建：`npm run build:services`
 */

import {
  createDefaultXhsCollectState,
  formatXhsCollectStateSummary,
  getXhsPendingItems,
  initializeXhsCollectState,
  loadXhsCollectState,
  markXhsCollectCompleted,
  markXhsCollectFailed,
  resetXhsCollectState,
  resolveXhsCollectStatePath,
  saveXhsCollectState,
  updateXhsDetailCollection,
  updateXhsListCollection,
} from '../../../../dist/modules/state/src/xiaohongshu-collect-state.js';

function toCompat(state) {
  const completed = state?.detailCollection?.completedNoteIds || [];
  const failed = (state?.detailCollection?.failedNoteIds || []).map((x) => x.noteId).filter(Boolean);
  return {
    ...state,
    // legacy orchestrator 兼容字段
    targetCount: state?.listCollection?.targetCount || 0,
    collectedNoteIds: completed,
    failedNoteIds: failed,
  };
}

export function getStateFilePath(keyword, env = 'download') {
  return resolveXhsCollectStatePath({ keyword, env });
}

// 兼容旧 orchestrator：仅创建对象，不落盘
export function createInitialState(keyword, env = 'download', targetCount = 50) {
  const state = createDefaultXhsCollectState({ keyword, env, targetCount });
  state.startTime = new Date().toISOString();
  state.lastUpdateTime = state.startTime;
  state.status = 'running';
  return state;
}

export async function loadState(keyword, env = 'download') {
  const state = await loadXhsCollectState({ keyword, env });
  return toCompat(state);
}

export async function saveState(a, b, c) {
  // 兼容两种调用：
  // - saveState(state, keyword, env)
  // - saveState(keyword, env, state)  (legacy orchestrator 曾经这样调用)
  const stateArg = a && typeof a === 'object' ? a : c;
  const keyword = a && typeof a === 'object' ? b : a;
  const env = a && typeof a === 'object' ? c : b;

  const state = stateArg || {};
  const base = await loadXhsCollectState({ keyword, env });
  const merged = { ...base, ...state };

  // legacy: targetCount / collectedNoteIds / failedNoteIds
  if (typeof state.targetCount === 'number') {
    merged.listCollection.targetCount = state.targetCount;
  }
  if (Array.isArray(state.collectedNoteIds)) {
    const ids = state.collectedNoteIds.map((x) => String(x || '').trim()).filter(Boolean);
    merged.detailCollection.completedNoteIds = Array.from(new Set(ids));
    merged.detailCollection.completed = merged.detailCollection.completedNoteIds.length;
  }
  if (Array.isArray(state.failedNoteIds)) {
    const ids = state.failedNoteIds.map((x) => String(x || '').trim()).filter(Boolean);
    const unique = Array.from(new Set(ids));
    merged.detailCollection.failedNoteIds = unique.map((noteId) => ({
      noteId,
      error: 'unknown',
      timestamp: new Date().toISOString(),
    }));
    merged.detailCollection.failed = unique.length;
  }
  merged.detailCollection.total =
    merged.detailCollection.completed + merged.detailCollection.failed + merged.detailCollection.skipped;

  await saveXhsCollectState(merged, { keyword, env });
}

export async function initializeState(keyword, env = 'download', targetCount = 50) {
  return initializeXhsCollectState({ keyword, env, targetCount });
}

export async function updateListCollection(keyword, env, newUrls) {
  return updateXhsListCollection({ keyword, env, newUrls });
}

export async function updateDetailCollection(keyword, env, noteId, status, error = null) {
  return updateXhsDetailCollection({
    keyword,
    env,
    noteId,
    status,
    ...(error ? { error } : {}),
  });
}

export async function markCompleted(keyword, env) {
  return markXhsCollectCompleted({ keyword, env });
}

export async function markFailed(keyword, env, error) {
  return markXhsCollectFailed({ keyword, env, error: String(error || 'unknown') });
}

export async function resetState(keyword, env) {
  return resetXhsCollectState({ keyword, env });
}

export async function getPendingItems(keyword, env) {
  return getXhsPendingItems({ keyword, env });
}

export function formatStateSummary(state) {
  return formatXhsCollectStateSummary(state);
}
