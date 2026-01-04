/**
 * 消息总线服务
 * 提供独立的消息路由、持久化、订阅管理功能
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { MSG_SYSTEM_INIT_START, MSG_SYSTEM_INIT_COMPLETE, MSG_SYSTEM_ERROR } from './MessageConstants.js';
// ============================================================================
// 消息总线服务实现
// ============================================================================
export class MessageBusService extends EventEmitter {
    subscriptions = new Map();
    messageHistory = [];
    historyLimit = 1000;
    persistOptions;
    persistRules = [];
    persistQueue = [];
    persistTimer;
    stats = {
        messagesSent: 0,
        messagesReceived: 0,
        messagesPersisted: 0,
        messagesFiltered: 0,
        activeSubscriptions: 0,
        uptime: 0
    };
    startTime = Date.now();
    running = false;
    messageIdCounter = 0;
    constructor(options = {}) {
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
    async start() {
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
    async stop() {
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
    async publish(type, payload = {}, source = {}) {
        if (!this.running) {
            throw new Error('MessageBusService is not running');
        }
        const messageId = this.generateMessageId();
        const message = {
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
    subscribe(pattern, handler, options = {}) {
        const subscriptionId = this.generateSubscriptionId();
        const subscription = {
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
        const subs = this.subscriptions.get(pattern);
        subs.push(subscription);
        // 按优先级排序
        subs.sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0));
        this.stats.activeSubscriptions = this.countActiveSubscriptions();
        return subscriptionId;
    }
    /**
     * 取消订阅
     */
    unsubscribe(subscriptionId) {
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
    unsubscribeByPattern(pattern) {
        const subs = this.subscriptions.get(pattern);
        if (!subs)
            return 0;
        const count = subs.length;
        this.subscriptions.delete(pattern);
        this.stats.activeSubscriptions = this.countActiveSubscriptions();
        return count;
    }
    /**
     * 获取消息历史
     */
    getHistory(filter) {
        let history = [...this.messageHistory];
        if (filter?.type) {
            const regex = new RegExp(filter.type.replace('*', '.*'));
            history = history.filter(m => regex.test(m.type));
        }
        if (filter?.since) {
            history = history.filter(m => m.timestamp >= filter.since);
        }
        if (filter?.until) {
            history = history.filter(m => m.timestamp <= filter.until);
        }
        if (filter?.limit) {
            history = history.slice(-filter.limit);
        }
        return history;
    }
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            uptime: Date.now() - this.startTime,
            activeSubscriptions: this.countActiveSubscriptions()
        };
    }
    /**
     * 获取所有订阅
     */
    getSubscriptions() {
        return Array.from(this.subscriptions.entries()).map(([pattern, subs]) => ({
            pattern,
            count: subs.length
        }));
    }
    /**
     * 清空历史
     */
    clearHistory() {
        this.messageHistory = [];
    }
    /**
     * 设置持久化规则
     */
    setPersistRules(rules) {
        this.persistRules = rules;
    }
    /**
     * 获取持久化规则
     */
    getPersistRules() {
        return [...this.persistRules];
    }
    // ============================================================================
    // 私有方法
    // ============================================================================
    async applyMiddleware(message) {
        // 这里可以添加中间件逻辑
        return message;
    }
    async dispatch(message) {
        const matchedPatterns = this.findMatchedPatterns(message.type);
        for (const pattern of matchedPatterns) {
            const subs = this.subscriptions.get(pattern);
            if (!subs)
                continue;
            const handlersToRemove = [];
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
                }
                catch (err) {
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
    findMatchedPatterns(type) {
        const patterns = [];
        for (const pattern of this.subscriptions.keys()) {
            if (this.matchPattern(pattern, type)) {
                patterns.push(pattern);
            }
        }
        return patterns;
    }
    matchPattern(pattern, type) {
        const regex = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(`^${regex}$`).test(type);
    }
    addToHistory(message) {
        this.messageHistory.push(message);
        if (this.messageHistory.length > this.historyLimit) {
            this.messageHistory = this.messageHistory.slice(-this.historyLimit);
        }
    }
    shouldPersist(message) {
        if (!this.persistOptions.enabled)
            return false;
        if (message.meta.persist !== undefined) {
            return message.meta.persist;
        }
        for (const rule of this.persistRules) {
            if (this.matchPattern(rule.pattern, message.type)) {
                if (rule.strategy === 'always')
                    return true;
                if (rule.strategy === 'never')
                    return false;
                if (rule.strategy === 'sample' && rule.sampleRate) {
                    return Math.random() < rule.sampleRate;
                }
            }
        }
        // 默认不持久化
        return false;
    }
    startPersistTimer() {
        this.persistTimer = setInterval(async () => {
            if (this.persistQueue.length > 0) {
                await this.flushPersistQueue();
            }
        }, 5000); // 每5秒持久化一次
    }
    async flushPersistQueue() {
        if (this.persistQueue.length === 0)
            return;
        const messages = [...this.persistQueue];
        this.persistQueue = [];
        try {
            await this.persistMessages(messages);
            this.stats.messagesPersisted += messages.length;
        }
        catch (err) {
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
    async persistMessages(messages) {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10);
        const filename = `${dateStr}.jsonl`;
        const filepath = path.join(this.persistOptions.directory, filename);
        const lines = messages.map(m => JSON.stringify(m));
        await fs.promises.appendFile(filepath, lines.join('\n') + '\n');
    }
    async ensurePersistDirectory() {
        try {
            await fs.promises.mkdir(this.persistOptions.directory, { recursive: true });
        }
        catch (err) {
            console.error('[MessageBusService] Failed to create persist directory:', err);
            throw err;
        }
    }
    getDefaultPersistRules() {
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
    generateMessageId() {
        return `msg_${Date.now()}_${++this.messageIdCounter}`;
    }
    generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    countActiveSubscriptions() {
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
let globalMessageBus = null;
export function getGlobalMessageBus() {
    if (!globalMessageBus) {
        globalMessageBus = new MessageBusService();
    }
    return globalMessageBus;
}
export async function startGlobalMessageBus() {
    const bus = getGlobalMessageBus();
    if (!globalMessageBus) {
        await bus.start();
    }
}
export async function stopGlobalMessageBus() {
    if (globalMessageBus) {
        await globalMessageBus.stop();
    }
}
