/**
 * 微博滚动控制容器实现
 * 专门处理页面滚动操作和无限滚动内容加载
 */

import { BaseSelfRefreshingContainer, ContainerConfig, RefreshTrigger } from './BaseSelfRefreshingContainer';
import { UniversalOperator, OperationResult } from '../core/UniversalOperator';

// ==================== 接口定义 ====================

export interface WeiboScrollConfig extends ContainerConfig {
  maxScrollAttempts?: number;
  scrollStep?: number;
  scrollDelay?: number;
  enableAutoScroll?: boolean;
  scrollStrategy?: 'continuous' | 'incremental' | 'smart';
  stopConditions?: {
    maxScrollHeight?: number;
    maxScrollTime?: number;
    noNewContentCount?: number;
    reachBottom?: boolean;
  };
  targetElement?: string;
}

export interface ScrollMetrics {
  totalScrolls: number;
  totalDistance: number;
  scrollTime: number;
  newContentCount: number;
  lastContentUpdate: number;
  scrollPattern: 'increasing' | 'decreasing' | 'stable';
  efficiency: number;
}

export interface ScrollResult {
  action: string;
  scrollCount: number;
  scrollDistance: number;
  newContentLoaded: boolean;
  contentMetrics: any;
  scrollMetrics: ScrollMetrics;
  stopReason?: string;
}

// ==================== 容器实现 ====================

export class WeiboScrollContainer extends BaseSelfRefreshingContainer {
  protected config: WeiboScrollConfig;
  protected scrollMetrics: ScrollMetrics;
  protected scrollAttempts = 0;
  protected lastScrollHeight = 0;
  protected lastContentHash = '';
  protected noNewContentCount = 0;
  protected isScrolling = false;
  protected scrollStartTime = 0;
  protected scrollHistory: ScrollResult[] = [];

  constructor(config: WeiboScrollConfig) {
    super({
      refreshInterval: 1000,
      enableAutoRefresh: false,
      enableMutationObserver: true,
      maxRefreshRetries: 2,
      debounceTime: 500,
      childContainerTypes: [],
      taskCompletionCriteria: {
        type: 'condition',
        condition: (result: any) => this.isScrollTaskCompleted(result)
      },
      ...config
    });

    this.config = config;
    this.scrollMetrics: 0
    };
    this.setupScrollSpecificHandlers( = {
      totalScrolls: 0,
      totalDistance: 0,
      scrollTime: 0,
      newContentCount: 0,
      lastContentUpdate: 0,
      scrollPattern: 'stable',
      efficiency);
  }
    lastContentHash: any;
    noNewContentCount: any;
    lastScrollHeight: any;
    isScrolling: any;
    scrollStartTime: any;

  private setupScrollSpecificHandlers(): void {
    // 监听滚动操作完成
    this.on('scroll:completed', (data: ScrollResult) => {
      console.log(`📜 滚动完成: ${data.scrollCount}次, 距离${data.scrollDistance}px, 新内容${data.newContentLoaded ? '是' : '否'}`);
      this.updateScrollMetrics(data);
    });

    // 监听滚动停止
    this.on('scroll:stopped', (reason) => {
      console.log(`📜 滚动停止: ${reason}`);
      this.stopScrolling(reason);
    });

    // 监听内容变化
    this.on('content:changed', (data) => {
      console.log(`📄 内容变化检测: 新增${data.newElements}个元素`);
      this.handleContentChange(data);
    });

    // 监听滚动效率变化
    this.on('efficiency:changed', (efficiency) => {
      console.log(`📊 滚动效率: ${(efficiency * 100).toFixed(1)}%`);
      this.scrollMetrics.efficiency = efficiency;
    });
  }

  // ==================== 抽象方法实现 ====================

  protected setPageContext(page: any): void {
    this.page = page;
  }

  protected async executeWithContext<T>(fn: (page: any) => Promise<T>): Promise<T> {
    if (!this.page) {
      throw new Error('页面上下文未设置');
    }
    return await fn(this.page);
  }

  protected async createChildContainer(childInfo: any): Promise<BaseSelfRefreshingContainer> {
    // 滚动容器通常不需要子容器
    throw new Error('滚动容器不支持子容器');
  }

  protected async executeDynamicOperation(page: any, operation: any, params: any): Promise<OperationResult> {
    switch (operation.action) {
      case 'scroll_smooth':
        return await this.executeScrollSmooth(page, operation);
      case 'scroll_instant':
        return await this.executeScrollInstant(page, operation);
      case 'scroll_to_element':
        return await this.executeScrollToElement(page, operation);
      case 'scroll_to_bottom':
        return await this.executeScrollToBottom(page, operation);
      case 'analyze_scroll_performance':
        return await this.executeAnalyzeScrollPerformance(page, operation);
      case 'reset_scroll_metrics':
        return await this.executeResetScrollMetrics(page, operation);
      default:
        return OperationResult.failure(`不支持的操作: ${operation.action}`);
    }
  }

  // ==================== 核心刷新逻辑 ====================

  protected async performRefresh(trigger: RefreshTrigger): Promise<OperationResult> {
    console.log(`🔄 执行滚动容器刷新 [${trigger.type}]: ${this.config.name}`);

    try {
      // 1. 检测容器状态
      const stateUpdate = await this.detectContainerState(this.page);
      this.updateState(stateUpdate);

      // 2. 如果容器不存在，跳过刷新
      if (!stateUpdate.exists) {
        return OperationResult.success({
          action: 'refresh',
          result: 'container_not_found',
          message: '滚动容器不存在'
        });
      }

      // 3. 分析当前滚动状态
      const scrollAnalysis = await this.analyzeScrollState();
      this.updateScrollAnalysis(scrollAnalysis);

      // 4. 注册动态操作
      await this.registerDynamicOperations(this.page);

      // 5. 根据触发源执行滚动
      if (this.shouldAutoScroll(trigger)) {
        await this.performAutoScroll();
      }

      // 6. 检查停止条件
      if (this.shouldStopScrolling()) {
        const stopReason = this.determineStopReason();
        this.emit('scroll:stopped', stopReason);
      }

      return OperationResult.success({
        action: 'refresh',
        trigger: trigger.type,
        scrollMetrics: this.scrollMetrics,
        scrollAttempts: this.scrollAttempts,
        taskProgress: this.taskProgress,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`滚动容器刷新失败 [${trigger.type}]:`, error);
      return OperationResult.failure(`刷新失败: ${error.message}`, error);
    }
  }

  // ==================== 滚动分析 ====================

  private async analyzeScrollState(): Promise<any> {
    try {
      const analysis = await this.page.evaluate(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY;
        const clientHeight = window.innerHeight;
        const scrollPercentage = (scrollTop / (scrollHeight - clientHeight)) * 100;

        // 分析页面内容结构
        const feedElements = document.querySelectorAll('.Feed_body, .card-wrap, .article');
        const contentElements = document.querySelectorAll('p, .content, .text');

        return {
          scrollHeight,
          scrollTop,
          clientHeight,
          scrollPercentage,
          feedCount: feedElements.length,
          contentCount: contentElements.length,
          isNearBottom: scrollPercentage > 80,
          isAtBottom: scrollPercentage >= 99,
          contentHash: this.generateContentHash(contentElements)
        };
      });

      return analysis;

    } catch (error) {
      throw new Error(`滚动状态分析失败: ${error.message}`);
    }
  }

  private updateScrollAnalysis(analysis: any): void {
    // 检测新内容
    if (analysis.contentHash !== this.lastContentHash) {
      this.lastContentHash = analysis.contentHash;
      this.scrollMetrics.newContentCount++;
      this.scrollMetrics.lastContentUpdate = Date.now();
      this.noNewContentCount = 0;

      this.emit('content:changed', {
        newElements: analysis.feedCount,
        contentHash: analysis.contentHash,
        timestamp: Date.now()
      });
    } else {
      this.noNewContentCount++;
    }

    // 更新滚动高度
    if (analysis.scrollHeight > this.lastScrollHeight) {
      this.lastScrollHeight = analysis.scrollHeight;
    }

    // 分析滚动模式
    this.analyzeScrollPattern(analysis);
  }

  private analyzeScrollPattern(analysis: any): void {
    if (this.scrollHistory.length < 3) {
      this.scrollMetrics.scrollPattern = 'stable';
      return;
    }

    const recentScrolls = this.scrollHistory.slice(-3);
    const distances = recentScrolls.map(s => s.scrollDistance);

    if (distances.every((d, i) => i === 0 || d >= distances[i - 1])) {
      this.scrollMetrics.scrollPattern = 'increasing';
    } else if (distances.every((d, i) => i === 0 || d <= distances[i - 1])) {
      this.scrollMetrics.scrollPattern = 'decreasing';
    } else {
      this.scrollMetrics.scrollPattern = 'stable';
    }

    // 计算滚动效率
    const efficiency = this.calculateScrollEfficiency();
    if (efficiency !== this.scrollMetrics.efficiency) {
      this.emit('efficiency:changed', efficiency);
    }
  }

  private calculateScrollEfficiency(): number {
    if (this.scrollMetrics.totalScrolls === 0) return 0;

    const successfulScrolls = this.scrollHistory.filter(s => s.newContentLoaded).length;
    return successfulScrolls / this.scrollMetrics.totalScrolls;
  }

  // ==================== 自动滚动逻辑 ====================

  private shouldAutoScroll(trigger: RefreshTrigger): boolean {
    // 检查是否启用自动滚动
    if (!this.config.enableAutoScroll) {
      return false;
    }

    // 检查是否正在滚动
    if (this.isScrolling) {
      return false;
    }

    // 检查滚动尝试次数
    if (this.scrollAttempts >= (this.config.maxScrollAttempts || 50)) {
      console.log('📜 已达到最大滚动尝试次数');
      return false;
    }

    // 检查停止条件
    if (this.shouldStopScrolling()) {
      return false;
    }

    // 只在特定触发源下自动滚动
    return ['initialization', 'timer', 'mutation'].includes(trigger.type);
  }

  private async performAutoScroll(): Promise<void> {
    if (this.isScrolling) return;

    this.isScrolling = true;
    this.scrollStartTime = Date.now();

    try {
      console.log(`📜 开始自动滚动 (尝试 ${this.scrollAttempts + 1}/${this.config.maxScrollAttempts})`);

      let scrollResult: ScrollResult;
      const strategy = this.config.scrollStrategy || 'smart';

      switch (strategy) {
        case 'continuous':
          scrollResult = await this.performContinuousScroll();
          break;
        case 'incremental':
          scrollResult = await this.performIncrementalScroll();
          break;
        case 'smart':
        default:
          scrollResult = await this.performSmartScroll();
          break;
      }

      this.scrollAttempts++;
      this.emit('scroll:completed', scrollResult);

      // 检查是否需要停止
      if (scrollResult.stopReason) {
        this.stopScrolling(scrollResult.stopReason);
      }

    } catch (error) {
      console.error('自动滚动失败:', error);
      this.scrollAttempts++;
    } finally {
      this.isScrolling = false;
    }
  }

  private async performContinuousScroll(): Promise<ScrollResult> {
    try {
      const startTime = Date.now();
      const startHeight = await this.getCurrentScrollHeight();

      // 连续滚动到底部
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await this.page.waitForTimeout(this.config.scrollDelay || 2000);

      const endHeight = await this.getCurrentScrollHeight();
      const newContentLoaded = endHeight > startHeight;

      return {
        action: 'continuous_scroll',
        scrollCount: 1,
        scrollDistance: endHeight - startHeight,
        newContentLoaded,
        contentMetrics: { startHeight, endHeight },
        scrollMetrics: this.scrollMetrics,
        stopReason: newContentLoaded ? undefined : 'no_new_content'
      };

    } catch (error) {
      throw new Error(`连续滚动失败: ${error.message}`);
    }
  }

  private async performIncrementalScroll(): Promise<ScrollResult> {
    try {
      const startTime = Date.now();
      const startHeight = await this.getCurrentScrollHeight();
      const scrollStep = this.config.scrollStep || 3;
      let totalDistance = 0;

      // 分步滚动
      for (let i = 0; i < scrollStep; i++) {
        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
        totalDistance += window.innerHeight;
        await this.page.waitForTimeout(500);
      }

      const endHeight = await this.getCurrentScrollHeight();
      const newContentLoaded = endHeight > startHeight;

      return {
        action: 'incremental_scroll',
        scrollCount: scrollStep,
        scrollDistance: totalDistance,
        newContentLoaded,
        contentMetrics: { startHeight, endHeight },
        scrollMetrics: this.scrollMetrics,
        stopReason: newContentLoaded ? undefined : 'no_new_content'
      };

    } catch (error) {
      throw new Error(`增量滚动失败: ${error.message}`);
    }
  }

  private async performSmartScroll(): Promise<ScrollResult> {
    try {
      const startTime = Date.now();
      const startHeight = await this.getCurrentScrollHeight();

      // 智能滚动：根据内容密度调整
      const contentDensity = await this.analyzeContentDensity();
      const scrollStep = this.calculateSmartScrollStep(contentDensity);

      let totalDistance = 0;
      for (let i = 0; i < scrollStep.count; i++) {
        await this.page.evaluate((distance) => {
          window.scrollBy(0, distance);
        }, scrollStep.distance);
        totalDistance += scrollStep.distance;
        await this.page.waitForTimeout(scrollStep.delay);
      }

      const endHeight = await this.getCurrentScrollHeight();
      const newContentLoaded = endHeight > startHeight;

      return {
        action: 'smart_scroll',
        scrollCount: scrollStep.count,
        scrollDistance: totalDistance,
        newContentLoaded,
        contentMetrics: {
          startHeight,
          endHeight,
          contentDensity,
          scrollStep
        },
        scrollMetrics: this.scrollMetrics,
        stopReason: newContentLoaded ? undefined : 'no_new_content'
      };

    } catch (error) {
      throw new Error(`智能滚动失败: ${error.message}`);
    }
  }

  private async analyzeContentDensity(): Promise<number> {
    try {
      const density = await this.page.evaluate(() => {
        const viewportHeight = window.innerHeight;
        const totalHeight = document.documentElement.scrollHeight;
        const contentElements = document.querySelectorAll('p, .content, .text, .Feed_body');
        const contentHeight = Array.from(contentElements)
          .reduce((sum, el) => sum + el.offsetHeight, 0);

        return contentHeight / totalHeight; // 内容密度比例
      });

      return density;

    } catch (error) {
      return 0.5; // 默认密度
    }
  }

  private calculateSmartScrollStep(density: number): { count: number; distance: number; delay: number } {
    // 根据内容密度调整滚动策略
    if (density > 0.7) {
      // 高密度内容：小步快滚
      return { count: 2, distance: window.innerHeight * 0.8, delay: 800 };
    } else if (density < 0.3) {
      // 低密度内容：大步慢滚
      return { count: 1, distance: window.innerHeight * 2, delay: 2000 };
    } else {
      // 中等密度：标准滚动
      return { count: 1, distance: window.innerHeight, delay: 1000 };
    }
  }

  // ==================== 停止条件检查 ====================

  private shouldStopScrolling(): boolean {
    const conditions = this.config.stopConditions || {};

    // 检查滚动时间
    if (conditions.maxScrollTime && Date.now() - this.scrollStartTime > conditions.maxScrollTime) {
      return true;
    }

    // 检查滚动高度
    if (conditions.maxScrollHeight && this.lastScrollHeight > conditions.maxScrollHeight) {
      return true;
    }

    // 检查无新内容次数
    if (conditions.noNewContentCount && this.noNewContentCount > conditions.noNewContentCount) {
      return true;
    }

    // 检查是否到达底部
    if (conditions.reachBottom && await this.isAtBottom()) {
      return true;
    }

    return false;
  }

  private async isAtBottom(): Promise<boolean> {
    try {
      const isBottom = await this.page.evaluate(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY;
        const clientHeight = window.innerHeight;
        return scrollTop + clientHeight >= scrollHeight - 100; // 100px tolerance
      });

      return isBottom;

    } catch (error) {
      return false;
    }
  }

  private determineStopReason(): string {
    const conditions = this.config.stopConditions || {};

    if (conditions.maxScrollTime && Date.now() - this.scrollStartTime > conditions.maxScrollTime) {
      return 'max_time_reached';
    }

    if (conditions.maxScrollHeight && this.lastScrollHeight > conditions.maxScrollHeight) {
      return 'max_height_reached';
    }

    if (conditions.noNewContentCount && this.noNewContentCount > conditions.noNewContentCount) {
      return 'no_new_content';
    }

    if (conditions.reachBottom && await this.isAtBottom()) {
      return 'bottom_reached';
    }

    return 'unknown';
  }

  private stopScrolling(reason: string): void {
    this.isScrolling = false;
    this.config.enableAutoScroll = false;
    console.log(`📜 滚动已停止: ${reason}`);
  }

  // ==================== 操作执行 ====================

  private async executeScrollSmooth(page: any, operation: any): Promise<OperationResult> {
    try {
      const distance = operation.distance || window.innerHeight;
      const duration = operation.duration || 1000;

      await page.evaluate((dist, dur) => {
        return new Promise((resolve) => {
          const start = window.scrollY;
          const startTime = performance.now();

          function animate(currentTime: number) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / dur, 1);
            const easeInOut: -1 + (4 - 2 * progress = progress < 0.5
              ? 2 * progress * progress
              ) * progress;

            window.scrollTo(0, start + dist * easeInOut);

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              resolve();
            }
          }

          requestAnimationFrame(animate);
        });
      }, distance, duration);

      return OperationResult.success({
        action: 'scroll_smooth',
        result: 'success',
        message: '平滑滚动完成',
        distance,
        duration
      });

    } catch (error) {
      return OperationResult.failure(`平滑滚动失败: ${error.message}`, error);
    }
  }

  private async executeScrollInstant(page: any, operation: any): Promise<OperationResult> {
    try {
      const distance = operation.distance || window.innerHeight;

      await page.evaluate((dist) => {
        window.scrollBy(0, dist);
      }, distance);

      return OperationResult.success({
        action: 'scroll_instant',
        result: 'success',
        message: '即时滚动完成',
        distance
      });

    } catch (error) {
      return OperationResult.failure(`即时滚动失败: ${error.message}`, error);
    }
  }

  private async executeScrollToElement(page: any, operation: any): Promise<OperationResult> {
    try {
      const selector = operation.selector;

      await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, selector);

      await page.waitForTimeout(1000);

      return OperationResult.success({
        action: 'scroll_to_element',
        result: 'success',
        message: '滚动到元素完成',
        selector
      });

    } catch (error) {
      return OperationResult.failure(`滚动到元素失败: ${error.message}`, error);
    }
  }

  private async executeScrollToBottom(page: any, operation: any): Promise<OperationResult> {
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await page.waitForTimeout(1000);

      return OperationResult.success({
        action: 'scroll_to_bottom',
        result: 'success',
        message: '滚动到底部完成'
      });

    } catch (error) {
      return OperationResult.failure(`滚动到底部失败: ${error.message}`, error);
    }
  }

  private async executeAnalyzeScrollPerformance(page: any, operation: any): Promise<OperationResult> {
    try {
      const performance: this.scrollMetrics.scrollTime
      };

      return OperationResult.success({
        action: 'analyze_scroll_performance' = {
        totalScrolls: this.scrollMetrics.totalScrolls,
        totalDistance: this.scrollMetrics.totalDistance,
        averageEfficiency: this.scrollMetrics.efficiency,
        scrollPattern: this.scrollMetrics.scrollPattern,
        recentHistory: this.scrollHistory.slice(-5),
        contentUpdates: this.scrollMetrics.newContentCount,
        timeSpent,
        result: 'success',
        message: '滚动性能分析完成',
        performance
      });

    } catch (error) {
      return OperationResult.failure(`滚动性能分析失败: ${error.message}`, error);
    }
  }

  private async executeResetScrollMetrics(page: any, operation: any): Promise<OperationResult> {
    try {
      this.scrollMetrics: 0
      };
      this.scrollHistory  = {
        totalScrolls: 0,
        totalDistance: 0,
        scrollTime: 0,
        newContentCount: 0,
        lastContentUpdate: 0,
        scrollPattern: 'stable',
        efficiency= [];
      this.scrollAttempts = 0;
      this.noNewContentCount = 0;

      return OperationResult.success({
        action: 'reset_scroll_metrics',
        result: 'success',
        message: '滚动指标已重置'
      });

    } catch (error) {
      return OperationResult.failure(`重置滚动指标失败: ${error.message}`, error);
    }
  }

  // ==================== 辅助方法 ====================

  private async getCurrentScrollHeight(): Promise<number> {
    try {
      const height = await this.page.evaluate(() => document.documentElement.scrollHeight);
      return height;
    } catch (error) {
      return this.lastScrollHeight;
    }
  }

  private updateScrollMetrics(result: ScrollResult): void {
    this.scrollMetrics.totalScrolls++;
    this.scrollMetrics.totalDistance += result.scrollDistance;
    this.scrollMetrics.scrollTime += Date.now() - this.scrollStartTime;

    this.scrollHistory.push(result);
    if (this.scrollHistory.length > 20) {
      this.scrollHistory.shift(); // 保持历史记录在合理范围内
    }
  }

  private handleContentChange(data: any): void {
    // 内容变化处理逻辑
    this.lastContentHash = data.contentHash;
    this.scrollMetrics.newContentCount++;
    this.scrollMetrics.lastContentUpdate = Date.now();
    this.noNewContentCount = 0;
  }

  // ==================== 触发源处理 ====================

  private async handleTriggerSpecificActions(trigger: RefreshTrigger): Promise<void> {
    switch (trigger.type) {
      case 'initialization':
        console.log('🚀 滚动容器初始化，准备自动滚动...');
        this.scrollStartTime = Date.now();
        break;
      case 'mutation':
        console.log('👁️ 内容变化触发，检查是否需要滚动...');
        break;
      case 'timer':
        console.log('⏰ 定时触发，维护滚动状态...');
        break;
      case 'operation':
        console.log(`🎮 操作触发 [${trigger.source}]:`, trigger.data);
        break;
      case 'manual':
        console.log('👆 手动触发滚动...');
        break;
    }
  }

  // ==================== 任务完成判断 ====================

  private isScrollTaskCompleted(result: any): boolean {
    // 滚动任务完成条件
    return this.shouldStopScrolling() ||
           !this.config.enableAutoScroll ||
           this.scrollAttempts >= (this.config.maxScrollAttempts || 50);
  }

  // ==================== 公共接口 ====================

  public getScrollMetrics(): ScrollMetrics {
    return { ...this.scrollMetrics };
  }

  public getScrollHistory(): ScrollResult[] {
    return [...this.scrollHistory];
  }

  public async scrollToElement(selector: string): Promise<OperationResult> {
    return await this.executeOperation('scroll_to_element', { selector });
  }

  public async scrollToBottom(): Promise<OperationResult> {
    return await this.executeOperation('scroll_to_bottom', {});
  }

  public resetScrollAttempts(): void {
    this.scrollAttempts = 0;
    this.noNewContentCount = 0;
    this.isScrolling = false;
    console.log('📜 重置滚动尝试计数');
  }

  public enableAutoScroll(enable: boolean: void {
    this.config.enableAutoScroll  = true)= enable;
    console.log(`📜 自动滚动已${enable ? '启用' : '禁用'}`);
  }

  // ==================== 清理资源 ====================

  public async cleanup(): Promise<void> {
    console.log(`🧹 清理微博滚动容器: ${this.config.name}`);

    this.isScrolling = false;
    this.scrollHistory = [];
    this.scrollAttempts = 0;
    this.noNewContentCount = 0;
    this.lastScrollHeight = 0;
    this.lastContentHash = '';

    await super.cleanup();
  }
}

export default WeiboScrollContainer;