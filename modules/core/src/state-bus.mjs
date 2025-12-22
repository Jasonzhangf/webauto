/**
 * 统一状态总线
 * 支持模块注册、状态订阅与广播
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = path.join(os.homedir(), '.webauto', 'cache');
const STATE_FILE = path.join(CACHE_DIR, 'state-bus.json');
const EVENTS_FILE = path.join(CACHE_DIR, 'events.log');

await fs.mkdir(CACHE_DIR, { recursive: true });

class StateBus {
  constructor() {
    this.modules = new Map();
    this.subscribers = new Map();
    this.state = new Map();
    this.events = [];
    this._persistTimer = null;
  }

  // 注册模块
  register(module, options = {}) {
    if (!module || typeof module !== 'string') {
      throw new Error('模块名称必须为字符串');
    }
    const info = { name: module, version: options.version, registeredAt: Date.now(), ...options };
    this.modules.set(module, info);
    this.state.set(module, { status: 'registered', lastUpdate: Date.now() });
    this._broadcast('module:registered', { module, info });
    this._schedulePersist();
  }

  // 注销模块
  unregister(module) {
    this.modules.delete(module);
    this.state.delete(module);
    this._broadcast('module:unregistered', { module });
    this._schedulePersist();
  }

  // 订阅事件
  subscribe(module, event, callback) {
    if (!callback || typeof callback !== 'function') {
      throw new Error('回调必须为函数');
    }
    const key = `${module}:${event}`;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key).push(callback);
  }

  // 发布事件
  publish(event, data) {
    this._broadcast(event, data);
    this._schedulePersist();
  }

  // 获取模块状态
  getState(module) {
    if (module) {
      return this.state.get(module);
    }
    return Object.fromEntries(this.state);
  }

  // 设置模块状态
  setState(module, state) {
    const prev = this.state.get(module) || {};
    const now = { ...prev, ...state, lastUpdate: Date.now() };
    this.state.set(module, now);
    this._broadcast('state:changed', { module, prev, now });
    this._schedulePersist();
  }

  // 获取所有模块列表
  listModules() {
    return Array.from(this.modules.keys());
  }

  // 获取模块信息
  getModuleInfo(module) {
    return this.modules.get(module);
  }

  // 广播事件
  _broadcast(event, data) {
    const entry = { timestamp: Date.now(), event, data };
    this.events.push(entry);
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
    // 通知所有订阅者
    for (const [key, callbacks] of this.subscribers.entries()) {
      const [subModule, subEvent] = key.split(':');
      if (event === subEvent || subEvent === '*') {
        for (const cb of callbacks) {
          try {
            cb(entry);
          } catch (err) {
            console.error(`[StateBus] 订阅回调错误 (${key}):`, err);
          }
        }
      }
    }
  }

  // 延迟持久化
  _schedulePersist() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => this._persist(), 500);
  }

  // 持久化到文件
  async _persist() {
    try {
      const data = {
        modules: Object.fromEntries(this.modules),
        state: Object.fromEntries(this.state),
        events: this.events.slice(-100)
      };
      await fs.writeFile(STATE_FILE, JSON.stringify(data, null, 2));
      await fs.writeFile(EVENTS_FILE, this.events.map(e => JSON.stringify(e)).join('\n') + '\n');
    } catch (err) {
      console.error('[StateBus] 持久化失败:', err);
    }
  }

  // 从文件恢复
  async restore() {
    try {
      const data = await fs.readFile(STATE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      this.modules = new Map(Object.entries(parsed.modules || {}));
      this.state = new Map(Object.entries(parsed.state || {}));
      this.events = parsed.events || [];
    } catch {
      // 首次启动忽略
    }
  }
}

// 单例
let instance = null;

export function getStateBus() {
  if (!instance) {
    instance = new StateBus();
    // 启动时恢复
    instance.restore().catch(() => {});
  }
  return instance;
}

export { StateBus };
