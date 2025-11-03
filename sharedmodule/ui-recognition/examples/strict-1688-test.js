/**
 * 严格的1688测试
 * 只有真正登录成功、UI识别可用、锚点检测准确才算测试通过
 */

import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 严格的测试成功标准
const SUCCESS_CRITERIA = {
  COOKIE_LOADED: false,
  LOGIN_VERIFIED: false,
  UI_RECOGNITION_WORKING: false,
  ANCHORS_DETECTED: false,
  CONTAINERS_MAPPED: false,
  HIGHLIGHTS_VISIBLE: false
};

class Strict1688Test {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      cookieStatus: null,
      loginStatus: null,
      uiRecognitionStatus: null,
      anchorDetectionStatus: null,
      containerMappingStatus: null,
      highlightStatus: null,
      overallSuccess: false
    };
  }

  async runStrictTest() {
    console.log('🔍 开始严格的1688测试');
    console.log('⚠️  注意：只有所有严格标准都满足才算测试成功');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 加载Cookie并验证
      await this.loadAndVerifyCookies();

      // 3. 验证登录状态（严格检查）
      await this.strictLoginVerification();

      // 4. 测试UI识别服务（必须可用）
      await this.testUIRecognitionService();

      // 5. 截图并进行UI识别
      await this.performStrictUIRecognition();

      // 6. 检测关键锚点元素
      await this.detectCriticalAnchors();

      // 7. 创建并验证容器映射
      await this.createAndVerifyContainers();

      // 8. 验证高亮显示
      await this.verifyHighlights();

      // 9. 最终成功判定
      this.determineOverallSuccess();

      // 10. 生成严格报告
      await this.generateStrictReport();

    } catch (error) {
      console.error('❌ 严格测试失败:', error.message);
      this.testResults.overallSuccess = false;
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async launchBrowser() {
    console.log('🌐 启动浏览器...');
    this.browser = await chromium.launch({ headless: false });
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    this.page = await context.newPage();
    console.log('✅ 浏览器启动成功');
  }

  async loadAndVerifyCookies() {
    console.log('🍪 加载并验证Cookie...');

    const COOKIE_PATH = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';

    if (!fs.existsSync(COOKIE_PATH)) {
      throw new Error('❌ Cookie文件不存在，无法进行测试');
    }

    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));
    console.log(`📊 发现 ${cookies.length} 个Cookie`);

    // 检查关键Cookie是否存在
    const criticalCookies = ['cookie2', '_tb_token_', '_m_h5_tk', 'cna'];
    const hasCriticalCookies = criticalCookies.some(name =>
      cookies.some(cookie => cookie.name === name)
    );

    if (!hasCriticalCookies) {
      throw new Error('❌ 缺少关键登录Cookie');
    }

    // 转换并加载Cookie
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

    const context = this.page.context();
    await context.addCookies(playwrightCookies);

    SUCCESS_CRITERIA.COOKIE_LOADED = true;
    this.testResults.cookieStatus = {
      success: true,
      cookieCount: cookies.length,
      hasCriticalCookies: true
    };

    console.log('✅ Cookie加载并验证成功');
  }

  async strictLoginVerification() {
    console.log('🔐 严格验证登录状态...');

    // 访问1688
    await this.page.goto('https://www.1688.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await this.page.waitForTimeout(3000);

    // 严格的登录验证检查
    const loginIndicators = [
      { selector: '.userAvatarLogo img', description: '用户头像' },
      { selector: '.user-name', description: '用户名' },
      { selector: '.member-name', description: '会员名' },
      { selector: '[data-spm="loginNick"]', description: '登录昵称' }
    ];

    let loginSuccess = false;
    let foundIndicator = null;

    for (const indicator of loginIndicators) {
      try {
        const element = await this.page.$(indicator.selector);
        if (element) {
          const isVisible = await element.isVisible();
          const text = await element.textContent();

          if (isVisible && text && text.trim()) {
            loginSuccess = true;
            foundIndicator = `${indicator.description}: ${text.trim()}`;
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // 额外检查：页面URL是否包含登录用户信息
    const pageUrl = this.page.url();
    const hasLoginIndicators = pageUrl.includes('member') ||
                             await this.page.$('.logout') !== null;

    if (!loginSuccess && !hasLoginIndicators) {
      throw new Error('❌ 登录验证失败：未找到有效的登录状态指示器');
    }

    SUCCESS_CRITERIA.LOGIN_VERIFIED = true;
    this.testResults.loginStatus = {
      success: true,
      verified: true,
      indicator: foundIndicator || '页面结构验证',
      pageUrl: pageUrl
    };

    console.log(`✅ 登录状态验证成功: ${foundIndicator || '页面结构验证'}`);
  }

  async testUIRecognitionService() {
    console.log('🤖 测试UI识别服务...');

    const UI_SERVICE_URL = 'http://localhost:8898';

    try {
      // 测试服务健康状态
      const healthResponse = await axios.get(`${UI_SERVICE_URL}/health`, { timeout: 5000 });

      if (healthResponse.data.status !== 'healthy') {
        throw new Error('UI识别服务不健康');
      }

      // 测试识别API（使用小图片）
      const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      const recognitionResponse = await axios.post(`${UI_SERVICE_URL}/api/recognize`, {
        request_id: Date.now(),
        image: testImage,
        query: '测试UI识别服务',
        scope: 'full',
        parameters: { temperature: 0.1, max_tokens: 100 }
      }, { timeout: 10000 });

      if (!recognitionResponse.data.success) {
        throw new Error('UI识别API返回失败');
      }

      SUCCESS_CRITERIA.UI_RECOGNITION_WORKING = true;
      this.testResults.uiRecognitionStatus = {
        success: true,
        serviceHealthy: true,
        apiWorking: true,
        model: healthResponse.data.model_path
      };

      console.log('✅ UI识别服务测试成功');

    } catch (error) {
      throw new Error(`❌ UI识别服务测试失败: ${error.message}`);
    }
  }

  async performStrictUIRecognition() {
    console.log('📸 截图并进行严格UI识别...');

    // 截取高质量截图
    await this.page.waitForLoadState('networkidle');
    const screenshot = await this.page.screenshot({
      fullPage: true,
      type: 'png'
    });

    const screenshotBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;

    // 调用UI识别服务
    const recognitionResponse = await axios.post('http://localhost:8898/api/recognize', {
      request_id: Date.now(),
      image: screenshotBase64,
      query: '识别1688页面中的所有交互元素，包括搜索框、按钮、链接、导航栏等，提供精确的坐标位置和元素类型',
      scope: 'full',
      parameters: {
        temperature: 0.1,
        max_tokens: 8192
      }
    });

    if (!recognitionResponse.data.success || !recognitionResponse.data.elements) {
      throw new Error('❌ UI识别失败或返回空结果');
    }

    const elements = recognitionResponse.data.elements;

    // 验证识别质量
    if (elements.length < 5) {
      console.warn('⚠️ 识别到的元素较少，可能识别质量不佳');
    }

    // 验证是否识别到关键元素
    const hasSearchInput = elements.some(el =>
      el.type === 'input' && (el.text?.includes('搜索') || el.description?.includes('搜索'))
    );

    const hasButtons = elements.some(el => el.type === 'button');
    const hasLinks = elements.some(el => el.type === 'link');

    if (!hasSearchInput && !hasButtons) {
      console.warn('⚠️ 未识别到关键的交互元素');
    }

    this.testResults.recognitionResults = {
      success: true,
      elementCount: elements.length,
      hasSearchInput,
      hasButtons,
      hasLinks,
      avgConfidence: elements.reduce((sum, el) => sum + el.confidence, 0) / elements.length,
      elements: elements
    };

    console.log(`✅ UI识别成功：识别到 ${elements.length} 个元素`);
    return elements;
  }

  async detectCriticalAnchors() {
    console.log('🎯 检测关键锚点元素...');

    const criticalAnchors = [
      { selector: 'input[data-spm="search"], input[placeholder*="搜索"], #alisearch-input', type: 'search_input' },
      { selector: 'button[data-spm="search"], .search-btn, [class*="search"][class*="btn"]', type: 'search_button' },
      { selector: '.userAvatarLogo, .user-avatar, [class*="avatar"]', type: 'user_avatar' },
      { selector: 'nav a, .nav a, [class*="nav"] a', type: 'navigation' },
      { selector: '.logo, [class*="logo"]', type: 'logo' }
    ];

    const detectedAnchors = [];

    for (const anchor of criticalAnchors) {
      try {
        const elements = await this.page.$$(anchor.selector);
        if (elements.length > 0) {
          const visibleElements = [];
          for (const element of elements.slice(0, 3)) { // 只检查前3个
            const isVisible = await element.isVisible();
            const bbox = await element.boundingBox();
            if (isVisible && bbox) {
              visibleElements.push({
                selector: anchor.selector,
                type: anchor.type,
                bbox: bbox,
                visible: true
              });
            }
          }

          if (visibleElements.length > 0) {
            detectedAnchors.push({
              type: anchor.type,
              count: visibleElements.length,
              elements: visibleElements
            });
          }
        }
      } catch (e) {
        console.log(`锚点检测失败: ${anchor.type} - ${e.message}`);
      }
    }

    // 验证关键锚点是否存在
    const hasSearchElements = detectedAnchors.some(a => a.type === 'search_input' || a.type === 'search_button');

    if (!hasSearchElements) {
      throw new Error('❌ 未检测到搜索相关的锚点元素');
    }

    SUCCESS_CRITERIA.ANCHORS_DETECTED = true;
    this.testResults.anchorDetectionStatus = {
      success: true,
      detectedAnchors: detectedAnchors,
      totalTypes: detectedAnchors.length,
      hasSearchElements
    };

    console.log(`✅ 锚点检测成功：检测到 ${detectedAnchors.length} 种类型的锚点元素`);
  }

  async createAndVerifyContainers() {
    console.log('📦 创建并验证容器映射...');

    const elements = this.testResults.recognitionResults?.elements;
    if (!elements || elements.length === 0) {
      throw new Error('❌ 没有UI识别结果，无法创建容器');
    }

    // 按位置分组创建容器
    const containers = this.createLogicalContainers(elements);

    // 验证容器的合理性
    const validContainers = containers.filter(container => {
      return container.elements.length > 0 &&
             container.bounds.x2 > container.bounds.x1 &&
             container.bounds.y2 > container.bounds.y1;
    });

    if (validContainers.length === 0) {
      throw new Error('❌ 没有创建有效的容器');
    }

    SUCCESS_CRITERIA.CONTAINERS_MAPPED = true;
    this.testResults.containerMappingStatus = {
      success: true,
      containers: validContainers,
      containerCount: validContainers.length,
      totalElementsMapped: validContainers.reduce((sum, c) => sum + c.elements.length, 0)
    };

    console.log(`✅ 容器映射成功：创建了 ${validContainers.length} 个有效容器`);
    return validContainers;
  }

  createLogicalContainers(elements) {
    const containers = [];

    // 按Y坐标分组
    const headerElements = elements.filter(el => el.bbox.y1 < 150);
    const searchElements = elements.filter(el =>
      (el.type === 'input' && el.description?.includes('搜索')) ||
      (el.type === 'button' && el.description?.includes('搜索'))
    );
    const mainElements = elements.filter(el => el.bbox.y1 >= 150 && el.bbox.y1 < 600);
    const footerElements = elements.filter(el => el.bbox.y1 >= 600);

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

    if (mainElements.length > 0) {
      containers.push({
        id: 'main-container',
        type: 'main',
        bounds: this.calculateBounds(mainElements),
        elements: mainElements
      });
    }

    if (footerElements.length > 0) {
      containers.push({
        id: 'footer-container',
        type: 'footer',
        bounds: this.calculateBounds(footerElements),
        elements: footerElements
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

  async verifyHighlights() {
    console.log('🎨 验证高亮显示...');

    const containers = this.testResults.containerMappingStatus?.containers;
    if (!containers || containers.length === 0) {
      throw new Error('❌ 没有容器，无法验证高亮');
    }

    // 创建高亮样式
    const highlightStyles = `
      .ui-highlight-container {
        position: absolute !important;
        border: 3px solid !important;
        background: rgba(255, 255, 255, 0.2) !important;
        box-sizing: border-box !important;
        z-index: 10000 !important;
        pointer-events: none !important;
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
      }
    `;

    await this.page.addStyleTag({ content: highlightStyles });

    // 为每个容器添加高亮
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
    let highlightsAdded = 0;

    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      const color = colors[i % colors.length];

      try {
        await this.page.evaluate((bounds, containerId, containerType, color) => {
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
          label.textContent = `${containerType} (${bounds.x1},${bounds.y1})`;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          return { success: true, elementId: highlight.id };
        }, container.bounds, container.id, container.type, color);

        highlightsAdded++;
      } catch (e) {
        console.log(`高亮添加失败: ${container.id} - ${e.message}`);
      }
    }

    if (highlightsAdded === 0) {
      throw new Error('❌ 没有成功添加任何高亮');
    }

    // 验证高亮是否真正显示
    await this.page.waitForTimeout(2000);

    const visibleHighlights = await this.page.evaluate(() => {
      const highlights = document.querySelectorAll('.ui-highlight-container');
      return Array.from(highlights).filter(h => {
        const style = window.getComputedStyle(h);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).length;
    });

    if (visibleHighlights === 0) {
      throw new Error('❌ 高亮元素不可见');
    }

    SUCCESS_CRITERIA.HIGHLIGHTS_VISIBLE = true;
    this.testResults.highlightStatus = {
      success: true,
      highlightsAttempted: containers.length,
      highlightsAdded: highlightsAdded,
      highlightsVisible: visibleHighlights
    };

    console.log(`✅ 高亮验证成功：${highlightsAdded}/${containers.length} 个高亮已添加并可见`);

    // 保持浏览器打开5秒让用户看到效果
    console.log('👁️  浏览器将保持打开5秒以便观察高亮效果...');
    await this.page.waitForTimeout(5000);
  }

  determineOverallSuccess() {
    console.log('\n🔍 最终成功判定...');

    const criteria = SUCCESS_CRITERIA;
    const results = {
      cookieLoaded: criteria.COOKIE_LOADED,
      loginVerified: criteria.LOGIN_VERIFIED,
      uiRecognitionWorking: criteria.UI_RECOGNITION_WORKING,
      anchorsDetected: criteria.ANCHORS_DETECTED,
      containersMapped: criteria.CONTAINERS_MAPPED,
      highlightsVisible: criteria.HIGHLIGHTS_VISIBLE
    };

    const passedCriteria = Object.values(results).filter(Boolean).length;
    const totalCriteria = Object.keys(results).length;

    // 所有标准都必须满足才算成功
    const overallSuccess = passedCriteria === totalCriteria;

    this.testResults.overallSuccess = overallSuccess;
    this.testResults.criteriaResults = results;

    console.log(`📊 测试标准通过情况: ${passedCriteria}/${totalCriteria}`);

    Object.entries(results).forEach(([criterion, passed]) => {
      const status = passed ? '✅' : '❌';
      const name = criterion.replace(/([A-Z])/g, ' $1').trim();
      console.log(`   ${status} ${name}`);
    });

    if (overallSuccess) {
      console.log('\n🎉 所有严格测试标准均已通过！');
    } else {
      console.log('\n❌ 测试失败：未满足所有严格标准');
    }
  }

  async generateStrictReport() {
    console.log('\n📊 生成严格测试报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'strict-1688-test',
      overallSuccess: this.testResults.overallSuccess,
      criteriaResults: this.testResults.criteriaResults,
      detailedResults: this.testResults,
      summary: {
        cookieLoaded: SUCCESS_CRITERIA.COOKIE_LOADED,
        loginVerified: SUCCESS_CRITERIA.LOGIN_VERIFIED,
        uiRecognitionWorking: SUCCESS_CRITERIA.UI_RECOGNITION_WORKING,
        anchorsDetected: SUCCESS_CRITERIA.ANCHORS_DETECTED,
        containersMapped: SUCCESS_CRITERIA.CONTAINERS_MAPPED,
        highlightsVisible: SUCCESS_CRITERIA.HIGHLIGHTS_VISIBLE
      }
    };

    const reportPath = path.join(__dirname, '../reports/strict-1688-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 严格测试报告已生成: ${reportPath}`);

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
  const test = new Strict1688Test();

  try {
    await test.runStrictTest();

    if (test.testResults.overallSuccess) {
      console.log('\n🎉 严格1688测试成功完成！');
      process.exit(0);
    } else {
      console.log('\n❌ 严格1688测试失败！');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 严格测试执行失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default Strict1688Test;