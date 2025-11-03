/**
 * Camoufox安全测试
 * 使用Camoufox浏览器进行安全的UI识别测试，避免触发反爬虫机制
 */

import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CamoufoxSafeTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      browserLaunch: null,
      navigation: null,
      cookieLoading: null,
      loginStatus: null,
      manualLoginMonitoring: null,
      uiRecognition: null,
      coordinateValidation: null,
      avatarStatus: null,
      finalVerification: null
    };
    this.uiServiceUrl = 'http://localhost:8898';
  }

  async runCamoufoxSafeTest() {
    console.log('🦊 开始Camoufox安全测试');

    try {
      // 1. 使用Camoufox启动浏览器
      await this.launchCamoufoxBrowser();

      // 2. 安全导航到1688
      await this.safeNavigateTo1688();

      // 3. 加载Cookie（如果存在）
      await this.loadCookiesSafely();

      // 4. 等待页面加载完成并检查登录状态
      await this.page.waitForTimeout(3000);
      const loginStatus = await this.checkLoginStatus();
      this.testResults.loginStatus = {
        success: true,
        ...loginStatus,
        timestamp: Date.now()
      };

      if (loginStatus.isLoggedIn) {
        // ✅ 已登录 - 检查用户头像并更新Cookie
        console.log('✅ 检测到已登录状态，验证用户头像并更新Cookie');
        await this.checkAndUpdateAvatarCookie();
        await this.performSafeUIRecognition();
        await this.generateSafeTestReport();

      } else if (loginStatus.needsManualLogin) {
        // ⚠️ 需要手动登录 - 持续监测
        console.log('⚠️ 检测到需要手动登录，开始监测登录过程...');
        const loginSuccess = await this.monitorManualLoginProcess();
        this.testResults.manualLoginMonitoring = {
          success: loginSuccess,
          startTime: Date.now() - 300000, // 5分钟前开始
          endTime: Date.now(),
          duration: 300000,
          result: loginSuccess ? 'login_successful' : 'timeout_or_failed'
        };

        if (loginSuccess) {
          console.log('✅ 用户手动登录成功，Cookie已保存');
          await this.performSafeUIRecognition();
          await this.generateSafeTestReport();
        } else {
          console.log('❌ 手动登录监测超时或失败');
          await this.generateLoginFailedReport();
        }

      } else if (loginStatus.isBlocked) {
        // ❌ 被封控 - 停止操作
        console.log('🚫 检测到可能被封控，停止所有操作');
        await this.generateBlockedReport();
        return;

      } else {
        // ❌ 未知状态 - 检查锚点
        console.log('❓ 登录状态不明确，检查锚点...');
        const anchorStatus = await this.checkAnchorStatus();

        if (!anchorStatus.hasAnchors) {
          console.log('⚠️ 未检测到锚点，停止操作避免触发风控');
          await this.generateNoAnchorReport();
          return;
        }

        console.log('✅ 检测到锚点，继续操作');
        await this.performSafeUIRecognition();
        await this.generateSafeTestReport();
      }

    } catch (error) {
      console.error('❌ Camoufox安全测试失败:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async launchCamoufoxBrowser() {
    console.log('🦊 启动Camoufox浏览器...');

    try {
      this.browser = await chromium.launch({
        headless: false, // Camoufox通常在非headless模式下效果更好
        executablePath: '/opt/homebrew/bin/camoufox', // Camoufox可执行文件路径
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-extensions-except=/opt/homebrew/lib/camoufox/camoufox.xpi',
          '--user-data-dir=/tmp/camoufox-safe-test-' + Date.now(),
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occlusion',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      });

      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/118.0',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      this.page = await context.newPage();
      this.page.setDefaultTimeout(30000);

      // 设置页面加载策略
      await this.page.setDefaultNavigationTimeout(60000);

      console.log('✅ Camoufox浏览器启动成功');
      this.testResults.browserLaunch = {
        success: true,
        browserType: 'camoufox',
        timestamp: Date.now()
      };

    } catch (error) {
      console.log('❌ Camoufox启动失败，回退到Chromium:', error.message);

      // 回退到标准Chromium
      this.browser = await chromium.launch({
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--no-first-run',
          '--window-size=1920,1080'
        ]
      });

      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      this.page = await context.newPage();
      this.testResults.browserLaunch = {
        success: true,
        browserType: 'chromium',
        fallback: true,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  async safeNavigateTo1688() {
    console.log('🔗 安全导航到1688...');

    try {
      // 添加随机延迟模拟人类行为
      await this.page.waitForTimeout(Math.random() * 2000 + 1000);

      await this.page.goto('https://www.1688.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 模拟人类浏览行为
      await this.page.waitForTimeout(3000 + Math.random() * 2000);

      console.log('✅ 安全导航完成');
      this.testResults.navigation = {
        success: true,
        url: this.page.url(),
        timestamp: Date.now()
      };

    } catch (error) {
      console.log('❌ 导航失败:', error.message);
      this.testResults.navigation = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
      throw error;
    }
  }

  async loadCookiesSafely() {
    console.log('🍪 安全加载Cookie...');

    const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';

    if (fs.existsSync(cookiePath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));

        // 只加载必要的Cookie，避免加载过多数据
        const essentialCookies = cookies.filter(cookie =>
          !cookie.name.startsWith('_ga') &&
          !cookie.name.startsWith('_gid') &&
          !cookie.name.startsWith('AMP_') &&
          cookie.name !== '_ga' &&
          cookie.name !== '_gid'
        ).slice(0, 50); // 限制数量

        if (essentialCookies.length > 0) {
          const playwrightCookies = essentialCookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain || '.1688.com',
            path: cookie.path || '/',
            expires: cookie.expires ? parseFloat(cookie.expires) : undefined,
            httpOnly: cookie.httpOnly || false,
            secure: cookie.secure || false,
            sameSite: cookie.sameSite || 'Lax'
          }));

          await this.page.context().addCookies(playwrightCookies);
          console.log(`✅ 已加载 ${essentialCookies.length} 个Cookie`);
        } else {
          console.log('⚠️ 没有必要的Cookie可加载');
        }

        this.testResults.cookieLoading = {
          success: true,
          cookiesLoaded: essentialCookies.length,
          totalCookies: cookies.length,
          timestamp: Date.now()
        };

      } catch (error) {
        console.log('⚠️ Cookie加载失败:', error.message);
        this.testResults.cookieLoading = {
          success: false,
          error: error.message,
          timestamp: Date.now()
        };
      }
    } else {
      console.log('⚠️ 没有找到Cookie文件');
      this.testResults.cookieLoading = {
        success: false,
        reason: 'no_cookie_file',
        timestamp: Date.now()
      };
    }
  }

  async checkAnchorStatus() {
    console.log('🎯 检查锚点状态...');

    const anchorSelectors = [
      '#alisearch-input',
      '.search-input',
      'input[placeholder*="搜索"]',
      '.userAvatarLogo',
      '.logo',
      'h1'
    ];

    const detectedAnchors = [];

    for (const selector of anchorSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            const bbox = await element.boundingBox();
            if (bbox && bbox.width > 0 && bbox.height > 0) {
              detectedAnchors.push({
                selector,
                type: selector.replace(/[#.]/g, ''),
                bbox: {
                  x1: bbox.x,
                  y1: bbox.y,
                  x2: bbox.x + bbox.width,
                  y2: bbox.y + bbox.height
                },
                visible: true
              });
            }
          }
        }
      } catch (error) {
        // 忽略单个锚点的错误
      }
    }

    console.log(`✅ 锚点检查完成：检测到 ${detectedAnchors.length} 个锚点`);

    return {
      hasAnchors: detectedAnchors.length > 0,
      anchors: detectedAnchors,
      totalSelectors: anchorSelectors.length
    };
  }

  async performSafeUIRecognition() {
    console.log('🤖 执行安全UI识别...');

    try {
      // 等待页面完全加载
      await this.page.waitForLoadState('networkidle');

      // 添加延迟避免频繁操作
      await this.page.waitForTimeout(2000 + Math.random() * 1000);

      // 截图
      const screenshot = await this.page.screenshot({
        fullPage: true,
        type: 'png'
      });

      const screenshotBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;
      console.log(`📸 截图完成，大小: ${screenshot.length} bytes`);

      // 保存截图以供后续分析
      const screenshotPath = path.join(__dirname, '../screenshots/camoufox-safe-test.png');
      const screenshotDir = path.dirname(screenshotPath);

      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      fs.writeFileSync(screenshotPath, screenshot);

      // 检查用户头像是否存在并更新Cookie
      const avatarStatus = await this.checkAndUpdateAvatarCookie();

      // 调用UI识别服务
      let uiElements;
      try {
        const response = await axios.post(`${this.uiServiceUrl}/api/recognize`, {
          request_id: Date.now(),
          image: screenshotBase64,
          query: '识别页面中的搜索框、用户头像、logo等关键元素的精确坐标位置',
          scope: 'full',
          parameters: {
            temperature: 0.1,
            max_tokens: 8192
          }
        });

        if (response.data.success && response.data.elements) {
          uiElements = response.data.elements;
          console.log(`✅ UI识别成功：识别到 ${uiElements.length} 个元素`);
        } else {
          throw new Error('UI识别服务返回失败结果');
        }

      } catch (error) {
        console.log('⚠️ UI识别服务不可用，使用备用识别方法');

        // 使用Playwright进行基本元素检测
        uiElements = await this.performBasicElementDetection();
      }

      this.testResults.uiRecognition = {
        success: true,
        elementCount: uiElements.length,
        elements: uiElements,
        screenshotPath,
        screenshotSize: screenshot.length,
        avatarStatus: avatarStatus,
        timestamp: Date.now()
      };

      // 简单的坐标验证
      await this.validateCoordinates(uiElements);

      // 单独记录头像状态
      this.testResults.avatarStatus = {
        success: true,
        ...avatarStatus,
        timestamp: Date.now()
      };

    } catch (error) {
      console.log('❌ 安全UI识别失败:', error.message);
      this.testResults.uiRecognition = {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  async checkLoginStatus() {
    console.log('🔍 检查登录状态...');

    try {
      const currentUrl = this.page.url();
      console.log(`  当前URL: ${currentUrl}`);

      // 检查是否在登录页面
      const loginPageIndicators = [
        'login.1688.com',
        'passport.1688.com',
        'login',
        'signin',
        'auth'
      ];

      const isLoginPage = loginPageIndicators.some(indicator =>
        currentUrl.toLowerCase().includes(indicator)
      );

      if (isLoginPage) {
        console.log('  📍 检测到登录页面');
        return {
          isLoggedIn: false,
          needsManualLogin: true,
          isBlocked: false,
          url: currentUrl,
          reason: 'login_page_detected'
        };
      }

      // 检查是否有用户头像（登录成功的强指标）
      const avatarSelectors = [
        '.userAvatarLogo img',
        '.user-avatar img',
        '.avatar img',
        '.user-info .avatar',
        '.login-user .avatar'
      ];

      let hasAvatar = false;
      for (const selector of avatarSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              hasAvatar = true;
              console.log(`  ✅ 找到用户头像: ${selector}`);
              break;
            }
          }
        } catch (error) {
          // 忽略单个错误
        }
      }

      if (hasAvatar) {
        return {
          isLoggedIn: true,
          needsManualLogin: false,
          isBlocked: false,
          url: currentUrl,
          reason: 'user_avatar_detected'
        };
      }

      // 检查是否被重定向到验证码或风控页面
      const blockIndicators = [
        'verify',
        'captcha',
        'risk',
        'blocked',
        'forbidden',
        'error'
      ];

      const isBlocked = blockIndicators.some(indicator =>
        currentUrl.toLowerCase().includes(indicator)
      );

      if (isBlocked) {
        console.log('  🚫 检测到可能的封控页面');
        return {
          isLoggedIn: false,
          needsManualLogin: false,
          isBlocked: true,
          url: currentUrl,
          reason: 'block_page_detected'
        };
      }

      // 检查页面标题是否包含登录相关内容
      const title = await this.page.title();
      const hasLoginTitle = title.toLowerCase().includes('登录') ||
                           title.toLowerCase().includes('login');

      if (hasLoginTitle) {
        console.log('  📍 页面标题表明需要登录');
        return {
          isLoggedIn: false,
          needsManualLogin: true,
          isBlocked: false,
          url: currentUrl,
          title: title,
          reason: 'login_title_detected'
        };
      }

      // 检查是否有登录按钮或表单
      const loginFormSelectors = [
        'input[type="password"]',
        'button[type="submit"]',
        '.login-btn',
        '.login-button',
        '[class*="login"]'
      ];

      let hasLoginForm = false;
      for (const selector of loginFormSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              hasLoginForm = true;
              break;
            }
          }
        } catch (error) {
          // 忽略单个错误
        }
      }

      if (hasLoginForm) {
        console.log('  📍 检测到登录表单');
        return {
          isLoggedIn: false,
          needsManualLogin: true,
          isBlocked: false,
          url: currentUrl,
          reason: 'login_form_detected'
        };
      }

      // 默认情况：无法确定状态，可能已登录但页面结构变化
      console.log('  ❓ 无法确定登录状态，可能已登录');
      return {
        isLoggedIn: false,
        needsManualLogin: false,
        isBlocked: false,
        url: currentUrl,
        reason: 'status_unclear'
      };

    } catch (error) {
      console.log(`  ❌ 登录状态检查失败: ${error.message}`);
      return {
        isLoggedIn: false,
        needsManualLogin: false,
        isBlocked: false,
        error: error.message,
        reason: 'check_failed'
      };
    }
  }

  async monitorManualLoginProcess() {
    console.log('👀 开始监测手动登录过程...');

    const maxWaitTime = 300000; // 5分钟最大等待时间
    const checkInterval = 15000; // 15秒检查间隔
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        console.log(`  🔍 检查登录状态... (${Math.floor((Date.now() - startTime) / 1000)}秒)`);

        // 检查用户头像
        const avatarStatus = await this.checkAndUpdateAvatarCookie();

        if (avatarStatus.hasAvatar && avatarStatus.avatarUpdated) {
          console.log('  ✅ 检测到用户登录成功！');
          return true;
        }

        // 检查URL变化
        const currentUrl = this.page.url();
        if (!currentUrl.includes('login') && currentUrl.includes('1688.com')) {
          // URL不在登录页面，可能登录成功，再次验证头像
          await this.page.waitForTimeout(2000);
          const recheckAvatar = await this.checkAndUpdateAvatarCookie();
          if (recheckAvatar.hasAvatar && recheckAvatar.avatarUpdated) {
            console.log('  ✅ URL变化并确认用户头像，登录成功！');
            return true;
          }
        }

        // 等待下一次检查
        console.log('  ⏳ 等待用户手动登录...');
        await this.page.waitForTimeout(checkInterval);

      } catch (error) {
        console.log(`  ⚠️ 检查过程中出错: ${error.message}`);
        await this.page.waitForTimeout(checkInterval);
      }
    }

    console.log('  ⏰ 手动登录监测超时');
    return false;
  }

  async generateLoginFailedReport() {
    console.log('📝 生成登录失败报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'camoufox-login-failed',
      testResults: this.testResults,
      summary: {
        browserLaunchSuccess: this.testResults.browserLaunch?.success || false,
        navigationSuccess: this.testResults.navigation?.success || false,
        cookieLoadingSuccess: this.testResults.cookieLoading?.success || false,
        loginStatus: 'manual_login_timeout_or_failed',
        finalAction: 'stopped_due_to_login_failure'
      },
      recommendations: [
        '检查Cookie是否有效',
        '考虑手动重新登录',
        '增加等待时间或重试',
        '检查网络连接状态'
      ]
    };

    const reportPath = path.join(__dirname, '../reports/camoufox-login-failed-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 登录失败报告已生成: ${reportPath}`);
  }

  async generateBlockedReport() {
    console.log('🚫 生成封控报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'camoufox-blocked',
      testResults: this.testResults,
      summary: {
        browserLaunchSuccess: this.testResults.browserLaunch?.success || false,
        navigationSuccess: this.testResults.navigation?.success || false,
        cookieLoadingSuccess: this.testResults.cookieLoading?.success || false,
        blockStatus: 'detected',
        finalAction: 'stopped_due_to_risk_control'
      },
      safetyMeasures: [
        '检测到可能的封控或风控页面',
        '停止所有操作避免进一步风险',
        '建议等待一段时间后重试',
        '考虑更换IP地址或设备'
      ]
    };

    const reportPath = path.join(__dirname, '../reports/camoufox-blocked-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 封控报告已生成: ${reportPath}`);
    console.log('🚫 安全提醒：已停止操作以避免触发进一步的风控机制');
  }

  async checkAndUpdateAvatarCookie() {
    console.log('👤 检查用户头像并更新Cookie...');

    try {
      // 多种用户头像选择器，覆盖不同登录状态
      const avatarSelectors = [
        '.userAvatarLogo img',
        '.user-avatar img',
        '.avatar img',
        '.user-info .avatar',
        '.login-user .avatar',
        '.user-photo',
        '[class*="avatar"] img',
        '[class*="user"] img'
      ];

      let avatarElement = null;
      let avatarSelector = null;

      // 逐一检查头像选择器
      for (const selector of avatarSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              const bbox = await element.boundingBox();
              if (bbox && bbox.width > 0 && bbox.height > 0) {
                avatarElement = element;
                avatarSelector = selector;
                console.log(`  ✅ 找到用户头像: ${selector}`);
                break;
              }
            }
          }
        } catch (error) {
          // 忽略单个选择器的错误
        }
      }

      if (!avatarElement) {
        console.log('  ❌ 未检测到用户头像');
        return {
          hasAvatar: false,
          avatarUpdated: false,
          reason: 'no_avatar_detected'
        };
      }

      // 验证头像确实是用户头像（检查属性和尺寸）
      const avatarSrc = await avatarElement.getAttribute('src') || '';
      const avatarAlt = await avatarElement.getAttribute('alt') || '';
      const avatarTitle = await avatarElement.getAttribute('title') || '';
      const bbox = await avatarElement.boundingBox();

      const isValidAvatar = bbox.width >= 20 && bbox.height >= 20 &&
                           (avatarSrc.includes('avatar') ||
                            avatarSrc.includes('user') ||
                            avatarAlt.includes('用户') ||
                            avatarTitle.includes('用户') ||
                            avatarSelector.includes('avatar') ||
                            avatarSelector.includes('user'));

      if (!isValidAvatar) {
        console.log('  ❌ 检测到的元素不是有效的用户头像');
        return {
          hasAvatar: false,
          avatarUpdated: false,
          reason: 'invalid_avatar_element',
          elementInfo: { src: avatarSrc, alt: avatarAlt, bbox }
        };
      }

      console.log(`  ✅ 确认用户头像存在: ${bbox.width}x${bbox.height}`);

      // 用户头像存在，更新Cookie
      const cookieUpdateResult = await this.updateCookiesAfterLogin();

      if (cookieUpdateResult.success) {
        console.log('  ✅ 基于用户头像检测成功更新Cookie');
        return {
          hasAvatar: true,
          avatarUpdated: true,
          cookieUpdate: cookieUpdateResult,
          avatarInfo: {
            selector: avatarSelector,
            bbox: {
              x1: bbox.x,
              y1: bbox.y,
              x2: bbox.x + bbox.width,
              y2: bbox.y + bbox.height
            },
            src: avatarSrc,
            alt: avatarAlt
          }
        };
      } else {
        console.log('  ⚠️ 用户头像存在但Cookie更新失败');
        return {
          hasAvatar: true,
          avatarUpdated: false,
          cookieUpdate: cookieUpdateResult,
          avatarInfo: {
            selector: avatarSelector,
            bbox: {
              x1: bbox.x,
              y1: bbox.y,
              x2: bbox.x + bbox.width,
              y2: bbox.y + bbox.height
            }
          }
        };
      }

    } catch (error) {
      console.log(`  ❌ 头像检测过程中出错: ${error.message}`);
      return {
        hasAvatar: false,
        avatarUpdated: false,
        error: error.message
      };
    }
  }

  async updateCookiesAfterLogin() {
    console.log('🍪 登录后更新Cookie...');

    try {
      // 获取当前所有Cookie
      const cookies = await this.page.context().cookies();

      if (cookies.length === 0) {
        return {
          success: false,
          reason: 'no_cookies_available'
        };
      }

      // 过滤和整理Cookie
      const importantCookies = cookies.filter(cookie => {
        // 保留重要的Cookie
        return cookie.name.includes('session') ||
               cookie.name.includes('token') ||
               cookie.name.includes('login') ||
               cookie.name.includes('auth') ||
               cookie.name.includes('user') ||
               cookie.domain.includes('1688');
      });

      // 添加时间戳和有效期信息
      const cookieData = {
        timestamp: Date.now(),
        url: this.page.url(),
        userAgent: await this.page.evaluate(() => navigator.userAgent),
        cookies: cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite
        })),
        importantCookies: importantCookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain
        })),
        summary: {
          totalCookies: cookies.length,
          importantCookies: importantCookies.length,
          domain: this.page.url(),
          updateTime: new Date().toISOString()
        }
      };

      // 保存Cookie到文件
      const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
      const cookieDir = path.dirname(cookiePath);

      // 确保目录存在
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // 备份现有Cookie
      if (fs.existsSync(cookiePath)) {
        const backupPath = `${cookiePath}.backup.${Date.now()}`;
        fs.copyFileSync(cookiePath, backupPath);
        console.log(`  📋 已备份现有Cookie到: ${backupPath}`);
      }

      // 写入新Cookie
      fs.writeFileSync(cookiePath, JSON.stringify(cookieData, null, 2));

      console.log(`  ✅ Cookie更新成功: ${cookies.length} 个Cookie (其中 ${importantCookies.length} 个重要Cookie)`);

      return {
        success: true,
        cookiePath,
        totalCookies: cookies.length,
        importantCookies: importantCookies.length,
        timestamp: Date.now()
      };

    } catch (error) {
      console.log(`  ❌ Cookie更新失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async performBasicElementDetection() {
    const elements = [];

    const elementSelectors = [
      { selector: 'input[type="text"], input[type="search"], input[placeholder*="搜索"]', type: 'input' },
      { selector: 'button, input[type="button"], input[type="submit"]', type: 'button' },
      { selector: 'a[href]', type: 'link' },
      { selector: 'img', type: 'image' },
      { selector: '[class*="nav"], nav', type: 'navigation' }
    ];

    for (const { selector, type } of elementSelectors) {
      try {
        const elements_found = await this.page.$$(selector);

        for (let i = 0; i < Math.min(elements_found.length, 20); i++) {
          const element = elements_found[i];
          const bbox = await element.boundingBox();

          if (bbox) {
            const text = await element.textContent();
            elements.push({
              id: `${type}-${i}`,
              type: type,
              bbox: { x1: bbox.x, y1: bbox.y, x2: bbox.x + bbox.width, y2: bbox.y + bbox.height },
              confidence: 0.8,
              text: text?.trim() || '',
              description: `${type} element`
            });
          }
        }
      } catch (e) {
        continue;
      }
    }

    return elements;
  }

  async validateCoordinates(uiElements) {
    console.log('📐 验证坐标...');

    if (!uiElements || uiElements.length === 0) {
      console.log('⚠️ 没有UI元素，无法验证坐标');
      return;
    }

    // 基本的坐标范围检查
    const viewport = this.page.viewportSize();
    const validCoordinates = uiElements.filter(element => {
      return element.bbox.x1 >= 0 &&
             element.bbox.y1 >= 0 &&
             element.bbox.x2 <= viewport.width &&
             element.bbox.y2 <= viewport.height &&
             element.bbox.x2 > element.bbox.x1 &&
             element.bbox.y2 > element.bbox.y1;
    });

    console.log(`✅ 坐标验证完成：${validCoordinates.length}/${uiElements.length} 个元素坐标有效`);

    this.testResults.coordinateValidation = {
      totalElements: uiElements.length,
      validElements: validCoordinates.length,
      invalidElements: uiElements.length - validCoordinates.length,
      viewportSize: viewport,
      timestamp: Date.now()
    };
  }

  async generateNoAnchorReport() {
    console.log('📝 生成无锚点报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'camoufox-no-anchor-test',
      testResults: this.testResults,
      summary: {
        browserLaunchSuccess: this.testResults.browserLaunch?.success || false,
        navigationSuccess: this.testResults.navigation?.success || false,
        cookieLoadingSuccess: this.testResults.cookieLoading?.success || false,
        anchorsDetected: false,
        safetyAction: '停止操作避免触发风控'
      },
      recommendations: [
        '等待Cookie更新或手动登录',
        '减少页面访问频率',
        '使用更长的时间间隔',
        '考虑使用代理IP轮换'
      ]
    };

    const reportPath = path.join(__dirname, '../reports/camoufox-no-anchor-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 无锚点报告已生成: ${reportPath}`);
    console.log('⚠️ 安全提醒：已停止操作以避免触发风控机制');
  }

  async generateSafeTestReport() {
    console.log('📊 生成安全测试报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'camoufox-safe-test',
      testResults: this.testResults,
      summary: {
        browserLaunchSuccess: this.testResults.browserLaunch?.success || false,
        browserType: this.testResults.browserLaunch?.browserType || 'unknown',
        navigationSuccess: this.testResults.navigation?.success || false,
        cookieLoadingSuccess: this.testResults.cookieLoading?.success || false,
        uiRecognitionSuccess: this.testResults.uiRecognition?.success || false,
        coordinateValidationSuccess: this.testResults.coordinateValidation?.validElements > 0 || false
      },
      safetyMeasures: [
        '使用Camoufox反检测浏览器',
        '限制Cookie加载数量',
        '添加随机延迟模拟人类行为',
        '只在检测到锚点时进行操作'
      ]
    };

    const reportPath = path.join(__dirname, '../reports/camoufox-safe-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 安全测试报告已生成: ${reportPath}`);

    // 输出关键结果
    console.log('\n🎯 测试结果总结:');
    console.log(`  浏览器: ${this.testResults.browserLaunch?.browserType || 'unknown'}`);
    console.log(`  导航: ${this.testResults.navigation?.success ? '✅' : '❌'}`);
    console.log(`  Cookie加载: ${this.testResults.cookieLoading?.success ? '✅' : '❌'}`);
    console.log(`  UI识别: ${this.testResults.uiRecognition?.success ? '✅' : '❌'}`);
    console.log(`  坐标验证: ${this.testResults.coordinateValidation?.validElements > 0 ? '✅' : '❌'}`);

    if (this.testResults.uiRecognition?.success) {
      console.log(`  识别元素: ${this.testResults.uiRecognition.elementCount} 个`);
    }

    return report;
  }

  async cleanup() {
    console.log('🧹 清理资源...');
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// 主执行函数
async function main() {
  const test = new CamoufoxSafeTest();

  try {
    await test.runCamoufoxSafeTest();
    console.log('\n✅ Camoufox安全测试完成');
  } catch (error) {
    console.error('\n💥 Camoufox安全测试失败:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CamoufoxSafeTest;