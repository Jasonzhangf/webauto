/**
 * Weibo Login Operation
 * 微博登录操作子
 */

import { WeiboBaseOperation, WeiboOperationContext } from '../interfaces/IWeiboOperation';
import { OperationContext, OperationResult } from '../interfaces/IWeiboOperation';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Weibo Login Operation for handling authentication and session management
 * 微博登录操作子，用于处理身份验证和会话管理
 */
export class WeiboLoginOperation extends WeiboBaseOperation {
  name = 'weibo-login';
  description = 'Handle weibo login, session management, and cookie management';
  version = '1.0.0';
  abstractCategories = ['weibo', 'authentication', 'session-management'];
  supportedContainers = ['browser', 'social-media'];
  capabilities = ['qr-login', 'cookie-management', 'session-validation', 'authentication'];

  constructor() {
    super();
    this.requiredParameters = ['action'];
    this.optionalParameters = {
      cookiePath: './cookies/weibo-cookies.json',
      timeout: 60000,
      maxQRWaitTime: 300000,
      saveSession: true
    };
  }

  /**
   * Execute weibo login operation
   * 执行微博登录操作
   */
  protected async executeOperation(
    context: OperationContext,
    params?: any
  ): Promise<OperationResult> {
    const weiboContext = context as WeiboOperationContext;

    if (!this.validateWeiboContext(weiboContext)) {
      return {
        success: false,
        error: 'Invalid weibo context - browser page required'
      };
    }

    const { action, cookiePath = './cookies/weibo-cookies.json', timeout = 60000, maxQRWaitTime = 300000, saveSession = true } = params || {};

    try {
      this.logger.info('Starting weibo login operation', { action, cookiePath });

      const startTime = Date.now();

      switch (action) {
        case 'check-status':
          return await this.checkLoginStatus(weiboContext);
        case 'qr-login':
          return await this.performQRLogin(weiboContext, { maxQRWaitTime, saveSession, cookiePath });
        case 'load-cookies':
          return await this.loadCookies(weiboContext, cookiePath);
        case 'save-cookies':
          return await this.saveCookies(weiboContext, cookiePath);
        case 'logout':
          return await this.logout(weiboContext);
        default:
          return {
            success: false,
            error: `Unknown login action: ${action}`
          };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Weibo login operation failed', {
        action,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - (weiboContext.startTime || Date.now())
      };
    }
  }

  /**
   * Check login status
   * 检查登录状态
   */
  async checkLoginStatus(context: WeiboOperationContext): Promise<OperationResult<boolean>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      // Navigate to homepage to check login status
      if (!page.url().includes('weibo.com')) {
        await page.goto('https://weibo.com', { waitUntil: 'networkidle' });
      }

      // Check various login indicators
      const isLoggedIn = await page.evaluate(() => {
        // Check for user menu or profile elements
        const userMenu = document.querySelector('.gn_header_info, .gn_header_list, .S_bg2, .WB_global_nav');
        if (userMenu) return true;

        // Check for login button
        const loginButton = document.querySelector('a[href*="login"], .login_btn, .W_btn_a');
        if (loginButton) return false;

        // Check for QR code
        const qrCode = document.querySelector('.qrcode_img, .login_qrcode');
        if (qrCode) return false;

        // Check for welcome message or user info
        const userInfo = document.querySelector('.gn_name, .username, .user_info');
        if (userInfo) return true;

        return false; // Assume logged out if unclear
      });

      const executionTime = Date.now() - startTime;

      this.logger.info('Login status check completed', {
        isLoggedIn,
        executionTime
      });

      return {
        success: true,
        result: isLoggedIn,
        executionTime,
        metadata: {
          loginStatus: isLoggedIn ? 'logged-in' : 'logged-out',
          checkedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Perform QR code login
   * 执行二维码登录
   */
  private async performQRLogin(
    context: WeiboOperationContext,
    options: {
      maxQRWaitTime: number;
      saveSession: boolean;
      cookiePath: string;
    }
  ): Promise<OperationResult<boolean>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      // Navigate to login page
      await page.goto('https://weibo.com/login.php', { waitUntil: 'networkidle' });

      // Look for QR code
      const qrCodeFound = await page.waitForSelector('.qrcode_img, .login_qrcode, .qrcode', { timeout: 10000 });

      if (!qrCodeFound) {
        return {
          success: false,
          error: 'QR code not found on login page'
        };
      }

      this.logger.info('QR code found, waiting for scan...');

      // Wait for login completion
      const loginSuccess = await this.waitForQRLogin(page, options.maxQRWaitTime);

      if (!loginSuccess) {
        return {
          success: false,
          error: 'QR code login timeout or failed'
        };
      }

      // Save cookies if requested
      if (options.saveSession) {
        await this.saveCookiesInternal(page, options.cookiePath);
      }

      // Verify login status
      const isLoggedIn = await this.checkLoginStatus(context);

      const executionTime = Date.now() - startTime;

      this.logger.info('QR login completed', {
        success: isLoggedIn.result,
        executionTime,
        sessionSaved: options.saveSession
      });

      return {
        success: true,
        result: isLoggedIn.result,
        executionTime,
        metadata: {
          loginMethod: 'qr-code',
          sessionSaved: options.saveSession,
          cookiePath: options.saveSession ? options.cookiePath : undefined
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Wait for QR code login to complete
   * 等待二维码登录完成
   */
  private async waitForQRLogin(page: any, maxWaitTime: number): Promise<boolean> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          // Check if we've been redirected away from login page
          const currentUrl = page.url();
          if (!currentUrl.includes('login') && !currentUrl.includes('qr')) {
            clearInterval(checkInterval);
            resolve(true);
            return;
          }

          // Check for login success indicators
          const isLoggedIn = await page.evaluate(() => {
            const userMenu = document.querySelector('.gn_header_info, .gn_header_list, .S_bg2');
            return userMenu !== null;
          });

          if (isLoggedIn) {
            clearInterval(checkInterval);
            resolve(true);
            return;
          }

          // Check for timeout
          if (Date.now() - startTime > maxWaitTime) {
            clearInterval(checkInterval);
            resolve(false);
            return;
          }
        } catch (error) {
          // Continue checking on error
        }
      }, 2000);
    });
  }

  /**
   * Load cookies from file
   * 从文件加载cookies
   */
  async loadCookies(context: WeiboOperationContext, cookiePath: string): Promise<OperationResult<boolean>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      // Ensure cookie directory exists
      const cookieDir = path.dirname(cookiePath);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // Check if cookie file exists
      if (!fs.existsSync(cookiePath)) {
        return {
          success: false,
          error: 'Cookie file not found'
        };
      }

      // Load cookies
      const cookieData = fs.readFileSync(cookiePath, 'utf8');
      const cookies = JSON.parse(cookieData);

      // Set cookies in browser context
      await page.context().addCookies(cookies);

      // Navigate to weibo to verify login
      await page.goto('https://weibo.com', { waitUntil: 'networkidle' });

      // Check if login is successful
      const loginCheck = await this.checkLoginStatus(context);

      const executionTime = Date.now() - startTime;

      this.logger.info('Cookies loaded', {
        cookiePath,
        cookieCount: cookies.length,
        loginSuccessful: loginCheck.result,
        executionTime
      });

      return {
        success: true,
        result: loginCheck.result,
        executionTime,
        metadata: {
          cookiePath,
          cookiesLoaded: cookies.length,
          loginRestored: loginCheck.result
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Save cookies to file
   * 保存cookies到文件
   */
  async saveCookies(context: WeiboOperationContext, cookiePath: string): Promise<OperationResult<boolean>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      const success = await this.saveCookiesInternal(page, cookiePath);

      const executionTime = Date.now() - startTime;

      return {
        success,
        result: success,
        executionTime,
        metadata: {
          cookiePath,
          saved: success
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Internal method to save cookies
   * 内部方法保存cookies
   */
  private async saveCookiesInternal(page: any, cookiePath: string): Promise<boolean> {
    try {
      // Ensure cookie directory exists
      const cookieDir = path.dirname(cookiePath);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // Get cookies from browser
      const cookies = await page.context().cookies();

      // Filter weibo-related cookies
      const weiboCookies = cookies.filter((cookie: any) =>
        cookie.domain.includes('weibo.com') ||
        cookie.domain.includes('sina.com.cn') ||
        cookie.domain.includes('weibo.cn')
      );

      // Save to file
      fs.writeFileSync(cookiePath, JSON.stringify(weiboCookies, null, 2));

      this.logger.info('Cookies saved successfully', {
        cookiePath,
        cookieCount: weiboCookies.length
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to save cookies', {
        cookiePath,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Logout from weibo
   * 从微博登出
   */
  private async logout(context: WeiboOperationContext): Promise<OperationResult<boolean>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      // Navigate to weibo
      await page.goto('https://weibo.com', { waitUntil: 'networkidle' });

      // Look for logout button or link
      const logoutFound = await page.evaluate(() => {
        const logoutButton = document.querySelector('a[href*="logout"], .logout_btn, .gn_logout');
        if (logoutButton) {
          logoutButton.click();
          return true;
        }
        return false;
      });

      if (!logoutFound) {
        // Alternative logout: clear cookies
        await page.context().clearCookies();
      }

      // Wait for logout to complete
      await page.waitForTimeout(3000);

      // Verify logout
      const loginCheck = await this.checkLoginStatus(context);

      const executionTime = Date.now() - startTime;

      this.logger.info('Logout completed', {
        manualLogout: logoutFound,
        clearedCookies: !logoutFound,
        loggedOut: !loginCheck.result,
        executionTime
      });

      return {
        success: true,
        result: !loginCheck.result,
        executionTime,
        metadata: {
          logoutMethod: logoutFound ? 'manual' : 'clear-cookies',
          confirmed: !loginCheck.result
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }
}