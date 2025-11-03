/**
 * 坐标校正测试
 * 实现坐标系统对齐和校正机制
 */

import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CoordinateCorrectionTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      originalAlignment: null,
      correctedAlignment: null,
      correctionMatrix: null,
      verificationResults: null
    };
    this.uiServiceUrl = 'http://localhost:8898';
  }

  async runCoordinateCorrectionTest() {
    console.log('🔧 开始坐标校正测试');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 导航到1688首页
      await this.navigateTo1688();

      // 3. 收集原始坐标数据
      await this.collectOriginalCoordinates();

      // 4. 分析坐标偏差模式
      await this.analyzeCoordinateDeviations();

      // 5. 计算校正矩阵
      await this.calculateCorrectionMatrix();

      // 6. 应用坐标校正
      await this.applyCoordinateCorrection();

      // 7. 验证校正效果
      await this.verifyCorrectionResults();

      // 8. 生成校正报告
      await this.generateCorrectionReport();

    } catch (error) {
      console.error('❌ 坐标校正测试失败:', error.message);
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

    // 加载Cookie
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

  async collectOriginalCoordinates() {
    console.log('📊 收集原始坐标数据...');

    // 选择用于校正的参考元素
    const referenceElements = [
      { selector: '#alisearch-input', name: '搜索框', type: 'input' },
      { selector: '.logo', name: 'Logo', type: 'image' },
      { selector: 'h1', name: '标题', type: 'text' }
    ];

    const coordinateData = [];

    for (const elementInfo of referenceElements) {
      try {
        // 获取Playwright坐标
        const playwrightElement = await this.page.$(elementInfo.selector);
        if (!playwrightElement) {
          console.log(`  ⚠️ 元素未找到: ${elementInfo.selector}`);
          continue;
        }

        const isVisible = await playwrightElement.isVisible();
        if (!isVisible) {
          console.log(`  ⚠️ 元素不可见: ${elementInfo.selector}`);
          continue;
        }

        const playwrightBbox = await playwrightElement.boundingBox();
        const text = await playwrightElement.textContent();

        // 获取页面内实际的坐标信息
        const actualPosition = await this.page.evaluate((selector) => {
          const elem = document.querySelector(selector);
          if (!elem) return null;

          const rect = elem.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(elem);

          return {
            clientRectX: rect.left,
            clientRectY: rect.top,
            clientRectWidth: rect.width,
            clientRectHeight: rect.height,
            offsetLeft: elem.offsetLeft,
            offsetTop: elem.offsetTop,
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            position: computedStyle.position
          };
        }, elementInfo.selector);

        coordinateData.push({
          element: elementInfo,
          playwrightCoords: playwrightBbox,
          actualPosition: actualPosition,
          timestamp: Date.now()
        });

        console.log(`  ✅ ${elementInfo.name}: PW(${playwrightBbox.x}, ${playwrightBbox.y}) Actual(${actualPosition?.clientRectX}, ${actualPosition?.clientRectY})`);

      } catch (error) {
        console.log(`  ❌ ${elementInfo.name}: ${error.message}`);
      }
    }

    this.testResults.originalAlignment = {
      elements: coordinateData,
      count: coordinateData.length,
      timestamp: Date.now()
    };

    console.log(`✅ 收集了 ${coordinateData.length} 个元素的原始坐标数据`);
  }

  async analyzeCoordinateDeviations() {
    console.log('📈 分析坐标偏差模式...');

    const originalData = this.testResults.originalAlignment;
    if (!originalData || originalData.count === 0) {
      console.log('❌ 没有原始坐标数据，无法分析偏差');
      return;
    }

    const deviations = [];

    for (const data of originalData.elements) {
      if (data.playwrightCoords && data.actualPosition) {
        const deviationX = data.actualPosition.clientX - data.playwrightCoords.x;
        const deviationY = data.actualPosition.clientY - data.playwrightCoords.y;
        const sizeDiffX = data.actualPosition.clientWidth - data.playwrightCoords.width;
        const sizeDiffY = data.actualPosition.clientHeight - data.playwrightCoords.height;

        deviations.push({
          element: data.element.name,
          deviationX,
          deviationY,
          sizeDiffX,
          sizeDiffY,
          playwrightCoords: data.playwrightCoords,
          actualPosition: data.actualPosition
        });

        console.log(`  📏 ${data.element.name}: 偏差(${deviationX.toFixed(2)}, ${deviationY.toFixed(2)}) 尺寸差异(${sizeDiffX.toFixed(2)}, ${sizeDiffY.toFixed(2)})`);
      }
    }

    // 计算平均偏差
    if (deviations.length > 0) {
      const avgDeviationX = deviations.reduce((sum, d) => sum + d.deviationX, 0) / deviations.length;
      const avgDeviationY = deviations.reduce((sum, d) => sum + d.deviationY, 0) / deviations.length;
      const avgSizeDiffX = deviations.reduce((sum, d) => sum + d.sizeDiffX, 0) / deviations.length;
      const avgSizeDiffY = deviations.reduce((sum, d) => sum + d.sizeDiffY, 0) / deviations.length;

      console.log(`📊 平均偏差: X=${avgDeviationX.toFixed(2)}, Y=${avgDeviationY.toFixed(2)}`);
      console.log(`📊 平均尺寸差异: X=${avgSizeDiffX.toFixed(2)}, Y=${avgSizeDiffY.toFixed(2)}`);

      this.testResults.deviationAnalysis = {
        deviations,
        averageDeviation: { x: avgDeviationX, y: avgDeviationY },
        averageSizeDiff: { x: avgSizeDiffX, y: avgSizeDiffY },
        count: deviations.length
      };
    }
  }

  async calculateCorrectionMatrix() {
    console.log('🧮 计算坐标校正矩阵...');

    const deviationAnalysis = this.testResults.deviationAnalysis;
    if (!deviationAnalysis) {
      console.log('❌ 没有偏差分析数据，无法计算校正矩阵');
      return;
    }

    // 基于平均偏差创建校正矩阵
    const correctionMatrix = {
      offsetX: -deviationAnalysis.averageDeviation.x, // 负号表示反向校正
      offsetY: -deviationAnalysis.averageDeviation.y,
      scaleX: 1.0, // 暂时不进行缩放校正
      scaleY: 1.0,
      sizeOffsetX: -deviationAnalysis.averageSizeDiff.x,
      sizeOffsetY: -deviationAnalysis.averageSizeDiff.y
    };

    console.log(`🔧 校正矩阵:`);
    console.log(`  位置偏移: X=${correctionMatrix.offsetX.toFixed(2)}, Y=${correctionMatrix.offsetY.toFixed(2)}`);
    console.log(`  缩放比例: X=${correctionMatrix.scaleX}, Y=${correctionMatrix.scaleY}`);
    console.log(`  尺寸偏移: X=${correctionMatrix.sizeOffsetX.toFixed(2)}, Y=${correctionMatrix.sizeOffsetY.toFixed(2)}`);

    this.testResults.correctionMatrix = correctionMatrix;
  }

  async applyCoordinateCorrection() {
    console.log('⚙️ 应用坐标校正...');

    const correctionMatrix = this.testResults.correctionMatrix;
    if (!correctionMatrix) {
      console.log('❌ 没有校正矩阵，无法应用校正');
      return;
    }

    // 截图并获取UI识别结果
    await this.page.waitForLoadState('networkidle');
    const screenshot = await this.page.screenshot({
      fullPage: true,
      type: 'png'
    });

    const screenshotBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;

    // 模拟UI识别结果（实际中应该调用真实的UI识别服务）
    const mockUIElements = [
      {
        id: 'search-input',
        type: 'input',
        bbox: { x1: 400, y1: 100, x2: 800, y2: 130 },
        confidence: 0.9,
        text: '搜索',
        description: '搜索框'
      },
      {
        id: 'logo',
        type: 'image',
        bbox: { x1: 50, y1: 30, x2: 200, y2: 80 },
        confidence: 0.8,
        text: '1688',
        description: '网站Logo'
      }
    ];

    console.log(`📸 原始UI识别结果: ${mockUIElements.length} 个元素`);

    // 应用坐标校正
    const correctedElements = mockUIElements.map(element => {
      const originalBbox = element.bbox;
      const correctedBbox = {
        x1: originalBbox.x1 + correctionMatrix.offsetX,
        y1: originalBbox.y1 + correctionMatrix.offsetY,
        x2: originalBbox.x2 + correctionMatrix.offsetX + correctionMatrix.sizeOffsetX,
        y2: originalBbox.y2 + correctionMatrix.offsetY + correctionMatrix.sizeOffsetY
      };

      return {
        ...element,
        originalBbox: originalBbox,
        correctedBbox: correctedBbox
      };
    });

    console.log(`✅ 坐标校正完成: ${correctedElements.length} 个元素`);

    this.testResults.correctedAlignment = {
      originalElements: mockUIElements,
      correctedElements: correctedElements,
      correctionMatrix: correctionMatrix,
      timestamp: Date.now()
    };
  }

  async verifyCorrectionResults() {
    console.log('✅ 验证校正效果...');

    const correctedData = this.testResults.correctedAlignment;
    if (!correctedData) {
      console.log('❌ 没有校正数据，无法验证');
      return;
    }

    // 添加对比高亮样式
    await this.page.addStyleTag({
      content: `
        .original-highlight {
          position: absolute !important;
          border: 3px solid red !important;
          background: rgba(255, 0, 0, 0.1) !important;
          box-sizing: border-box !important;
          z-index: 999999 !important;
          pointer-events: none !important;
        }
        .corrected-highlight {
          position: absolute !important;
          border: 3px solid green !important;
          background: rgba(0, 255, 0, 0.1) !important;
          box-sizing: border-box !important;
          z-index: 999998 !important;
          pointer-events: none !important;
        }
        .reference-highlight {
          position: absolute !important;
          border: 3px solid blue !important;
          background: rgba(0, 0, 255, 0.1) !important;
          box-sizing: border-box !important;
          z-index: 999997 !important;
          pointer-events: none !important;
        }
        .highlight-label {
          position: absolute !important;
          top: -25px !important;
          left: 0 !important;
          padding: 3px 6px !important;
          font-size: 11px !important;
          font-family: monospace !important;
          border-radius: 3px !important;
          z-index: 1000000 !important;
          white-space: nowrap !important;
          color: white !important;
          font-weight: bold !important;
        }
        .original-label { background: red !important; }
        .corrected-label { background: green !important; }
        .reference-label { background: blue !important; }
      `
    });

    let originalHighlights = 0;
    let correctedHighlights = 0;
    let referenceHighlights = 0;

    // 添加原始坐标高亮（红色）
    for (let i = 0; i < correctedData.originalElements.length; i++) {
      const element = correctedData.originalElements[i];

      try {
        await this.page.evaluate((params) => {
          const { element: elem, index } = params;
          const highlight = document.createElement('div');
          highlight.className = 'original-highlight';
          highlight.id = `original-${index}`;
          highlight.style.cssText = `
            left: ${elem.bbox.x1}px;
            top: ${elem.bbox.y1}px;
            width: ${elem.bbox.x2 - elem.bbox.x1}px;
            height: ${elem.bbox.y2 - elem.bbox.y1}px;
          `;

          const label = document.createElement('div');
          label.className = 'highlight-label original-label';
          label.textContent = `原始: ${elem.type}`;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          return { success: true, id: highlight.id };
        }, { element: element, index: i });

        originalHighlights++;
      } catch (error) {
        console.log(`原始高亮添加失败: ${element.id} - ${error.message}`);
      }
    }

    // 添加校正后坐标高亮（绿色）
    for (let i = 0; i < correctedData.correctedElements.length; i++) {
      const element = correctedData.correctedElements[i];

      try {
        await this.page.evaluate((params) => {
          const { element: elem, index } = params;
          const highlight = document.createElement('div');
          highlight.className = 'corrected-highlight';
          highlight.id = `corrected-${index}`;
          highlight.style.cssText = `
            left: ${elem.correctedBbox.x1}px;
            top: ${elem.correctedBbox.y1}px;
            width: ${elem.correctedBbox.x2 - elem.correctedBbox.x1}px;
            height: ${elem.correctedBbox.y2 - elem.correctedBbox.y1}px;
          `;

          const label = document.createElement('div');
          label.className = 'highlight-label corrected-label';
          label.textContent = `校正: ${elem.type}`;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          return { success: true, id: highlight.id };
        }, { element: element, index: i });

        correctedHighlights++;
      } catch (error) {
        console.log(`校正高亮添加失败: ${element.id} - ${error.message}`);
      }
    }

    // 添加参考元素高亮（蓝色）
    const referenceElements = ['#alisearch-input', '.logo'];
    for (let i = 0; i < referenceElements.length; i++) {
      const selector = referenceElements[i];

      try {
        const element = await this.page.$(selector);
        if (element && await element.isVisible()) {
          const bbox = await element.boundingBox();

          await this.page.evaluate((params) => {
            const { bbox: rect, selector: sel, index: idx } = params;
            const highlight = document.createElement('div');
            highlight.className = 'reference-highlight';
            highlight.id = `reference-${idx}`;
            highlight.style.cssText = `
              left: ${rect.x}px;
              top: ${rect.y}px;
              width: ${rect.width}px;
              height: ${rect.height}px;
            `;

            const label = document.createElement('div');
            label.className = 'highlight-label reference-label';
            label.textContent = `参考: ${sel.substring(1)}`;

            highlight.appendChild(label);
            document.body.appendChild(highlight);

            return { success: true, id: highlight.id };
          }, { bbox, selector, index: i });

          referenceHighlights++;
        }
      } catch (error) {
        console.log(`参考高亮添加失败: ${selector} - ${error.message}`);
      }
    }

    console.log(`✅ 验证高亮创建完成: 原始(${originalHighlights}) + 校正(${correctedHighlights}) + 参考(${referenceHighlights})`);

    // 截屏验证校正效果
    await this.page.waitForTimeout(3000);
    const verificationScreenshot = await this.page.screenshot({
      fullPage: true,
      type: 'png'
    });

    const verificationPath = path.join(__dirname, '../screenshots/coordinate-correction-verification.png');
    fs.writeFileSync(verificationPath, verificationScreenshot);

    console.log(`📸 校正验证截图已保存: ${verificationPath}`);

    // 保持浏览器打开15秒让用户观察
    console.log('👁️ 浏览器将保持打开15秒以便观察校正效果...');
    console.log('📌 红色框 = 原始坐标，绿色框 = 校正后坐标，蓝色框 = 参考坐标');
    await this.page.waitForTimeout(15000);

    this.testResults.verificationResults = {
      originalHighlights,
      correctedHighlights,
      referenceHighlights,
      verificationScreenshotPath: verificationPath,
      screenshotSize: verificationScreenshot.length,
      timestamp: Date.now()
    };
  }

  async generateCorrectionReport() {
    console.log('📊 生成坐标校正报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'coordinate-correction-test',
      testResults: this.testResults,
      summary: {
        originalElementsCount: this.testResults.originalAlignment?.count || 0,
        deviationAnalysisAvailable: !!this.testResults.deviationAnalysis,
        correctionMatrixCalculated: !!this.testResults.correctionMatrix,
        correctedElementsCount: this.testResults.correctedAlignment?.correctedElements?.length || 0,
        verificationHighlights: this.testResults.verificationResults
      },
      recommendations: this.generateCorrectionRecommendations()
    };

    const reportPath = path.join(__dirname, '../reports/coordinate-correction-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 坐标校正报告已生成: ${reportPath}`);

    // 输出校正结果总结
    console.log('\n🔧 校正结果总结:');
    if (this.testResults.correctionMatrix) {
      const cm = this.testResults.correctionMatrix;
      console.log(`  校正偏移: X=${cm.offsetX.toFixed(2)}, Y=${cm.offsetY.toFixed(2)}`);
    }
    console.log(`  校正元素: ${this.testResults.correctedAlignment?.correctedElements?.length || 0} 个`);
    console.log(`  验证高亮: ${this.testResults.verificationResults?.correctedHighlights || 0} 个`);

    return report;
  }

  generateCorrectionRecommendations() {
    const recommendations = [];

    if (this.testResults.correctionMatrix) {
      const cm = this.testResults.correctionMatrix;
      if (Math.abs(cm.offsetX) > 10 || Math.abs(cm.offsetY) > 10) {
        recommendations.push("坐标偏差较大，建议使用校正矩阵进行坐标转换");
      }

      if (cm.scaleX !== 1.0 || cm.scaleY !== 1.0) {
        recommendations.push("检测到缩放问题，建议在坐标转换中考虑缩放因子");
      }
    }

    recommendations.push("建议建立持续的坐标校正机制，定期验证坐标准确性");
    recommendations.push("考虑不同分辨率和缩放比例下的坐标兼容性");
    recommendations.push("为不同类型的UI元素建立专门的校正策略");

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
  const test = new CoordinateCorrectionTest();

  try {
    await test.runCoordinateCorrectionTest();
    console.log('\n✅ 坐标校正测试完成');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 坐标校正测试失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CoordinateCorrectionTest;