"use strict";
/**
 * 自刷新容器基类
 * 提供多触发源的自动刷新机制和动态操作注册能力
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseSelfRefreshingContainer = void 0;
const events_1 = require("events");
// ==================== 基类实现 ====================
class BaseSelfRefreshingContainer extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.page = null;
        this.sharedSpace = null;
        // 刷新机制
        this.refreshTimer = null;
        this.mutationObserver = null;
        this.refreshHistory = [];
        this.isRefreshing = false;
        this.refreshQueue = [];
        this.lastRefreshTime = 0;
        this.debounceTimeout = null;
        // 操作管理
        this.registeredOperations = new Map();
        this.activeOperations = new Map();
        // 容器管理
        this.childContainers = new Map();
        // 任务管理
        this.taskCompletionCriteria = null;
        this.config = {
            refreshInterval: 3000,
            enableAutoRefresh: true,
            enableMutationObserver: true,
            maxRefreshRetries: 3,
            debounceTime: 500,
            childContainerTypes: [],
            ...config
        };
        this.initializeState();
        this.setupEventHandlers();
    }
    initializeState() {
        this.taskProgress = {
            type: 'count',
            targetCount: 0,
            currentCount: 0,
            isCompleted: false
        };
        this.state = {
            id: this.config.id,
            selector: this.config.selector,
            exists: false,
            visible: false,
            contentHash: '',
            childCount: 0,
            lastRefreshed: 0,
            refreshCount: 0,
            triggers: [],
            operations: [],
            status: 'initializing',
            taskProgress: this.taskProgress
        };
        if (this.config.taskCompletionCriteria) {
            this.taskCompletionCriteria = this.config.taskCompletionCriteria;
            this.updateTaskProgress();
        }
    }
    setupEventHandlers() {
        this.on('refresh:requested', this.handleRefreshRequest.bind(this));
        this.on('refresh:completed', this.handleRefreshCompleted.bind(this));
        this.on('refresh:failed', this.handleRefreshFailed.bind(this));
        this.on('container:changed', this.handleContainerChanged.bind(this));
        this.on('operation:registered', this.handleOperationRegistered.bind(this));
        this.on('child:discovered', this.handleChildDiscovered.bind(this));
        this.on('task:completed', this.handleTaskCompleted.bind(this));
    }
    // ==================== 初始化接口 ====================
    async initialize(page, sharedSpace) {
        console.log(`🔄 初始化自刷新容器: ${this.config.name}`);
        // 1. 设置页面上下文和共享空间
        this.setPageContext(page);
        if (sharedSpace) {
            this.sharedSpace = sharedSpace;
        }
        // 2. 触发初始化刷新
        await this.triggerRefresh('initialization');
        // 3. 启动定时刷新
        if (this.config.enableAutoRefresh) {
            this.startPeriodicRefresh();
        }
        // 4. 启动内容变化监听
        if (this.config.enableMutationObserver) {
            await this.setupMutationObserver();
        }
        // 5. 注册基础操作
        await this.registerBaseOperations();
        // 6. 更新状态
        this.state.status = 'running';
        console.log(`✅ 容器初始化完成: ${this.config.name}`);
    }
    // ==================== 多触发源刷新机制 ====================
    async triggerRefresh(type, source, data) {
        const priority = this.getTriggerPriority(type);
        const trigger = {
            type,
            timestamp: Date.now(),
            source,
            data,
            priority
        };
        // 防抖处理
        if (this.shouldDebounce(trigger)) {
            return;
        }
        // 添加到刷新队列
        this.refreshQueue.push(trigger);
        this.refreshHistory.push(trigger);
        // 按优先级排序队列
        this.refreshQueue.sort((a, b) => a.priority - b.priority);
        // 如果正在刷新，等待刷新完成
        if (this.isRefreshing) {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!this.isRefreshing) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
        }
        // 处理刷新队列
        await this.processRefreshQueue();
    }
    shouldDebounce(trigger) {
        const now = Date.now();
        const timeSinceLastRefresh = now - this.lastRefreshTime;
        if (timeSinceLastRefresh < this.config.debounceTime) {
            // 检查是否是相同操作的更高优先级触发
            const hasHigherPriority = this.refreshQueue.some(existing => existing.priority <= trigger.priority &&
                existing.source === trigger.source);
            if (!hasHigherPriority) {
                return false; // 允许更高优先级的触发
            }
            console.log(`🔄 防抖过滤: ${trigger.type} (距离上次刷新 ${timeSinceLastRefresh}ms)`);
            return true;
        }
        return false;
    }
    getTriggerPriority(type) {
        const priorities = {
            'manual': 1, // 最高优先级：手动触发
            'initialization': 2, // 高优先级：容器初始化时触发
            'operation': 3, // 中等优先级：操作完成后触发
            'mutation': 4, // 低优先级：DOM内容变化时触发
            'timer': 5 // 最低优先级：定时触发
        };
        return priorities[type] || 4;
    }
    async processRefreshQueue() {
        if (this.isRefreshing || this.refreshQueue.length === 0) {
            return;
        }
        this.isRefreshing = true;
        this.lastRefreshTime = Date.now();
        try {
            // 取出最高优先级的触发
            const trigger = this.refreshQueue.shift();
            this.refreshQueue = []; // 清空剩余队列，由高优先级触发处理
            // 执行刷新
            const result = await this.performRefresh(trigger);
            if (result.success) {
                this.emit('refresh:completed', { trigger, result });
                // 检查任务完成条件
                if (this.checkTaskCompletion(result)) {
                    this.markTaskCompleted();
                }
            }
            else {
                this.emit('refresh:failed', { trigger, error: result.error });
            }
        }
        catch (error) {
            this.emit('refresh:failed', { trigger: this.refreshQueue[0], error });
        }
        finally {
            this.isRefreshing = false;
        }
    }
    // ==================== 动态操作注册 ====================
    async registerBaseOperations() {
        // 注册基础的滚动操作
        await this.registerOperation('scroll_to_load', async (params) => {
            return await this.executeDynamicOperation(this.page, {
                id: 'scroll_to_load',
                type: 'built-in',
                action: 'scroll',
                selector: 'body'
            }, params);
        });
        // 注册基础的手动刷新操作
        await this.registerOperation('manual_refresh', async (params) => {
            await this.triggerRefresh('manual', 'manual_operation');
            return OperatorTypes_js_1.OperationResult.success({ action: 'manual_refresh' });
        });
    }
    async registerDynamicOperations(page) {
        try {
            const operations = await page.evaluate((config) => {
                const element = document.querySelector(config.selector);
                if (!element)
                    return [];
                const operations = [];
                // 检测可操作的元素
                const buttons = element.querySelectorAll('button, [role="button"], [onclick]');
                buttons.forEach((button, index) => {
                    const text = button.textContent?.trim() || '';
                    const action = this.inferActionFromText(text);
                    if (action) {
                        operations.push({
                            id: `button_${index}`,
                            type: 'element-type',
                            selector: `${config.selector} button:nth-child(${index + 1})`,
                            action,
                            text,
                            autoExecute: this.shouldAutoExecute(text),
                            maxAttempts: this.getMaxAttempts(text)
                        });
                    }
                });
                return operations;
            }, this.config);
            // 注册检测到的操作
            for (const op of operations) {
                await this.registerOperation(op.id, async (params) => {
                    return await this.executeDynamicOperation(page, op, params);
                }, op);
            }
        }
        catch (error) {
            console.warn(`动态操作注册失败 ${this.config.id}:`, error);
        }
    }
    async registerOperation(id, handler, config) {
        this.activeOperations.set(id, handler);
        if (config) {
            this.registeredOperations.set(id, config);
        }
        if (!this.state.operations.includes(id)) {
            this.state.operations.push(id);
        }
        this.emit('operation:registered', { operationId: id, container: this });
        console.log(`📝 注册操作: ${id} -> ${this.config.name}`);
    }
    // ==================== 容器状态检测 ====================
    async detectContainerState(page) {
        try {
            const stateUpdate = await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (!element) {
                    return { exists: false, visible: false };
                }
                return {
                    exists: true,
                    visible: element.offsetParent !== null,
                    childCount: element.children.length,
                    contentHash: this.generateContentHash(element),
                    bounds: {
                        width: element.offsetWidth,
                        height: element.offsetHeight,
                        top: element.offsetTop,
                        left: element.offsetLeft
                    }
                };
            }, this.config.selector);
            return stateUpdate;
        }
        catch (error) {
            console.warn(`容器状态检测失败 ${this.config.id}:`, error);
            return { exists: false, visible: false };
        }
    }
    // ==================== 子容器管理 ====================
    async discoverAndRegisterChildContainers(page) {
        if (!this.config.childContainerTypes || this.config.childContainerTypes.length === 0) {
            return;
        }
        try {
            const childContainerInfo = await page.evaluate((config) => {
                const parentElement = document.querySelector(config.selector);
                if (!parentElement)
                    return [];
                const children = [];
                // 查找指定类型的子容器
                config.childContainerTypes.forEach((type) => {
                    const childElements = parentElement.querySelectorAll(`[data-container-type="${type}"], [class*="${type}"]`);
                    childElements.forEach((child, index) => {
                        if (child.offsetParent !== null) {
                            children.push({
                                type,
                                id: `${type}_${index}_${Date.now()}`,
                                selector: `${config.selector} > :nth-child(${index + 1})`,
                                element: child
                            });
                        }
                    });
                });
                return children;
            }, this.config);
            // 注册新的子容器
            for (const childInfo of childContainerInfo) {
                if (!this.childContainers.has(childInfo.id)) {
                    const childContainer = await this.createChildContainer(childInfo);
                    this.childContainers.set(childInfo.id, childContainer);
                    // 递归初始化子容器
                    await childContainer.initialize(page, this.sharedSpace);
                    this.emit('child:discovered', { container: childContainer, parent: this });
                }
            }
        }
        catch (error) {
            console.warn(`子容器发现失败 ${this.config.id}:`, error);
        }
    }
    // ==================== 任务管理 ====================
    updateTaskProgress() {
        if (!this.taskCompletionCriteria)
            return;
        this.taskProgress = {
            type: this.taskCompletionCriteria.type,
            targetCount: this.taskCompletionCriteria.targetCount,
            currentCount: 0,
            timeout: this.taskCompletionCriteria.timeout,
            startTime: Date.now(),
            isCompleted: false
        };
        this.state.taskProgress = this.taskProgress;
    }
    checkTaskCompletion(result) {
        if (!this.taskCompletionCriteria || this.taskProgress.isCompleted) {
            return false;
        }
        switch (this.taskCompletionCriteria.type) {
            case 'count':
                if (this.taskCompletionCriteria.targetCount) {
                    const currentCount = this.getCurrentCountFromResult(result);
                    this.taskProgress.currentCount = currentCount;
                    return currentCount >= this.taskCompletionCriteria.targetCount;
                }
                break;
            case 'condition':
                if (this.taskCompletionCriteria.condition) {
                    return this.taskCompletionCriteria.condition(result);
                }
                break;
            case 'timeout':
                if (this.taskCompletionCriteria.timeout) {
                    const elapsed = Date.now() - this.taskProgress.startTime;
                    return elapsed >= this.taskCompletionCriteria.timeout;
                }
                break;
        }
        return false;
    }
    getCurrentCountFromResult(result) {
        // 子类需要重写此方法来根据操作结果计算当前数量
        return 0;
    }
    markTaskCompleted() {
        this.taskProgress.isCompleted = true;
        this.state.status = 'completed';
        this.emit('task:completed', { container: this, progress: this.taskProgress });
        console.log(`✅ 任务完成: ${this.config.name}`);
    }
    isTaskCompleted() {
        return this.taskProgress.isCompleted;
    }
    // ==================== 定时刷新机制 ====================
    startPeriodicRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        this.refreshTimer = setInterval(() => {
            this.triggerRefresh('timer', 'periodic');
        }, this.config.refreshInterval);
        console.log(`⏰ 启动定时刷新: ${this.config.name} (${this.config.refreshInterval}ms)`);
    }
    // ==================== 内容变化监听 ====================
    async setupMutationObserver() {
        try {
            await this.executeWithContext(async (page) => {
                await page.evaluate((config) => {
                    const targetElement = document.querySelector(config.selector);
                    if (!targetElement)
                        return;
                    const observer = new MutationObserver((mutations) => {
                        // 通知主进程容器内容发生变化
                        if (window.postMessage) {
                            window.postMessage({
                                type: 'container-mutation',
                                containerId: config.id,
                                mutations: mutations.length
                            }, '*');
                        }
                    });
                    observer.observe(targetElement, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true
                    });
                    // 存储observer引用以便后续清理
                    window[`container_observer_${config.id}`] = observer;
                }, this.config);
            });
            // 监听来自页面的变化通知
            if (typeof window !== 'undefined') {
                window.addEventListener('message', (event) => {
                    if (event.data?.type === 'container-mutation' && event.data?.containerId === this.config.id) {
                        this.triggerRefresh('mutation', 'mutation-observer', event.data);
                    }
                });
            }
            console.log(`👁️ 设置内容变化监听: ${this.config.name}`);
        }
        catch (error) {
            console.warn(`MutationObserver设置失败 ${this.config.id}:`, error);
        }
    }
    // ==================== 公共接口 ====================
    async executeOperation(operationId, params) {
        try {
            const operation = this.activeOperations.get(operationId);
            if (!operation) {
                throw new Error(`操作不存在: ${operationId}`);
            }
            console.log(`🎮 执行操作: ${operationId}`);
            const result = await operation(params);
            // 操作完成后触发刷新
            await this.triggerRefresh('operation', operationId, { result, params });
            return result;
        }
        catch (error) {
            console.error(`操作执行失败 ${operationId}:`, error);
            return OperatorTypes_js_1.OperationResult.failure(error.message, error);
        }
    }
    async refresh() {
        await this.triggerRefresh('manual', 'manual-trigger');
    }
    getState() {
        return { ...this.state };
    }
    getRefreshStats() {
        const triggerCounts = this.refreshHistory.reduce((acc, trigger) => {
            acc[trigger.type] = (acc[trigger.type] || 0) + 1;
            return acc;
        }, {});
        return {
            totalRefreshes: this.refreshHistory.length,
            triggerCounts,
            averageInterval: this.calculateAverageInterval(),
            lastRefreshTime: this.state.lastRefreshed,
            isCurrentlyRefreshing: this.isRefreshing,
            taskProgress: this.taskProgress
        };
    }
    // ==================== 清理资源 ====================
    async cleanup() {
        console.log(`🧹 清理容器资源: ${this.config.name}`);
        // 停止定时器
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        // 清理MutationObserver
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        // 清理子容器
        for (const child of this.childContainers.values()) {
            await child.cleanup();
        }
        this.childContainers.clear();
        // 清理操作注册
        this.registeredOperations.clear();
        this.activeOperations.clear();
        // 清理防抖定时器
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }
        // 更新状态
        this.state.status = 'destroyed';
        // 移除事件监听
        this.removeAllListeners();
        console.log(`✅ 容器清理完成: ${this.config.name}`);
    }
    // ==================== 辅助方法 ====================
    generateContentHash(element) {
        const content = element.textContent || '';
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
    inferActionFromText(text) {
        const actionMap = {
            '加载更多': 'load_more',
            '查看更多': 'load_more',
            '展开': 'expand',
            '收起': 'collapse',
            '回复': 'reply',
            '点赞': 'like',
            '转发': 'share',
            '收藏': 'favorite'
        };
        for (const [key, action] of Object.entries(actionMap)) {
            if (text.includes(key)) {
                return action;
            }
        }
        return null;
    }
    shouldAutoExecute(text) {
        const autoExecuteTexts = ['加载更多', '查看更多'];
        return autoExecuteTexts.some(autoText => text.includes(autoText));
    }
    getMaxAttempts(text) {
        if (text.includes('加载更多') || text.includes('查看更多')) {
            return 3;
        }
        return 1;
    }
    calculateAverageInterval() {
        if (this.refreshHistory.length < 2)
            return 0;
        const intervals = [];
        for (let i = 1; i < this.refreshHistory.length; i++) {
            intervals.push(this.refreshHistory[i].timestamp - this.refreshHistory[i - 1].timestamp);
        }
        return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }
    // ==================== 事件处理器 ====================
    handleRefreshRequest(data) {
        console.log(`🔄 刷新请求: ${this.config.name}`, data);
    }
    handleRefreshCompleted(data) {
        console.log(`✅ 刷新完成: ${this.config.name}`);
        this.state.lastRefreshed = data.trigger.timestamp;
        this.state.refreshCount++;
    }
    handleRefreshFailed(data) {
        console.warn(`❌ 刷新失败: ${this.config.name}`, data.error);
    }
    handleContainerChanged(data) {
        console.log(`📝 容器内容变化: ${this.config.name}`, data);
    }
    handleOperationRegistered(data) {
        console.log(`📝 操作注册: ${data.operationId} -> ${this.config.name}`);
    }
    handleChildDiscovered(data) {
        console.log(`🆕 发现子容器: ${data.container.config.name} -> ${this.config.name}`);
    }
    handleTaskCompleted(data) {
        console.log(`🎯 任务完成: ${this.config.name}`, data.progress);
    }
}
exports.BaseSelfRefreshingContainer = BaseSelfRefreshingContainer;
exports.default = BaseSelfRefreshingContainer;
