/**
 * WebAuto Operator Framework - 导航操作子
 * @package @webauto/operator-framework
 */

import { NonPageOperator, NonPageOperatorConfig } from '../../core/NonPageOperator';
import { OperationResult, OperatorConfig, OperatorCategory, OperatorType } from '../../core/types/OperatorTypes';

export interface NavigationParams {
  action: 'navigate' | 'back' | 'forward' | 'refresh' | 'getCurrentUrl';
  url?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface NavigationHistory {
  currentUrl: string;
  previousUrl?: string;
  nextUrl?: string;
  history: string[];
  currentIndex: number;
}

export class NavigationOperator extends NonPageOperator {
  private _navigationHistory: NavigationHistory;
  private _currentPage: any = null; // 简化版本，实际应该使用Page对象

  constructor(config: Partial<OperatorConfig> = {}) {
    super({
      id: 'navigation-operator',
      name: '导航操作子',
      type: OperatorType.NON_PAGE,
      category: OperatorCategory.BROWSER,
      description: '管理页面导航、前进、后退等操作',
      requireInitialization: false,
      asyncSupported: true,
      maxConcurrency: 3,
      ...config
    });

    this._navigationHistory = {
      currentUrl: '',
      history: [],
      currentIndex: -1
    };
  }

  async executeNonPageOperation(params: NavigationParams): Promise<OperationResult> {
    switch (params.action) {
      case 'navigate':
        return this.navigateTo(params.url!, params.waitUntil, params.timeout);
      case 'back':
        return this.goBack();
      case 'forward':
        return this.goForward();
      case 'refresh':
        return this.refresh();
      case 'getCurrentUrl':
        return this.getCurrentUrl();
      default:
        return this.createErrorResult(`未知操作: ${params.action}`);
    }
  }

  validateParams(params: NavigationParams): boolean {
    if (!params.action || !['navigate', 'back', 'forward', 'refresh', 'getCurrentUrl'].includes(params.action)) {
      return false;
    }

    if (params.action === 'navigate' && !params.url) {
      return false;
    }

    return true;
  }

  // 核心导航方法
  private async navigateTo(url: string, waitUntil?: string, timeout?: number): Promise<OperationResult> {
    try {
      // 验证URL格式
      if (!this.isValidUrl(url)) {
        return this.createErrorResult(`无效的URL: ${url}`);
      }

      // 更新历史记录
      this.updateHistory(url);

      // 模拟导航（实际实现需要与浏览器实例集成）
      const result = await this.simulateNavigation(url, waitUntil, timeout);

      return this.createSuccessResult({
        navigated: true,
        url,
        waitUntil: waitUntil || 'networkidle',
        ...result
      });
    } catch (error) {
      return this.createErrorResult(`导航失败: ${error.message}`);
    }
  }

  private async goBack(): Promise<OperationResult> {
    try {
      if (this._navigationHistory.currentIndex <= 0) {
        return this.createErrorResult('没有可以后退的页面');
      }

      const previousIndex = this._navigationHistory.currentIndex - 1;
      const previousUrl = this._navigationHistory.history[previousIndex];

      // 更新当前页面
      this._navigationHistory.currentIndex = previousIndex;
      this._navigationHistory.currentUrl = previousUrl;

      // 模拟后退导航
      const result = await this.simulateNavigation(previousUrl);

      return this.createSuccessResult({
        navigated: true,
        action: 'back',
        url: previousUrl,
        ...result
      });
    } catch (error) {
      return this.createErrorResult(`后退失败: ${error.message}`);
    }
  }

  private async goForward(): Promise<OperationResult> {
    try {
      if (this._navigationHistory.currentIndex >= this._navigationHistory.history.length - 1) {
        return this.createErrorResult('没有可以前进的页面');
      }

      const nextIndex = this._navigationHistory.currentIndex + 1;
      const nextUrl = this._navigationHistory.history[nextIndex];

      // 更新当前页面
      this._navigationHistory.currentIndex = nextIndex;
      this._navigationHistory.currentUrl = nextUrl;

      // 模拟前进导航
      const result = await this.simulateNavigation(nextUrl);

      return this.createSuccessResult({
        navigated: true,
        action: 'forward',
        url: nextUrl,
        ...result
      });
    } catch (error) {
      return this.createErrorResult(`前进失败: ${error.message}`);
    }
  }

  private async refresh(): Promise<OperationResult> {
    try {
      const currentUrl = this._navigationHistory.currentUrl;
      if (!currentUrl) {
        return this.createErrorResult('没有当前页面可以刷新');
      }

      // 模拟刷新
      const result = await this.simulateNavigation(currentUrl, undefined, undefined, true);

      return this.createSuccessResult({
        refreshed: true,
        url: currentUrl,
        ...result
      });
    } catch (error) {
      return this.createErrorResult(`刷新失败: ${error.message}`);
    }
  }

  private async getCurrentUrl(): Promise<OperationResult> {
    return this.createSuccessResult({
      currentUrl: this._navigationHistory.currentUrl,
      historyLength: this._navigationHistory.history.length,
      currentIndex: this._navigationHistory.currentIndex
    });
  }

  // 历史记录管理
  private updateHistory(url: string): void {
    // 如果不在历史记录的末尾，清除后面的记录
    if (this._navigationHistory.currentIndex < this._navigationHistory.history.length - 1) {
      this._navigationHistory.history = this._navigationHistory.history.slice(
        0,
        this._navigationHistory.currentIndex + 1
      );
    }

    // 添加新URL
    this._navigationHistory.history.push(url);
    this._navigationHistory.currentIndex = this._navigationHistory.history.length - 1;
    this._navigationHistory.currentUrl = url;

    // 限制历史记录长度
    if (this._navigationHistory.history.length > 50) {
      this._navigationHistory.history.shift();
      this._navigationHistory.currentIndex--;
    }
  }

  // 模拟导航（实际实现需要与浏览器实例集成）
  private async simulateNavigation(
    url: string,
    waitUntil?: string,
    timeout?: number,
    isRefresh?: boolean
  ): Promise<any> {
    // 这里是简化版本，实际实现需要：
    // 1. 与真实的浏览器页面实例集成
    // 2. 等待页面加载完成
    // 3. 处理各种加载状态
    // 4. 错误处理

    await new Promise(resolve => setTimeout(resolve, 100)); // 模拟导航延迟

    return {
      timestamp: Date.now(),
      status: 'loaded',
      title: `页面标题 - ${new URL(url).hostname}`,
      isRefresh: !!isRefresh
    };
  }

  // 工具方法
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // 扩展方法
  async getNavigationHistory(): Promise<OperationResult> {
    try {
      return this.createSuccessResult({
        ...this._navigationHistory,
        canGoBack: this._navigationHistory.currentIndex > 0,
        canGoForward: this._navigationHistory.currentIndex < this._navigationHistory.history.length - 1
      });
    } catch (error) {
      return this.createErrorResult(`获取导航历史失败: ${error.message}`);
    }
  }

  async clearHistory(): Promise<OperationResult> {
    try {
      const currentUrl = this._navigationHistory.currentUrl;

      this._navigationHistory = {
        currentUrl,
        history: currentUrl ? [currentUrl] : [],
        currentIndex: currentUrl ? 0 : -1
      };

      return this.createSuccessResult({
        cleared: true,
        currentUrl
      });
    } catch (error) {
      return this.createErrorResult(`清除历史记录失败: ${error.message}`);
    }
  }

  async canGoBack(): Promise<OperationResult> {
    try {
      return this.createSuccessResult({
        canGoBack: this._navigationHistory.currentIndex > 0
      });
    } catch (error) {
      return this.createErrorResult(`检查后退能力失败: ${error.message}`);
    }
  }

  async canGoForward(): Promise<OperationResult> {
    try {
      return this.createSuccessResult({
        canGoForward: this._navigationHistory.currentIndex < this._navigationHistory.history.length - 1
      });
    } catch (error) {
      return this.createErrorResult(`检查前进能力失败: ${error.message}`);
    }
  }

  // 设置当前页面（用于与浏览器实例集成）
  setCurrentPage(page: any): void {
    this._currentPage = page;
  }

  getCurrentPage(): any {
    return this._currentPage;
  }
}