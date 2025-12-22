/**
 * 统一错误处理
 * 提供日志输出、错误聚合与上报机制
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LOG_DIR = path.join(os.homedir(), '.webauto', 'logs');
const ERROR_FILE = path.join(LOG_DIR, 'errors.log');
const SESSION_FILE = path.join(LOG_DIR, 'session');

await fs.mkdir(LOG_DIR, { recursive: true });

class ErrorHandler {
  constructor() {
    this.sessionId = this._generateSessionId();
    this.errors = [];
    this._initialized = false;
  }

  // 初始化
  async init() {
    if (this._initialized) return;
    // 记录会话
    await fs.writeFile(SESSION_FILE, JSON.stringify({ sessionId: this.sessionId, startedAt: Date.now() }));
    this._initialized = true;
  }

  // 记录错误
  async log(module, error, context = {}) {
    const entry = {
      ts: Date.now(),
      sessionId: this.sessionId,
      module,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      context
    };
    this.errors.push(entry);
    // 异步写入文件
    this._appendLog(entry);
    // 如果是严重错误，可在此处上报或触发告警
    if (error.code === 'EADDRINUSE' || error.code === 'ENOTFOUND') {
      console.error(`[ErrorHandler] 网络错误，建议检查端口或服务状态: ${error.message}`);
    }
  }

  // 记录警告
  async warn(module, message, context = {}) {
    const entry = {
      ts: Date.now(),
      sessionId: this.sessionId,
      module,
      level: 'warn',
      message,
      context
    };
    this.errors.push(entry);
    this._appendLog(entry);
  }

  // 记录信息
  async info(module, message, context = {}) {
    const entry = {
      ts: Date.now(),
      sessionId: this.sessionId,
      module,
      level: 'info',
      message,
      context
    };
    this.errors.push(entry);
    this._appendLog(entry);
  }

  // 记录调试
  async debug(module, message, context = {}) {
    if (process.env.NODE_ENV !== 'development') return;
    const entry = {
      ts: Date.now(),
      sessionId: this.sessionId,
      module,
      level: 'debug',
      message,
      context
    };
    this.errors.push(entry);
    this._appendLog(entry);
  }

  // 获取最新错误
  recent(limit = 20) {
    return this.errors.slice(-limit);
  }

  // 按模块过滤
  byModule(module, limit = 20) {
    return this.errors.filter(e => e.module === module).slice(-limit);
  }

  // 清理日志（按时间）
  async cleanup(maxFiles = 10) {
    try {
      const files = await fs.readdir(LOG_DIR);
      const logs = files.filter(f => f.endsWith('.log')).sort((a, b) => b.localeCompare(a));
      if (logs.length > maxFiles) {
        const toDelete = logs.slice(maxFiles);
        for (const f of toDelete) {
          await fs.unlink(path.join(LOG_DIR, f)).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[ErrorHandler] 清理失败:', err);
    }
  }

  // 统计错误
  stats(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    const recent = this.errors.filter(e => e.ts > since);
    const byLevel = {};
    const byModule = {};
    for (const e of recent) {
      const level = e.level || 'error';
      byLevel[level] = (byLevel[level] || 0) + 1;
      byModule[e.module] = (byModule[e.module] || 0) + 1;
    }
    return { total: recent.length, byLevel, byModule, hours };
  }

  // 生成会话ID
  _generateSessionId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2);
  }

  // 写入日志文件
  async _appendLog(entry) {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(ERROR_FILE, line).catch(() => {});
  }
}

// 单例
let instance = null;

export async function getErrorHandler() {
  if (!instance) {
    instance = new ErrorHandler();
    await instance.init();
  }
  return instance;
}

export { ErrorHandler };
