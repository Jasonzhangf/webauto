/**
 * 事件驱动的页面容器
 * 协调多个子容器的工作，提供整体页面管理
 */

import { EventDrivenContainer, ContainerConfig, ContainerSharedSpace } from './EventDrivenContainer';
import { EventDrivenLinkContainer, LinkConfig } from './EventDrivenLinkContainer';
import { EventDrivenScrollContainer, ScrollConfig } from './EventDrivenScrollContainer';
import { EventDrivenPaginationContainer, PaginationConfig } from './EventDrivenPaginationContainer';
import { CONTAINER_EVENTS } from './EventTypes';
import { Page } from 'playwright';

export interface PageContainerConfig extends ContainerConfig {
  pageType?: 'homepage' | 'search' | 'profile' | 'custom';
  enableAutoNavigation?: boolean;
  enableErrorRecovery?: boolean;
  maxReloadAttempts?: number;
  containerConfigs?: {
    linkContainer?: LinkConfig;
    scrollContainer?: ScrollConfig;
    paginationContainer?: PaginationConfig;
  };
}

export interface PageState {
  url: string;
  title: string;
  loadTime: number;
  lastActivity: number;
  reloadCount: number;
  errorCount: number;
  health: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface NavigationHistory {
  fromUrl: string;
  toUrl: string;
  timestamp: number;
  navigationTime: number;
  success: boolean;
}

export class EventDrivenPageContainer extends EventDrivenContainer {
  protected config: PageContainerConfig;
  private pageState: PageState;
  private navigationHistory: NavigationHistory[] = [];
  private reloadAttempts: number = 0;
  private lastNavigationTime: number = 0;
  private linkContainer: EventDrivenLinkContainer | null = null;
  private scrollContainer: EventDrivenScrollContainer | null = null;
  private paginationContainer: EventDrivenPaginationContainer | null = null;

  constructor(config: PageContainerConfig) {
    super(config);
    this.config = {
      ...config,
      pageType: config.pageType || 'homepage',
      enableAutoNavigation: config.enableAutoNavigation ?? true,
      enableErrorRecovery: config.enableErrorRecovery ?? true,
      maxReloadAttempts: config.maxReloadAttempts || 3,
      containerConfigs: config.containerConfigs || {}
    };
    this.pageState = this.initializePageState();
  }

  // ==================== 生命周期方法 ====================

  protected async onInitialize(): Promise<void> {
    this.setupPageEventHandlers();
    await this.createChildContainers();
    await this.initializeChildContainers();
  }

  protected async onStart(): Promise<void> {
    await this.startChildContainers();
  }

  protected async onPause(): Promise<void> {
    await this.pauseChildContainers();
  }

  protected async onResume(): Promise<void> {
    await this.resumeChildContainers();
  }

  protected async onStop(): Promise<void> {
    await this.stopChildContainers();
  }

  protected async onDestroy(): Promise<void> {
    await this.destroyChildContainers();
  }

  protected getExecutionResult(): any {
    return {
      pageState: this.pageState,
      navigationHistory: [...this.navigationHistory],
      childContainers: {
        links: this.linkContainer?.getExecutionResult(),
        scroll: this.scrollContainer?.getExecutionResult(),
        pagination: this.paginationContainer?.getExecutionResult()
      },
      containerStats: this.getChildContainersStats()
    };
  }

  protected initializeStats(): any {
    return {
      navigations: 0,
      reloads: 0,
      errors: 0,
      averageLoadTime: 0,
      averageNavigationTime: 0,
      childContainerStats: {}
    };
  }

  // ==================== 子容器管理方法 ====================

  /**
   * 创建子容器
   */
  private async createChildContainers(): Promise<void> {
    // 创建链接容器
    if (this.config.containerConfigs?.linkContainer) {
      this.linkContainer = new EventDrivenLinkContainer({
        ...this.config.containerConfigs.linkContainer,
        id: `${this.config.id}_link_container`,
        name: `${this.config.name} Link Container`
      });
      this.addChildContainer(this.linkContainer);
    }

    // 创建滚动容器
    if (this.config.containerConfigs?.scrollContainer) {
      this.scrollContainer = new EventDrivenScrollContainer({
        ...this.config.containerConfigs.scrollContainer,
        id: `${this.config.id}_scroll_container`,
        name: `${this.config.name} Scroll Container`
      });
      this.addChildContainer(this.scrollContainer);
    }

    // 创建分页容器
    if (this.config.containerConfigs?.paginationContainer) {
      this.paginationContainer = new EventDrivenPaginationContainer({
        ...this.config.containerConfigs.paginationContainer,
        id: `${this.config.id}_pagination_container`,
        name: `${this.config.name} Pagination Container`
      });
      this.addChildContainer(this.paginationContainer);
    }
  }

  /**
   * 初始化子容器
   */
  private async initializeChildContainers(): Promise<void> {
    const childContainers = this.getChildContainers();
    const initPromises = childContainers.map(container =>
      container.initialize(this.sharedSpace!)
    );

    await Promise.all(initPromises);
  }

  /**
   * 启动子容器
   */
  private async startChildContainers(): Promise<void> {
    const childContainers = this.getChildContainers();
    const startPromises = childContainers.map(container => container.start());

    await Promise.all(startPromises);
  }

  /**
   * 暂停子容器
   */
  private async pauseChildContainers(): Promise<void> {
    const childContainers = this.getChildContainers();
    const pausePromises = childContainers.map(container => container.pause());

    await Promise.all(pausePromises);
  }

  /**
   * 恢复子容器
   */
  private async resumeChildContainers(): Promise<void> {
    const childContainers = this.getChildContainers();
    const resumePromises = childContainers.map(container => container.resume());

    await Promise.all(resumePromises);
  }

  /**
   * 停止子容器
   */
  private async stopChildContainers(): Promise<void> {
    const childContainers = this.getChildContainers();
    const stopPromises = childContainers.map(container => container.stop());

    await Promise.all(stopPromises);
  }

  /**
   * 销毁子容器
   */
  private async destroyChildContainers(): Promise<void> {
    const childContainers = this.getChildContainers();
    const destroyPromises = childContainers.map(container => container.destroy());

    await Promise.all(destroyPromises);
  }

  // ==================== 页面导航方法 ====================

  /**
   * 导航到指定URL
   */
  async navigateTo(url: string): Promise<boolean> {
    if (!this.sharedSpace?.page) {
      throw new Error('Page not available');
    }

    const startTime = Date.now();
    const fromUrl = this.pageState.url;

    try {
      await this.sharedSpace.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // 等待页面稳定
      await this.sharedSpace.page.waitForTimeout(2000);

      const navigationTime = Date.now() - startTime;
      this.updatePageState(url, navigationTime);

      // 记录导航历史
      this.navigationHistory.push({
        fromUrl,
        toUrl: url,
        timestamp: Date.now(),
        navigationTime,
        success: true
      });

      // 更新统计信息
      this.state.stats.navigations++;
      this.state.stats.averageNavigationTime =
        (this.state.stats.averageNavigationTime * (this.state.stats.navigations - 1) + navigationTime) / this.state.stats.navigations;

      this.emit('page:navigation_completed', {
        fromUrl,
        toUrl: url,
        navigationTime
      });

      return true;

    } catch (error) {
      const navigationTime = Date.now() - startTime;

      this.navigationHistory.push({
        fromUrl,
        toUrl: url,
        timestamp: Date.now(),
        navigationTime,
        success: false
      });

      this.state.stats.errors++;

      this.emit('page:error', {
        url,
        error: error instanceof Error ? error.message : String(error),
        errorType: 'navigation'
      });

      if (this.config.enableErrorRecovery) {
        return await this.handleNavigationError(url, error);
      }

      return false;
    }
  }

  /**
   * 重新加载页面
   */
  async reloadPage(): Promise<boolean> {
    if (!this.sharedSpace?.page) {
      throw new Error('Page not available');
    }

    try {
      await this.sharedSpace.page.reload({
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      this.reloadAttempts++;
      this.state.stats.reloads++;

      this.emit('page:reloaded', {
        url: this.pageState.url,
        reloadCount: this.reloadAttempts
      });

      return true;

    } catch (error) {
      this.state.stats.errors++;

      this.emit('page:error', {
        url: this.pageState.url,
        error: error instanceof Error ? error.message : String(error),
        errorType: 'reload'
      });

      return false;
    }
  }

  // ==================== 错误处理方法 ====================

  /**
   * 处理导航错误
   */
  private async handleNavigationError(url: string, error: any): Promise<boolean> {
    if (this.reloadAttempts >= this.config.maxReloadAttempts!) {
      this.emit('page:error', {
        url,
        error: `Max reload attempts (${this.reloadAttempts}) exceeded`,
        errorType: 'max_reloads_exceeded'
      });
      return false;
    }

    // 等待一段时间后重试
    await new Promise(resolve => setTimeout(resolve, 2000));
    return await this.navigateTo(url);
  }

  // ==================== 事件处理方法 ====================

  /**
   * 设置页面事件处理器
   */
  private setupPageEventHandlers(): void {
    // 监听页面加载事件
    this.on('page:loaded', (data) => {
      this.handlePageLoaded(data);
    });

    // 监听导航完成事件
    this.on('page:navigation_completed', (data) => {
      this.handleNavigationCompleted(data);
    });

    // 监听页面错误事件
    this.on('page:error', (data) => {
      this.handlePageError(data);
    });

    // 监听子容器事件
    this.setupChildContainerEventHandlers();
  }

  /**
   * 设置子容器事件处理器
   */
  private setupChildContainerEventHandlers(): void {
    // 监听链接容器事件
    if (this.linkContainer) {
      this.linkContainer.on('links:target_reached', (data) => {
        this.handleLinkTargetReached(data);
      });

      this.linkContainer.on('links:extraction_completed', (data) => {
        this.handleLinkExtractionCompleted(data);
      });
    }

    // 监听滚动容器事件
    if (this.scrollContainer) {
      this.scrollContainer.on('scroll:bottom_reached', (data) => {
        this.handleScrollBottomReached(data);
      });

      this.scrollContainer.on('scroll:stopped', (data) => {
        this.handleScrollStopped(data);
      });
    }

    // 监听分页容器事件
    if (this.paginationContainer) {
      this.paginationContainer.on('pagination:last_page_reached', (data) => {
        this.handlePaginationLastPageReached(data);
      });

      this.paginationContainer.on('pagination:stopped', (data) => {
        this.handlePaginationStopped(data);
      });
    }
  }

  /**
   * 处理页面加载
   */
  private handlePageLoaded(data: any): void {
    this.emit('page:ready', {
      url: data.url,
      readyTime: Date.now()
    });
  }

  /**
   * 处理导航完成
   */
  private handleNavigationCompleted(data: any): void {
    this.lastNavigationTime = Date.now();
    this.reloadAttempts = 0; // 重置重载计数
  }

  /**
   * 处理页面错误
   */
  private handlePageError(data: any): void {
    this.pageState.errorCount++;
    this.updatePageHealth();
  }

  /**
   * 处理链接目标达到
   */
  private handleLinkTargetReached(data: any): void {
    this.emit('workflow:condition_met', {
      ruleName: 'link_target_reached',
      eventData: data
    });
  }

  /**
   * 处理链接提取完成
   */
  private handleLinkExtractionCompleted(data: any): void {
    this.state.stats.childContainerStats.links = data;
  }

  /**
   * 处理滚动到底部
   */
  private handleScrollBottomReached(data: any): void {
    this.emit('workflow:condition_met', {
      ruleName: 'scroll_bottom_reached',
      eventData: data
    });
  }

  /**
   * 处理滚动停止
   */
  private handleScrollStopped(data: any): void {
    this.state.stats.childContainerStats.scroll = data;
  }

  /**
   * 处理分页最后一页
   */
  private handlePaginationLastPageReached(data: any): void {
    this.emit('workflow:condition_met', {
      ruleName: 'pagination_last_page_reached',
      eventData: data
    });
  }

  /**
   * 处理分页停止
   */
  private handlePaginationStopped(data: any): void {
    this.state.stats.childContainerStats.pagination = data;
  }

  // ==================== 状态管理方法 ====================

  /**
   * 初始化页面状态
   */
  private initializePageState(): PageState {
    return {
      url: '',
      title: '',
      loadTime: 0,
      lastActivity: Date.now(),
      reloadCount: 0,
      errorCount: 0,
      health: 'excellent'
    };
  }

  /**
   * 更新页面状态
   */
  private async updatePageState(url: string, loadTime: number): Promise<void> {
    if (!this.sharedSpace?.page) return;

    this.pageState.url = url;
    this.pageState.title = await this.sharedSpace.page.title();
    this.pageState.loadTime = loadTime;
    this.pageState.lastActivity = Date.now();
    this.pageState.reloadCount = this.reloadAttempts;

    this.updatePageHealth();

    // 更新统计信息
    this.state.stats.averageLoadTime =
      (this.state.stats.averageLoadTime * (this.state.stats.navigations - 1) + loadTime) / this.state.stats.navigations;

    this.emit('page:loaded', {
      url,
      loadTime,
      title: this.pageState.title
    });
  }

  /**
   * 更新页面健康状态
   */
  private updatePageHealth(): void {
    const errorRate = this.pageState.errorCount / Math.max(1, this.state.stats.navigations);
    const averageLoadTime = this.state.stats.averageLoadTime;

    if (errorRate === 0 && averageLoadTime < 3000) {
      this.pageState.health = 'excellent';
    } else if (errorRate < 0.1 && averageLoadTime < 5000) {
      this.pageState.health = 'good';
    } else if (errorRate < 0.3 && averageLoadTime < 10000) {
      this.pageState.health = 'fair';
    } else {
      this.pageState.health = 'poor';
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取子容器统计
   */
  private getChildContainersStats(): any {
    return {
      linkContainer: this.linkContainer?.getStats(),
      scrollContainer: this.scrollContainer?.getStats(),
      paginationContainer: this.paginationContainer?.getStats()
    };
  }

  // ==================== 公共接口 ====================

  /**
   * 获取页面状态
   */
  getPageState(): PageState {
    return { ...this.pageState };
  }

  /**
   * 获取导航历史
   */
  getNavigationHistory(): NavigationHistory[] {
    return [...this.navigationHistory];
  }

  /**
   * 获取所有链接
   */
  getAllLinks(): any[] {
    return this.linkContainer?.getAllLinks() || [];
  }

  /**
   * 获取滚动指标
   */
  getScrollMetrics(): any {
    return this.scrollContainer?.getScrollMetrics();
  }

  /**
   * 获取分页历史
   */
  getPaginationHistory(): any[] {
    return this.paginationContainer?.getPageHistory() || [];
  }

  /**
   * 获取子容器统计
   */
  getChildContainersStats(): any {
    return {
      linkContainer: this.linkContainer?.getStats(),
      scrollContainer: this.scrollContainer?.getStats(),
      paginationContainer: this.paginationContainer?.getStats()
    };
  }

  /**
   * 获取页面健康状态
   */
  getPageHealth(): string {
    return this.pageState.health;
  }

  /**
   * 检查页面是否健康
   */
  isPageHealthy(): boolean {
    return this.pageState.health !== 'poor';
  }

  /**
   * 导出页面数据
   */
  exportPageData(format: 'json' = 'json'): string {
    const pageData = {
      pageState: this.pageState,
      navigationHistory: this.navigationHistory,
      links: this.getAllLinks(),
      scrollMetrics: this.getScrollMetrics(),
      paginationHistory: this.getPaginationHistory(),
      containerStats: this.getChildContainersStats()
    };

    return JSON.stringify(pageData, null, 2);
  }
}