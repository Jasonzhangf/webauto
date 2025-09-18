import { BaseOperation } from '../operations-framework/src/core/BaseOperation';
import { IBrowserOperation, BrowserOperationContext } from '../interfaces/IBrowserOperation';

export class BrowserLaunchOperation extends BaseOperation implements IBrowserOperation {
  name = 'browser-launch';
  description = 'Launch browser instances with configured settings';
  version = '1.0.0';
  abstractCategories = ['browser-management', 'initialization'];

  async execute(context: BrowserOperationContext, params: any = {}): Promise<any> {
    this.logger.info('Executing browser launch operation');

    try {
      const config = context.metadata.config?.browser || {};
      const headless = params.headless ?? config.headless ?? false;
      const viewport = params.viewport ?? config.viewport ?? { width: 1280, height: 720 };
      const userAgent = params.userAgent ?? config.userAgent;

      // Import CamoufoxManager dynamically
      const { CamoufoxManager } = await import('../browser/CamoufoxManager');
      const manager = new CamoufoxManager();

      // Launch browser
      const browser = await manager.launch({
        headless,
        viewport,
        userAgent
      });

      // Create page
      const page = await manager.newPage();

      // Update context
      context.browser = browser;
      context.page = page;

      this.logger.info('Browser launched successfully');

      return {
        success: true,
        result: {
          browserId: context.id,
          viewport,
          userAgent,
          launchTime: new Date().toISOString()
        },
        executionTime: Date.now() - this.startTime,
        metadata: {
          headless,
          viewport: JSON.stringify(viewport),
          userAgent: userAgent || 'default'
        }
      };
    } catch (error) {
      this.logger.error('Browser launch failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - this.startTime,
        metadata: {
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
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
          name: 'browser-config',
          passed: !!context.metadata?.config?.browser,
          message: 'Browser configuration available'
        }
      ]
    };
  }

  getCapabilities() {
    return {
      supportedContentTypes: ['html', 'text'],
      supportedLanguages: ['zh', 'en'],
      maxContentSize: 0,
      processingSpeed: 'medium',
      isRealtime: true,
      requiresInternet: false,
      requiresBrowser: true
    };
  }
}