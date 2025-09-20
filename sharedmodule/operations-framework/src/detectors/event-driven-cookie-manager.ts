#!/usr/bin/env node

/**
 * 事件驱动的Cookie管理系统
 * 集成徽章检测、登录状态确认和Cookie管理流程
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventBus } from '../event-driven/EventBus.js';
import { WorkflowEngine } from '../event-driven/WorkflowEngine.js';

// 类型定义
interface EventDrivenCookieManagerOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  userAgent?: string;
  cookiesPath?: string;
  debug?: boolean;
  autoSave?: boolean;
}

interface BadgeDetectionResult {
  detected: boolean;
  elements: Array<{
    selector: string;
    count: number;
    visibleCount: number;
  }>;
  visibleCount: number;
  totalCount: number;
  details: string;
}

interface CookieValidationResult {
  valid: boolean;
  cookies: any[];
  hasEssentialCookies: boolean;
  details: string;
}

interface LoginStatus {
  confirmed: boolean;
  badgeDetection: BadgeDetectionResult;
  cookieValidation: CookieValidationResult;
  timestamp: number;
}

interface CookieComparison {
  oldCount: number;
  newCount: number;
  added: any[];
  removed: any[];
  modified: Array<{ old: any; new: any }>;
  unchanged: any[];
}

interface SaveRecord {
  timestamp: number;
  cookieCount: number;
  comparison: CookieComparison;
  badgeDetection: BadgeDetectionResult;
  loginStatus: LoginStatus;
}

interface CookieManagerState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  cookies: any[];
  loginStatus: LoginStatus | null;
  badgeDetection: BadgeDetectionResult | null;
  cookieValidation: CookieValidationResult | null;
  lastSaveTime: number | null;
  saveHistory: SaveRecord[];
}

class EventDrivenCookieManager {
  private headless: boolean;
  private viewport: { width: number; height: number };
  private timeout: number;
  private userAgent: string;
  private cookiesPath: string;
  private debug: boolean;
  private autoSave: boolean;
  private eventBus: EventBus;
  private workflowEngine: WorkflowEngine;
  private state: CookieManagerState;

  constructor(options: EventDrivenCookieManagerOptions = {}) {
    this.headless = options.headless ?? false;
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.timeout = options.timeout || 30000;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.cookiesPath = options.cookiesPath || path.join(process.env.HOME || '~', '.webauto/cookies/weibo-cookies.json');
    this.debug = options.debug ?? false;
    this.autoSave = options.autoSave ?? true;

    // 事件驱动架构
    this.eventBus = new EventBus({ historyLimit: 100 });
    this.workflowEngine = new WorkflowEngine(this.eventBus);

    // 状态管理
    this.state = {
      browser: null,
      context: null,
      page: null,
      cookies: [],
      loginStatus: null,
      badgeDetection: null,
      cookieValidation: null,
      lastSaveTime: null,
      saveHistory: []
    };

    this.setupEventDrivenWorkflow();
  }

  /**
   * 设置事件驱动工作流
   */
  setupEventDrivenWorkflow() {
    // 工作流规则：浏览器初始化
    this.workflowEngine.addRule({
      id: 'browser-init-rule',
      name: '浏览器初始化规则',
      description: '启动浏览器并初始化上下文',
      when: 'cookie:browser:init' as any,
      then: async (data) => {
        console.log('🚀 初始化浏览器...');

        const browser = await chromium.launch({
          headless: this.headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        });

        const context = await browser.newContext({
          userAgent: this.userAgent,
          viewport: this.viewport,
          javaScriptEnabled: true,
          ignoreHTTPSErrors: true
        });

        const page = await context.newPage();
        page.setDefaultTimeout(this.timeout);

        // 设置调试监听器
        if (this.debug) {
          page.on('console', msg => console.log(`[Browser] ${msg.text()}`));
          page.on('pageerror', error => console.log(`[Page Error] ${error.message}`));
        }

        this.state.browser = browser;
        this.state.context = context;
        this.state.page = page;

        await this.eventBus.emit('cookie:browser:initialized', {
          browser,
          context,
          page
        });
      }
    });

    // 工作流规则：Cookie加载
    this.workflowEngine.addRule({
      id: 'cookie-load-rule',
      name: 'Cookie加载规则',
      description: '从文件加载已保存的Cookie',
      when: 'cookie:load:request' as any,
      then: async (data) => {
        console.log('🍪 加载Cookie文件...');

        try {
          const cookieData = await fs.readFile(this.cookiesPath, 'utf8');
          const cookies = JSON.parse(cookieData);

          if (Array.isArray(cookies) && cookies.length > 0) {
            await this.state.context.addCookies(cookies);
            this.state.cookies = cookies;

            await this.eventBus.emit('cookie:load:success', {
              count: cookies.length,
              cookies: cookies,
              source: 'file'
            });

            console.log(`✅ 成功加载 ${cookies.length} 个Cookie`);
          } else {
            throw new Error('Cookie文件为空或格式错误');
          }
        } catch (error) {
          await this.eventBus.emit('cookie:load:failed', {
            error: error.message,
            path: this.cookiesPath
          });

          console.log('❌ Cookie加载失败:', error.message);
        }
      }
    });

    // 工作流规则：页面导航
    this.workflowEngine.addRule({
      id: 'page-navigation-rule',
      name: '页面导航规则',
      description: '导航到目标页面',
      when: 'cookie:page:navigate' as any,
      then: async (data) => {
        const { url = 'https://weibo.com/', waitFor = 'networkidle' } = data;
        console.log(`📍 导航到: ${url}`);

        await this.state.page.goto(url, {
          waitUntil: waitFor,
          timeout: this.timeout
        });

        await this.state.page.waitForLoadState('domcontentloaded');
        await this.state.page.waitForTimeout(2000);

        await this.eventBus.emit('cookie:page:navigated', {
          url: this.state.page.url(),
          title: await this.state.page.title()
        });
      }
    });

    // 工作流规则：徽章检测
    this.workflowEngine.addRule({
      id: 'badge-detection-rule',
      name: '徽章检测规则',
      description: '检测用户徽章和头像元素',
      when: 'cookie:badge:detect' as any,
      then: async (data) => {
        console.log('🔍 开始徽章检测...');

        const badgeResult = await this.detectBadges();
        this.state.badgeDetection = badgeResult;

        await this.eventBus.emit('cookie:badge:detected', badgeResult);

        if (badgeResult.detected) {
          await this.eventBus.emit('cookie:badge:success', badgeResult);
        } else {
          await this.eventBus.emit('cookie:badge:failed', badgeResult);
        }
      }
    });

    // 工作流规则：Cookie验证
    this.workflowEngine.addRule({
      id: 'cookie-validation-rule',
      name: 'Cookie验证规则',
      description: '验证当前Cookie的有效性',
      when: 'cookie:validate:request' as any,
      then: async (data) => {
        console.log('🔍 验证Cookie有效性...');

        const validation = await this.validateCookies();
        this.state.cookieValidation = validation;

        await this.eventBus.emit('cookie:validation:completed', validation);

        if (validation.valid) {
          await this.eventBus.emit('cookie:validation:success', validation);
        } else {
          await this.eventBus.emit('cookie:validation:failed', validation);
        }
      }
    });

    // 工作流规则：登录状态确认
    this.workflowEngine.addRule({
      id: 'login-confirmation-rule',
      name: '登录状态确认规则',
      description: '综合徽章检测和Cookie验证确认登录状态',
      when: 'cookie:login:confirm' as any,
      condition: (): boolean => {
        return !!(this.state.badgeDetection && this.state.cookieValidation);
      },
      then: async (data) => {
        console.log('🔍 确认登录状态...');

        const { badgeDetection, cookieValidation } = this.state;
        const loginConfirmed = badgeDetection.detected && cookieValidation.valid;

        const loginStatus = {
          confirmed: loginConfirmed,
          badgeDetection,
          cookieValidation,
          timestamp: Date.now()
        };

        this.state.loginStatus = loginStatus;

        await this.eventBus.emit('cookie:login:confirmed', loginStatus);

        if (loginConfirmed) {
          await this.eventBus.emit('cookie:login:success', loginStatus);
        } else {
          await this.eventBus.emit('cookie:login:failed', loginStatus);
        }
      }
    });

    // 工作流规则：徽章一次性检测完成事件
    this.workflowEngine.addRule({
      id: 'badge-detection-complete-rule',
      name: '徽章检测完成规则',
      description: '徽章一次性检测完成后触发Cookie保存',
      when: 'cookie:badge:detection:complete' as any,
      condition: (data) => {
        // 只有当徽章检测成功且登录确认时才执行
        return data.badgeDetected && data.loginConfirmed;
      },
      then: async (data) => {
        console.log('🎉 徽章一次性检测完成，触发Cookie保存...');

        // 执行Cookie对比和保存
        await this.compareAndSaveCookies();

        await this.eventBus.emit('cookie:badge:save:completed', {
          saveTime: Date.now(),
          cookieCount: this.state.cookies.length,
          detectionData: data
        });
      }
    });

    // 工作流规则：Cookie保存
    this.workflowEngine.addRule({
      id: 'cookie-save-rule',
      name: 'Cookie保存规则',
      description: '保存当前Cookie到文件',
      when: 'cookie:save:request' as any,
      condition: (data) => {
        return this.autoSave || data.force;
      },
      then: async (data) => {
        console.log('💾 保存Cookie...');

        const success = await this.saveCookiesToFile();

        if (success) {
          await this.eventBus.emit('cookie:save:success', {
            path: this.cookiesPath,
            count: this.state.cookies.length,
            timestamp: Date.now()
          });
        } else {
          await this.eventBus.emit('cookie:save:failed', {
            error: '保存失败',
            path: this.cookiesPath
          });
        }
      }
    });

    // 工作流规则：Cookie对比
    this.workflowEngine.addRule({
      id: 'cookie-comparison-rule',
      name: 'Cookie对比规则',
      description: '对比新旧Cookie的变化',
      when: 'cookie:compare:request' as any,
      then: async (data) => {
        console.log('🔍 对比Cookie变化...');

        const comparison = await this.compareCookies(data.oldCookies || []);

        await this.eventBus.emit('cookie:comparison:completed', comparison);
      }
    });

    // 启动工作流引擎
    this.workflowEngine.start();
  }

  /**
   * 检测徽章元素
   */
  async detectBadges() {
    const result: BadgeDetectionResult = {
      detected: false,
      elements: [],
      visibleCount: 0,
      totalCount: 0,
      details: ''
    };

    try {
      const badgeSelectors = [
        'img[src*="avatar"]',
        'img[alt*="头像"]',
        '.avatar',
        '.user-avatar',
        '.headpic',
        '.face',
        '.gn_header .gn_nav',
        '.S_header .S_nav',
        '[action-data*="uid"]',
        'a[href*="/u/"]',
        'a[href*="/home"]',
        '.username',
        '.user-name',
        '.gn_name',
        '.S_name',
        '[node-type="name"]'
      ];

      for (const selector of badgeSelectors) {
        try {
          const elements = await this.state.page.$$(selector);
          if (elements.length > 0) {
            result.totalCount++;
            const visibleCount = await this.getVisibleElementsCount(elements);

            result.elements.push({
              selector,
              count: elements.length,
              visibleCount
            });

            if (visibleCount > 0) {
              result.visibleCount++;
            }
          }
        } catch (e) {
          // 忽略选择器错误
        }
      }

      result.detected = result.visibleCount >= 2;
      result.details = result.detected
        ? `检测到 ${result.visibleCount} 个可见徽章，共 ${result.totalCount} 个元素`
        : `仅检测到 ${result.visibleCount} 个可见徽章，不足2个`;

      if (this.debug) {
        console.log('🔍 徽章检测结果:', result.details);
      }

    } catch (error) {
      result.details = `检测过程中出现错误: ${error.message}`;
      console.log('❌ 徽章检测失败:', error.message);
    }

    return result;
  }

  /**
   * 验证Cookie有效性
   */
  async validateCookies() {
    const result: CookieValidationResult = {
      valid: false,
      cookies: [],
      hasEssentialCookies: false,
      details: ''
    };

    try {
      const cookies = await this.state.context.cookies();
      result.cookies = cookies;

      const essentialCookies = ['SUB', 'WBPSESS', 'XSRF-TOKEN'];
      const hasEssential = essentialCookies.some(name =>
        cookies.some(cookie => cookie.name === name)
      );

      result.hasEssentialCookies = hasEssential;
      result.valid = cookies.length > 0 && hasEssential;
      result.details = result.valid
        ? `Cookie有效: ${cookies.length}个Cookie，包含必需的认证Cookie`
        : `Cookie无效: ${cookies.length}个Cookie，缺少必需的认证Cookie`;

      if (this.debug) {
        console.log('🔍 Cookie验证结果:', result.details);
      }

    } catch (error) {
      result.details = `验证过程中出现错误: ${error.message}`;
      console.log('❌ Cookie验证失败:', error.message);
    }

    return result;
  }

  /**
   * 获取可见元素数量
   */
  async getVisibleElementsCount(elements: any[]): Promise<number> {
    let visibleCount = 0;
    for (const element of elements.slice(0, 3)) {
      try {
        if (await element.isVisible()) {
          visibleCount++;
        }
      } catch (e) {
        // 忽略可见性检查错误
      }
    }
    return visibleCount;
  }

  /**
   * 对比Cookie变化
   */
  async compareCookies(oldCookies: any[]): Promise<CookieComparison> {
    const newCookies = await this.state.context.cookies();

    const comparison: CookieComparison = {
      oldCount: oldCookies.length,
      newCount: newCookies.length,
      added: [],
      removed: [],
      modified: [],
      unchanged: []
    };

    // 对比逻辑
    const oldCookieMap = new Map(oldCookies.map(c => [c.name, c]));
    const newCookieMap = new Map(newCookies.map(c => [c.name, c]));

    // 找出新增的Cookie
    for (const [name, cookie] of newCookieMap) {
      if (!oldCookieMap.has(name)) {
        comparison.added.push(cookie as any);
      }
    }

    // 找出删除的Cookie
    for (const [name, cookie] of oldCookieMap) {
      if (!newCookieMap.has(name)) {
        comparison.removed.push(cookie as any);
      }
    }

    // 找出修改的Cookie
    for (const [name, newCookie] of newCookieMap) {
      const oldCookie = oldCookieMap.get(name);
      if (oldCookie && (newCookie as any).value !== (oldCookie as any).value) {
        comparison.modified.push({ old: oldCookie as any, new: newCookie as any });
      }
    }

    // 找出未变化的Cookie
    for (const [name, newCookie] of newCookieMap) {
      const oldCookie = oldCookieMap.get(name);
      if (oldCookie && (newCookie as any).value === (oldCookie as any).value) {
        comparison.unchanged.push(newCookie as any);
      }
    }

    return comparison;
  }

  /**
   * 对比并保存Cookie
   */
  async compareAndSaveCookies() {
    console.log('🔄 开始Cookie对比和保存流程...');

    // 获取当前Cookie
    const currentCookies = await this.state.context.cookies();
    this.state.cookies = currentCookies;

    // 与上次保存的Cookie进行对比
    let oldCookies = [];
    try {
      const oldCookieData = await fs.readFile(this.cookiesPath, 'utf8');
      oldCookies = JSON.parse(oldCookieData);
    } catch (error) {
      console.log('📝 未找到历史Cookie文件，进行首次保存');
    }

    // 执行对比
    const comparison = await this.compareCookies(oldCookies);

    // 记录保存历史
    const saveRecord = {
      timestamp: Date.now(),
      cookieCount: currentCookies.length,
      comparison,
      badgeDetection: this.state.badgeDetection,
      loginStatus: this.state.loginStatus
    };

    this.state.saveHistory.push(saveRecord);

    if (this.debug) {
      console.log('📊 Cookie对比结果:');
      console.log(`  - 旧Cookie数量: ${comparison.oldCount}`);
      console.log(`  - 新Cookie数量: ${comparison.newCount}`);
      console.log(`  - 新增Cookie: ${comparison.added.length}`);
      console.log(`  - 删除Cookie: ${comparison.removed.length}`);
      console.log(`  - 修改Cookie: ${comparison.modified.length}`);
      console.log(`  - 未变化Cookie: ${comparison.unchanged.length}`);
    }

    // 保存Cookie
    const saveSuccess = await this.saveCookiesToFile();

    if (saveSuccess) {
      console.log('✅ Cookie对比和保存完成');
      this.state.lastSaveTime = Date.now();
    } else {
      console.log('❌ Cookie保存失败');
    }

    return saveSuccess;
  }

  /**
   * 保存Cookie到文件
   */
  async saveCookiesToFile() {
    try {
      const cookies = await this.state.context.cookies();
      const cookiesDir = path.dirname(this.cookiesPath);

      await fs.mkdir(cookiesDir, { recursive: true });
      await fs.writeFile(this.cookiesPath, JSON.stringify(cookies, null, 2));

      console.log(`✅ Cookie已保存到: ${this.cookiesPath}`);
      console.log(`📊 保存了 ${cookies.length} 个Cookie`);

      return true;
    } catch (error) {
      console.log('❌ 保存Cookie失败:', error.message);
      return false;
    }
  }

  /**
   * 完整的Cookie管理流程
   */
  async runCookieManagementFlow() {
    try {
      console.log('🚀 开始事件驱动的Cookie管理流程...');

      // 1. 初始化浏览器
      await this.eventBus.emit('cookie:browser:init');

      // 2. 加载Cookie
      await this.eventBus.emit('cookie:load:request');

      // 3. 导航到页面
      await this.eventBus.emit('cookie:page:navigate');

      // 4. 检测徽章
      await this.eventBus.emit('cookie:badge:detect');

      // 5. 验证Cookie
      await this.eventBus.emit('cookie:validate:request');

      // 6. 确认登录状态
      await this.eventBus.emit('cookie:login:confirm');

      // 7. 触发徽章一次性检测完成事件
      const { badgeDetection, cookieValidation } = this.state;
      if (badgeDetection && cookieValidation) {
        await this.eventBus.emit('cookie:badge:detection:complete', {
          badgeDetected: badgeDetection.detected,
          loginConfirmed: badgeDetection.detected && cookieValidation.valid,
          detectionTime: Date.now(),
          badgeData: badgeDetection,
          validationData: cookieValidation
        });
      }

      console.log('✅ Cookie管理流程完成');

      return {
        success: true,
        loginStatus: this.state.loginStatus,
        cookies: this.state.cookies,
        badgeDetection: this.state.badgeDetection,
        cookieValidation: this.state.cookieValidation
      };

    } catch (error) {
      console.log('❌ Cookie管理流程失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.state.browser) {
      await this.state.browser.close();
    }

    this.workflowEngine.destroy();
    this.eventBus.destroy();
  }
}

// 命令行执行
if (import.meta.url === `file://${process.argv[1]}`) {
  const cookieManager = new EventDrivenCookieManager({
    headless: false,
    debug: true,
    autoSave: true,
    cookiesPath: path.join(process.env.HOME || '~', '.webauto/cookies/weibo-cookies.json')
  });

  cookieManager.runCookieManagementFlow()
    .then((result) => {
      console.log('\n📋 Cookie管理流程结果:');
      console.log(`执行状态: ${result.success ? '✅ 成功' : '❌ 失败'}`);

      if (result.success) {
        console.log(`登录状态: ${result.loginStatus?.confirmed ? '✅ 已确认' : '❌ 未确认'}`);
        console.log(`Cookie数量: ${result.cookies?.length || 0}`);
        console.log(`徽章检测: ${result.badgeDetection?.detected ? '✅ 成功' : '❌ 失败'}`);
        console.log(`Cookie验证: ${result.cookieValidation?.valid ? '✅ 有效' : '❌ 无效'}`);
      } else {
        console.log(`错误信息: ${result.error}`);
      }

      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.log('💥 程序执行失败:', error.message);
      process.exit(1);
    });
}

export default EventDrivenCookieManager;