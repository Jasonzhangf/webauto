/**
 * 微博链接容器实现
 * 专门处理微博页面的链接发现和提取
 */

import { BaseSelfRefreshingContainer, ContainerConfig, RefreshTrigger } from './BaseSelfRefreshingContainer.js';
import { UniversalOperator, OperationResult } from '../core/UniversalOperator.js';

// ==================== 接口定义 ====================

export interface WeiboLinkConfig extends ContainerConfig {
  maxLinks?: number;
  linkPatterns?: string[];
  excludePatterns?: string[];
  enableAutoScroll?: boolean;
  enableAutoPagination?: boolean;
  scrollStep?: number;
  maxScrollAttempts?: number;
  maxPageAttempts?: number;
  paginationMode?: 'button' | 'url' | 'auto';
}

export interface LinkData {
  href: string;
  text: string;
  author?: string;
  timestamp?: string;
  engagement?: {
    likes: number;
    comments: number;
    reposts: number;
  };
  containerType: 'post' | 'user' | 'topic' | 'other';
  captureOrder: number;
  discoveredAt: number;
}

export interface LinkExtractionResult {
  totalLinks: number;
  newLinks: number;
  links: LinkData[];
  uniqueDomains: Set<string>;
  containerStats: {
    totalContainers: number;
    activeContainers: number;
    newContainers: number;
  };
}

// ==================== 容器实现 ====================

export class WeiboLinkContainer extends BaseSelfRefreshingContainer {
  protected config: WeiboLinkConfig;
  protected extractedLinks: Map<string, LinkData> = new Map();
  protected scrollAttempts = 0;
  protected paginationAttempts = 0;
  protected lastLinkCount = 0;
  protected noNewLinksCount = 0;
  protected currentPage = 1;
  protected isAutoScrolling = false;
  protected isAutoPaginating = false;

  constructor(config: WeiboLinkConfig) {
    super({
      refreshInterval: 2000,
      enableAutoRefresh: true,
      enableMutationObserver: true,
      maxRefreshRetries: 3,
      debounceTime: 1000,
      childContainerTypes: [],
      taskCompletionCriteria: {
        type: 'count',
        targetCount: config.maxLinks || 100
      },
      ...config
    });

    this.config = config;
    this.setupLinkSpecificHandlers();
  }

  private setupLinkSpecificHandlers(): void {
    // 监听链接数量变化
    this.on('refresh:completed', (data) => {
      const currentCount = this.extractedLinks.size;
      console.log(`🔗 链接数量更新: ${currentCount} (任务目标: ${this.config.maxLinks})`);
    });

    // 监听新链接发现
    this.on('links:discovered', (data) => {
      console.log(`🆕 发现新链接: ${data.links.length} 条, 总计: ${data.totalCount} 条`);
    });

    // 监听自动操作执行
    this.on('auto-operation:executed', (data) => {
      console.log(`🤖 自动操作执行: ${data.operationId} - ${data.success ? '成功' : '失败'}`);
    });

    // 监听分页事件
    this.on('pagination:completed', (data) => {
      console.log(`📄 分页完成: 第 ${data.page} 页`);
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
    // 链接容器通常不需要子容器，但如果需要可以扩展
    throw new Error('链接容器不支持子容器');
  }

  protected async executeDynamicOperation(page: any, operation: any, params: any): Promise<OperationResult> {
    switch (operation.action) {
      case 'scroll_page':
        return await this.executeScrollPage(page, operation);
      case 'next_page':
        return await this.executeNextPage(page, operation);
      case 'extract_links':
        return await this.executeExtractLinks(page, operation);
      case 'click_load_more':
        return await this.executeClickLoadMore(page, operation);
      default:
        return OperationResult.failure(`不支持的操作: ${operation.action}`);
    }
  }

  // ==================== 核心刷新逻辑 ====================

  protected async performRefresh(trigger: RefreshTrigger): Promise<OperationResult> {
    console.log(`🔄 执行链接容器刷新 [${trigger.type}]: ${this.config.name}`);

    try {
      // 1. 检测容器状态
      const stateUpdate = await this.detectContainerState(this.page);
      this.updateState(stateUpdate);

      // 2. 如果容器不存在，跳过刷新
      if (!stateUpdate.exists) {
        return OperationResult.success({
          action: 'refresh',
          result: 'container_not_found',
          message: '链接容器不存在'
        });
      }

      // 3. 提取链接数据
      const linksResult = await this.extractLinks(this.page);
      if (linksResult.success) {
        await this.updateLinkData(linksResult.data);
      }

      // 4. 注册动态操作
      await this.registerDynamicOperations(this.page);

      // 5. 根据触发源执行特定操作
      await this.handleTriggerSpecificActions(trigger);

      // 6. 自动滚动加载更多链接
      if (this.shouldAutoScroll(trigger)) {
        await this.performAutoScroll();
      }

      // 7. 自动分页（适用于搜索页）
      if (this.shouldAutoPaginate(trigger)) {
        await this.performAutoPagination();
      }

      return OperationResult.success({
        action: 'refresh',
        trigger: trigger.type,
        linkCount: this.extractedLinks.size,
        containerState: this.state,
        taskProgress: this.taskProgress,
        currentPage: this.currentPage,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`链接容器刷新失败 [${trigger.type}]:`, error);
      return OperationResult.failure(`刷新失败: ${error.message}`, error);
    }
  }

  // ==================== 链接数据提取 ====================

  private async extractLinks(page: any): Promise<OperationResult> {
    try {
      const defaultPatterns = [
        /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // 微博帖子
        /weibo\.com\/[A-Za-z0-9_\-]+/,      // 用户主页
        /weibo\.com\/search\?q=.+/          // 搜索页面
      ];

      const patterns = this.config.linkPatterns || defaultPatterns;

      const links = await page.evaluate((selector, patterns) => {
        const containers = document.querySelectorAll(selector);
        const allLinks = Array.from(containers).flatMap(container => {
          return Array.from(container.querySelectorAll('a')).map(link => ({
            href: link.href,
            text: link.textContent?.trim() || '',
            element: link
          }));
        });

        // 过滤和匹配链接
        const filteredLinks = allLinks.filter(link => {
          if (!link.href) return false;

          // 检查是否匹配任何模式
          return patterns.some(pattern => {
            if (typeof pattern === 'string') {
              return link.href.includes(pattern);
            } else {
              return pattern.test(link.href);
            }
          });
        });

        // 提取链接元数据
        return filteredLinks.map((link, index) => {
          // 确定链接类型
          let containerType = 'other';
          if (link.href.match(/weibo\.com\/\d+\/[A-Za-z0-9_\-]+/)) {
            containerType = 'post';
          } else if (link.href.match(/weibo\.com\/[A-Za-z0-9_\-]+$/)) {
            containerType = 'user';
          } else if (link.href.includes('/search?')) {
            containerType = 'topic';
          }

          // 尝试提取作者信息
          let author = '';
          const authorMatch = link.href.match(/weibo\.com\/([A-Za-z0-9_\-]+)/);
          if (authorMatch) {
            author = authorMatch[1];
          }

          return {
            href: link.href,
            text: link.text,
            author,
            containerType,
            captureOrder: index,
            discoveredAt: Date.now()
          };
        });
      }, this.config.selector, patterns);

      return OperationResult.success(links);

    } catch (error) {
      return OperationResult.failure(`链接提取失败: ${error.message}`, error);
    }
  }

  private async updateLinkData(newLinks: LinkData[]): Promise<void> {
    let discoveredCount = 0;
    const uniqueDomains = new Set<string>();

    for (const link of newLinks) {
      if (!this.extractedLinks.has(link.href)) {
        this.extractedLinks.set(link.href, link);
        discoveredCount++;

        // 提取域名统计
        try {
          const url = new URL(link.href);
          uniqueDomains.add(url.hostname);
        } catch (error) {
          // 忽略无效URL
        }
      }
    }

    if (discoveredCount > 0) {
      this.emit('links:discovered', {
        links: newLinks.slice(-discoveredCount),
        totalCount: this.extractedLinks.size,
        uniqueDomains: uniqueDomains.size
      });
    }

    // 更新任务进度
    this.taskProgress.currentCount = this.extractedLinks.size;

    // 更新无新链接计数
    if (discoveredCount === 0) {
      this.noNewLinksCount++;
    } else {
      this.noNewLinksCount = 0;
    }
  }

  // ==================== 自动滚动 ====================

  private shouldAutoScroll(trigger: RefreshTrigger): boolean {
    const shouldScroll = ['initialization', 'timer'].includes(trigger.type) &&
                        this.config.enableAutoScroll &&
                        this.extractedLinks.size < (this.config.maxLinks || 1000) &&
                        !this.isAutoScrolling &&
                        this.scrollAttempts < (this.config.maxScrollAttempts || 50) &&
                        this.noNewLinksCount < 3;

    return shouldScroll;
  }

  private async performAutoScroll(): Promise<void> {
    if (this.isAutoScrolling) return;

    if (this.scrollAttempts >= (this.config.maxScrollAttempts || 50)) {
      console.log('📜 已达到最大滚动尝试次数，停止自动滚动');
      return;
    }

    if (this.noNewLinksCount >= 3) {
      console.log('📜 连续3次刷新无新链接，停止自动滚动');
      this.scrollAttempts = this.config.maxScrollAttempts || 50; // 强制停止
      return;
    }

    this.isAutoScrolling = true;

    try {
      console.log(`📜 自动滚动加载链接 (尝试 ${this.scrollAttempts + 1}/${this.config.maxScrollAttempts})`);

      const scrollStep = this.config.scrollStep || 3;

      // 执行滚动
      await this.page.evaluate((step) => {
        for (let i = 0; i < step; i++) {
          window.scrollBy(0, window.innerHeight);
        }
      }, scrollStep);

      // 等待新内容加载
      await this.page.waitForTimeout(1500);

      this.scrollAttempts++;

      // 检查滚动效果
      const currentCount = this.extractedLinks.size;
      if (currentCount > this.lastLinkCount) {
        console.log(`📜 滚动后发现新链接: ${this.lastLinkCount} → ${currentCount}`);
        this.lastLinkCount = currentCount;
        this.scrollAttempts = 0; // 重置滚动计数
        this.noNewLinksCount = 0;
      }

    } catch (error) {
      console.warn('自动滚动失败:', error);
    } finally {
      this.isAutoScrolling = false;
    }
  }

  // ==================== 自动分页 ====================

  private shouldAutoPaginate(trigger: RefreshTrigger): boolean {
    return this.config.enableAutoPagination &&
           this.config.paginationMode !== undefined &&
           this.extractedLinks.size < (this.config.maxLinks || 1000) &&
           !this.isAutoPaginating &&
           this.paginationAttempts < (this.config.maxPageAttempts || 10);
  }

  private async performAutoPagination(): Promise<void> {
    if (this.isAutoPaginating) return;

    if (this.paginationAttempts >= (this.config.maxPageAttempts || 10)) {
      console.log('📄 已达到最大分页尝试次数，停止自动分页');
      return;
    }

    this.isAutoPaginating = true;

    try {
      console.log(`📄 自动分页 (尝试 ${this.paginationAttempts + 1}/${this.config.maxPageAttempts})`);

      let success = false;

      if (this.config.paginationMode === 'button') {
        success = await this.executePaginationByButton();
      } else if (this.config.paginationMode === 'url') {
        success = await this.executePaginationByUrl();
      } else {
        success = await this.executeAutoPagination();
      }

      this.paginationAttempts++;

      if (success) {
        this.currentPage++;
        this.paginationAttempts = 0; // 重置分页计数
        this.noNewLinksCount = 0;

        this.emit('pagination:completed', {
          page: this.currentPage,
          success: true
        });
      }

    } catch (error) {
      console.warn('自动分页失败:', error);
    } finally {
      this.isAutoPaginating = false;
    }
  }

  private async executePaginationByButton(): Promise<boolean> {
    try {
      const nextButton = await this.page.$('button:has-text("下一页"), .next, [class*="next"]');
      if (!nextButton) {
        return false;
      }

      await nextButton.click();
      await this.page.waitForTimeout(2000);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async executePaginationByUrl(): Promise<boolean> {
    try {
      const currentUrl = this.page.url();
      const nextPageUrl = currentUrl.includes('&page=')
        ? currentUrl.replace(/&page=\d+/, `&page=${this.currentPage + 1}`)
        : `${currentUrl}&page=${this.currentPage + 1}`;

      await this.page.goto(nextPageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      await this.page.waitForTimeout(1000);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async executeAutoPagination(): Promise<boolean> {
    // 尝试按钮分页，失败则尝试URL分页
    return await this.executePaginationByButton() ||
           await this.executePaginationByUrl();
  }

  // ==================== 操作执行 ====================

  private async executeScrollPage(page: any, operation: any): Promise<OperationResult> {
    try {
      await page.evaluate((step = 3) => {
        for (let i = 0; i < step; i++) {
          window.scrollBy(0, window.innerHeight);
        }
      }, operation.step);

      await page.waitForTimeout(1000);

      return OperationResult.success({
        action: 'scroll_page',
        result: 'success',
        message: '页面滚动操作完成'
      });
    } catch (error) {
      return OperationResult.failure(`页面滚动失败: ${error.message}`, error);
    }
  }

  private async executeNextPage(page: any, operation: any): Promise<OperationResult> {
    try {
      const success = await this.executeAutoPagination();

      return OperationResult.success({
        action: 'next_page',
        result: success ? 'success' : 'failed',
        message: success ? '分页操作完成' : '分页操作失败',
        currentPage: this.currentPage
      });
    } catch (error) {
      return OperationResult.failure(`分页操作失败: ${error.message}`, error);
    }
  }

  private async executeExtractLinks(page: any, operation: any): Promise<OperationResult> {
    try {
      const result = await this.extractLinks(page);

      if (result.success) {
        await this.updateLinkData(result.data);
      }

      return result;
    } catch (error) {
      return OperationResult.failure(`链接提取操作失败: ${error.message}`, error);
    }
  }

  private async executeClickLoadMore(page: any, operation: any): Promise<OperationResult> {
    try {
      const loadMoreButton = await page.$(operation.selector);
      if (!loadMoreButton) {
        return OperationResult.success({
          action: 'click_load_more',
          result: 'button_not_found',
          message: '未找到加载更多按钮'
        });
      }

      await loadMoreButton.click();
      await page.waitForTimeout(1500);

      return OperationResult.success({
        action: 'click_load_more',
        result: 'success',
        message: '加载更多操作完成'
      });
    } catch (error) {
      return OperationResult.failure(`加载更多操作失败: ${error.message}`, error);
    }
  }

  // ==================== 触发源处理 ====================

  private async handleTriggerSpecificActions(trigger: RefreshTrigger): Promise<void> {
    switch (trigger.type) {
      case 'initialization':
        console.log('🚀 初始化触发，开始自动发现链接...');
        this.lastLinkCount = this.extractedLinks.size;
        break;
      case 'mutation':
        console.log('👁️ 内容变化触发，检查新链接...');
        break;
      case 'timer':
        console.log('⏰ 定时触发，保持链接同步...');
        break;
      case 'operation':
        console.log(`🎮 操作触发 [${trigger.source}]:`, trigger.data);
        break;
      case 'manual':
        console.log('👆 手动触发刷新...');
        break;
    }
  }

  // ==================== 重写任务完成检查 ====================

  protected getCurrentCountFromResult(result: OperationResult): number {
    return this.extractedLinks.size;
  }

  // ==================== 公共接口 ====================

  public getAllLinks(): LinkData[] {
    return Array.from(this.extractedLinks.values());
  }

  public getLinksByType(type: LinkData['containerType']): LinkData[] {
    return this.getAllLinks().filter(link => link.containerType === type);
  }

  public getLinkStats(): any {
    const links = Array.from(this.extractedLinks.values());
    const uniqueDomains = new Set<string>();

    links.forEach(link => {
      try {
        const url = new URL(link.href);
        uniqueDomains.add(url.hostname);
      } catch (error) {
        // 忽略无效URL
      }
    });

    const typeStats = links.reduce((acc, link) => {
      acc[link.containerType] = (acc[link.containerType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalLinks: links.length,
      uniqueDomains: uniqueDomains.size,
      typeDistribution: typeStats,
      refreshStats: this.getRefreshStats(),
      taskProgress: this.taskProgress,
      currentPage: this.currentPage,
      scrollAttempts: this.scrollAttempts,
      paginationAttempts: this.paginationAttempts
    };
  }

  public resetScrollAttempts(): void {
    this.scrollAttempts = 0;
    this.paginationAttempts = 0;
    this.noNewLinksCount = 0;
    this.lastLinkCount = 0;
    console.log('📜 重置滚动和分页尝试计数');
  }

  // ==================== 清理资源 ====================

  public async cleanup(): Promise<void> {
    console.log(`🧹 清理微博链接容器: ${this.config.name}`);

    this.extractedLinks.clear();
    this.scrollAttempts = 0;
    this.paginationAttempts = 0;
    this.isAutoScrolling = false;
    this.isAutoPaginating = false;
    this.lastLinkCount = 0;
    this.noNewLinksCount = 0;
    this.currentPage = 1;

    await super.cleanup();
  }
}

export default WeiboLinkContainer;