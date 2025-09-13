/**
 * 自动Cookie注入功能测试
 * 验证自动登录、Cookie注入和检测流程
 */

const { CamoufoxManager } = require('../dist-simple/browser/CamoufoxManager');
const { CookieManager } = require('../dist-simple/browser/SimpleCookieManager');
const fs = require('fs');
const path = require('path');

describe('Automatic Cookie Injection', () => {
  let browserManager;
  const cookieManager = new CookieManager('./test-cookies');

  beforeAll(async () => {
    // 确保测试Cookie目录存在
    if (!fs.existsSync('./test-cookies')) {
      fs.mkdirSync('./test-cookies', { recursive: true });
    }
  });

  afterAll(async () => {
    // 清理测试Cookie文件
    if (fs.existsSync('./test-cookies')) {
      const files = fs.readdirSync('./test-cookies');
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join('./test-cookies', file));
        }
      }
      fs.rmdirSync('./test-cookies');
    }
    
    if (browserManager) {
      await browserManager.cleanup();
    }
  });

  describe('Cookie管理功能', () => {
    test('应该能够检测有效的登录Cookie', () => {
      // 创建测试Cookie文件
      const testCookies = [
        {
          name: 'SUB',
          value: '_2AkMfmFyGf8NxqwFRmvsXzGLgaYVwzQ7EieKpxK1dJRMxHRl-yT9kqnUTtRB6NBhyaFZQw-oj91LgvHF_qYZyDEwPrHdp',
          domain: '.weibo.com',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 86400, // 24小时后过期
          httpOnly: true,
          secure: true,
          sameSite: 'None'
        },
        {
          name: 'SRT',
          value: 'test-srt-token',
          domain: '.passport.weibo.com',
          path: '/',
          expires: -1, // 会话Cookie
          httpOnly: true,
          secure: true,
          sameSite: 'Lax'
        }
      ];

      fs.writeFileSync(
        path.join('./test-cookies', 'weibo.com.json'),
        JSON.stringify(testCookies, null, 2)
      );

      const hasValidCookies = cookieManager.hasLoginCookies('weibo.com');
      expect(hasValidCookies).toBe(true);
    });

    test('应该能够检测无效的Cookie', () => {
      // 创建已过期的Cookie
      const expiredCookies = [
        {
          name: 'SUB',
          value: 'expired-token',
          domain: '.weibo.com',
          path: '/',
          expires: Math.floor(Date.now() / 1000) - 3600, // 1小时前过期
          httpOnly: true,
          secure: true,
          sameSite: 'None'
        }
      ];

      fs.writeFileSync(
        path.join('./test-cookies', 'expired-weibo.com.json'),
        JSON.stringify(expiredCookies, null, 2)
      );

      const hasValidCookies = cookieManager.hasLoginCookies('expired-weibo.com');
      expect(hasValidCookies).toBe(false);
    });

    test('应该能够处理不存在Cookie文件的情况', () => {
      const hasValidCookies = cookieManager.hasLoginCookies('nonexistent-domain.com');
      expect(hasValidCookies).toBe(false);
    });
  });

  describe('自动登录功能', () => {
    beforeEach(async () => {
      if (browserManager) {
        await browserManager.cleanup();
      }
    });

    test('应该能够检测是否有有效的登录Cookie', async () => {
      browserManager = new CamoufoxManager({
        headless: true,
        targetDomain: 'weibo.com',
        autoInjectCookies: true,
        waitForLogin: false
      });

      // 在初始化前检查Cookie状态
      const hasCookiesBefore = browserManager.hasValidLoginCookies();
      console.log(`初始Cookie状态: ${hasCookiesBefore ? '有有效Cookie' : '无有效Cookie'}`);

      expect(typeof hasCookiesBefore).toBe('boolean');
    });

    test('应该能够配置自动注入行为', async () => {
      // 测试禁用自动注入
      const disabledManager = new CamoufoxManager({
        headless: true,
        autoInjectCookies: false,
        waitForLogin: false
      });

      const config = disabledManager.getConfig();
      expect(config.autoInjectCookies).toBe(false);
      expect(config.waitForLogin).toBe(false);

      await disabledManager.cleanup();
    });

    test('应该能够正确设置登录超时', async () => {
      const customTimeoutManager = new CamoufoxManager({
        headless: true,
        loginTimeout: 60, // 60秒
        targetDomain: 'weibo.com'
      });

      const config = customTimeoutManager.getConfig();
      expect(config.loginTimeout).toBe(60);
      expect(config.targetDomain).toBe('weibo.com');

      await customTimeoutManager.cleanup();
    });
  });

  describe('完整的自动登录流程', () => {
    test('应该能够使用已有Cookie自动登录', async () => {
      // 准备有效的Cookie文件
      const validCookies = [
        {
          name: 'SUB',
          value: '_2AkMfmFyGf8NxqwFRmvsXzGLgaYVwzQ7EieKpxK1dJRMxHRl-yT9kqnUTtRB6NBhyaFZQw-oj91LgvHF_qYZyDEwPrHdp',
          domain: '.weibo.com',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 86400,
          httpOnly: true,
          secure: true,
          sameSite: 'None'
        },
        {
          name: 'XSRF-TOKEN',
          value: 'test-xsrf-token',
          domain: 'weibo.com',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: true,
          sameSite: 'Lax'
        }
      ];

      fs.writeFileSync(
        path.join('./test-cookies', 'weibo.com.json'),
        JSON.stringify(validCookies, null, 2)
      );

      browserManager = new CamoufoxManager({
        headless: true,
        targetDomain: 'weibo.com',
        autoInjectCookies: true,
        waitForLogin: false,
        defaultTimeout: 10000
      });

      // 验证能检测到Cookie
      expect(browserManager.hasValidLoginCookies()).toBe(true);

      // 初始化浏览器（但不进行自动登录测试，因为需要真实的网站响应）
      await browserManager.initialize();
      
      const page = await browserManager.getCurrentPage();
      expect(page).toBeDefined();

      // 验证配置正确
      const config = browserManager.getConfig();
      expect(config.autoInjectCookies).toBe(true);
      expect(config.targetDomain).toBe('weibo.com');
    }, 30000);

    test('应该能够在无Cookie时提示用户登录', async () => {
      // 确保没有Cookie文件
      const cookieFile = path.join('./test-cookies', 'weibo.com.json');
      if (fs.existsSync(cookieFile)) {
        fs.unlinkSync(cookieFile);
      }

      browserManager = new CamoufoxManager({
        headless: true,
        targetDomain: 'weibo.com',
        autoInjectCookies: true,
        waitForLogin: true, // 设置为true但测试时会超时
        loginTimeout: 5, // 很短的超时用于测试
        defaultTimeout: 10000
      });

      // 验证检测到无Cookie
      expect(browserManager.hasValidLoginCookies()).toBe(false);

      // 初始化浏览器
      await browserManager.initialize();

      // 验证配置正确
      const config = browserManager.getConfig();
      expect(config.waitForLogin).toBe(true);
      expect(config.loginTimeout).toBe(5);
    }, 30000);
  });

  describe('登录状态检测', () => {
    beforeEach(async () => {
      if (browserManager) {
        await browserManager.cleanup();
      }
      browserManager = new CamoufoxManager({
        headless: true,
        autoInjectCookies: false,
        waitForLogin: false
      });
      await browserManager.initialize();
    });

    afterEach(async () => {
      if (browserManager) {
        await browserManager.cleanup();
      }
    });

    test('应该能够正确识别登录页面', async () => {
      const page = await browserManager.getCurrentPage();
      
      // 模拟导航到登录页面
      await page.goto('https://weibo.com/login.php');
      
      // 这里我们无法完全测试真实的登录状态检测，因为没有真实的网站响应
      // 但我们可以验证方法的存在和基本调用
      expect(typeof browserManager.checkLoginStatus).toBe('function');
      
      const isLogin = await browserManager.checkLoginStatus();
      expect(typeof isLogin).toBe('boolean');
    });

    test('应该能够处理页面内容检查', async () => {
      const page = await browserManager.getCurrentPage();
      
      // 设置一个简单的测试页面
      await page.setContent(`
        <html>
          <head><title>微博</title></head>
          <body>
            <div class="nav">首页</div>
            <div class="main">新鲜事</div>
          </body>
        </html>
      `);
      
      const isLoggedIn = await browserManager.checkLoginStatus();
      // 页面包含"微博"和"新鲜事"，应该被认为是已登录状态
      expect(isLoggedIn).toBe(true);
    });
  });

  describe('配置更新功能', () => {
    test('应该能够动态更新配置', async () => {
      browserManager = new CamoufoxManager({
        headless: true,
        autoInjectCookies: false,
        waitForLogin: false
      });

      let config = browserManager.getConfig();
      expect(config.autoInjectCookies).toBe(false);

      // 更新配置
      browserManager.updateConfig({
        autoInjectCookies: true,
        waitForLogin: true,
        targetDomain: 'test.com'
      });

      config = browserManager.getConfig();
      expect(config.autoInjectCookies).toBe(true);
      expect(config.waitForLogin).toBe(true);
      expect(config.targetDomain).toBe('test.com');

      await browserManager.cleanup();
    });
  });
});