/**
 * 1688手动登录测试
 * 先手动登录，然后进行UI识别和容器高亮
 */

import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ManualLogin1688Test {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      browserLaunch: null,
      manualLogin: null,
      cookieCapture: null,
      uiRecognition: null,
      containerHighlighting: null,
      overallSuccess: false
    };
  }

  async runManualLoginTest() {
    console.log('🔐 开始1688手动登录测试');
    console.log('⚠️  注意：需要手动完成登录流程');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 访问1688登录页
      await this.navigateToLoginPage();

      // 3. 等待用户手动登录
      await this.waitForManualLogin();

      // 4. 验证登录状态
      await this.verifyLoginStatus();

      // 5. 保存新的Cookie
      await this.saveNewCookies();

      // 6. 截图和UI识别
      await this.performUIRecognition();

      // 7. 容器高亮
      await this.createContainerHighlights();

      // 8. 生成报告
      await this.generateReport();

      console.log('✅ 手动登录测试完成');

    } catch (error) {
      console.error('❌ 手动登录测试失败:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async launchBrowser() {
    console.log('🌐 启动浏览器...');

    this.browser = await chromium.launch({
      headless: false, // 必须显示以便手动登录
      slowMo: 100,
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
    this.page.setDefaultTimeout(30000);

    console.log('✅ 浏览器启动成功');
    this.testResults.browserLaunch = { success: true };
  }

  async navigateToLoginPage() {
    console.log('🔗 导航到1688登录页...');

    // 直接访问登录页
    await this.page.goto('https://login.1688.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 等待页面加载
    await this.page.waitForTimeout(3000);

    console.log('✅ 已导航到登录页面');
    console.log('👤 请在浏览器中手动完成登录流程');
  }

  async waitForManualLogin() {
    console.log('⏳ 等待手动登录完成...');
    console.log('💡 提示：请在浏览器中输入用户名和密码完成登录');
    console.log('⏰ 登录完成后，此脚本将自动继续（最长等待5分钟）');

    // 创建一个提示框
    await this.page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.id = 'login-prompt-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 999999;
        font-family: Arial, sans-serif;
        font-size: 16px;
        text-align: center;
        max-width: 400px;
      `;
      overlay.innerHTML = `
        <h2>🔐 请手动登录1688</h2>
        <p>请在浏览器中完成登录流程</p>
        <p>登录成功后页面会自动跳转</p>
        <p style="font-size: 12px; color: #ccc; margin-top: 10px;">
          此提示将在登录完成后消失
        </p>
      `;
      document.body.appendChild(overlay);
    });

    const maxWaitTime = 5 * 60 * 1000; // 5分钟
    const startTime = Date.now();

    // 轮询检查登录状态
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 检查是否有登录成功的指示器
        const isLoggedIn = await this.checkLoginIndicators();

        if (isLoggedIn) {
          console.log('✅ 检测到登录成功！');

          // 移除提示框
          await this.page.evaluate(() => {
            const overlay = document.getElementById('login-prompt-overlay');
            if (overlay) overlay.remove();
          });

          this.testResults.manualLogin = {
            success: true,
            loginTime: Date.now() - startTime,
            method: 'manual'
          };

          return;
        }

        // 每隔10秒检查一次
        await this.page.waitForTimeout(10000);
        console.log(`⏳ 等待登录中... (${Math.floor((Date.now() - startTime) / 1000)}秒)`);

      } catch (error) {
        console.log(`⚠️ 检查登录状态时出错: ${error.message}`);
        await this.page.waitForTimeout(5000);
      }
    }

    // 超时
    throw new Error('手动登录超时，请在5分钟内完成登录');
  }

  async checkLoginIndicators() {
    try {
      // 检查是否已经跳转到1688主页
      const currentUrl = this.page.url();
      if (currentUrl.includes('1688.com') && !currentUrl.includes('login')) {
        return true;
      }

      // 检查是否有用户头像等登录指示器
      const loginSelectors = [
        '.userAvatarLogo img',
        '[class*=userAvatarLogo] img',
        '.user-name',
        '.member-name',
        '.logout',
        '[class*="logout"]'
      ];

      for (const selector of loginSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              return true;
            }
          }
        } catch (e) {
          continue;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async verifyLoginStatus() {
    console.log('🔍 验证登录状态...');

    // 确保在1688主页
    const currentUrl = this.page.url();
    if (!currentUrl.includes('1688.com') || currentUrl.includes('login')) {
      await this.page.goto('https://www.1688.com/', {
        waitUntil: 'domcontentloaded'
      });
      await this.page.waitForTimeout(3000);
    }

    // 再次验证登录状态
    const isLoggedIn = await this.checkLoginIndicators();

    if (!isLoggedIn) {
      throw new Error('登录验证失败：未找到登录状态指示器');
    }

    // 获取用户信息
    let userInfo = null;
    try {
      const userElement = await this.page.$('.user-name, .member-name, [data-spm="loginNick"]');
      if (userElement) {
        userInfo = await userElement.textContent();
      }
    } catch (e) {
      // 忽略错误
    }

    console.log(`✅ 登录状态验证成功${userInfo ? `: ${userInfo.trim()}` : ''}`);
    this.testResults.manualLogin.verified = true;
    this.testResults.manualLogin.userInfo = userInfo?.trim();
  }

  async saveNewCookies() {
    console.log('💾 保存新的登录Cookie...');

    try {
      const cookies = await this.page.context().cookies();
      console.log(`📊 发现 ${cookies.length} 个Cookie`);

      // 保存Cookie到多个位置
      const cookiePaths = [
        '/Users/fanzhang/.webauto/cookies/1688-domestic.json',
        path.join(__dirname, '../cookies/1688-new-cookies.json')
      ];

      for (const cookiePath of cookiePaths) {
        // 确保目录存在
        const dir = path.dirname(cookiePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
        console.log(`✅ Cookie已保存到: ${cookiePath}`);
      }

      this.testResults.cookieCapture = {
        success: true,
        cookieCount: cookies.length,
        savedPaths: cookiePaths
      };

    } catch (error) {
      throw new Error(`Cookie保存失败: ${error.message}`);
    }
  }

  async performUIRecognition() {
    console.log('🤖 执行UI识别...');

    // 确保页面完全加载
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(3000);

    // 截图
    const screenshot = await this.page.screenshot({
      fullPage: true,
      type: 'png'
    });

    const screenshotBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;
    console.log(`📸 截图完成，大小: ${screenshot.length} bytes`);

    try {
      // 调用UI识别服务
      const response = await axios.post('http://localhost:8898/api/recognize', {
        request_id: Date.now(),
        image: screenshotBase64,
        query: '识别1688页面中的所有UI元素，包括搜索框、按钮、链接、导航栏等，提供精确的坐标位置',
        scope: 'full',
        parameters: {
          temperature: 0.1,
          max_tokens: 8192
        }
      });

      if (response.data.success && response.data.elements) {
        const elements = response.data.elements;
        console.log(`✅ UI识别成功：识别到 ${elements.length} 个元素`);

        this.testResults.uiRecognition = {
          success: true,
          elementCount: elements.length,
          avgConfidence: elements.reduce((sum, el) => sum + el.confidence, 0) / elements.length,
          elements: elements,
          screenshotSize: screenshot.length
        };

        return elements;
      } else {
        throw new Error('UI识别服务返回失败结果');
      }

    } catch (error) {
      console.log('⚠️ UI识别服务不可用，使用备用识别方法');

      // 备用识别方法
      const basicElements = await this.performBasicElementDetection();

      this.testResults.uiRecognition = {
        success: true,
        method: 'basic_detection',
        elementCount: basicElements.length,
        elements: basicElements,
        screenshotSize: screenshot.length
      };

      return basicElements;
    }
  }

  async performBasicElementDetection() {
    const elements = [];

    try {
      // 检测各种UI元素
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

          for (let i = 0; i < Math.min(elements_found.length, 10); i++) {
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

    } catch (error) {
      console.log('基本元素检测失败:', error.message);
    }

    return elements;
  }

  async createContainerHighlights() {
    console.log('🎨 创建容器高亮...');

    const elements = this.testResults.uiRecognition?.elements;
    if (!elements || elements.length === 0) {
      throw new Error('没有UI元素，无法创建容器高亮');
    }

    // 按位置分组元素
    const containers = this.groupElementsIntoContainers(elements);

    if (containers.length === 0) {
      throw new Error('没有创建任何容器');
    }

    // 添加高亮样式
    await this.page.addStyleTag({
      content: `
        .ui-highlight-container {
          position: absolute !important;
          border: 3px solid !important;
          background: rgba(255, 255, 255, 0.2) !important;
          box-sizing: border-box !important;
          z-index: 10000 !important;
          pointer-events: none !important;
          transition: all 0.3s ease !important;
        }
        .ui-highlight-container:hover {
          background: rgba(255, 255, 255, 0.4) !important;
          transform: scale(1.02) !important;
        }
        .ui-highlight-label {
          position: absolute !important;
          top: -25px !important;
          left: 0 !important;
          background: rgba(0, 0, 0, 0.9) !important;
          color: white !important;
          padding: 4px 8px !important;
          font-size: 12px !important;
          border-radius: 4px !important;
          font-family: Arial, sans-serif !important;
          z-index: 10001 !important;
          white-space: nowrap !important;
        }
      `
    });

    // 为每个容器添加高亮
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    let highlightsAdded = 0;

    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      const color = colors[i % colors.length];

      try {
        await this.page.evaluate((bounds, containerId, containerType, color, elementCount) => {
          const highlight = document.createElement('div');
          highlight.className = 'ui-highlight-container';
          highlight.id = `highlight-${containerId}`;
          highlight.style.cssText = `
            left: ${bounds.x1}px;
            top: ${bounds.y1}px;
            width: ${bounds.x2 - bounds.x1}px;
            height: ${bounds.y2 - bounds.y1}px;
            border-color: ${color};
            background: ${color}20;
          `;

          const label = document.createElement('div');
          label.className = 'ui-highlight-label';
          label.textContent = `${containerType} (${elementCount} elements)`;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          return { success: true, id: highlight.id };
        }, container.bounds, container.id, container.type, color, container.elements.length);

        highlightsAdded++;
      } catch (e) {
        console.log(`高亮添加失败: ${container.id} - ${e.message}`);
      }
    }

    if (highlightsAdded === 0) {
      throw new Error('没有成功添加任何高亮');
    }

    console.log(`✅ 容器高亮创建成功：${highlightsAdded}/${containers.length} 个高亮已添加`);

    this.testResults.containerHighlighting = {
      success: true,
      containers: containers,
      highlightsAdded: highlightsAdded,
      colors: colors.slice(0, highlightsAdded)
    };

    // 保持浏览器打开10秒让用户观察
    console.log('👁️ 浏览器将保持打开10秒以便观察高亮效果...');
    await this.page.waitForTimeout(10000);
  }

  groupElementsIntoContainers(elements) {
    const containers = [];

    // 按Y坐标分组
    const headerElements = elements.filter(el => el.bbox.y1 < 150);
    const searchElements = elements.filter(el =>
      el.type === 'input' && (el.text?.includes('搜索') || el.description?.includes('搜索'))
    );
    const navigationElements = elements.filter(el => el.type === 'navigation' || el.type === 'link');
    const mainElements = elements.filter(el => el.bbox.y1 >= 150 && el.bbox.y1 < 600);

    if (headerElements.length > 0) {
      containers.push({
        id: 'header-container',
        type: 'header',
        bounds: this.calculateBounds(headerElements),
        elements: headerElements
      });
    }

    if (searchElements.length > 0) {
      containers.push({
        id: 'search-container',
        type: 'search',
        bounds: this.calculateBounds(searchElements),
        elements: searchElements
      });
    }

    if (navigationElements.length > 0) {
      containers.push({
        id: 'navigation-container',
        type: 'navigation',
        bounds: this.calculateBounds(navigationElements),
        elements: navigationElements
      });
    }

    if (mainElements.length > 0) {
      containers.push({
        id: 'main-container',
        type: 'main',
        bounds: this.calculateBounds(mainElements),
        elements: mainElements
      });
    }

    return containers;
  }

  calculateBounds(elements) {
    if (elements.length === 0) return { x1: 0, y1: 0, x2: 0, y2: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
      minX = Math.min(minX, el.bbox.x1);
      minY = Math.min(minY, el.bbox.y1);
      maxX = Math.max(maxX, el.bbox.x2);
      maxY = Math.max(maxY, el.bbox.y2);
    });

    return {
      x1: Math.max(0, minX - 10),
      y1: Math.max(0, minY - 10),
      x2: maxX + 10,
      y2: maxY + 10
    };
  }

  async generateReport() {
    console.log('📊 生成测试报告...');

    // 判断总体成功状态
    const success = this.testResults.browserLaunch?.success &&
                    this.testResults.manualLogin?.success &&
                    this.testResults.uiRecognition?.success &&
                    this.testResults.containerHighlighting?.success;

    this.testResults.overallSuccess = success;

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'manual-login-1688-test',
      overallSuccess: success,
      testResults: this.testResults,
      summary: {
        browserLaunch: this.testResults.browserLaunch?.success || false,
        manualLogin: this.testResults.manualLogin?.success || false,
        cookieCapture: this.testResults.cookieCapture?.success || false,
        uiRecognition: this.testResults.uiRecognition?.success || false,
        containerHighlighting: this.testResults.containerHighlighting?.success || false
      },
      statistics: {
        elementCount: this.testResults.uiRecognition?.elementCount || 0,
        containerCount: this.testResults.containerHighlighting?.containers?.length || 0,
        highlightsAdded: this.testResults.containerHighlighting?.highlightsAdded || 0,
        cookieCount: this.testResults.cookieCapture?.cookieCount || 0
      }
    };

    const reportPath = path.join(__dirname, '../reports/manual-1688-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 测试报告已生成: ${reportPath}`);

    if (success) {
      console.log('\n🎉 手动登录测试完全成功！');
      console.log('✅ 所有步骤都已完成');
      console.log('✅ Cookie已保存以供后续使用');
    } else {
      console.log('\n❌ 手动登录测试失败');
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
  const test = new ManualLogin1688Test();

  try {
    await test.runManualLoginTest();
    process.exit(test.testResults.overallSuccess ? 0 : 1);
  } catch (error) {
    console.error('\n💥 手动登录测试失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ManualLogin1688Test;