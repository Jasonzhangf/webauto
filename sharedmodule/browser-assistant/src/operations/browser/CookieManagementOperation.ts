import { BaseOperation } from '../operations-framework/src/core/BaseOperation';
import { IBrowserOperation, BrowserOperationContext, CookieParams } from '../interfaces/IBrowserOperation';
import fs from 'fs/promises';
import path from 'path';

export class CookieManagementOperation extends BaseOperation implements IBrowserOperation {
  name = 'cookie-management';
  description = 'Manage browser cookies for persistence and authentication';
  version = '1.0.0';
  abstractCategories = ['browser-management', 'data-persistence'];

  async execute(context: BrowserOperationContext, params: CookieParams): Promise<any> {
    this.logger.info(`Executing cookie management operation: ${params.action}`);

    try {
      switch (params.action) {
        case 'load':
          return await this.loadCookies(context, params.domain);
        case 'save':
          return await this.saveCookies(context, params.domain);
        case 'clear':
          return await this.clearCookies(context, params.domain);
        default:
          throw new Error(`Unknown cookie action: ${params.action}`);
      }
    } catch (error) {
      this.logger.error('Cookie management operation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - this.startTime,
        metadata: {
          action: params.action,
          domain: params.domain
        }
      };
    }
  }

  private async loadCookies(context: BrowserOperationContext, domain?: string): Promise<any> {
    const config = context.metadata.config?.cookies;
    if (!config?.storagePath) {
      throw new Error('Cookie storage path not configured');
    }

    const cookiePath = domain
      ? path.join(config.storagePath, `${domain}.json`)
      : path.join(config.storagePath, 'default.json');

    try {
      const cookieData = await fs.readFile(cookiePath, 'utf-8');
      const cookies = JSON.parse(cookieData);

      // Set cookies in browser
      if (context.page) {
        await context.page.context().addCookies(cookies);
      }

      // Update context cookies
      context.cookies.set(domain || 'default', cookies);

      this.logger.info(`Loaded ${cookies.length} cookies for ${domain || 'default'}`);

      return {
        success: true,
        result: {
          action: 'load',
          domain: domain || 'default',
          cookieCount: cookies.length,
          loadTime: new Date().toISOString()
        },
        executionTime: Date.now() - this.startTime,
        metadata: {
          cookiePath,
          cookieCount: cookies.length
        }
      };
    } catch (error) {
      this.logger.warn(`No cookie file found at ${cookiePath}`);
      return {
        success: true,
        result: {
          action: 'load',
          domain: domain || 'default',
          cookieCount: 0,
          loadTime: new Date().toISOString()
        },
        executionTime: Date.now() - this.startTime,
        metadata: {
          cookiePath,
          cookieCount: 0,
          warning: 'No existing cookies found'
        }
      };
    }
  }

  private async saveCookies(context: BrowserOperationContext, domain?: string): Promise<any> {
    const config = context.metadata.config?.cookies;
    if (!config?.storagePath) {
      throw new Error('Cookie storage path not configured');
    }

    if (!context.page) {
      throw new Error('No page context available for cookie extraction');
    }

    // Get cookies from browser
    const cookies = await context.page.context().cookies();

    // Filter by domain if specified
    const filteredCookies = domain
      ? cookies.filter(cookie => cookie.domain?.includes(domain))
      : cookies;

    // Create storage directory if it doesn't exist
    await fs.mkdir(config.storagePath, { recursive: true });

    // Save cookies to file
    const cookiePath = domain
      ? path.join(config.storagePath, `${domain}.json`)
      : path.join(config.storagePath, 'default.json');

    await fs.writeFile(cookiePath, JSON.stringify(filteredCookies, null, 2));

    // Update context cookies
    context.cookies.set(domain || 'default', filteredCookies);

    this.logger.info(`Saved ${filteredCookies.length} cookies for ${domain || 'default'}`);

    return {
      success: true,
      result: {
        action: 'save',
        domain: domain || 'default',
        cookieCount: filteredCookies.length,
        saveTime: new Date().toISOString()
      },
      executionTime: Date.now() - this.startTime,
      metadata: {
        cookiePath,
        cookieCount: filteredCookies.length
      }
    };
  }

  private async clearCookies(context: BrowserOperationContext, domain?: string): Promise<any> {
    if (!context.page) {
      throw new Error('No page context available for cookie clearing');
    }

    // Clear cookies from browser
    await context.page.context().clearCookies();

    // Clear context cookies
    if (domain) {
      context.cookies.delete(domain);
    } else {
      context.cookies.clear();
    }

    // Clear cookie files if storage path is configured
    const config = context.metadata.config?.cookies;
    if (config?.storagePath) {
      try {
        const cookiePath = domain
          ? path.join(config.storagePath, `${domain}.json`)
          : path.join(config.storagePath, 'default.json');

        await fs.unlink(cookiePath);
        this.logger.info(`Cleared cookie file: ${cookiePath}`);
      } catch (error) {
        this.logger.warn(`Cookie file not found or could not be deleted: ${error}`);
      }
    }

    this.logger.info(`Cleared cookies for ${domain || 'all domains'}`);

    return {
      success: true,
      result: {
        action: 'clear',
        domain: domain || 'all',
        clearTime: new Date().toISOString()
      },
      executionTime: Date.now() - this.startTime,
      metadata: {
        domain: domain || 'all'
      }
    };
  }

  validate(context: BrowserOperationContext): any {
    return {
      isValid: true,
      score: 100,
      issues: [],
      warnings: [],
      checks: [
        {
          name: 'cookie-config',
          passed: !!context.metadata?.config?.cookies,
          message: 'Cookie configuration available'
        }
      ]
    };
  }

  getCapabilities() {
    return {
      supportedContentTypes: ['json'],
      supportedLanguages: ['any'],
      maxContentSize: 1024 * 1024, // 1MB
      processingSpeed: 'fast',
      isRealtime: true,
      requiresInternet: false,
      requiresBrowser: true
    };
  }
}