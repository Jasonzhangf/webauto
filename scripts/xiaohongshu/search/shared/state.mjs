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
  return loadXhsCollectState({ keyword, env });
}

export async function saveState(state, keyword, env = 'download') {
  await saveXhsCollectState(state, { keyword, env });
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

