/**
 * Simple Cookie Loading Test
 * 简化的Cookie加载测试
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SimpleCookieLoadingTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
  }

  async initialize() {
    console.log('🚀 初始化简单Cookie加载测试...');
    
    // 初始化Cookie管理系统
    this.cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, '../test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await this.cookieSystem.initialize();
    
    // 初始化浏览器
    this.browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    console.log('✅ 测试环境初始化完成');
  }

  async loadWeiboCookies() {
    console.log('📥 加载Weibo Cookie...');
    
    const weiboCookiePath = path.join(__dirname, '../../weibo-workflow-system/cookies/weibo.com.json');
    
    try {
      // 读取Cookie文件
      const fs = await import('fs');
      const cookieData = fs.readFileSync(weiboCookiePath, 'utf8');
      const cookies = JSON.parse(cookieData);
      
      console.log(`📥 读取到 ${cookies.length} 个Cookie`);
      
      // 显示Cookie详情
      console.log('🍪 Cookie列表:');
      cookies.forEach((cookie, index) => {
        console.log(`   ${index + 1}. ${cookie.name} - ${cookie.domain} - 过期: ${cookie.expires === -1 ? '会话' : new Date(cookie.expires * 1000).toLocaleString()}`);
      });
      
      // 存储到Cookie管理系统
      const stored = await this.cookieSystem.manager.storage.storeCookies('weibo.com', cookies);
      console.log(`📥 Cookie存储结果: ${stored}`);
      
      // 验证Cookie健康状态
      const health = await this.cookieSystem.validateCookieHealth('weibo.com');
      console.log(`🏥 Cookie健康状态: ${JSON.stringify(health, null, 2)}`);
      
      return { stored, health, cookies };
    } catch (error) {
      console.error('❌ Cookie加载失败:', error.message);
      throw error;
    }
  }

  async testPageAccess() {
    console.log('🌐 测试页面访问...');
    
    try {
      // 加载Cookie到页面
      console.log('🍪 加载Cookie到页面...');
      const loaded = await this.cookieSystem.loadCookies(this.page, 'weibo.com');
      console.log(`🍪 Cookie页面加载结果: ${loaded}`);
      
      if (loaded) {
        // 访问微博主页
        console.log('🌐 访问微博主页...');
        await this.page.goto('https://weibo.com', { 
          waitUntil: 'networkidle',
          timeout: 30000 
        });
        
        await this.page.waitForTimeout(5000);
        
        // 获取页面信息
        const title = await this.page.title();
        const url = this.page.url();
        console.log(`📄 页面标题: ${title}`);
        console.log(`🔗 当前URL: ${url}`);
        
        // 检查登录状态
        const isLoggedIn = await this.checkLoginStatus();
        console.log(`🔐 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
        
        // 获取页面源码的一部分来分析
        const bodyText = await this.page.evaluate(() => document.body.innerText);
        const textLength = bodyText.length;
        console.log(`📄 页面文本长度: ${textLength} 字符`);
        
        // 查找特定的登录指示器
        const loginElements = await this.page.$$eval('a', links => {
          return links
            .filter(link => link.textContent)
            .map(link => ({
              text: link.textContent.trim(),
              href: link.href
            }))
            .filter(item => 
              item.text.includes('登录') || 
              item.text.includes('login') || 
              item.text.includes('注册') ||
              item.text.includes('Sign in')
            );
        });
        
        console.log(`🔍 登录相关元素: ${loginElements.length} 个`);
        if (loginElements.length > 0) {
          console.log('📋 登录元素详情:');
          loginElements.forEach((elem, index) => {
            console.log(`   ${index + 1}. ${elem.text} - ${elem.href}`);
          });
        }
        
        // 查找用户信息元素
        const userElements = await this.page.$$eval('*', elements => {
          return elements
            .filter(elem => elem.className && elem.className.includes('name'))
            .slice(0, 5)
            .map(elem => ({
              className: elem.className,
              text: elem.textContent ? elem.textContent.trim().substring(0, 50) : ''
            }));
        });
        
        console.log(`👤 用户信息元素: ${userElements.length} 个`);
        if (userElements.length > 0) {
          console.log('👤 用户元素详情:');
          userElements.forEach((elem, index) => {
            console.log(`   ${index + 1}. ${elem.className} - ${elem.text}`);
          });
        }
        
        return { loaded, title, url, isLoggedIn, textLength, loginElements, userElements };
      }
      
      return { loaded: false };
    } catch (error) {
      console.error('❌ 页面访问失败:', error.message);
      throw error;
    }
  }

  async checkLoginStatus() {
    try {
      // 检查各种可能的登录指示器
      const selectors = [
        '.gn_name',
        '.S_txt1', 
        '.username',
        '[data-usercard*="true"]',
        'a[href*="/home"]',
        '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA',
        '[class*="name"]'
      ];
      
      for (const selector of selectors) {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          for (const element of elements) {
            const text = await element.textContent();
            if (text && text.trim().length > 0 && text.trim().length < 50) {
              console.log(`👤 检测到用户元素: ${text.trim()}`);
              return true;
            }
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
      
      console.log('🧪 开始简单Cookie加载测试...');
      console.log('='.repeat(60));
      
      // 加载Cookie
      const cookieResult = await this.loadWeiboCookies();
      
      // 测试页面访问
      const accessResult = await this.testPageAccess();
      
      console.log('='.repeat(60));
      console.log('🎉 简单Cookie加载测试完成！');
      console.log(`📊 测试结果:`);
      console.log(`   - Cookie存储: ${cookieResult.stored ? '成功' : '失败'}`);
      console.log(`   - Cookie健康: ${cookieResult.health.isValid ? '健康' : '不健康'}`);
      console.log(`   - Cookie数量: ${cookieResult.cookies.length} 个`);
      console.log(`   - 页面加载: ${accessResult.loaded ? '成功' : '失败'}`);
      console.log(`   - 登录状态: ${accessResult.isLoggedIn ? '已登录' : '未登录'}`);
      console.log(`   - 页面标题: ${accessResult.title}`);
      console.log(`   - 页面URL: ${accessResult.url}`);
      
      return {
        success: true,
        cookieResult,
        accessResult
      };
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
const test = new SimpleCookieLoadingTest();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 简单Cookie加载测试成功');
    process.exit(0);
  } else {
    console.log('❌ 简单Cookie加载测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 测试异常:', error);
  process.exit(1);
});