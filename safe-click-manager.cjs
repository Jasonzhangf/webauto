#!/usr/bin/env node

/**
 * 安全点击管理系统
 * 确保所有点击操作都在正确的容器内进行，避免错误的点击操作
 */

class SafeClickManager {
  constructor(options = {}) {
    this.options = {
      maxClickAttempts: 3,
      clickTimeout: 10000,
      verificationDelay: 1000,
      safeMode: true,
      ...options
    };

    this.clickHistory = [];
    this.errorCount = 0;
    this.consecutiveErrors = 0;
    this.lastClickTime = 0;
    this.blockedSelectors = new Set();
  }

  /**
   * 记录点击历史
   */
  logClick(selector, container, success, error = null) {
    const clickRecord = {
      timestamp: Date.now(),
      selector,
      container: container || 'global',
      success,
      error: error?.message,
      url: typeof window !== 'undefined' ? window.location.href : 'unknown'
    };

    this.clickHistory.push(clickRecord);

    // 保持历史记录在合理范围内
    if (this.clickHistory.length > 100) {
      this.clickHistory = this.clickHistory.slice(-50);
    }

    console.log(`[点击管理] ${success ? '✅' : '❌'} ${selector} in ${container}`, {
      success,
      error: error?.message,
      consecutiveErrors: this.consecutiveErrors
    });
  }

  /**
   * 验证点击安全性
   */
  async validateClickSafety(page, selector, container = null) {
    // 1. 检查连续错误次数
    if (this.consecutiveErrors >= 5) {
      throw new Error('连续错误次数过多，暂停点击操作');
    }

    // 2. 检查点击频率
    const timeSinceLastClick = Date.now() - this.lastClickTime;
    if (timeSinceLastClick < 500) {
      await new Promise(resolve => setTimeout(resolve, 500 - timeSinceLastClick));
    }

    // 3. 检查是否在黑名单中
    if (this.blockedSelectors.has(selector)) {
      throw new Error(`Selector ${selector} 在黑名单中`);
    }

    // 4. 验证元素存在性和可见性
    const elementExists = await page.$(selector);
    if (!elementExists) {
      throw new Error(`元素不存在: ${selector}`);
    }

    // 5. 验证元素可见性
    const isVisible = await page.isVisible(selector);
    if (!isVisible) {
      throw new Error(`元素不可见: ${selector}`);
    }

    // 6. 如果指定了容器，验证元素在容器内
    if (container) {
      const isInContainer = await page.evaluate((sel, cont) => {
        const element = document.querySelector(sel);
        const containerElement = document.querySelector(cont);
        return element && containerElement && containerElement.contains(element);
      }, selector, container);

      if (!isInContainer) {
        throw new Error(`元素不在指定容器内: ${selector} not in ${container}`);
      }
    }

    return true;
  }

  /**
   * 执行安全点击
   */
  async safeClick(page, selector, options = {}) {
    const {
      container = null,
      verificationSelector = null,
      maxAttempts = this.options.maxClickAttempts,
      timeout = this.options.clickTimeout
    } = options;

    let attempts = 0;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // 1. 验证点击安全性
        await this.validateClickSafety(page, selector, container);

        // 2. 执行点击
        await page.click(selector, { timeout });

        // 3. 等待验证
        await new Promise(resolve => setTimeout(resolve, this.options.verificationDelay));

        // 4. 验证点击结果
        if (verificationSelector) {
          const verificationResult = await page.$(verificationSelector);
          if (!verificationResult) {
            throw new Error(`点击后未找到验证元素: ${verificationSelector}`);
          }
        }

        // 5. 成功记录
        this.consecutiveErrors = 0;
        this.errorCount = 0;
        this.lastClickTime = Date.now();
        this.logClick(selector, container, true);

        return { success: true, attempts };

      } catch (error) {
        lastError = error;
        this.consecutiveErrors++;
        this.errorCount++;
        this.logClick(selector, container, false, error);

        // 如果是严重的错误，加入黑名单
        if (error.message.includes('黑名单') || error.message.includes('连续错误次数过多')) {
          throw error;
        }

        // 等待重试
        if (attempts < maxAttempts) {
          const delay = Math.min(1000 * attempts, 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有尝试都失败了
    throw new Error(`点击操作失败，已尝试 ${maxAttempts} 次: ${lastError.message}`);
  }

  /**
   * 容器内安全点击 - 只点击指定容器内的元素
   */
  async safeClickInContainer(page, containerSelector, elementSelector, options = {}) {
    const {
      verifyContainerOnly = true,
      ...otherOptions
    } = options;

    if (verifyContainerOnly) {
      // 验证容器存在
      const containerExists = await page.$(containerSelector);
      if (!containerExists) {
        throw new Error(`容器不存在: ${containerSelector}`);
      }

      // 验证容器可见
      const containerVisible = await page.isVisible(containerSelector);
      if (!containerVisible) {
        throw new Error(`容器不可见: ${containerSelector}`);
      }
    }

    // 使用容器限定的selector
    const qualifiedSelector = `${containerSelector} ${elementSelector}`;

    return this.safeClick(page, qualifiedSelector, {
      container: containerSelector,
      ...otherOptions
    });
  }

  /**
   * 获取点击统计
   */
  getStats() {
    const recentClicks = this.clickHistory.slice(-20);
    const successRate = recentClicks.length > 0
      ? recentClicks.filter(click => click.success).length / recentClicks.length
      : 0;

    return {
      totalClicks: this.clickHistory.length,
      errorCount: this.errorCount,
      consecutiveErrors: this.consecutiveErrors,
      recentSuccessRate: successRate,
      blockedSelectors: Array.from(this.blockedSelectors),
      lastClickTime: this.lastClickTime
    };
  }

  /**
   * 重置错误计数
   */
  resetErrors() {
    this.consecutiveErrors = 0;
    this.errorCount = 0;
    console.log('[点击管理] 错误计数已重置');
  }

  /**
   * 将selector加入黑名单
   */
  blockSelector(selector) {
    this.blockedSelectors.add(selector);
    console.log(`[点击管理] Selector已加入黑名单: ${selector}`);
  }

  /**
   * 从黑名单移除selector
   */
  unblockSelector(selector) {
    this.blockedSelectors.delete(selector);
    console.log(`[点击管理] Selector已从黑名单移除: ${selector}`);
  }

  /**
   * 清理历史记录
   */
  clearHistory() {
    this.clickHistory = [];
    console.log('[点击管理] 点击历史已清理');
  }
}

/**
 * 安全避让管理器
 * 防止频繁访问和反爬虫检测
 */
class SafeAvoidanceManager {
  constructor(options = {}) {
    this.options = {
      minInterval: 2000,        // 最小访问间隔
      maxConsecutiveErrors: 3,  // 最大连续错误次数
      backoffMultiplier: 2,     // 退避倍数
      maxBackoffTime: 30000,    // 最大退避时间
      ...options
    };

    this.lastAccessTime = 0;
    this.errorCount = 0;
    this.consecutiveErrors = 0;
    this.currentBackoffTime = this.options.minInterval;
    this.blockedUrls = new Set();
    this.accessHistory = [];
  }

  /**
   * 记录访问历史
   */
  logAccess(url, success, error = null) {
    const accessRecord = {
      timestamp: Date.now(),
      url,
      success,
      error: error?.message,
      backoffTime: this.currentBackoffTime
    };

    this.accessHistory.push(accessRecord);

    // 保持历史记录在合理范围内
    if (this.accessHistory.length > 100) {
      this.accessHistory = this.accessHistory.slice(-50);
    }
  }

  /**
   * 检查是否可以访问
   */
  async canAccess(url) {
    // 1. 检查URL是否在黑名单中
    if (this.blockedUrls.has(url)) {
      throw new Error(`URL在黑名单中: ${url}`);
    }

    // 2. 检查连续错误次数
    if (this.consecutiveErrors >= this.options.maxConsecutiveErrors) {
      throw new Error(`连续错误次数过多，暂停访问: ${url}`);
    }

    // 3. 检查访问间隔
    const timeSinceLastAccess = Date.now() - this.lastAccessTime;
    if (timeSinceLastAccess < this.currentBackoffTime) {
      const waitTime = this.currentBackoffTime - timeSinceLastAccess;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    return true;
  }

  /**
   * 记录访问结果
   */
  recordAccess(url, success, error = null) {
    this.lastAccessTime = Date.now();

    if (success) {
      this.consecutiveErrors = 0;
      this.currentBackoffTime = this.options.minInterval;
    } else {
      this.consecutiveErrors++;
      this.errorCount++;

      // 指数退避
      this.currentBackoffTime = Math.min(
        this.currentBackoffTime * this.options.backoffMultiplier,
        this.options.maxBackoffTime
      );

      // 如果连续错误过多，加入黑名单
      if (this.consecutiveErrors >= this.options.maxConsecutiveErrors) {
        this.blockedUrls.add(url);
        console.log(`[避让管理] URL已加入黑名单: ${url}`);
      }
    }

    this.logAccess(url, success, error);
  }

  /**
   * 安全访问URL
   */
  async safeAccess(page, url, options = {}) {
    const {
      timeout = 30000,
      waitUntil = 'networkidle',
      ...otherOptions
    } = options;

    try {
      await this.canAccess(url);

      const result = await page.goto(url, {
        timeout,
        waitUntil,
        ...otherOptions
      });

      this.recordAccess(url, true);
      return result;

    } catch (error) {
      this.recordAccess(url, false, error);
      throw error;
    }
  }

  /**
   * 获取避让统计
   */
  getStats() {
    const recentAccess = this.accessHistory.slice(-20);
    const successRate = recentAccess.length > 0
      ? recentAccess.filter(access => access.success).length / recentAccess.length
      : 0;

    return {
      totalAccess: this.accessHistory.length,
      errorCount: this.errorCount,
      consecutiveErrors: this.consecutiveErrors,
      currentBackoffTime: this.currentBackoffTime,
      recentSuccessRate: successRate,
      blockedUrls: Array.from(this.blockedUrls),
      lastAccessTime: this.lastAccessTime
    };
  }

  /**
   * 重置避让状态
   */
  reset() {
    this.consecutiveErrors = 0;
    this.errorCount = 0;
    this.currentBackoffTime = this.options.minInterval;
    this.blockedUrls.clear();
    console.log('[避让管理] 避让状态已重置');
  }
}

// 导出模块
module.exports = {
  SafeClickManager,
  SafeAvoidanceManager
};

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🛡️ 安全点击和避让管理系统已加载');
  console.log('这个模块提供了安全的点击操作和访问避让功能');
}