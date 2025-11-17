/**
 * 事件驱动的链接容器
 * 通过事件机制驱动链接发现和提取
 */

import { EventDrivenContainer, ContainerConfig, ContainerSharedSpace } from './EventDrivenContainer';
import { CONTAINER_EVENTS } from './EventTypes';
type Page = {
  url(): string;
};

export interface LinkConfig extends ContainerConfig {
  maxLinks?: number;
  linkPatterns?: string[];
  excludePatterns?: string[];
  enableAutoScroll?: boolean;
  enableAutoPagination?: boolean;
  deduplicationStrategy?: 'url' | 'text' | 'both';
  validationEnabled?: boolean;
  metadataExtraction?: boolean;
}

export interface LinkData {
  href: string;
  text: string;
  title?: string;
  type: string;
  containerType: string;
  timestamp: number;
  metadata?: any;
  quality?: number;
}

export interface LinkExtractionResult {
  links: LinkData[];
  totalCount: number;
  newLinks: number;
  duplicates: number;
  filtered: number;
  extractionTime: number;
}

export class EventDrivenLinkContainer extends EventDrivenContainer {
  protected config: LinkConfig;
  private extractedLinks: Set<string> = new Set();
  private linkQuality: Map<string, number> = new Map();
  private extractionStartTime: number = 0;
  private lastExtractionTime: number = 0;
  private linkCache: Map<string, LinkData> = new Map();

  constructor(config: LinkConfig) {
    super(config);
    this.config = {
      ...config,
      maxLinks: config.maxLinks || 100,
      linkPatterns: config.linkPatterns || [],
      excludePatterns: config.excludePatterns || [],
      enableAutoScroll: config.enableAutoScroll ?? true,
      enableAutoPagination: config.enableAutoPagination ?? false,
      deduplicationStrategy: config.deduplicationStrategy || 'both',
      validationEnabled: config.validationEnabled ?? true,
      metadataExtraction: config.metadataExtraction ?? true
    };
  }

  // ==================== 生命周期方法 ====================

  protected async onInitialize(): Promise<void> {
    this.setupLinkEventHandlers();
    this.extractionStartTime = Date.now();
    this.lastExtractionTime = this.extractionStartTime;
  }

  protected async onStart(): Promise<void> {
    // 初始链接提取由事件触发
  }

  protected async onPause(): Promise<void> {
    // 暂停链接提取
  }

  protected async onResume(): Promise<void> {
    // 恢复链接提取
  }

  protected async onStop(): Promise<void> {
    await this.performFinalExtraction();
  }

  protected async onDestroy(): Promise<void> {
    this.clearLinkCache();
  }

  protected getExecutionResult(): LinkExtractionResult {
    const allLinks = Array.from(this.linkCache.values());
    return {
      links: allLinks,
      totalCount: allLinks.length,
      newLinks: this.state.stats.newLinks || 0,
      duplicates: this.state.stats.duplicates || 0,
      filtered: this.state.stats.filtered || 0,
      extractionTime: Date.now() - this.extractionStartTime
    };
  }

  protected initializeStats(): any {
    return {
      totalLinks: 0,
      newLinks: 0,
      duplicates: 0,
      filtered: 0,
      averageExtractionTime: 0,
      qualityScore: 0,
      extractionSessions: 0,
      uniqueDomains: new Set<string>()
    };
  }

  // ==================== 链接提取方法 ====================

  /**
   * 提取链接
   */
  async extractLinks(): Promise<LinkExtractionResult> {
    if (!this.sharedSpace?.page) {
      throw new Error('Page not available');
    }

    const startTime = Date.now();
    let extractedLinks: LinkData[] = [];

    try {
      // 从页面提取链接
      extractedLinks = await this.extractLinksFromPage();

      // 处理提取的链接
      const result = await this.processExtractedLinks(extractedLinks);

      // 更新统计信息
      this.updateLinkExtractionStats(result, startTime);

      // 发射链接发现事件
      if (result.newLinks > 0) {
        this.emit('links:batch_discovered', {
          containerId: this.config.id,
          links: result.links.slice(-result.newLinks),
          totalCount: result.totalCount,
          newLinks: result.newLinks
        });
      }

      // 检查是否达到目标链接数
      if (result.totalCount >= this.config.maxLinks!) {
        this.emit('links:target_reached', {
          targetCount: this.config.maxLinks,
          actualCount: result.totalCount
        });
      }

      this.lastExtractionTime = Date.now();
      return result;

    } catch (error) {
      this.emit('links:extraction_error', {
        containerId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
        extractionTime: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * 从页面提取链接
   */
  private async extractLinksFromPage(): Promise<LinkData[]> {
    return await this.sharedSpace.page.evaluate((config) => {
      const elements = document.querySelectorAll(config.selector);
      const links: any[] = [];

      elements.forEach((element) => {
        const linkElement = element.querySelector('a') || element;
        if (linkElement && linkElement.href) {
          const href = linkElement.href;
          const text = linkElement.textContent?.trim() || '';

          // 应用链接模式过滤
          if (config.linkPatterns.length > 0) {
            const matchesPattern = config.linkPatterns.some((pattern: string) => {
              try {
                return new RegExp(pattern).test(href);
              } catch (e) {
                return false;
              }
            });
            if (!matchesPattern) return;
          }

          // 应用排除模式过滤
          if (config.excludePatterns.length > 0) {
            const isExcluded = config.excludePatterns.some((pattern: string) => {
              try {
                return new RegExp(pattern).test(href);
              } catch (e) {
                return false;
              }
            });
            if (isExcluded) return;
          }

          // 计算链接质量分数
          const quality = EventDrivenLinkContainer.calculateLinkQuality(linkElement, text);

          links.push({
            href,
            text,
            title: linkElement.title || linkElement.getAttribute('title') || '',
            type: EventDrivenLinkContainer.determineLinkType(href),
            timestamp: Date.now(),
            quality
          });
        }
      });

      return links;
    }, {
      selector: this.config.selector,
      linkPatterns: this.config.linkPatterns,
      excludePatterns: this.config.excludePatterns
    });
  }

  /**
   * 处理提取的链接
   */
  private async processExtractedLinks(rawLinks: LinkData[]): Promise<LinkExtractionResult> {
    let newLinks = 0;
    let duplicates = 0;
    let filtered = 0;
    const finalLinks: LinkData[] = [];

    for (const link of rawLinks) {
      // 检查重复
      if (this.isDuplicateLink(link)) {
        duplicates++;
        this.emit('links:duplicate_found', {
          containerId: this.config.id,
          duplicateLink: link.href,
          existingLink: link.href
        });
        continue;
      }

      // 验证链接
      if (this.config.validationEnabled && !this.validateLink(link)) {
        filtered++;
        continue;
      }

      // 提取元数据
      if (this.config.metadataExtraction) {
        link.metadata = await this.extractLinkMetadata(link);
      }

      // 添加到缓存
      this.linkCache.set(link.href, link);
      this.extractedLinks.add(this.getLinkKey(link));
      this.linkQuality.set(link.href, link.quality || 0);

      finalLinks.push(link);
      newLinks++;

      // 发射单个链接发现事件
      this.emit('links:discovered', {
        containerId: this.config.id,
        links: [link]
      });
    }

    return {
      links: finalLinks,
      totalCount: this.linkCache.size,
      newLinks,
      duplicates,
      filtered,
      extractionTime: Date.now() - this.lastExtractionTime
    };
  }

  /**
   * 执行最终提取
   */
  private async performFinalExtraction(): Promise<void> {
    try {
      const result = await this.extractLinks();
      this.emit('links:extraction_completed', {
        containerId: this.config.id,
        totalLinks: result.totalCount,
        extractionTime: result.extractionTime
      });
    } catch (error) {
      console.error('Final link extraction failed:', error);
    }
  }

  // ==================== 链接验证和过滤方法 ====================

  /**
   * 检查重复链接
   */
  private isDuplicateLink(link: LinkData): boolean {
    const key = this.getLinkKey(link);
    return this.extractedLinks.has(key);
  }

  /**
   * 获取链接键
   */
  private getLinkKey(link: LinkData): string {
    switch (this.config.deduplicationStrategy) {
      case 'url':
        return link.href;
      case 'text':
        return link.text;
      case 'both':
      default:
        return `${link.href}|${link.text}`;
    }
  }

  /**
   * 验证链接
   */
  private validateLink(link: LinkData): boolean {
    // 检查URL格式
    try {
      new URL(link.href);
    } catch {
      return false;
    }

    // 检查链接文本
    if (!link.text || link.text.trim().length === 0) {
      return false;
    }

    // 检查链接质量
    if (link.quality && link.quality < 0.3) {
      return false;
    }

    return true;
  }

  /**
   * 提取链接元数据
   */
  private async extractLinkMetadata(link: LinkData): Promise<any> {
    if (!this.sharedSpace?.page) return {};

    try {
      return await this.sharedSpace.page.evaluate((href) => {
        // 这里可以添加更多元数据提取逻辑
        return {
          domain: new URL(href).hostname,
          path: new URL(href).pathname,
          hash: new URL(href).hash,
          search: new URL(href).search
        };
      }, link.href);
    } catch {
      return {};
    }
  }

  // ==================== 事件处理方法 ====================

  /**
   * 设置链接事件处理器
   */
  private setupLinkEventHandlers(): void {
    // 监听内容变化事件
    this.on('content:new_content_loaded', () => {
      this.handleContentChange();
    });

    // 监听滚动进度事件
    this.on('scroll:progress', () => {
      this.handleScrollProgress();
    });

    // 监听页面加载事件
    this.on('pagination:page_loaded', () => {
      this.handlePageLoaded();
    });

    // 监听目标链接数达到事件
    this.on('links:target_reached', (data) => {
      this.handleTargetReached(data);
    });
  }

  /**
   * 处理内容变化
   */
  private async handleContentChange(): Promise<void> {
    if (this.isRunning()) {
      await this.extractLinks();
    }
  }

  /**
   * 处理滚动进度
   */
  private async handleScrollProgress(): Promise<void> {
    if (this.isRunning() && this.config.enableAutoScroll) {
      await this.extractLinks();
    }
  }

  /**
   * 处理页面加载
   */
  private async handlePageLoaded(): Promise<void> {
    if (this.isRunning() && this.config.enableAutoPagination) {
      await this.extractLinks();
    }
  }

  /**
   * 处理目标链接数达到
   */
  private handleTargetReached(data: any): void {
    console.log(`Link target reached: ${data.actualCount}/${data.targetCount}`);

    // 可以在这里触发停止其他容器的逻辑
    this.emit('workflow:condition_met', {
      ruleName: 'link_target_reached',
      eventData: data
    });
  }

  // ==================== 统计和辅助方法 ====================

  /**
   * 更新链接提取统计
   */
  private updateLinkExtractionStats(result: LinkExtractionResult, startTime: number): void {
    this.state.stats.totalLinks = result.totalCount;
    this.state.stats.newLinks += result.newLinks;
    this.state.stats.duplicates += result.duplicates;
    this.state.stats.filtered += result.filtered;
    this.state.stats.extractionSessions++;

    // 计算平均提取时间
    if (this.state.stats.extractionSessions > 0) {
      this.state.stats.averageExtractionTime =
        (Date.now() - this.extractionStartTime) / this.state.stats.extractionSessions;
    }

    // 计算质量分数
    const totalQuality = Array.from(this.linkQuality.values())
      .reduce((sum, quality) => sum + quality, 0);
    this.state.stats.qualityScore = totalQuality / this.linkQuality.size;

    // 统计唯一域名
    const domains = new Set<string>();
    result.links.forEach(link => {
      try {
        domains.add(new URL(link.href).hostname);
      } catch {
        // 忽略无效URL
      }
    });
    this.state.stats.uniqueDomains = domains;
  }

  /**
   * 清理链接缓存
   */
  private clearLinkCache(): void {
    this.linkCache.clear();
    this.extractedLinks.clear();
    this.linkQuality.clear();
  }

  // ==================== 静态方法 ====================

  /**
   * 计算链接质量分数
   */
  private static calculateLinkQuality(element: HTMLElement, text: string): number {
    let quality = 0;

    // 基于文本长度
    if (text.length > 0) quality += 0.2;
    if (text.length > 10) quality += 0.2;

    // 基于元素属性
    if (element.getAttribute('title')) quality += 0.1;
    if (element.getAttribute('href')?.startsWith('http')) quality += 0.1;

    // 基于可见性
    const style = window.getComputedStyle(element);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      quality += 0.2;
    }

    // 基于位置
    const rect = element.getBoundingClientRect();
    if (rect.top >= 0 && rect.left >= 0) quality += 0.2;

    return Math.min(quality, 1);
  }

  /**
   * 确定链接类型
   */
  private static determineLinkType(href: string): string {
    if (href.includes('weibo.com')) return 'weibo';
    if (href.includes('/u/')) return 'user';
    if (href.includes('/status/')) return 'post';
    if (href.includes('search')) return 'search';
    if (href.includes('home')) return 'homepage';
    return 'external';
  }

  // ==================== 公共接口 ====================

  /**
   * 获取所有链接
   */
  getAllLinks(): LinkData[] {
    return Array.from(this.linkCache.values());
  }

  /**
   * 获取链接统计
   */
  getLinkStats(): any {
    return {
      ...this.state.stats,
      uniqueDomains: Array.from(this.state.stats.uniqueDomains)
    };
  }

  /**
   * 按类型获取链接
   */
  getLinksByType(type: string): LinkData[] {
    return this.getAllLinks().filter(link => link.type === type);
  }

  /**
   * 获取高质量链接
   */
  getHighQualityLinks(threshold: number = 0.7): LinkData[] {
    return this.getAllLinks().filter(link => (link.quality || 0) >= threshold);
  }

  /**
   * 导出链接
   */
  exportLinks(format: 'json' | 'csv' = 'json'): string {
    const links = this.getAllLinks();

    if (format === 'json') {
      return JSON.stringify(links, null, 2);
    } else {
      // CSV格式
      const headers = ['href', 'text', 'type', 'quality', 'timestamp'];
      const rows = links.map(link => [
        link.href,
        link.text,
        link.type,
        link.quality || 0,
        new Date(link.timestamp).toISOString()
      ]);

      return [headers, ...rows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');
    }
  }
}
