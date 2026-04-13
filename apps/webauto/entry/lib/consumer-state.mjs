/**
 * Consumer State Persistence Module
 *
 * 职责：
 * 1. 持久化 Consumer 处理进度（processed count, last claim time）
 * 2. 支持崩溃恢复：重启后恢复进度
 * 3. 支持多 keyword 独立状态文件
 *
 * 文件路径格式：
 * ~/.webauto/state/consumer/<env>/<keyword>/consumer-state.json
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const WEBAUTO_HOME = process.env.WEBAUTO_HOME || path.join(os.homedir(), '.webauto');
const CONSUMER_STATE_DIR = path.join(WEBAUTO_HOME, 'state', 'consumer');

/**
 * 解析状态文件路径
 */
function resolveStatePath(keyword, env = 'prod') {
  const safeKeyword = encodeURIComponent(String(keyword || "default").trim());
  const dir = path.join(CONSUMER_STATE_DIR, env, safeKeyword);
  return {
    dir,
    file: path.join(dir, 'consumer-state.json'),
  };
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 加载 Consumer 状态
 */
export function loadConsumerState(keyword, env = 'prod') {
  const { file } = resolveStatePath(keyword, env);

  if (!fs.existsSync(file)) {
    return {
      processed: 0,
      lastClaimAt: null,
      lastProcessedNoteId: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      consecutiveErrors: 0,
      lastError: null,
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return {
      processed: Number(data.processed || 0),
      lastClaimAt: data.lastClaimAt || null,
      lastProcessedNoteId: data.lastProcessedNoteId || null,
      startedAt: data.startedAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      consecutiveErrors: Number(data.consecutiveErrors || 0),
      lastError: data.lastError || null,
    };
  } catch (err) {
    console.error(`[consumer-state] failed to load state: ${err.message}`);
    return {
      processed: 0,
      lastClaimAt: null,
      lastProcessedNoteId: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      consecutiveErrors: 0,
      lastError: null,
    };
  }
}

/**
 * 保存 Consumer 状态
 */
export function saveConsumerState(keyword, env = 'prod', state) {
  const { dir, file } = resolveStatePath(keyword, env);
  ensureDir(dir);

  const payload = {
    processed: Number(state.processed || 0),
    lastClaimAt: state.lastClaimAt || null,
    lastProcessedNoteId: state.lastProcessedNoteId || null,
    startedAt: state.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consecutiveErrors: Number(state.consecutiveErrors || 0),
    lastError: state.lastError || null,
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

/**
 * 更新处理进度
 */
export function updateProcessedCount(keyword, env = 'prod', increment = 1, noteId = null) {
  const state = loadConsumerState(keyword, env);
  state.processed += increment;
  state.lastClaimAt = new Date().toISOString();
  if (noteId) state.lastProcessedNoteId = noteId;
  state.consecutiveErrors = 0;
  state.lastError = null;
  return saveConsumerState(keyword, env, state);
}

/**
 * 记录错误
 */
export function recordError(keyword, env = 'prod', errorMsg) {
  const state = loadConsumerState(keyword, env);
  state.consecutiveErrors += 1;
  state.lastError = errorMsg;
  return saveConsumerState(keyword, env, state);
}

/**
 * 重置状态（用于新任务开始）
 */
export function resetConsumerState(keyword, env = 'prod') {
  const { dir, file } = resolveStatePath(keyword, env);
  ensureDir(dir);

  const payload = {
    processed: 0,
    lastClaimAt: null,
    lastProcessedNoteId: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consecutiveErrors: 0,
    lastError: null,
    sessionId: `session-${Date.now()}`,
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

/**
 * 清理旧状态文件（超过 N 天）
 */
export function cleanupOldStates(maxAgeDays = 7) {
  if (!fs.existsSync(CONSUMER_STATE_DIR)) return { cleaned: 0 };

  const cutoffMs = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  let cleaned = 0;

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === 'consumer-state.json') {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < cutoffMs) {
            fs.unlinkSync(fullPath);
            cleaned++;
          }
        } catch {}
      }
    }
  };

  walk(CONSUMER_STATE_DIR);
  return { cleaned };
}
