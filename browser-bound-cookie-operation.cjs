#!/usr/bin/env node

/**
 * 浏览器绑定的Cookie自动注入原子操作
 * 与浏览器生命周期深度绑定的Cookie管理原子操作
 * 确保任何使用浏览器的操作都必须先注入Cookie
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * 浏览器绑定的Cookie自动注入原子操作
 * 实现与浏览器生命周期深度集成的Cookie管理
 */
class BrowserBoundCookieOperation {
  constructor(config = {}) {
    this.config = {
      cookieFile: config.cookieFile || './cookies/weibo-cookies.json',
      headless: config.headless || false,
      verbose: config.verbose || true,
      forceInjection: config.forceInjection !== false, // 强制注入
      autoSaveOnLogin: config.autoSaveOnLogin !== false, // 自动保存
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: config.viewport || { width: 1920, height: 1080 },
      ...config
    };

    // 必需的认证Cookie
    this.essentialCookies = [
      'SUB',           // 主要认证Cookie
      'WBPSESS',       // 会话Cookie
      'XSRF-TOKEN',    // CSRF保护
      'SUBP',          // 认证参数
      'ALF',           // 自动登录
      'SRT',           // 安全令牌
      'SCF',           // 安全配置
      'SSOLoginState'  // SSO登录状态
    ];

    this.browser = null;
    this.context = null;
    this.page = null;
    this.lastInjectionTime = 0;
    this.lastSaveTime = 0;
    this.operationState = 'initialized';
  }

  /**
   * 原子操作：初始化浏览器并强制注入Cookie
   * 这是所有浏览器操作的前置条件
   */
  async initializeAndInject() {
    console.log('🔐 执行浏览器绑定Cookie原子操作...');
    console.log('📋 阶段1：浏览器初始化');

    try {
      // 1. 初始化浏览器
      await this.initializeBrowser();

      // 2. 强制注入Cookie（必须成功才能继续）
      console.log('📋 阶段2：强制Cookie注入');
      const injectionResult = await this.forceInjectCookies();

      if (!injectionResult.success) {
        throw new Error(`Cookie注入失败: ${injectionResult.error}`);
      }

      // 3. 验证注入结果
      console.log('📋 阶段3：注入验证');
      const verificationResult = await this.verifyInjection();

      if (!verificationResult.success) {
        console.warn('⚠️ Cookie注入验证失败，但继续执行');
      }

      this.operationState = 'ready';

      return {
        success: true,
        operation: 'initialize-and-inject',
        injectionResult,
        verificationResult,
        browser: this.browser,
        context: this.context,
        page: this.page,
        state: this.operationState
      };

    } catch (error) {
      this.operationState = 'failed';
      console.error('❌ 浏览器绑定Cookie原子操作失败:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 原子操作：浏览器实例获取
   * 确保返回的浏览器实例已经完成Cookie注入
   */
  async getBoundBrowser() {
    if (this.operationState !== 'ready') {
      return await this.initializeAndInject();
    }

    return {
      browser: this.browser,
      context: this.context,
      page: this.page,
      state: this.operationState
    };
  }

  /**
   * 原子操作：Cookie状态检查和刷新
   * 在执行敏感操作前检查Cookie状态
   */
  async checkAndRefreshCookies() {
    console.log('🔄 Cookie状态检查和刷新原子操作...');

    try {
      // 1. 检查当前Cookie状态
      const currentStatus = await this.checkCookieStatus();

      // 2. 如果Cookie无效，重新注入
      if (!currentStatus.valid) {
        console.log('📡 Cookie状态无效，执行重新注入...');
        const reinjectionResult = await this.forceInjectCookies();

        if (!reinjectionResult.success) {
          throw new Error(`Cookie重新注入失败: ${reinjectionResult.error}`);
        }

        return {
          success: true,
          action: 'reinjected',
          currentStatus,
          reinjectionResult
        };
      }

      return {
        success: true,
        action: 'verified',
        currentStatus
      };

    } catch (error) {
      console.error('❌ Cookie状态检查失败:', error.message);
      return {
        success: false,
        action: 'failed',
        error: error.message
      };
    }
  }

  /**
   * 原子操作：登录状态检测和自动保存
   * 检测到登录成功时自动保存Cookie
   */
  async detectLoginAndAutoSave() {
    console.log('🔍 登录状态检测和自动保存原子操作...');

    try {
      // 1. 检测登录状态
      const loginStatus = await this.detectLoginStatus();

      // 2. 如果已登录且符合保存条件，自动保存
      if (loginStatus.loggedIn && this.shouldSaveCookies()) {
        console.log('💾 检测到登录状态，执行自动保存...');
        const saveResult = await this.autoSaveCookies();

        if (saveResult) {
          this.lastSaveTime = Date.now();
          console.log('✅ Cookie自动保存成功');
        }

        return {
          success: true,
          action: 'detected-and-saved',
          loginStatus,
          saveResult: saveResult
        };
      }

      return {
        success: true,
        action: 'detected-no-save',
        loginStatus,
        reason: loginStatus.loggedIn ? 'cooldown' : 'not-logged-in'
      };

    } catch (error) {
      console.error('❌ 登录检测和保存失败:', error.message);
      return {
        success: false,
        action: 'failed',
        error: error.message
      };
    }
  }

  /**
   * 原子操作：强制清理和重新初始化
   * 用于处理Cookie失效或状态异常的情况
   */
  async forceResetAndReinject() {
    console.log('🔄 强制重置和重新注入原子操作...');

    try {
      // 1. 清理现有资源
      await this.cleanup();

      // 2. 重置状态
      this.operationState = 'reset';
      this.lastInjectionTime = 0;
      this.lastSaveTime = 0;

      // 3. 重新初始化和注入
      const result = await this.initializeAndInject();

      return {
        success: true,
        action: 'reset-and-reinjected',
        result
      };

    } catch (error) {
      console.error('❌ 强制重置失败:', error.message);
      return {
        success: false,
        action: 'failed',
        error: error.message
      };
    }
  }

  // ========== 内部辅助方法 ==========

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

    if (this.config.verbose) {
      this.page.on('console', msg => console.log(`📄 [页面] ${msg.text()}`));
      this.page.on('pageerror', error => console.warn(`⚠️ [页面错误] ${error.message}`));
    }

    if (this.config.verbose) {
      console.log('🌐 浏览器初始化完成');
    }
  }

  /**
   * 强制注入Cookie
   */
  async forceInjectCookies() {
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

      // 处理包装格式的cookie文件
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

      // 过滤只保留必需的Cookie
      const essentialCookies = cookies.filter(cookie =>
        cookie.name && cookie.value && cookie.domain && this.essentialCookies.includes(cookie.name)
      );

      if (essentialCookies.length === 0) {
        return {
          success: false,
          error: '未找到必需的认证Cookie',
          injected: 0
        };
      }

      await this.context.addCookies(essentialCookies);
      this.lastInjectionTime = Date.now();

      if (this.config.verbose) {
        console.log(`✅ Cookie强制注入成功: ${essentialCookies.length} 个Cookie`);
        console.log(`🍪 注入的Cookie: ${essentialCookies.map(c => c.name).join(', ')}`);
      }

      return {
        success: true,
        injected: essentialCookies.length,
        cookies: essentialCookies
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
   * 验证注入结果
   */
  async verifyInjection() {
    try {
      const cookies = await this.context.cookies();
      const hasEssentialCookies = this.essentialCookies.some(name =>
        cookies.some(cookie => cookie.name === name)
      );

      return {
        success: hasEssentialCookies,
        cookieCount: cookies.length,
        essentialCookieCount: this.essentialCookies.filter(name =>
          cookies.some(cookie => cookie.name === name)
        ).length,
        hasEssentialCookies
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        cookieCount: 0,
        essentialCookieCount: 0,
        hasEssentialCookies: false
      };
    }
  }

  /**
   * 检查Cookie状态
   */
  async checkCookieStatus() {
    try {
      const cookies = await this.context.cookies();
      const hasEssentialCookies = this.essentialCookies.some(name =>
        cookies.some(cookie => cookie.name === name)
      );

      // 简单的页面导航测试
      await this.page.goto('https://weibo.com', {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(this.config.timeout, 10000)
      });

      await this.page.waitForTimeout(2000);

      const currentUrl = this.page.url();
      const title = await this.page.title();
      const isLoginPage = currentUrl.includes('newlogin') || title.includes('登录');

      return {
        valid: hasEssentialCookies && !isLoginPage,
        hasEssentialCookies,
        cookieCount: cookies.length,
        currentPage: currentUrl,
        pageTitle: title,
        isLoginPage
      };

    } catch (error) {
      return {
        valid: false,
        hasEssentialCookies: false,
        cookieCount: 0,
        error: error.message
      };
    }
  }

  /**
   * 检测登录状态
   */
  async detectLoginStatus() {
    try {
      const result = await this.page.evaluate(() => {
        // 检测头像元素
        const avatarSelectors = [
          'img[class*="Ctrls_avatar"]',
          '.Ctrls_avatar_3Hf0X',
          '.Ctrls_icon_2mxB4 img',
          'img[class*="Ctrls_icon"]',
          'img[alt*="profile"][class*="Ctrls"]'
        ];

        let foundAvatar = null;
        const results = {};

        avatarSelectors.forEach(selector => {
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

              if (!foundAvatar && visible[0].src && visible[0].src.includes('tvax1.sinaimg.cn')) {
                foundAvatar = visible[0];
              }
            }
          } catch (e) {
            // 忽略选择器错误
          }
        });

        // 检查页面标题和URL
        const title = document.title;
        const url = window.location.href;
        const hasValidTitle = title && !title.includes('登录') && !title.includes('Login');
        const hasValidUrl = url && !url.includes('newlogin') && !url.includes('login');

        return {
          foundAvatar: !!foundAvatar,
          hasValidTitle,
          hasValidUrl,
          isLoggedIn: !!foundAvatar && hasValidTitle && hasValidUrl,
          avatarInfo: foundAvatar ? {
            src: foundAvatar.src,
            alt: foundAvatar.alt,
            className: foundAvatar.className
          } : null,
          detectionResults: results
        };
      });

      return result;

    } catch (error) {
      return {
        foundAvatar: false,
        hasValidTitle: false,
        hasValidUrl: false,
        isLoggedIn: false,
        error: error.message
      };
    }
  }

  /**
   * 自动保存Cookie
   */
  async autoSaveCookies() {
    try {
      const cookies = await this.context.cookies();

      // 只保存必需的Cookie
      const essentialCookiesOnly = cookies.filter(cookie =>
        cookie.name && cookie.value && cookie.domain && this.essentialCookies.includes(cookie.name)
      );

      if (essentialCookiesOnly.length === 0) {
        console.warn('⚠️ 没有找到必需的Cookie需要保存');
        return false;
      }

      // 确保目录存在
      const cookieDir = path.dirname(this.config.cookieFile);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // 保存Cookie
      fs.writeFileSync(this.config.cookieFile, JSON.stringify(essentialCookiesOnly, null, 2));

      if (this.config.verbose) {
        console.log(`✅ Cookie自动保存完成`);
        console.log(`   保存路径: ${this.config.cookieFile}`);
        console.log(`   Cookie数量: ${essentialCookiesOnly.length}`);
        console.log(`   保存的Cookie: ${essentialCookiesOnly.map(c => c.name).join(', ')}`);
      }

      return true;

    } catch (error) {
      console.error('❌ Cookie自动保存失败:', error.message);
      return false;
    }
  }

  /**
   * 判断是否应该保存Cookie
   */
  shouldSaveCookies() {
    const now = Date.now();
    const saveCooldown = 30000; // 30秒冷却时间
    return now - this.lastSaveTime > saveCooldown;
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

    this.operationState = 'cleaned';

    if (this.config.verbose) {
      console.log('🧹 浏览器绑定Cookie原子操作资源已清理');
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      operationState: this.operationState,
      lastInjectionTime: this.lastInjectionTime,
      lastSaveTime: this.lastSaveTime,
      hasBrowser: !!this.browser,
      hasContext: !!this.context,
      hasPage: !!this.page
    };
  }
}

/**
 * 便利函数：创建并初始化浏览器绑定Cookie原子操作
 */
async function createBrowserBoundCookieOperation(config = {}) {
  const operation = new BrowserBoundCookieOperation(config);

  try {
    const result = await operation.initializeAndInject();

    console.log('🎉 浏览器绑定Cookie原子操作创建成功！');
    console.log(`✅ 操作状态: ${result.state}`);
    console.log(`✅ 注入Cookie: ${result.injectionResult.injected} 个`);
    console.log(`✅ 浏览器已就绪`);

    return {
      ...result,
      operation
    };

  } catch (error) {
    console.error('❌ 浏览器绑定Cookie原子操作创建失败:', error.message);
    throw error;
  }
}

module.exports = {
  BrowserBoundCookieOperation,
  createBrowserBoundCookieOperation
};

// 命令行执行
if (require.main === module) {
  (async () => {
    console.log('🧪 浏览器绑定Cookie自动注入原子操作测试');
    console.log('='.repeat(50));

    try {
      const result = await createBrowserBoundCookieOperation({
        verbose: true,
        headless: false,
        forceInjection: true,
        autoSaveOnLogin: true
      });

      console.log('\n📋 创建结果:');
      console.log(`✅ 成功: ${result.success}`);
      console.log(`✅ 状态: ${result.state}`);
      console.log(`✅ 注入数量: ${result.injectionResult.injected}`);

      // 测试状态检查
      console.log('\n🔄 测试状态检查...');
      const statusResult = await result.operation.checkAndRefreshCookies();
      console.log(`✅ 状态检查: ${statusResult.success ? '通过' : '失败'}`);

      console.log('\n📱 浏览器保持打开状态供检查...');
      console.log('⚠️ 按 Ctrl+C 退出程序');

    } catch (error) {
      console.error('\n💥 测试失败:', error.message);
      process.exit(1);
    }
  })();
}