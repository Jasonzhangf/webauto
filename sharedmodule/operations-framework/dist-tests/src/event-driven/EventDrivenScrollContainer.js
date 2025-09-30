/**
 * 事件驱动的滚动容器
 * 通过事件机制控制页面滚动和内容加载
 */
import { EventDrivenContainer } from './EventDrivenContainer';
export class EventDrivenScrollContainer extends EventDrivenContainer {
    constructor(config) {
        super(config);
        this.scrollInterval = null;
        this.isScrolling = false;
        this.noNewContentCount = 0;
        this.lastContentHeight = 0;
        this.scrollStartTime = 0;
        this.config = {
            ...config,
            scrollStrategy: config.scrollStrategy || 'smart',
            maxScrollAttempts: config.maxScrollAttempts || 30,
            scrollStep: config.scrollStep || 2,
            scrollDelay: config.scrollDelay || 1500,
            stopConditions: {
                maxScrollHeight: config.stopConditions?.maxScrollHeight || 50000,
                maxScrollTime: config.stopConditions?.maxScrollTime || 300000,
                noNewContentCount: config.stopConditions?.noNewContentCount || 5,
                reachBottom: config.stopConditions?.reachBottom ?? true,
                ...config.stopConditions
            }
        };
        this.scrollMetrics = this.initializeScrollMetrics();
    }
    // ==================== 生命周期方法 ====================
    async onInitialize() {
        this.setupScrollEventHandlers();
        this.scrollMetrics = this.initializeScrollMetrics();
    }
    async onStart() {
        // 启动滚动由事件触发
    }
    async onPause() {
        this.stopScrolling('paused');
    }
    async onResume() {
        // 恢复滚动由事件触发
    }
    async onStop() {
        this.stopScrolling('stopped');
    }
    async onDestroy() {
        this.stopScrolling('destroyed');
    }
    getExecutionResult() {
        return {
            success: this.state.errorCount === 0,
            scrollCount: this.scrollMetrics.scrollCount,
            contentHeight: this.scrollMetrics.scrollHeight,
            newContentFound: this.scrollMetrics.newContentFound,
            bottomReached: this.scrollMetrics.bottomReached,
            executionTime: Date.now() - this.scrollStartTime
        };
    }
    initializeStats() {
        return {
            scrollCount: 0,
            totalScrollHeight: 0,
            totalScrollTime: 0,
            newContentSessions: 0,
            bottomReached: false,
            averageScrollTime: 0
        };
    }
    // ==================== 滚动控制方法 ====================
    /**
     * 开始滚动
     */
    async startScrolling() {
        if (this.isScrolling)
            return;
        this.isScrolling = true;
        this.scrollStartTime = Date.now();
        this.noNewContentCount = 0;
        this.lastContentHeight = 0;
        this.emit('scroll:started', {
            containerId: this.config.id,
            startTime: this.scrollStartTime
        });
        // 根据滚动策略启动滚动
        switch (this.config.scrollStrategy) {
            case 'smart':
                await this.startSmartScrolling();
                break;
            case 'incremental':
                await this.startIncrementalScrolling();
                break;
            case 'continuous':
                await this.startContinuousScrolling();
                break;
            default:
                throw new Error(`Unknown scroll strategy: ${this.config.scrollStrategy}`);
        }
    }
    /**
     * 停止滚动
     */
    stopScrolling(reason) {
        if (!this.isScrolling)
            return;
        this.isScrolling = false;
        if (this.scrollInterval) {
            clearInterval(this.scrollInterval);
            this.scrollInterval = null;
        }
        this.emit('scroll:stopped', {
            containerId: this.config.id,
            reason,
            totalScrolls: this.scrollMetrics.scrollCount
        });
        // 更新统计信息
        this.state.stats.totalScrollTime += Date.now() - this.scrollStartTime;
        this.state.stats.bottomReached = this.scrollMetrics.bottomReached;
    }
    /**
     * 执行单次滚动
     */
    async performScrollStep() {
        if (!this.sharedSpace?.page) {
            throw new Error('Page not available');
        }
        try {
            // 执行滚动
            const result = await this.sharedSpace.page.evaluate((step, targetSelector) => {
                const target = targetSelector
                    ? document.querySelector(targetSelector)
                    : document.body;
                if (!target) {
                    return { success: false, error: 'Target element not found' };
                }
                const scrollTop = target.scrollTop;
                const scrollHeight = target.scrollHeight;
                const clientHeight = target.clientHeight;
                // 执行滚动
                target.scrollTop += step * window.innerHeight;
                return {
                    success: true,
                    scrollTop: target.scrollTop,
                    scrollHeight: target.scrollHeight,
                    clientHeight,
                    bottomReached: target.scrollTop + clientHeight >= scrollHeight - 50,
                    newContent: target.scrollHeight > scrollHeight
                };
            }, this.config.scrollStep, this.config.targetElement);
            if (!result.success) {
                throw new Error(result.error);
            }
            // 更新滚动指标
            this.scrollMetrics.scrollCount++;
            this.scrollMetrics.scrollTop = result.scrollTop;
            this.scrollMetrics.scrollHeight = result.scrollHeight;
            this.scrollMetrics.bottomReached = result.bottomReached;
            this.scrollMetrics.newContentFound = result.newContent;
            // 更新统计信息
            this.state.stats.scrollCount = this.scrollMetrics.scrollCount;
            this.state.stats.totalScrollHeight = this.scrollMetrics.scrollHeight;
            // 发射滚动进度事件
            this.emit('scroll:progress', {
                containerId: this.config.id,
                scrollCount: this.scrollMetrics.scrollCount,
                scrollHeight: this.scrollMetrics.scrollHeight,
                scrollTop: this.scrollMetrics.scrollTop,
                newContentFound: result.newContent
            });
            // 发射滚动步骤完成事件
            this.emit('scroll:step_completed', {
                containerId: this.config.id,
                step: this.scrollMetrics.scrollCount,
                success: true
            });
            // 检查是否到达底部
            if (result.bottomReached) {
                this.emit('scroll:bottom_reached', {
                    containerId: this.config.id,
                    totalScrollHeight: this.scrollMetrics.scrollHeight,
                    scrollTime: Date.now() - this.scrollStartTime
                });
                this.stopScrolling('bottom_reached');
            }
            // 检查是否有新内容
            if (result.newContent) {
                this.noNewContentCount = 0;
                this.state.stats.newContentSessions++;
            }
            else {
                this.noNewContentCount++;
            }
            return this.scrollMetrics;
        }
        catch (error) {
            this.emit('scroll:error', {
                containerId: this.config.id,
                error: error instanceof Error ? error.message : String(error),
                scrollCount: this.scrollMetrics.scrollCount
            });
            throw error;
        }
    }
    // ==================== 滚动策略实现 ====================
    /**
     * 智能滚动策略
     */
    async startSmartScrolling() {
        this.scrollInterval = setInterval(async () => {
            if (!this.isScrolling)
                return;
            // 检查停止条件
            if (this.shouldStopScrolling()) {
                this.stopScrolling('conditions_met');
                return;
            }
            // 执行滚动步骤
            await this.performScrollStep();
            // 等待内容加载
            await this.waitForContentLoad();
        }, this.config.scrollDelay);
    }
    /**
     * 增量滚动策略
     */
    async startIncrementalScrolling() {
        this.scrollInterval = setInterval(async () => {
            if (!this.isScrolling)
                return;
            if (this.shouldStopScrolling()) {
                this.stopScrolling('conditions_met');
                return;
            }
            await this.performScrollStep();
            await this.waitForContentLoad();
        }, this.config.scrollDelay);
    }
    /**
     * 连续滚动策略
     */
    async startContinuousScrolling() {
        const scrollStep = async () => {
            if (!this.isScrolling)
                return;
            if (this.shouldStopScrolling()) {
                this.stopScrolling('conditions_met');
                return;
            }
            await this.performScrollStep();
            // 继续下一步滚动
            setTimeout(scrollStep, 100);
        };
        scrollStep();
    }
    // ==================== 条件检查方法 ====================
    /**
     * 检查是否应该停止滚动
     */
    shouldStopScrolling() {
        // 检查最大滚动次数
        if (this.scrollMetrics.scrollCount >= this.config.maxScrollAttempts) {
            return true;
        }
        // 检查最大滚动时间
        if (Date.now() - this.scrollStartTime >= this.config.stopConditions.maxScrollTime) {
            return true;
        }
        // 检查最大滚动高度
        if (this.scrollMetrics.scrollHeight >= this.config.stopConditions.maxScrollHeight) {
            return true;
        }
        // 检查无新内容次数
        if (this.noNewContentCount >= this.config.stopConditions.noNewContentCount) {
            this.emit('scroll:no_new_content', {
                containerId: this.config.id,
                consecutiveCount: this.noNewContentCount,
                lastContentTime: Date.now()
            });
            return true;
        }
        // 检查是否到达底部
        if (this.scrollMetrics.bottomReached && this.config.stopConditions.reachBottom) {
            return true;
        }
        return false;
    }
    /**
     * 等待内容加载
     */
    async waitForContentLoad() {
        await new Promise(resolve => setTimeout(resolve, this.config.scrollDelay));
    }
    // ==================== 事件处理方法 ====================
    /**
     * 设置滚动事件处理器
     */
    setupScrollEventHandlers() {
        // 监听内容变化事件
        this.on('content:new_content_loaded', (data) => {
            this.handleNewContentLoaded(data);
        });
        // 监听滚动启动事件
        this.on('scroll:started', () => {
            this.handleScrollStarted();
        });
        // 监听滚动停止事件
        this.on('scroll:stopped', (data) => {
            this.handleScrollStopped(data);
        });
        // 监听到底事件
        this.on('scroll:bottom_reached', () => {
            this.handleBottomReached();
        });
        // 监听无新内容事件
        this.on('scroll:no_new_content', (data) => {
            this.handleNoNewContent(data);
        });
    }
    /**
     * 处理新内容加载
     */
    handleNewContentLoaded(data) {
        this.lastContentHeight = data.contentSize || 0;
        this.noNewContentCount = 0;
    }
    /**
     * 处理滚动开始
     */
    handleScrollStarted() {
        this.scrollMetrics = this.initializeScrollMetrics();
        this.scrollStartTime = Date.now();
    }
    /**
     * 处理滚动停止
     */
    handleScrollStopped(data) {
        const executionTime = Date.now() - this.scrollStartTime;
        this.state.stats.totalScrollTime += executionTime;
        if (this.state.stats.scrollCount > 0) {
            this.state.stats.averageScrollTime =
                this.state.stats.totalScrollTime / this.state.stats.scrollCount;
        }
    }
    /**
     * 处理到达底部
     */
    handleBottomReached() {
        this.state.stats.bottomReached = true;
        this.stopScrolling('bottom_reached');
    }
    /**
     * 处理无新内容
     */
    handleNoNewContent(data) {
        this.noNewContentCount = data.consecutiveCount;
        if (this.noNewContentCount >= this.config.stopConditions.noNewContentCount) {
            this.stopScrolling('no_new_content');
        }
    }
    // ==================== 辅助方法 ====================
    /**
     * 初始化滚动指标
     */
    initializeScrollMetrics() {
        return {
            scrollCount: 0,
            scrollHeight: 0,
            scrollTop: 0,
            scrollTime: 0,
            newContentFound: false,
            bottomReached: false
        };
    }
    /**
     * 获取滚动指标
     */
    getScrollMetrics() {
        return { ...this.scrollMetrics };
    }
    /**
     * 检查是否正在滚动
     */
    isScrollingActive() {
        return this.isScrolling;
    }
    /**
     * 获取无新内容计数
     */
    getNoNewContentCount() {
        return this.noNewContentCount;
    }
    /**
     * 重置滚动状态
     */
    resetScrollState() {
        this.scrollMetrics = this.initializeScrollMetrics();
        this.noNewContentCount = 0;
        this.lastContentHeight = 0;
        this.scrollStartTime = 0;
    }
}
//# sourceMappingURL=EventDrivenScrollContainer.js.map