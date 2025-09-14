/**
 * Cookie Management System Integration Test
 * Tests integration with atomic operations and real Weibo homepage extraction
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import { AtomicOperationFactory } from '../weibo-workflow-system/src/core/atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CookieSystemIntegrationTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.results = {
      tests: [],
      startTime: new Date().toISOString(),
      endTime: null,
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化Cookie管理系统集成测试...');
    
    // Initialize cookie system
    this.cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, '../test-cookies'),
      encryptionEnabled: false, // Disable encryption for testing
      autoRefresh: false,
      validationEnabled: true
    });
    
    await this.cookieSystem.initialize();
    
    // Initialize browser
    this.browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    console.log('✅ 测试环境初始化完成');
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 运行测试: ${testName}`);
    const startTime = Date.now();
    
    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      const testResult = {
        name: testName,
        passed: true,
        duration,
        result,
        error: null
      };
      
      this.results.tests.push(testResult);
      this.results.summary.passed++;
      this.results.summary.total++;
      
      console.log(`✅ ${testName} 通过 (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const testResult = {
        name: testName,
        passed: false,
        duration,
        result: null,
        error: error.message
      };
      
      this.results.tests.push(testResult);
      this.results.summary.failed++;
      this.results.summary.total++;
      
      console.log(`❌ ${testName} 失败: ${error.message} (${duration}ms)`);
      throw error;
    }
  }

  async testCookieSystemBasic() {
    // Test basic cookie system functionality
    const stats = this.cookieSystem.getCookieStats();
    console.log(`📊 Cookie系统统计: ${JSON.stringify(stats, null, 2)}`);
    
    // Test validation
    const testCookie = {
      name: 'test_cookie',
      value: 'test_value',
      domain: 'test.com',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax'
    };
    
    const health = await this.cookieSystem.validateCookieHealth('test.com', [testCookie]);
    console.log(`🔍 Cookie健康检查: ${JSON.stringify(health, null, 2)}`);
    
    return { stats, health };
  }

  async testCookieStorage() {
    // Test cookie storage operations
    const testCookies = [
      {
        name: 'session_token',
        value: 'abc123',
        domain: 'example.com',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict'
      },
      {
        name: 'user_pref',
        value: 'dark_mode',
        domain: 'example.com',
        path: '/',
        expires: Date.now() / 1000 + 86400, // 1 day
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      }
    ];
    
    // Store cookies
    const stored = await this.cookieSystem.manager.storage.storeCookies('example.com', testCookies);
    console.log(`💾 Cookie存储结果: ${stored}`);
    
    // Load cookies
    const loaded = await this.cookieSystem.manager.storage.loadCookies('example.com');
    console.log(`📂 Cookie加载结果: ${loaded.length} 个`);
    
    // Get domains
    const domains = await this.cookieSystem.manager.storage.listDomains();
    console.log(`🌐 存储的域名: ${domains.join(', ')}`);
    
    return { stored, loadedCount: loaded.length, domains };
  }

  async testWeiboCookieIntegration() {
    // Test loading existing Weibo cookies
    const weiboCookiePath = path.join(__dirname, '../weibo-workflow-system/cookies/weibo.com.json');
    
    try {
      // Import existing cookies
      const imported = await this.cookieSystem.manager.importCookies('weibo.com', weiboCookiePath);
      console.log(`📥 Weibo Cookie导入结果: ${imported}`);
      
      if (imported) {
        // Validate health
        const health = await this.cookieSystem.validateCookieHealth('weibo.com');
        console.log(`🏥 Weibo Cookie健康状态: ${JSON.stringify(health, null, 2)}`);
        
        // Try to load cookies to page
        const loaded = await this.cookieSystem.loadCookies(this.page, 'weibo.com');
        console.log(`🍪 Cookie页面加载结果: ${loaded}`);
        
        // Visit Weibo to test login
        if (loaded) {
          console.log('🌐 访问微博主页测试登录状态...');
          await this.page.goto('https://weibo.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 15000 
          });
          
          await this.page.waitForTimeout(3000);
          
          const title = await this.page.title();
          const url = this.page.url();
          console.log(`📄 页面标题: ${title}`);
          console.log(`🔗 当前URL: ${url}`);
          
          // Check if logged in
          const isLoggedIn = await this.checkLoginStatus();
          console.log(`🔐 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
          
          return { imported, health, loaded, isLoggedIn, title, url };
        }
      }
      
      return { imported, health: null, loaded: false, isLoggedIn: false };
    } catch (error) {
      console.error('❌ Weibo Cookie集成测试失败:', error.message);
      return { imported: false, error: error.message };
    }
  }

  async testAtomicOperationsWithCookies() {
    // Test atomic operations with cookie authentication
    console.log('🔬 测试原子操作与Cookie认证集成...');
    
    // Try to extract links from Weibo homepage if logged in
    if (await this.checkLoginStatus()) {
      const linkExtractor = AtomicOperationFactory.createOperation('element.attribute', {
        selector: 'a[href*="/status/"]',
        attribute: 'href',
        multiple: true,
        timeout: 10000,
        filter: (href) => href && href.includes('/status/') && href.startsWith('http')
      });
      
      console.log('🔍 提取微博帖子链接...');
      const result = await linkExtractor.execute(this.page);
      
      console.log(`📊 链接提取结果: ${result.success ? '成功' : '失败'}`);
      if (result.success) {
        console.log(`📋 找到 ${result.result.length} 个链接`);
      }
      
      return result;
    } else {
      console.log('⚠️ 未登录，跳过原子操作测试');
      return { success: false, reason: 'Not logged in' };
    }
  }

  async checkLoginStatus() {
    try {
      // Check for login indicators
      const selectors = [
        '.gn_name',
        '.S_txt1', 
        '.username',
        '[data-usercard*="true"]',
        'a[href*="/home"]'
      ];
      
      for (const selector of selectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim().length > 0) {
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
    
    if (this.cookieSystem) {
      await this.cookieSystem.shutdown();
    }
  }

  async run() {
    try {
      await this.initialize();
      
      console.log('🧪 开始Cookie管理系统集成测试...');
      console.log('='.repeat(60));
      
      // Run tests
      await this.runTest('Cookie系统基本功能', () => this.testCookieSystemBasic());
      await this.runTest('Cookie存储操作', () => this.testCookieStorage());
      await this.runTest('Weibo Cookie集成', () => this.testWeiboCookieIntegration());
      await this.runTest('原子操作与Cookie认证', () => this.testAtomicOperationsWithCookies());
      
      // Print summary
      this.results.endTime = new Date().toISOString();
      console.log('='.repeat(60));
      console.log('🎉 Cookie管理系统集成测试完成！');
      console.log(`📊 测试摘要:`);
      console.log(`   - 总测试数: ${this.results.summary.total}`);
      console.log(`   - 通过: ${this.results.summary.passed}`);
      console.log(`   - 失败: ${this.results.summary.failed}`);
      console.log(`   - 成功率: ${((this.results.summary.passed / this.results.summary.total) * 100).toFixed(1)}%`);
      
      return this.results;
    } catch (error) {
      console.error('❌ 测试套件失败:', error.message);
      return {
        success: false,
        error: error.message,
        results: this.results
      };
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests
const test = new CookieSystemIntegrationTest();
test.run().then((results) => {
  if (results.summary.failed === 0) {
    console.log('✅ 所有测试通过！');
    process.exit(0);
  } else {
    console.log('❌ 部分测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 测试异常:', error);
  process.exit(1);
});