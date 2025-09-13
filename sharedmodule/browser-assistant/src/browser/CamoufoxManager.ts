/**
 * Camoufox浏览器管理器
 * 基于xiaohongshu-mcp的浏览器管理模式，支持Cookie管理和反指纹检测
 */

import { Page, Browser, BrowserContext } from 'playwright';
import { BaseBrowserModule } from '../core/SimpleBaseModule';
import { CookieManager } from './SimpleCookieManager';
import { BrowserAssistantError, BrowserConnectionError } from '../errors';

export interface CamoufoxConfig {
  headless?: boolean;
  launchTimeout?: number;
  defaultTimeout?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
  browserArgs?: string[];
  ignoreDefaultArgs?: string[];
  /**
   * 是否自动注入已保存的登录Cookie
   */
  autoInjectCookies?: boolean;
  /**
   * 是否在无Cookie时等待用户手动登录
   */
  waitForLogin?: boolean;
  /**
   * 登录检测超时时间（秒）
   */
  loginTimeout?: number;
  /**
   * 目标域名（用于Cookie管理）
   */
  targetDomain?: string;
}

export const defaultConfig: CamoufoxConfig = {
  headless: true,
  launchTimeout: 30000,
  defaultTimeout: 10000,
  viewport: { width: 1920, height: 1080 },
  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ],
  ignoreDefaultArgs: ['--disable-extensions'],
  autoInjectCookies: true,
  waitForLogin: true,
  loginTimeout: 120,
  targetDomain: 'weibo.com'
};

/**
 * Camoufox浏览器管理器
 * 提供浏览器生命周期管理、Cookie持久化和反指纹检测功能
 */
export class CamoufoxManager extends BaseBrowserModule {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cookieManager: CookieManager;
  private camoufoxConfig: CamoufoxConfig;
  protected isInitialized: boolean = false;

  constructor(camoufoxConfig: CamoufoxConfig = {}) {
    super('CamoufoxManager');
    this.camoufoxConfig = { ...defaultConfig, ...camoufoxConfig };
    this.cookieManager = new CookieManager();
  }

  /**
   * 子类初始化逻辑
   */
  protected async onInitialize(): Promise<void> {
    if (this.isInitialized) {
      this.warn('CamoufoxManager already initialized');
      return;
    }

    try {
      this.logInfo('Initializing Camoufox browser...');
      
      // 导入Camoufox
      const { Camoufox } = await import('camoufox');
      
      // 启动真正的Camoufox浏览器（反指纹版本）
      this.browser = await Camoufox.launch({
        headless: this.camoufoxConfig.headless,
        timeout: this.camoufoxConfig.launchTimeout || 30000,
        args: this.camoufoxConfig.browserArgs || [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      // 创建浏览器上下文
      this.context = await this.browser.newContext({
        viewport: this.camoufoxConfig.viewport,
        userAgent: this.camoufoxConfig.userAgent,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true
      });

      // 创建新页面
      this.page = await this.context.newPage();
      
      // 设置页面默认超时
      this.page.setDefaultTimeout(this.camoufoxConfig.defaultTimeout || 10000);
      
      // 设置页面错误处理
      this.setupPageErrorHandling();
      
      // 加载Cookie
      await this.loadCookiesForCurrentDomain();
      
      this.isInitialized = true;
      this.logInfo('Camoufox browser initialized successfully');
      
    } catch (error: any) {
      const errorMsg = `Failed to initialize Camoufox browser: ${error.message}`;
      this.error(errorMsg);
      throw new BrowserConnectionError(errorMsg, { original: error });
    }
  }

  /**
   * 注册模块能力
   */
  protected async registerCapabilities(): Promise<void> {
    this.logInfo('Registering CamoufoxManager capabilities...');
    // 简化实现，无需实际注册
  }

  /**
   * 健康检查
   */
  protected checkHealth(): boolean {
    try {
      // 检查浏览器是否连接
      if (!this.browser || !this.context || !this.page) {
        return false;
      }
      
      // 检查页面是否可响应
      return this.isInitialized;
    } catch {
      return false;
    }
  }

  /**
   * 子类清理逻辑
   */
  protected async onCleanup(): Promise<void> {
    this.logInfo('Cleaning up Camoufox browser...');
    
    try {
      // 保存Cookie
      if (this.page && this.context) {
        await this.saveCookies();
      }
      
      // 关闭页面
      if (this.page) {
        await this.page.close().catch(error => {
          this.warn(`Failed to close page: ${error instanceof Error ? error.message : String(error)}`);
        });
        this.page = null;
      }
      
      // 关闭上下文
      if (this.context) {
        await this.context.close().catch(error => {
          this.warn(`Failed to close context: ${error instanceof Error ? error.message : String(error)}`);
        });
        this.context = null;
      }
      
      // 关闭浏览器
      if (this.browser) {
        await this.browser.close().catch(error => {
          this.warn(`Failed to close browser: ${error instanceof Error ? error.message : String(error)}`);
        });
        this.browser = null;
      }
      
      this.isInitialized = false;
      this.logInfo('Camoufox browser cleaned up successfully');
      
    } catch (error: any) {
      this.error(`Cleanup failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取当前页面
   */
  async getCurrentPage(): Promise<Page> {
    if (!this.isInitialized || !this.page) {
      throw new BrowserAssistantError('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }

  /**
   * 创建新的页面实例 - 基于xiaohongshu-mcp的fresh instance模式
   */
  async createFreshPage(): Promise<Page> {
    if (!this.context) {
      throw new BrowserAssistantError('Browser context not initialized');
    }
    
    try {
      const newPage = await this.context.newPage();
      newPage.setDefaultTimeout(this.camoufoxConfig.defaultTimeout || 10000);
      
      // 设置页面错误处理
      this.setupPageErrorHandling(newPage);
      
      this.logInfo('Created fresh page instance');
      return newPage;
      
    } catch (error: any) {
      throw new BrowserAssistantError(`Failed to create fresh page: ${error.message}`);
    }
  }

  /**
   * 导航到指定URL
   */
  async navigate(url: string, options: {
    timeout?: number;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  } = {}): Promise<void> {
    const page = await this.getCurrentPage();
    
    try {
      const {
        timeout = this.camoufoxConfig.defaultTimeout,
        waitUntil = 'domcontentloaded'
      } = options;
      
      await page.goto(url, { timeout, waitUntil });
      
      // 等待页面稳定
      await this.waitForPageStable(page);
      
      this.logInfo(`Navigated to: ${url}`);
      
    } catch (error: any) {
      throw new BrowserAssistantError(`Navigation failed: ${error.message}`);
    }
  }

  /**
   * 获取页面标题
   */
  async getPageTitle(): Promise<string> {
    const page = await this.getCurrentPage();
    return await page.title();
  }

  /**
   * 获取页面URL
   */
  async getPageUrl(): Promise<string> {
    const page = await this.getCurrentPage();
    return page.url();
  }

  /**
   * 执行JavaScript
   */
  async evaluate<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T> {
    const page = await this.getCurrentPage();
    return await page.evaluate(script, ...args);
  }

  /**
   * 等待页面稳定
   */
  private async waitForPageStable(page: Page, timeout: number = 5000): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          return document.readyState === 'complete';
        },
        { timeout }
      );
      
      // 额外等待一小段时间确保动态内容加载
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      this.warn(`Page stability check failed: ${error.message}`);
    }
  }

  /**
   * 设置页面错误处理
   */
  private setupPageErrorHandling(page?: Page): void {
    const targetPage = page || this.page;
    if (!targetPage) return;

    targetPage.on('pageerror', (error) => {
      this.warn(`Page error: ${error.message}`);
    });

    targetPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.warn(`Console error: ${msg.text()}`);
      }
    });
  }

  /**
   * 加载当前域名的Cookie
   */
  private async loadCookiesForCurrentDomain(): Promise<void> {
    if (!this.context || !this.page) return;

    try {
      const url = this.page.url();
      if (url && url !== 'about:blank') {
        const domain = new URL(url).hostname;
        await this.cookieManager.loadCookies(this.context, domain);
      }
    } catch (error: any) {
      this.warn(`Failed to load cookies: ${error.message}`);
    }
  }

  /**
   * 检查目标域名是否有有效的登录Cookie
   */
  hasValidLoginCookies(): boolean {
    const targetDomain = this.camoufoxConfig.targetDomain || 'weibo.com';
    return this.cookieManager.hasLoginCookies(targetDomain);
  }

  /**
   * 自动注入登录Cookie并尝试登录
   */
  async autoLoginWithCookies(targetUrl: string): Promise<boolean> {
    if (!this.camoufoxConfig.autoInjectCookies) {
      this.logInfo('Auto cookie injection disabled, skipping...');
      return false;
    }

    const targetDomain = this.camoufoxConfig.targetDomain || 'weibo.com';
    
    // 检查是否有有效的登录Cookie
    if (!this.hasValidLoginCookies()) {
      this.logInfo(`No valid login cookies found for ${targetDomain}`);
      return false;
    }

    try {
      this.logInfo(`Injecting login cookies for ${targetDomain}...`);
      
      // 注入Cookie
      const success = await this.cookieManager.loadCookies(this.context!, targetDomain);
      if (!success) {
        this.warn(`Failed to inject cookies for ${targetDomain}`);
        return false;
      }

      // 导航到目标URL
      await this.navigate(targetUrl);
      
      // 等待页面加载并检查是否已登录
      await this.waitForPageStable(this.page!);
      
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        this.logInfo('✅ Auto-login with cookies successful!');
        return true;
      } else {
        this.warn('Auto-login with cookies failed - cookies may be expired');
        return false;
      }

    } catch (error: any) {
      this.warn(`Auto-login failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 检查当前登录状态
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const currentUrl = this.page.url();
      
      // 检查是否在登录页面
      const isLoginPage = currentUrl.includes('newlogin') || 
                         currentUrl.includes('login') || 
                         currentUrl.includes('weibo.com/login');
      
      if (isLoginPage) {
        // 检查是否是反爬虫重定向
        if (currentUrl.includes('tabtype=weibo') || currentUrl.includes('openLoginLayer=0')) {
          this.warn('🚨 检测到可能的反爬虫重定向，停止自动操作');
          this.warn('🔐 请手动完成登录验证');
        }
        return false;
      }

      // 检查页面内容是否包含登录成功特征
      const content = await this.page.content();
      const hasLoginSuccess = content.includes('微博') || 
                             content.includes('新鲜事') || 
                             content.includes('个人中心') ||
                             content.includes('首页') ||
                             content.includes('消息') ||
                             content.includes('发现');
      
      return hasLoginSuccess;
    } catch (error) {
      this.warn(`Failed to check login status: ${error}`);
      return false;
    }
  }

  /**
   * 等待用户手动登录
   */
  async waitForUserLogin(): Promise<boolean> {
    if (!this.camoufoxConfig.waitForLogin || !this.page) {
      return false;
    }

    const timeout = (this.camoufoxConfig.loginTimeout || 120) * 1000;
    const startTime = Date.now();
    let attempts = 0;

    this.logInfo(`Waiting for user login (timeout: ${timeout/1000}s)...`);
    console.log(`\n🔐 请在浏览器中手动登录 ${this.camoufoxConfig.targetDomain || 'weibo.com'}`);
    console.log(`登录完成后，系统会自动检测并保存Cookie...`);

    while (Date.now() - startTime < timeout) {
      attempts++;
      
      // 检查登录状态
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n✅ 检测到登录成功！用时 ${elapsed} 秒`);
        this.logInfo(`User login detected after ${elapsed}s`);
        
        // 保存登录后的Cookie
        await this.saveCookies();
        return true;
      }

      // 每5秒检查一次
      await this.page.waitForTimeout(5000);
      
      // 每30秒显示一次进度
      if (attempts % 6 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const remaining = Math.round((timeout - (Date.now() - startTime)) / 1000);
        console.log(`⏳ 等待登录中... 已用时: ${elapsed}s, 剩余: ${remaining}s`);
      }
    }

    console.log(`\n⏰ 等待登录超时 (${timeout/1000}s)`);
    this.warn('User login timeout');
    return false;
  }

  /**
   * 初始化并自动处理登录流程
   */
  async initializeWithAutoLogin(targetUrl: string = 'https://weibo.com'): Promise<void> {
    await this.initialize();

    let autoLoginSuccess = false;
    
    // 尝试自动注入Cookie登录
    if (this.camoufoxConfig.autoInjectCookies) {
      autoLoginSuccess = await this.autoLoginWithCookies(targetUrl);
    }

    // 如果自动登录失败且配置为等待用户登录，则等待手动登录
    if (!autoLoginSuccess && this.camoufoxConfig.waitForLogin) {
      await this.waitForUserLogin();
    } else if (!autoLoginSuccess) {
      this.logInfo('Auto-login failed and waitForLogin disabled, browser ready for manual operation');
    }
  }

  /**
   * 保存当前域名的Cookie
   */
  async saveCookies(): Promise<void> {
    if (!this.context || !this.page) return;

    try {
      await this.cookieManager.saveCookies(this.page);
      this.logInfo('Cookies saved successfully');
    } catch (error: any) {
      this.warn(`Failed to save cookies: ${error.message}`);
    }
  }

  /**
   * 清除所有Cookie
   */
  async clearAllCookies(): Promise<void> {
    if (!this.context) return;

    try {
      await this.context.clearCookies();
      await this.cookieManager.clearAllCookies();
      this.logInfo('All cookies cleared');
    } catch (error: any) {
      this.warn(`Failed to clear cookies: ${error.message}`);
    }
  }

  /**
   * 截图
   */
  async screenshot(options: {
    fullPage?: boolean;
    path?: string;
    quality?: number;
  } = {}): Promise<Buffer> {
    const page = await this.getCurrentPage();
    
    try {
      const screenshot = await page.screenshot(options);
      this.logInfo('Screenshot captured');
      return screenshot;
    } catch (error: any) {
      throw new BrowserAssistantError(`Screenshot failed: ${error.message}`);
    }
  }

  /**
   * 重启浏览器
   */
  async restart(): Promise<void> {
    this.logInfo('Restarting Camoufox browser...');
    
    try {
      await this.cleanup();
      await this.initialize();
      this.logInfo('Camoufox browser restarted successfully');
    } catch (error: any) {
      throw new BrowserAssistantError(`Browser restart failed: ${error.message}`);
    }
  }

  /**
   * 检查浏览器是否正在运行
   */
  isConnected(): boolean {
    return this.isInitialized && this.browser !== null;
  }

  /**
   * 获取配置信息
   */
  getConfig(): CamoufoxConfig {
    return { ...this.camoufoxConfig };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<CamoufoxConfig>): void {
    this.camoufoxConfig = { ...this.camoufoxConfig, ...newConfig };
    this.logInfo('Configuration updated');
  }
}