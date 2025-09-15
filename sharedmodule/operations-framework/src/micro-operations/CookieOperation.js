/**
 * Cookie Management Operation - Handles cookie loading and saving for authentication
 * Supports various cookie formats and automatic domain detection
 */

import { BaseOperation } from '../core/BaseOperation.js';

export class CookieOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'CookieOperation';
    this.description = 'Cookie management operation for authentication';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['authentication', 'session-management'];
    this.supportedContainers = ['any'];
    this.capabilities = ['cookie-loading', 'cookie-saving', 'domain-detection'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['action'];
    this.optionalParameters = {
      domain: 'weibo.com',
      cookiePath: '~/.webauto/cookies',
      forceReload: false
    };
  }

  async execute(context, params = {}) {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting cookie operation', { action: finalParams.action, domain: finalParams.domain });

    try {
      let result;

      switch (finalParams.action) {
        case 'load':
          result = await this.loadCookies(context, finalParams);
          break;
        case 'save':
          result = await this.saveCookies(context, finalParams);
          break;
        case 'clear':
          result = await this.clearCookies(context, finalParams);
          break;
        default:
          throw new Error(`Unknown cookie action: ${finalParams.action}`);
      }

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Cookie operation completed', {
        action: finalParams.action,
        executionTime,
        success: true
      });

      return {
        success: true,
        result,
        metadata: {
          action: finalParams.action,
          domain: finalParams.domain,
          executionTime,
          operationType: 'cookie-management'
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Cookie operation failed', {
        action: finalParams.action,
        error: error.message,
        executionTime
      });

      return {
        success: false,
        error: error.message,
        metadata: {
          action: finalParams.action,
          domain: finalParams.domain,
          executionTime,
          operationType: 'cookie-management'
        }
      };
    }
  }

  async loadCookies(context, params) {
    if (!context.page) {
      throw new Error('Page context not available for cookie loading');
    }

    const { domain, cookiePath, forceReload } = params;
    const homeDir = process.env.HOME || '~';
    const resolvedCookiePath = cookiePath.replace('~', homeDir);

    this.log('info', 'Loading cookies', { domain, cookiePath: resolvedCookiePath });

    // 尝试多个可能的cookie文件路径
    const possiblePaths = [
      `${resolvedCookiePath}/${domain}.json`,
      `${resolvedCookiePath}/${domain.replace(/^www\./, '')}.json`,
      `${resolvedCookiePath}/s.${domain}.json`,
      `${resolvedCookiePath}/www.${domain}.json`,
      './cookies.json'
    ];

    let loadedCookies = false;

    for (const path of possiblePaths) {
      try {
        const fs = await import('fs');
        if (fs.existsSync(path)) {
          const cookieContent = fs.readFileSync(path, 'utf8');
          const cookies = JSON.parse(cookieContent);

          if (Array.isArray(cookies) && cookies.length > 0) {
            // 过滤和转换cookies
            const validCookies = this.filterAndConvertCookies(cookies, domain);

            if (validCookies.length > 0) {
              await context.page.context().addCookies(validCookies);
              this.log('info', `Successfully loaded ${validCookies.length} cookies from ${path}`);
              loadedCookies = true;
              break;
            }
          }
        }
      } catch (error) {
        this.log('debug', `Failed to load cookies from ${path}: ${error.message}`);
      }
    }

    if (!loadedCookies) {
      this.log('warn', `No valid cookies found for domain: ${domain}`);
      return {
        loaded: false,
        message: `No valid cookies found for domain: ${domain}`,
        attemptedPaths: possiblePaths
      };
    }

    return {
      loaded: true,
      message: `Successfully loaded cookies for domain: ${domain}`,
      cookieCount: loadedCookies
    };
  }

  async saveCookies(context, params) {
    if (!context.page) {
      throw new Error('Page context not available for cookie saving');
    }

    const { domain, cookiePath } = params;
    const homeDir = process.env.HOME || '~';
    const resolvedCookiePath = cookiePath.replace('~', homeDir);

    this.log('info', 'Saving cookies', { domain, cookiePath: resolvedCookiePath });

    try {
      const fs = await import('fs');
      const path = await import('path');

      // 确保目录存在
      await this.ensureDirectory(resolvedCookiePath);

      // 获取当前页面的cookies
      const cookies = await context.page.context().cookies();

      // 过滤当前域名的cookies
      const domainCookies = this.filterCookiesByDomain(cookies, domain);

      if (domainCookies.length === 0) {
        this.log('warn', `No cookies found for domain: ${domain}`);
        return {
          saved: false,
          message: `No cookies found for domain: ${domain}`,
          cookieCount: 0
        };
      }

      // 保存cookies到文件
      const cookieFilePath = path.join(resolvedCookiePath, `${domain}.json`);
      fs.writeFileSync(cookieFilePath, JSON.stringify(domainCookies, null, 2));

      this.log('info', `Successfully saved ${domainCookies.length} cookies to ${cookieFilePath}`);

      return {
        saved: true,
        message: `Successfully saved cookies for domain: ${domain}`,
        cookieCount: domainCookies.length,
        filePath: cookieFilePath
      };

    } catch (error) {
      this.log('error', `Failed to save cookies: ${error.message}`);
      throw error;
    }
  }

  async clearCookies(context, params) {
    if (!context.page) {
      throw new Error('Page context not available for cookie clearing');
    }

    const { domain } = params;

    this.log('info', 'Clearing cookies', { domain });

    try {
      if (domain) {
        // 清除特定域名的cookies
        const cookies = await context.page.context().cookies();
        const domainCookies = this.filterCookiesByDomain(cookies, domain);

        for (const cookie of domainCookies) {
          await context.page.context().addCookies([{ ...cookie, expires: 0, value: '' }]);
        }

        this.log('info', `Cleared ${domainCookies.length} cookies for domain: ${domain}`);
      } else {
        // 清除所有cookies
        await context.page.context().clearCookies();
        this.log('info', 'Cleared all cookies');
      }

      return {
        cleared: true,
        message: domain ? `Cleared cookies for domain: ${domain}` : 'Cleared all cookies'
      };

    } catch (error) {
      this.log('error', `Failed to clear cookies: ${error.message}`);
      throw error;
    }
  }

  filterAndConvertCookies(cookies, domain) {
    return cookies
      .filter(cookie => {
        // 检查cookie是否属于目标域名或相关域名
        const cookieDomain = cookie.domain || '';
        // 检查确切的域名匹配或子域名匹配
        return cookieDomain === domain ||
               cookieDomain === `.${domain}` ||
               cookieDomain === `www.${domain}` ||
               cookieDomain.includes(domain) ||
               domain.includes(cookieDomain.replace(/^\./, ''));
      })
      .map(cookie => {
        // 转换为Playwright格式，处理expires字段
        let expires = -1; // 默认为会话cookie
        if (cookie.expires) {
          if (typeof cookie.expires === 'number') {
            expires = cookie.expires;
          } else if (typeof cookie.expires === 'string') {
            // 如果是ISO字符串，转换为时间戳
            expires = new Date(cookie.expires).getTime() / 1000;
          }
        }

        return {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          expires: expires,
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false,
          sameSite: cookie.sameSite || 'Lax'
        };
      });
  }

  filterCookiesByDomain(cookies, domain) {
    return cookies.filter(cookie => {
      const cookieDomain = cookie.domain || '';
      return cookieDomain.includes(domain) || domain.includes(cookieDomain);
    });
  }

  async ensureDirectory(dirPath) {
    const fs = await import('fs');
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
      // 如果目录已存在，忽略错误
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  calculateContextMatchScore(context) {
    let score = 0.7; // 基础分数

    // 认证相关上下文加分
    if (context.operation === 'authentication' || context.operation === 'login') {
      score += 0.3;
    }

    // 会话管理相关上下文加分
    if (context.purpose === 'session-management' || context.purpose === 'cookie-management') {
      score += 0.2;
    }

    // 社交媒体相关上下文加分
    if (context.domain === 'social-media' || context.platform === 'weibo') {
      score += 0.1;
    }

    return Math.min(score, 1);
  }
}