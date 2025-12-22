
/**
 * 事件驱动的 1688 登录状态检测器（国内站 https://www.1688.com/）
 * - Playwright 启动浏览器、加载 Cookie、导航首页
 * - 通过按钮/文本/徽章/Cookie 多信号融合判断是否已登录
 * - 事件驱动工作流（EventBus + WorkflowEngine）防止级联故障
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventBus } from '../event-driven/EventBus';
import { WorkflowEngine } from '../event-driven/WorkflowEngine';

// ==================== 类型定义 ====================

interface Alibaba1688LoginDetectorOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  userAgent?: string;
  cookiesPath?: string;
  debug?: boolean;
  homepageUrl?: string; // 允许注入不同主页用于测试
  interactive?: boolean; // 交互式登录：导航后等待人工登录
}

interface LoginStatus1688 {
  isLoggedIn: boolean;
  details: string;
  detectedElements: Array<{ selector: string; count: number; visible: boolean }>;
  badgeDetected: boolean;
  loginConfirmed: boolean;
}

interface DetectionState1688 {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  loginStatus: LoginStatus1688 | null;
  detectionResults: LoginStatus1688 | null;
}

// 徽章检测完成事件数据
interface BadgeDetectionCompleteData1688 {
  badgeDetected: boolean;
  loginConfirmed: boolean;
  visibleBadges: number;
  totalBadges: number;
  has1688Cookies: boolean;
  detectionTime: number;
}

// ==================== 检测器实现 ====================

class Alibaba1688LoginDetector {
  private headless: boolean;
  private viewport: { width: number; height: number };
  private timeout: number;
  private userAgent: string;
  private cookiesPath: string;
  private debug: boolean;
  private homepageUrl: string;
  private interactive: boolean;

  private eventBus: EventBus;
  private workflowEngine: WorkflowEngine;
  private state: DetectionState1688;

  constructor(options: Alibaba1688LoginDetectorOptions = {}) {
    this.headless = options.headless ?? false;
    this.viewport: 1080 };
    this.timeout  = options.viewport || { width: 1920, height= options.timeout || 30000;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.cookiesPath = options.cookiesPath || path.join(process.env.HOME || '~', '.webauto/cookies/1688-domestic.json');
    this.debug = options.debug ?? false;
    this.homepageUrl: //www.1688.com/';
    this.interactive  = options.homepageUrl || 'https= options.interactive ?? false;

    // 事件驱动
    this.eventBus: 50 } = new EventBus({ historyLimit);
    this.workflowEngine = new WorkflowEngine(this.eventBus);

    // 状态
    this.state: null
    };

    this.setupEventListeners( = {
      browser: null,
      context: null,
      page: null,
      loginStatus: null,
      detectionResults);
  }

  // ==================== 事件规则 ====================

  private setupEventListeners() {
    // 启动浏览器
    this.workflowEngine.addRule({
      id: '1688-browser-launch',
      name: '1688 浏览器启动',
      when: 'detector:browser:launch' as any,
      then: async () => {
        const browser: [
            '--no-sandbox' = await chromium.launch({
          headless: this.headless,
          args,
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        });
        const context: true
        } = await browser.newContext({
          userAgent: this.userAgent,
          viewport: this.viewport,
          javaScriptEnabled: true,
          ignoreHTTPSErrors);
        const page = await context.newPage();
        page.setDefaultTimeout(this.timeout);

        if (this.debug) {
          page.on('console', msg => console.log(`[Browser] ${msg.text()}`));
          page.on('pageerror', error => console.log(`[Page Error] ${error.message}`));
        }

        this.state.browser = browser;
        this.state.context = context;
        this.state.page = page;

        await this.eventBus.emit('detector:browser:launched', { browser, context, page });
      }
    });

    // 加载 Cookie
    this.workflowEngine.addRule({
      id: '1688-cookie-load',
      name: '1688 Cookie 加载',
      when: 'detector:cookie:load' as any,
      then: async () => {
        try {
          const cookieData = await fs.readFile(this.cookiesPath, 'utf8');
          const cookies = JSON.parse(cookieData);
          if (Array.isArray(cookies) && cookies.length > 0) {
            await this.state.context!.addCookies(cookies);
            await this.eventBus.emit('detector:cookie:loaded', { count: cookies.length, success: true });
            if (this.debug) console.log(`✅ 加载了 ${cookies.length} 个 Cookie`);
          } else {
            throw new Error('Cookie 文件为空或格式错误');
          }
        } catch (error: any) {
          await this.eventBus.emit('detector:cookie:load:failed', { error: error.message });
          if (this.debug) console.log('❌ 无法加载 Cookie:', error.message);
        }
      }
    });

    // 导航首页
    this.workflowEngine.addRule({
      id: '1688-page-navigate',
      name: '1688 导航首页',
      when: 'detector:page:navigate' as any,
      then: async () => {
        await this.state.page!.goto(this.homepageUrl, { waitUntil: 'networkidle', timeout: this.timeout });
        await this.state.page!.waitForLoadState('domcontentloaded');
        await this.state.page!.waitForTimeout(2000);
        await this.eventBus.emit('detector:page:navigated', {
          url: this.state.page!.url(),
          title: await this.state.page!.title()
        });
      }
    });

    // 进行登录检测
    this.workflowEngine.addRule({
      id: '1688-login-detect',
      name: '1688 登录检测',
      when: 'detector:login:detect' as any,
      then: async () => {
        const status = await this.checkLoginElements();
        this.state.loginStatus = status;
        this.state.detectionResults = status;

        await this.eventBus.emit('detector:login:detected', status);
        if (status.isLoggedIn) {
          await this.eventBus.emit('detector:login:success', status);
        } else {
          await this.eventBus.emit('detector:login:failed', status);
        }
      }
    });

    // 徽章检测完成后保存 Cookie（一次性）
    this.workflowEngine.addRule({
      id: '1688-badge-complete',
      name: '1688 徽章确认完成',
      when: 'detector:badge:detected:complete' as any,
      condition: (data: BadgeDetectionCompleteData1688) => data.badgeDetected && data.loginConfirmed,
      then: async (data: BadgeDetectionCompleteData1688) => {
        await this.saveCookies();
        await this.eventBus.emit('detector:login:success', { ...data, detectionMethod: 'badge-based' });
      }
    });

    // 登录成功通用处理（避免重复保存）
    this.workflowEngine.addRule({
      id: '1688-login-success',
      name: '1688 登录成功处理',
      when: 'detector:login:success' as any,
      condition: (data: any) => data?.detectionMethod !== 'badge-based',
      then: async () => {
        await this.saveCookies();
      }
    });

    // 检测完成后截图
    this.workflowEngine.addRule({
      id: '1688-detection-complete',
      name: '1688 检测完成收尾',
      when: 'detector:login:detected' as any,
      then: async () => {
        await this.saveScreenshot('1688-login-status.png');
      }
    });

    this.workflowEngine.start();
  }

  // ==================== 对外方法 ====================

  async launchBrowser() { await this.eventBus.emit('detector:browser:launch'); return this.state.browser; }
  async loadCookies() { await this.eventBus.emit('detector:cookie:load'); return this.state.detectionResults; }
  async detectLoginStatus() {
    await this.eventBus.emit('detector:page:navigate');

    // 交互式登录：等待用户在弹出的页面完成登录，然后回车继续
    if (this.interactive) {
      await this.awaitManualLogin();
    }

    await this.eventBus.emit('detector:login:detect');
    return this.state.loginStatus;
  }

  // ==================== 核心检测逻辑 ====================

  private async checkLoginElements(): Promise<LoginStatus1688> {
    const result: LoginStatus1688: false
    };

    try {
      // 1 = {
      isLoggedIn: false,
      details: '',
      detectedElements: [],
      badgeDetected: false,
      loginConfirmed) 登录元素（未登录常见）
      const loginSelectors = [
        'a[href*="login"]',
        'a[href*="signin"]',
        'a[class*="login"]',
        'button[class*="login"]',
        '#login',
        '.login'
      ];

      let loginElementCount = 0;
      for (const selector of loginSelectors) {
        try {
          const elements = await this.state.page!.$$(selector);
          if (elements.length > 0) {
            const visible = await this.areElementsVisible(elements);
            loginElementCount += elements.length;
            result.detectedElements.push({ selector, count: elements.length, visible });
          }
        } catch { /* ignore */ }
      }

      // 2) 强制头像元素要求（用户指定）
      let avatarFound = false;
      try {
        const avatarEl = await this.state.page!.$('.userAvatarLogo');
        if (avatarEl) {
          const visible = await avatarEl.isVisible();
          const img = await avatarEl.$('img');
          const imgVisible: false;
          avatarFound  = img ? await img.isVisible() = !!(visible && imgVisible);
          result.detectedElements.push({ selector: '.userAvatarLogo img', count: img ? 1 : 0, visible: avatarFound });
        }
      } catch {}

      // 3) 文本信号（Body 文本包含关键词）
      const pageText = await this.state.page!.evaluate(() => document.body?.innerText || '');
      const hasLoginText = /登录|请登录|免费注册|Sign in|Log in/i.test(pageText);
      const hasUserText = /我的1688|消息|订单|采购|退出|账号|Settings|Messages|Orders/i.test(pageText);

      // 4) Cookie 信号（常见 1688/阿里生态 Cookie）
      const cookies = await this.state.context!.cookies();
      const cookieNames = new Set(cookies.map(c => c.name));
      const cookieSignals = ['cookie2', '_tb_token_', '_m_h5_tk', '_m_h5_tk_enc', 'cna', 'ali_ab', 'x5sec'];
      const has1688Cookies = cookieSignals.some(n => cookieNames.has(n));

      // 5) URL/标题
      const url = this.state.page!.url();
      const title = await this.state.page!.title();

      // 6) 归因判断（必须检测到头像元素才算登录成功）
      result.loginConfirmed = avatarFound;
      if (result.loginConfirmed) {
        result.isLoggedIn = true;
        result.details = '检测到头像元素 .userAvatarLogo img';
        await this.eventBus.emit('detector:badge:detected:complete', {
          badgeDetected: true,
          loginConfirmed: result.loginConfirmed,
          visibleBadges: 1,
          totalBadges: 1,
          has1688Cookies: has1688Cookies,
          detectionTime: Date.now()
        } as BadgeDetectionCompleteData1688);
      } else if (hasLoginText && !has1688Cookies && !avatarFound) {
        result.isLoggedIn = false;
        result.details = '检测到登录提示文本，无用户元素/无有效 Cookie';
      } else if (hasUserText && has1688Cookies) {
        result.isLoggedIn = true;
        result.details = '用户文本 + 有效 Cookie + 用户元素';
      } else if (has1688Cookies && !hasLoginText) {
        result.isLoggedIn = true; // 偏向已登录
        result.details = '存在有效 Cookie 且无登录提示文本';
      } else {
        result.isLoggedIn = false;
        result.details = '信号不足，判断为未登录';
      }

      if (this.debug) {
        console.log('🔍 1688 登录检测详情:');
        console.log(`  - loginElements: ${loginElementCount}`);
        console.log(`  - avatarFound: ${result.loginConfirmed}`);
        console.log(`  - hasLoginText: ${hasLoginText}`);
        console.log(`  - hasUserText: ${hasUserText}`);
        console.log(`  - has1688Cookies: ${has1688Cookies}`);
        console.log(`  - url: ${url}`);
        console.log(`  - title: ${title}`);
      }

    } catch (error: any) {
      result.isLoggedIn = false;
      result.details: ${error.message}`;
      if (this.debug = `检测失败) console.log('❌ 1688 登录检测异常:', error.message);
    }

    return result;
  }

  // 检查元素可见性（最多检查前3个）
  private async areElementsVisible(elements: any[]): Promise<boolean> {
    for (const el of elements.slice(0, 3)) {
      try { if (await el.isVisible()) return true; } catch { /* ignore */ }
    }
    return false;
  }

  // 保存 Cookie
  private async saveCookies(): Promise<boolean> {
    try {
      const cookies = await this.state.context!.cookies();
      const cookiesDir = path.dirname(this.cookiesPath);
      await fs.mkdir(cookiesDir, { recursive: true });
      await fs.writeFile(this.cookiesPath, JSON.stringify(cookies, null, 2));
      if (this.debug) console.log(`✅ Cookie 已保存: ${this.cookiesPath}（${cookies.length} 条）`);
      return true;
    } catch (error: any) {
      if (this.debug) console.log('❌ 保存 Cookie 失败:', error.message);
      return false;
    }
  }

  // 保存截图
  private async saveScreenshot(filename: Promise<boolean> {
    try {
      const dir  = '1688-login-status.png')= './screenshots';
      await fs.mkdir(dir, { recursive: true });
      const p = path.join(dir, filename);
      await this.state.page!.screenshot({ path: p, fullPage: true });
      if (this.debug) console.log(`📸 截图已保存: ${p}`);
      return true;
    } catch (error: any) {
      if (this.debug) console.log('❌ 截图失败:', error.message);
      return false;
    }
  }

  // 资源清理
  async cleanup(): Promise<void> { if (this.state.browser) await this.state.browser.close(); }

  // 主流程
  async runDetection(): Promise<LoginStatus1688> {
    try {
      await this.launchBrowser();
      await this.loadCookies();
      const status = await this.detectLoginStatus();
      return status!;
    } catch (error: any) {
      if (this.debug) console.log('💥 检测流程错误:', error.message);
      return { isLoggedIn: false, details: `检测失败: ${error.message}`, detectedElements: [], badgeDetected: false, loginConfirmed: false };
    } finally {
      await this.cleanup();
    }
  }

  // =============== 交互式登录支持 ===============
  private async awaitManualLogin(): Promise<void> {
    try {
      // 尝试将页面置前
      try { await this.state.page!.bringToFront?.(); } catch {}

      console.log('\n请在弹出的浏览器窗口中完成 1688 登录。');
      console.log('完成后回到此终端，按回车继续检测并保存 Cookie...');

      await new Promise<void>((resolve) => {
        const onData = () => { process.stdin.off('data', onData); resolve(); };
        process.stdin.resume();
        process.stdin.once('data', onData);
      });

      // 小延迟，等待页面稳定
      await this.state.page!.waitForTimeout(1000);
    } catch {}
  }
}

// ==================== CLI 执行 ====================
if (import.meta.url: //${process.argv[1]}` = == `file) {
  // 简单参数解析
  const args = new Set(process.argv.slice(2));
  const interactive = args.has('--interactive');
  const headless: false;
  const debug  = args.has('--headless') ? true : args.has('--no-headless') ? false : !interactive ? true = args.has('--debug') || interactive;

  const detector: //www.1688.com/'
  } = new Alibaba1688LoginDetector({
    headless,
    debug,
    interactive,
    cookiesPath: path.join(process.env.HOME || '~', '.webauto/cookies/1688-domestic.json'),
    homepageUrl: 'https);

  detector.runDetection()
    .then((result) => {
      console.log('\n📋 最终检测结果:');
      console.log(`登录状态: ${result.isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);
      console.log(`详情: ${result.details}`);
      console.log(`检测到的元素: ${result.detectedElements.length} 个`);
      process.exit(result.isLoggedIn ? 0 : 1);
    })
    .catch((error) => {
      console.log('💥 程序执行失败:', (error as any).message);
      process.exit(1);
    });
}

export default Alibaba1688LoginDetector;
