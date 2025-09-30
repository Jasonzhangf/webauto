/**
 * 事件驱动容器基类
 * 提供统一的事件驱动容器接口和功能
 */
import { EventBus } from './EventBus';
export class EventDrivenContainer {
    constructor(config) {
        this.sharedSpace = null;
        this.mutationObserver = null;
        this.eventHandlers = new Map();
        this.childContainers = new Map();
        this.parentContainer = null;
        this.config = { ...config, enabled: config.enabled ?? true };
        this.state = {
            id: config.id,
            name: config.name,
            status: 'created',
            lastActivity: Date.now(),
            errorCount: 0,
            stats: this.initializeStats()
        };
        this.eventBus = new EventBus();
        this.setupEventHandlers();
        this.emit('container:created', {
            containerId: this.config.id,
            containerType: this.constructor.name,
            timestamp: Date.now()
        });
    }
    // ==================== 生命周期方法 ====================
    /**
     * 初始化容器
     */
    async initialize(sharedSpace) {
        this.sharedSpace = sharedSpace;
        this.updateState('initializing');
        try {
            await this.onInitialize();
            await this.setupMutationObserver();
            this.updateState('ready');
            this.emit('container:initialized', {
                containerId: this.config.id,
                initializationTime: Date.now()
            });
        }
        catch (error) {
            this.handleError(error, 'initialization');
            this.updateState('failed');
            throw error;
        }
    }
    /**
     * 启动容器
     */
    async start() {
        if (!this.sharedSpace) {
            throw new Error('Container not initialized');
        }
        this.updateState('running');
        try {
            await this.onStart();
            this.emit('container:started', {
                containerId: this.config.id,
                startTime: Date.now()
            });
        }
        catch (error) {
            this.handleError(error, 'start');
            throw error;
        }
    }
    /**
     * 暂停容器
     */
    async pause() {
        if (this.state.status !== 'running') {
            return;
        }
        this.updateState('paused');
        await this.onPause();
    }
    /**
     * 恢复容器
     */
    async resume() {
        if (this.state.status !== 'paused') {
            return;
        }
        this.updateState('running');
        await this.onResume();
    }
    /**
     * 停止容器
     */
    async stop() {
        if (this.state.status === 'destroyed') {
            return;
        }
        this.updateState('completed');
        try {
            await this.onStop();
            await this.cleanup();
            this.emit('container:completed', {
                containerId: this.config.id,
                result: this.getExecutionResult(),
                executionTime: Date.now() - this.state.lastActivity
            });
        }
        catch (error) {
            this.handleError(error, 'stop');
            throw error;
        }
    }
    /**
     * 销毁容器
     */
    async destroy() {
        this.updateState('destroyed');
        try {
            await this.onDestroy();
            await this.cleanup();
            this.emit('container:destroyed', {
                containerId: this.config.id,
                cleanupTime: Date.now()
            });
        }
        catch (error) {
            console.error('Error destroying container:', error);
        }
    }
    // ==================== 事件处理方法 ====================
    /**
     * 监听事件
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
        // 同时监听内部事件总线
        this.eventBus.on(event, handler);
    }
    /**
     * 监听一次性事件
     */
    once(event, handler) {
        const onceHandler = (data) => {
            handler(data);
            this.off(event, onceHandler);
        };
        this.on(event, onceHandler);
    }
    /**
     * 移除事件监听
     */
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
        this.eventBus.off(event, handler);
    }
    /**
     * 发射事件
     */
    async emit(event, data) {
        await this.eventBus.emit(event, data, this.config.id);
        // 同时通知父容器
        if (this.parentContainer) {
            await this.parentContainer.emit(event, {
                ...data,
                sourceContainer: this.config.id
            });
        }
    }
    // ==================== 子容器管理 ====================
    /**
     * 添加子容器
     */
    addChildContainer(container) {
        const containerId = container.config.id;
        // 检查是否已存在相同ID的子容器
        if (this.childContainers.has(containerId)) {
            console.warn(`[Container] 子容器已存在: ${containerId}，跳过添加`);
            return;
        }
        container.parentContainer = this;
        this.childContainers.set(containerId, container);
        this.emit('container:child_added', {
            parentId: this.config.id,
            childId: containerId,
            childType: container.constructor.name
        });
    }
    /**
     * 移除子容器
     */
    removeChildContainer(containerId) {
        const container = this.childContainers.get(containerId);
        if (container) {
            container.parentContainer = null;
            this.childContainers.delete(containerId);
            this.emit('container:child_removed', {
                parentId: this.config.id,
                childId: containerId
            });
        }
    }
    /**
     * 获取子容器
     */
    getChildContainer(containerId) {
        return this.childContainers.get(containerId);
    }
    /**
     * 获取所有子容器
     */
    getChildContainers() {
        return Array.from(this.childContainers.values());
    }
    // ==================== 内部方法 ====================
    /**
     * 设置事件处理器
     */
    setupEventHandlers() {
        // 监听系统级事件
        this.on('container:state:changed', (data) => {
            this.handleStateChanged(data);
        });
        this.on('content:mutation_detected', (data) => {
            this.handleContentMutation(data);
        });
        this.on('system:error', (data) => {
            this.handleSystemError(data);
        });
    }
    /**
     * 设置内容变化观察器
     */
    async setupMutationObserver() {
        if (!this.sharedSpace?.page)
            return;
        try {
            this.mutationObserver = await this.sharedSpace.page.evaluateHandle(() => {
                return new MutationObserver((mutations) => {
                    window.dispatchEvent(new CustomEvent('content-mutation', {
                        detail: { mutations, timestamp: Date.now() }
                    }));
                });
            });
            await this.sharedSpace.page.evaluate((observer, selector) => {
                const target = document.querySelector(selector);
                if (target) {
                    observer.observe(target, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true
                    });
                }
            }, this.mutationObserver, this.config.selector);
            // 监听内容变化事件
            this.sharedSpace.page.on('console', (msg) => {
                if (msg.type() === 'log' && msg.text().includes('content-mutation')) {
                    this.emit('content:mutation_detected', {
                        containerId: this.config.id,
                        mutationType: 'dom_change',
                        targetSelector: this.config.selector
                    });
                }
            });
        }
        catch (error) {
            console.error('Error setting up mutation observer:', error);
        }
    }
    /**
     * 更新容器状态
     */
    updateState(status) {
        const previousState = this.state.status;
        this.state.status = status;
        this.state.lastActivity = Date.now();
        this.emit('container:state:changed', {
            containerId: this.config.id,
            fromState: previousState,
            toState: status
        });
    }
    /**
     * 处理状态变化
     */
    handleStateChanged(data) {
        // 可以在这里添加状态变化的逻辑
        console.log(`Container ${data.containerId} state changed: ${data.fromState} -> ${data.toState}`);
    }
    /**
     * 处理内容变化
     */
    handleContentMutation(data) {
        // 可以在这里添加内容变化的逻辑
        this.state.lastActivity = Date.now();
    }
    /**
     * 处理系统错误
     */
    handleSystemError(data) {
        this.state.errorCount++;
        console.error(`System error in container ${this.config.id}:`, data.error);
    }
    /**
     * 处理错误
     */
    handleError(error, context) {
        this.state.errorCount++;
        this.emit('container:state:error', {
            containerId: this.config.id,
            error: error instanceof Error ? error.message : String(error)
        });
        console.error(`Error in container ${this.config.id} during ${context}:`, error);
    }
    /**
     * 清理资源
     */
    async cleanup() {
        // 清理变化观察器
        if (this.mutationObserver) {
            await this.mutationObserver.evaluate(observer => observer.disconnect());
            this.mutationObserver = null;
        }
        // 清理子容器
        for (const child of this.childContainers.values()) {
            await child.destroy();
        }
        this.childContainers.clear();
        // 清理事件监听器
        this.eventHandlers.clear();
        this.eventBus.destroy();
        // 清理共享空间引用
        this.sharedSpace = null;
    }
    // ==================== 公共接口 ====================
    /**
     * 获取容器状态
     */
    getState() {
        return { ...this.state };
    }
    /**
     * 获取容器配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 获取容器统计信息
     */
    getStats() {
        return { ...this.state.stats };
    }
    /**
     * 检查容器是否就绪
     */
    isReady() {
        return this.state.status === 'ready';
    }
    /**
     * 检查容器是否正在运行
     */
    isRunning() {
        return this.state.status === 'running';
    }
    /**
     * 检查容器是否已完成
     */
    isCompleted() {
        return this.state.status === 'completed';
    }
    /**
     * 检查容器是否失败
     */
    isFailed() {
        return this.state.status === 'failed';
    }
    /**
     * 获取错误计数
     */
    getErrorCount() {
        return this.state.errorCount;
    }
    /**
     * 重置错误计数
     */
    resetErrorCount() {
        this.state.errorCount = 0;
    }
}
//# sourceMappingURL=EventDrivenContainer.js.map