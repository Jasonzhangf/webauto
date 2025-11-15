/**
 * WebAuto Workflow Engine - Simple Browser Operator
 * @package @webauto/workflow-engine
 */

import { UniversalOperator, OperationResult, OperatorConfig } from '../../workflow/types/WorkflowTypes';

export interface BrowserParams {
  action: 'start' | 'stop' | 'restart';
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  timeout?: number;
}

export class BrowserOperator implements UniversalOperator {
  public config: OperatorConfig;
  private _browser: any = null;
  private _isInitialized: boolean = false;

  constructor() {
    this.config = {
      id: 'browser',
      name: 'Browser Operator',
      type: 'browser',
      description: 'Manages browser instances for web automation',
      version: '1.0.0',
      parameters: [
        {
          name: 'action',
          type: 'string',
          required: true,
          description: 'Action to perform: start, stop, restart'
        },
        {
          name: 'headless',
          type: 'boolean',
          required: false,
          default: false,
          description: 'Run browser in headless mode'
        },
        {
          name: 'viewport',
          type: 'object',
          required: false,
          description: 'Browser viewport dimensions'
        },
        {
          name: 'userAgent',
          type: 'string',
          required: false,
          description: 'Custom user agent string'
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          default: 30000,
          description: 'Browser operation timeout in milliseconds'
        }
      ]
    };
  }

  async execute(params: BrowserParams): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'start':
          return await this.startBrowser(params);
        case 'stop':
          return await this.stopBrowser();
        case 'restart':
          return await this.restartBrowser(params);
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

  validate(params: BrowserParams): boolean {
    if (!params.action || !['start', 'stop', 'restart'].includes(params.action)) {
      return false;
    }

    if (params.action === 'start' || params.action === 'restart') {
      if (params.headless !== undefined && typeof params.headless !== 'boolean') {
        return false;
      }

      if (params.viewport) {
        if (typeof params.viewport !== 'object' ||
            !params.viewport.width ||
            !params.viewport.height ||
            typeof params.viewport.width !== 'number' ||
            typeof params.viewport.height !== 'number') {
          return false;
        }
      }

      if (params.userAgent && typeof params.userAgent !== 'string') {
        return false;
      }

      if (params.timeout !== undefined && (typeof params.timeout !== 'number' || params.timeout <= 0)) {
        return false;
      }
    }

    return true;
  }

  getCapabilities(): string[] {
    return ['browser-management', 'viewport-control', 'user-agent-control'];
  }

  private async startBrowser(params: BrowserParams): Promise<OperationResult> {
    if (this._isInitialized && this._browser) {
      return {
        success: true,
        data: {
          message: 'Browser already started',
          browser: this._browser
        },
        duration: 0
      };
    }

    try {
      // Mock browser initialization - in real implementation, this would use Playwright or Puppeteer
      const browserConfig = {
        headless: params.headless || false,
        viewport: params.viewport || { width: 1920, height: 1080 },
        userAgent: params.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        timeout: params.timeout || 30000
      };

      // Simulate browser start
      this._browser = {
        id: `browser_${Date.now()}`,
        config: browserConfig,
        pages: [],
        createdAt: Date.now()
      };

      this._isInitialized = true;

      return {
        success: true,
        data: {
          message: 'Browser started successfully',
          browser: this._browser,
          config: browserConfig
        },
        duration: Date.now() - (startTime - Date.now())
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  private async stopBrowser(): Promise<OperationResult> {
    if (!this._isInitialized || !this._browser) {
      return {
        success: true,
        data: {
          message: 'Browser not running'
        },
        duration: 0
      };
    }

    try {
      // Simulate browser cleanup
      const browserInfo = { ...this._browser };

      this._browser = null;
      this._isInitialized = false;

      return {
        success: true,
        data: {
          message: 'Browser stopped successfully',
          browser: browserInfo
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

  private async restartBrowser(params: BrowserParams): Promise<OperationResult> {
    // Stop first
    await this.stopBrowser();

    // Small delay to ensure proper cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start again
    return await this.startBrowser(params);
  }

  // Additional utility methods
  getBrowserState(): any {
    if (!this._isInitialized || !this._browser) {
      return {
        running: false,
        browser: null
      };
    }

    return {
      running: true,
      browser: this._browser,
      uptime: Date.now() - this._browser.createdAt
    };
  }

  async getBrowserInfo(): Promise<OperationResult> {
    return {
      success: true,
      data: this.getBrowserState(),
      duration: 0
    };
  }

  async createPage(): Promise<OperationResult> {
    if (!this._isInitialized || !this._browser) {
      return {
        success: false,
        error: 'Browser not running',
        duration: 0
      };
    }

    try {
      const page = {
        id: `page_${Date.now()}`,
        url: 'about:blank',
        title: 'New Page',
        createdAt: Date.now()
      };

      this._browser.pages.push(page);

      return {
        success: true,
        data: {
          message: 'Page created successfully',
          page
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

  async closeAllPages(): Promise<OperationResult> {
    if (!this._isInitialized || !this._browser) {
      return {
        success: true,
        data: {
          message: 'Browser not running'
        },
        duration: 0
      };
    }

    const closedPages = this._browser.pages.length;
    this._browser.pages = [];

    return {
      success: true,
      data: {
        message: `Closed ${closedPages} pages`,
        closedPages
      },
      duration: Date.now() - startTime
    };
  }
}