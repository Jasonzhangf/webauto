"use strict";
/**
 * 微博页面管理容器实现
 * 负责整体页面状态管理、容器协调和任务编排
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeiboPageContainer = void 0;
const BaseSelfRefreshingContainer_js_1 = require("./BaseSelfRefreshingContainer.js");
const WeiboLinkContainer_js_1 = require("./WeiboLinkContainer.js");
// ==================== 容器实现 ====================
class WeiboPageContainer extends BaseSelfRefreshingContainer_js_1.BaseSelfRefreshingContainer {
    constructor(config) {
        super({
            refreshInterval: 3000,
            enableAutoRefresh: true,
            enableMutationObserver: true,
            maxRefreshRetries: 3,
            debounceTime: 1500,
            childContainerTypes: ['WeiboLinkContainer'],
            taskCompletionCriteria: {
                type: 'condition',
                condition: (result) => this.isPageTaskCompleted(result)
            },
            ...config
        });
        this.childContainers = new Map();
        this.reloadAttempts = 0;
        this.navigationHistory = [];
        this.isActive = true;
        this.config = config;
        this.pageState = {
            url: config.url || '',
            title: '',
            isLoaded: false,
            hasError: false,
            loadTime: 0,
            lastActivity: Date.now(),
            containersStatus: {}
        };
        this.setupPageSpecificHandlers();
    }
    setupPageSpecificHandlers() {
        // 监听页面状态变化
        this.on('page:loaded', (data) => {
            console.log(`📄 页面加载完成: ${data.url}`);
            this.pageState.isLoaded = true;
            this.pageState.loadTime = Date.now();
        });
        // 监听页面错误
        this.on('page:error', (error) => {
            console.error(`📄 页面错误: ${error.message}`);
            this.pageState.hasError = true;
            this.handlePageError(error);
        });
        // 监听容器状态变化
        this.on('container:state_changed', (data) => {
            this.pageState.containersStatus[data.containerId] = {
                state: data.state,
                lastUpdate: Date.now(),
                stats: data.stats
            };
            console.log(`🔧 容器状态更新 [${data.containerId}]: ${data.state}`);
        });
        // 监听导航事件
        this.on('navigation:completed', (data) => {
            console.log(`🧭 导航完成: ${data.fromUrl} → ${data.toUrl}`);
            this.navigationHistory.push(data.toUrl);
            this.pageState.url = data.toUrl;
            this.pageState.lastActivity = Date.now();
        });
    }
    // ==================== 抽象方法实现 ====================
    setPageContext(page) {
        this.page = page;
    }
    async executeWithContext(fn) {
        if (!this.page) {
            throw new Error('页面上下文未设置');
        }
        return await fn(this.page);
    }
    async createChildContainer(childInfo) {
        const { type, config } = childInfo;
        switch (type) {
            case 'WeiboLinkContainer':
                return new WeiboLinkContainer_js_1.WeiboLinkContainer(config);
            default:
                throw new Error(`不支持的子容器类型: ${type}`);
        }
    }
    async executeDynamicOperation(page, operation, params) {
        switch (operation.action) {
            case 'navigate_to_url':
                return await this.executeNavigateToUrl(page, operation);
            case 'reload_page':
                return await this.executeReloadPage(page, operation);
            case 'wait_for_stability':
                return await this.executeWaitForStability(page, operation);
            case 'check_page_health':
                return await this.executeCheckPageHealth(page, operation);
            case 'synchronize_containers':
                return await this.executeSynchronizeContainers(page, operation);
            default:
                return OperatorTypes_js_1.OperationResult.failure(`不支持的操作: ${operation.action}`);
        }
    }
    // ==================== 核心刷新逻辑 ====================
    async performRefresh(trigger) {
        console.log(`🔄 执行页面容器刷新 [${trigger.type}]: ${this.config.name} (${this.config.pageType})`);
        try {
            // 1. 检测页面状态
            const stateUpdate = await this.detectPageState(this.page);
            this.updatePageState(stateUpdate);
            // 2. 处理页面错误
            if (stateUpdate.hasError) {
                await this.handlePageError(stateUpdate.error);
                return OperatorTypes_js_1.OperationResult.success({
                    action: 'refresh',
                    result: 'error_handled',
                    message: '页面错误已处理'
                });
            }
            // 3. 确保页面加载完成
            if (!this.pageState.isLoaded) {
                await this.waitForPageLoad();
            }
            // 4. 注册动态操作
            await this.registerDynamicOperations(this.page);
            // 5. 初始化子容器
            await this.initializeChildContainers();
            // 6. 协调子容器刷新
            await this.coordinateChildContainers(trigger);
            // 7. 执行页面健康检查
            const healthCheck = await this.checkPageHealth();
            if (!healthCheck.healthy) {
                console.warn('⚠️ 页面健康检查失败，尝试恢复...');
                await this.performPageRecovery();
            }
            // 8. 根据触发源执行特定操作
            await this.handleTriggerSpecificActions(trigger);
            return OperatorTypes_js_1.OperationResult.success({
                action: 'refresh',
                trigger: trigger.type,
                pageState: this.pageState,
                containerStats: this.getContainerStats(),
                taskProgress: this.taskProgress,
                timestamp: Date.now()
            });
        }
        catch (error) {
            console.error(`页面容器刷新失败 [${trigger.type}]:`, error);
            return OperatorTypes_js_1.OperationResult.failure(`刷新失败: ${error.message}`, error);
        }
    }
    // ==================== 页面状态管理 ====================
    async detectPageState(page) {
        try {
            const state = await page.evaluate(() => {
                return {
                    url: window.location.href,
                    title: document.title,
                    isLoaded: document.readyState === 'complete',
                    hasError: false,
                    scrollY: window.scrollY,
                    scrollHeight: document.documentElement.scrollHeight
                };
            });
            return {
                url: state.url,
                title: state.title,
                isLoaded: state.isLoaded,
                hasError: false
            };
        }
        catch (error) {
            return {
                hasError: true,
                error: new Error(`页面状态检测失败: ${error.message}`)
            };
        }
    }
    updatePageState(update) {
        this.pageState = {
            ...this.pageState,
            ...update,
            lastActivity: Date.now()
        };
    }
    async waitForPageLoad() {
        try {
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            this.pageState.isLoaded = true;
            this.emit('page:loaded', { url: this.pageState.url });
        }
        catch (error) {
            throw new Error(`页面加载超时: ${error.message}`);
        }
    }
    // ==================== 子容器管理 ====================
    async initializeChildContainers() {
        // 初始化链接容器
        if (!this.childContainers.has('linkContainer') && this.config.containerConfigs?.linkContainer) {
            const linkContainer = await this.createChildContainer({
                type: 'WeiboLinkContainer',
                config: this.config.containerConfigs.linkContainer
            });
            await linkContainer.initialize(this.page, this.sharedSpace);
            this.childContainers.set('linkContainer', linkContainer);
            // 监听链接容器事件
            this.setupContainerEventListeners('linkContainer', linkContainer);
        }
    }
    setupContainerEventListeners(containerId, container) {
        container.on('refresh:completed', (data) => {
            this.emit('container:state_changed', {
                containerId,
                state: 'running',
                stats: container.getStats(),
                data
            });
        });
        container.on('links:discovered', (data) => {
            this.emit('page:links_updated', {
                containerId,
                data
            });
        });
        container.on('error', (error) => {
            this.emit('container:error', {
                containerId,
                error: error.message
            });
        });
    }
    async coordinateChildContainers(trigger) {
        const promises = Array.from(this.childContainers.entries()).map(async ([id, container]) => {
            try {
                // 根据页面类型和触发源协调容器刷新
                if (this.shouldRefreshContainer(id, trigger)) {
                    await container.refresh(trigger);
                }
            }
            catch (error) {
                console.error(`子容器刷新失败 [${id}]:`, error);
                this.emit('container:error', { containerId: id, error: error.message });
            }
        });
        await Promise.allSettled(promises);
    }
    shouldRefreshContainer(containerId, trigger) {
        // 根据页面类型和触发源决定是否刷新特定容器
        switch (this.config.pageType) {
            case 'homepage':
                return containerId === 'linkContainer' && ['initialization', 'timer', 'mutation'].includes(trigger.type);
            case 'search':
                return containerId === 'linkContainer' && ['initialization', 'operation'].includes(trigger.type);
            default:
                return true;
        }
    }
    // ==================== 页面健康检查和恢复 ====================
    async checkPageHealth() {
        const issues = [];
        try {
            // 检查页面响应性
            const responsive = await this.page.evaluate(() => {
                return document.readyState === 'complete' &&
                    document.body !== null &&
                    !document.body.classList.contains('error-page');
            });
            if (!responsive) {
                issues.push('页面无响应');
            }
            // 检查网络连接
            const network = await this.page.evaluate(() => {
                return navigator.onLine;
            });
            if (!network) {
                issues.push('网络连接断开');
            }
            // 检查容器状态
            for (const [id, container] of this.childContainers) {
                const stats = container.getStats();
                if (stats.errorRate > 0.3) {
                    issues.push(`容器 ${id} 错误率过高`);
                }
            }
            return {
                healthy: issues.length === 0,
                issues
            };
        }
        catch (error) {
            return {
                healthy: false,
                issues: [`健康检查失败: ${error.message}`]
            };
        }
    }
    async performPageRecovery() {
        console.log('🔄 开始页面恢复操作...');
        // 1. 尝试重新加载页面
        if (this.reloadAttempts < (this.config.maxReloadAttempts || 3)) {
            await this.reloadPage();
            this.reloadAttempts++;
        }
        else {
            console.error('❌ 页面恢复尝试次数已用完');
            this.pageState.hasError = true;
            this.isActive = false;
        }
        // 2. 重置子容器
        await this.resetChildContainers();
        // 3. 重新初始化
        if (this.isActive) {
            await this.initializeChildContainers();
        }
    }
    async reloadPage() {
        try {
            console.log(`🔄 重新加载页面 (尝试 ${this.reloadAttempts + 1})`);
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            this.pageState.isLoaded = false;
            this.pageState.lastActivity = Date.now();
        }
        catch (error) {
            throw new Error(`页面重新加载失败: ${error.message}`);
        }
    }
    async resetChildContainers() {
        for (const [id, container] of this.childContainers) {
            try {
                await container.cleanup();
                await container.initialize(this.page, this.sharedSpace);
            }
            catch (error) {
                console.error(`重置子容器失败 [${id}]:`, error);
            }
        }
    }
    // ==================== 操作执行 ====================
    async executeNavigateToUrl(page, operation) {
        try {
            const targetUrl = operation.url;
            const currentUrl = page.url();
            await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            this.emit('navigation:completed', {
                fromUrl: currentUrl,
                toUrl: targetUrl
            });
            return OperatorTypes_js_1.OperationResult.success({
                action: 'navigate_to_url',
                result: 'success',
                message: '页面导航完成',
                url: targetUrl
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`页面导航失败: ${error.message}`, error);
        }
    }
    async executeReloadPage(page, operation) {
        try {
            await this.reloadPage();
            return OperatorTypes_js_1.OperationResult.success({
                action: 'reload_page',
                result: 'success',
                message: '页面重新加载完成'
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`页面重新加载失败: ${error.message}`, error);
        }
    }
    async executeWaitForStability(page, operation) {
        try {
            const timeout = operation.timeout || 5000;
            const startTime = Date.now();
            // 等待页面稳定（没有新的DOM变化）
            await page.evaluate(() => {
                return new Promise((resolve) => {
                    const observer = new MutationObserver(() => {
                        clearTimeout(timer);
                        timer = setTimeout(resolve, 1000); // 1秒内无新变化
                    });
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true
                    });
                    const timer = setTimeout(resolve, timeout);
                });
            });
            const elapsed = Date.now() - startTime;
            return OperatorTypes_js_1.OperationResult.success({
                action: 'wait_for_stability',
                result: 'success',
                message: '页面稳定性检查完成',
                elapsed
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`稳定性检查失败: ${error.message}`, error);
        }
    }
    async executeCheckPageHealth(page, operation) {
        try {
            const health = await this.checkPageHealth();
            return OperatorTypes_js_1.OperationResult.success({
                action: 'check_page_health',
                result: 'success',
                message: '页面健康检查完成',
                healthy: health.healthy,
                issues: health.issues
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`健康检查失败: ${error.message}`, error);
        }
    }
    async executeSynchronizeContainers(page, operation) {
        try {
            const syncResults = [];
            for (const [id, container] of this.childContainers) {
                try {
                    const result = await container.synchronize();
                    syncResults.push({
                        containerId: id,
                        success: true,
                        result
                    });
                }
                catch (error) {
                    syncResults.push({
                        containerId: id,
                        success: false,
                        error: error.message
                    });
                }
            }
            return OperatorTypes_js_1.OperationResult.success({
                action: 'synchronize_containers',
                result: 'success',
                message: '容器同步完成',
                syncResults
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`容器同步失败: ${error.message}`, error);
        }
    }
    // ==================== 错误处理 ====================
    async handlePageError(error) {
        console.error('📄 处理页面错误:', error);
        this.pageState.hasError = true;
        this.emit('page:error', error);
        // 自动恢复
        if (this.config.enableErrorRecovery !== false) {
            await this.performPageRecovery();
        }
    }
    // ==================== 触发源处理 ====================
    async handleTriggerSpecificActions(trigger) {
        switch (trigger.type) {
            case 'initialization':
                console.log('🚀 页面初始化触发，开始协调容器...');
                this.reloadAttempts = 0; // 重置重载计数
                break;
            case 'mutation':
                console.log('👁️ 页面内容变化触发，协调相关容器...');
                break;
            case 'timer':
                console.log('⏰ 定时触发，维护页面状态...');
                // 定期健康检查
                if (Date.now() - this.pageState.lastActivity > 30000) {
                    await this.checkPageHealth();
                }
                break;
            case 'operation':
                console.log(`🎮 操作触发 [${trigger.source}]:`, trigger.data);
                break;
            case 'manual':
                console.log('👆 手动触发页面刷新...');
                break;
        }
    }
    // ==================== 任务完成判断 ====================
    isPageTaskCompleted(result) {
        switch (this.config.pageType) {
            case 'homepage':
                // 主页任务：链接容器完成
                const linkContainer = this.childContainers.get('linkContainer');
                return linkContainer?.getStats()?.isComplete || false;
            case 'search':
                // 搜索页任务：达到目标链接数量或完成分页
                const searchContainer = this.childContainers.get('linkContainer');
                const stats = searchContainer?.getStats();
                return stats?.linkCount >= (this.config.containerConfigs?.linkContainer?.maxLinks || 100) || false;
            default:
                // 默认：所有子容器都完成
                return Array.from(this.childContainers.values()).every(container => container.getStats()?.isComplete || false);
        }
    }
    // ==================== 公共接口 ====================
    getPageState() {
        return { ...this.pageState };
    }
    getContainerStats() {
        const stats = {};
        for (const [id, container] of this.childContainers) {
            stats[id] = container.getStats();
        }
        return {
            totalContainers: this.childContainers.size,
            activeContainers: Array.from(this.childContainers.values()).filter(c => c.getState() === 'running').length,
            containers: stats,
            pageHealth: this.pageState.hasError ? 'unhealthy' : 'healthy',
            navigationHistory: this.navigationHistory.length,
            reloadAttempts: this.reloadAttempts
        };
    }
    async navigateTo(url) {
        return await this.executeOperation('navigate_to_url', { url });
    }
    getChildContainer(id) {
        return this.childContainers.get(id);
    }
    getAllLinks() {
        const linkContainer = this.childContainers.get('linkContainer');
        return linkContainer?.getAllLinks() || [];
    }
    resetReloadAttempts() {
        this.reloadAttempts = 0;
        console.log('🔄 重置页面重载尝试计数');
    }
    // ==================== 清理资源 ====================
    async cleanup() {
        console.log(`🧹 清理微博页面容器: ${this.config.name}`);
        // 清理子容器
        for (const [id, container] of this.childContainers) {
            try {
                await container.cleanup();
            }
            catch (error) {
                console.error(`清理子容器失败 [${id}]:`, error);
            }
        }
        this.childContainers.clear();
        this.navigationHistory = [];
        this.reloadAttempts = 0;
        this.isActive = false;
        await super.cleanup();
    }
}
exports.WeiboPageContainer = WeiboPageContainer;
exports.default = WeiboPageContainer;
