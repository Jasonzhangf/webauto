#!/usr/bin/env node

/**
 * 统一Cookie管理系统 (Unified Cookie Manager)
 * 强制自动注入、状态检查和自动保存功能
 * 这是项目中唯一的Cookie管理实现
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class UnifiedCookieManager {
  constructor(config = {}) {
    this.config = {
      cookieFile: config.cookieFile || './cookies/weibo-cookies.json',
      headless: config.headless || false,
      verbose: config.verbose || true,
      forceLoginCheck: config.forceLoginCheck !== false,
      autoCookieSave: config.autoCookieSave !== false,
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: config.viewport || { width: 1920, height: 1080 },
      ...config
    };

    // 强制登录指示器选择器 - 更严格的条件
    this.loginIndicators = [
      // 核心用户名指示器（必须包含用户名）
      '.gn_name:not(:empty)',
      '.S_txt1:not(:empty):not([class*="login"])',
      // 头像相关（必须是用户头像，链接包含用户ID）
      '[class*="avatar"][href*="/u/"]:not([href*="visitor"])',
      '[class*="avatar"][href*="/home"]:not([href*="newlogin"])',
      // 真正的用户信息容器
      '.gn_header_info:has(.gn_name)',
      '[class*="header_info"]:has([href*="/u/"])',
      // 个人主页链接（不能是登录相关）
      '[href*="/home"]:not([href*="newlogin"]):not([href*="login"])',
      '[href*="/profile"]:not([href*="newlogin"])',
      '[href*="/u/"]:not([href*="visitor"]):not([href*="login"])'
    ];

    // 重要Cookie名称 - 智能识别认证相关的Cookie
    this.essentialCookies = [
      'SUB',           // 主要认证Cookie (最重要)
      'WBPSESS',       // 会话Cookie (重要)
      'XSRF-TOKEN',    // CSRF保护 (重要)
      'SUBP',          // 认证参数 (次要)
      'ALF',           // 自动登录 (次要)
      'SRT',           // 安全令牌 (次要)
      'SCF',           // 安全配置 (次要)
      'SSOLoginState'  // SSO登录状态 (次要)
    ];

    this.browser = null;
    this.context = null;
    this.page = null;
    this.lastLoginStatus = null;
  }

  /**
   * 强制性Cookie自动注入和验证
   * 这是所有操作的入口点，必须通过验证才能继续
   * 浏览器使用必须绑定Cookie注入
   */
  async forceCookieVerification() {
    console.log('🔒 开始强制Cookie验证流程...');
    console.log('📋 浏览器使用已绑定Cookie注入，必须通过验证才能继续');

    try {
      // 1. 初始化浏览器
      await this.initializeBrowser();

      // 2. 自动注入Cookie
      const injectionResult = await this.injectCookies();
      if (!injectionResult.success) {
        throw new Error(`Cookie注入失败: ${injectionResult.error}`);
      }

      // 3. 导航到微博页面
      await this.navigateToWeibo();

      // 4. 执行登录状态验证
      const loginResult = await this.verifyLoginStatus();
      this.lastLoginStatus = loginResult;

      // 5. 强制登录检查
      if (this.config.forceLoginCheck && !loginResult.loggedIn) {
        throw new Error('强制登录检查失败：未检测到有效登录状态');
      }

      // 6. 如果已登录，自动保存Cookie
      if (loginResult.loggedIn && this.config.autoCookieSave) {
        await this.autoSaveCookies();
      }

      console.log('✅ 强制Cookie验证完成');
      return {
        success: true,
        injectionResult,
        loginResult,
        canProceed: loginResult.loggedIn || !this.config.forceLoginCheck,
        browser: this.browser,
        context: this.context,
        page: this.page
      };

    } catch (error) {
      console.error('❌ 强制Cookie验证失败:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 自动注入Cookie
   */
  async injectCookies() {
    console.log('🍪 执行Cookie自动注入...');

    if (!fs.existsSync(this.config.cookieFile)) {
      return {
        success: false,
        error: `Cookie文件不存在: ${this.config.cookieFile}`,
        injected: 0
      };
    }

    try {
      const cookieData = fs.readFileSync(this.config.cookieFile, 'utf8');
      let cookies = JSON.parse(cookieData);

      // 处理包装格式的cookie文件 { "cookies": [...] }
      if (!Array.isArray(cookies) && cookies && cookies.cookies) {
        cookies = cookies.cookies;
      }

      if (!Array.isArray(cookies) || cookies.length === 0) {
        return {
          success: false,
          error: 'Cookie文件格式错误或为空',
          injected: 0
        };
      }

      await this.context.addCookies(cookies);

      if (this.config.verbose) {
        console.log(`✅ Cookie注入成功: ${cookies.length} 个Cookie`);
      }

      return {
        success: true,
        injected: cookies.length,
        cookies: cookies
      };

    } catch (error) {
      return {
        success: false,
        error: `Cookie注入失败: ${error.message}`,
        injected: 0
      };
    }
  }

  /**
   * 导航到微博
   */
  async navigateToWeibo() {
    console.log('🌐 导航到微博主页...');

    try {
      await this.page.goto('https://weibo.com', {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(this.config.timeout, 15000)
      });

      await this.page.waitForTimeout(3000);

      if (this.config.verbose) {
        console.log(`📍 当前页面: ${this.page.url()}`);
        console.log(`📄 页面标题: ${await this.page.title()}`);
      }
    } catch (error) {
      console.warn('⚠️ 页面导航超时，但将继续进行登录状态检查...');
      // 即使导航超时，也尝试检查当前页面状态
    }
  }

  /**
   * 验证登录状态
   */
  async verifyLoginStatus() {
    console.log('🔍 验证登录状态...');

    try {
      const result = await this.page.evaluate((indicators) => {
        // 检测登录指示器
        const results = {};
        let totalElements = 0;
        let visibleElements = 0;

        indicators.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            const visible = Array.from(elements).filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null &&
                     window.getComputedStyle(el).display !== 'none' &&
                     window.getComputedStyle(el).visibility !== 'hidden';
            });

            if (visible.length > 0) {
              results[selector] = visible.length;
              totalElements += elements.length;
              visibleElements += visible.length;
            }
          } catch (e) {
            // 忽略选择器错误
          }
        });

        // 检查页面标题和URL
        const title = document.title;
        const url = window.location.href;
        const hasValidTitle = title && !title.includes('登录') && !title.includes('Login');
        const hasValidUrl = url && !url.includes('newlogin') && !url.includes('login') && !url.includes('visitor');

        // 更严格的登录判断：必须同时满足徽章、标题和URL条件
        const hasValidBadges = visibleElements >= 1; // 至少一个真实徽章
        const isLoggedIn = hasValidBadges && hasValidTitle && hasValidUrl;

        return {
          indicators,
          results,
          totalElements,
          visibleElements,
          hasValidTitle,
          hasValidUrl,
          hasValidBadges,
          isLoggedIn,
          details: {
            elementCount: totalElements,
            visibleCount: visibleElements,
            selectorCount: Object.keys(results).length,
            title: title,
            url: url,
            validBadgeCheck: hasValidBadges,
            validTitleCheck: hasValidTitle,
            validUrlCheck: hasValidUrl
          }
        };
      }, this.loginIndicators);

      // 验证Cookie有效性
      const cookies = await this.context.cookies();
      const hasEssentialCookies = this.essentialCookies.some(name =>
        cookies.some(cookie => cookie.name === name)
      );

      const cookieValid = cookies.length > 0 && hasEssentialCookies;

      const finalResult = {
        ...result,
        cookieValid,
        hasEssentialCookies,
        cookieCount: cookies.length,
        loggedIn: result.isLoggedIn && cookieValid,
        validationDetails: {
          badgeDetection: result.isLoggedIn,
          cookieValidation: cookieValid,
          combined: result.isLoggedIn && cookieValid
        }
      };

      if (this.config.verbose) {
        console.log('🔍 登录状态验证结果:');
        console.log(`   - 徽章检测: ${result.isLoggedIn ? '✅ 通过' : '❌ 失败'} (${result.visibleElements} 个可见元素)`);
        console.log(`   - Cookie验证: ${cookieValid ? '✅ 通过' : '❌ 失败'} (${cookies.length} 个Cookie)`);
        console.log(`   - 综合结果: ${finalResult.loggedIn ? '✅ 已登录' : '❌ 未登录'}`);
        console.log(`   - 页面标题: ${result.details.title}`);
      }

      return finalResult;

    } catch (error) {
      console.error('❌ 登录状态验证失败:', error.message);
      return {
        loggedIn: false,
        error: error.message,
        totalElements: 0,
        visibleElements: 0,
        hasValidTitle: false,
        hasValidUrl: false,
        hasValidBadges: false,
        cookieValid: false,
        hasEssentialCookies: false,
        cookieCount: 0,
        details: {
          elementCount: 0,
          visibleCount: 0,
          selectorCount: 0,
          title: '',
          url: '',
          validBadgeCheck: false,
          validTitleCheck: false,
          validUrlCheck: false
        }
      };
    }
  }

  /**
   * 自动保存Cookie
   * 当检测到登录成功时自动调用
   */
  async autoSaveCookies() {
    console.log('💾 执行自动Cookie保存...');

    try {
      const cookies = await this.context.cookies();

      // 只保存必需的Cookie - 只有这6个是有用的
      const essentialCookiesOnly = cookies.filter(cookie =>
        cookie.name && cookie.value && cookie.domain && this.essentialCookies.includes(cookie.name)
      );

      if (essentialCookiesOnly.length === 0) {
        console.warn('⚠️ 没有找到必需的Cookie需要保存');
        console.warn(`   需要的Cookie: ${this.essentialCookies.join(', ')}`);
        console.warn(`   找到的Cookie: ${cookies.map(c => c.name).join(', ')}`);
        return false;
      }

      // 确保目录存在
      const cookieDir = path.dirname(this.config.cookieFile);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // 只保存必需的Cookie
      fs.writeFileSync(this.config.cookieFile, JSON.stringify(essentialCookiesOnly, null, 2));

      if (this.config.verbose) {
        console.log(`✅ Cookie自动保存完成`);
        console.log(`   保存路径: ${this.config.cookieFile}`);
        console.log(`   Cookie数量: ${essentialCookiesOnly.length} (只保存必需的6个)`);
        console.log(`   保存的Cookie: ${essentialCookiesOnly.map(c => c.name).join(', ')}`);
      }

      return true;

    } catch (error) {
      console.error('❌ Cookie自动保存失败:', error.message);
      return false;
    }
  }

  /**
   * 强制登录流程
   * 当Cookie失效时启动可视化登录
   */
  async forceLogin() {
    console.log('🔐 启动强制登录流程...');

    try {
      // 确保使用可视化浏览器
      if (this.browser && this.config.headless) {
        await this.cleanup();
      }

      this.config.headless = false;
      await this.initializeBrowser();

      // 导航到微博
      await this.navigateToWeibo();

      console.log('👤 请在打开的浏览器中手动登录微博...');
      console.log('⏳ 系统将自动检测登录状态...');

      // 等待用户登录
      const loginResult = await this.waitForUserLogin();

      if (loginResult.loggedIn) {
        // 自动保存Cookie
        await this.autoSaveCookies();

        this.lastLoginStatus = loginResult;

        console.log('✅ 强制登录成功，Cookie已保存');
        return {
          success: true,
          loginResult,
          browser: this.browser,
          context: this.context,
          page: this.page
        };
      } else {
        throw new Error('强制登录超时或失败');
      }

    } catch (error) {
      console.error('❌ 强制登录失败:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 等待用户手动登录
   */
  async waitForUserLogin() {
    const maxAttempts = 60; // 5分钟
    const checkInterval = 5000; // 5秒

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await this.verifyLoginStatus();
        if (result.loggedIn) {
          return result;
        }

        if (i % 6 === 0) { // 每30秒显示一次进度
          console.log(`⏳ 等待登录中... (${Math.floor(i/6)}/${Math.floor(maxAttempts/6)} 分钟)`);
        }

        await this.page.waitForTimeout(checkInterval);
      } catch (error) {
        console.warn(`⚠️ 登录检查异常: ${error.message}`);
        await this.page.waitForTimeout(checkInterval);
      }
    }

    return {
      loggedIn: false,
      error: '登录超时'
    };
  }

  /**
   * 初始化浏览器
   */
  async initializeBrowser() {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: this.config.headless,
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

    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: this.config.viewport,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    // 设置事件监听
    if (this.config.verbose) {
      this.page.on('console', msg => console.log(`📄 [页面] ${msg.text()}`));
      this.page.on('pageerror', error => console.warn(`⚠️ [页面错误] ${error.message}`));
    }

    if (this.config.verbose) {
      console.log('🌐 浏览器初始化完成');
    }
  }

  /**
   * 获取最后一次登录状态
   */
  getLastLoginStatus() {
    return this.lastLoginStatus;
  }

  /**
   * 获取当前页面
   */
  getPage() {
    return this.page;
  }

  /**
   * 获取浏览器上下文
   */
  getContext() {
    return this.context;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    if (this.config.verbose) {
      console.log('🧹 统一Cookie管理器资源已清理');
    }
  }

  /**
   * 完整的验证和清理流程
   */
  async verifyAndCleanup() {
    try {
      const result = await this.forceCookieVerification();
      await this.cleanup();
      return result;
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }
}

/**
 * 全局便利函数：强制Cookie验证
 * 所有测试必须调用此函数进行Cookie验证
 */
async function requireCookieVerification(config = {}) {
  const manager = new UnifiedCookieManager(config);

  try {
    const result = await manager.forceCookieVerification();

    if (!result.success || !result.canProceed) {
      throw new Error('强制Cookie验证失败：操作无法继续');
    }

    return {
      ...result,
      manager // 返回manager实例以便后续使用
    };

  } catch (error) {
    console.error('❌ Cookie验证失败:', error.message);

    // 如果验证失败，尝试强制登录
    console.log('🔄 尝试强制登录流程...');
    const loginResult = await manager.forceLogin();

    return {
      ...loginResult,
      manager,
      fromForceLogin: true
    };
  } finally {
    // 注意：不自动清理，让调用者决定何时清理
  }
}

/**
 * 自动检测和Cookie刷新
 */
async function autoDetectAndRefreshCookies(config = {}) {
  const manager = new UnifiedCookieManager(config);

  try {
    const result = await manager.forceCookieVerification();

    if (result.loginResult.loggedIn) {
      console.log('🎉 检测到已登录状态，Cookie已刷新');
      return result;
    } else {
      console.log('⚠️ 未检测到登录状态');
      return result;
    }

  } finally {
    await manager.cleanup();
  }
}

module.exports = {
  UnifiedCookieManager,
  requireCookieVerification,
  autoDetectAndRefreshCookies
};

// 命令行执行
if (require.main === module) {
  (async () => {
    console.log('🧪 统一Cookie管理系统测试');
    console.log('='.repeat(50));

    try {
      const result = await requireCookieVerification({
        verbose: true,
        forceLoginCheck: true,
        headless: false
      });

      console.log('\n📋 测试结果:');
      console.log(`✅ 验证状态: ${result.success ? '成功' : '失败'}`);
      console.log(`✅ 登录状态: ${result.loginResult.loggedIn ? '已登录' : '未登录'}`);
      console.log(`✅ Cookie数量: ${result.loginResult.cookieCount}`);
      console.log(`✅ 可继续操作: ${result.canProceed ? '是' : '否'}`);

      // 清理资源
      await result.manager.cleanup();

      console.log('\n🎉 统一Cookie管理系统测试完成');

    } catch (error) {
      console.error('\n💥 测试失败:', error.message);
      process.exit(1);
    }
  })();
}