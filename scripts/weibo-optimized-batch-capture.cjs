/**
 * 微博优化版本批量捕获脚本
 * 集成了所有微博专用优化的批量下载系统
 */

const { createTestSystem, validateCookieFile, cleanupTestResults, createTestReport } = require('../tests/utils/test-helpers.cjs');
const { TEST_CONFIG } = require('../tests/utils/test-config.cjs');
const WeiboNavigationStrategy = require('../sharedmodule/weibo-workflow-system/src/navigation/weibo-navigation-strategy.js');
const WeiboTimeoutConfig = require('../sharedmodule/weibo-workflow-system/src/config/weibo-timeout-config.js');
const WeiboContentWaiter = require('../sharedmodule/weibo-workflow-system/src/content/weibo-content-waiter.js');
const fs = require('fs');
const path = require('path');

class WeiboOptimizedBatchCapture {
  constructor(options = {}) {
    this.options = {
      targetLinkCount: options.targetLinkCount || 50,
      maxDownloadPosts: options.maxDownloadPosts || 10,
      concurrentDownloads: options.concurrentDownloads || false,

      // 优化配置
      enableOptimizedNavigation: true,
      enableSmartWaiting: true,
      enableTimeoutRetry: true,

      // 性能配置
      maxConcurrent: options.maxConcurrent || 2,
      retryFailedItems: true,

      ...options
    };

    this.results = {
      links: [],
      downloads: [],
      summary: {},
      performance: {}
    };

    // 初始化优化组件
    this.timeoutConfig = new WeiboTimeoutConfig();
    this.contentWaiter = new WeiboContentWaiter();

    this.testSystem = null;
    this.weiboNavigation = null;
  }

  async initialize() {
    console.log('🚀 初始化微博优化批量捕获系统...');

    // 验证Cookie
    const cookieValidation = validateCookieFile();
    if (!cookieValidation.valid) {
      throw new Error('Cookie验证失败');
    }

    console.log(`✅ Cookie验证成功 (${cookieValidation.count} 个Cookie)`);

    // 清理结果目录
    cleanupTestResults();

    // 创建优化配置
    const testSystemOptions = {
      logLevel: 'info',
      headless: false,  // 改为非headless模式
      timeout: this.timeoutConfig.getBaseTimeout('medium'),
      weiboNavigation: {
        navigationTimeout: this.timeoutConfig.getNavigationTimeout('homepage'),
        elementTimeout: this.timeoutConfig.getWaitTimeout('element'),
        contentTimeout: this.timeoutConfig.getContentTimeout('feedLoad'),
        maxRetries: this.timeoutConfig.getRetryConfig().maxAttempts
      }
    };

    // 创建测试系统
    this.testSystem = createTestSystem(testSystemOptions);

    await this.testSystem.initialize();

    // 创建微博导航策略
    this.weiboNavigation = new WeiboNavigationStrategy(testSystemOptions.weiboNavigation);

    console.log('✅ 优化测试系统初始化完成');
  }

  async extractHomepageLinks() {
    console.log(`\n🔍 开始优化提取微博主页链接 (目标: ${this.options.targetLinkCount} 条)...`);

    const startTime = Date.now();

    try {
      // 使用优化的导航策略
      const navigationResult = await this.weiboNavigation.navigateToWeiboHomepage(
        this.testSystem.state.page,
        {
          waitForContent: true,
          maxScrollAttempts: 3,
          contentTimeout: this.timeoutConfig.getContentTimeout('feedLoad')
        }
      );

      console.log('✅ 优化导航完成');

      // 使用智能内容等待器
      if (this.options.enableSmartWaiting) {
        console.log('⏳ 使用智能内容等待器...');
        await this.contentWaiter.waitForFeedContent(this.testSystem.state.page, {
          maxWaitTime: this.timeoutConfig.getContentTimeout('feedLoad'),
          stabilityThreshold: 2000
        });
      }

      // 执行链接提取
      const links = await this.optimizedLinkExtraction();

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.links = {
        ...links,
        duration: duration,
        achievedTarget: links.postCount >= this.options.targetLinkCount,
        navigationResult: navigationResult,
        optimizations: {
          optimizedNavigation: this.options.enableOptimizedNavigation,
          smartWaiting: this.options.enableSmartWaiting,
          timeoutRetry: this.options.enableTimeoutRetry
        }
      };

      console.log('\n🎯 优化链接提取结果:');
      console.log(`- 目标数量: ${this.options.targetLinkCount}`);
      console.log(`- 实际获取: ${this.results.links.postCount}`);
      console.log(`- 执行时间: ${duration}ms`);
      console.log(`- 优化效果: 导航${navigationResult.success ? '✅' : '❌'}, 等待${this.options.enableSmartWaiting ? '✅' : '❌'}`);

      // 保存结果
      const linksFile = `${TEST_CONFIG.paths.outputDir}/optimized-capture-links-${Date.now()}.json`;
      fs.writeFileSync(linksFile, JSON.stringify(this.results.links, null, 2));
      console.log(`📁 优化链接已保存到: ${linksFile}`);

      return this.results.links;

    } catch (error) {
      console.error('❌ 优化链接提取失败:', error.message);
      throw error;
    }
  }

  async optimizedLinkExtraction() {
    console.log('🔗 开始优化链接提取...');

    let allLinks = new Set();
    let scrollCount = 0;
    const maxScrolls = 8;

    while (allLinks.size < this.options.targetLinkCount && scrollCount < maxScrolls) {
      console.log(`🔄 第 ${scrollCount + 1} 次优化滚动...`);

      // 智能滚动
      await this.optimizedScroll(scrollCount);

      // 等待内容加载
      if (this.options.enableSmartWaiting) {
        await this.testSystem.state.page.waitForTimeout(1500);
      }

      // 提取当前页面的链接
      const currentLinks = await this.extractCurrentPageLinks();

      // 添加到总链接集合
      currentLinks.forEach(link => allLinks.add(link));
      scrollCount++;

      console.log(`📊 当前进度: ${allLinks.size}/${this.options.targetLinkCount} 条链接`);

      // 如果已经提取到足够的链接，提前结束
      if (allLinks.size >= this.options.targetLinkCount) {
        break;
      }
    }

    // 过滤和清理链接
    const postLinks = this.filterPostLinks(Array.from(allLinks));

    return {
      allLinks: Array.from(allLinks),
      postLinks: postLinks,
      targetCount: this.options.targetLinkCount,
      totalLinks: allLinks.size,
      postCount: postLinks.length,
      scrollCount: scrollCount,
      efficiency: (postLinks.length / scrollCount).toFixed(2)
    };
  }

  async optimizedScroll(scrollCount) {
    const scrollStrategies = [
      () => this.testSystem.state.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)),
      () => this.testSystem.state.page.evaluate(() => window.scrollTo(0, window.scrollY + 800)),
      () => this.testSystem.state.page.evaluate(() => window.scrollTo(0, window.scrollY + 400))
    ];

    const strategy = scrollStrategies[scrollCount % scrollStrategies.length];
    await strategy();
  }

  async extractCurrentPageLinks() {
    return await this.testSystem.state.page.evaluate(() => {
      const linkElements = document.querySelectorAll('a[href*="weibo.com"]');
      const validLinks = new Set();

      linkElements.forEach(link => {
        const href = link.href;
        if (href && href.includes('weibo.com') &&
            (href.includes('/status/') || href.match(/\/[A-Za-z0-9]+$/))) {
          const cleanUrl = href.split('?')[0].split('#')[0];
          validLinks.add(cleanUrl);
        }
      });

      return Array.from(validLinks);
    });
  }

  filterPostLinks(links) {
    return links.filter(link => {
      return link.match(/weibo\.com\/\d+\/[A-Za-z0-9]+$/) ||
             link.match(/weibo\.com\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/);
    });
  }

  async batchDownloadPosts() {
    const postsToDownload = Math.min(
      this.options.maxDownloadPosts,
      this.results.links.postCount
    );

    if (postsToDownload === 0) {
      console.log('❌ 没有可下载的帖子');
      return;
    }

    console.log(`\n📥 开始优化批量下载 ${postsToDownload} 个帖子...`);
    console.log(`📊 下载模式: ${this.options.concurrentDownloads ? '并发' : '顺序'}`);
    console.log(`🚀 优化特性: 导航${this.options.enableOptimizedNavigation ? '✅' : '❌'}, 等待${this.options.enableSmartWaiting ? '✅' : '❌'}, 重试${this.options.enableTimeoutRetry ? '✅' : '❌'}`);

    const startTime = Date.now();
    const testLinks = this.results.links.postLinks.slice(0, postsToDownload);

    try {
      if (this.options.concurrentDownloads) {
        await this.optimizedConcurrentDownload(testLinks);
      } else {
        await this.optimizedSequentialDownload(testLinks);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.summary = {
        targetPosts: postsToDownload,
        successCount: this.results.downloads.filter(d => d.success).length,
        errorCount: this.results.downloads.filter(d => !d.success).length,
        totalComments: this.results.downloads.reduce((sum, d) => sum + (d.commentCount || 0), 0),
        totalImages: this.results.downloads.reduce((sum, d) => sum + (d.imageCount || 0), 0),
        duration: duration,
        mode: this.options.concurrentDownloads ? 'concurrent' : 'sequential',
        optimizations: this.options,
        timestamp: new Date().toISOString()
      };

      this.results.performance = {
        averagePostTime: duration / postsToDownload,
        successRate: (this.results.summary.successCount / postsToDownload * 100).toFixed(1),
        throughput: (this.results.summary.totalComments / duration * 1000).toFixed(2),
        navigationStats: this.weiboNavigation.getStats(),
        contentWaitStats: this.contentWaiter.getWaitStats()
      };

      this.displayOptimizedResults();

      // 保存完整结果
      const resultFile = `${TEST_CONFIG.paths.outputDir}/optimized-capture-complete-${Date.now()}.json`;
      const completeResults = {
        links: this.results.links,
        downloads: this.results.downloads,
        summary: this.results.summary,
        performance: this.results.performance,
        config: this.options
      };

      fs.writeFileSync(resultFile, JSON.stringify(completeResults, null, 2));
      console.log(`\n📁 优化结果已保存到: ${resultFile}`);

      return this.results.summary;

    } catch (error) {
      console.error('❌ 优化批量下载失败:', error.message);
      throw error;
    }
  }

  async optimizedSequentialDownload(links) {
    console.log('🔄 使用优化顺序下载模式...');

    const retryExecutor = this.timeoutConfig.createRetryExecutor(
      this.downloadSinglePost.bind(this),
      'content',
      'commentsLoad'
    );

    for (let i = 0; i < links.length; i++) {
      const url = links[i];
      const postStartTime = Date.now();

      try {
        console.log(`📥 优化下载第 ${i + 1}/${links.length} 个帖子: ${url}`);

        const downloadResult = await retryExecutor(url);

        const postEndTime = Date.now();
        const postDuration = postEndTime - postStartTime;

        const result = {
          url: url,
          success: true,
          ...downloadResult,
          downloadTime: postDuration,
          timestamp: new Date().toISOString()
        };

        this.results.downloads.push(result);

        console.log(`✅ ${url}: ${downloadResult.commentCount} 评论, ${downloadResult.imageCount} 图片 (${postDuration}ms)`);

      } catch (error) {
        const errorResult = {
          url: url,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };

        this.results.downloads.push(errorResult);
        console.log(`❌ ${url}: ${error.message}`);
      }
    }
  }

  async optimizedConcurrentDownload(links) {
    console.log('🔄 使用优化并发下载模式...');

    const concurrentLinks = links.slice(0, this.options.maxConcurrent);
    const downloadPromises = concurrentLinks.map(async (url, index) => {
      // 为每个帖子创建独立的测试系统
      const system = createTestSystem({
        logLevel: 'warn', // 减少日志输出
        headless: false,  // 改为非headless模式
        timeout: this.timeoutConfig.getBaseTimeout('medium'),
        weiboNavigation: {
          navigationTimeout: this.timeoutConfig.getNavigationTimeout('post'),
          elementTimeout: this.timeoutConfig.getWaitTimeout('element'),
          contentTimeout: this.timeoutConfig.getContentTimeout('commentsLoad'),
          maxRetries: 1 // 并发模式下减少重试
        }
      });

      await system.initialize();
      const navigation = new WeiboNavigationStrategy(system.config.weiboNavigation);

      const postStartTime = Date.now();

      try {
        console.log(`📥 并发下载第 ${index + 1}/${concurrentLinks.length} 个帖子: ${url}`);

        // 使用优化的导航
        await navigation.navigateToWeiboPost(system.state.page, url);

        // 使用智能等待
        if (this.options.enableSmartWaiting) {
          await this.contentWaiter.waitForCommentsContent(system.state.page, {
            maxWaitTime: this.timeoutConfig.getContentTimeout('commentsLoad')
          });
        }

        // 提取内容
        const postContent = await this.extractPostContent(system);

        const postEndTime = Date.now();
        const postDuration = postEndTime - postStartTime;

        return {
          url: url,
          success: true,
          ...postContent,
          downloadTime: postDuration,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        return {
          url: url,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      } finally {
        await system.cleanup();
      }
    });

    // 等待所有下载完成
    const downloadResults = await Promise.allSettled(downloadPromises);

    downloadResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        this.results.downloads.push(result.value);
        if (result.value.success) {
          console.log(`✅ ${result.value.url}: ${result.value.commentCount} 评论, ${result.value.imageCount} 图片 (${result.value.downloadTime}ms)`);
        } else {
          console.log(`❌ ${result.value.url}: ${result.value.error}`);
        }
      } else {
        console.log(`❌ ${concurrentLinks[index]}: ${result.reason.message}`);
      }
    });
  }

  async downloadSinglePost(url) {
    // 使用优化的帖子导航
    await this.weiboNavigation.navigateToWeiboPost(
      this.testSystem.state.page,
      url,
      {
        contentTimeout: this.timeoutConfig.getContentTimeout('commentsLoad'),
        maxScrollAttempts: 2
      }
    );

    // 使用智能内容等待
    if (this.options.enableSmartWaiting) {
      await this.contentWaiter.waitForCommentsContent(this.testSystem.state.page, {
        maxWaitTime: this.timeoutConfig.getContentTimeout('commentsLoad')
      });
    }

    // 提取内容
    return await this.extractPostContent();
  }

  async extractPostContent(system = this.testSystem) {
    // 优化的评论提取
    const commentElements = await system.state.page.$$(
      '[class*="Comment"] div, [class*="comment"] div, .Feed_body_3R0rO div'
    );
    const commentTexts = await Promise.all(
      commentElements.slice(0, 50).map(el => el.textContent().catch(() => '')) // 限制数量
    );

    const comments = commentTexts
      .filter(text => text && text.trim().length > 5)
      .map(text => text.trim())
      .slice(0, 100); // 限制返回数量

    // 优化的图片提取
    const imageElements = await system.state.page.$$('img');
    const imageSrcs = await Promise.all(
      imageElements.map(el => el.getAttribute('src').catch(() => ''))
    );

    const images = imageSrcs
      .filter(src => src && src.startsWith('http') && src.match(/\.(jpg|jpeg|png|webp)/i))
      .map(src => src.trim())
      .slice(0, 20); // 限制返回数量

    // 提取页面标题
    const title = await system.state.page.title();

    return {
      title: title,
      comments: [...new Set(comments)],
      images: [...new Set(images)],
      commentCount: comments.length,
      imageCount: images.length
    };
  }

  displayOptimizedResults() {
    console.log('\n🎯 优化批量下载完成!');
    console.log(`- 目标帖子: ${this.results.summary.targetPosts}`);
    console.log(`- 成功下载: ${this.results.summary.successCount}`);
    console.log(`- 下载失败: ${this.results.summary.errorCount}`);
    console.log(`- 总评论数: ${this.results.summary.totalComments}`);
    console.log(`- 总图片数: ${this.results.summary.totalImages}`);
    console.log(`- 执行时间: ${this.results.summary.duration}ms`);
    console.log(`- 平均每帖: ${this.results.performance.averagePostTime.toFixed(0)}ms`);
    console.log(`- 成功率: ${this.results.performance.successRate}%`);

    if (this.results.performance.navigationStats) {
      console.log(`- 导航成功率: ${this.results.performance.navigationStats.successRate}`);
    }

    if (this.results.summary.errorCount > 0) {
      console.log('\n❌ 失败的帖子:');
      this.results.downloads.filter(d => !d.success).forEach(d => {
        console.log(`  - ${d.url}: ${d.error}`);
      });
    }
  }

  async cleanup() {
    if (this.testSystem) {
      await this.testSystem.cleanup();
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.extractHomepageLinks();
      await this.batchDownloadPosts();

      console.log('\n🎉 微博优化批量捕获任务完成！');
      console.log('📋 优化效果总结:');
      console.log(`- 链接提取: ${this.results.links.achievedTarget ? '✅' : '⚠️'} ${this.results.links.postCount}/${this.options.targetLinkCount}`);
      console.log(`- 批量下载: ${this.results.summary.successCount}/${this.results.summary.targetPosts}`);
      console.log(`- 总评论数: ${this.results.summary.totalComments}`);
      console.log(`- 总图片数: ${this.results.summary.totalImages}`);
      console.log(`- 总耗时: ${this.results.links.duration + this.results.summary.duration}ms`);
      console.log(`- 优化特性: 导航${this.options.enableOptimizedNavigation ? '✅' : '❌'}, 等待${this.options.enableSmartWaiting ? '✅' : '❌'}, 重试${this.options.enableTimeoutRetry ? '✅' : '❌'}`);

      return this.results;

    } catch (error) {
      console.error('❌ 优化批量捕获任务失败:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const optimizedBatchCapture = new WeiboOptimizedBatchCapture({
    targetLinkCount: 50,
    maxDownloadPosts: 10,
    concurrentDownloads: false,
    enableOptimizedNavigation: true,
    enableSmartWaiting: true,
    enableTimeoutRetry: true
  });

  optimizedBatchCapture.run()
    .then(results => {
      console.log('\n🎊 优化任务成功完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 优化任务失败:', error.message);
      process.exit(1);
    });
}

module.exports = WeiboOptimizedBatchCapture;