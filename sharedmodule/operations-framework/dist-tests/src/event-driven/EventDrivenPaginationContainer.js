/**
 * 事件驱动的分页容器
 * 通过事件机制控制页面分页和导航
 */
import { EventDrivenContainer } from './EventDrivenContainer';
export class EventDrivenPaginationContainer extends EventDrivenContainer {
    constructor(config) {
        super(config);
        this.currentPage = 1;
        this.pageHistory = [];
        this.isPaginating = false;
        this.noNewContentCount = 0;
        this.paginationStartTime = 0;
        this.config = {
            ...config,
            paginationMode: config.paginationMode || 'button',
            maxPageAttempts: config.maxPageAttempts || 20,
            pageDelay: config.pageDelay || 2000,
            maxPages: config.maxPages || 10,
            urlPattern: config.urlPattern || '',
            pageSelectors: {
                nextButton: config.pageSelectors?.nextButton || '.next, .page-next, [class*="next"]',
                prevButton: config.pageSelectors?.prevButton || '.prev, .page-prev, [class*="prev"]',
                loadMoreButton: config.pageSelectors?.loadMoreButton || '.load-more, .more-button, [class*="load-more"]',
                currentPageIndicator: config.pageSelectors?.currentPageIndicator || '.current, .active, [class*="current"]',
                totalPagesIndicator: config.pageSelectors?.totalPagesIndicator || '.total-pages, [class*="total"]',
                ...config.pageSelectors
            },
            stopConditions: {
                noNewContentPages: config.stopConditions?.noNewContentPages || 3,
                reachLastPage: config.stopConditions?.reachLastPage ?? true,
                maxPageNumber: config.stopConditions?.maxPageNumber || 10,
                ...config.stopConditions
            }
        };
    }
    // ==================== 生命周期方法 ====================
    async onInitialize() {
        this.setupPaginationEventHandlers();
        this.paginationStartTime = Date.now();
        this.currentPage = 1;
    }
    async onStart() {
        // 分页启动由事件触发
    }
    async onPause() {
        this.stopPagination('paused');
    }
    async onResume() {
        // 恢复分页由事件触发
    }
    async onStop() {
        this.stopPagination('stopped');
    }
    async onDestroy() {
        this.stopPagination('destroyed');
    }
    getExecutionResult() {
        return {
            success: this.state.errorCount === 0,
            totalPages: this.pageHistory.length,
            currentPage: this.currentPage,
            pageHistory: [...this.pageHistory],
            executionTime: Date.now() - this.paginationStartTime
        };
    }
    initializeStats() {
        return {
            totalPages: 0,
            currentPage: 1,
            buttonClicks: 0,
            urlNavigations: 0,
            loadMoreClicks: 0,
            averagePageLoadTime: 0,
            lastPageReached: false,
            totalPageLoadTime: 0
        };
    }
    // ==================== 分页控制方法 ====================
    /**
     * 开始分页
     */
    async startPagination() {
        if (this.isPaginating)
            return;
        this.isPaginating = true;
        this.currentPage = 1;
        this.noNewContentCount = 0;
        this.pageHistory = [];
        this.emit('pagination:started', {
            containerId: this.config.id,
            startTime: this.paginationStartTime
        });
        // 根据分页模式开始分页
        switch (this.config.paginationMode) {
            case 'button':
                await this.startButtonPagination();
                break;
            case 'url':
                await this.startUrlPagination();
                break;
            case 'load-more':
                await this.startLoadMorePagination();
                break;
            case 'infinite':
                await this.startInfinitePagination();
                break;
            default:
                throw new Error(`Unknown pagination mode: ${this.config.paginationMode}`);
        }
    }
    /**
     * 停止分页
     */
    stopPagination(reason) {
        if (!this.isPaginating)
            return;
        this.isPaginating = false;
        this.emit('pagination:stopped', {
            containerId: this.config.id,
            reason,
            totalPages: this.pageHistory.length
        });
        // 更新统计信息
        this.state.stats.lastPageReached = this.hasReachedLastPage();
    }
    /**
     * 导航到下一页
     */
    async goToNextPage() {
        if (!this.sharedSpace?.page) {
            throw new Error('Page not available');
        }
        try {
            let success = false;
            switch (this.config.paginationMode) {
                case 'button':
                    success = await this.clickNextButton();
                    break;
                case 'url':
                    success = await this.navigateToNextUrl();
                    break;
                case 'load-more':
                    success = await this.clickLoadMoreButton();
                    break;
                case 'infinite':
                    success = await this.triggerInfiniteScroll();
                    break;
                default:
                    throw new Error(`Unknown pagination mode: ${this.config.paginationMode}`);
            }
            if (success) {
                await this.handlePageNavigation();
            }
            return success;
        }
        catch (error) {
            this.emit('pagination:error', {
                containerId: this.config.id,
                error: error instanceof Error ? error.message : String(error),
                currentPage: this.currentPage
            });
            return false;
        }
    }
    // ==================== 分页模式实现 ====================
    /**
     * 按钮分页模式
     */
    async startButtonPagination() {
        const paginationLoop = async () => {
            if (!this.isPaginating)
                return;
            if (this.shouldStopPagination()) {
                this.stopPagination('conditions_met');
                return;
            }
            const success = await this.clickNextButton();
            if (success) {
                await this.handlePageNavigation();
            }
            else {
                this.stopPagination('next_button_not_found');
                return;
            }
            // 继续下一页
            setTimeout(paginationLoop, this.config.pageDelay);
        };
        paginationLoop();
    }
    /**
     * URL分页模式
     */
    async startUrlPagination() {
        const paginationLoop = async () => {
            if (!this.isPaginating)
                return;
            if (this.shouldStopPagination()) {
                this.stopPagination('conditions_met');
                return;
            }
            const success = await this.navigateToNextUrl();
            if (success) {
                await this.handlePageNavigation();
            }
            else {
                this.stopPagination('url_navigation_failed');
                return;
            }
            // 继续下一页
            setTimeout(paginationLoop, this.config.pageDelay);
        };
        paginationLoop();
    }
    /**
     * 加载更多分页模式
     */
    async startLoadMorePagination() {
        const paginationLoop = async () => {
            if (!this.isPaginating)
                return;
            if (this.shouldStopPagination()) {
                this.stopPagination('conditions_met');
                return;
            }
            const success = await this.clickLoadMoreButton();
            if (success) {
                await this.handlePageNavigation();
            }
            else {
                this.stopPagination('load_more_button_not_found');
                return;
            }
            // 继续下一页
            setTimeout(paginationLoop, this.config.pageDelay);
        };
        paginationLoop();
    }
    /**
     * 无限滚动分页模式
     */
    async startInfinitePagination() {
        const paginationLoop = async () => {
            if (!this.isPaginating)
                return;
            if (this.shouldStopPagination()) {
                this.stopPagination('conditions_met');
                return;
            }
            const success = await this.triggerInfiniteScroll();
            if (success) {
                await this.handlePageNavigation();
            }
            else {
                this.stopPagination('infinite_scroll_failed');
                return;
            }
            // 继续下一页
            setTimeout(paginationLoop, this.config.pageDelay);
        };
        paginationLoop();
    }
    // ==================== 分页操作方法 ====================
    /**
     * 点击下一页按钮
     */
    async clickNextButton() {
        const selector = this.config.pageSelectors.nextButton;
        try {
            const button = await this.sharedSpace.page.$(selector);
            if (!button)
                return false;
            // 检查按钮是否可点击
            const isVisible = await button.isVisible();
            const isEnabled = await button.isEnabled();
            if (!isVisible || !isEnabled)
                return false;
            // 点击按钮
            await button.click();
            this.state.stats.buttonClicks++;
            this.emit('pagination:button_clicked', {
                containerId: this.config.id,
                buttonType: 'next',
                success: true
            });
            return true;
        }
        catch (error) {
            this.emit('pagination:button_clicked', {
                containerId: this.config.id,
                buttonType: 'next',
                success: false
            });
            return false;
        }
    }
    /**
     * 导航到下一个URL
     */
    async navigateToNextUrl() {
        if (!this.config.urlPattern)
            return false;
        const nextUrl = this.config.urlPattern
            .replace('{page}', String(this.currentPage + 1))
            .replace('{pageNum}', String(this.currentPage + 1));
        try {
            await this.sharedSpace.page.goto(nextUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            this.state.stats.urlNavigations++;
            this.currentPage++;
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * 点击加载更多按钮
     */
    async clickLoadMoreButton() {
        const selector = this.config.pageSelectors.loadMoreButton;
        try {
            const button = await this.sharedSpace.page.$(selector);
            if (!button)
                return false;
            const isVisible = await button.isVisible();
            const isEnabled = await button.isEnabled();
            if (!isVisible || !isEnabled)
                return false;
            await button.click();
            this.state.stats.loadMoreClicks++;
            this.currentPage++;
            this.emit('pagination:button_clicked', {
                containerId: this.config.id,
                buttonType: 'load-more',
                success: true
            });
            return true;
        }
        catch (error) {
            this.emit('pagination:button_clicked', {
                containerId: this.config.id,
                buttonType: 'load-more',
                success: false
            });
            return false;
        }
    }
    /**
     * 触发无限滚动
     */
    async triggerInfiniteScroll() {
        try {
            // 滚动到页面底部
            await this.sharedSpace.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            // 等待内容加载
            await new Promise(resolve => setTimeout(resolve, this.config.pageDelay));
            this.currentPage++;
            return true;
        }
        catch (error) {
            return false;
        }
    }
    // ==================== 条件检查方法 ====================
    /**
     * 检查是否应该停止分页
     */
    shouldStopPagination() {
        // 检查最大页数
        if (this.pageHistory.length >= this.config.maxPages) {
            return true;
        }
        // 检查最大页码
        if (this.currentPage >= this.config.stopConditions.maxPageNumber) {
            return true;
        }
        // 检查是否到达最后一页
        if (this.hasReachedLastPage() && this.config.stopConditions.reachLastPage) {
            this.emit('pagination:last_page_reached', {
                containerId: this.config.id,
                lastPageNumber: this.currentPage
            });
            return true;
        }
        // 检查无新内容页数
        if (this.noNewContentCount >= this.config.stopConditions.noNewContentPages) {
            this.emit('pagination:no_new_pages', {
                containerId: this.config.id,
                consecutiveCount: this.noNewContentCount,
                lastPageNumber: this.currentPage
            });
            return true;
        }
        return false;
    }
    /**
     * 检查是否到达最后一页
     */
    async hasReachedLastPage() {
        if (!this.sharedSpace?.page)
            return false;
        try {
            // 检查下一页按钮是否存在且可点击
            const nextButton = await this.sharedSpace.page.$(this.config.pageSelectors.nextButton);
            if (nextButton) {
                const isVisible = await nextButton.isVisible();
                const isEnabled = await nextButton.isEnabled();
                if (isVisible && isEnabled)
                    return false;
            }
            // 检查加载更多按钮是否存在且可点击
            const loadMoreButton = await this.sharedSpace.page.$(this.config.pageSelectors.loadMoreButton);
            if (loadMoreButton) {
                const isVisible = await loadMoreButton.isVisible();
                const isEnabled = await loadMoreButton.isEnabled();
                if (isVisible && isEnabled)
                    return false;
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * 处理页面导航
     */
    async handlePageNavigation() {
        const startTime = Date.now();
        // 等待页面加载
        await this.sharedSpace.page.waitForLoadState('domcontentloaded');
        await new Promise(resolve => setTimeout(resolve, this.config.pageDelay));
        // 记录页面信息
        const pageData = {
            pageNumber: this.currentPage,
            url: this.sharedSpace.page.url(),
            title: await this.sharedSpace.page.title(),
            loadTime: Date.now() - startTime,
            contentSize: await this.getPageSize(),
            isLastPage: await this.hasReachedLastPage()
        };
        this.pageHistory.push(pageData);
        // 更新统计信息
        this.state.stats.totalPages = this.pageHistory.length;
        this.state.stats.currentPage = this.currentPage;
        this.state.stats.totalPageLoadTime += pageData.loadTime;
        if (this.state.stats.totalPages > 0) {
            this.state.stats.averagePageLoadTime =
                this.state.stats.totalPageLoadTime / this.state.stats.totalPages;
        }
        // 发射页面加载事件
        this.emit('pagination:page_loaded', {
            containerId: this.config.id,
            pageNumber: this.currentPage,
            url: pageData.url,
            isLastPage: pageData.isLastPage
        });
        // 检查是否有新内容
        if (this.hasNewContent(pageData)) {
            this.noNewContentCount = 0;
        }
        else {
            this.noNewContentCount++;
        }
    }
    /**
     * 获取页面大小
     */
    async getPageSize() {
        if (!this.sharedSpace?.page)
            return 0;
        try {
            return await this.sharedSpace.page.evaluate(() => {
                return document.body?.scrollHeight || 0;
            });
        }
        catch {
            return 0;
        }
    }
    /**
     * 检查是否有新内容
     */
    hasNewContent(currentPage) {
        if (this.pageHistory.length < 2)
            return true;
        const previousPage = this.pageHistory[this.pageHistory.length - 2];
        return currentPage.contentSize !== previousPage.contentSize;
    }
    // ==================== 事件处理方法 ====================
    /**
     * 设置分页事件处理器
     */
    setupPaginationEventHandlers() {
        // 监听链接目标达到事件
        this.on('links:target_reached', () => {
            this.handleLinkTargetReached();
        });
        // 监听滚动到底部事件
        this.on('scroll:bottom_reached', () => {
            this.handleScrollBottomReached();
        });
        // 监听无新内容事件
        this.on('scroll:no_new_content', (data) => {
            this.handleNoNewContent(data);
        });
    }
    /**
     * 处理链接目标达到
     */
    handleLinkTargetReached() {
        this.stopPagination('link_target_reached');
    }
    /**
     * 处理滚动到底部
     */
    handleScrollBottomReached() {
        // 在无限滚动模式下，这可能会触发分页
        if (this.config.paginationMode === 'infinite' && this.isPaginating) {
            // 这里可以触发分页逻辑
        }
    }
    /**
     * 处理无新内容
     */
    handleNoNewContent(data) {
        if (data.consecutiveCount >= 3) {
            this.noNewContentCount = data.consecutiveCount;
        }
    }
    // ==================== 公共接口 ====================
    /**
     * 获取页面历史
     */
    getPageHistory() {
        return [...this.pageHistory];
    }
    /**
     * 获取当前页码
     */
    getCurrentPage() {
        return this.currentPage;
    }
    /**
     * 检查是否正在分页
     */
    isPaginatingActive() {
        return this.isPaginating;
    }
    /**
     * 获取分页统计
     */
    getPaginationStats() {
        return {
            ...this.state.stats,
            noNewContentCount: this.noNewContentCount,
            isLastPage: this.hasReachedLastPage()
        };
    }
    /**
     * 导出页面历史
     */
    exportPageHistory(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this.pageHistory, null, 2);
        }
        else {
            const headers = ['pageNumber', 'url', 'title', 'loadTime', 'contentSize', 'isLastPage'];
            const rows = this.pageHistory.map(page => [
                page.pageNumber,
                page.url,
                page.title || '',
                page.loadTime,
                page.contentSize,
                page.isLastPage
            ]);
            return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        }
    }
}
//# sourceMappingURL=EventDrivenPaginationContainer.js.map