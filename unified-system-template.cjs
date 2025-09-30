#!/usr/bin/env node

/**
 * 统一系统模板
 * 所有新增文件必须基于此模板，确保包含：
 * 1. 统一的Cookie管理系统
 * 2. 安全点击管理
 * 3. 安全避让措施
 * 4. 容器管理系统
 */

const EnhancedUnifiedCookieManager = require('./enhanced-unified-cookie-manager.cjs');
const { SafeClickManager, SafeAvoidanceManager } = require('./safe-click-manager.cjs');

/**
 * 基础系统类
 * 所有新系统都必须继承此类
 */
class BaseWeiboSystem {
  constructor(options = {}) {
    this.options = {
      headless: false,          // 默认使用可视化浏览器
      verbose: true,           // 详细日志
      autoLoginFallback: true, // 自动登录回退
      safeMode: true,          // 安全模式
      ...options
    };

    // 核心管理器
    this.cookieManager = null;
    this.clickManager = null;
    this.avoidanceManager = null;

    // 系统状态
    this.browser = null;
    this.context = null;
    this.page = null;
    this.initialized = false;

    // 统计信息
    this.stats = {
      startTime: null,
      endTime: null,
      operations: 0,
      errors: 0,
      successRate: 0
    };

    // 日志系统
    this.sessionLog = [];
  }

  /**
   * 初始化系统
   * 必须在所有操作之前调用
   */
  async initialize() {
    if (this.initialized) {
      console.log('⚠️ 系统已经初始化');
      return;
    }

    try {
      console.log('🚀 初始化统一系统...');

      // 1. 初始化Cookie管理器
      this.cookieManager = new EnhancedUnifiedCookieManager({
        verbose: this.options.verbose,
        autoLoginFallback: this.options.autoLoginFallback,
        headless: this.options.headless
      });

      // 2. 确保登录状态
      const loginResult = await this.cookieManager.ensureLoggedIn();
      if (!loginResult.success) {
        throw new Error('❌ Cookie管理器登录状态确保失败');
      }

      // 3. 获取浏览器实例
      this.browser = loginResult.browser;
      this.context = loginResult.context;
      this.page = loginResult.page;

      // 4. 初始化安全点击管理器
      this.clickManager = new SafeClickManager({
        safeMode: this.options.safeMode,
        maxClickAttempts: 3,
        clickTimeout: 10000
      });

      // 5. 初始化安全避让管理器
      this.avoidanceManager = new SafeAvoidanceManager({
        minInterval: 2000,
        maxConsecutiveErrors: 3
      });

      // 6. 设置页面事件监听
      this.setupPageEventListeners();

      this.initialized = true;
      this.stats.startTime = Date.now();

      console.log('✅ 统一系统初始化完成');

    } catch (error) {
      console.error('❌ 统一系统初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 设置页面事件监听
   */
  setupPageEventListeners() {
    if (!this.page) return;

    this.page.on('console', msg => {
      this.log('debug', `[浏览器控制台] ${msg.text()}`);
    });

    this.page.on('pageerror', error => {
      this.log('error', `[页面错误] ${error.message}`);
      this.stats.errors++;
    });

    this.page.on('requestfailed', request => {
      this.log('warn', `[请求失败] ${request.url()}: ${request.failure().errorText}`);
    });
  }

  /**
   * 安全点击操作
   */
  async safeClick(selector, options = {}) {
    if (!this.initialized) {
      throw new Error('系统未初始化，请先调用 initialize()');
    }

    if (!this.clickManager) {
      throw new Error('点击管理器未初始化');
    }

    return this.clickManager.safeClick(this.page, selector, options);
  }

  /**
   * 容器内安全点击
   */
  async safeClickInContainer(containerSelector, elementSelector, options = {}) {
    if (!this.initialized) {
      throw new Error('系统未初始化，请先调用 initialize()');
    }

    if (!this.clickManager) {
      throw new Error('点击管理器未初始化');
    }

    return this.clickManager.safeClickInContainer(this.page, containerSelector, elementSelector, options);
  }

  /**
   * 安全访问URL
   */
  async safeAccess(url, options = {}) {
    if (!this.initialized) {
      throw new Error('系统未初始化，请先调用 initialize()');
    }

    if (!this.avoidanceManager) {
      throw new Error('避让管理器未初始化');
    }

    return this.avoidanceManager.safeAccess(this.page, url, options);
  }

  /**
   * 记录日志
   */
  log(level, message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };

    this.sessionLog.push(logEntry);

    if (this.options.verbose || level === 'error' || level === 'warn') {
      console.log(`[${level.toUpperCase()}] ${message}`);
      if (data) {
        console.log('  Data:', JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * 执行操作
   */
  async executeOperation(operationName, operationFn) {
    if (!this.initialized) {
      throw new Error('系统未初始化，请先调用 initialize()');
    }

    const startTime = Date.now();
    this.stats.operations++;

    try {
      this.log('info', `🔧 开始执行操作: ${operationName}`);

      const result = await operationFn();

      const duration = Date.now() - startTime;
      this.log('info', `✅ 操作完成: ${operationName}`, {
        duration,
        success: true
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.errors++;

      this.log('error', `❌ 操作失败: ${operationName}`, {
        duration,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * 安全滚动操作
   */
  async safeScroll(options = {}) {
    const {
      direction = 'down',
      amount = 'window.innerHeight',
      delay = 1000
    } = options;

    return this.executeOperation('safeScroll', async () => {
      await this.page.evaluate((dir, amt) => {
        const scrollAmount = amt === 'window.innerHeight' ? window.innerHeight : parseInt(amt);
        if (dir === 'down') {
          window.scrollBy(0, scrollAmount);
        } else if (dir === 'up') {
          window.scrollBy(0, -scrollAmount);
        }
      }, direction, amount);

      await this.page.waitForTimeout(delay);
    });
  }

  /**
   * 安全等待
   */
  async safeWait(ms, reason = '') {
    return new Promise(resolve => {
      this.log('info', `⏳ 等待 ${ms}ms ${reason}`);
      setTimeout(resolve, ms);
    });
  }

  /**
   * 获取系统状态
   */
  getStatus() {
    const now = Date.now();
    const duration = this.stats.startTime ? now - this.stats.startTime : 0;

    return {
      initialized: this.initialized,
      runningTime: duration,
      operations: this.stats.operations,
      errors: this.stats.errors,
      successRate: this.stats.operations > 0
        ? (this.stats.operations - this.stats.errors) / this.stats.operations
        : 0,
      clickStats: this.clickManager?.getStats() || null,
      avoidanceStats: this.avoidanceManager?.getStats() || null
    };
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      this.log('info', '🧹 清理系统资源...');

      // 保存Cookie
      if (this.cookieManager) {
        await this.cookieManager.cleanup();
      }

      // 关闭浏览器
      if (this.browser) {
        await this.browser.close();
      }

      this.stats.endTime = Date.now();
      this.initialized = false;

      this.log('info', '✅ 系统资源清理完成');

    } catch (error) {
      this.log('error', '❌ 系统资源清理失败:', error.message);
    }
  }
}

/**
 * 微博链接捕获系统
 * 基于统一系统的安全实现
 */
class SafeWeiboLinkCaptureSystem extends BaseWeiboSystem {
  constructor(options = {}) {
    super({
      headless: false,
      safeMode: true,
      ...options
    });

    this.config = {
      targetPosts: 50,
      maxScrollAttempts: 15,
      scrollDelay: 4000,
      containerSelector: '[class*="FeedBody"], [class*="card"], [class*="feed"]',
      linkSelector: 'a[href*="weibo.com"]',
      ...options.config
    };

    this.capturedLinks = new Set();
  }

  /**
   * 安全捕获微博链接
   */
  async captureLinks() {
    return this.executeOperation('captureLinks', async () => {
      await this.safeAccess('https://weibo.com');

      let scrollAttempts = 0;
      let lastLinkCount = 0;

      while (scrollAttempts < this.config.maxScrollAttempts && this.capturedLinks.size < this.config.targetPosts) {
        // 1. 提取当前页面的链接
        const currentLinks = await this.extractCurrentLinks();

        // 2. 安全滚动
        await this.safeScroll({
          direction: 'down',
          delay: this.config.scrollDelay
        });

        scrollAttempts++;

        // 3. 检查是否有新链接
        if (currentLinks.size === lastLinkCount) {
          this.log('info', '未检测到新链接，可能已到达页面底部');
          break;
        }

        lastLinkCount = currentLinks.size;

        this.log('info', `滚动进度: ${scrollAttempts}/${this.config.maxScrollAttempts}, 已捕获: ${this.capturedLinks.size}/${this.config.targetPosts}`);
      }

      this.log('info', '链接捕获完成', {
        totalLinks: this.capturedLinks.size,
        scrollAttempts: scrollAttempts,
        successRate: this.capturedLinks.size >= this.config.targetPosts
      });

      return Array.from(this.capturedLinks);
    });
  }

  /**
   * 提取当前页面链接
   */
  async extractCurrentLinks() {
    return this.executeOperation('extractCurrentLinks', async () => {
      const links = await this.page.evaluate((containerSelector, linkSelector) => {
        const containers = document.querySelectorAll(containerSelector);
        const allLinks = new Set();

        containers.forEach(container => {
          const linksInContainer = container.querySelectorAll(linkSelector);
          linksInContainer.forEach(link => {
            if (link.href && link.href.includes('weibo.com')) {
              allLinks.add(link.href);
            }
          });
        });

        return Array.from(allLinks);
      }, this.config.containerSelector, this.config.linkSelector);

      // 添加到已捕获集合
      links.forEach(link => this.capturedLinks.add(link));

      return this.capturedLinks;
    });
  }
}

/**
 * 使用示例和测试函数
 */
async function testUnifiedSystem() {
  console.log('🧪 测试统一系统...');

  const system = new SafeWeiboLinkCaptureSystem({
    verbose: true,
    config: {
      targetPosts: 10,  // 测试用，只捕获10个链接
      maxScrollAttempts: 5
    }
  });

  try {
    // 1. 初始化系统
    await system.initialize();

    // 2. 捕获链接
    const links = await system.captureLinks();

    // 3. 显示结果
    console.log('\n🎯 捕获结果:');
    console.log(`总链接数: ${links.length}`);
    console.log('前5个链接:');
    links.slice(0, 5).forEach((link, index) => {
      console.log(`${index + 1}. ${link}`);
    });

    // 4. 显示系统状态
    console.log('\n📊 系统状态:');
    console.log(JSON.stringify(system.getStatus(), null, 2));

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await system.cleanup();
  }
}

// 导出模块
module.exports = {
  BaseWeiboSystem,
  SafeWeiboLinkCaptureSystem,
  testUnifiedSystem
};

// 如果直接运行此脚本
if (require.main === module) {
  testUnifiedSystem()
    .then(() => {
      console.log('\n🎉 统一系统测试完成');
    })
    .catch(console.error);
}