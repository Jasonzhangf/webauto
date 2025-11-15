/**
 * WebAuto Operator Framework - 状态操作子
 * @package @webauto/operator-framework
 */

import { NonPageOperator, NonPageOperatorConfig } from '../../core/NonPageOperator';
import { OperationResult, OperatorConfig, OperatorCategory, OperatorType } from '../../core/types/OperatorTypes';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface StateParams {
  action: 'set' | 'get' | 'delete' | 'list' | 'clear' | 'persist' | 'load' | 'increment' | 'decrement';
  key?: string;
  value?: any;
  path?: string;
  incrementBy?: number;
  namespace?: string;
  ttl?: number;
}

export interface StateEntry {
  key: string;
  value: any;
  namespace: string;
  timestamp: number;
  ttl?: number;
  expiresAt?: number;
}

export class StateOperator extends NonPageOperator {
  private _stateStore: Map<string, StateEntry>;
  private _persistencePath: string;

  constructor(config: Partial<OperatorConfig> & { persistencePath?: string } = {}) {
    super({
      id: 'state-operator',
      name: '状态操作子',
      type: OperatorType.NON_PAGE,
      category: OperatorCategory.CONTROL,
      description: '管理工作流状态和持久化存储',
      requireInitialization: false,
      asyncSupported: true,
      maxConcurrency: 20,
      ...config
    });

    this._stateStore = new Map();
    this._persistencePath = config.persistencePath || './state.json';
  }

  async executeNonPageOperation(params: StateParams): Promise<OperationResult> {
    switch (params.action) {
      case 'set':
        return this.setState(params.key!, params.value, params.namespace, params.ttl);
      case 'get':
        return this.retrieveState(params.key!, params.namespace);
      case 'delete':
        return this.deleteState(params.key!, params.namespace);
      case 'list':
        return this.listStates(params.namespace);
      case 'clear':
        return this.clearStates(params.namespace);
      case 'persist':
        return this.persistStates(params.path);
      case 'load':
        return this.loadStates(params.path);
      case 'increment':
        return this.incrementState(params.key!, params.incrementBy || 1, params.namespace);
      case 'decrement':
        return this.decrementState(params.key!, params.incrementBy || 1, params.namespace);
      default:
        return this.createErrorResult(`未知操作: ${params.action}`);
    }
  }

  validateParams(params: StateParams): boolean {
    if (!params.action || !['set', 'get', 'delete', 'list', 'clear', 'persist', 'load', 'increment', 'decrement'].includes(params.action)) {
      return false;
    }

    const needsKey = ['set', 'get', 'delete', 'increment', 'decrement'].includes(params.action);
    if (needsKey && !params.key) {
      return false;
    }

    const needsValue = ['set'].includes(params.action);
    if (needsValue && params.value === undefined) {
      return false;
    }

    const needsPath = ['persist', 'load'].includes(params.action);
    if (needsPath && !params.path) {
      return false;
    }

    return true;
  }

  // 核心状态管理方法
  private async setState(key: string, value: any, namespace?: string, ttl?: number): Promise<OperationResult> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const timestamp = Date.now();

      const entry: StateEntry = {
        key,
        value,
        namespace: namespace || 'default',
        timestamp,
        ttl,
        expiresAt: ttl ? timestamp + ttl * 1000 : undefined
      };

      this._stateStore.set(fullKey, entry);

      this.log(`状态已设置: ${fullKey}`);
      return this.createSuccessResult({
        set: true,
        key: fullKey,
        value,
        namespace: namespace || 'default',
        timestamp
      });
    } catch (error) {
      return this.createErrorResult(`设置状态失败: ${error.message}`);
    }
  }

  private async retrieveState(key: string, namespace?: string): Promise<OperationResult> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const entry = this._stateStore.get(fullKey);

      if (!entry) {
        return this.createErrorResult(`状态不存在: ${fullKey}`);
      }

      // 检查TTL
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this._stateStore.delete(fullKey);
        return this.createErrorResult(`状态已过期: ${fullKey}`);
      }

      return this.createSuccessResult({
        key: fullKey,
        value: entry.value,
        namespace: entry.namespace,
        timestamp: entry.timestamp,
        ttl: entry.ttl,
        expiresAt: entry.expiresAt
      });
    } catch (error) {
      return this.createErrorResult(`获取状态失败: ${error.message}`);
    }
  }

  private async deleteState(key: string, namespace?: string): Promise<OperationResult> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const deleted = this._stateStore.delete(fullKey);

      if (!deleted) {
        return this.createErrorResult(`状态不存在: ${fullKey}`);
      }

      this.log(`状态已删除: ${fullKey}`);
      return this.createSuccessResult({
        deleted: true,
        key: fullKey
      });
    } catch (error) {
      return this.createErrorResult(`删除状态失败: ${error.message}`);
    }
  }

  private async listStates(namespace?: string): Promise<OperationResult> {
    try {
      const states: StateEntry[] = [];
      const now = Date.now();

      // 过滤过期状态
      for (const [fullKey, entry] of this._stateStore) {
        if (!namespace || entry.namespace === namespace) {
          if (!entry.expiresAt || now <= entry.expiresAt) {
            states.push(entry);
          } else {
            this._stateStore.delete(fullKey);
          }
        }
      }

      return this.createSuccessResult({
        states,
        count: states.length,
        namespace: namespace || 'all'
      });
    } catch (error) {
      return this.createErrorResult(`列出状态失败: ${error.message}`);
    }
  }

  private async clearStates(namespace?: string): Promise<OperationResult> {
    try {
      let clearedCount = 0;

      if (namespace) {
        // 清除指定命名空间的状态
        for (const [fullKey, entry] of this._stateStore) {
          if (entry.namespace === namespace) {
            this._stateStore.delete(fullKey);
            clearedCount++;
          }
        }
      } else {
        // 清除所有状态
        clearedCount = this._stateStore.size;
        this._stateStore.clear();
      }

      this.log(`已清除 ${clearedCount} 个状态`);
      return this.createSuccessResult({
        cleared: true,
        namespace: namespace || 'all',
        count: clearedCount
      });
    } catch (error) {
      return this.createErrorResult(`清除状态失败: ${error.message}`);
    }
  }

  private async persistStates(path?: string): Promise<OperationResult> {
    try {
      const persistPath = path || this._persistencePath;
      const states = Array.from(this._stateStore.values());

      // 创建目录（如果不存在）
      const dirPath = path.dirname(persistPath);
      await fs.mkdir(dirPath, { recursive: true });

      // 持久化到文件
      await fs.writeFile(persistPath, JSON.stringify(states, null, 2));

      this.log(`状态已持久化到: ${persistPath}`);
      return this.createSuccessResult({
        persisted: true,
        path: persistPath,
        count: states.length
      });
    } catch (error) {
      return this.createErrorResult(`持久化状态失败: ${error.message}`);
    }
  }

  private async loadStates(path?: string): Promise<OperationResult> {
    try {
      const loadPath = path || this._persistencePath;

      // 检查文件是否存在
      try {
        await fs.access(loadPath);
      } catch {
        return this.createErrorResult(`状态文件不存在: ${loadPath}`);
      }

      // 读取状态文件
      const data = await fs.readFile(loadPath, 'utf-8');
      const states: StateEntry[] = JSON.parse(data);

      // 加载状态到内存
      this._stateStore.clear();
      states.forEach(entry => {
        const fullKey = this.getFullKey(entry.key, entry.namespace);
        this._stateStore.set(fullKey, entry);
      });

      this.log(`已加载 ${states.length} 个状态从: ${loadPath}`);
      return this.createSuccessResult({
        loaded: true,
        path: loadPath,
        count: states.length
      });
    } catch (error) {
      return this.createErrorResult(`加载状态失败: ${error.message}`);
    }
  }

  private async incrementState(key: string, incrementBy: number = 1, namespace?: string): Promise<OperationResult> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const entry = this._stateStore.get(fullKey);

      let currentValue = entry?.value || 0;
      if (typeof currentValue !== 'number') {
        currentValue = Number(currentValue) || 0;
      }

      const newValue = currentValue + incrementBy;

      const newEntry: StateEntry = {
        key,
        value: newValue,
        namespace: namespace || 'default',
        timestamp: Date.now(),
        ttl: entry?.ttl,
        expiresAt: entry?.expiresAt
      };

      this._stateStore.set(fullKey, newEntry);

      return this.createSuccessResult({
        incremented: true,
        key: fullKey,
        oldValue: currentValue,
        newValue,
        incrementBy
      });
    } catch (error) {
      return this.createErrorResult(`递增状态失败: ${error.message}`);
    }
  }

  private async decrementState(key: string, decrementBy: number = 1, namespace?: string): Promise<OperationResult> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const entry = this._stateStore.get(fullKey);

      let currentValue = entry?.value || 0;
      if (typeof currentValue !== 'number') {
        currentValue = Number(currentValue) || 0;
      }

      const newValue = currentValue - decrementBy;

      const newEntry: StateEntry = {
        key,
        value: newValue,
        namespace: namespace || 'default',
        timestamp: Date.now(),
        ttl: entry?.ttl,
        expiresAt: entry?.expiresAt
      };

      this._stateStore.set(fullKey, newEntry);

      return this.createSuccessResult({
        decremented: true,
        key: fullKey,
        oldValue: currentValue,
        newValue,
        decrementBy
      });
    } catch (error) {
      return this.createErrorResult(`递减状态失败: ${error.message}`);
    }
  }

  // 扩展方法
  async getStats(): Promise<OperationResult> {
    try {
      const now = Date.now();
      let totalCount = this._stateStore.size;
      let expiredCount = 0;
      let expiringSoonCount = 0;
      const namespaceCount = new Map<string, number>();

      // 统计各命名空间状态数量和过期状态
      for (const [fullKey, entry] of this._stateStore) {
        // 命名空间统计
        namespaceCount.set(entry.namespace, (namespaceCount.get(entry.namespace) || 0) + 1);

        // 过期统计
        if (entry.expiresAt) {
          if (now > entry.expiresAt) {
            expiredCount++;
          } else if (entry.expiresAt - now < 5 * 60 * 1000) { // 5分钟内过期
            expiringSoonCount++;
          }
        }
      }

      return this.createSuccessResult({
        total: totalCount,
        expired: expiredCount,
        expiringSoon: expiringSoonCount,
        namespaces: Object.fromEntries(namespaceCount),
        active: totalCount - expiredCount
      });
    } catch (error) {
      return this.createErrorResult(`获取状态统计失败: ${error.message}`);
    }
  }

  async cleanupExpired(): Promise<OperationResult> {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [fullKey, entry] of this._stateStore) {
        if (entry.expiresAt && now > entry.expiresAt) {
          this._stateStore.delete(fullKey);
          cleanedCount++;
        }
      }

      return this.createSuccessResult({
        cleaned: true,
        count: cleanedCount
      });
    } catch (error) {
      return this.createErrorResult(`清理过期状态失败: ${error.message}`);
    }
  }

  async exportStates(params: { namespace?: string; path?: string; format?: 'json' | 'csv' } = {}): Promise<OperationResult> {
    try {
      const { namespace, path, format = 'json' } = params;
      const states = await this.listStates(namespace);

      if (!states.success) {
        return states;
      }

      let content: string;
      const exportPath = path || `./states_export_${Date.now()}.${format}`;

      if (format === 'json') {
        content = JSON.stringify(states.data?.states || [], null, 2);
      } else if (format === 'csv') {
        content = this.convertToCsv(states.data?.states || []);
      } else {
        return this.createErrorResult(`不支持的导出格式: ${format}`);
      }

      await fs.writeFile(exportPath, content);

      return this.createSuccessResult({
        exported: true,
        path: exportPath,
        format,
        count: states.data?.states?.length || 0
      });
    } catch (error) {
      return this.createErrorResult(`导出状态失败: ${error.message}`);
    }
  }

  async watchState(key: string, namespace?: string, callback?: (value: any) => void): Promise<OperationResult> {
    try {
      const fullKey = this.getFullKey(key, namespace);

      // 简单的监听机制（实际实现可能需要更复杂的事件系统）
      const watchId = `${fullKey}_${Date.now()}`;

      // 模拟监听设置
      return this.createSuccessResult({
        watching: true,
        key: fullKey,
        watchId
      });
    } catch (error) {
      return this.createErrorResult(`监听状态失败: ${error.message}`);
    }
  }

  // 工具方法
  private getFullKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private convertToCsv(states: StateEntry[]): string {
    const headers = ['key', 'value', 'namespace', 'timestamp', 'ttl'];
    const rows = states.map(state => [
      state.key,
      JSON.stringify(state.value),
      state.namespace,
      state.timestamp.toString(),
      state.ttl?.toString() || ''
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  // 清理方法
  async clearExpiredStates(): Promise<OperationResult> {
    return this.cleanupExpired();
  }

  async getStateNamespaces(): Promise<OperationResult> {
    try {
      const namespaces = new Set<string>();

      for (const entry of this._stateStore.values()) {
        namespaces.add(entry.namespace);
      }

      return this.createSuccessResult({
        namespaces: Array.from(namespaces),
        count: namespaces.size
      });
    } catch (error) {
      return this.createErrorResult(`获取命名空间列表失败: ${error.message}`);
    }
  }
}