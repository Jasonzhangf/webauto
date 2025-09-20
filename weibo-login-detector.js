#!/usr/bin/env node

/**
 * 事件驱动的微博登录状态检测器
 * 基于事件驱动容器系统，正确检测微博登录状态
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

class WeiboLoginDetector {
  constructor(options = {}) {
    this.headless = options.headless ?? false;
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.timeout = options.timeout || 30000;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.cookiesPath = options.cookiesPath || './cookies/weibo-cookies.json';
    this.debug = options.debug ?? false;

    // 事件驱动架构
    this.eventBus = new EventBus({ historyLimit: 50 });
    this.workflowEngine = new WorkflowEngine(this.eventBus);

    // 状态管理
    this.state = {
      browser: null,
      context: null,
      page: null,
      loginStatus: null,
      detectionResults: null
    };

    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 工作流规则：浏览器启动
    this.workflowEngine.addRule({
      id: 'browser-launch-rule',
      name: '浏览器启动规则',
      description: '启动浏览器实例',
      when: 'detector:browser:launch',
      then: async (data) => {
        console.log('🚀 启动浏览器...');
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

        await this.eventBus.emit('detector:browser:launched', {
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
      description: '加载已保存的Cookie',
      when: 'detector:cookie:load',
      then: async (data) => {
        console.log('🍪 加载Cookie...');
        try {
          const cookieData = await fs.readFile(this.cookiesPath, 'utf8');
          const cookies = JSON.parse(cookieData);

          if (Array.isArray(cookies) && cookies.length > 0) {
            await this.state.context.addCookies(cookies);
            await this.eventBus.emit('detector:cookie:loaded', {
              count: cookies.length,
              success: true
            });
            console.log(`✅ 加载了 ${cookies.length} 个Cookie`);
          } else {
            throw new Error('Cookie文件为空或格式错误');
          }
        } catch (error) {
          await this.eventBus.emit('detector:cookie:load:failed', {
            error: error.message
          });
          console.log('❌ 无法加载Cookie:', error.message);
        }
      }
    });

    // 工作流规则：页面导航
    this.workflowEngine.addRule({
      id: 'page-navigation-rule',
      name: '页面导航规则',
      description: '导航到微博首页',
      when: 'detector:page:navigate',
      then: async (data) => {
        console.log('📍 导航到微博首页...');
        await this.state.page.goto('https://weibo.com/', {
          waitUntil: 'networkidle',
          timeout: this.timeout
        });

        await this.state.page.waitForLoadState('domcontentloaded');
        await this.state.page.waitForTimeout(2000);

        await this.eventBus.emit('detector:page:navigated', {
          url: this.state.page.url(),
          title: await this.state.page.title()
        });
      }
    });

    // 工作流规则：登录状态检测
    this.workflowEngine.addRule({
      id: 'login-detection-rule',
      name: '登录检测规则',
      description: '检测微博登录状态',
      when: 'detector:login:detect',
      then: async (data) => {
        console.log('🔍 开始检测微博登录状态...');
        const loginStatus = await this.checkLoginElements();

        this.state.loginStatus = loginStatus;
        this.state.detectionResults = loginStatus;

        console.log(`📊 登录状态检测结果: ${loginStatus.isLoggedIn ? '已登录' : '未登录'}`);
        if (loginStatus.details) {
          console.log(`📋 检测详情: ${loginStatus.details}`);
        }

        await this.eventBus.emit('detector:login:detected', loginStatus);

        // 根据检测结果触发后续动作
        if (loginStatus.isLoggedIn) {
          await this.eventBus.emit('detector:login:success', loginStatus);
        } else {
          await this.eventBus.emit('detector:login:failed', loginStatus);
        }
      }
    });

    // 工作流规则：徽章检测完成（一次性触发）
    this.workflowEngine.addRule({
      id: 'badge-detection-complete-rule',
      name: '徽章检测完成规则',
      description: '徽章一次性检测完成后保存Cookie',
      when: 'detector:badge:detected:complete',
      condition: (data) => {
        // 只有当徽章检测成功且确认登录时才执行
        return data.badgeDetected && data.loginConfirmed;
      },
      then: async (data) => {
        console.log('🎉 徽章检测确认登录状态，保存Cookie...');
        await this.saveCookies();
        console.log('✅ Cookie保存完成（基于徽章检测）');

        // 触发登录成功事件
        await this.eventBus.emit('detector:login:success', {
          ...data,
          detectionMethod: 'badge-based'
        });
      }
    });

    // 工作流规则：登录成功处理（兼容原有逻辑）
    this.workflowEngine.addRule({
      id: 'login-success-rule',
      name: '登录成功处理规则',
      description: '处理登录成功事件',
      when: 'detector:login:success',
      condition: (data) => {
        // 确保是徽章检测触发的，避免重复保存
        return data.detectionMethod !== 'badge-based';
      },
      then: async (data) => {
        console.log('🎉 登录状态确认，保存Cookie...');
        await this.saveCookies();
        console.log('✅ Cookie保存完成');
      }
    });

    // 工作流规则：检测完成
    this.workflowEngine.addRule({
      id: 'detection-complete-rule',
      name: '检测完成规则',
      description: '完成检测流程',
      when: 'detector:login:detected',
      then: async (data) => {
        console.log('📸 保存调试截图...');
        await this.saveScreenshot();
        console.log('✅ 检测流程完成');
      }
    });

    // 启动工作流引擎
    this.workflowEngine.start();
  }

  /**
   * 启动浏览器
   */
  async launchBrowser() {
    await this.eventBus.emit('detector:browser:launch');
    return this.state.browser;
  }

  /**
   * 加载Cookie
   */
  async loadCookies() {
    await this.eventBus.emit('detector:cookie:load');
    return this.state.detectionResults;
  }

  /**
   * 检测登录状态 - 主要方法
   */
  async detectLoginStatus() {
    // 事件驱动的检测流程
    await this.eventBus.emit('detector:page:navigate');
    await this.eventBus.emit('detector:login:detect');

    return this.state.loginStatus;
  }

  /**
   * 检查登录元素 - 核心检测逻辑
   */
  async checkLoginElements() {
    const result = {
      isLoggedIn: false,
      details: '',
      detectedElements: [],
      badgeDetected: false,
      loginConfirmed: false
    };

    try {
      // 1. 检查登录按钮/链接（未登录状态）
      const loginSelectors = [
        'a[href*="login"]',
        '.login-btn',
        '.S_login',
        'a[node-type="loginBtn"]',
        '.gn_login',
        '[title="登录"]',
        'text="登录"',
        'text="立即登录"'
      ];

      let hasLoginElements = false;
      for (const selector of loginSelectors) {
        try {
          const elements = await this.state.page.$$(selector);
          if (elements.length > 0) {
            hasLoginElements = true;
            result.detectedElements.push(`登录元素: ${selector}`);
            break;
          }
        } catch (e) {
          // 忽略选择器错误
        }
      }

      // 2. 检查用户头像/徽章（已登录状态）- 专门的徽章检测
      const badgeSelectors = [
        // 主要徽章/头像选择器
        'img[src*="avatar"]',
        'img[alt*="头像"]',
        '.avatar',
        '.user-avatar',
        '.headpic',
        '.face',

        // 微博特有的用户标识
        '.gn_header .gn_nav',
        '.S_header .S_nav',
        '[action-data*="uid"]',
        'a[href*="/u/"]',
        'a[href*="/home"]',

        // 用户信息选择器
        '.username',
        '.user-name',
        '.gn_name',
        '.S_name',
        '[node-type="name"]'
      ];

      let badgeCount = 0;
      const detectedBadges = [];

      for (const selector of badgeSelectors) {
        try {
          const elements = await this.state.page.$$(selector);
          if (elements.length > 0) {
            badgeCount++;
            detectedBadges.push({
              selector: selector,
              count: elements.length,
              visible: await this.areElementsVisible(elements)
            });
            result.detectedElements.push(`徽章元素: ${selector} (${elements.length}个)`);
          }
        } catch (e) {
          // 忽略选择器错误
        }
      }

      // 徽章检测结果
      const visibleBadges = detectedBadges.filter(badge => badge.visible);
      result.badgeDetected = visibleBadges.length >= 2; // 至少2个可见徽章

      if (this.debug) {
        console.log('🔍 徽章检测结果:');
        console.log(`  - 徽章总数: ${badgeCount}`);
        console.log(`  - 可见徽章: ${visibleBadges.length}`);
        console.log(`  - 徽章确认: ${result.badgeDetected ? '成功' : '失败'}`);
        visibleBadges.forEach(badge => {
          console.log(`    - ${badge.selector}: ${badge.count}个, 可见: ${badge.visible}`);
        });
      }

      // 3. 检查其他用户元素
      const additionalUserSelectors = [
        '.gn_header_right',
        '.S_header_right',
        '.Header_right',
        '.header-right'
      ];

      let additionalUserCount = 0;
      for (const selector of additionalUserSelectors) {
        try {
          const elements = await this.state.page.$$(selector);
          if (elements.length > 0) {
            additionalUserCount++;
            result.detectedElements.push(`辅助用户元素: ${selector} (${elements.length}个)`);
          }
        } catch (e) {
          // 忽略选择器错误
        }
      }

      const totalUserElements = badgeCount + additionalUserCount;

      // 4. 检查Cookie验证
      const cookies = await this.state.context.cookies();
      const hasWeiboCookies = cookies.some(cookie =>
        cookie.name === 'SUB' ||
        cookie.name === 'WBPSESS' ||
        cookie.name === 'XSRF-TOKEN'
      );

      // 5. 检查页面URL和标题
      const url = this.state.page.url();
      const title = await this.state.page.title();

      // 6. 检查页面内容
      const pageContent = await this.state.page.content();
      const hasLogoutText = pageContent.includes('退出') || pageContent.includes('注销');
      const hasUserText = pageContent.includes('我的首页') || pageContent.includes('个人中心');

      // 徽章检测确认逻辑
      result.loginConfirmed = result.badgeDetected && hasWeiboCookies;

      // 综合判断逻辑
      if (result.loginConfirmed) {
        // 徽章检测确认登录
        result.isLoggedIn = true;
        result.details = `徽章检测确认: ${visibleBadges.length}个可见徽章 + 有效Cookie`;

        // 触发徽章检测完成事件
        await this.eventBus.emit('detector:badge:detected:complete', {
          badgeDetected: result.badgeDetected,
          loginConfirmed: result.loginConfirmed,
          visibleBadges: visibleBadges.length,
          totalBadges: badgeCount,
          hasWeiboCookies: hasWeiboCookies,
          detectionTime: Date.now()
        });

      } else if (hasLoginElements && totalUserElements === 0 && !hasWeiboCookies) {
        // 明显的未登录状态
        result.isLoggedIn = false;
        result.details = '检测到登录按钮，无用户元素，无有效Cookie';
      } else if (!hasLoginElements && totalUserElements >= 2 && hasWeiboCookies) {
        // 明显的已登录状态
        result.isLoggedIn = true;
        result.details = `检测到 ${totalUserElements} 个用户元素，有有效Cookie，无登录按钮`;
      } else if (totalUserElements >= 3 && hasWeiboCookies) {
        // 倾向于已登录
        result.isLoggedIn = true;
        result.details = `检测到多个用户元素 (${totalUserElements}个) 和有效Cookie`;
      } else if (hasLoginElements) {
        // 倾向于未登录
        result.isLoggedIn = false;
        result.details = '检测到登录按钮，用户元素较少';
      } else if (hasWeiboCookies && hasUserText) {
        // Cookie和文本内容验证
        result.isLoggedIn = true;
        result.details = 'Cookie有效且页面包含用户相关文本';
      } else {
        // 不确定状态
        result.isLoggedIn = hasWeiboCookies;
        result.details = '状态不确定，基于Cookie判断';
      }

      // 调试信息
      if (this.debug) {
        console.log('🔍 详细检测信息:');
        console.log(`  - 登录元素: ${hasLoginElements ? '是' : '否'}`);
        console.log(`  - 用户元素总数: ${totalUserElements}`);
        console.log(`  - 徽章元素: ${badgeCount}`);
        console.log(`  - 可见徽章: ${visibleBadges.length}`);
        console.log(`  - 有效Cookie: ${hasWeiboCookies ? '是' : '否'}`);
        console.log(`  - 退出文本: ${hasLogoutText ? '是' : '否'}`);
        console.log(`  - 用户文本: ${hasUserText ? '是' : '否'}`);
        console.log(`  - 当前URL: ${url}`);
        console.log(`  - 页面标题: ${title}`);
        console.log(`  - 徽章确认登录: ${result.loginConfirmed ? '是' : '否'}`);
      }

    } catch (error) {
      result.isLoggedIn = false;
      result.details = `检测过程中出现错误: ${error.message}`;
      console.log('❌ 登录状态检测失败:', error.message);
    }

    return result;
  }

  /**
   * 检查元素是否可见
   */
  async areElementsVisible(elements) {
    for (const element of elements.slice(0, 3)) { // 最多检查前3个元素
      try {
        const isVisible = await element.isVisible();
        if (isVisible) {
          return true;
        }
      } catch (e) {
        // 忽略检查错误
      }
    }
    return false;
  }

  /**
   * 保存当前Cookie
   */
  async saveCookies() {
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
   * 截图保存
   */
  async saveScreenshot(filename = 'login-status.png') {
    try {
      const screenshotsDir = './screenshots';
      await fs.mkdir(screenshotsDir, { recursive: true });
      const screenshotPath = path.join(screenshotsDir, filename);

      await this.state.page.screenshot({
        path: screenshotPath,
        fullPage: true
      });

      console.log(`📸 截图已保存: ${screenshotPath}`);
      return true;
    } catch (error) {
      console.log('❌ 截图失败:', error.message);
      return false;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * 主检测流程 - 事件驱动
   */
  async runDetection() {
    try {
      console.log('🚀 开始事件驱动的微博登录检测...');

      // 启动浏览器
      await this.launchBrowser();

      // 尝试加载已有Cookie
      const cookiesLoaded = await this.loadCookies();

      // 执行登录状态检测
      const loginStatus = await this.detectLoginStatus();

      console.log('📊 检测流程完成');

      return loginStatus;

    } catch (error) {
      console.log('❌ 检测过程中出现严重错误:', error.message);
      return {
        isLoggedIn: false,
        details: `检测失败: ${error.message}`,
        detectedElements: [],
        badgeDetected: false,
        loginConfirmed: false
      };
    } finally {
      await this.cleanup();
    }
  }
}

// 命令行执行
if (import.meta.url === `file://${process.argv[1]}`) {
  const detector = new WeiboLoginDetector({
    headless: false,
    debug: true,
    cookiesPath: './cookies/weibo-cookies.json'
  });

  detector.runDetection()
    .then((result) => {
      console.log('\n📋 最终检测结果:');
      console.log(`登录状态: ${result.isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);
      console.log(`详情: ${result.details}`);
      console.log(`检测到的元素: ${result.detectedElements.length}个`);

      process.exit(result.isLoggedIn ? 0 : 1);
    })
    .catch((error) => {
      console.log('💥 程序执行失败:', error.message);
      process.exit(1);
    });
}

export default WeiboLoginDetector;