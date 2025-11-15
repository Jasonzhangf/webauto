/**
 * 安全页面访问管理器
 * 严格遵守安全规则，防止被拉黑
 */

export class SafePageAccessManager {
  private accessHistory: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private blockedUrls: Set<string> = new Set();
  private lastErrorTime: number = 0;
  private consecutiveErrors: number = 0;

  constructor() {
    this.initializeSafetyRules();
  }

  /**
   * 初始化安全规则
   */
  private initializeSafetyRules() {
    console.log('🛡️ 初始化安全访问规则');
    console.log('📋 规则: 任何错误立即停止访问');
  }

  /**
   * 安全的页面访问方法
   */
  async safePageAccess(page: any, url: string, options: any = {}) {
    const {
      timeout = 10000,
      waitUntil = 'domcontentloaded',
      maxRetries = 0,
      retryDelay = 5000,
      ...otherOptions
    } = options;

    // 检查URL是否被封锁
    if (this.isUrlBlocked(url)) {
      throw new Error(`🚨 URL被封锁: ${url}`);
    }

    // 检查访问频率
    if (!this.checkAccessFrequency(url)) {
      throw new Error(`🚨 访问频率过高: ${url}`);
    }

    console.log(`🔐 安全访问: ${url}`);

    try {
      // 访问页面
      const response = await page.goto(url, {
        timeout,
        waitUntil,
        ...otherOptions
      });

      // 检查HTTP状态码
      if (!response || response.status() >= 400) {
        const status = response?.status() || 'Unknown';
        this.handleAccessError(url, new Error(`HTTP ${status}`));
        throw new Error(`🚨 HTTP ${status}: ${url}`);
      }

      // 等待页面加载
      await page.waitForTimeout(2000);

      // 检查页面内容
      const contentCheck = await this.checkPageContent(page, url);
      if (!contentCheck.isValid) {
        this.handleAccessError(url, new Error(contentCheck.reason));
        throw new Error(`🚨 页面内容异常: ${contentCheck.reason}`);
      }

      // 记录成功访问
      this.recordSuccessfulAccess(url);

      console.log(`✅ 安全访问成功: ${url}`);
      return {
        success: true,
        response,
        url,
        accessTime: Date.now()
      };

    } catch (error) {
      this.handleAccessError(url, error);
      throw error; // 重新抛出错误，让调用者知道访问失败
    }
  }

  /**
   * 检查URL是否被封锁
   */
  private isUrlBlocked(url: string): boolean {
    return this.blockedUrls.has(url);
  }

  /**
   * 检查访问频率
   */
  private checkAccessFrequency(url: string): boolean {
    const now = Date.now();
    const lastAccess = this.accessHistory.get(url) || 0;
    const timeSinceLastAccess = now - lastAccess;

    // 最小访问间隔3秒
    const minInterval = 3000;

    if (timeSinceLastAccess < minInterval) {
      console.warn(`⚠️ 访问频率过高，间隔: ${timeSinceLastAccess}ms`);
      return false;
    }

    return true;
  }

  /**
   * 检查页面内容
   */
  private async checkPageContent(page: any, url: string): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // 检查是否是错误页面
      const isErrorPage = await page.evaluate(() => {
        const title = document.title;
        const bodyText = document.body?.textContent || '';

        // 检查常见错误页面特征
        const errorKeywords = [
          '404', 'not found', 'error', 'forbidden', 'access denied',
          '服务不可用', '页面不存在', '访问被拒绝', '验证码'
        ];

        return errorKeywords.some(keyword =>
          title.toLowerCase().includes(keyword) ||
          bodyText.toLowerCase().includes(keyword)
        );
      });

      if (isErrorPage) {
        return { isValid: false, reason: '检测到错误页面' };
      }

      // 检查页面是否有内容
      const hasContent = await page.evaluate(() => {
        return document.body && document.body.children.length > 0;
      });

      if (!hasContent) {
        return { isValid: false, reason: '页面内容为空' };
      }

      return { isValid: true };

    } catch (error) {
      return { isValid: false, reason: `内容检查失败: ${error.message}` };
    }
  }

  /**
   * 处理访问错误
   */
  private handleAccessError(url: string, error: Error) {
    console.error('🚨 访问错误:', error.message);

    // 记录错误
    this.recordAccessError(url);

    // 检查是否需要封锁URL
    if (this.shouldBlockUrl(url)) {
      this.blockUrl(url);
      console.error(`🚨 URL已被封锁: ${url}`);
    }

    // 检查是否需要停止所有操作
    if (this.shouldStopAllOperations()) {
      console.error('🚨 达到错误限制，停止所有操作');
      throw new Error('🚨 达到安全限制，立即停止所有操作');
    }
  }

  /**
   * 记录成功访问
   */
  private recordSuccessfulAccess(url: string) {
    this.accessHistory.set(url, Date.now());
    this.consecutiveErrors = 0;
    this.lastErrorTime = 0;
  }

  /**
   * 记录访问错误
   */
  private recordAccessError(url: string) {
    const now = Date.now();
    this.lastErrorTime = now;
    this.consecutiveErrors++;

    const currentCount = this.errorCounts.get(url) || 0;
    this.errorCounts.set(url, currentCount + 1);

    console.warn(`⚠️ 错误计数: ${url} (${currentCount + 1}次)`);
  }

  /**
   * 检查是否应该封锁URL
   */
  private shouldBlockUrl(url: string): boolean {
    const errorCount = this.errorCounts.get(url) || 0;
    return errorCount >= 3; // 3次错误后封锁
  }

  /**
   * 封锁URL
   */
  private blockUrl(url: string) {
    this.blockedUrls.add(url);
    console.error(`🚨 URL已封锁: ${url}`);
  }

  /**
   * 检查是否应该停止所有操作
   */
  private shouldStopAllOperations(): boolean {
    // 连续5次错误停止
    if (this.consecutiveErrors >= 5) {
      return true;
    }

    // 总错误数超过20次停止
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    if (totalErrors >= 20) {
      return true;
    }

    // 最后一次错误后30分钟内不再尝试
    const timeSinceLastError = Date.now() - this.lastErrorTime;
    if (timeSinceLastError < 30 * 60 * 1000 && this.consecutiveErrors >= 3) {
      return true;
    }

    return false;
  }

  /**
   * 获取访问统计
   */
  getAccessStats() {
    return {
      totalUrls: this.accessHistory.size,
      blockedUrls: this.blockedUrls.size,
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      consecutiveErrors: this.consecutiveErrors,
      lastErrorTime: this.lastErrorTime,
      canContinue: !this.shouldStopAllOperations()
    };
  }

  /**
   * 重置访问统计
   */
  resetStats() {
    this.accessHistory.clear();
    this.errorCounts.clear();
    this.blockedUrls.clear();
    this.consecutiveErrors = 0;
    this.lastErrorTime = 0;
    console.log('🔄 访问统计已重置');
  }

  /**
   * 等待安全间隔
   */
  async waitForSafeInterval(url: string) {
    const now = Date.now();
    const lastAccess = this.accessHistory.get(url) || 0;
    const timeSinceLastAccess = now - lastAccess;
    const minInterval = 3000; // 3秒

    if (timeSinceLastAccess < minInterval) {
      const waitTime = minInterval - timeSinceLastAccess;
      console.log(`⏳ 等待安全间隔: ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * 安全的页面访问工具函数
 */
export async function safePageAccess(page: any, url: string, options?: any) {
  const manager = new SafePageAccessManager();
  return await manager.safePageAccess(page, url, options);
}

// 导出单例实例
export const safeAccessManager = new SafePageAccessManager();