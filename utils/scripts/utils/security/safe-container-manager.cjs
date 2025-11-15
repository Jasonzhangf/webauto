#!/usr/bin/env node

/**
 * 安全容器管理系统
 * 确保所有操作都在正确的容器内进行，避免错误的点击和访问
 */

const { SafeClickManager, SafeAvoidanceManager } = require('./safe-click-manager.cjs');
const EnhancedUnifiedCookieManager = require('./enhanced-unified-cookie-manager.cjs');

/**
 * 安全容器管理器
 */
class SafeContainerManager {
  constructor(options = {}) {
    this.options = {
      maxContainerDepth: 5,
      safeMode: true,
      enableLogging: true,
      ...options
    };

    this.containers = new Map();
    this.currentContainer = null;
    this.containerHistory = [];
    this.clickManager = new SafeClickManager({ safeMode: this.options.safeMode });
    this.avoidanceManager = new SafeAvoidanceManager();
    this.cookieManager = null;
  }

  /**
   * 初始化Cookie管理器
   */
  async initializeCookieManager() {
    if (!this.cookieManager) {
      this.cookieManager = new EnhancedUnifiedCookieManager({
        verbose: this.options.enableLogging,
        autoLoginFallback: true,
        headless: false
      });

      const loginResult = await this.cookieManager.ensureLoggedIn();
      if (!loginResult.success) {
        throw new Error('Cookie管理器初始化失败');
      }

      return {
        browser: loginResult.browser,
        context: loginResult.context,
        page: loginResult.page
      };
    }

    return {
      browser: this.cookieManager.getBrowser(),
      context: this.cookieManager.getContext(),
      page: this.cookieManager.getPage()
    };
  }

  /**
   * 注册容器
   */
  registerContainer(name, selector, options = {}) {
    const container = {
      name,
      selector,
      options: {
        required: true,
        timeout: 10000,
        ...options
      },
      lastUsed: null,
      useCount: 0,
      errorCount: 0
    };

    this.containers.set(name, container);
    this.log('info', `容器已注册: ${name} (${selector})`);
  }

  /**
   * 验证容器存在性和可见性
   */
  async validateContainer(page, containerName) {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`容器未注册: ${containerName}`);
    }

    // 检查容器存在性
    const elementExists = await page.$(container.selector);
    if (!elementExists) {
      throw new Error(`容器不存在: ${containerName} (${container.selector})`);
    }

    // 检查容器可见性
    const isVisible = await page.isVisible(container.selector);
    if (!isVisible) {
      throw new Error(`容器不可见: ${containerName} (${container.selector})`);
    }

    // 检查容器内是否有内容
    const hasContent = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return element && element.children.length > 0;
    }, container.selector);

    if (!hasContent) {
      this.log('warn', `容器为空: ${containerName} (${container.selector})`);
    }

    return true;
  }

  /**
   * 设置当前容器
   */
  async setCurrentContainer(page, containerName) {
    await this.validateContainer(page, containerName);

    this.currentContainer = containerName;
    this.containerHistory.push({
      container: containerName,
      timestamp: Date.now()
    });

    const container = this.containers.get(containerName);
    container.lastUsed = Date.now();
    container.useCount++;

    this.log('info', `切换到容器: ${containerName}`);
  }

  /**
   * 在容器内安全执行操作
   */
  async executeInContainer(page, containerName, operation, options = {}) {
    const {
      validateBefore = true,
      validateAfter = true,
      timeout = 30000,
      ...otherOptions
    } = options;

    try {
      // 1. 验证容器
      if (validateBefore) {
        await this.validateContainer(page, containerName);
      }

      // 2. 设置当前容器
      await this.setCurrentContainer(page, containerName);

      // 3. 获取容器信息
      const container = this.containers.get(containerName);

      // 4. 执行操作
      this.log('info', `在容器 ${containerName} 中执行操作...`);
      const startTime = Date.now();

      const result = await operation({
        page,
        container,
        containerSelector: container.selector,
        safeClick: (selector, clickOptions) => this.safeClickInContainer(page, containerName, selector, clickOptions),
        safeAccess: (url, accessOptions) => this.avoidanceManager.safeAccess(page, url, accessOptions),
        safeScroll: (scrollOptions) => this.safeScrollInContainer(page, containerName, scrollOptions),
        extractElements: (selector) => this.extractElementsFromContainer(page, containerName, selector)
      });

      const duration = Date.now() - startTime;

      // 5. 验证操作结果
      if (validateAfter) {
        await this.validateContainer(page, containerName);
      }

      this.log('info', `容器操作完成: ${containerName}`, {
        duration,
        success: true
      });

      return result;

    } catch (error) {
      const container = this.containers.get(containerName);
      if (container) {
        container.errorCount++;
      }

      this.log('error', `容器操作失败: ${containerName}`, {
        error: error.message,
        success: false
      });

      throw error;
    }
  }

  /**
   * 容器内安全点击
   */
  async safeClickInContainer(page, containerName, elementSelector, options = {}) {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`容器未注册: ${containerName}`);
    }

    const qualifiedSelector = `${container.selector} ${elementSelector}`;

    return this.clickManager.safeClick(page, qualifiedSelector, {
      container: container.selector,
      ...options
    });
  }

  /**
   * 容器内安全滚动
   */
  async safeScrollInContainer(page, containerName, options = {}) {
    const {
      direction = 'down',
      amount = 'containerHeight',
      delay = 1000
    } = options;

    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`容器未注册: ${containerName}`);
    }

    return this.executeInContainer(page, containerName, async ({ containerSelector }) => {
      await page.evaluate((sel, dir, amt) => {
        const container = document.querySelector(sel);
        if (!container) return;

        let scrollAmount;
        if (amt === 'containerHeight') {
          scrollAmount = container.clientHeight;
        } else {
          scrollAmount = parseInt(amt);
        }

        if (dir === 'down') {
          container.scrollTop += scrollAmount;
        } else if (dir === 'up') {
          container.scrollTop -= scrollAmount;
        }
      }, container.selector, direction, amount);

      await new Promise(resolve => setTimeout(resolve, delay));
    }, { validateBefore: false, validateAfter: false });
  }

  /**
   * 从容器中提取元素
   */
  async extractElementsFromContainer(page, containerName, elementSelector) {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`容器未注册: ${containerName}`);
    }

    return page.evaluate((containerSel, elementSel) => {
      const container = document.querySelector(containerSel);
      if (!container) return [];

      const elements = container.querySelectorAll(elementSel);
      return Array.from(elements).map(el => ({
        tagName: el.tagName,
        className: el.className,
        textContent: el.textContent?.trim() || '',
        href: el.href,
        id: el.id,
        visible: el.offsetParent !== null
      }));
    }, container.selector, elementSelector);
  }

  /**
   * 容器内安全链接提取
   */
  async extractLinksFromContainer(page, containerName, options = {}) {
    const {
      linkPatterns = [/weibo\.com\/\d+\/[A-Za-z0-9_\-]+/],
      excludePatterns = [/login/, /logout/, /register/],
      ...otherOptions
    } = options;

    return this.executeInContainer(page, containerName, async ({ containerSelector, extractElements }) => {
      const allLinks = await extractElements('a');

      return allLinks
        .filter(link => {
          if (!link.href) return false;

          // 检查包含模式
          const includeMatch = linkPatterns.some(pattern => {
            if (typeof pattern === 'string') {
              return link.href.includes(pattern);
            } else {
              return pattern.test(link.href);
            }
          });

          // 检查排除模式
          const excludeMatch = excludePatterns.some(pattern => {
            if (typeof pattern === 'string') {
              return link.href.includes(pattern);
            } else {
              return pattern.test(link.href);
            }
          });

          return includeMatch && !excludeMatch && link.visible;
        })
        .map(link => ({
          href: link.href,
          text: link.textContent,
          container: containerName
        }));
    }, otherOptions);
  }

  /**
   * 获取容器状态
   */
  getContainerStatus(containerName) {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`容器未注册: ${containerName}`);
    }

    return {
      name: container.name,
      selector: container.selector,
      useCount: container.useCount,
      errorCount: container.errorCount,
      lastUsed: container.lastUsed,
      successRate: container.useCount > 0
        ? (container.useCount - container.errorCount) / container.useCount
        : 0
    };
  }

  /**
   * 获取所有容器状态
   */
  getAllContainerStatuses() {
    const statuses = {};
    for (const [name, container] of this.containers) {
      statuses[name] = this.getContainerStatus(name);
    }
    return statuses;
  }

  /**
   * 重置容器统计
   */
  resetContainerStats(containerName) {
    const container = this.containers.get(containerName);
    if (container) {
      container.useCount = 0;
      container.errorCount = 0;
      container.lastUsed = null;
      this.log('info', `容器统计已重置: ${containerName}`);
    }
  }

  /**
   * 记录日志
   */
  log(level, message, data = null) {
    if (!this.options.enableLogging) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      currentContainer: this.currentContainer
    };

    console.log(`[${level.toUpperCase()}] [容器管理] ${message}`);
    if (data) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
  }
}

/**
 * 预定义的微博容器配置
 */
const WeiboContainerConfigs = {
  // 主要内容容器
  mainContent: {
    selector: '[class*="main"], [class*="content"], .main, .content',
    options: { required: true }
  },

  // 微博帖子容器
  feedContainer: {
    selector: '[class*="FeedBody"], [class*="card"], [class*="feed"], [class*="post"]',
    options: { required: true }
  },

  // 评论容器
  commentContainer: {
    selector: '[class*="comment"], [class*="reply"], [class*="Comment"]',
    options: { required: false }
  },

  // 分页容器
  paginationContainer: {
    selector: '[class*="page"], [class*="pagination"], .page, .pagination',
    options: { required: false }
  },

  // 导航容器
  navigationContainer: {
    selector: '[class*="nav"], [class*="header"], nav, header',
    options: { required: false }
  }
};

/**
 * 创建微博安全容器管理器
 */
function createWeiboSafeContainerManager(options = {}) {
  const manager = new SafeContainerManager(options);

  // 注册预定义的微博容器
  for (const [name, config] of Object.entries(WeiboContainerConfigs)) {
    manager.registerContainer(name, config.selector, config.options);
  }

  return manager;
}

// 导出模块
module.exports = {
  SafeContainerManager,
  WeiboContainerConfigs,
  createWeiboSafeContainerManager
};

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🛡️ 安全容器管理系统已加载');
  console.log('这个模块提供了安全的容器操作和管理功能');
  console.log('预定义的微博容器:');
  Object.keys(WeiboContainerConfigs).forEach(name => {
    console.log(`  - ${name}: ${WeiboContainerConfigs[name].selector}`);
  });
}