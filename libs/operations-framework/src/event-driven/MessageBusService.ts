/**
 * 消息总线服务
 * 提供独立的消息路由、持久化、订阅管理功能
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { 
  MSG_SYSTEM_INIT_START, 
  MSG_SYSTEM_INIT_COMPLETE, 
  MSG_SYSTEM_ERROR,
  MSG_ALL 
} from './MessageConstants.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface MessagePayload {
  [key: string]: any;
}

export interface Message {
  id: string;                      // 消息唯一ID
  type: string;                    // 消息类型（如 MSG_CONTAINER_CREATED）
  timestamp: number;               // 时间戳
  source: MessageSource;           // 消息来源
  payload: MessagePayload;          // 消息载荷
  meta: MessageMeta;               // 元数据
}

export interface MessageSource {
  component: string;               // 组件名称
  sessionId?: string;              // 会话ID
  containerId?: string;            // 容器ID
  workflowId?: string;             // 工作流ID
  userId?: string;                 // 用户ID
}

export interface MessageMeta {
  version: string;                 // 消息版本
  traceId?: string;                // 追踪ID
  parentId?: string;               // 父消息ID
  priority?: number;               // 优先级（0-10，默认5）
  ttl?: number;                    // 生存时间（毫秒）
  persist?: boolean;               // 是否持久化（默认根据消息类型决定）
}

export type MessageHandler = (message: Message) => void | Promise<void>;

export interface Subscription {
  id: string;
  pattern: string;                 // 订阅模式（支持通配符）
  handler: MessageHandler;
  options: SubscriptionOptions;
}

export interface SubscriptionOptions {
  once?: boolean;                  // 只触发一次
  priority?: number;               // 优先级（数字越大优先级越高）
  filter?: (message: Message) => boolean; // 额外过滤
  transform?: (message: Message) => Message; // 消息转换
}

export interface PersistOptions {
  enabled: boolean;                // 是否启用持久化
  directory: string;               // 持久化目录
  rotateSize: number;              // 文件轮转大小（字节）
  compress: boolean;              // 是否压缩
}

export interface PersistRule {
  pattern: string;                 // 匹配模式
  strategy: 'always' | 'sample' | 'never'; // 持久化策略
  sampleRate?: number;             // 采样率（0-1）
}

export interface MessageBusStats {
  messagesSent: number;
  messagesReceived: number;
  messagesPersisted: number;
  messagesFiltered: number;
  activeSubscriptions: number;
  uptime: number;
}

// ============================================================================
// 消息总线服务实现
// ============================================================================

export class MessageBusService extends EventEmitter {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private messageHistory: Message[] = [];
  private historyLimit: number = 1000;
  private persistOptions: PersistOptions;
  private persistRules: PersistRule[] = [];
  private persistQueue: Message[] = [];
  private persistTimer?: NodeJS.Timeout;
  private stats: MessageBusStats = {
    messagesSent: 0,
    messagesReceived: 0,
    messagesPersisted: 0,
    messagesFiltered: 0,
    activeSubscriptions: 0,
    uptime: 0
  };
  private startTime: number = Date.now();
  private running: boolean = false;
  private messageIdCounter: number = 0;

  constructor(options: {
    historyLimit?: number;
    persist?: Partial<PersistOptions>;
    persistRules?: PersistRule[];
  } = {}) {
    super();
    this.historyLimit = options.historyLimit || 1000;
    this.persistOptions = {
      enabled: options.persist?.enabled !== false,
      directory: options.persist?.directory || path.join(os.homedir(), '.webauto', 'messages'),
      rotateSize: options.persist?.rotateSize || 10 * 1024 * 1024, // 10MB
      compress: options.persist?.compress || false
    };
    this.persistRules = options.persistRules || this.getDefaultPersistRules();
  }

  /**
   * 启动消息总线服务
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('MessageBusService is already running');
    }

    this.running = true;
    this.startTime = Date.now();

   // 确保持久化目录存在
   if (this.persistOptions.enabled) {
     await this.ensurePersistDirectory();
     this.startPersistTimer();
   }

   this.emit('service:started', { timestamp: this.startTime });
   await this.publish(MSG_SYSTEM_ERROR, {
     type: MSG_SYSTEM_INIT_START,
     payload: { component: 'MessageBusService' }
   }, { component: 'MessageBusService' });

   await this.publish(MSG_SYSTEM_ERROR, {
     type: MSG_SYSTEM_INIT_COMPLETE,
     payload: { 
       component: 'MessageBusService',
       uptime: 0
     }
   }, { component: 'MessageBusService' });
 }

 /**
  * 停止消息总线服务
  */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // 停止持久化定时器
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }

    // 持久化剩余消息
    if (this.persistQueue.length > 0) {
      await this.flushPersistQueue();
    }

    this.emit('service:stopped', { timestamp: Date.now() });
  }

  /**
   * 发布消息
   */
  async publish(
    type: string,
    payload: MessagePayload = {},
    source: Partial<MessageSource> = {}
  ): Promise<string> {
    if (!this.running) {
      throw new Error('MessageBusService is not running');
    }

    const messageId = this.generateMessageId();
    const message: Message = {
      id: messageId,
      type,
      timestamp: Date.now(),
      source: {
        component: source.component || 'unknown',
        sessionId: source.sessionId,
        containerId: source.containerId,
        workflowId: source.workflowId,
        userId: source.userId
      },
      payload,
      meta: {
        version: '1.0',
        traceId: source.component ? `${source.component}:${messageId}` : messageId,
        ...source
      }
    };

    this.stats.messagesSent++;

    // 应用中间件
    const processedMessage = await this.applyMiddleware(message);

    // 添加到历史
    this.addToHistory(processedMessage);

    // 持久化
    if (this.shouldPersist(processedMessage)) {
      this.persistQueue.push(processedMessage);
    }

    // 分发消息
    await this.dispatch(processedMessage);

    return messageId;
  }

  /**
   * 订阅消息
   */
  subscribe(
    pattern: string,
    handler: MessageHandler,
    options: SubscriptionOptions = {}
  ): string {
    const subscriptionId = this.generateSubscriptionId();
    const subscription: Subscription = {
      id: subscriptionId,
      pattern,
      handler,
      options: {
        once: options.once || false,
        priority: options.priority || 0,
        filter: options.filter,
        transform: options.transform
      }
    };

    if (!this.subscriptions.has(pattern)) {
      this.subscriptions.set(pattern, []);
    }

    const subs = this.subscriptions.get(pattern)!;
    subs.push(subscription);

    // 按优先级排序
    subs.sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0));

    this.stats.activeSubscriptions = this.countActiveSubscriptions();

    return subscriptionId;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): boolean {
    for (const [pattern, subs] of this.subscriptions.entries()) {
      const index = subs.findIndex(s => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        if (subs.length === 0) {
          this.subscriptions.delete(pattern);
        }
        this.stats.activeSubscriptions = this.countActiveSubscriptions();
        return true;
      }
    }
    return false;
  }

  /**
   * 按模式取消订阅
   */
  unsubscribeByPattern(pattern: string): number {
    const subs = this.subscriptions.get(pattern);
    if (!subs) return 0;
    const count = subs.length;
    this.subscriptions.delete(pattern);
    this.stats.activeSubscriptions = this.countActiveSubscriptions();
    return count;
  }

  /**
   * 获取消息历史
   */
  getHistory(filter?: {
    type?: string;
    since?: number;
    until?: number;
    limit?: number;
  }): Message[] {
    let history = [...this.messageHistory];

    if (filter?.type) {
      const regex = new RegExp(filter.type.replace('*', '.*'));
      history = history.filter(m => regex.test(m.type));
    }

    if (filter?.since) {
      history = history.filter(m => m.timestamp >= filter.since!);
    }

    if (filter?.until) {
      history = history.filter(m => m.timestamp <= filter.until!);
    }

    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * 获取统计信息
   */
  getStats(): MessageBusStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime,
      activeSubscriptions: this.countActiveSubscriptions()
    };
  }

  /**
   * 获取所有订阅
   */
  getSubscriptions(): Array<{ pattern: string; count: number }> {
    return Array.from(this.subscriptions.entries()).map(([pattern, subs]) => ({
      pattern,
      count: subs.length
    }));
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.messageHistory = [];
  }

  /**
   * 设置持久化规则
   */
  setPersistRules(rules: PersistRule[]): void {
    this.persistRules = rules;
  }

  /**
   * 获取持久化规则
   */
  getPersistRules(): PersistRule[] {
    return [...this.persistRules];
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private async applyMiddleware(message: Message): Promise<Message> {
    // 这里可以添加中间件逻辑
    return message;
  }

  private async dispatch(message: Message): Promise<void> {
    const matchedPatterns = this.findMatchedPatterns(message.type);

    for (const pattern of matchedPatterns) {
      const subs = this.subscriptions.get(pattern);
      if (!subs) continue;

      const handlersToRemove: number[] = [];

      for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        
        // 过滤检查
        if (sub.options.filter && !sub.options.filter(message)) {
          this.stats.messagesFiltered++;
          continue;
        }

        // 转换
        let msgToHandle = message;
        if (sub.options.transform) {
          msgToHandle = sub.options.transform(message);
        }

       // 执行处理函数
       try {
         await sub.handler(msgToHandle);
         this.stats.messagesReceived++;
       } catch (err) {
         await this.publish(MSG_SYSTEM_ERROR, {
           type: MSG_SYSTEM_ERROR,
           payload: {
             error: err instanceof Error ? err.message : String(err),
             message: message.type,
             subscription: sub.id
           }
         }, { component: 'MessageBusService' });
       }

       // 只触发一次的订阅
        if (sub.options.once) {
          handlersToRemove.push(i);
        }
      }

      // 移除一次性订阅
      for (let i = handlersToRemove.length - 1; i >= 0; i--) {
        subs.splice(handlersToRemove[i], 1);
      }

      if (subs.length === 0) {
        this.subscriptions.delete(pattern);
      }
    }
  }

  private findMatchedPatterns(type: string): string[] {
    const patterns: string[] = [];

    for (const pattern of this.subscriptions.keys()) {
      if (this.matchPattern(pattern, type)) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private matchPattern(pattern: string, type: string): boolean {
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regex}$`).test(type);
  }

  private addToHistory(message: Message): void {
    this.messageHistory.push(message);

    if (this.messageHistory.length > this.historyLimit) {
      this.messageHistory = this.messageHistory.slice(-this.historyLimit);
    }
  }

  private shouldPersist(message: Message): boolean {
    if (!this.persistOptions.enabled) return false;

    if (message.meta.persist !== undefined) {
      return message.meta.persist;
    }

    for (const rule of this.persistRules) {
      if (this.matchPattern(rule.pattern, message.type)) {
        if (rule.strategy === 'always') return true;
        if (rule.strategy === 'never') return false;
        if (rule.strategy === 'sample' && rule.sampleRate) {
          return Math.random() < rule.sampleRate;
        }
      }
    }

    // 默认不持久化
    return false;
  }

  private startPersistTimer(): void {
    this.persistTimer = setInterval(async () => {
      if (this.persistQueue.length > 0) {
        await this.flushPersistQueue();
      }
    }, 5000); // 每5秒持久化一次
  }

  private async flushPersistQueue(): Promise<void> {
    if (this.persistQueue.length === 0) return;

    const messages = [...this.persistQueue];
    this.persistQueue = [];

    try {
      await this.persistMessages(messages);
      this.stats.messagesPersisted += messages.length;
    } catch (err) {
     // 失败的消息重新加入队列
     this.persistQueue.unshift(...messages);
     await this.publish(MSG_SYSTEM_ERROR, {
       type: MSG_SYSTEM_ERROR,
       payload: {
         error: err instanceof Error ? err.message : String(err),
         messageCount: messages.length
       }
     }, { component: 'MessageBusService' });
   }
 }

 private async persistMessages(messages: Message[]): Promise<void> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10);
    const filename = `${dateStr}.jsonl`;
    const filepath = path.join(this.persistOptions.directory, filename);

    const lines = messages.map(m => JSON.stringify(m));
    await fs.promises.appendFile(filepath, lines.join('\n') + '\n');
  }

  private async ensurePersistDirectory(): Promise<void> {
    try {
      await fs.promises.mkdir(this.persistOptions.directory, { recursive: true });
    } catch (err) {
      console.error('[MessageBusService] Failed to create persist directory:', err);
      throw err;
    }
  }

  private getDefaultPersistRules(): PersistRule[] {
    return [
      { pattern: 'MSG_SYSTEM_*', strategy: 'always' },
      { pattern: 'MSG_BROWSER_SESSION_*', strategy: 'always' },
      { pattern: 'MSG_CONTAINER_CREATED', strategy: 'always' },
      { pattern: 'MSG_WORKFLOW_*', strategy: 'always' },
      { pattern: 'MSG_PROJECT_*', strategy: 'always' },
      { pattern: 'MSG_BROWSER_PAGE_SCROLL', strategy: 'sample', sampleRate: 0.01 },
      { pattern: 'MSG_CONTAINER_APPEAR', strategy: 'sample', sampleRate: 0.1 },
      { pattern: 'MSG_*', strategy: 'never' }
    ];
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private countActiveSubscriptions(): number {
    let count = 0;
    for (const subs of this.subscriptions.values()) {
      count += subs.length;
    }
    return count;
  }
}

// ============================================================================
// 全局单例
// ============================================================================

let globalMessageBus: MessageBusService | null = null;

export function getGlobalMessageBus(): MessageBusService {
  if (!globalMessageBus) {
    globalMessageBus = new MessageBusService();
  }
  return globalMessageBus;
}

export async function startGlobalMessageBus(): Promise<void> {
  const bus = getGlobalMessageBus();
  if (!globalMessageBus) {
    await bus.start();
  }
}

export async function stopGlobalMessageBus(): Promise<void> {
  if (globalMessageBus) {
    await globalMessageBus.stop();
  }
}
