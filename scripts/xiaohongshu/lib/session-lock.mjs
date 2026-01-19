/**
 * 会话锁模块
 *
 * 规则：同一 profile 在任意时刻只允许一个采集任务运行。
 * 这里的锁仅用于采集脚本自身，避免误伤常驻服务。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createSessionLock({ profileId, lockType = 'collector', force = false } = {}) {
  if (!profileId) throw new Error('createSessionLock: profileId is required');

  const lockDir = path.join(os.homedir(), '.webauto', 'locks');
  const lockPath = path.join(lockDir, `${profileId}.${lockType}.lock`);

  function isProcessAlive(pid) {
    if (!pid || !Number.isFinite(Number(pid))) return false;
    try {
      process.kill(Number(pid), 0);
      return true;
    } catch {
      return false;
    }
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
      profile: profileId,
      type: lockType,
    };
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  function removeLockFile() {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }

  function acquire() {
    const existing = readLockFile();

    if (!force && existing && existing.type === lockType && isProcessAlive(existing.pid)) {
      throw new Error(
        `[Lock] 已有运行中的采集任务占用 profile=${profileId} (pid=${existing.pid} startedAt=${existing.startedAt})`,
      );
    }

    if (existing && !isProcessAlive(existing.pid)) {
      console.warn(`[Lock] 发现过期锁，自动清理: ${lockPath}`);
    }

    writeLockFile();

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

    return { lockPath, release: cleanup };
  }

  return { lockPath, acquire };
}
