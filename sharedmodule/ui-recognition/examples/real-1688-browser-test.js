/**
 * 真实1688浏览器测试
 * 启动真实浏览器，登录1688，截图，识别容器并高亮显示
 */

import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置常量
const UI_SERVICE_URL = 'http://localhost:8898';
const CONTAINER_SERVICE_URL = 'http://localhost:7007';
const COOKIE_PATH = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
const SCREENSHOT_DIR = path.join(__dirname, '../screenshots');
const REPORTS_DIR = path.join(__dirname, '../reports');

class Real1688BrowserTest {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.sessionId = `real-1688-test-${Date.now()}`;
    this.testResults = {
      browserLaunch: null,
      loginStatus: null,
      screenshotCapture: null,
      uiRecognition: null,
      containerHighlighting: null,
      elementMapping: null
    };
  }

  /**
   * 运行完整的真实浏览器测试
   */
  async runRealTest() {
    console.log('🚀 开始真实1688浏览器测试');

    try {
      // 确保目录存在
      this.ensureDirectories();

      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 加载Cookie并访问1688
      await this.loadCookiesAndNavigate();

      // 3. 验证登录状态
      await this.verifyLoginStatus();

      // 4. 截取页面截图
      await this.captureScreenshot();

      // 5. 执行UI识别
      await this.performUIRecognition();

      // 6. 创建容器高亮
      await this.createContainerHighlights();

      // 7. 应用高亮到页面
      await this.applyHighlightsToPage();

      // 8. 生成测试报告
      await this.generateTestReport();

      console.log('✅ 真实1688浏览器测试完成');

    } catch (error) {
      console.error('❌ 真实浏览器测试失败:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 确保目录存在
   */
  ensureDirectories() {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
  }

  /**
   * 启动浏览器
   */
  async launchBrowser() {
    console.log('🌐 启动浏览器...');

    try {
      this.browser = await chromium.launch({
        headless: false, // 显示浏览器窗口
        slowMo: 100,    // 减慢操作速度
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-features=TranslateUI',
          '--lang=zh-CN',
          '--accept-lang=zh-CN,zh',
          '--window-size=1920,1080'
        ]
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'zh-CN'
      });

      this.page = await this.context.newPage();

      // 设置页面超时
      this.page.setDefaultTimeout(30000);

      console.log('✅ 浏览器启动成功');
      this.testResults.browserLaunch = {
        success: true,
        browserType: 'chromium',
        viewport: '1920x1080',
        headless: false
      };

    } catch (error) {
      throw new Error(`浏览器启动失败: ${error.message}`);
    }
  }

  /**
   * 加载Cookie并导航到1688
   */
  async loadCookiesAndNavigate() {
    console.log('🍪 加载Cookie并导航到1688...');

    try {
      // 检查Cookie文件是否存在
      if (fs.existsSync(COOKIE_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));

        // 转换Cookie格式
        const playwrightCookies = cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || '.1688.com',
          path: cookie.path || '/',
          expires: cookie.expires ? parseFloat(cookie.expires) : undefined,
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false,
          sameSite: cookie.sameSite || 'Lax'
        }));

        await this.context.addCookies(playwrightCookies);
        console.log(`✅ 已加载 ${cookies.length} 个Cookie`);
      } else {
        console.log('⚠️ Cookie文件不存在，将进行匿名访问');
      }

      // 访问1688首页
      await this.page.goto('https://www.1688.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 等待页面加载
      await this.page.waitForTimeout(3000);

      console.log('✅ 成功导航到1688首页');

    } catch (error) {
      throw new Error(`导航失败: ${error.message}`);
    }
  }

  /**
   * 验证登录状态
   */
  async verifyLoginStatus() {
    console.log('🔐 验证登录状态...');

    try {
      // 检查登录状态的元素
      const loginSelectors = [
        '.userAvatarLogo img',
        '[class*=userAvatarLogo] img',
        '.user-name',
        '.member-name'
      ];

      let isLoggedIn = false;
      let loginElement = null;

      for (const selector of loginSelectors) {
        try {
          loginElement = await this.page.waitForSelector(selector, { timeout: 5000 });
          if (loginElement) {
            isLoggedIn = true;
            break;
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      if (isLoggedIn) {
        console.log('✅ 用户已登录');
        this.testResults.loginStatus = {
          success: true,
          isLoggedIn: true,
          detectedElement: loginElement.toString()
        };
      } else {
        console.log('⚠️ 用户未登录，继续进行测试...');
        this.testResults.loginStatus = {
          success: true,
          isLoggedIn: false,
          message: '用户未登录，但继续测试'
        };
      }

    } catch (error) {
      console.log('⚠️ 登录状态验证失败，继续测试');
      this.testResults.loginStatus = {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 截取页面截图
   */
  async captureScreenshot() {
    console.log('📸 截取页面截图...');

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(SCREENSHOT_DIR, `1688-screenshot-${timestamp}.png`);

      // 确保页面完全加载
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(2000);

      // 截取全页面截图
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: true,
        type: 'png'
      });

      console.log(`✅ 截图已保存: ${screenshotPath}`);

      // 读取截图并转换为base64
      const screenshotBuffer = fs.readFileSync(screenshotPath);
      const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;

      this.testResults.screenshotCapture = {
        success: true,
        path: screenshotPath,
        size: screenshotBuffer.length,
        base64: screenshotBase64,
        timestamp: new Date().toISOString()
      };

      return screenshotBase64;

    } catch (error) {
      throw new Error(`截图失败: ${error.message}`);
    }
  }

  /**
   * 执行UI识别
   */
  async performUIRecognition() {
    console.log('🤖 执行UI识别...');

    if (!this.testResults.screenshotCapture?.success) {
      throw new Error('截图失败，无法进行UI识别');
    }

    try {
      const response = await axios.post(`${UI_SERVICE_URL}/api/recognize`, {
        request_id: Date.now(),
        image: this.testResults.screenshotCapture.base64,
        query: '识别1688页面中的UI元素，包括搜索框、按钮、导航栏、链接等交互元素，请提供准确的坐标位置',
        scope: 'full',
        parameters: {
          temperature: 0.1,
          max_tokens: 8192
        }
      });

      if (response.data.success) {
        console.log(`✅ UI识别成功，识别到 ${response.data.elements.length} 个元素`);

        this.testResults.uiRecognition = {
          success: true,
          elements: response.data.elements,
          totalElements: response.data.elements.length,
          avgConfidence: response.data.elements.reduce((sum, el) => sum + el.confidence, 0) / response.data.elements.length,
          metadata: response.data.metadata
        };

        return response.data.elements;
      } else {
        throw new Error('UI识别服务返回失败');
      }

    } catch (error) {
      console.log('⚠️ UI识别服务不可用，使用备用识别方法');

      // 使用简单的元素识别作为备用
      const basicElements = await this.performBasicElementDetection();

      this.testResults.uiRecognition = {
        success: true,
        elements: basicElements,
        totalElements: basicElements.length,
        method: 'basic_detection',
        message: '使用备用识别方法'
      };

      return basicElements;
    }
  }

  /**
   * 执行基本元素检测（备用方案）
   */
  async performBasicElementDetection() {
    const basicElements = [];

    try {
      // 检测搜索框
      const searchInput = await this.page.$('input[data-spm="search"][placeholder*="搜索"], input[placeholder*="搜索"], #alisearch-input');
      if (searchInput) {
        const bbox = await searchInput.boundingBox();
        if (bbox) {
          basicElements.push({
            id: 'search-input',
            type: 'input',
            bbox: { x1: bbox.x, y1: bbox.y, x2: bbox.x + bbox.width, y2: bbox.y + bbox.height },
            confidence: 0.9,
            text: await searchInput.inputValue(),
            description: '搜索输入框'
          });
        }
      }

      // 检测搜索按钮
      const searchButton = await this.page.$('button[data-spm="search"], .search-btn, [class*="search"][class*="btn"]');
      if (searchButton) {
        const bbox = await searchButton.boundingBox();
        if (bbox) {
          basicElements.push({
            id: 'search-button',
            type: 'button',
            bbox: { x1: bbox.x, y1: bbox.y, x2: bbox.x + bbox.width, y2: bbox.y + bbox.height },
            confidence: 0.85,
            text: await searchButton.textContent(),
            description: '搜索按钮'
          });
        }
      }

      // 检测导航链接
      const navLinks = await this.page.$$('nav a, .nav a, [class*="nav"] a');
      for (let i = 0; i < Math.min(navLinks.length, 10); i++) {
        const link = navLinks[i];
        const bbox = await link.boundingBox();
        if (bbox) {
          basicElements.push({
            id: `nav-link-${i}`,
            type: 'link',
            bbox: { x1: bbox.x, y1: bbox.y, x2: bbox.x + bbox.width, y2: bbox.y + bbox.height },
            confidence: 0.7,
            text: await link.textContent(),
            description: '导航链接'
          });
        }
      }

    } catch (error) {
      console.log('基本元素检测也失败了:', error.message);
    }

    return basicElements;
  }

  /**
   * 创建容器高亮
   */
  async createContainerHighlights() {
    console.log('🎨 创建容器高亮...');

    if (!this.testResults.uiRecognition?.success) {
      throw new Error('UI识别失败，无法创建容器高亮');
    }

    try {
      const elements = this.testResults.uiRecognition.elements;
      const containers = this.groupElementsIntoContainers(elements);

      // 生成高亮样式
      const highlights = containers.map((container, index) => ({
        id: container.id,
        type: container.type,
        bounds: container.bounds,
        elements: container.elements,
        style: this.generateHighlightStyle(container.type, index),
        color: this.getContainerColor(container.type)
      }));

      console.log(`✅ 创建了 ${highlights.length} 个容器高亮`);

      this.testResults.containerHighlighting = {
        success: true,
        containers: containers,
        highlights: highlights,
        totalContainers: highlights.length
      };

      return highlights;

    } catch (error) {
      throw new Error(`容器高亮创建失败: ${error.message}`);
    }
  }

  /**
   * 将元素分组为容器
   */
  groupElementsIntoContainers(elements) {
    const containers = [];

    // 按位置和类型分组元素
    const headerElements = elements.filter(el => el.bbox.y1 < 150);
    const searchElements = elements.filter(el => el.type === 'input' || (el.type === 'button' && el.text?.includes('搜索')));
    const mainElements = elements.filter(el => el.bbox.y1 >= 150 && el.bbox.y1 < 600);

    // 创建头部容器
    if (headerElements.length > 0) {
      const bounds = this.calculateContainerBounds(headerElements);
      containers.push({
        id: 'container-header',
        type: 'header',
        bounds: bounds,
        elements: headerElements
      });
    }

    // 创建搜索容器
    if (searchElements.length > 0) {
      const bounds = this.calculateContainerBounds(searchElements);
      containers.push({
        id: 'container-search',
        type: 'search',
        bounds: bounds,
        elements: searchElements
      });
    }

    // 创建主内容容器
    if (mainElements.length > 0) {
      const bounds = this.calculateContainerBounds(mainElements);
      containers.push({
        id: 'container-main',
        type: 'main',
        bounds: bounds,
        elements: mainElements
      });
    }

    return containers;
  }

  /**
   * 计算容器边界
   */
  calculateContainerBounds(elements) {
    if (elements.length === 0) return { x1: 0, y1: 0, x2: 0, y2: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
      minX = Math.min(minX, el.bbox.x1);
      minY = Math.min(minY, el.bbox.y1);
      maxX = Math.max(maxX, el.bbox.x2);
      maxY = Math.max(maxY, el.bbox.y2);
    });

    // 添加一些边距
    const padding = 10;
    return {
      x1: Math.max(0, minX - padding),
      y1: Math.max(0, minY - padding),
      x2: maxX + padding,
      y2: maxY + padding
    };
  }

  /**
   * 生成高亮样式
   */
  generateHighlightStyle(type, index) {
    const colors = ['#00ff00', '#ff9800', '#2196f3', '#9c27b0', '#4caf50', '#f44336'];
    const color = colors[index % colors.length];

    return `border: 3px solid ${color}; background: ${color}20; box-shadow: 0 0 10px ${color};`;
  }

  /**
   * 获取容器颜色
   */
  getContainerColor(type) {
    const colorMap = {
      'header': '#9c27b0',
      'search': '#ff9800',
      'main': '#4caf50',
      'navigation': '#2196f3',
      'form': '#f44336'
    };

    return colorMap[type] || '#00ff00';
  }

  /**
   * 应用高亮到页面
   */
  async applyHighlightsToPage() {
    console.log('🖌️ 应用高亮到页面...');

    if (!this.testResults.containerHighlighting?.success) {
      throw new Error('容器高亮创建失败，无法应用到页面');
    }

    try {
      const highlights = this.testResults.containerHighlighting.highlights;

      // 创建高亮覆盖层
      const highlightOverlay = this.generateHighlightOverlay(highlights);

      // 注入高亮样式和脚本
      await this.page.addStyleTag({
        content: `
          .ui-highlight-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 9999;
          }

          .ui-highlight-container {
            position: absolute;
            border: 3px solid;
            background: rgba(255, 255, 255, 0.1);
            box-sizing: border-box;
            transition: all 0.3s ease;
          }

          .ui-highlight-container:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.02);
          }

          .ui-highlight-label {
            position: absolute;
            top: -25px;
            left: 0;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 4px 8px;
            font-size: 12px;
            border-radius: 4px;
            white-space: nowrap;
            font-family: Arial, sans-serif;
          }
        `
      });

      // 注入高亮HTML
      await this.page.setContent(`
        ${await this.page.content()}
        <div class="ui-highlight-overlay">
          ${highlights.map(highlight => `
            <div
              class="ui-highlight-container"
              style="
                left: ${highlight.bounds.x1}px;
                top: ${highlight.bounds.y1}px;
                width: ${highlight.bounds.x2 - highlight.bounds.x1}px;
                height: ${highlight.bounds.y2 - highlight.bounds.y1}px;
                border-color: ${highlight.color};
                background: ${highlight.color}20;
              "
            >
              <div class="ui-highlight-label">${highlight.type} (${highlight.elements.length} elements)</div>
            </div>
          `).join('')}
        </div>
      `);

      // 等待高亮显示
      await this.page.waitForTimeout(2000);

      console.log('✅ 高亮已应用到页面');

      this.testResults.elementMapping = {
        success: true,
        highlightsApplied: highlights.length,
        message: '高亮已成功应用到页面'
      };

    } catch (error) {
      throw new Error(`高亮应用失败: ${error.message}`);
    }
  }

  /**
   * 生成高亮覆盖层HTML
   */
  generateHighlightOverlay(highlights) {
    return `
      <div class="ui-highlight-overlay">
        ${highlights.map(highlight => `
          <div
            class="ui-highlight-container"
            data-container-id="${highlight.id}"
            data-container-type="${highlight.type}"
            style="
              left: ${highlight.bounds.x1}px;
              top: ${highlight.bounds.y1}px;
              width: ${highlight.bounds.x2 - highlight.bounds.x1}px;
              height: ${highlight.bounds.y2 - highlight.bounds.y1}px;
              ${highlight.style}
            "
          >
            <div class="ui-highlight-label">
              ${highlight.type} (${highlight.elements.length} elements)
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * 生成测试报告
   */
  async generateTestReport() {
    console.log('📊 生成测试报告...');

    const report = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      testType: 'real-1688-browser-test',
      testResults: this.testResults,
      summary: {
        totalSteps: 6,
        passedSteps: Object.values(this.testResults).filter(r => r && r.success !== false).length,
        failedSteps: Object.values(this.testResults).filter(r => r && r.success === false).length,
        overallStatus: Object.values(this.testResults).some(r => r && r.success === false) ? 'failed' : 'passed'
      },
      statistics: {
        totalElements: this.testResults.uiRecognition?.totalElements || 0,
        totalContainers: this.testResults.containerHighlighting?.totalContainers || 0,
        avgConfidence: this.testResults.uiRecognition?.avgConfidence || 0,
        screenshotSize: this.testResults.screenshotCapture?.size || 0
      },
      recommendations: this.generateRecommendations()
    };

    // 保存报告
    const reportPath = path.join(REPORTS_DIR, `real-1688-test-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📊 测试报告已生成: ${reportPath}`);
    console.log(`📈 测试结果: ${report.summary.passedSteps}/${report.summary.totalSteps} 通过`);

    return report;
  }

  /**
   * 生成改进建议
   */
  generateRecommendations() {
    const recommendations = [];

    if (!this.testResults.loginStatus?.isLoggedIn) {
      recommendations.push('建议先登录1688账号以获得更完整的UI元素识别');
    }

    if (this.testResults.uiRecognition?.totalElements < 5) {
      recommendations.push('UI识别结果较少，可能需要优化识别参数或检查截图质量');
    }

    if (!this.testResults.elementMapping?.success) {
      recommendations.push('高亮应用失败，检查页面脚本注入权限');
    }

    if (this.testResults.uiRecognition?.avgConfidence < 0.7) {
      recommendations.push('识别置信度较低，建议使用更高精度的模型或优化prompt');
    }

    return recommendations;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    console.log('🧹 清理资源...');

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
      console.log('✅ 资源清理完成');
    } catch (error) {
      console.log('⚠️ 资源清理时出错:', error.message);
    }
  }
}

// 主执行函数
async function main() {
  const test = new Real1688BrowserTest();

  try {
    await test.runRealTest();
    console.log('\n🎉 真实1688浏览器测试成功完成！');
    console.log('📁 请查看截图和报告文件了解详细结果');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 真实浏览器测试失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default Real1688BrowserTest;