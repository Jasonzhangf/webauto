/**
 * 会话锁模块
 *
 * 规则：同一 profile 在任意时刻只允许一个采集任务运行。
 * 这里的锁仅用于采集脚本自身，避免误伤常驻服务。
 * 增强：支持 timeout（最长5分钟）和心跳机制
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟
const HEARTBEAT_INTERVAL_MS = 30 * 1000;  // 30秒心跳

export function createSessionLock({ profileId, lockType = 'collector', force = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!profileId) throw new Error('createSessionLock: profileId is required');

  const lockDir = path.join(os.homedir(), '.webauto', 'locks');
  const lockPath = path.join(lockDir, `${profileId}.${lockType}.lock`);

  let heartbeatInterval = null;

  function isProcessAlive(pid) {
    if (!pid || !Number.isFinite(Number(pid))) return false;
    try {
      process.kill(Number(pid), 0);
      return true;
    } catch {
      return false;
    }
  }

  function isLockExpired(data) {
    if (!data || !data.startedAt) return true;
    const startTime = new Date(data.startedAt).getTime();
    return (Date.now() - startTime) > timeoutMs;
  }

  function readLockFile() {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  function writeLockFile() {
    fs.mkdirSync(lockDir, { recursive: true });
    const payload = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile: profileId,
      type: lockType,
      timeoutMs,
    };
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  function updateHeartbeat() {
    try {
      const existing = readLockFile();
      if (existing && existing.pid === process.pid) {
        existing.updatedAt = new Date().toISOString();
        fs.writeFileSync(lockPath, JSON.stringify(existing, null, 2), 'utf8');
      }
    } catch {
      // ignore heartbeat errors
    }
  }

  function removeLockFile() {
    try {
      const existing = readLockFile();
      // 只删除自己的锁
      if (existing && existing.pid === process.pid) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // ignore
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function acquire() {
    const existing = readLockFile();

    if (!force && existing && existing.type === lockType) {
      // 检查进程是否存活
      const processAlive = isProcessAlive(existing.pid);
      // 检查是否过期
      const expired = isLockExpired(existing);

      if (processAlive && !expired) {
        throw new Error(
          `[Lock] 已有运行中的采集任务占用 profile=${profileId} (pid=${existing.pid} startedAt=${existing.startedAt})`,
        );
      }

      if (!processAlive) {
        console.warn(`[Lock] 发现进程已死的过期锁，自动清理: ${lockPath}`);
      } else if (expired) {
        console.warn(`[Lock] 发现超时过期锁（>${timeoutMs}ms），自动清理: ${lockPath}`);
      }
    }

    writeLockFile();

    // 启动心跳
    heartbeatInterval = setInterval(updateHeartbeat, HEARTBEAT_INTERVAL_MS);

    const cleanup = () => removeLockFile();
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(130);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(143);
    });
    // 处理未捕获异常，确保锁释放
    process.on('uncaughtException', (err) => {
      console.error('[Lock] Uncaught exception, releasing lock:', err.message);
      cleanup();
      process.exit(1);
    });

    return { lockPath, release: cleanup };
  }

  return { lockPath, acquire };
}
