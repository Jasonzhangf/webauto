#!/usr/bin/env node

/**
 * 微博Cookie管理器
 * 用于更新和管理微博Cookie
 */

const puppeteer = require('puppeteer-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');

class CookieManager {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    console.log('🚀 初始化Cookie管理器...');

    try {
      // 创建目录结构
      await fs.mkdir('./cookies', { recursive: true });

      // 使用stealth插件
      puppeteer.use(stealth());

      // 启动浏览器
      console.log('🌐 启动浏览器...');
      this.browser = await puppeteer.launch({
        headless: false, // 可视化模式便于手动登录
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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

      // 创建页面
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1920, height: 1080 });

      // 设置用户代理
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      console.log('✓ 浏览器启动成功');
      return true;
    } catch (error) {
      console.error('✗ 初始化失败:', error.message);
      return false;
    }
  }

  async updateCookies() {
    console.log('\n🍪 开始更新Cookie...');

    try {
      // 导航到微博首页
      console.log('📍 导航到微博首页...');
      await this.page.goto('https://weibo.com', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 5000));

      // 检查当前登录状态
      const isLoggedIn = await this.checkLoginStatus();

      if (!isLoggedIn) {
        console.log('⚠️ 未登录状态，请手动完成微博登录');
        console.log('📋 请在浏览器中完成登录，登录成功后按Enter继续...');

        // 等待用户登录
        await this.waitForUserLogin();

        // 重新检查登录状态
        const recheckedStatus = await this.checkLoginStatus();
        if (!recheckedStatus) {
          throw new Error('登录验证失败');
        }
      }

      // 保存Cookie
      await this.saveCookies();
      console.log('✓ Cookie更新完成');

      return true;
    } catch (error) {
      console.error('✗ Cookie更新失败:', error.message);
      return false;
    }
  }

  async checkLoginStatus() {
    try {
      // 检查多个可能的登录状态指示器
      const loginSelectors = [
        '.gn_header_list', // 登录后的用户菜单
        '.gn_nav_list', // 导航菜单
        '[node-type="search"]', // 搜索框（登录后可见）
        '.S_bg2', // 登录后的背景样式
        '.woo-box-flex.woo-box-alignCenter.Nav_main_3yW4v', // 新版导航栏
        '.woo-box-flex.woo-box-alignCenter.Feed_body_3T0Up', // 微博内容区域
        '.gn_set_list', // 设置菜单
        '.gn_position', // 个人位置信息
        '.S_txt1', // 登录后的文本样式
        '.woo-box-flex.woo-box-alignCenter.woo-box-spaceBetween' // 登录后的布局
      ];

      for (const selector of loginSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            console.log(`✓ 检测到登录状态指示器: ${selector}`);
            return true;
          }
        } catch {
          continue;
        }
      }

      // 检查是否是登录页面
      const loginPageSelectors = [
        '.guest_login', // 游客登录
        '.login_box', // 登录框
        '[node-type="loginForm"]', // 登录表单
        '.woo-pop-main.woo-modal-ctrl', // 登录弹窗
        '.W_login_form', // 微博登录表单
        '.WB_login_form', // 微博登录表单
        '.LoginTopNav_box', // 新版登录导航
        '.Frame_wrap' // 新版登录框架
      ];

      for (const selector of loginPageSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            console.log(`⚠️ 检测到登录页面元素: ${selector}`);
            return false;
          }
        } catch {
          continue;
        }
      }

      // 尝试通过页面内容判断
      const pageContent = await this.page.evaluate(() => {
        return document.body.innerText;
      });

      if (pageContent.includes('登录') || pageContent.includes('登录微博')) {
        console.log('⚠️ 页面包含登录相关内容，假设未登录');
        return false;
      }

      console.log('⚠️ 无法确定登录状态，假设未登录');
      return false;

    } catch (error) {
      console.error('登录状态检查失败:', error.message);
      return false;
    }
  }

  async waitForUserLogin() {
    // 使用简单的等待方式
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('📋 请在浏览器中完成微博登录，登录成功后按Enter继续...', () => {
        rl.close();
        resolve();
      });
    });
  }

  async saveCookies() {
    try {
      const cookies = await this.page.cookies();
      const cookiePath = './cookies/weibo-cookies.json';

      await fs.writeFile(cookiePath, JSON.stringify(cookies, null, 2));
      console.log(`✓ Cookie已保存到: ${cookiePath}`);
      console.log(`📁 保存了 ${cookies.length} 个Cookie`);

      // 显示Cookie概要信息
      const weiboCookies = cookies.filter(c => c.domain.includes('weibo.com'));
      console.log(`🔍 微博相关Cookie: ${weiboCookies.length} 个`);

      weiboCookies.forEach(cookie => {
        console.log(`  - ${cookie.name}: ${cookie.value ? '已设置' : '未设置'}`);
      });

    } catch (error) {
      console.error('Cookie保存失败:', error.message);
      throw error;
    }
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      console.log('✓ 浏览器已关闭');
    } catch (error) {
      console.warn('浏览器关闭失败:', error.message);
    }
  }

  async run() {
    console.log('🍪 微博Cookie管理器');
    console.log('═'.repeat(50));

    // 初始化
    if (!await this.initialize()) {
      return false;
    }

    try {
      // 更新Cookie
      const success = await this.updateCookies();

      if (success) {
        console.log('\n✅ Cookie更新成功！');
        console.log('📝 现在可以重新运行测试脚本了');
        return true;
      } else {
        console.log('\n❌ Cookie更新失败');
        return false;
      }
    } catch (error) {
      console.error('运行过程发生错误:', error);
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// 运行Cookie管理器
if (require.main === module) {
  const manager = new CookieManager();
  manager.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Cookie管理器运行失败:', error);
      process.exit(1);
    });
}

module.exports = CookieManager;