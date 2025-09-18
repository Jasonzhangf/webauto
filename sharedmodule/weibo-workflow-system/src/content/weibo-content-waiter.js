/**
 * 微博智能内容等待器
 * 针对微博动态加载特性优化的智能等待策略
 */

class WeiboContentWaiter {
  constructor(options = {}) {
    this.options = {
      // 基础配置
      maxWaitTime: 12000,            // 最大等待时间
      checkInterval: 800,            // 检查间隔
      stabilityThreshold: 2000,      // 稳定性阈值（内容不变化的时间）

      // 选择器配置
      selectors: {
        feedContainer: '[class*="Feed_body"], .Feed_body_3R0rO, [data-feed="true"]',
        feedItems: '[class*="Feed_item"], [data-feed-item], article',
        comments: '[class*="Comment"], [class*="comment"], .comment-container',
        images: 'img[src*="jpg"], img[src*="png"], img[src*="jpeg"]',
        videos: 'video',
        loading: '[class*="loading"], [class*="spinner"], .loading-indicator',
        skeleton: '[class*="skeleton"], [class*="placeholder"]'
      },

      // 内容检测配置
      contentDetection: {
        minFeedItems: 3,             // 最小Feed项目数
        minComments: 1,              // 最小评论数
        minImages: 1,                // 最小图片数
        stabilityChecks: 3           // 稳定性检查次数
      },

      // 滚动配置
      scroll: {
        stepSize: 300,               // 滚动步长
        waitAfterScroll: 1500,       // 滚动后等待时间
        maxScrolls: 5                // 最大滚动次数
      },

      ...options
    };

    this.waitStats = {
      totalWaits: 0,
      successfulWaits: 0,
      averageWaitTime: 0,
      timeouts: 0
    };
  }

  /**
   * 等待微博Feed内容加载
   */
  async waitForFeedContent(page, customOptions = {}) {
    const startTime = Date.now();
    const options = { ...this.options, ...customOptions };

    console.log('⏳ 开始等待微博Feed内容...');
    this.waitStats.totalWaits++;

    try {
      const result = await this.waitForContentWithStrategy(
        page,
        this.detectFeedContent.bind(this),
        options
      );

      const waitTime = Date.now() - startTime;
      this.updateWaitStats(true, waitTime);

      console.log(`✅ Feed内容等待完成 (${waitTime}ms)`);
      return result;

    } catch (error) {
      const waitTime = Date.now() - startTime;
      this.updateWaitStats(false, waitTime);

      console.error(`❌ Feed内容等待失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 等待微博评论内容加载
   */
  async waitForCommentsContent(page, customOptions = {}) {
    const startTime = Date.now();
    const options = {
      ...this.options,
      ...customOptions,
      maxWaitTime: customOptions.maxWaitTime || 10000
    };

    console.log('⏳ 开始等待微博评论内容...');
    this.waitStats.totalWaits++;

    try {
      const result = await this.waitForContentWithStrategy(
        page,
        this.detectCommentsContent.bind(this),
        options
      );

      const waitTime = Date.now() - startTime;
      this.updateWaitStats(true, waitTime);

      console.log(`✅ 评论内容等待完成 (${waitTime}ms)`);
      return result;

    } catch (error) {
      const waitTime = Date.now() - startTime;
      this.updateWaitStats(false, waitTime);

      console.error(`❌ 评论内容等待失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 等待微博图片内容加载
   */
  async waitForImagesContent(page, customOptions = {}) {
    const startTime = Date.now();
    const options = {
      ...this.options,
      ...customOptions,
      maxWaitTime: customOptions.maxWaitTime || 8000
    };

    console.log('⏳ 开始等待微博图片内容...');
    this.waitStats.totalWaits++;

    try {
      const result = await this.waitForContentWithStrategy(
        page,
        this.detectImagesContent.bind(this),
        options
      );

      const waitTime = Date.now() - startTime;
      this.updateWaitStats(true, waitTime);

      console.log(`✅ 图片内容等待完成 (${waitTime}ms)`);
      return result;

    } catch (error) {
      const waitTime = Date.now() - startTime;
      this.updateWaitStats(false, waitTime);

      console.error(`❌ 图片内容等待失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 通用内容等待策略
   */
  async waitForContentWithStrategy(page, detectionStrategy, options) {
    const startTime = Date.now();
    let lastContentHash = '';
    let stableChecks = 0;
    let scrollCount = 0;

    while (Date.now() - startTime < options.maxWaitTime) {
      try {
        // 检测当前内容状态
        const contentInfo = await detectionStrategy(page);

        // 计算内容哈希以检测变化
        const currentHash = this.calculateContentHash(contentInfo);

        if (currentHash !== lastContentHash) {
          lastContentHash = currentHash;
          stableChecks = 0;
          console.log(`🔄 检测到内容变化，重新计数...`);
        } else {
          stableChecks++;
          console.log(`📊 内容稳定性检查: ${stableChecks}/${options.contentDetection.stabilityChecks}`);
        }

        // 检查是否达到稳定性要求
        if (stableChecks >= options.contentDetection.stabilityChecks) {
          console.log('✅ 内容已稳定');
          return {
            success: true,
            contentInfo,
            waitTime: Date.now() - startTime,
            stable: true
          };
        }

        // 如果内容不足，尝试滚动
        if (this.shouldScroll(contentInfo, options) && scrollCount < options.scroll.maxScrolls) {
          console.log(`🔄 执行第 ${scrollCount + 1} 次滚动...`);
          await this.performSmartScroll(page, options.scroll);
          scrollCount++;
          await new Promise(resolve => setTimeout(resolve, options.scroll.waitAfterScroll));
        }

      } catch (error) {
        console.warn(`⚠️ 内容检测失败: ${error.message}`);
      }

      // 等待下一次检查
      await new Promise(resolve => setTimeout(resolve, options.checkInterval));
    }

    throw new Error(`内容等待超时 (${options.maxWaitTime}ms)`);
  }

  /**
   * 检测Feed内容
   */
  async detectFeedContent(page) {
    const { selectors } = this.options;

    const feedCount = await page.$$eval(selectors.feedItems, elements => elements.length);

    const contentInfo = {
      feedCount,
      hasContainer: await page.$(selectors.feedContainer) !== null,
      hasLoading: await page.$(selectors.loading) !== null,
      hasSkeleton: await page.$(selectors.skeleton) !== null,
      pageHeight: await page.evaluate(() => document.body.scrollHeight),
      scrollHeight: await page.evaluate(() => window.scrollY + window.innerHeight)
    };

    console.log(`📊 Feed检测: ${feedCount}个项目, 加载中: ${contentInfo.hasLoading}, 骨架屏: ${contentInfo.hasSkeleton}`);

    return contentInfo;
  }

  /**
   * 检测评论内容
   */
  async detectCommentsContent(page) {
    const { selectors } = this.options;

    const commentCount = await page.$$eval(selectors.comments, elements => elements.length);

    const contentInfo = {
      commentCount,
      hasContainer: commentCount > 0,
      hasLoading: await page.$(selectors.loading) !== null,
      pageHeight: await page.evaluate(() => document.body.scrollHeight),
      hasImages: await page.$$(selectors.images).then(elements => elements.length > 0)
    };

    console.log(`📊 评论检测: ${commentCount}条评论, 加载中: ${contentInfo.hasLoading}`);

    return contentInfo;
  }

  /**
   * 检测图片内容
   */
  async detectImagesContent(page) {
    const { selectors } = this.options;

    const imageElements = await page.$$(selectors.images);
    const images = await Promise.all(
      imageElements.map(async img => {
        const src = await img.getAttribute('src');
        const naturalWidth = await img.evaluate(img => img.naturalWidth);
        const naturalHeight = await img.evaluate(img => img.naturalHeight);

        return {
          src,
          loaded: naturalWidth > 0 && naturalHeight > 0,
          width: naturalWidth,
          height: naturalHeight
        };
      })
    );

    const loadedImages = images.filter(img => img.loaded && img.src);

    const contentInfo = {
      totalImages: images.length,
      loadedImages: loadedImages.length,
      hasContainer: loadedImages.length > 0,
      hasLoading: await page.$(selectors.loading) !== null,
      averageSize: loadedImages.length > 0 ? {
        width: loadedImages.reduce((sum, img) => sum + img.width, 0) / loadedImages.length,
        height: loadedImages.reduce((sum, img) => sum + img.height, 0) / loadedImages.length
      } : null
    };

    console.log(`📊 图片检测: ${loadedImages.length}/${images.length} 已加载`);

    return contentInfo;
  }

  /**
   * 判断是否需要滚动
   */
  shouldScroll(contentInfo, options) {
    const { minFeedItems, minComments, minImages } = options.contentDetection;

    // Feed内容不足
    if (contentInfo.feedCount !== undefined && contentInfo.feedCount < minFeedItems) {
      return true;
    }

    // 评论内容不足
    if (contentInfo.commentCount !== undefined && contentInfo.commentCount < minComments) {
      return true;
    }

    // 图片内容不足
    if (contentInfo.loadedImages !== undefined && contentInfo.loadedImages < minImages) {
      return true;
    }

    // 仍然在加载中
    if (contentInfo.hasLoading || contentInfo.hasSkeleton) {
      return true;
    }

    // 页面高度不足
    if (contentInfo.scrollHeight >= contentInfo.pageHeight - 100) {
      return true;
    }

    return false;
  }

  /**
   * 执行智能滚动
   */
  async performSmartScroll(page, scrollConfig) {
    try {
      await page.evaluate((stepSize) => {
        const currentScroll = window.scrollY;
        const targetScroll = currentScroll + stepSize;

        window.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      }, scrollConfig.stepSize);

    } catch (error) {
      console.warn('⚠️ 滚动执行失败:', error.message);
    }
  }

  /**
   * 计算内容哈希
   */
  calculateContentHash(contentInfo) {
    const relevantInfo = {
      feedCount: contentInfo.feedCount,
      commentCount: contentInfo.commentCount,
      loadedImages: contentInfo.loadedImages,
      hasLoading: contentInfo.hasLoading,
      pageHeight: contentInfo.pageHeight
    };

    return JSON.stringify(relevantInfo);
  }

  /**
   * 更新等待统计
   */
  updateWaitStats(success, waitTime) {
    if (success) {
      this.waitStats.successfulWaits++;
    } else {
      this.waitStats.timeouts++;
    }

    this.waitStats.averageWaitTime =
      (this.waitStats.averageWaitTime + waitTime) / 2;
  }

  /**
   * 获取等待统计
   */
  getWaitStats() {
    return {
      ...this.waitStats,
      successRate: `${(this.waitStats.successfulWaits / this.waitStats.totalWaits * 100).toFixed(1)}%`,
      timeoutRate: `${(this.waitStats.timeouts / this.waitStats.totalWaits * 100).toFixed(1)}%`
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.waitStats = {
      totalWaits: 0,
      successfulWaits: 0,
      averageWaitTime: 0,
      timeouts: 0
    };
  }

  /**
   * 综合内容等待（等待所有类型的内容）
   */
  async waitForAllContent(page, customOptions = {}) {
    console.log('⏳ 开始等待所有微博内容...');

    const options = { ...this.options, ...customOptions };

    const results = {};

    try {
      // 并行等待不同类型的内容
      const [feedResult, commentsResult, imagesResult] = await Promise.allSettled([
        this.waitForFeedContent(page, options),
        this.waitForCommentsContent(page, { ...options, maxWaitTime: 8000 }),
        this.waitForImagesContent(page, { ...options, maxWaitTime: 6000 })
      ]);

      results.feed = feedResult.status === 'fulfilled' ? feedResult.value : null;
      results.comments = commentsResult.status === 'fulfilled' ? commentsResult.value : null;
      results.images = imagesResult.status === 'fulfilled' ? imagesResult.value : null;

      // 记录失败的情况
      if (feedResult.status === 'rejected') {
        console.warn('⚠️ Feed内容等待失败:', feedResult.reason.message);
      }
      if (commentsResult.status === 'rejected') {
        console.warn('⚠️ 评论内容等待失败:', commentsResult.reason.message);
      }
      if (imagesResult.status === 'rejected') {
        console.warn('⚠️ 图片内容等待失败:', imagesResult.reason.message);
      }

      console.log('✅ 综合内容等待完成');
      return results;

    } catch (error) {
      console.error('❌ 综合内容等待失败:', error.message);
      throw error;
    }
  }

  /**
   * 快速内容检测（用于验证基本内容是否已加载）
   */
  async quickContentCheck(page) {
    try {
      const { selectors } = this.options;

      const [hasFeed, hasComments, hasImages] = await Promise.all([
        page.$$(selectors.feedItems).then(elements => elements.length > 0),
        page.$$(selectors.comments).then(elements => elements.length > 0),
        page.$$(selectors.images).then(elements => elements.length > 0)
      ]);

      return {
        hasBasicContent: hasFeed || hasComments || hasImages,
        hasFeed,
        hasComments,
        hasImages,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        hasBasicContent: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

module.exports = WeiboContentWaiter;