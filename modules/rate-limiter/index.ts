/**
 * RateLimiter - 统一流控配额系统
 *
 * 功能：
 * - 管理 search/like/comment 等操作的配额
 * - 支持多维度限制（关键字、profile、全局）
 * - 可配置规则，支持持久化
 *
 * 使用方式：
 *   const limiter = RateLimiter.getInstance();
 *   const result = await limiter.acquire('search', { keyword: '春晚' });
 *   if (!result.granted) {
 *     console.log(`被拒绝: ${result.reason}, 需等待 ${result.waitMs}ms`);
 *     return;
 *   }
 *   // 执行搜索...
 *   await limiter.record('search', { keyword: '春晚' });
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

// 配额类型
export type QuotaType = 'search' | 'like' | 'comment' | 'follow' | 'repost';

// 配额范围
export type QuotaScope = 'keyword' | 'profile' | 'global';

// 规则定义
export interface QuotaRule {
  scope: QuotaScope;
  windowMs: number;      // 时间窗口（毫秒）
  max: number;           // 窗口内最大次数
  key?: string;          // 可读描述
}

// 配额类型配置
export interface QuotaConfig {
  rules: QuotaRule[];
}

// 完整配置
export interface RateLimiterConfig {
  [type: string]: QuotaConfig;
}

// 历史记录条目
interface HistoryEntry {
  ts: number;            // 时间戳
  key: string;           // 维度键（如 keyword:春晚, profile:xxx）
}

// 申请结果
export interface AcquireResult {
  granted: boolean;
  reason?: string;
  waitMs?: number;       // 建议等待时间
  ruleKey?: string;      // 触发的规则
}

// 默认配置
const DEFAULT_CONFIG: RateLimiterConfig = {
  search: {
    rules: [
      { scope: 'keyword', windowMs: 600000, max: 3, key: '同一关键字10分钟内最多3次' },
      { scope: 'global', windowMs: 60000, max: 10, key: '全局搜索1分钟内最多10次' },
    ],
  },
  like: {
    rules: [
      { scope: 'profile', windowMs: 60000, max: 6, key: '同一账号1分钟内最多点赞6次' },
      { scope: 'profile', windowMs: 3600000, max: 100, key: '同一账号1小时内最多点赞100次' },
    ],
  },
  comment: {
    rules: [
      { scope: 'profile', windowMs: 60000, max: 1, key: '同一账号1分钟内最多评论1次' },
      { scope: 'profile', windowMs: 3600000, max: 30, key: '同一账号1小时内最多评论30次' },
    ],
  },
  follow: {
    rules: [
      { scope: 'profile', windowMs: 60000, max: 2, key: '同一账号1分钟内最多关注2次' },
      { scope: 'profile', windowMs: 3600000, max: 20, key: '同一账号1小时内最多关注20次' },
    ],
  },
  repost: {
    rules: [
      { scope: 'profile', windowMs: 60000, max: 1, key: '同一账号1分钟内最多转发1次' },
      { scope: 'profile', windowMs: 3600000, max: 10, key: '同一账号1小时内最多转发10次' },
    ],
  },
};

function resolveConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'config', 'rate-limits.json');
}

function resolveHistoryPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'rate-limiter-history.json');
}

export class RateLimiter {
  private static instance: RateLimiter | null = null;
  
  private config: RateLimiterConfig;
  private history: Map<string, HistoryEntry[]> = new Map();
  private configPath: string;
  private historyPath: string;
  private initialized = false;
  
  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = resolveConfigPath();
    this.historyPath = resolveHistoryPath();
  }
  
  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }
  
  // 初始化：加载配置和历史
  async init(): Promise<void> {
    if (this.initialized) return;
    
    // 加载用户配置（覆盖默认值）
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const userConfig = JSON.parse(content);
      this.config = { ...DEFAULT_CONFIG, ...userConfig };
      console.log('[RateLimiter] Loaded user config from', this.configPath);
    } catch {
      // 使用默认配置
    }
    
    // 加载历史记录
    try {
      const content = await fs.readFile(this.historyPath, 'utf-8');
      const data = JSON.parse(content);
      for (const [key, entries] of Object.entries(data)) {
        this.history.set(key, entries as HistoryEntry[]);
      }
      // 清理过期历史
      this.cleanExpiredHistory();
    } catch {
      // 无历史记录
    }
    
    this.initialized = true;
  }
  
  // 申请配额
  async acquire(
    type: QuotaType,
    params: { keyword?: string; profileId?: string; platform?: string }
  ): Promise<AcquireResult> {
    await this.init();
    
    const typeConfig = this.config[type];
    if (!typeConfig) {
      return { granted: true }; // 无配置的类型默认允许
    }
    
    const now = Date.now();
    
    for (const rule of typeConfig.rules) {
      const key = this.buildKey(type, rule.scope, params);
      const entries = this.history.get(key) || [];
      
      // 统计窗口内的次数
      const windowStart = now - rule.windowMs;
      const count = entries.filter(e => e.ts > windowStart).length;
      
      if (count >= rule.max) {
        // 找到最早的过期时间，计算等待时间
        const oldestInWindow = entries.find(e => e.ts > windowStart);
        const waitMs = oldestInWindow ? (oldestInWindow.ts + rule.windowMs - now) : rule.windowMs;
        
        return {
          granted: false,
          reason: rule.key || `配额已用尽: ${rule.scope} ${rule.windowMs}ms 内最多 ${rule.max} 次`,
          waitMs: Math.max(0, waitMs),
          ruleKey: `${type}:${rule.scope}:${rule.windowMs}`,
        };
      }
    }
    
    return { granted: true };
  }
  
  // 记录执行
  async record(
    type: QuotaType,
    params: { keyword?: string; profileId?: string; platform?: string }
  ): Promise<void> {
    await this.init();
    
    const typeConfig = this.config[type];
    if (!typeConfig) return;
    
    const now = Date.now();
    
    // 为所有相关维度记录
    for (const rule of typeConfig.rules) {
      const key = this.buildKey(type, rule.scope, params);
      const entries = this.history.get(key) || [];
      entries.push({ ts: now, key });
      this.history.set(key, entries);
    }
    
    // 持久化历史（异步，不阻塞）
    this.persistHistory().catch(() => {});
  }
  
  // 构建维度键
  private buildKey(
    type: QuotaType,
    scope: QuotaScope,
    params: { keyword?: string; profileId?: string; platform?: string }
  ): string {
    switch (scope) {
      case 'keyword':
        return `${type}:keyword:${params.keyword || '*'}`;
      case 'profile':
        return `${type}:profile:${params.profileId || '*'}`;
      case 'global':
        return `${type}:global`;
      default:
        return `${type}:unknown`;
    }
  }
  
  // 清理过期历史
  private cleanExpiredHistory(): void {
    const now = Date.now();
    const maxWindow = 3600000; // 1小时
    
    for (const [key, entries] of this.history) {
      const filtered = entries.filter(e => now - e.ts < maxWindow);
      if (filtered.length === 0) {
        this.history.delete(key);
      } else if (filtered.length !== entries.length) {
        this.history.set(key, filtered);
      }
    }
  }
  
  // 持久化历史
  private async persistHistory(): Promise<void> {
    try {
      const dir = path.dirname(this.historyPath);
      await fs.mkdir(dir, { recursive: true });
      
      const data: Record<string, HistoryEntry[]> = {};
      for (const [key, entries] of this.history) {
        data[key] = entries;
      }
      
      await fs.writeFile(this.historyPath, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.error('[RateLimiter] Failed to persist history:', err);
    }
  }
  
  // 获取当前配置
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }
  
  // 更新配置
  async updateConfig(newConfig: Partial<RateLimiterConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    try {
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      console.log('[RateLimiter] Config saved to', this.configPath);
    } catch (err) {
      console.error('[RateLimiter] Failed to save config:', err);
    }
  }
  
  // 获取状态（用于调试/UI）
  getStatus(): { type: QuotaType; scope: QuotaScope; count: number; max: number; windowMs: number }[] {
    const result: { type: QuotaType; scope: QuotaScope; count: number; max: number; windowMs: number }[] = [];
    const now = Date.now();
    
    for (const [type, typeConfig] of Object.entries(this.config)) {
      for (const rule of typeConfig.rules) {
        const key = `${type}:${rule.scope}`;
        let totalCount = 0;
        
        for (const [k, entries] of this.history) {
          if (k.startsWith(key)) {
            const windowStart = now - rule.windowMs;
            totalCount += entries.filter(e => e.ts > windowStart).length;
          }
        }
        
        result.push({
          type: type as QuotaType,
          scope: rule.scope,
          count: totalCount,
          max: rule.max,
          windowMs: rule.windowMs,
        });
      }
    }
    
    return result;
  }
}

// 单例导出
export const rateLimiter = RateLimiter.getInstance();
