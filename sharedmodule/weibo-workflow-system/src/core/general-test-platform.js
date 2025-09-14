/**
 * 通用测试平台模块
 * 支持Cookie加载和多种测试场景
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { WeiboHomepageLinkExtractionSystem } = require('../config/weibo-homepage-link-extraction-config');

/**
 * 测试配置模板
 */
const TestConfigTemplates = {
  // 微博主页链接提取测试
  weiboHomepageLinkExtraction: {
    name: '微博主页链接提取测试',
    description: '测试微博主页链接提取功能',
    url: 'https://weibo.com',
    cookieFile: './cookies/weibo-cookies.json',
    enablePagination: true,
    headless: false,
    timeout: 60000,
    screenshotOnFailure: true,
    saveResults: true,
    resultsFile: './test-results/weibo-homepage-links.json'
  },

  // 微博搜索链接提取测试
  weiboSearchLinkExtraction: {
    name: '微博搜索链接提取测试',
    description: '测试微博搜索页面链接提取功能',
    url: 'https://weibo.com/search',
    cookieFile: './cookies/weibo-cookies.json',
    enablePagination: true,
    headless: false,
    timeout: 60000,
    screenshotOnFailure: true,
    saveResults: true,
    resultsFile: './test-results/weibo-search-links.json'
  },

  // 通用网站链接提取测试
  generalWebsiteLinkExtraction: {
    name: '通用网站链接提取测试',
    description: '测试通用网站链接提取功能',
    url: '', // 需要手动指定
    cookieFile: './cookies/general-cookies.json',
    enablePagination: false,
    headless: false,
    timeout: 30000,
    screenshotOnFailure: true,
    saveResults: true,
    resultsFile: './test-results/general-links.json'
  }
};

/**
 * 通用测试平台类
 */
class GeneralTestPlatform {
  constructor(config = {}) {
    this.config = {
      ...config,
      // 默认配置
      headless: false,
      timeout: 30000,
      screenshotOnFailure: true,
      saveResults: true,
      resultsDir: './test-results',
      cookieDir: './cookies',
      enableLogging: true
    };

    this.browser = null;
    this.context = null;
    this.page = null;
    this.testResults = [];
  }

  /**
   * 初始化测试平台
   */
  async initialize() {
    try {
      console.log('🚀 初始化测试平台...');

      // 创建必要的目录
      await this.createDirectories();

      // 启动浏览器
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

      // 创建浏览器上下文
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      });

      // 创建页面
      this.page = await this.context.newPage();

      // 设置页面超时
      this.page.setDefaultTimeout(this.config.timeout);

      console.log('✅ 测试平台初始化完成');

    } catch (error) {
      console.error('❌ 测试平台初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建必要的目录
   */
  async createDirectories() {
    const directories = [
      this.config.resultsDir,
      this.config.cookieDir,
      path.join(this.config.resultsDir, 'screenshots'),
      path.join(this.config.resultsDir, 'logs')
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // 忽略目录已存在的错误
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  /**
   * 加载Cookie
   */
  async loadCookies(cookieFile = null) {
    try {
      const cookieFilePath = cookieFile || this.config.cookieFile;
      
      if (!cookieFilePath) {
        console.log('⚠️ 未指定Cookie文件，跳过Cookie加载');
        return;
      }

      console.log('🍪 加载Cookie文件:', cookieFilePath);

      // 读取Cookie文件
      const cookieData = await fs.readFile(cookieFilePath, 'utf8');
      const cookies = JSON.parse(cookieData);

      // 添加Cookie到页面
      await this.context.addCookies(cookies);

      console.log('✅ Cookie加载完成，共加载', cookies.length, '个Cookie');

    } catch (error) {
      console.error('❌ Cookie加载失败:', error);
      console.log('⚠️ 将继续执行，但可能需要手动登录');
    }
  }

  /**
   * 保存Cookie
   */
  async saveCookies(cookieFile = null) {
    try {
      const cookieFilePath = cookieFile || this.config.cookieFile;
      
      if (!cookieFilePath) {
        console.log('⚠️ 未指定Cookie文件，跳过Cookie保存');
        return;
      }

      console.log('💾 保存Cookie到文件:', cookieFilePath);

      // 获取当前页面的Cookie
      const cookies = await this.context.cookies();

      // 保存Cookie到文件
      await fs.writeFile(cookieFilePath, JSON.stringify(cookies, null, 2));

      console.log('✅ Cookie保存完成，共保存', cookies.length, '个Cookie');

    } catch (error) {
      console.error('❌ Cookie保存失败:', error);
    }
  }

  /**
   * 截图
   */
  async takeScreenshot(name = 'screenshot') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}-${timestamp}.png`;
      const filepath = path.join(this.config.resultsDir, 'screenshots', filename);

      await this.page.screenshot({ path: filepath, fullPage: true });
      
      console.log('📸 截图已保存:', filepath);
      return filepath;

    } catch (error) {
      console.error('❌ 截图失败:', error);
    }
  }

  /**
   * 记录日志
   */
  async log(message, level = 'info') {
    if (!this.config.enableLogging) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      url: this.page ? this.page.url() : 'N/A'
    };

    this.testResults.push(logEntry);
    
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }

  /**
   * 等待手动登录
   */
  async waitForManualLogin(timeout = 120000) {
    try {
      console.log('🔐 等待手动登录...');
      console.log('请在浏览器中完成登录，然后按Enter键继续');

      // 给用户时间登录
      await new Promise(resolve => {
        const stdin = process.stdin;
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', () => {
          stdin.setRawMode(false);
          stdin.pause();
          resolve();
        });
      });

      console.log('✅ 登录完成');

      // 保存登录后的Cookie
      await this.saveCookies();

    } catch (error) {
      console.error('❌ 手动登录等待失败:', error);
      throw error;
    }
  }

  /**
   * 执行微博主页链接提取测试
   */
  async runWeiboHomepageLinkExtractionTest(options = {}) {
    const testConfig = {
      ...TestConfigTemplates.weiboHomepageLinkExtraction,
      ...options
    };

    const testResult = {
      name: testConfig.name,
      startTime: new Date().toISOString(),
      steps: [],
      success: false,
      error: null,
      results: null
    };

    try {
      await this.log(`开始测试: ${testConfig.name}`);

      // 步骤1: 导航到微博主页
      await this.log('步骤1: 导航到微博主页');
      await this.page.goto(testConfig.url, { 
        waitUntil: 'networkidle',
        timeout: testConfig.timeout 
      });
      testResult.steps.push({ step: '导航', success: true });

      // 步骤2: 加载Cookie
      if (testConfig.cookieFile) {
        await this.log('步骤2: 加载Cookie');
        await this.loadCookies(testConfig.cookieFile);
        testResult.steps.push({ step: '加载Cookie', success: true });
      }

      // 步骤3: 检查登录状态
      await this.log('步骤3: 检查登录状态');
      const isLoggedIn = await this.checkLoginStatus();
      
      if (!isLoggedIn) {
        await this.log('未登录，等待手动登录', 'warning');
        await this.waitForManualLogin();
      }
      testResult.steps.push({ step: '检查登录状态', success: true });

      // 步骤4: 创建链接提取系统
      await this.log('步骤4: 创建链接提取系统');
      const linkExtractionSystem = new WeiboHomepageLinkExtractionSystem();
      linkExtractionSystem.buildAtomicOperations();
      linkExtractionSystem.buildCompositeOperations();
      testResult.steps.push({ step: '创建系统', success: true });

      // 步骤5: 执行链接提取
      await this.log('步骤5: 执行链接提取');
      const extractionResult = await linkExtractionSystem.execute(this.page, {
        enablePagination: testConfig.enablePagination
      });
      testResult.steps.push({ step: '链接提取', success: extractionResult.success });

      // 步骤6: 保存结果
      if (extractionResult.success && testConfig.saveResults) {
        await this.log('步骤6: 保存结果');
        await this.saveTestResults(testConfig.resultsFile, extractionResult);
        testResult.steps.push({ step: '保存结果', success: true });
      }

      testResult.success = extractionResult.success;
      testResult.results = extractionResult;

      await this.log(`测试完成: ${testConfig.name}`, extractionResult.success ? 'info' : 'error');

    } catch (error) {
      testResult.success = false;
      testResult.error = error.message;
      
      await this.log(`测试失败: ${error.message}`, 'error');
      
      if (testConfig.screenshotOnFailure) {
        await this.takeScreenshot('weibo-homepage-test-failure');
      }
    }

    testResult.endTime = new Date().toISOString();
    return testResult;
  }

  /**
   * 检查登录状态
   */
  async checkLoginStatus() {
    try {
      // 检查是否有登录按钮
      const loginButton = await this.page.$('a[href*="login"], .login, .signin');
      if (loginButton) {
        return false;
      }

      // 检查是否有用户信息元素
      const userInfo = await this.page.$('.user-info, .profile, .user-avatar, .username');
      if (userInfo) {
        return true;
      }

      // 检查页面URL是否包含登录相关关键词
      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        return false;
      }

      return true;

    } catch (error) {
      console.error('❌ 检查登录状态失败:', error);
      return false;
    }
  }

  /**
   * 保存测试结果
   */
  async saveTestResults(filename, results) {
    try {
      const filepath = path.join(this.config.resultsDir, filename);
      const data = {
        testTime: new Date().toISOString(),
        results: results,
        config: this.config
      };

      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
      console.log('📊 测试结果已保存:', filepath);

    } catch (error) {
      console.error('❌ 保存测试结果失败:', error);
    }
  }

  /**
   * 批量测试
   */
  async runBatchTests(testConfigs = []) {
    const results = [];

    for (const testConfig of testConfigs) {
      try {
        console.log(`\n🔄 执行测试: ${testConfig.name}`);
        
        let result;
        if (testConfig.type === 'weibo-homepage-link-extraction') {
          result = await this.runWeiboHomepageLinkExtractionTest(testConfig);
        } else {
          throw new Error(`不支持的测试类型: ${testConfig.type}`);
        }

        results.push(result);

        // 测试间隔
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.error(`❌ 测试失败: ${testConfig.name}`, error);
        results.push({
          name: testConfig.name,
          success: false,
          error: error.message,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        });
      }
    }

    return results;
  }

  /**
   * 生成测试报告
   */
  async generateTestReport(results, filename = 'test-report.json') {
    try {
      const report = {
        generatedAt: new Date().toISOString(),
        totalTests: results.length,
        passedTests: results.filter(r => r.success).length,
        failedTests: results.filter(r => !r.success).length,
        tests: results
      };

      const filepath = path.join(this.config.resultsDir, filename);
      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      
      console.log('📋 测试报告已生成:', filepath);
      return filepath;

    } catch (error) {
      console.error('❌ 生成测试报告失败:', error);
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      
      if (this.context) {
        await this.context.close();
      }
      
      if (this.browser) {
        await this.browser.close();
      }

      console.log('🧹 测试平台资源清理完成');

    } catch (error) {
      console.error('❌ 清理资源失败:', error);
    }
  }
}

/**
 * 快速测试函数
 */
async function quickTestWeiboHomepage() {
  const platform = new GeneralTestPlatform();
  
  try {
    await platform.initialize();
    const result = await platform.runWeiboHomepageLinkExtractionTest();
    console.log('\n📊 测试结果:', result.success ? '✅ 成功' : '❌ 失败');
    return result;
  } finally {
    await platform.cleanup();
  }
}

module.exports = {
  GeneralTestPlatform,
  TestConfigTemplates,
  quickTestWeiboHomepage
};