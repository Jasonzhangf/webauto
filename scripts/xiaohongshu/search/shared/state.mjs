/**
 * 状态管理模块（.collect-state.json）
 *
 * 用途：
 * - 持久化采集进度（已采集列表、当前索引）
 * - 支持断点恢复
 * - 记录采集统计（成功/失败/跳过）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const STATE_FILENAME = '.collect-state.json';

/**
 * 获取状态文件路径
 */
export function getStateFilePath(keyword, env = 'download') {
  const basePath = path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', env, keyword);
  return path.join(basePath, STATE_FILENAME);
}

/**
 * 默认状态结构
 */
function createDefaultState() {
  return {
    version: 1,
    keyword: '',
    env: 'download',
    startTime: null,
    lastUpdateTime: null,
    status: 'idle', // idle | running | completed | failed

    // Phase2: 列表采集
    listCollection: {
      targetCount: 0,
      collectedUrls: [], // { noteId, safeDetailUrl, searchUrl, timestamp }
      currentUrlIndex: 0,
      scrollRounds: 0,
      lastScrollTime: null
    },

    // Phase3-4: 详情/评论采集
    detailCollection: {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      completedNoteIds: [], // 已完成的 noteId 列表
      failedNoteIds: [] // { noteId, error, timestamp }
    },

    // 统计
    stats: {
      totalDurationMs: 0,
      phase2DurationMs: 0,
      phase3DurationMs: 0,
      phase4DurationMs: 0
    }
  };
}

/**
 * 加载状态文件
 */
export async function loadState(keyword, env = 'download') {
  const statePath = getStateFilePath(keyword, env);

  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 文件不存在，返回默认状态
      const defaultState = createDefaultState();
      defaultState.keyword = keyword;
      defaultState.env = env;
      return defaultState;
    }
    throw error;
  }
}

/**
 * 保存状态文件
 */
export async function saveState(state, keyword, env = 'download') {
  const statePath = getStateFilePath(keyword, env);
  const basePath = path.dirname(statePath);

  // 确保目录存在
  await fs.mkdir(basePath, { recursive: true });

  // 更新时间戳
  state.lastUpdateTime = new Date().toISOString();

  // 持久化
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * 初始化状态（开始采集时调用）
 */
export async function initializeState(keyword, env = 'download', targetCount = 50) {
  const state = createDefaultState();
  state.keyword = keyword;
  state.env = env;
  state.startTime = new Date().toISOString();
  state.status = 'running';
  state.listCollection.targetCount = targetCount;

  await saveState(state, keyword, env);
  return state;
}

/**
 * 更新 Phase2 列表采集状态
 */
export async function updateListCollection(keyword, env, newUrls) {
  const state = await loadState(keyword, env);

  // 去重追加
  const existingIds = new Set(state.listCollection.collectedUrls.map(u => u.noteId));
  const uniqueNewUrls = newUrls.filter(u => !existingIds.has(u.noteId));

  state.listCollection.collectedUrls.push(...uniqueNewUrls);
  state.listCollection.collectedUrls.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  await saveState(state, keyword, env);
  return state;
}

/**
 * 更新 Phase3-4 详情采集状态
 */
export async function updateDetailCollection(keyword, env, noteId, status, error = null) {
  const state = await loadState(keyword, env);

  state.detailCollection.total++;

  if (status === 'completed') {
    state.detailCollection.completed++;
    state.detailCollection.completedNoteIds.push(noteId);
  } else if (status === 'failed') {
    state.detailCollection.failed++;
    state.detailCollection.failedNoteIds.push({
      noteId,
      error,
      timestamp: new Date().toISOString()
    });
  } else if (status === 'skipped') {
    state.detailCollection.skipped++;
  }

  await saveState(state, keyword, env);
  return state;
}

/**
 * 标记状态为完成
 */
export async function markCompleted(keyword, env) {
  const state = await loadState(keyword, env);
  state.status = 'completed';
  state.stats.totalDurationMs = Date.now() - new Date(state.startTime).getTime();
  await saveState(state, keyword, env);
  return state;
}

/**
 * 标记状态为失败
 */
export async function markFailed(keyword, env, error) {
  const state = await loadState(keyword, env);
  state.status = 'failed';
  state.error = error;
  await saveState(state, keyword, env);
  return state;
}

/**
 * 重置状态（重新开始采集）
 */
export async function resetState(keyword, env) {
  const statePath = getStateFilePath(keyword, env);
  try {
    await fs.unlink(statePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return true; // 文件不存在也算成功
    }
    throw error;
  }
}

/**
 * 获取待采集列表（断点恢复用）
 */
export async function getPendingItems(keyword, env) {
  const state = await loadState(keyword, env);
  const completedIds = new Set(state.detailCollection.completedNoteIds);

  return state.listCollection.collectedUrls.filter(url => !completedIds.has(url.noteId));
}

/**
 * 打印状态摘要（调试用）
 */
export function formatStateSummary(state) {
  const lines = [
    `=== 采集状态摘要 ===`,
    `关键词: ${state.keyword}`,
    `环境: ${state.env}`,
    `状态: ${state.status}`,
    `开始时间: ${state.startTime}`,
    ``,
    `Phase2 列表采集:`,
    `  目标数量: ${state.listCollection.targetCount}`,
    `  已采集链接: ${state.listCollection.collectedUrls.length}`,
    `  滚动轮数: ${state.listCollection.scrollRounds}`,
    ``,
    `Phase3-4 详情采集:`,
    `  总计: ${state.detailCollection.total}`,
    `  完成: ${state.detailCollection.completed}`,
    `  失败: ${state.detailCollection.failed}`,
    `  跳过: ${state.detailCollection.skipped}`,
    ``,
    `统计:`,
    `  总耗时: ${Math.round(state.stats.totalDurationMs / 1000)}s`,
    `  Phase2: ${Math.round(state.stats.phase2DurationMs / 1000)}s`,
    `  Phase3: ${Math.round(state.stats.phase3DurationMs / 1000)}s`,
    `  Phase4: ${Math.round(state.stats.phase4DurationMs / 1000)}s`,
    `==================`
  ];
  return lines.join('\n');
}
