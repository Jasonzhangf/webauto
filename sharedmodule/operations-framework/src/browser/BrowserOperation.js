/**
 * 浏览器操作子基类
 * 处理浏览器相关的所有操作
 */

import BaseOperation from "./BaseOperation.js"';

export class BrowserOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.category = 'browser';
    this.browser = null;
    this.page = null;
    this.context = null;
  }

  /**
   * 初始化浏览器实例
   */
  async initializeBrowser(browserInstance = null) {
    if (browserInstance) {
      this.browser = browserInstance;
    } else {
      // 默认浏览器初始化逻辑
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({
        headless: this.config.headless ?? false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    
    if (!this.page) {
      this.page = await this.browser.newPage({
        userAgent: this.config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        viewport: this.config.viewport || { width: 1280, height: 720 }
      });
    }
    
    this.logger.info('Browser initialized', { 
      headless: this.config.headless,
      viewport: this.config.viewport 
    });
  }

  /**
   * 导航到指定URL
   */
  async navigate(url, options = {}) {
    if (!this.page) {
      throw new Error('Page not initialized. Call initializeBrowser() first.');
    }

    const defaultOptions = {
      waitUntil: 'domcontentloaded',
      timeout: this.config.timeout || 30000
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
      await this.page.goto(url, mergedOptions);
      this.logger.info('Navigated to URL', { url, options: mergedOptions });
      return true;
    } catch (error) {
      this.logger.error('Navigation failed', { url, error: error.message });
      throw error;
    }
  }

  /**
   * 等待元素出现
   */
  async waitForElement(selector, options = {}) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }

    const defaultOptions = {
      state: 'visible',
      timeout: this.config.elementTimeout || 10000
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
      const element = await this.page.waitForSelector(selector, mergedOptions);
      this.logger.debug('Element found', { selector, options: mergedOptions });
      return element;
    } catch (error) {
      this.logger.warn('Element not found', { selector, error: error.message });
      throw error;
    }
  }

  /**
   * 执行页面脚本
   */
  async evaluate(script, ...args) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }

    try {
      const result = await this.page.evaluate(script, ...args);
      this.logger.debug('Script evaluated successfully', { scriptLength: script.length });
      return result;
    } catch (error) {
      this.logger.error('Script evaluation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取页面标题
   */
  async getPageTitle() {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }
    return await this.page.title();
  }

  /**
   * 获取页面URL
   */
  async getPageUrl() {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }
    return this.page.url();
  }

  /**
   * 截图
   */
  async screenshot(options = {}) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }

    const defaultOptions = {
      fullPage: true,
      type: 'png'
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
      const buffer = await this.page.screenshot(mergedOptions);
      this.logger.info('Screenshot captured', { options: mergedOptions });
      return buffer;
    } catch (error) {
      this.logger.error('Screenshot failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 滚动页面
   */
  async scroll(options = {}) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }

    const {
      direction = 'down',
      amount = 'window.innerHeight',
      delay = 1000
    } = options;

    try {
      await this.page.evaluate(async ({ direction, amount, delay }) => {
        const scrollAmount = amount === 'window.innerHeight' ? window.innerHeight : parseInt(amount);
        
        if (direction === 'down') {
          window.scrollBy(0, scrollAmount);
        } else if (direction === 'up') {
          window.scrollBy(0, -scrollAmount);
        } else if (direction === 'bottom') {
          window.scrollTo(0, document.body.scrollHeight);
        } else if (direction === 'top') {
          window.scrollTo(0, 0);
        }

        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }, { direction, amount, delay });

      this.logger.debug('Page scrolled', { direction, amount });
      return true;
    } catch (error) {
      this.logger.error('Scroll failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 设置页面超时
   */
  setTimeout(timeout) {
    if (this.page) {
      this.page.setDefaultTimeout(timeout);
    }
    this.config.timeout = timeout;
    this.logger.debug('Page timeout set', { timeout });
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.logger.info('Browser resources cleaned up');
    } catch (error) {
      this.logger.error('Cleanup failed', { error: error.message });
    }
  }

  /**
   * 获取浏览器状态
   */
  getBrowserStatus() {
    return {
      hasBrowser: !!this.browser,
      hasPage: !!this.page,
      pageUrl: this.page ? this.page.url() : null,
      pageTitle: this.page ? this.page.title() : null,
      config: this.config
    };
  }

  /**
   * 重试操作
   */
  async retryOperation(operation, maxAttempts = 3, delay = 1000) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.debug(`Attempting operation (attempt ${attempt}/${maxAttempts})`);
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(`Operation failed (attempt ${attempt}/${maxAttempts})`, { error: error.message });
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 获取页面元素
   */
  async getElements(selector) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }

    try {
      const elements = await this.page.$$(selector);
      this.logger.debug('Elements found', { selector, count: elements.length });
      return elements;
    } catch (error) {
      this.logger.error('Failed to get elements', { selector, error: error.message });
      throw error;
    }
  }
}

export default BrowserOperation;