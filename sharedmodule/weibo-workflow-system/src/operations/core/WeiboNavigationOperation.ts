/**
 * Weibo Navigation Operation
 * 微博导航操作子
 */

import { WeiboBaseOperation, WeiboOperationContext } from '../interfaces/IWeiboOperation';
import { OperationContext, OperationResult } from '../interfaces/IWeiboOperation';

/**
 * Weibo Navigation Operation for navigating between different weibo pages
 * 微博导航操作子，用于在不同微博页面间导航
 */
export class WeiboNavigationOperation extends WeiboBaseOperation {
  name = 'weibo-navigation';
  description = 'Navigate between different weibo pages (homepage, profile, post, search)';
  version = '1.0.0';
  abstractCategories = ['weibo', 'navigation', 'social-media'];
  supportedContainers = ['browser', 'social-media'];
  capabilities = ['page-navigation', 'url-handling', 'content-loading'];

  constructor() {
    super();
    this.requiredParameters = ['target'];
    this.optionalParameters = {
      timeout: 30000,
      waitForContent: true,
      checkLogin: true
    };
  }

  /**
   * Execute weibo navigation operation
   * 执行微博导航操作
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

    const { target, timeout = 30000, waitForContent = true, checkLogin = true } = params || {};

    try {
      this.logger.info('Starting weibo navigation', { target, timeout });

      const page = weiboContext.browser?.page!;
      const startTime = Date.now();

      let targetUrl: string;

      switch (target) {
        case 'homepage':
          targetUrl = 'https://weibo.com';
          break;
        case 'profile':
          if (!params.userId) {
            return {
              success: false,
              error: 'User ID is required for profile navigation'
            };
          }
          targetUrl = `https://weibo.com/u/${params.userId}`;
          break;
        case 'post':
          if (!params.postId) {
            return {
              success: false,
              error: 'Post ID is required for post navigation'
            };
          }
          targetUrl = `https://weibo.com/detail/${params.postId}`;
          break;
        case 'search':
          if (!params.query) {
            return {
              success: false,
              error: 'Search query is required for search navigation'
            };
          }
          targetUrl = `https://s.weibo.com/weibo/${encodeURIComponent(params.query)}`;
          break;
        default:
          return {
            success: false,
            error: `Unknown navigation target: ${target}`
          };
      }

      // Navigate to target URL
      await page.goto(targetUrl, {
        waitUntil: 'networkidle',
        timeout
      });

      // Wait for page to load
      if (waitForContent) {
        await this.waitForWeiboPage(weiboContext);
      }

      // Check login status if required
      let loginStatus = 'unknown';
      if (checkLogin) {
        loginStatus = await this.checkLoginStatus(weiboContext);
      }

      // Detect page type
      const pageType = await this.detectPageType(weiboContext);
      this.currentPageType = pageType;

      const executionTime = Date.now() - startTime;

      this.logger.info('Weibo navigation completed', {
        target,
        targetUrl,
        pageType,
        loginStatus,
        executionTime
      });

      return {
        success: true,
        result: {
          target,
          targetUrl,
          pageType,
          loginStatus,
          executionTime,
          currentUrl: page.url()
        },
        executionTime,
        metadata: {
          navigationType: 'weibo',
          targetReached: true,
          contentLoaded: waitForContent,
          loginChecked: checkLogin
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Weibo navigation failed', {
        target,
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
   * Check login status on current page
   * 检查当前页面的登录状态
   */
  private async checkLoginStatus(context: WeiboOperationContext): Promise<'logged-out' | 'logged-in' | 'qr-required' | 'expired'> {
    const page = context.browser?.page;
    if (!page) {
      return 'logged-out';
    }

    try {
      // Check for QR code login requirement
      const qrCode = await this.checkQRCode(page);
      if (qrCode) {
        return 'qr-required';
      }

      // Check for login button
      const loginButton = await this.checkLoginButton(page);
      if (loginButton) {
        return 'logged-out';
      }

      // Check for user menu or profile elements
      const userMenu = await this.checkUserMenu(page);
      if (userMenu) {
        return 'logged-in';
      }

      // Check for expired session
      const expiredSession = await this.checkExpiredSession(page);
      if (expiredSession) {
        return 'expired';
      }

      return 'logged-out';
    } catch (error) {
      this.logger.warn('Failed to check login status', { error: error instanceof Error ? error.message : String(error) });
      return 'unknown';
    }
  }

  /**
   * Navigate to weibo homepage
   * 导航到微博首页
   */
  async navigateToHomepage(context: WeiboOperationContext): Promise<OperationResult> {
    return this.execute(context, { target: 'homepage' });
  }

  /**
   * Navigate to user profile
   * 导航到用户资料页
   */
  async navigateToProfile(context: WeiboOperationContext, userId: string): Promise<OperationResult> {
    return this.execute(context, { target: 'profile', userId });
  }

  /**
   * Navigate to specific post
   * 导航到特定帖子
   */
  async navigateToPost(context: WeiboOperationContext, postId: string): Promise<OperationResult> {
    return this.execute(context, { target: 'post', postId });
  }

  /**
   * Navigate to search results
   * 导航到搜索结果页
   */
  async navigateToSearch(context: WeiboOperationContext, query: string): Promise<OperationResult> {
    return this.execute(context, { target: 'search', query });
  }

  /**
   * Wait for weibo page to load
   * 等待微博页面加载
   */
  private async waitForWeiboPage(context: WeiboOperationContext): Promise<void> {
    const page = context.browser?.page!;

    try {
      // Wait for key elements to be present
      await page.waitForSelector('.Feed_body, .Card_feed, .weibo-post, .WB_frame', {
        timeout: 10000
      });

      this.logger.debug('Weibo page loaded successfully');
    } catch (error) {
      this.logger.warn('Weibo page load timeout, continuing anyway');
    }
  }

  /**
   * Detect current page type
   * 检测当前页面类型
   */
  private async detectPageType(context: WeiboOperationContext): Promise<'homepage' | 'profile' | 'post' | 'search' | 'unknown'> {
    const page = context.browser?.page!;
    const url = page.url();

    try {
      if (url.includes('weibo.com') && !url.includes('/u/') && !url.includes('/detail/') && !url.includes('/weibo/')) {
        return 'homepage';
      } else if (url.includes('/u/')) {
        return 'profile';
      } else if (url.includes('/detail/')) {
        return 'post';
      } else if (url.includes('/weibo/')) {
        return 'search';
      } else {
        return 'unknown';
      }
    } catch (error) {
      return 'unknown';
    }
  }

  // Private property to track current page type
  private currentPageType: 'homepage' | 'profile' | 'post' | 'search' | 'unknown' = 'unknown';

  /**
   * Check if page has required elements
   * 检查页面是否有所需元素
   */
  private async checkPageElements(page: any): Promise<boolean> {
    try {
      const elements = await page.$('.Feed_body, .Card_feed, .weibo-post, .WB_frame');
      return elements !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current page URL
   * 获取当前页面URL
   */
  private async getCurrentUrl(page: any): Promise<string> {
    try {
      return await page.url();
    } catch (error) {
      return '';
    }
  }

  /**
   * Check if QR code is present
   * 检查是否有二维码
   */
  private async checkQRCode(page: any): Promise<boolean> {
    try {
      const qrCode = await page.$('.qrcode_img, .login_qrcode, .qrcode');
      return qrCode !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if login button is present
   * 检查是否有登录按钮
   */
  private async checkLoginButton(page: any): Promise<boolean> {
    try {
      const loginButton = await page.$('a[href*="login"]');
      return loginButton !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user menu is present
   * 检查是否有用户菜单
   */
  private async checkUserMenu(page: any): Promise<boolean> {
    try {
      const userMenu = await page.$('.gn_header_info, .gn_header_list, .S_bg2');
      return userMenu !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for expired session message
   * 检查会话过期消息
   */
  private async checkExpiredSession(page: any): Promise<boolean> {
    try {
      const textContent = await page.textContent('body');
      return textContent.includes('登录过期');
    } catch (error) {
      return false;
    }
  }

  /**
   * Get page text content
   * 获取页面文本内容
   */
  private async getPageText(page: any): Promise<string> {
    try {
      return await page.textContent('body');
    } catch (error) {
      return '';
    }
  }
}