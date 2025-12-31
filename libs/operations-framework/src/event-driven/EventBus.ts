/**
 * 事件总线系统
 * 提供统一的事件发布、订阅和管理功能
 */

export interface EventData {
  [key: string]: any;
}

export interface EventHandler {
  (data: EventData): void | Promise<void>;
}

export interface EventHistoryEntry {
  event: string;
  data: EventData;
  timestamp: number;
  source?: string;
}

export class EventBus {
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private eventHistory: EventHistoryEntry[] = [];
  private eventHistoryLimit: number = 1000;
  private middleware: Function[] = [];

  constructor(options: { historyLimit?: number } = {}) {
    this.eventHistoryLimit = options.historyLimit || 1000;
  }

  /**
   * 注册事件监听器
   */
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);

    // 记录事件注册
    this.logEvent('event:registered', { event, handlerType: handler.name || 'anonymous' });
  }

  /**
   * 注册一次性事件监听器
   */
  once(event: string, handler: EventHandler): void {
    const onceHandler: EventHandler = (data) => {
      handler(data);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  /**
   * 移除事件监听器
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        this.logEvent('event:unregistered', { event, handlerType: handler.name || 'anonymous' });
      }
    }
  }

  /**
   * 注册中间件
   */
  use(middleware: (event: string, data: EventData, next: Function) => void): void {
    this.middleware.push(middleware);
  }

  /**
   * 发布事件
   */
  async emit(event: string, data: EventData = {}, source?: string): Promise<void> {
    // 创建事件条目
    const eventEntry: EventHistoryEntry = {
      event,
      data,
      timestamp: Date.now(),
      source
    };

    // 应用中间件
    try {
      await this.applyMiddleware(event, data);
    } catch (error) {
      await this.emit('error', { event, error, data, source });
      return;
    }

    // 记录事件历史
    this.addToHistory(eventEntry);

    // 触发精确匹配的事件处理器
    const exactHandlers = this.eventHandlers.get(event) || [];
    const promises = exactHandlers.map(async (handler) => {
      try {
        await handler(data);
      } catch (error) {
        await this.emit('error', { event, error, data, handler: handler.name || 'anonymous' });
      }
    });

    // 触发通配符事件处理器
    const wildcardPromises = this.getWildcardHandlers(event).map(async ({ pattern, handler }) => {
      try {
        await handler(data);
      } catch (error) {
        await this.emit('error', { event, error, data, handler: handler.name || 'anonymous', pattern });
      }
    });

    await Promise.allSettled([...promises, ...wildcardPromises]);
  }

  /**
   * 获取匹配通配符的事件处理器
   */
  private getWildcardHandlers(event: string): { pattern: string; handler: EventHandler }[] {
    const wildcardHandlers: { pattern: string; handler: EventHandler }[] = [];

    for (const [pattern, handlers] of this.eventHandlers.entries()) {
      if (this.isWildcardPattern(pattern) && this.matchWildcardPattern(pattern, event)) {
        handlers.forEach(handler => {
          wildcardHandlers.push({ pattern, handler });
        });
      }
    }

    return wildcardHandlers;
  }

  /**
   * 检查是否为通配符模式
   */
  private isWildcardPattern(pattern: string): boolean {
    return pattern.includes('*') || pattern.includes('?');
  }

  /**
   * 检查事件是否匹配通配符模式
   */
  private matchWildcardPattern(pattern: string, event: string): boolean {
    // 转义正则表达式特殊字符
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(event);
  }

  /**
   * 获取事件历史
   */
  getEventHistory(event?: string): EventHistoryEntry[] {
    return event
      ? this.eventHistory.filter(e => e.event === event)
      : [...this.eventHistory];
  }

  /**
   * 清理事件历史
   */
  clearHistory(): void {
    this.eventHistory = [];
    this.logEvent('history:cleared', {});
  }

  /**
   * 获取所有事件类型
   */
  getEventTypes(): string[] {
    const events = new Set<string>();
    this.eventHandlers.forEach((_, event) => events.add(event));
    this.eventHistory.forEach(entry => events.add(entry.event));
    return Array.from(events);
  }

  /**
   * 获取事件统计
   */
  getEventStats(): { [event: string]: number } {
    const stats: { [event: string]: number } = {};
    this.eventHistory.forEach(entry => {
      stats[entry.event] = (stats[entry.event] || 0) + 1;
    });
    return stats;
  }

  /**
   * 应用中间件
   */
  private async applyMiddleware(event: string, data: EventData): Promise<void> {
    let index = 0;
    const next = async () => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        await middleware(event, data, next);
      }
    };
    await next();
  }

  /**
   * 添加到事件历史
   */
  private addToHistory(entry: EventHistoryEntry): void {
    this.eventHistory.push(entry);

    // 限制历史记录数量
    if (this.eventHistory.length > this.eventHistoryLimit) {
      this.eventHistory = this.eventHistory.slice(-this.eventHistoryLimit);
    }
  }

  /**
   * 记录内部事件
   */
  private logEvent(event: string, data: EventData): void {
    // 避免循环记录
    if (event.startsWith('event:')) {
      this.addToHistory({
        event,
        data,
        timestamp: Date.now(),
        source: 'EventBus'
      });
    }
  }

  /**
   * 销毁事件总线
   */
  destroy(): void {
    this.eventHandlers.clear();
    this.eventHistory = [];
    this.middleware = [];
    this.logEvent('eventbus:destroyed', {});
  }
}

// 创建全局事件总线实例
export const globalEventBus = new EventBus();

// 便利函数
export function on(event: string, handler: EventHandler): void {
  globalEventBus.on(event, handler);
}

export function once(event: string, handler: EventHandler): void {
  globalEventBus.once(event, handler);
}

export function off(event: string, handler: EventHandler): void {
  globalEventBus.off(event, handler);
}

export async function emit(event: string, data: EventData = {}, source?: string): Promise<void> {
  await globalEventBus.emit(event, data, source);
}
