/**
 * 微博专用导航策略
 * 专门针对微博页面特性优化的导航和等待策略
 */

class WeiboNavigationStrategy {
  constructor(options = {}) {
    this.options = {
      // 基础超时配置
      navigationTimeout: 15000,    // 页面导航超时
      elementTimeout: 8000,         // 元素等待超时
      contentTimeout: 12000,        // 内容加载超时
      scrollTimeout: 3000,          // 滚动等待超时

      // 等待策略
      waitStrategy: 'domcontentloaded',  // 默认使用DOM加载完成
      waitForContent: true,               // 是否等待关键内容
      maxScrollAttempts: 3,               // 最大滚动尝试次数

      // 重试配置
      maxRetries: 2,                      // 最大重试次数
      retryDelay: 2000,                   // 重试延迟

      // 微博特定配置
      weiboSelectors: {
        feedContainer: '[class*="Feed_body"], .Feed_body_3R0rO, [data-feed="true"]',
        mainContent: '.main, .main-content, [role="main"]',
        title: 'title',
        navigation: '.nav, .navigation, [role="navigation"]'
      },

      ...options
    };

    this.stats = {
      navigations: 0,
      successes: 0,
      failures: 0,
      averageLoadTime: 0,
      timeoutRate: 0
    };
  }

  /**
   * 微博专用导航方法
   */
  async navigateToWeiboPage(page, url, customOptions = {}) {
    const startTime = Date.now();
    const options = { ...this.options, ...customOptions };

    this.stats.navigations++;

    console.log(`🚀 开始微博专用导航: ${url}`);

    try {
      // 尝试导航，支持重试
      const result = await this.retryOperation(
        async () => await this.performWeiboNavigation(page, url, options),
        options.maxRetries,
        options.retryDelay
      );

      const loadTime = Date.now() - startTime;
      this.updateStats(true, loadTime);

      console.log(`✅ 微博导航成功: ${url} (耗时: ${loadTime}ms)`);
      return result;

    } catch (error) {
      const loadTime = Date.now() - startTime;
      this.updateStats(false, loadTime);

      console.error(`❌ 微博导航失败: ${url} - ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行微博导航的核心逻辑
   */
  async performWeiboNavigation(page, url, options) {
    // 第一阶段：基础导航
    await this.basicNavigation(page, url, options);

    // 第二阶段：页面验证
    await this.validatePage(page, options);

    // 第三阶段：内容等待（可选）
    if (options.waitForContent) {
      await this.waitForWeiboContent(page, options);
    }

    // 第四阶段：性能优化
    await this.optimizePagePerformance(page, options);

    return {
      success: true,
      url: url,
      loadTime: Date.now() - this.startTime,
      contentLoaded: options.waitForContent,
      strategy: options.waitStrategy
    };
  }

  /**
   * 基础导航阶段
   */
  async basicNavigation(page, url, options) {
    console.log('📄 第一阶段：执行基础导航...');

    // 设置页面超时
    await page.setDefaultTimeout(options.navigationTimeout);

    // 使用更宽松的等待策略
    const navigationResult = await Promise.race([
      page.goto(url, {
        waitUntil: options.waitStrategy,
        timeout: options.navigationTimeout
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('导航超时')), options.navigationTimeout);
      })
    ]);

    if (!navigationResult || navigationResult.status() >= 400) {
      throw new Error(`页面导航失败，状态码: ${navigationResult?.status() || '未知'}`);
    }

    console.log('✅ 基础导航完成');
  }

  /**
   * 页面验证阶段
   */
  async validatePage(page, options) {
    console.log('🔍 第二阶段：验证页面状态...');

    // 检查页面标题
    try {
      const title = await page.title();
      if (!title || title.includes('404') || title.includes('错误')) {
        throw new Error(`页面标题异常: ${title}`);
      }
      console.log(`📄 页面标题: ${title}`);
    } catch (error) {
      console.warn('⚠️ 无法获取页面标题，继续执行');
    }

    // 检查关键元素
    try {
      const mainContent = await page.$(options.weiboSelectors.mainContent);
      const hasContent = !!mainContent;

      if (!hasContent) {
        console.log('⚠️ 主内容区域未找到，尝试等待...');
        await page.waitForTimeout(2000);
      }

      console.log(`🎯 主内容区域: ${hasContent ? '✅ 已找到' : '⚠️ 未找到'}`);
    } catch (error) {
      console.warn('⚠️ 主内容区域检查失败，继续执行');
    }

    console.log('✅ 页面验证完成');
  }

  /**
   * 等待微博特定内容
   */
  async waitForWeiboContent(page, options) {
    console.log('⏳ 第三阶段：等待微博内容...');

    // 等待Feed容器（关键内容）
    try {
      await page.waitForSelector(options.weiboSelectors.feedContainer, {
        timeout: options.contentTimeout,
        state: 'attached'
      });
      console.log('✅ Feed容器已加载');
    } catch (error) {
      console.log('⚠️ Feed容器加载超时，继续执行');
    }

    // 智能滚动以触发内容加载
    await this.smartScrollForContent(page, options);

    console.log('✅ 内容等待完成');
  }

  /**
   * 智能滚动策略
   */
  async smartScrollForContent(page, options) {
    console.log('🔄 执行智能滚动策略...');

    let scrollCount = 0;
    let contentLoaded = false;

    while (scrollCount < options.maxScrollAttempts && !contentLoaded) {
      console.log(`🔄 第 ${scrollCount + 1} 次滚动...`);

      // 滚动到页面中部
      await page.evaluate(() => {
        window.scrollTo(0, window.innerHeight / 2);
      });

      await page.waitForTimeout(options.scrollTimeout);

      // 检查是否有新内容加载
      const hasNewContent = await this.checkForNewContent(page, options);

      if (hasNewContent) {
        contentLoaded = true;
        console.log('✅ 检测到新内容加载');
      } else {
        console.log('⚠️ 未检测到新内容，继续滚动');
      }

      scrollCount++;
    }

    if (!contentLoaded) {
      console.log('⚠️ 滚动后仍未检测到新内容，继续执行');
    }
  }

  /**
   * 检查是否有新内容加载
   */
  async checkForNewContent(page, options) {
    try {
      // 检查Feed元素数量
      const feedCount = await page.$$eval(
        options.weiboSelectors.feedContainer,
        elements => elements.length
      );

      // 检查是否有实际的内容元素
      const hasContent = feedCount > 0;

      // 检查页面高度是否变化
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);

      return hasContent && pageHeight > 1000;
    } catch (error) {
      return false;
    }
  }

  /**
   * 优化页面性能
   */
  async optimizePagePerformance(page, options) {
    console.log('⚡ 第四阶段：优化页面性能...');

    try {
      // 停止不必要的动画和视频
      await page.evaluate(() => {
        // 停止视频播放
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
          video.pause();
          video.src = '';
        });

        // 停止动画
        const animations = document.querySelectorAll('[class*="animate"], [class*="animation"]');
        animations.forEach(el => {
          el.style.animationPlayState = 'paused';
        });

        // 隐藏广告元素
        const ads = document.querySelectorAll('[class*="ad"], [class*="advertisement"], [data-ad]');
        ads.forEach(el => {
          el.style.display = 'none';
        });
      });

      // 等待一下让优化生效
      await page.waitForTimeout(1000);

      console.log('✅ 页面性能优化完成');
    } catch (error) {
      console.warn('⚠️ 页面性能优化失败，继续执行');
    }
  }

  /**
   * 重试操作
   */
  async retryOperation(operation, maxRetries, retryDelay) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt <= maxRetries) {
          console.log(`🔄 第 ${attempt} 次尝试失败，${retryDelay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));

          // 指数退避
          retryDelay *= 1.5;
        } else {
          console.log(`❌ 所有重试尝试都失败了`);
        }
      }
    }

    throw lastError;
  }

  /**
   * 更新统计信息
   */
  updateStats(success, loadTime) {
    if (success) {
      this.stats.successes++;
    } else {
      this.stats.failures++;
    }

    // 更新平均加载时间
    this.stats.averageLoadTime =
      (this.stats.averageLoadTime + loadTime) / 2;

    // 更新超时率
    this.stats.timeoutRate =
      this.stats.failures / this.stats.navigations;
  }

  /**
   * 获取统计报告
   */
  getStats() {
    return {
      ...this.stats,
      successRate: `${(this.stats.successes / this.stats.navigations * 100).toFixed(1)}%`,
      timeoutRate: `${(this.stats.timeoutRate * 100).toFixed(1)}%`,
      health: this.stats.timeoutRate < 0.2 ? 'good' : 'warning'
    };
  }

  /**
   * 微博主页专用导航
   */
  async navigateToWeiboHomepage(page, customOptions = {}) {
    const homepageOptions = {
      ...customOptions,
      waitForContent: true,
      maxScrollAttempts: 2,
      contentTimeout: 10000
    };

    return await this.navigateToWeiboPage(page, 'https://weibo.com', homepageOptions);
  }

  /**
   * 微博帖子页面专用导航
   */
  async navigateToWeiboPost(page, postUrl, customOptions = {}) {
    const postOptions = {
      ...customOptions,
      waitForContent: true,
      maxScrollAttempts: 3,
      contentTimeout: 15000,
      scrollTimeout: 2000
    };

    return await this.navigateToWeiboPage(page, postUrl, postOptions);
  }

  /**
   * 微博用户页面专用导航
   */
  async navigateToWeiboProfile(page, profileUrl, customOptions = {}) {
    const profileOptions = {
      ...customOptions,
      waitForContent: true,
      maxScrollAttempts: 2,
      contentTimeout: 12000
    };

    return await this.navigateToWeiboPage(page, profileUrl, profileOptions);
  }
}

module.exports = WeiboNavigationStrategy;