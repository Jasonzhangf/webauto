import { BaseAtomicOperation } from '../core/BaseAtomicOperation';
import { EventBus } from '../event-driven/EventBus';

/**
 * 实时帖子提取原子操作 - 微博优化版
 * 专门针对微博帖子链接格式的实时提取和验证
 */
export class RealTimePostExtractionOperation extends BaseAtomicOperation {
  private eventBus: EventBus;
  private extractedPosts: Set<string>;
  private extractionStats: {
    totalExtractions: number;
    uniquePosts: number;
    duplicatePosts: number;
    invalidPosts: number;
    extractionHistory: any[];
    lastExtractionTime: number;
    validationResults: any[];
  };

  constructor(config = {}) {
    super({
      name: 'RealTimePostExtractionOperation',
      type: 'real-time-post-extraction',
      description: '实时提取微博帖子链接，支持增量提取和验证',
      timeout: 300000,
      retryCount: 3,
      retryDelay: 1000,
      ...config
    });

    this.eventBus = new EventBus();
    this.extractedPosts = new Set();
    this.resetExtractionStats();
  }

  /**
   * 重置提取统计
   */
  private resetExtractionStats() {
    this.extractionStats = {
      totalExtractions: 0,
      uniquePosts: 0,
      duplicatePosts: 0,
      invalidPosts: 0,
      extractionHistory: [],
      lastExtractionTime: 0,
      validationResults: []
    };
  }

  /**
   * 执行实时帖子提取
   */
  async execute(context: any, params: any = {}) {
    const { page } = context;
    const {
      extractionTriggers = ['after-scroll', 'mutation-detected', 'time-interval'],
      extractionInterval = 3000,
      linkSelectors = [
        'a[href*="weibo.com/\\d+/[a-zA-Z0-9_]"]',
        'a[href*="/\\d+/[a-zA-Z0-9_]"]',
        '[class*="head-info_time"]'
      ],
      validation = {
        checkFormat: true,
        checkVisibility: true,
        checkDuplicates: true,
        checkAccessibility: true
      },
      extractionMode = 'incremental',
      batchSize = 10,
      maxExtractions = 100,
      timeout = 300000
    } = params;

    console.log(`🔍 开始实时帖子提取: 模式=${extractionMode}, 触发器=${extractionTriggers.join(', ')}`);

    this.resetExtractionStats();
    this.extractionStats.lastExtractionTime = Date.now();

    try {
      // 设置事件监听
      this.setupEventListeners();

      // 执行初始提取
      const initialResults = await this.extractWeiboPosts(page, {
        linkSelectors,
        validation,
        extractionMode,
        batchSize
      });

      console.log(`📊 初始提取结果: ${initialResults.newPosts.length} 新帖子, 总计 ${initialResults.totalPosts} 帖子`);

      // 根据触发器模式执行提取
      let extractionCount = 1;
      const startTime = Date.now();

      while (extractionCount < maxExtractions && (Date.now() - startTime) < timeout) {
        let shouldExtract = false;
        let triggerReason = '';

        // 检查各种触发条件
        if (extractionTriggers.includes('time-interval')) {
          const timeSinceLastExtraction = Date.now() - this.extractionStats.lastExtractionTime;
          if (timeSinceLastExtraction >= extractionInterval) {
            shouldExtract = true;
            triggerReason = 'time-interval';
          }
        }

        // 检查内容变化事件
        if (extractionTriggers.includes('mutation-detected')) {
          const hasNewContent = await this.checkForContentChanges(page);
          if (hasNewContent) {
            shouldExtract = true;
            triggerReason = 'mutation-detected';
          }
        }

        if (shouldExtract) {
          const results = await this.extractWeiboPosts(page, {
            linkSelectors,
            validation,
            extractionMode,
            batchSize
          });

          console.log(`🔍 提取 ${extractionCount}: ${triggerReason} - ${results.newPosts.length} 新帖子`);

          // 检查是否达到目标
          if (this.extractionStats.uniquePosts >= 50) {
            console.log(`🎯 已达到目标50个帖子`);
            break;
          }

          extractionCount++;
          this.extractionStats.lastExtractionTime = Date.now();
        }

        // 短暂等待
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 生成最终结果
      const finalResult = {
        totalUniquePosts: this.extractionStats.uniquePosts,
        totalExtractions: this.extractionStats.totalExtractions,
        duplicatePosts: this.extractionStats.duplicatePosts,
        invalidPosts: this.extractionStats.invalidPosts,
        extractionEfficiency: this.calculateExtractionEfficiency(),
        allPosts: Array.from(this.extractedPosts),
        extractionHistory: this.extractionStats.extractionHistory,
        validationResults: this.extractionStats.validationResults,
        completionReason: this.getCompletionReason(extractionCount, maxExtractions, timeout, startTime)
      };

      console.log(`🎯 提取完成: ${finalResult.totalUniquePosts} 唯一帖子, 效率=${finalResult.extractionEfficiency.toFixed(2)}%`);

      return finalResult;

    } catch (error) {
      console.error('❌ 实时帖子提取失败:', error.message);
      throw error;
    }
  }

  /**
   * 提取微博帖子
   */
  private async extractWeiboPosts(page: any, params: any) {
    const {
      linkSelectors,
      validation,
      extractionMode,
      batchSize
    } = params;

    this.extractionStats.totalExtractions++;

    // 在页面中执行提取
    const extractedData = await page.evaluate((selectors: string[]) => {
      const allLinks: any[] = [];

      // 使用所有选择器查找链接
      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element: Element) => {
            const link = element as HTMLAnchorElement;
            const href = link.href || '';

            // 微博帖子链接格式验证
            const weiboPattern = /weibo\.com\/(\d+)\/([a-zA-Z0-9_-]{8,})/;
            const match = href.match(weiboPattern);

            if (match) {
              const [fullUrl, userId, postId] = match;

              allLinks.push({
                url: fullUrl,
                userId: userId,
                postId: postId,
                text: link.textContent?.trim() || '',
                selector: selector,
                isVisible: link.offsetParent !== null,
                timestamp: Date.now()
              });
            }
          });
        } catch (error) {
          console.warn(`选择器 ${selector} 执行失败:`, error);
        }
      });

      // 去重
      const uniqueLinks = allLinks.filter((link, index, self) =>
        index === self.findIndex(l => l.url === link.url)
      );

      return {
        totalLinks: allLinks.length,
        uniqueLinks: uniqueLinks,
        extractionTime: Date.now()
      };
    }, linkSelectors);

    // 处理提取结果
    const processedResults = await this.processExtractedLinks(extractedData, validation);

    // 记录提取历史
    this.extractionStats.extractionHistory.push({
      extractionNumber: this.extractionStats.totalExtractions,
      timestamp: Date.now(),
      linksFound: extractedData.totalLinks,
      uniqueLinks: extractedData.uniqueLinks.length,
      newPosts: processedResults.newPosts.length,
      mode: extractionMode
    });

    return {
      newPosts: processedResults.newPosts,
      duplicatePosts: processedResults.duplicatePosts,
      invalidPosts: processedResults.invalidPosts,
      totalPosts: this.extractionStats.uniquePosts,
      extractionData: extractedData
    };
  }

  /**
   * 处理提取的链接
   */
  private async processExtractedLinks(extractedData: any, validation: any) {
    const newPosts: any[] = [];
    const duplicatePosts: any[] = [];
    const invalidPosts: any[] = [];

    for (const link of extractedData.uniqueLinks) {
      // 验证链接格式
      if (validation.checkFormat) {
        const isValidFormat = this.validateWeiboLinkFormat(link);
        if (!isValidFormat) {
          invalidPosts.push(link);
          this.extractionStats.invalidPosts++;
          continue;
        }
      }

      // 验证可见性
      if (validation.checkVisibility && !link.isVisible) {
        invalidPosts.push(link);
        this.extractionStats.invalidPosts++;
        continue;
      }

      // 检查重复
      if (validation.checkDuplicates && this.extractedPosts.has(link.url)) {
        duplicatePosts.push(link);
        this.extractionStats.duplicatePosts++;
        continue;
      }

      // 新的有效帖子
      newPosts.push(link);
      this.extractedPosts.add(link.url);
      this.extractionStats.uniquePosts++;

      // 记录验证结果
      this.extractionStats.validationResults.push({
        url: link.url,
        validationTime: Date.now(),
        isValid: true,
        checks: {
          format: validation.checkFormat,
          visibility: validation.checkVisibility,
          duplicate: validation.checkDuplicates,
          accessibility: validation.checkAccessibility
        }
      });
    }

    return { newPosts, duplicatePosts, invalidPosts };
  }

  /**
   * 验证微博链接格式
   */
  private validateWeiboLinkFormat(link: any): boolean {
    // 微博链接格式：https://weibo.com/数字ID/字母数字ID
    const weiboPattern = /^https:\/\/weibo\.com\/\d+\/[a-zA-Z0-9_-]{8,}$/;
    return weiboPattern.test(link.url);
  }

  /**
   * 检查内容变化
   */
  private async checkForContentChanges(page: any): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        // 检查是否有内容变化事件
        return new Promise((resolve) => {
          const checkChanges = () => {
            // 检查页面是否有新的微博相关元素
            const feedContainers = document.querySelectorAll('[class*="Feed"]');
            const articles = document.querySelectorAll('article');
            const links = document.querySelectorAll('a[href*="weibo.com/"]');

            // 简单的内容变化检测
            const hasSignificantChanges = feedContainers.length > 0 || articles.length > 0 || links.length > 0;
            resolve(hasSignificantChanges);
          };

          // 立即检查
          checkChanges();

          // 设置超时
          setTimeout(() => resolve(false), 1000);
        });
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    this.eventBus.on('scroll-performed', this.handleScrollPerformed.bind(this));
    this.eventBus.on('content-change', this.handleContentChange.bind(this));
  }

  /**
   * 处理滚动完成事件
   */
  private async handleScrollPerformed(data: any) {
    // 滚动后自动触发提取
    console.log('📜 滚动完成，触发帖子提取');
    // 这里可以添加自动提取逻辑
  }

  /**
   * 处理内容变化事件
   */
  private async handleContentChange(data: any) {
    // 内容变化后自动触发提取
    console.log('🔄 内容变化，触发帖子提取');
    // 这里可以添加自动提取逻辑
  }

  /**
   * 计算提取效率
   */
  private calculateExtractionEfficiency(): number {
    if (this.extractionStats.totalExtractions === 0) return 0;

    const efficiency = (this.extractionStats.uniquePosts / this.extractionStats.totalExtractions) * 100;
    return Math.min(efficiency, 100);
  }

  /**
   * 获取完成原因
   */
  private getCompletionReason(extractionCount: number, maxExtractions: number, timeout: number, startTime: number): string {
    if (this.extractionStats.uniquePosts >= 50) {
      return 'target-reached';
    }

    if (extractionCount >= maxExtractions) {
      return 'max-extractions-reached';
    }

    const elapsedTime = Date.now() - startTime;
    if (elapsedTime >= timeout) {
      return 'timeout';
    }

    return 'completed';
  }
}