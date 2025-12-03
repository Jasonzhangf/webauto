#!/usr/bin/env node

/**
 * 强制Cookie自动注入原子操作
 * 所有测试必须通过此原子操作进行Cookie验证和注入
 * 继承自BaseAtomicOperation，确保统一的操作接口
 */

const BaseAtomicOperation = require('../../../../../scripts/weibo-workflows/core/atomic-operations/base-atomic-operation.js.cjs');
const { UnifiedCookieManager } = require('../../../../unified-cookie-manager.cjs');

/**
 * 强制Cookie自动注入原子操作
 * 提供统一的Cookie验证、注入和状态管理功能
 */
class CookieAutoInjectionOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'cookie-auto-injection',
      type: 'authentication',
      description: '强制Cookie自动注入和验证原子操作',
      timeout: config.timeout || 60000,
      retryCount: config.retryCount || 2,
      retryDelay: config.retryDelay || 3000,
      ...config
    });

    // Cookie管理器配置
    this.cookieConfig = {
      cookieFile: config.cookieFile || './cookies/weibo-cookies.json',
      headless: config.headless || false,
      verbose: config.verbose !== false,
      forceLoginCheck: config.forceLoginCheck !== false,
      autoCookieSave: config.autoCookieSave !== false,
      ...config.cookieConfig
    };

    this.cookieManager = null;
    this.operationContext = null;
  }

  /**
   * 执行Cookie自动注入操作
   */
  async execute(context, params = {}) {
    const {
      action = 'verify', // verify, force-login, save-only
      navigateToUrl = 'https://weibo.com',
      waitForLogin = true,
      timeout = this.config.timeout
    } = params;

    try {
      switch (action) {
        case 'verify':
          return await this.executeCookieVerification(context, { navigateToUrl, timeout });

        case 'force-login':
          return await this.executeForceLogin(context, { navigateToUrl, waitForLogin, timeout });

        case 'save-only':
          return await this.executeSaveOnly(context);

        default:
          throw new Error(`未知的操作类型: ${action}`);
      }
    } catch (error) {
      console.error(`❌ Cookie自动注入操作失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行Cookie验证
   */
  async executeCookieVerification(context, { navigateToUrl, timeout }) {
    console.log('🔒 开始强制Cookie验证流程...');

    // 初始化Cookie管理器
    await this.initializeCookieManager(context);

    // 1. 自动注入Cookie
    const injectionResult = await this.injectCookies();
    if (!injectionResult.success) {
      throw new Error(`Cookie注入失败: ${injectionResult.error}`);
    }

    // 2. 导航到目标页面
    await this.navigateToTarget(navigateToUrl);

    // 3. 验证登录状态
    const loginResult = await this.verifyLoginStatus();

    // 4. 强制登录检查
    if (this.cookieConfig.forceLoginCheck && !loginResult.loggedIn) {
      throw new Error('强制登录检查失败：未检测到有效登录状态');
    }

    // 5. 如果已登录，自动保存Cookie
    if (loginResult.loggedIn && this.cookieConfig.autoCookieSave) {
      await this.autoSaveCookies();
    }

    console.log('✅ 强制Cookie验证完成');

    return {
      success: true,
      action: 'verify',
      injectionResult,
      loginResult,
      canProceed: loginResult.loggedIn || !this.cookieConfig.forceLoginCheck,
      cookieCount: loginResult.cookieCount,
      isLoggedIn: loginResult.loggedIn,
      executionTime: Date.now() - this.startTime
    };
  }

  /**
   * 执行强制登录
   */
  async executeForceLogin(context, { navigateToUrl, waitForLogin, timeout }) {
    console.log('🔐 启动强制登录流程...');

    // 初始化Cookie管理器（确保非headless模式）
    this.cookieConfig.headless = false;
    await this.initializeCookieManager(context);

    // 导航到微博
    await this.navigateToTarget(navigateToUrl);

    console.log('👤 请在打开的浏览器中手动登录微博...');
    console.log('⏳ 系统将自动检测登录状态...');

    // 等待用户登录
    let loginResult;
    if (waitForLogin) {
      loginResult = await this.waitForUserLogin(timeout);
    } else {
      loginResult = await this.verifyLoginStatus();
    }

    if (loginResult.loggedIn) {
      // 自动保存Cookie
      await this.autoSaveCookies();
      console.log('✅ 强制登录成功，Cookie已保存');
    } else {
      throw new Error('强制登录超时或失败');
    }

    return {
      success: true,
      action: 'force-login',
      loginResult,
      cookieCount: loginResult.cookieCount,
      isLoggedIn: loginResult.loggedIn,
      executionTime: Date.now() - this.startTime
    };
  }

  /**
   * 仅保存当前Cookie
   */
  async executeSaveOnly(context) {
    console.log('💾 执行Cookie保存操作...');

    await this.initializeCookieManager(context);
    const saveResult = await this.autoSaveCookies();

    if (!saveResult) {
      throw new Error('Cookie保存失败');
    }

    return {
      success: true,
      action: 'save-only',
      saved: true,
      executionTime: Date.now() - this.startTime
    };
  }

  /**
   * 初始化Cookie管理器
   */
  async initializeCookieManager(context) {
    if (!this.cookieManager) {
      this.cookieManager = new UnifiedCookieManager(this.cookieConfig);
      this.operationContext = context;

      // 如果上下文中有浏览器实例，直接使用
      if (context.browser && context.context && context.page) {
        this.cookieManager.browser = context.browser;
        this.cookieManager.context = context.context;
        this.cookieManager.page = context.page;
      } else {
        // 否则初始化新的浏览器实例
        await this.cookieManager.initializeBrowser();

        // 将浏览器实例保存到上下文中
        context.browser = this.cookieManager.browser;
        context.context = this.cookieManager.context;
        context.page = this.cookieManager.page;
      }
    }
  }

  /**
   * 注入Cookie
   */
  async injectCookies() {
    console.log('🍪 执行Cookie自动注入...');

    try {
      const injectionResult = await this.cookieManager.injectCookies();

      if (this.cookieConfig.verbose) {
        console.log(`✅ Cookie注入结果: ${injectionResult.success ? '成功' : '失败'}`);
        if (injectionResult.success) {
          console.log(`   - 注入数量: ${injectionResult.injected}`);
        }
      }

      return injectionResult;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        injected: 0
      };
    }
  }

  /**
   * 导航到目标页面
   */
  async navigateToTarget(url) {
    console.log(`🌐 导航到: ${url}`);

    try {
      await this.cookieManager.navigateToWeibo();

      if (this.cookieConfig.verbose) {
        console.log(`📍 当前页面: ${this.cookieManager.page.url()}`);
        console.log(`📄 页面标题: ${await this.cookieManager.page.title()}`);
      }
    } catch (error) {
      console.warn('⚠️ 页面导航出现异常，但将继续进行登录状态检查...');
    }
  }

  /**
   * 验证登录状态
   */
  async verifyLoginStatus() {
    console.log('🔍 验证登录状态...');

    try {
      const result = await this.cookieManager.verifyLoginStatus();

      if (this.cookieConfig.verbose) {
        console.log('🔍 登录状态验证结果:');
        console.log(`   - 徽章检测: ${result.isLoggedIn ? '✅ 通过' : '❌ 失败'} (${result.visibleElements} 个可见元素)`);
        console.log(`   - Cookie验证: ${result.cookieValid ? '✅ 通过' : '❌ 失败'} (${result.cookieCount} 个Cookie)`);
        console.log(`   - 综合结果: ${result.loggedIn ? '✅ 已登录' : '❌ 未登录'}`);
      }

      return result;
    } catch (error) {
      console.error('❌ 登录状态验证失败:', error.message);
      return {
        loggedIn: false,
        error: error.message,
        cookieCount: 0,
        visibleElements: 0
      };
    }
  }

  /**
   * 等待用户手动登录
   */
  async waitForUserLogin(timeout = 300000) {
    console.log('⏳ 等待用户手动登录...');

    const maxAttempts = Math.floor(timeout / 5000); // 每5秒检查一次
    const checkInterval = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await this.verifyLoginStatus();
        if (result.loggedIn) {
          return result;
        }

        if (i % 6 === 0) { // 每30秒显示一次进度
          console.log(`⏳ 等待登录中... (${Math.floor(i/6)}/${Math.floor(maxAttempts/6)} 分钟)`);
        }

        await this.cookieManager.page.waitForTimeout(checkInterval);
      } catch (error) {
        console.warn(`⚠️ 登录检查异常: ${error.message}`);
        await this.cookieManager.page.waitForTimeout(checkInterval);
      }
    }

    return {
      loggedIn: false,
      error: '登录超时'
    };
  }

  /**
   * 自动保存Cookie
   */
  async autoSaveCookies() {
    console.log('💾 执行自动Cookie保存...');

    try {
      const saveResult = await this.cookieManager.autoSaveCookies();

      if (this.cookieConfig.verbose && saveResult) {
        console.log('✅ Cookie自动保存完成');
        console.log(`   保存路径: ${this.cookieConfig.cookieFile}`);
      }

      return saveResult;
    } catch (error) {
      console.error('❌ Cookie自动保存失败:', error.message);
      return false;
    }
  }

  /**
   * 验证参数
   */
  validateParams(params) {
    const errors = [];

    if (params.action && !['verify', 'force-login', 'save-only'].includes(params.action)) {
      errors.push(`action必须是: verify, force-login, save-only`);
    }

    if (params.navigateToUrl && typeof params.navigateToUrl !== 'string') {
      errors.push('navigateToUrl必须是字符串');
    }

    if (params.timeout && (typeof params.timeout !== 'number' || params.timeout <= 0)) {
      errors.push('timeout必须是正数');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证上下文
   */
  validateContext(context) {
    // Cookie操作可以自己创建浏览器实例，所以上下文要求比较宽松
    return true;
  }

  /**
   * 执行前准备
   */
  async beforeExecute(context, params) {
    this.startTime = Date.now();
    console.log(`🚀 开始执行Cookie原子操作: ${params.action || 'verify'}`);
  }

  /**
   * 执行后处理
   */
  async afterExecute(context, params, result) {
    const executionTime = Date.now() - this.startTime;
    console.log(`✅ Cookie原子操作完成: ${result.action} (${executionTime}ms)`);

    // 将Cookie管理器状态保存到上下文中
    context.cookieManager = this.cookieManager;
    context.lastCookieResult = result;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 注意：不自动清理Cookie管理器，因为可能需要在后续操作中使用
    console.log('🧹 Cookie原子操作资源已清理');
  }

  /**
   * 获取Cookie管理器实例
   */
  getCookieManager() {
    return this.cookieManager;
  }

  /**
   * 获取当前登录状态
   */
  async getCurrentLoginStatus() {
    if (!this.cookieManager) {
      throw new Error('Cookie管理器未初始化');
    }
    return this.verifyLoginStatus();
  }
}

/**
 * 全局便利函数：执行Cookie原子操作
 * 所有测试必须调用此函数进行Cookie验证
 */
async function executeCookieAtomicOperation(params = {}, context = {}) {
  const operation = new CookieAutoInjectionOperation(params);

  try {
    const result = await operation.executeWithRetry(context, params);

    if (!result.success) {
      throw new Error(`Cookie原子操作失败: ${result.error}`);
    }

    return {
      ...result,
      operation, // 返回操作实例以便后续使用
      context // 返回更新后的上下文
    };

  } catch (error) {
    console.error('❌ Cookie原子操作执行失败:', error.message);
    throw error;
  }
}

/**
 * 强制Cookie验证便利函数
 */
async function requireCookieVerification(config = {}) {
  return executeCookieAtomicOperation({
    action: 'verify',
    ...config
  });
}

/**
 * 强制登录便利函数
 */
async function requireForceLogin(config = {}) {
  return executeCookieAtomicOperation({
    action: 'force-login',
    ...config
  });
}

module.exports = {
  CookieAutoInjectionOperation,
  executeCookieAtomicOperation,
  requireCookieVerification,
  requireForceLogin
};

// 命令行执行
if (require.main === module) {
  (async () => {
    console.log('🧪 Cookie自动注入原子操作测试');
    console.log('='.repeat(50));

    try {
      const result = await executeCookieAtomicOperation({
        action: 'verify',
        verbose: true,
        forceLoginCheck: true,
        headless: false
      });

      console.log('\n📋 测试结果:');
      console.log(`✅ 操作状态: ${result.success ? '成功' : '失败'}`);
      console.log(`✅ 登录状态: ${result.isLoggedIn ? '已登录' : '未登录'}`);
      console.log(`✅ Cookie数量: ${result.cookieCount}`);
      console.log(`✅ 可继续操作: ${result.canProceed ? '是' : '否'}`);
      console.log(`✅ 执行时间: ${result.executionTime}ms`);

      console.log('\n🎉 Cookie原子操作测试完成');

    } catch (error) {
      console.error('\n💥 测试失败:', error.message);
      process.exit(1);
    }
  })();
}