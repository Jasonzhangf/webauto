/**
 * WebAuto Workflow Engine - Simple Navigation Operator
 * @package @webauto/workflow-engine
 */

import { UniversalOperator, OperationResult, OperatorConfig } from '../../workflow/types/WorkflowTypes';

export interface NavigationParams {
  action: 'navigate' | 'back' | 'forward' | 'refresh' | 'wait' | 'screenshot';
  url?: string;
  timeout?: number;
  waitFor?: string;
  screenshot?: boolean;
  waitTime?: number;
}

export interface PageInfo {
  url: string;
  title: string;
  loadTime: number;
  status: 'loading' | 'loaded' | 'error';
  statusCode?: number;
}

export class NavigationOperator implements UniversalOperator {
  public config: OperatorConfig;
  private _currentPage: PageInfo | null = null;
  private _history: PageInfo[] = [];
  private _historyIndex: number = -1;

  constructor() {
    this.config = {
      id: 'navigation',
      name: 'Navigation Operator',
      type: 'navigation',
      description: 'Handles browser navigation and page interactions',
      version: '1.0.0',
      parameters: [
        {
          name: 'action',
          type: 'string',
          required: true,
          description: 'Navigation action: navigate, back, forward, refresh, wait, screenshot'
        },
        {
          name: 'url',
          type: 'string',
          required: false,
          description: 'Target URL for navigation'
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          default: 30000,
          description: 'Navigation timeout in milliseconds'
        },
        {
          name: 'waitFor',
          type: 'string',
          required: false,
          description: 'CSS selector to wait for before considering page loaded'
        },
        {
          name: 'screenshot',
          type: 'boolean',
          required: false,
          default: false,
          description: 'Take screenshot after navigation'
        },
        {
          name: 'waitTime',
          type: 'number',
          required: false,
          description: 'Wait time in milliseconds for wait action'
        }
      ]
    };
  }

  async execute(params: NavigationParams): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'navigate':
          return await this.navigateTo(params.url!, params);
        case 'back':
          return await this.goBack(params);
        case 'forward':
          return await this.goForward(params);
        case 'refresh':
          return await this.refresh(params);
        case 'wait':
          return await this.wait(params.waitTime || 1000);
        case 'screenshot':
          return await this.takeScreenshot(params);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime
      };
    }
  }

  validate(params: NavigationParams): boolean {
    if (!params.action || !['navigate', 'back', 'forward', 'refresh', 'wait', 'screenshot'].includes(params.action)) {
      return false;
    }

    if (params.action === 'navigate' && !params.url) {
      return false;
    }

    if (params.url && typeof params.url !== 'string') {
      return false;
    }

    if (params.timeout !== undefined && (typeof params.timeout !== 'number' || params.timeout <= 0)) {
      return false;
    }

    if (params.waitFor && typeof params.waitFor !== 'string') {
      return false;
    }

    if (params.screenshot !== undefined && typeof params.screenshot !== 'boolean') {
      return false;
    }

    if (params.waitTime !== undefined && (typeof params.waitTime !== 'number' || params.waitTime <= 0)) {
      return false;
    }

    return true;
  }

  getCapabilities(): string[] {
    return ['navigation', 'waiting', 'screenshot', 'page-analysis'];
  }

  private async navigateTo(url: string, params: NavigationParams): Promise<OperationResult> {
    const startTime = Date.now();
    const timeout = params.timeout || 30000;

    try {
      // Simulate navigation
      const pageInfo: PageInfo = {
        url,
        title: `Page: ${new URL(url).hostname}`,
        loadTime: Date.now() - startTime,
        status: 'loaded',
        statusCode: 200
      };

      // Simulate waiting for specific elements
      if (params.waitFor) {
        await this.simulateWaitForElement(params.waitFor, timeout);
      }

      // Update history
      this.updateHistory(pageInfo);

      // Take screenshot if requested
      let screenshotPath = null;
      if (params.screenshot) {
        screenshotPath = await this.captureScreenshot(url);
      }

      this._currentPage = pageInfo;

      return {
        success: true,
        data: {
          message: `Navigated to ${url}`,
          pageInfo,
          screenshotPath,
          loadTime: pageInfo.loadTime
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  private async goBack(params: NavigationParams): Promise<OperationResult> {
    if (this._historyIndex <= 0) {
      return {
        success: false,
        error: 'No previous page in history',
        duration: Date.now() - startTime
      };
    }

    this._historyIndex--;
    const previousPage = this._history[this._historyIndex];

    // Simulate going back
    const pageInfo: PageInfo = {
      ...previousPage,
      loadTime: Date.now() - startTime,
      status: 'loaded'
    };

    this._currentPage = pageInfo;

    return {
      success: true,
      data: {
        message: 'Navigated back',
        pageInfo,
        historyIndex: this._historyIndex
      },
      duration: Date.now() - startTime
    };
  }

  private async goForward(params: NavigationParams): Promise<OperationResult> {
    if (this._historyIndex >= this._history.length - 1) {
      return {
        success: false,
        error: 'No next page in history',
        duration: Date.now() - startTime
      };
    }

    this._historyIndex++;
    const nextPage = this._history[this._historyIndex];

    // Simulate going forward
    const pageInfo: PageInfo = {
      ...nextPage,
      loadTime: Date.now() - startTime,
      status: 'loaded'
    };

    this._currentPage = pageInfo;

    return {
      success: true,
      data: {
        message: 'Navigated forward',
        pageInfo,
        historyIndex: this._historyIndex
      },
      duration: Date.now() - startTime
    };
  }

  private async refresh(params: NavigationParams): Promise<OperationResult> {
    if (!this._currentPage) {
      return {
        success: false,
        error: 'No current page to refresh',
        duration: Date.now() - startTime
      };
    }

    const startTime = Date.now();

    // Simulate page refresh
    const pageInfo: PageInfo = {
      ...this._currentPage,
      loadTime: Date.now() - startTime,
      status: 'loaded'
    };

    // Update current page in history
    if (this._historyIndex >= 0 && this._historyIndex < this._history.length) {
      this._history[this._historyIndex] = pageInfo;
    }

    this._currentPage = pageInfo;

    return {
      success: true,
      data: {
        message: 'Page refreshed',
        pageInfo,
        loadTime: pageInfo.loadTime
      },
      duration: Date.now() - startTime
    };
  }

  private async wait(waitTime: number): Promise<OperationResult> {
    const startTime = Date.now();

    await new Promise(resolve => setTimeout(resolve, waitTime));

    return {
      success: true,
      data: {
        message: `Waited for ${waitTime}ms`,
        waitTime
      },
      duration: Date.now() - startTime
    };
  }

  private async takeScreenshot(params: NavigationParams): Promise<OperationResult> {
    if (!this._currentPage) {
      return {
        success: false,
        error: 'No current page to screenshot',
        duration: Date.now() - startTime
      };
    }

    const screenshotPath = await this.captureScreenshot(this._currentPage.url);

    return {
      success: true,
      data: {
        message: 'Screenshot captured',
        screenshotPath,
        pageInfo: this._currentPage
      },
      duration: Date.now() - startTime
    };
  }

  // Helper methods
  private updateHistory(pageInfo: PageInfo): void {
    // Remove forward history if we're not at the end
    if (this._historyIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
    }

    this._history.push(pageInfo);
    this._historyIndex = this._history.length - 1;
  }

  private async simulateWaitForElement(selector: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for element: ${selector}`));
          return;
        }

        // Simulate element detection
        const elementFound = Math.random() > 0.3; // 70% chance of finding element

        if (elementFound) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  private async captureScreenshot(url: string): Promise<string> {
    // Simulate screenshot capture
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}.png`;
    return `./screenshots/${filename}`;
  }

  // Additional utility methods
  async getCurrentPageInfo(): Promise<OperationResult> {
    if (!this._currentPage) {
      return {
        success: false,
        error: 'No current page',
        duration: 0
      };
    }

    return {
      success: true,
      data: {
        pageInfo: this._currentPage,
        historySize: this._history.length,
        historyIndex: this._historyIndex
      },
      duration: 0
    };
  }

  async getHistory(): Promise<OperationResult> {
    return {
      success: true,
      data: {
        history: [...this._history],
        currentIndex: this._historyIndex,
        canGoBack: this._historyIndex > 0,
        canGoForward: this._historyIndex < this._history.length - 1
      },
      duration: 0
    };
  }

  async clearHistory(): Promise<OperationResult> {
    const clearedCount = this._history.length;
    this._history = [];
    this._historyIndex = -1;

    return {
      success: true,
      data: {
        message: `Cleared ${clearedCount} history entries`,
        clearedCount
      },
      duration: Date.now() - startTime
    };
  }

  async getPageTitle(): Promise<OperationResult> {
    if (!this._currentPage) {
      return {
        success: false,
        error: 'No current page',
        duration: 0
      };
    }

    return {
      success: true,
      data: {
        title: this._currentPage.title,
        url: this._currentPage.url
      },
      duration: 0
    };
  }

  async getPageUrl(): Promise<OperationResult> {
    if (!this._currentPage) {
      return {
        success: false,
        error: 'No current page',
        duration: 0
      };
    }

    return {
      success: true,
      data: {
        url: this._currentPage.url,
        title: this._currentPage.title
      },
      duration: 0
    };
  }

  async waitForElement(selector: string, timeout: number = 30000): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      await this.simulateWaitForElement(selector, timeout);

      return {
        success: true,
        data: {
          message: `Element found: ${selector}`,
          selector,
          waitTime: Date.now() - startTime
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }
}