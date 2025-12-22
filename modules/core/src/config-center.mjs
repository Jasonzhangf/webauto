/**
 * 集中配置管理
 * 支持运行时覆盖与环境变量注入
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.webauto', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'core.json');
const ENV_PREFIX = 'WEBAUTO_';

// 默认配置
const DEFAULTS = {
  ports: {
    workflow: 7701,
    browser: 7704,
    controller: 8970,
    bus: 8790,
    ws: 8765
  },
  paths: {
    profiles: path.join(os.homedir(), '.webauto', 'profiles'),
    cookies: path.join(os.homedir(), '.webauto', 'cookies'),
    containers: path.join(os.homedir(), '.webauto', 'container-lib'),
    logs: path.join(os.homedir(), '.webauto', 'logs')
  },
  modules: {
    workflow: { enabled: true, autoStart: true },
    browser: { enabled: true, autoStart: true },
    controller: { enabled: true, autoStart: true },
    ui: { enabled: true, headless: false }
  },
  logging: {
    level: 'info',
    maxFiles: 10,
    maxSize: '10m'
  }
};

class ConfigCenter {
  constructor() {
    this.config = JSON.parse(JSON.stringify(DEFAULTS));
    this._loaded = false;
  }

  // 加载配置（文件 + 环境变量）
  async load() {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      const fileConfig = await this._loadFromFile();
      const envConfig = this._loadFromEnv();
      this.config = this._merge(DEFAULTS, fileConfig, envConfig);
      this._loaded = true;
    } catch (err) {
      console.error('[ConfigCenter] 加载失败，使用默认配置:', err);
      this.config = JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  // 获取配置
  get(path) {
    if (!this._loaded) {
      throw new Error('配置尚未加载，请先调用 load()');
    }
    return this._getByPath(this.config, path);
  }

  // 设置配置
  async set(path, value) {
    this._setByPath(this.config, path, value);
    await this._saveToFile();
  }

  // 获取所有配置
  getAll() {
    return JSON.parse(JSON.stringify(this.config));
  }

  // 重置为默认
  async reset() {
    this.config = JSON.parse(JSON.stringify(DEFAULTS));
    await this._saveToFile();
  }

  // 从文件加载
  async _loadFromFile() {
    try {
      const raw = await fs.readFile(CONFIG_FILE, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  // 从环境变量加载
  _loadFromEnv() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(ENV_PREFIX)) {
        const path = key.slice(ENV_PREFIX.length).toLowerCase().replace(/_/g, '.');
        this._setByPath(env, path, this._parseEnvValue(value));
      }
    }
    return env;
  }

  // 保存到文件
  async _saveToFile() {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('[ConfigCenter] 保存失败:', err);
    }
  }

  // 合并配置
  _merge(target, ...sources) {
    const result = JSON.parse(JSON.stringify(target));
    for (const src of sources) {
      for (const key in src) {
        if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
          result[key] = this._merge(result[key] || {}, src[key]);
        } else {
          result[key] = src[key];
        }
      }
    }
    return result;
  }

  // 根据路径获取值
  _getByPath(obj, path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  }

  // 根据路径设置值
  _setByPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => {
      if (!o[k] || typeof o[k] !== 'object') o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  }

  // 解析环境变量值
  _parseEnvValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
  }
}

// 单例
let instance = null;

export async function getConfigCenter() {
  if (!instance) {
    instance = new ConfigCenter();
    await instance.load();
  }
  return instance;
}

export { ConfigCenter };
