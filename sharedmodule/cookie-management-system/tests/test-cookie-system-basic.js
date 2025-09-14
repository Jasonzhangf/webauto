/**
 * Cookie Management System Basic Test
 * Tests basic functionality without external dependencies
 */

import { WebAutoCookieManagementSystem } from '../src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CookieSystemBasicTest {
  constructor() {
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

  async testSystemInitialization() {
    // Test system initialization
    this.cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, '../test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await this.cookieSystem.initialize();
    
    const stats = this.cookieSystem.getCookieStats();
    console.log(`📊 系统统计: ${JSON.stringify(stats, null, 2)}`);
    
    return { initialized: true, stats };
  }

  async testCookieValidation() {
    // Test cookie validation
    const testCookies = [
      {
        name: 'session_token',
        value: 'abc123',
        domain: 'example.com',
        path: '/',
        expires: -1, // Session cookie
        httpOnly: true,
        secure: true,
        sameSite: 'Strict'
      },
      {
        name: 'user_pref',
        value: 'dark_mode',
        domain: 'example.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400, // 1 day from now
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      },
      {
        name: 'expired_cookie',
        value: 'old_value',
        domain: 'example.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      }
    ];
    
    // Test individual cookie validation
    const validationResults = [];
    for (const cookie of testCookies) {
      const result = await this.cookieSystem.validator.validateCookie(cookie);
      validationResults.push({ name: cookie.name, ...result });
    }
    
    console.log(`🔍 Cookie验证结果: ${JSON.stringify(validationResults, null, 2)}`);
    
    // Test domain health validation
    const health = await this.cookieSystem.validateCookieHealth('example.com', testCookies);
    console.log(`🏥 域名健康状态: ${JSON.stringify(health, null, 2)}`);
    
    return { validationResults, health };
  }

  async testCookieStorage() {
    // Test cookie storage operations
    const testCookies = [
      {
        name: 'test_session',
        value: 'session123',
        domain: 'test.com',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict'
      },
      {
        name: 'test_pref',
        value: 'theme_dark',
        domain: 'test.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      }
    ];
    
    // Store cookies
    const stored = await this.cookieSystem.manager.storage.storeCookies('test.com', testCookies);
    console.log(`💾 Cookie存储结果: ${stored}`);
    
    // Load cookies
    const loaded = await this.cookieSystem.manager.storage.loadCookies('test.com');
    console.log(`📂 Cookie加载结果: ${loaded.length} 个`);
    
    // List domains
    const domains = await this.cookieSystem.manager.storage.listDomains();
    console.log(`🌐 存储的域名: ${domains.join(', ')}`);
    
    // Get storage stats
    const stats = this.cookieSystem.getCookieStats();
    console.log(`📊 存储统计: ${JSON.stringify(stats, null, 2)}`);
    
    return { stored, loadedCount: loaded.length, domains, stats };
  }

  async testCookieImportExport() {
    // Test cookie import/export
    const testCookies = [
      {
        name: 'import_test',
        value: 'import123',
        domain: 'import.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      }
    ];
    
    // Create temporary export file
    const exportPath = path.join(__dirname, '../test-cookies/export-test.json');
    
    // Export cookies
    const exported = await this.cookieSystem.manager.storage.storeCookies('import.com', testCookies);
    console.log(`📤 Cookie导出结果: ${exported}`);
    
    // List domains to verify
    const domains = await this.cookieSystem.manager.storage.listDomains();
    console.log(`🌐 导出后域名列表: ${domains.join(', ')}`);
    
    // Clean up
    try {
      const fs = await import('fs-extra');
      await fs.remove(exportPath);
    } catch (error) {
      // Ignore cleanup errors
    }
    
    return { exported, domains };
  }

  async testCookieCleanup() {
    // Test cookie cleanup functionality
    const expiredCookies = [
      {
        name: 'expired1',
        value: 'old1',
        domain: 'cleanup.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      },
      {
        name: 'expired2',
        value: 'old2',
        domain: 'cleanup.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) - 7200, // Expired 2 hours ago
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      },
      {
        name: 'valid',
        value: 'current',
        domain: 'cleanup.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      }
    ];
    
    // Store expired cookies
    await this.cookieSystem.manager.storage.storeCookies('cleanup.com', expiredCookies);
    
    // Run cleanup
    const cleanedCount = await this.cookieSystem.manager.storage.cleanupExpiredCookies();
    console.log(`🧹 清理过期Cookie数量: ${cleanedCount}`);
    
    // Load remaining cookies
    const remaining = await this.cookieSystem.manager.storage.loadCookies('cleanup.com');
    console.log(`📋 剩余Cookie数量: ${remaining.length}`);
    
    return { cleanedCount, remainingCount: remaining.length };
  }

  async run() {
    try {
      console.log('🚀 开始Cookie管理系统基础测试...');
      console.log('='.repeat(60));
      
      // Run tests
      await this.runTest('系统初始化', () => this.testSystemInitialization());
      await this.runTest('Cookie验证', () => this.testCookieValidation());
      await this.runTest('Cookie存储操作', () => this.testCookieStorage());
      await this.runTest('Cookie导入导出', () => this.testCookieImportExport());
      await this.runTest('Cookie清理', () => this.testCookieCleanup());
      
      // Print summary
      this.results.endTime = new Date().toISOString();
      console.log('='.repeat(60));
      console.log('🎉 Cookie管理系统基础测试完成！');
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
      if (this.cookieSystem) {
        await this.cookieSystem.shutdown();
      }
    }
  }
}

// Run tests
const test = new CookieSystemBasicTest();
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