"use strict";
/**
 * 事件总线系统
 * 提供统一的事件发布、订阅和管理功能
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalEventBus = exports.EventBus = void 0;
exports.on = on;
exports.once = once;
exports.off = off;
exports.emit = emit;
class EventBus {
    constructor(options = {}) {
        this.eventHandlers = new Map();
        this.eventHistory = [];
        this.eventHistoryLimit = 1000;
        this.middleware = [];
        this.eventHistoryLimit = options.historyLimit || 1000;
    }
    /**
     * 注册事件监听器
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
        // 记录事件注册
        this.logEvent('event:registered', { event, handlerType: handler.name || 'anonymous' });
    }
    /**
     * 注册一次性事件监听器
     */
    once(event, handler) {
        const onceHandler = (data) => {
            handler(data);
            this.off(event, onceHandler);
        };
        this.on(event, onceHandler);
    }
    /**
     * 移除事件监听器
     */
    off(event, handler) {
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
    use(middleware) {
        this.middleware.push(middleware);
    }
    /**
     * 发布事件
     */
    async emit(event, data = {}, source) {
        // 创建事件条目
        const eventEntry = {
            event,
            data,
            timestamp: Date.now(),
            source
        };
        // 应用中间件
        try {
            await this.applyMiddleware(event, data);
        }
        catch (error) {
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
            }
            catch (error) {
                await this.emit('error', { event, error, data, handler: handler.name || 'anonymous' });
            }
        });
        // 触发通配符事件处理器
        const wildcardPromises = this.getWildcardHandlers(event).map(async ({ pattern, handler }) => {
            try {
                await handler(data);
            }
            catch (error) {
                await this.emit('error', { event, error, data, handler: handler.name || 'anonymous', pattern });
            }
        });
        await Promise.allSettled([...promises, ...wildcardPromises]);
    }
    /**
     * 获取匹配通配符的事件处理器
     */
    getWildcardHandlers(event) {
        const wildcardHandlers = [];
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
    isWildcardPattern(pattern) {
        return pattern.includes('*') || pattern.includes('?');
    }
    /**
     * 检查事件是否匹配通配符模式
     */
    matchWildcardPattern(pattern, event) {
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
    getEventHistory(event) {
        return event
            ? this.eventHistory.filter(e => e.event === event)
            : [...this.eventHistory];
    }
    /**
     * 清理事件历史
     */
    clearHistory() {
        this.eventHistory = [];
        this.logEvent('history:cleared', {});
    }
    /**
     * 获取所有事件类型
     */
    getEventTypes() {
        const events = new Set();
        this.eventHandlers.forEach((_, event) => events.add(event));
        this.eventHistory.forEach(entry => events.add(entry.event));
        return Array.from(events);
    }
    /**
     * 获取事件统计
     */
    getEventStats() {
        const stats = {};
        this.eventHistory.forEach(entry => {
            stats[entry.event] = (stats[entry.event] || 0) + 1;
        });
        return stats;
    }
    /**
     * 应用中间件
     */
    async applyMiddleware(event, data) {
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
    addToHistory(entry) {
        this.eventHistory.push(entry);
        // 限制历史记录数量
        if (this.eventHistory.length > this.eventHistoryLimit) {
            this.eventHistory = this.eventHistory.slice(-this.eventHistoryLimit);
        }
    }
    /**
     * 记录内部事件
     */
    logEvent(event, data) {
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
    destroy() {
        this.eventHandlers.clear();
        this.eventHistory = [];
        this.middleware = [];
        this.logEvent('eventbus:destroyed', {});
    }
}
exports.EventBus = EventBus;
// 创建全局事件总线实例
exports.globalEventBus = new EventBus();
// 便利函数
function on(event, handler) {
    exports.globalEventBus.on(event, handler);
}
function once(event, handler) {
    exports.globalEventBus.once(event, handler);
}
function off(event, handler) {
    exports.globalEventBus.off(event, handler);
}
async function emit(event, data = {}, source) {
    await exports.globalEventBus.emit(event, data, source);
}
