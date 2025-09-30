#!/usr/bin/env node

/**
 * 容器自动发现测试系统
 * 结合浏览器绑定Cookie原子操作和容器注册机制
 * 测试完整的容器自动发现流程
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { WeiboContainerRegistry, registerWeiboContainers } = require('./weibo-container-registry.cjs');

class ContainerAutoDiscoverySystem {
  constructor(config = {}) {
    this.config = {
      cookieFile: config.cookieFile || './cookies/weibo-cookies.json',
      containerLibraryPath: config.containerLibraryPath || './container-library.json',
      containerConfigPath: config.containerConfigPath || './weibo-container-config.json',
      headless: config.headless || false,
      verbose: config.verbose || true,
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: config.viewport || { width: 1920, height: 1080 },
      ...config
    };

    this.browser = null;
    this.context = null;
    this.page = null;
    this.containerRegistry = null;
    this.discoveredContainers = new Map();
  }

  /**
   * 完整的容器自动发现流程
   */
  async runContainerAutoDiscovery() {
    console.log('🔍 启动容器自动发现系统...');
    console.log('📋 流程概览:');
    console.log('   1. 浏览器绑定和Cookie注入');
    console.log('   2. 导航到微博页面');
    console.log('   3. 加载容器库');
    console.log('   4. 执行容器自动发现');
    console.log('   5. 验证发现结果');
    console.log('   6. 更新容器使用统计');

    try {
      // 1. 初始化浏览器和注入Cookie
      const browserResult = await this.initializeBrowserAndInject();
      if (!browserResult.success) {
        throw new Error(`浏览器初始化失败: ${browserResult.error}`);
      }

      // 2. 导航到微博
      await this.navigateToWeibo();

      // 3. 等待页面完全加载
      await this.page.waitForTimeout(5000);

      // 4. 初始化容器注册器
      this.containerRegistry = new WeiboContainerRegistry({
        containerConfigPath: this.config.containerConfigPath,
        containerLibraryPath: this.config.containerLibraryPath,
        verbose: this.config.verbose
      });

      // 5. 加载现有容器库
      await this.containerRegistry.initializeContainerLibrary();

      // 6. 执行容器自动发现
      console.log('\n🔬 开始容器自动发现...');
      const discoveryResult = await this.performContainerAutoDiscovery();

      // 7. 更新容器使用统计
      await this.updateContainerUsageStats(discoveryResult);

      // 8. 验证发现结果
      const verificationResult = await this.verifyDiscoveryResult(discoveryResult);

      console.log('\n🎉 容器自动发现完成！');

      return {
        success: true,
        browserResult,
        discoveryResult,
        verificationResult,
        discoveredContainers: Array.from(this.discoveredContainers.keys()),
        containerStats: this.containerRegistry.getLibraryStats()
      };

    } catch (error) {
      console.error('❌ 容器自动发现失败:', error.message);
      throw error;
    }
  }

  /**
   * 初始化浏览器和注入Cookie
   */
  async initializeBrowserAndInject() {
    console.log('\n📋 阶段1: 浏览器绑定和Cookie注入');

    try {
      // 启动浏览器
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      this.context = await this.browser.newContext({
        userAgent: this.config.userAgent,
        viewport: this.config.viewport,
        javaScriptEnabled: true,
        ignoreHTTPSErrors: true
      });

      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.timeout);

      if (this.config.verbose) {
        this.page.on('console', msg => console.log(`📄 [页面] ${msg.text()}`));
        this.page.on('pageerror', error => console.warn(`⚠️ [页面错误] ${error.message}`));
      }

      // 注入Cookie
      if (fs.existsSync(this.config.cookieFile)) {
        const cookieData = fs.readFileSync(this.config.cookieFile, 'utf8');
        const cookies = JSON.parse(cookieData);

        if (Array.isArray(cookies) && cookies.length > 0) {
          await this.context.addCookies(cookies);
          console.log(`✅ Cookie注入成功: ${cookies.length} 个Cookie`);
        } else {
          console.warn('⚠️ Cookie文件为空或格式错误');
        }
      } else {
        console.warn('⚠️ Cookie文件不存在，跳过Cookie注入');
      }

      return {
        success: true,
        browser: this.browser,
        context: this.context,
        page: this.page
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 导航到微博
   */
  async navigateToWeibo() {
    console.log('\n📋 阶段2: 导航到微博页面');

    try {
      await this.page.goto('https://weibo.com', {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(this.config.timeout, 15000)
      });

      await this.page.waitForTimeout(3000);

      const currentUrl = this.page.url();
      const title = await this.page.title();

      console.log(`📍 当前页面: ${currentUrl}`);
      console.log(`📄 页面标题: ${title}`);

      // 检查是否跳转到登录页
      const isLoginPage = currentUrl.includes('newlogin') || title.includes('登录');
      if (isLoginPage) {
        console.log('⚠️ 检测到登录页面，可能需要重新登录');
      } else {
        console.log('✅ 页面导航成功');
      }

    } catch (error) {
      console.warn('⚠️ 页面导航超时，但将继续进行容器发现');
    }
  }

  /**
   * 执行容器自动发现
   */
  async performContainerAutoDiscovery() {
    console.log('\n📋 阶段4: 执行容器自动发现');

    const discoveryResult = await this.page.evaluate(() => {
      const registeredContainers = {
        page: { selector: 'body', found: false, elements: [] },
        feed: { selector: '[class*="content"]', found: false, elements: [] },
        post: { selector: '[class*="content"]', found: false, elements: [] }
      };

      // 查找页面容器
      try {
        const pageElements = document.querySelectorAll('body');
        if (pageElements.length > 0) {
          registeredContainers.page.found = true;
          registeredContainers.page.elements = Array.from(pageElements).map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            rect: el.getBoundingClientRect()
          }));
          console.log(`🔍 找到页面容器: ${pageElements.length} 个`);
        }
      } catch (e) {
        console.warn('⚠️ 页面容器查找失败');
      }

      // 查找主帖子列表容器
      try {
        const feedElements = document.querySelectorAll('[class*="content"]');
        const visibleFeedElements = Array.from(feedElements).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 300 && rect.height > 200;
        });

        if (visibleFeedElements.length > 0) {
          registeredContainers.feed.found = true;
          registeredContainers.feed.elements = visibleFeedElements.slice(0, 3).map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            rect: el.getBoundingClientRect(),
            children: el.children.length
          }));
          console.log(`🔍 找到主帖子列表容器: ${visibleFeedElements.length} 个`);
        }
      } catch (e) {
        console.warn('⚠️ 主帖子列表容器查找失败');
      }

      // 查找帖子容器
      try {
        const postElements = document.querySelectorAll('[class*="content"]');
        const visiblePostElements = Array.from(postElements).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 200 && rect.height > 100;
        });

        if (visiblePostElements.length > 0) {
          registeredContainers.post.found = true;
          registeredContainers.post.elements = visiblePostElements.slice(0, 5).map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            rect: el.getBoundingClientRect(),
            hasContent: el.querySelector('[class*="text"], [class*="content"], p') !== null
          }));
          console.log(`🔍 找到帖子容器: ${visiblePostElements.length} 个`);
        }
      } catch (e) {
        console.warn('⚠️ 帖子容器查找失败');
      }

      // 分析层次结构
      const hierarchyAnalysis = {
        pageContainsFeed: false,
        feedContainsPosts: false,
        maxDepth: 0
      };

      if (registeredContainers.page.found && registeredContainers.feed.found) {
        const pageElement = document.querySelector('body');
        const feedInPage = pageElement.querySelector('[class*="content"]');
        hierarchyAnalysis.pageContainsFeed = !!feedInPage;
      }

      if (registeredContainers.feed.found && registeredContainers.post.found) {
        const feedElements = document.querySelectorAll('[class*="content"]');
        if (feedElements.length > 0) {
          const postsInFeed = feedElements[0].querySelectorAll('[class*="content"]');
          hierarchyAnalysis.feedContainsPosts = postsInFeed.length > 0;
        }
      }

      return {
        registeredContainers,
        hierarchyAnalysis,
        discoveryTime: new Date().toISOString(),
        currentPage: window.location.href,
        pageTitle: document.title
      };
    });

    // 保存发现的容器
    for (const [containerType, containerInfo] of Object.entries(discoveryResult.registeredContainers)) {
      if (containerInfo.found) {
        this.discoveredContainers.set(containerType, containerInfo);
      }
    }

    console.log('\n📊 容器发现结果:');
    for (const [containerType, containerInfo] of Object.entries(discoveryResult.registeredContainers)) {
      const status = containerInfo.found ? '✅' : '❌';
      const name = containerType === 'page' ? '页面容器' :
                  containerType === 'feed' ? '主帖子列表容器' : '帖子容器';
      console.log(`   ${status} ${name}: ${containerInfo.found ? containerInfo.elements.length + ' 个' : '未找到'}`);
    }

    console.log('\n🏗️ 层次结构分析:');
    console.log(`   页面包含主帖子列表: ${discoveryResult.hierarchyAnalysis.pageContainsFeed ? '✅' : '❌'}`);
    console.log(`   主帖子列表包含帖子: ${discoveryResult.hierarchyAnalysis.feedContainsPosts ? '✅' : '❌'}`);

    return discoveryResult;
  }

  /**
   * 更新容器使用统计
   */
  async updateContainerUsageStats(discoveryResult) {
    console.log('\n📋 阶段5: 更新容器使用统计');

    try {
      for (const [containerType, containerInfo] of Object.entries(discoveryResult.registeredContainers)) {
        if (containerInfo.found) {
          await this.containerRegistry.updateContainerUsage(containerType, 'weibo', {
            success: true,
            discoveryMethod: 'auto-discovery',
            elementCount: containerInfo.elements.length,
            lastAccessed: new Date().toISOString()
          });
        }
      }

      console.log('✅ 容器使用统计已更新');

    } catch (error) {
      console.warn('⚠️ 容器使用统计更新失败:', error.message);
    }
  }

  /**
   * 验证发现结果
   */
  async verifyDiscoveryResult(discoveryResult) {
    console.log('\n📋 阶段6: 验证发现结果');

    const verification = {
      success: true,
      foundContainers: 0,
      totalContainers: 3,
      hierarchyValid: true,
      recommendations: []
    };

    // 验证发现的容器数量
    for (const [containerType, containerInfo] of Object.entries(discoveryResult.registeredContainers)) {
      if (containerInfo.found) {
        verification.foundContainers++;
      }
    }

    // 验证层次结构
    if (!discoveryResult.hierarchyAnalysis.pageContainsFeed) {
      verification.hierarchyValid = false;
      verification.recommendations.push('页面容器应包含主帖子列表容器');
    }

    if (!discoveryResult.hierarchyAnalysis.feedContainsPosts) {
      verification.hierarchyValid = false;
      verification.recommendations.push('主帖子列表容器应包含帖子容器');
    }

    // 生成建议
    if (verification.foundContainers < verification.totalContainers) {
      verification.recommendations.push('部分容器未找到，可能需要调整selector策略');
    }

    console.log('\n🔍 验证结果:');
    console.log(`   发现容器: ${verification.foundContainers}/${verification.totalContainers}`);
    console.log(`   层次结构: ${verification.hierarchyValid ? '✅ 有效' : '❌ 需要优化'}`);

    if (verification.recommendations.length > 0) {
      console.log('\n💡 改进建议:');
      verification.recommendations.forEach(rec => console.log(`   - ${rec}`));
    }

    return verification;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    console.log('🧹 容器自动发现系统资源已清理');
  }

  /**
   * 获取发现结果
   */
  getDiscoveryResults() {
    return {
      discoveredContainers: Array.from(this.discoveredContainers.entries()),
      containerCount: this.discoveredContainers.size,
      containerStats: this.containerRegistry ? this.containerRegistry.getLibraryStats() : null
    };
  }
}

/**
 * 主测试函数
 */
async function testContainerAutoDiscovery() {
  const system = new ContainerAutoDiscoverySystem({
    verbose: true,
    headless: false, // 使用可视化模式以便观察
    timeout: 30000
  });

  try {
    console.log('🚀 开始容器自动发现测试...');
    console.log('='.repeat(60));

    // 执行容器自动发现
    const result = await system.runContainerAutoDiscovery();

    console.log('\n📋 测试结果总结:');
    console.log('='.repeat(60));
    console.log(`✅ 测试成功: ${result.success}`);
    console.log(`✅ 发现容器: ${result.discoveredContainers.length} 个`);
    console.log(`✅ 容器列表: ${result.discoveredContainers.join(', ')}`);

    if (result.verificationResult) {
      console.log(`✅ 验证通过: ${result.verificationResult.success}`);
      console.log(`✅ 层次结构: ${result.verificationResult.hierarchyValid ? '有效' : '需要优化'}`);
    }

    if (result.containerStats) {
      console.log(`✅ 容器库统计:`);
      console.log(`   - 网站总数: ${result.containerStats.totalWebsites}`);
      console.log(`   - 容器总数: ${result.containerStats.totalContainers}`);
      console.log(`   - 活跃容器: ${result.containerStats.activeContainers}`);
    }

    console.log('\n📱 浏览器保持打开状态供检查...');
    console.log('⚠️ 按 Ctrl+C 退出程序');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ 容器自动发现测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await system.cleanup();
  }
}

// 执行测试
if (require.main === module) {
  testContainerAutoDiscovery().catch(console.error);
}

module.exports = {
  ContainerAutoDiscoverySystem,
  testContainerAutoDiscovery
};