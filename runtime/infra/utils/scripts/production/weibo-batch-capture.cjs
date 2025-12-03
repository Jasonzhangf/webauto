/**
 * 微博批量捕获脚本
 * 从主页提取50条链接并批量下载
 */

const { createTestSystem, validateCookieFile, cleanupTestResults, createTestReport } = require('../tests/utils/test-helpers.cjs');
const { TEST_CONFIG } = require('../tests/utils/test-config.cjs');
const fs = require('fs');
const path = require('path');

class WeiboBatchCapture {
  constructor(options = {}) {
    this.options = {
      targetLinkCount: options.targetLinkCount || 50,
      maxDownloadPosts: options.maxDownloadPosts || 10,
      concurrentDownloads: options.concurrentDownloads || false,
      ...options
    };

    this.results = {
      links: [],
      downloads: [],
      summary: {}
    };

    this.testSystem = null;
  }

  async initialize() {
    console.log('🚀 初始化微博批量捕获系统...');

    // 验证Cookie
    const cookieValidation = validateCookieFile();
    if (!cookieValidation.valid) {
      throw new Error('Cookie验证失败');
    }

    console.log(`✅ Cookie验证成功 (${cookieValidation.count} 个Cookie)`);

    // 清理结果目录
    cleanupTestResults();

    // 创建测试系统
    this.testSystem = createTestSystem({
      logLevel: 'info',
      timeout: 120000
    });

    await this.testSystem.initialize();
    console.log('✅ 测试系统初始化完成');
  }

  async extractHomepageLinks() {
    console.log(`\n🔍 开始提取微博主页链接 (目标: ${this.options.targetLinkCount} 条)...`);

    const startTime = Date.now();

    try {
      // 访问微博主页
      await this.testSystem.executeAtomicOperation('navigate', {
        url: TEST_CONFIG.urls.homepage
      });

      await this.testSystem.state.page.waitForTimeout(5000);

      let allLinks = new Set();
      let scrollCount = 0;
      const maxScrolls = 15;

      while (allLinks.size < this.options.targetLinkCount && scrollCount < maxScrolls) {
        console.log(`🔄 第 ${scrollCount + 1} 次滚动...`);

        // 滚动到底部
        await this.testSystem.executeAtomicOperation('scrollToBottom', {});

        // 等待新内容加载
        await this.testSystem.state.page.waitForTimeout(3000);

        // 提取链接
        const currentLinks = await this.testSystem.state.page.evaluate(() => {
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

        // 添加到总链接集合
        currentLinks.forEach(link => allLinks.add(link));
        scrollCount++;

        console.log(`📊 当前进度: ${allLinks.size}/${this.options.targetLinkCount} 条链接`);

        // 如果已经提取到足够的链接，提前结束
        if (allLinks.size >= this.options.targetLinkCount) {
          break;
        }
      }

      // 过滤帖子链接
      const postLinks = Array.from(allLinks).filter(link => {
        return link.match(/weibo\.com\/\d+\/[A-Za-z0-9]+$/) ||
               link.match(/weibo\.com\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.links = {
        allLinks: Array.from(allLinks),
        postLinks: postLinks,
        targetCount: this.options.targetLinkCount,
        totalLinks: allLinks.size,
        postCount: postLinks.length,
        scrollCount: scrollCount,
        duration: duration,
        achievedTarget: postLinks.length >= this.options.targetLinkCount,
        timestamp: new Date().toISOString()
      };

      console.log('\n🎯 链接提取结果:');
      console.log(`- 目标数量: ${this.options.targetLinkCount}`);
      console.log(`- 实际获取: ${this.results.links.postCount}`);
      console.log(`- 滚动次数: ${scrollCount}`);
      console.log(`- 执行时间: ${duration}ms`);
      console.log(`- 目标达成: ${this.results.links.achievedTarget ? '✅ 是' : '❌ 否'}`);

      if (this.results.links.achievedTarget) {
        console.log('\n🎉 成功提取足够数量的链接！');
      } else {
        console.log(`\n⚠️  只提取到 ${this.results.links.postCount} 条链接`);
      }

      // 保存链接到文件
      const linksFile = `${TEST_CONFIG.paths.outputDir}/batch-capture-links-${Date.now()}.json`;
      fs.writeFileSync(linksFile, JSON.stringify(this.results.links, null, 2));
      console.log(`📁 链接已保存到: ${linksFile}`);

      return this.results.links;

    } catch (error) {
      console.error('❌ 链接提取失败:', error.message);
      throw error;
    }
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

    console.log(`\n📥 开始批量下载 ${postsToDownload} 个帖子...`);
    console.log(`📊 下载模式: ${this.options.concurrentDownloads ? '并发' : '顺序'}`);

    const startTime = Date.now();
    const testLinks = this.results.links.postLinks.slice(0, postsToDownload);

    try {
      if (this.options.concurrentDownloads) {
        await this.concurrentDownload(testLinks);
      } else {
        await this.sequentialDownload(testLinks);
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
        timestamp: new Date().toISOString()
      };

      console.log('\n🎯 批量下载完成!');
      console.log(`- 目标帖子: ${this.results.summary.targetPosts}`);
      console.log(`- 成功下载: ${this.results.summary.successCount}`);
      console.log(`- 下载失败: ${this.results.summary.errorCount}`);
      console.log(`- 总评论数: ${this.results.summary.totalComments}`);
      console.log(`- 总图片数: ${this.results.summary.totalImages}`);
      console.log(`- 执行时间: ${duration}ms`);

      if (this.results.summary.errorCount > 0) {
        console.log('\n❌ 失败的帖子:');
        this.results.downloads.filter(d => !d.success).forEach(d => {
          console.log(`  - ${d.url}: ${d.error}`);
        });
      }

      // 保存完整结果
      const resultFile = `${TEST_CONFIG.paths.outputDir}/batch-capture-complete-${Date.now()}.json`;
      const completeResults = {
        links: this.results.links,
        downloads: this.results.downloads,
        summary: this.results.summary,
        config: this.options
      };

      fs.writeFileSync(resultFile, JSON.stringify(completeResults, null, 2));
      console.log(`\n📁 完整结果已保存到: ${resultFile}`);

      return this.results.summary;

    } catch (error) {
      console.error('❌ 批量下载失败:', error.message);
      throw error;
    }
  }

  async sequentialDownload(links) {
    console.log('🔄 使用顺序下载模式...');

    for (let i = 0; i < links.length; i++) {
      const url = links[i];
      const postStartTime = Date.now();

      try {
        console.log(`📥 下载第 ${i + 1}/${links.length} 个帖子: ${url}`);

        await this.testSystem.executeAtomicOperation('navigate', {
          url: url
        });

        await this.testSystem.state.page.waitForTimeout(5000);

        // 滚动到底部
        await this.testSystem.executeAtomicOperation('scrollToBottom', {});
        await this.testSystem.state.page.waitForTimeout(3000);

        // 提取内容
        const postContent = await this.extractPostContent();

        const postEndTime = Date.now();
        const postDuration = postEndTime - postStartTime;

        const downloadResult = {
          url: url,
          success: true,
          ...postContent,
          downloadTime: postDuration,
          timestamp: new Date().toISOString()
        };

        this.results.downloads.push(downloadResult);

        console.log(`✅ ${url}: ${postContent.commentCount} 评论, ${postContent.imageCount} 图片 (${postDuration}ms)`);

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

  async concurrentDownload(links) {
    console.log('🔄 使用并发下载模式...');

    const testSystems = [];
    const downloadPromises = links.map(async (url, index) => {
      // 为每个帖子创建独立的测试系统
      const system = createTestSystem({
        logLevel: 'info',
        timeout: 90000,
        logFile: `${TEST_CONFIG.paths.logDir}/concurrent-${index}-${Date.now()}.log`
      });

      testSystems.push(system);
      await system.initialize();

      const postStartTime = Date.now();

      try {
        console.log(`📥 并发下载第 ${index + 1}/${links.length} 个帖子: ${url}`);

        await system.executeAtomicOperation('navigate', {
          url: url
        });

        await system.state.page.waitForTimeout(5000);

        // 滚动到底部
        await system.executeAtomicOperation('scrollToBottom', {});
        await system.state.page.waitForTimeout(3000);

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
    const downloadResults = await Promise.all(downloadPromises);
    this.results.downloads = downloadResults;

    // 输出结果
    downloadResults.forEach((result, index) => {
      if (result.success) {
        console.log(`✅ ${result.url}: ${result.commentCount} 评论, ${result.imageCount} 图片 (${result.downloadTime}ms)`);
      } else {
        console.log(`❌ ${result.url}: ${result.error}`);
      }
    });
  }

  async extractPostContent(system = this.testSystem) {
    // 提取评论
    const commentElements = await system.state.page.$$('.Feed_body_3R0rO div, [class*="Comment"] div');
    const commentTexts = await Promise.all(
      commentElements.map(el => el.textContent().catch(() => ''))
    );

    const comments = commentTexts
      .filter(text => text && text.trim().length > 5)
      .map(text => text.trim());

    // 提取图片
    const imageElements = await system.state.page.$$('img');
    const imageSrcs = await Promise.all(
      imageElements.map(el => el.getAttribute('src').catch(() => ''))
    );

    const images = imageSrcs
      .filter(src => src && src.startsWith('http'))
      .map(src => src.trim());

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

      console.log('\n🎉 微博批量捕获任务完成！');
      console.log('📋 任务总结:');
      console.log(`- 链接提取: ${this.results.links.achievedTarget ? '✅' : '⚠️'} ${this.results.links.postCount}/${this.options.targetLinkCount}`);
      console.log(`- 批量下载: ${this.results.summary.successCount}/${this.results.summary.targetPosts}`);
      console.log(`- 总评论数: ${this.results.summary.totalComments}`);
      console.log(`- 总图片数: ${this.results.summary.totalImages}`);
      console.log(`- 总耗时: ${this.results.links.duration + this.results.summary.duration}ms`);

      return this.results;

    } catch (error) {
      console.error('❌ 批量捕获任务失败:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const batchCapture = new WeiboBatchCapture({
    targetLinkCount: 50,
    maxDownloadPosts: 10,
    concurrentDownloads: false
  });

  batchCapture.run()
    .then(results => {
      console.log('\n🎊 任务成功完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 任务失败:', error.message);
      process.exit(1);
    });
}

module.exports = WeiboBatchCapture;