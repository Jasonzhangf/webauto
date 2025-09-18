import { BaseOperation } from '../operations-framework/src/core/BaseOperation';
import { IBrowserOperation, BrowserOperationContext } from '../interfaces/IBrowserOperation';

export class PageNavigationOperation extends BaseOperation implements IBrowserOperation {
  name = 'page-navigation';
  description = 'Navigate to URLs and handle page loading';
  version = '1.0.0';
  abstractCategories = ['browser-operations', 'navigation'];

  async execute(context: BrowserOperationContext, params: any = {}): Promise<any> {
    this.logger.info(`Executing page navigation operation: ${params.url}`);

    try {
      if (!context.page) {
        throw new Error('No page context available for navigation');
      }

      const { url, waitUntil = 'networkidle', timeout = 30000 } = params;

      // Navigate to URL
      await context.page.goto(url, {
        waitUntil,
        timeout
      });

      // Wait for page to be fully loaded
      await context.page.waitForLoadState('domcontentloaded');

      this.logger.info(`Successfully navigated to: ${url}`);

      return {
        success: true,
        result: {
          url,
          title: await context.page.title(),
          finalUrl: context.page.url(),
          navigationTime: new Date().toISOString()
        },
        executionTime: Date.now() - this.startTime,
        metadata: {
          waitUntil,
          timeout,
          finalUrl: context.page.url()
        }
      };
    } catch (error) {
      this.logger.error('Page navigation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - this.startTime,
        metadata: {
          url: params.url,
          waitUntil: params.waitUntil,
          timeout: params.timeout
        }
      };
    }
  }

  validate(context: BrowserOperationContext): any {
    return {
      isValid: true,
      score: 100,
      issues: [],
      warnings: [],
      checks: [
        {
          name: 'page-context',
          passed: !!context.page,
          message: 'Page context available'
        }
      ]
    };
  }

  getCapabilities() {
    return {
      supportedContentTypes: ['html', 'text'],
      supportedLanguages: ['any'],
      maxContentSize: 0,
      processingSpeed: 'medium',
      isRealtime: true,
      requiresInternet: true,
      requiresBrowser: true
    };
  }
}