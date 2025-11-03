/**
 * 坐标系统调试测试
 * 专门用于诊断和修复坐标对齐问题
 */

import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CoordinateDebugTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      screenshotCoordinates: null,
      elementCoordinates: null,
      alignmentTest: null,
      correctedCoordinates: null
    };
    this.uiServiceUrl = 'http://localhost:8898';
  }

  async runCoordinateDebugTest() {
    console.log('🔍 开始坐标系统调试测试');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 导航到1688首页
      await this.navigateTo1688();

      // 3. 获取页面视口信息
      await this.getPageViewportInfo();

      // 4. 测试Playwright元素坐标
      await this.testPlaywrightCoordinates();

      // 5. 截图并测试UI识别坐标
      await this.testUIRecognitionCoordinates();

      // 6. 坐标对齐测试
      await this.performCoordinateAlignmentTest();

      // 7. 创建正确的可视化高亮
      await this.createCorrectedHighlights();

      // 8. 生成坐标调试报告
      await this.generateCoordinateReport();

    } catch (error) {
      console.error('❌ 坐标调试测试失败:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async launchBrowser() {
    console.log('🌐 启动浏览器...');
    this.browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    this.page = await context.newPage();
    this.page.setDefaultTimeout(30000);
    console.log('✅ 浏览器启动成功');
  }

  async navigateTo1688() {
    console.log('🔗 导航到1688首页...');

    // 尝试加载已保存的Cookie
    const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
    if (fs.existsSync(cookiePath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
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

        await this.page.context().addCookies(playwrightCookies);
        console.log(`✅ 已加载 ${cookies.length} 个Cookie`);
      } catch (error) {
        console.log('⚠️ Cookie加载失败，继续无Cookie访问');
      }
    }

    await this.page.goto('https://www.1688.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await this.page.waitForTimeout(3000);
    console.log('✅ 已导航到1688首页');
  }

  async getPageViewportInfo() {
    console.log('📐 获取页面视口信息...');

    const viewportInfo = await this.page.evaluate(() => {
      return {
        // 页面视口信息
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        pageXOffset: window.pageXOffset,
        pageYOffset: window.pageYOffset,

        // 设备像素比
        devicePixelRatio: window.devicePixelRatio,

        // 文档尺寸
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,

        // 元素偏移
        documentOffsetLeft: document.documentElement.offsetLeft,
        documentOffsetTop: document.documentElement.offsetTop
      };
    });

    console.log('页面视口信息:');
    console.log(`  视口尺寸: ${viewportInfo.innerWidth} x ${viewportInfo.innerHeight}`);
    console.log(`  页面偏移: ${viewportInfo.pageXOffset}, ${viewportInfo.pageYOffset}`);
    console.log(`  设备像素比: ${viewportInfo.devicePixelRatio}`);
    console.log(`  文档尺寸: ${viewportInfo.documentWidth} x ${viewportInfo.documentHeight}`);

    this.testResults.viewportInfo = viewportInfo;
  }

  async testPlaywrightCoordinates() {
    console.log('🎯 测试Playwright元素坐标...');

    // 选择一些明显的元素进行测试
    const testSelectors = [
      '#alisearch-input',
      '.userAvatarLogo img',
      '.logo',
      'h1'
    ];

    const elementCoordinates = [];

    for (const selector of testSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            const bbox = await element.boundingBox();
            const text = await element.textContent();

            if (bbox) {
              // 获取元素在页面中的实际位置
              const actualPosition = await this.page.evaluate((sel) => {
                const elem = document.querySelector(sel);
                if (!elem) return null;

                const rect = elem.getBoundingClientRect();
                return {
                  clientRectX: rect.left,
                  clientRectY: rect.top,
                  clientRectWidth: rect.width,
                  clientRectHeight: rect.height,
                  offsetLeft: elem.offsetLeft,
                  offsetTop: elem.offsetTop,
                  scrollLeft: elem.scrollLeft,
                  scrollTop: elem.scrollTop
                };
              }, selector);

              elementCoordinates.push({
                selector,
                text: text?.substring(0, 50) || '',
                playwrightBbox: bbox,
                actualPosition,
                visible: true
              });

              console.log(`  ✅ ${selector}: Playwright(${bbox.x}, ${bbox.y}) vs ClientRect(${actualPosition?.clientRectX}, ${actualPosition?.clientRectY})`);
            }
          }
        }
      } catch (error) {
        console.log(`  ❌ ${selector}: ${error.message}`);
      }
    }

    this.testResults.elementCoordinates = elementCoordinates;
    console.log(`✅ 测试了 ${elementCoordinates.length} 个元素的坐标`);
  }

  async testUIRecognitionCoordinates() {
    console.log('🤖 测试UI识别坐标系统...');

    try {
      // 截图
      await this.page.waitForLoadState('networkidle');
      const screenshot = await this.page.screenshot({
        fullPage: true,
        type: 'png'
      });

      const screenshotBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;
      console.log(`📸 截图完成，大小: ${screenshot.length} bytes`);

      // 获取截图信息
      const screenshotInfo = await this.page.evaluate(() => {
        return {
          // 获取页面当前滚动位置
          scrollX: window.pageXOffset,
          scrollY: window.pageYOffset,
          // 获取视口尺寸
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        };
      });

      console.log(`截图时页面状态:`);
      console.log(`  滚动位置: (${screenshotInfo.scrollX}, ${screenshotInfo.scrollY})`);
      console.log(`  视口尺寸: ${screenshotInfo.viewportWidth} x ${screenshotInfo.viewportHeight}`);

      // 调用UI识别服务
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
        const elements = response.data.elements;
        console.log(`✅ UI识别成功：识别到 ${elements.length} 个元素`);

        this.testResults.screenshotCoordinates = {
          elements,
          screenshotInfo,
          screenshotSize: screenshot.length
        };

        return elements;
      } else {
        throw new Error('UI识别服务返回失败结果');
      }

    } catch (error) {
      console.log('⚠️ UI识别服务不可用，使用模拟数据');

      // 使用模拟数据进行坐标测试
      const mockElements = [
        {
          id: 'search-input',
          type: 'input',
          bbox: { x1: 400, y1: 100, x2: 800, y2: 130 },
          confidence: 0.9,
          text: '搜索',
          description: '搜索框'
        },
        {
          id: 'user-avatar',
          type: 'image',
          bbox: { x1: 1700, y1: 20, x2: 1780, y2: 100 },
          confidence: 0.8,
          text: '用户',
          description: '用户头像'
        }
      ];

      this.testResults.screenshotCoordinates = {
        elements: mockElements,
        screenshotInfo: { scrollX: 0, scrollY: 0, viewportWidth: 1920, viewportHeight: 1080 },
        screenshotSize: 4000000
      };

      return mockElements;
    }
  }

  async performCoordinateAlignmentTest() {
    console.log('📏 执行坐标对齐测试...');

    const elementCoords = this.testResults.elementCoordinates;
    const screenshotCoords = this.testResults.screenshotCoordinates;

    if (!elementCoords || !screenshotCoords) {
      console.log('❌ 缺少坐标数据，无法进行对齐测试');
      return;
    }

    console.log('\n坐标对比分析:');

    // 寻找对应元素进行对比
    for (const element of elementCoords) {
      // 查找匹配的UI识别结果
      const matchingScreenshotElement = this.findMatchingScreenshotElement(element, screenshotCoords.elements);

      if (matchingScreenshotElement) {
        const playwrightCoords = element.playwrightBbox;
        const screenshotElementCoords = matchingScreenshotElement.bbox;

        console.log(`\n元素: ${element.selector}`);
        console.log(`  Playwright坐标: (${playwrightCoords.x}, ${playwrightCoords.y}) - (${playwrightCoords.x + playwrightCoords.width}, ${playwrightCoords.y + playwrightCoords.height})`);
        console.log(`  UI识别坐标: (${screenshotElementCoords.x1}, ${screenshotElementCoords.y1}) - (${screenshotElementCoords.x2}, ${screenshotElementCoords.y2})`);

        // 计算偏移量
        const offsetX = screenshotElementCoords.x1 - playwrightCoords.x;
        const offsetY = screenshotElementCoords.y1 - playwrightCoords.y;

        console.log(`  偏移量: X=${offsetX}, Y=${offsetY}`);

        // 验证尺寸是否匹配
        const playwrightWidth = playwrightCoords.width;
        const playwrightHeight = playwrightCoords.height;
        const screenshotWidth = screenshotElementCoords.x2 - screenshotElementCoords.x1;
        const screenshotHeight = screenshotElementCoords.y2 - screenshotElementCoords.y1;

        console.log(`  尺寸对比: Playwright(${playwrightWidth}x${playwrightHeight}) vs UI识别(${screenshotWidth}x${screenshotHeight})`);
      }
    }

    // 保存对齐测试结果
    this.testResults.alignmentTest = {
      compared: true,
      timestamp: Date.now()
    };
  }

  findMatchingScreenshotElement(element, screenshotElements) {
    // 简单的匹配逻辑：基于元素类型和文本
    for (const screenshotElement of screenshotElements) {
      if (element.selector.includes('search') && screenshotElement.type === 'input') {
        return screenshotElement;
      }
      if (element.selector.includes('avatar') && screenshotElement.type === 'image') {
        return screenshotElement;
      }
      if (element.selector.includes('logo') && screenshotElement.type === 'image') {
        return screenshotElement;
      }
    }
    return null;
  }

  async createCorrectedHighlights() {
    console.log('🎨 创建校正后的可视化高亮...');

    const screenshotElements = this.testResults.screenshotCoordinates?.elements;
    const elementCoords = this.testResults.elementCoordinates;

    if (!screenshotElements || !elementCoords) {
      console.log('❌ 缺少坐标数据，无法创建高亮');
      return;
    }

    // 添加调试高亮样式
    await this.page.addStyleTag({
      content: `
        .debug-highlight {
          position: absolute !important;
          border: 3px solid red !important;
          background: rgba(255, 0, 0, 0.1) !important;
          box-sizing: border-box !important;
          z-index: 999999 !important;
          pointer-events: none !important;
        }
        .debug-label {
          position: absolute !important;
          top: -25px !important;
          left: 0 !important;
          background: red !important;
          color: white !important;
          padding: 3px 6px !important;
          font-size: 11px !important;
          font-family: monospace !important;
          border-radius: 3px !important;
          z-index: 1000000 !important;
          white-space: nowrap !important;
        }
        .playwright-highlight {
          position: absolute !important;
          border: 3px solid blue !important;
          background: rgba(0, 0, 255, 0.1) !important;
          box-sizing: border-box !important;
          z-index: 999998 !important;
          pointer-events: none !important;
        }
        .playwright-label {
          position: absolute !important;
          top: -25px !important;
          left: 0 !important;
          background: blue !important;
          color: white !important;
          padding: 3px 6px !important;
          font-size: 11px !important;
          font-family: monospace !important;
          border-radius: 3px !important;
          z-index: 999999 !important;
          white-space: nowrap !important;
        }
      `
    });

    let uiHighlightsAdded = 0;
    let playwrightHighlightsAdded = 0;

    // 添加UI识别结果的高亮（红色）
    for (let i = 0; i < screenshotElements.length; i++) {
      const element = screenshotElements[i];

      try {
        await this.page.evaluate((params) => {
          const { element: elem, index } = params;
          const highlight = document.createElement('div');
          highlight.className = 'debug-highlight';
          highlight.id = `ui-debug-${index}`;
          highlight.style.cssText = `
            left: ${elem.bbox.x1}px;
            top: ${elem.bbox.y1}px;
            width: ${elem.bbox.x2 - elem.bbox.x1}px;
            height: ${elem.bbox.y2 - elem.bbox.y1}px;
          `;

          const label = document.createElement('div');
          label.className = 'debug-label';
          label.textContent = `UI: ${elem.type} (${elem.bbox.x1},${elem.bbox.y1})`;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          return { success: true, id: highlight.id };
        }, { element: element, index: i });

        uiHighlightsAdded++;
      } catch (error) {
        console.log(`UI高亮添加失败: ${element.id} - ${error.message}`);
      }
    }

    // 添加Playwright元素的高亮（蓝色）
    for (let i = 0; i < elementCoords.length; i++) {
      const element = elementCoords[i];

      try {
        await this.page.evaluate((params) => {
          const { element: elem, index } = params;
          const bbox = elem.playwrightBbox;
          const highlight = document.createElement('div');
          highlight.className = 'playwright-highlight';
          highlight.id = `playwright-debug-${index}`;
          highlight.style.cssText = `
            left: ${bbox.x}px;
            top: ${bbox.y}px;
            width: ${bbox.width}px;
            height: ${bbox.height}px;
          `;

          const label = document.createElement('div');
          label.className = 'playwright-label';
          label.textContent = `PW: ${elem.selector.substring(0, 10)} (${bbox.x},${bbox.y})`;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          return { success: true, id: highlight.id };
        }, { element: element, index: i });

        playwrightHighlightsAdded++;
      } catch (error) {
        console.log(`Playwright高亮添加失败: ${element.selector} - ${error.message}`);
      }
    }

    console.log(`✅ 调试高亮创建完成: UI识别(${uiHighlightsAdded}) + Playwright(${playwrightHighlightsAdded})`);

    // 保持浏览器打开3秒让高亮完全渲染
    console.log('⏳ 等待高亮完全渲染...');
    await this.page.waitForTimeout(3000);

    // 截屏验证高亮对齐情况
    await this.captureAndVerifyHighlights();

    // 保持浏览器打开10秒让用户观察对比
    console.log('👁️ 浏览器将保持打开10秒以便观察坐标对比...');
    console.log('📌 红色框 = UI识别坐标，蓝色框 = Playwright坐标');
    await this.page.waitForTimeout(10000);

    this.testResults.correctedCoordinates = {
      uiHighlightsAdded,
      playwrightHighlightsAdded,
      total: uiHighlightsAdded + playwrightHighlightsAdded
    };
  }

  async captureAndVerifyHighlights() {
    console.log('📸 截屏验证高亮对齐情况...');

    try {
      // 截取带有高亮的屏幕
      const screenshotWithHighlights = await this.page.screenshot({
        fullPage: true,
        type: 'png'
      });

      const screenshotBase64 = `data:image/png;base64,${screenshotWithHighlights.toString('base64')}`;
      console.log(`📸 高亮截图完成，大小: ${screenshotWithHighlights.length} bytes`);

      // 保存截图到文件系统
      const screenshotPath = path.join(__dirname, '../screenshots/highlight-alignment-test.png');
      const screenshotDir = path.dirname(screenshotPath);

      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      fs.writeFileSync(screenshotPath, screenshotWithHighlights);
      console.log(`💾 截图已保存到: ${screenshotPath}`);

      // 使用UI识别服务来分析截图中的高亮是否对齐
      await this.analyzeHighlightAlignment(screenshotBase64);

      this.testResults.highlightVerification = {
        screenshotPath,
        screenshotSize: screenshotWithHighlights.length,
        timestamp: Date.now()
      };

    } catch (error) {
      console.log(`⚠️ 截屏验证失败: ${error.message}`);
    }
  }

  async analyzeHighlightAlignment(screenshotBase64) {
    console.log('🔍 分析高亮对齐情况...');

    try {
      // 调用UI识别服务分析截图中的高亮框和元素的对齐情况
      const response = await axios.post(`${this.uiServiceUrl}/api/recognize`, {
        request_id: Date.now(),
        image: screenshotBase64,
        query: '分析截图中的彩色高亮框（红色和蓝色）与下方页面元素的对齐情况。红色框代表UI识别坐标，蓝色框代表Playwright坐标。请检查这些高亮框是否准确包围了相应的UI元素，特别是搜索框和用户头像区域。如果发现不对齐，请描述具体的偏移情况。',
        scope: 'full',
        parameters: {
          temperature: 0.1,
          max_tokens: 8192
        }
      });

      if (response.data.success && response.data.elements) {
        console.log('✅ 高亮对齐分析完成');

        // 分析识别结果，寻找高亮框信息
        const highlightElements = response.data.elements.filter(el =>
          el.description?.includes('高亮') ||
          el.description?.includes('框') ||
          el.type === 'highlight' ||
          el.text?.includes('红色') ||
          el.text?.includes('蓝色')
        );

        if (highlightElements.length > 0) {
          console.log(`🎯 识别到 ${highlightElements.length} 个高亮相关元素:`);
          highlightElements.forEach((element, index) => {
            console.log(`  ${index + 1}. ${element.type}: ${element.description} (置信度: ${element.confidence})`);
          });
        } else {
          console.log('⚠️ 未识别到高亮框，可能需要调整识别prompt');
        }

        // 保存对齐分析结果
        this.testResults.highlightAlignmentAnalysis = {
          success: true,
          totalElements: response.data.elements.length,
          highlightElements: highlightElements.length,
          analysis: response.data.elements
        };

      } else {
        throw new Error('UI识别服务返回失败结果');
      }

    } catch (error) {
      console.log('⚠️ UI识别服务不可用，使用基本分析');

      // 基本分析：手动检查高亮框位置
      const basicAnalysis = await this.page.evaluate(() => {
        const redHighlights = document.querySelectorAll('.debug-highlight');
        const blueHighlights = document.querySelectorAll('.playwright-highlight');
        const searchInput = document.querySelector('#alisearch-input');
        const userAvatar = document.querySelector('.userAvatarLogo img');

        const results = {
          redHighlightCount: redHighlights.length,
          blueHighlightCount: blueHighlights.length,
          searchInputFound: !!searchInput,
          userAvatarFound: !!userAvatar
        };

        if (searchInput) {
          const searchRect = searchInput.getBoundingClientRect();
          results.searchInputPosition = {
            x: searchRect.left,
            y: searchRect.top,
            width: searchRect.width,
            height: searchRect.height
          };
        }

        if (userAvatar) {
          const avatarRect = userAvatar.getBoundingClientRect();
          results.userAvatarPosition = {
            x: avatarRect.left,
            y: avatarRect.top,
            width: avatarRect.width,
            height: avatarRect.height
          };
        }

        return results;
      });

      console.log('📊 基本分析结果:');
      console.log(`  红色高亮框: ${basicAnalysis.redHighlightCount} 个`);
      console.log(`  蓝色高亮框: ${basicAnalysis.blueHighlightCount} 个`);
      console.log(`  搜索框位置: ${JSON.stringify(basicAnalysis.searchInputPosition)}`);
      console.log(`  用户头像位置: ${JSON.stringify(basicAnalysis.userAvatarPosition)}`);

      this.testResults.highlightAlignmentAnalysis = {
        success: true,
        method: 'basic',
        results: basicAnalysis
      };
    }
  }

  async generateCoordinateReport() {
    console.log('📊 生成坐标调试报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'coordinate-debug-test',
      testResults: this.testResults,
      summary: {
        viewportInfo: this.testResults.viewportInfo,
        elementCoordinatesCount: this.testResults.elementCoordinates?.length || 0,
        screenshotElementsCount: this.testResults.screenshotCoordinates?.elements?.length || 0,
        alignmentTestPerformed: this.testResults.alignmentTest?.compared || false,
        highlightsCreated: this.testResults.correctedCoordinates?.total || 0
      },
      recommendations: this.generateRecommendations()
    };

    const reportPath = path.join(__dirname, '../reports/coordinate-debug-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 坐标调试报告已生成: ${reportPath}`);

    // 输出关键发现
    console.log('\n🔍 关键发现:');
    if (this.testResults.viewportInfo) {
      const vp = this.testResults.viewportInfo;
      console.log(`  视口与文档可能有差异: 视口${vp.innerWidth}x${vp.innerHeight}, 文档${vp.documentWidth}x${vp.documentHeight}`);
    }

    console.log(`  Playwright检测到 ${this.testResults.elementCoordinates?.length || 0} 个元素`);
    console.log(`  UI识别检测到 ${this.testResults.screenshotCoordinates?.elements?.length || 0} 个元素`);
    console.log(`  创建了 ${this.testResults.correctedCoordinates?.total || 0} 个调试高亮`);

    return report;
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.testResults.viewportInfo) {
      const vp = this.testResults.viewportInfo;
      if (vp.pageXOffset !== 0 || vp.pageYOffset !== 0) {
        recommendations.push("页面有滚动偏移，需要考虑scrollX/Y坐标转换");
      }
      if (vp.devicePixelRatio !== 1) {
        recommendations.push("设备像素比不为1，可能需要缩放坐标");
      }
    }

    recommendations.push("需要验证UI识别服务返回的坐标是相对于图像还是视口");
    recommendations.push("可能需要根据页面滚动状态调整坐标映射");
    recommendations.push("建议添加坐标转换函数统一不同坐标系统");

    return recommendations;
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
  const test = new CoordinateDebugTest();

  try {
    await test.runCoordinateDebugTest();
    console.log('\n✅ 坐标调试测试完成');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 坐标调试测试失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CoordinateDebugTest;