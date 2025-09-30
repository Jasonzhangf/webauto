"use strict";
/**
 * 微博分页控制容器实现
 * 专门处理分页操作和多页内容加载
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeiboPaginationContainer = void 0;
const BaseSelfRefreshingContainer_js_1 = require("./BaseSelfRefreshingContainer.js");
// ==================== 容器实现 ====================
class WeiboPaginationContainer extends BaseSelfRefreshingContainer_js_1.BaseSelfRefreshingContainer {
    constructor(config) {
        super({
            refreshInterval: 2000,
            enableAutoRefresh: true,
            enableMutationObserver: true,
            maxRefreshRetries: 2,
            debounceTime: 800,
            childContainerTypes: [],
            taskCompletionCriteria: {
                type: 'condition',
                condition: (result) => this.isPaginationTaskCompleted(result)
            },
            ...config
        });
        this.paginationAttempts = 0;
        this.currentPage = 1;
        this.noNewContentPages = 0;
        this.isPaginating = false;
        this.pageLoadStartTime = 0;
        this.pageHistory = [];
        this.contentHashes = new Map();
        this.config = config;
        this.currentPage = config.startPage || 1;
        this.pageMetrics = {
            totalPages: 0,
            currentPage: this.currentPage,
            visitedPages: [this.currentPage],
            pageContentMap: new Map(),
            totalPageLoadTime: 0,
            averagePageLoadTime: 0,
            contentGrowthRate: 0,
            duplicateContentPages: 0
        };
        this.setupPaginationSpecificHandlers();
    }
    setupPaginationSpecificHandlers() {
        // 监听分页操作完成
        this.on('pagination:completed', (data) => {
            console.log(`📄 分页完成: 第${data.fromPage}页 → 第${data.toPage}页, 新内容${data.newContentLoaded ? '是' : '否'} (${data.loadTime}ms)`);
            this.updatePageMetrics(data);
        });
        // 监听分页停止
        this.on('pagination:stopped', (reason) => {
            console.log(`📄 分页停止: ${reason}`);
            this.stopPagination(reason);
        });
        // 监听页面内容分析
        this.on('page:analyzed', (data) => {
            console.log(`📊 页面分析: 页面${data.pageNumber}, 新内容${data.newContentCount}项, 重复率${(data.duplicateRate * 100).toFixed(1)}%`);
            this.analyzePageContent(data);
        });
        // 监听分页效率变化
        this.on('efficiency:changed', (efficiency) => {
            console.log(`📊 分页效率: ${(efficiency * 100).toFixed(1)}%`);
            this.pageMetrics.contentGrowthRate = efficiency;
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
        // 分页容器通常不需要子容器
        throw new Error('分页容器不支持子容器');
    }
    async executeDynamicOperation(page, operation, params) {
        switch (operation.action) {
            case 'next_page':
                return await this.executeNextPage(page, operation);
            case 'previous_page':
                return await this.executePreviousPage(page, operation);
            case 'goto_page':
                return await this.executeGotoPage(page, operation);
            case 'load_more':
                return await this.executeLoadMore(page, operation);
            case 'analyze_pagination_state':
                return await this.executeAnalyzePaginationState(page, operation);
            case 'reset_pagination':
                return await this.executeResetPagination(page, operation);
            default:
                return OperatorTypes_js_1.OperationResult.failure(`不支持的操作: ${operation.action}`);
        }
    }
    // ==================== 核心刷新逻辑 ====================
    async performRefresh(trigger) {
        console.log(`🔄 执行分页容器刷新 [${trigger.type}]: ${this.config.name} (第${this.currentPage}页)`);
        try {
            // 1. 检测容器状态
            const stateUpdate = await this.detectContainerState(this.page);
            this.updateState(stateUpdate);
            // 2. 如果容器不存在，跳过刷新
            if (!stateUpdate.exists) {
                return OperatorTypes_js_1.OperationResult.success({
                    action: 'refresh',
                    result: 'container_not_found',
                    message: '分页容器不存在'
                });
            }
            // 3. 分析当前分页状态
            const paginationAnalysis = await this.analyzePaginationState();
            this.updatePaginationAnalysis(paginationAnalysis);
            // 4. 注册动态操作
            await this.registerDynamicOperations(this.page);
            // 5. 根据触发源执行分页
            if (this.shouldAutoPaginate(trigger)) {
                await this.performAutoPagination();
            }
            // 6. 检查停止条件
            if (this.shouldStopPagination()) {
                const stopReason = this.determineStopReason();
                this.emit('pagination:stopped', stopReason);
            }
            return OperatorTypes_js_1.OperationResult.success({
                action: 'refresh',
                trigger: trigger.type,
                pageMetrics: this.pageMetrics,
                paginationAttempts: this.paginationAttempts,
                currentPage: this.currentPage,
                taskProgress: this.taskProgress,
                timestamp: Date.now()
            });
        }
        catch (error) {
            console.error(`分页容器刷新失败 [${trigger.type}]:`, error);
            return OperatorTypes_js_1.OperationResult.failure(`刷新失败: ${error.message}`, error);
        }
    }
    // ==================== 分页状态分析 ====================
    async analyzePaginationState() {
        try {
            const analysis = await this.page.evaluate((config) => {
                const selectors = config.pageSelectors || {};
                // 检测当前页码
                let currentPage = 1;
                if (selectors.currentPageIndicator) {
                    const currentEl = document.querySelector(selectors.currentPageIndicator);
                    if (currentEl) {
                        const pageText = currentEl.textContent || '';
                        const pageMatch = pageText.match(/(\d+)/);
                        currentPage = pageMatch ? parseInt(pageMatch[1]) : 1;
                    }
                }
                // 检测总页数
                let totalPages = 0;
                if (selectors.totalPagesIndicator) {
                    const totalEl = document.querySelector(selectors.totalPagesIndicator);
                    if (totalEl) {
                        const totalText = totalEl.textContent || '';
                        const totalMatch = totalText.match(/(\d+)/);
                        totalPages = totalMatch ? parseInt(totalMatch[1]) : 0;
                    }
                }
                // 检测分页控件
                const hasNextButton = selectors.nextButton ?
                    document.querySelector(selectors.nextButton) : null;
                const hasLoadMoreButton = selectors.loadMoreButton ?
                    document.querySelector(selectors.loadMoreButton) : null;
                // 分析页面内容
                const contentElements = document.querySelectorAll('.Feed_body, .card-wrap, .article, .item');
                const contentHash = this.generateContentHash(contentElements);
                return {
                    currentPage,
                    totalPages,
                    hasNextButton: !!hasNextButton,
                    hasLoadMoreButton: !!hasLoadMoreButton,
                    contentCount: contentElements.length,
                    contentHash,
                    url: window.location.href,
                    canPaginate: !!hasNextButton || !!hasLoadMoreButton
                };
            }, this.config);
            return analysis;
        }
        catch (error) {
            throw new Error(`分页状态分析失败: ${error.message}`);
        }
    }
    updatePaginationAnalysis(analysis) {
        this.pageMetrics.totalPages = analysis.totalPages || this.pageMetrics.totalPages;
        this.pageMetrics.currentPage = analysis.currentPage || this.currentPage;
        // 检测页面内容变化
        const previousHash = this.contentHashes.get(this.currentPage);
        if (analysis.contentHash !== previousHash) {
            this.contentHashes.set(this.currentPage, analysis.contentHash);
            this.pageMetrics.pageContentMap.set(this.currentPage, {
                contentCount: analysis.contentCount,
                contentHash: analysis.contentHash,
                timestamp: Date.now()
            });
            this.emit('page:analyzed', {
                pageNumber: this.currentPage,
                newContentCount: analysis.contentCount,
                contentHash: analysis.contentHash,
                timestamp: Date.now()
            });
        }
    }
    // ==================== 自动分页逻辑 ====================
    shouldAutoPaginate(trigger) {
        // 检查是否启用自动分页
        if (!this.config.enableAutoPagination) {
            return false;
        }
        // 检查是否正在分页
        if (this.isPaginating) {
            return false;
        }
        // 检查分页尝试次数
        if (this.paginationAttempts >= (this.config.maxPageAttempts || 20)) {
            console.log('📄 已达到最大分页尝试次数');
            return false;
        }
        // 检查最大页数限制
        if (this.config.maxPages && this.currentPage >= this.config.maxPages) {
            console.log(`📄 已达到最大页数限制 (${this.config.maxPages})`);
            return false;
        }
        // 检查停止条件
        if (this.shouldStopPagination()) {
            return false;
        }
        // 只在特定触发源下自动分页
        return ['initialization', 'timer', 'mutation'].includes(trigger.type);
    }
    async performAutoPagination() {
        if (this.isPaginating)
            return;
        this.isPaginating = true;
        this.pageLoadStartTime = Date.now();
        try {
            console.log(`📄 开始自动分页 (尝试 ${this.paginationAttempts + 1}/${this.config.maxPageAttempts}, 第${this.currentPage}页)`);
            let paginationResult;
            const mode = this.config.paginationMode || 'auto';
            switch (mode) {
                case 'button':
                    paginationResult = await this.performButtonPagination();
                    break;
                case 'url':
                    paginationResult = await this.performUrlPagination();
                    break;
                case 'load_more':
                    paginationResult = await this.performLoadMorePagination();
                    break;
                case 'infinite':
                    paginationResult = await this.performInfinitePagination();
                    break;
                case 'auto':
                default:
                    paginationResult = await this.performAutoModePagination();
                    break;
            }
            this.paginationAttempts++;
            this.emit('pagination:completed', paginationResult);
            // 检查是否需要停止
            if (paginationResult.stopReason) {
                this.stopPagination(paginationResult.stopReason);
            }
        }
        catch (error) {
            console.error('自动分页失败:', error);
            this.paginationAttempts++;
        }
        finally {
            this.isPaginating = false;
        }
    }
    async performButtonPagination() {
        try {
            const startTime = Date.now();
            const fromPage = this.currentPage;
            // 查找并点击下一页按钮
            const nextButton = await this.page.$(this.config.pageSelectors?.nextButton || 'button:has-text("下一页"), .next, [class*="next"]');
            if (!nextButton) {
                return {
                    action: 'button_pagination',
                    fromPage,
                    toPage: fromPage,
                    success: false,
                    newContentLoaded: false,
                    contentMetrics: {},
                    loadTime: Date.now() - startTime,
                    stopReason: 'next_button_not_found'
                };
            }
            await this.safeClick(nextButton, { container: this.containerSelector });
            await this.page.waitForTimeout(this.config.pageDelay || 2000);
            // 等待页面加载
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            const toPage = this.currentPage + 1;
            const newContentLoaded = await this.checkNewContentLoaded();
            return {
                action: 'button_pagination',
                fromPage,
                toPage,
                success: true,
                newContentLoaded,
                contentMetrics: { fromPage, toPage },
                loadTime: Date.now() - startTime
            };
        }
        catch (error) {
            throw new Error(`按钮分页失败: ${error.message}`);
        }
    }
    async performUrlPagination() {
        try {
            const startTime = Date.now();
            const fromPage = this.currentPage;
            const toPage = fromPage + 1;
            // 构造下一页URL
            let nextPageUrl;
            if (this.config.urlPattern) {
                nextPageUrl = this.config.urlPattern.replace('{page}', toPage.toString());
            }
            else {
                // 自动检测URL模式
                const currentUrl = this.page.url();
                nextPageUrl = currentUrl.includes('page=')
                    ? currentUrl.replace(/page=\d+/, `page=${toPage}`)
                    : currentUrl.includes('?')
                        ? `${currentUrl}&page=${toPage}`
                        : `${currentUrl}?page=${toPage}`;
            }
            await this.page.goto(nextPageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            await this.page.waitForTimeout(this.config.pageDelay || 1000);
            const newContentLoaded = await this.checkNewContentLoaded();
            return {
                action: 'url_pagination',
                fromPage,
                toPage,
                success: true,
                newContentLoaded,
                contentMetrics: { nextPageUrl },
                loadTime: Date.now() - startTime
            };
        }
        catch (error) {
            throw new Error(`URL分页失败: ${error.message}`);
        }
    }
    async performLoadMorePagination() {
        try {
            const startTime = Date.now();
            const fromPage = this.currentPage;
            // 查找并点击加载更多按钮
            const loadMoreButton = await this.page.$(this.config.pageSelectors?.loadMoreButton || '.load-more, .more-button, [class*="load-more"]');
            if (!loadMoreButton) {
                return {
                    action: 'load_more_pagination',
                    fromPage,
                    toPage: fromPage,
                    success: false,
                    newContentLoaded: false,
                    contentMetrics: {},
                    loadTime: Date.now() - startTime,
                    stopReason: 'load_more_button_not_found'
                };
            }
            await this.safeClick(loadMoreButton, { container: this.containerSelector });
            await this.page.waitForTimeout(this.config.pageDelay || 2000);
            const newContentLoaded = await this.checkNewContentLoaded();
            return {
                action: 'load_more_pagination',
                fromPage,
                toPage: fromPage + 0.5, // 加载更多通常不改变页码
                success: true,
                newContentLoaded,
                contentMetrics: { fromPage },
                loadTime: Date.now() - startTime
            };
        }
        catch (error) {
            throw new Error(`加载更多分页失败: ${error.message}`);
        }
    }
    async performInfinitePagination() {
        try {
            const startTime = Date.now();
            const fromPage = this.currentPage;
            // 无限滚动分页
            await this.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await this.page.waitForTimeout(this.config.pageDelay || 2000);
            const newContentLoaded = await this.checkNewContentLoaded();
            return {
                action: 'infinite_pagination',
                fromPage,
                toPage: fromPage,
                success: true,
                newContentLoaded,
                contentMetrics: { fromPage },
                loadTime: Date.now() - startTime
            };
        }
        catch (error) {
            throw new Error(`无限分页失败: ${error.message}`);
        }
    }
    async performAutoModePagination() {
        // 自动模式：按优先级尝试不同的分页方式
        const strategies = [
            () => this.performButtonPagination(),
            () => this.performLoadMorePagination(),
            () => this.performUrlPagination(),
            () => this.performInfinitePagination()
        ];
        for (const strategy of strategies) {
            try {
                const result = await strategy();
                if (result.success) {
                    return result;
                }
            }
            catch (error) {
                console.warn('分页策略失败:', error.message);
            }
        }
        return {
            action: 'auto_pagination',
            fromPage: this.currentPage,
            toPage: this.currentPage,
            success: false,
            newContentLoaded: false,
            contentMetrics: {},
            loadTime: 0,
            stopReason: 'all_strategies_failed'
        };
    }
    // ==================== 停止条件检查 ====================
    shouldStopPagination() {
        const conditions = this.config.stopConditions || {};
        // 检查无新内容页数
        if (conditions.noNewContentPages && this.noNewContentPages > conditions.noNewContentPages) {
            return true;
        }
        // 检查最大页数
        if (this.config.maxPages && this.currentPage >= this.config.maxPages) {
            return true;
        }
        // 检查总页数
        if (conditions.maxPageNumber && this.currentPage >= conditions.maxPageNumber) {
            return true;
        }
        // 检查内容饱和度
        if (conditions.contentSaturation && this.calculateContentSaturation() > 0.9) {
            return true;
        }
        return false;
    }
    calculateContentSaturation() {
        // 计算内容饱和度：重复内容占比
        const totalContentCount = Array.from(this.pageMetrics.pageContentMap.values())
            .reduce((sum, page) => sum + (page.contentCount || 0), 0);
        const uniqueContentHashes = new Set(this.contentHashes.values()).size;
        const saturation = uniqueContentHashes / this.contentHashes.size;
        return isNaN(saturation) ? 0 : saturation;
    }
    determineStopReason() {
        const conditions = this.config.stopConditions || {};
        if (conditions.noNewContentPages && this.noNewContentPages > conditions.noNewContentPages) {
            return 'no_new_content_pages';
        }
        if (this.config.maxPages && this.currentPage >= this.config.maxPages) {
            return 'max_pages_reached';
        }
        if (conditions.maxPageNumber && this.currentPage >= conditions.maxPageNumber) {
            return 'max_page_number_reached';
        }
        if (conditions.contentSaturation && this.calculateContentSaturation() > 0.9) {
            return 'content_saturation_reached';
        }
        return 'unknown';
    }
    stopPagination(reason) {
        this.isPaginating = false;
        this.config.enableAutoPagination = false;
        console.log(`📄 分页已停止: ${reason}`);
    }
    // ==================== 辅助方法 ====================
    async checkNewContentLoaded() {
        try {
            const currentContent = await this.page.evaluate(() => {
                const elements = document.querySelectorAll('.Feed_body, .card-wrap, .article, .item');
                return {
                    count: elements.length,
                    hash: this.generateContentHash(elements)
                };
            });
            const previousContent = this.pageMetrics.pageContentMap.get(this.currentPage);
            if (!previousContent) {
                return true; // 首次加载视为新内容
            }
            const isNewContent = currentContent.hash !== previousContent.contentHash;
            if (isNewContent) {
                this.pageMetrics.pageContentMap.set(this.currentPage, {
                    contentCount: currentContent.count,
                    contentHash: currentContent.hash,
                    timestamp: Date.now()
                });
                this.noNewContentPages = 0;
            }
            else {
                this.noNewContentPages++;
            }
            return isNewContent;
        }
        catch (error) {
            return false;
        }
    }
    updatePageMetrics(result) {
        if (result.success) {
            this.currentPage = result.toPage;
            if (!this.pageMetrics.visitedPages.includes(this.currentPage)) {
                this.pageMetrics.visitedPages.push(this.currentPage);
            }
        }
        this.pageMetrics.totalPageLoadTime += result.loadTime;
        this.pageMetrics.averagePageLoadTime =
            this.pageMetrics.totalPageLoadTime / this.pageMetrics.visitedPages.length;
        this.pageHistory.push(result);
        if (this.pageHistory.length > 50) {
            this.pageHistory.shift(); // 保持历史记录在合理范围内
        }
    }
    analyzePageContent(data) {
        // 分析页面内容，检测重复和饱和度
        const duplicateRate = this.calculateContentSaturation();
        if (duplicateRate > 0.8) {
            this.pageMetrics.duplicateContentPages++;
        }
        this.emit('efficiency:changed', 1 - duplicateRate);
    }
    // ==================== 操作执行 ====================
    async executeNextPage(page, operation) {
        try {
            const result = await this.performAutoModePagination();
            return OperatorTypes_js_1.OperationResult.success({
                action: 'next_page',
                result: result.success ? 'success' : 'failed',
                message: result.success ? '下一页加载完成' : '下一页加载失败',
                paginationResult: result
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`下一页加载失败: ${error.message}`, error);
        }
    }
    async executePreviousPage(page, operation) {
        try {
            if (this.currentPage <= 1) {
                return OperatorTypes_js_1.OperationResult.success({
                    action: 'previous_page',
                    result: 'already_at_first',
                    message: '已在第一页'
                });
            }
            const targetPage = this.currentPage - 1;
            const result = await this.executeGotoPage(page, { pageNumber: targetPage });
            return result;
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`上一页加载失败: ${error.message}`, error);
        }
    }
    async executeGotoPage(page, operation) {
        try {
            const targetPage = operation.pageNumber;
            const startTime = Date.now();
            const fromPage = this.currentPage;
            // 使用URL模式跳转到指定页
            let targetUrl;
            if (this.config.urlPattern) {
                targetUrl = this.config.urlPattern.replace('{page}', targetPage.toString());
            }
            else {
                const currentUrl = page.url();
                targetUrl = currentUrl.includes('page=')
                    ? currentUrl.replace(/page=\d+/, `page=${targetPage}`)
                    : currentUrl.includes('?')
                        ? `${currentUrl}&page=${targetPage}`
                        : `${currentUrl}?page=${targetPage}`;
            }
            await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            await page.waitForTimeout(this.config.pageDelay || 1000);
            const newContentLoaded = await this.checkNewContentLoaded();
            return OperatorTypes_js_1.OperationResult.success({
                action: 'goto_page',
                result: 'success',
                message: `跳转到第${targetPage}页完成`,
                fromPage,
                toPage: targetPage,
                newContentLoaded,
                loadTime: Date.now() - startTime
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`跳转到指定页失败: ${error.message}`, error);
        }
    }
    async executeLoadMore(page, operation) {
        try {
            const result = await this.performLoadMorePagination();
            return OperatorTypes_js_1.OperationResult.success({
                action: 'load_more',
                result: result.success ? 'success' : 'failed',
                message: result.success ? '加载更多完成' : '加载更多失败',
                paginationResult: result
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`加载更多失败: ${error.message}`, error);
        }
    }
    async executeAnalyzePaginationState(page, operation) {
        try {
            const analysis = await this.analyzePaginationState();
            const metrics = {
                ...this.pageMetrics,
                currentAnalysis: analysis,
                efficiency: 1 - this.calculateContentSaturation()
            };
            return OperatorTypes_js_1.OperationResult.success({
                action: 'analyze_pagination_state',
                result: 'success',
                message: '分页状态分析完成',
                metrics
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`分页状态分析失败: ${error.message}`, error);
        }
    }
    async executeResetPagination(page, operation) {
        try {
            this.currentPage = this.config.startPage || 1;
            this.paginationAttempts = 0;
            this.noNewContentPages = 0;
            this.pageMetrics = {
                totalPages: 0,
                currentPage: this.currentPage,
                visitedPages: [this.currentPage],
                pageContentMap: new Map(),
                totalPageLoadTime: 0,
                averagePageLoadTime: 0,
                contentGrowthRate: 0,
                duplicateContentPages: 0
            };
            this.contentHashes.clear();
            this.pageHistory = [];
            return OperatorTypes_js_1.OperationResult.success({
                action: 'reset_pagination',
                result: 'success',
                message: '分页状态已重置'
            });
        }
        catch (error) {
            return OperatorTypes_js_1.OperationResult.failure(`重置分页状态失败: ${error.message}`, error);
        }
    }
    // ==================== 触发源处理 ====================
    async handleTriggerSpecificActions(trigger) {
        switch (trigger.type) {
            case 'initialization':
                console.log('🚀 分页容器初始化，准备自动分页...');
                this.pageLoadStartTime = Date.now();
                break;
            case 'mutation':
                console.log('👁️ 内容变化触发，检查是否需要分页...');
                break;
            case 'timer':
                console.log('⏰ 定时触发，维护分页状态...');
                break;
            case 'operation':
                console.log(`🎮 操作触发 [${trigger.source}]:`, trigger.data);
                break;
            case 'manual':
                console.log('👆 手动触发分页...');
                break;
        }
    }
    // ==================== 任务完成判断 ====================
    isPaginationTaskCompleted(result) {
        // 分页任务完成条件
        return this.shouldStopPagination() ||
            !this.config.enableAutoPagination ||
            this.paginationAttempts >= (this.config.maxPageAttempts || 20);
    }
    // ==================== 公共接口 ====================
    getPageMetrics() {
        return { ...this.pageMetrics };
    }
    getPaginationHistory() {
        return [...this.pageHistory];
    }
    async goToPage(pageNumber) {
        return await this.executeOperation('goto_page', { pageNumber });
    }
    async nextPage() {
        return await this.executeOperation('next_page', {});
    }
    async previousPage() {
        return await this.executeOperation('previous_page', {});
    }
    resetPaginationAttempts() {
        this.paginationAttempts = 0;
        this.noNewContentPages = 0;
        this.isPaginating = false;
        console.log('📄 重置分页尝试计数');
    }
    enableAutoPagination(enable = true) {
        this.config.enableAutoPagination = enable;
        console.log(`📄 自动分页已${enable ? '启用' : '禁用'}`);
    }
    // ==================== 清理资源 ====================
    async cleanup() {
        console.log(`🧹 清理微博分页容器: ${this.config.name}`);
        this.isPaginating = false;
        this.pageHistory = [];
        this.paginationAttempts = 0;
        this.noNewContentPages = 0;
        this.contentHashes.clear();
        this.pageMetrics.pageContentMap.clear();
        await super.cleanup();
    }
}
exports.WeiboPaginationContainer = WeiboPaginationContainer;
exports.default = WeiboPaginationContainer;
