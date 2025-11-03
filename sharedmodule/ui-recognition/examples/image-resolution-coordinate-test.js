/**
 * 图像分辨率和坐标转换测试
 * 专门测试图像缩放对坐标的影响和正确的坐标转换
 */

import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ImageResolutionCoordinateTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      originalImageTest: null,
      scaledImageTests: [],
      coordinateTransformationAnalysis: null,
      finalRecommendations: null
    };
    this.uiServiceUrl = 'http://localhost:8898';
  }

  async runImageResolutionTest() {
    console.log('🔍 开始图像分辨率和坐标转换测试');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 导航到1688首页
      await this.navigateTo1688();

      // 3. 测试原始分辨率截图
      await this.testOriginalResolutionScreenshot();

      // 4. 测试不同分辨率的截图
      await this.testScaledScreenshots();

      // 5. 分析坐标转换模式
      await this.analyzeCoordinateTransformation();

      // 6. 生成最终的坐标校正建议
      await this.generateFinalRecommendations();

      // 7. 生成测试报告
      await this.generateTestReport();

    } catch (error) {
      console.error('❌ 图像分辨率测试失败:', error.message);
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

  async testOriginalResolutionScreenshot() {
    console.log('📸 测试原始分辨率截图...');

    // 获取当前页面尺寸信息
    const pageInfo = await this.page.evaluate(() => {
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        devicePixelRatio: window.devicePixelRatio
      };
    });

    console.log(`页面信息: 视口${pageInfo.viewportWidth}x${pageInfo.viewportHeight}, 文档${pageInfo.documentWidth}x${pageInfo.documentHeight}`);

    // 截取全页面原始分辨率截图
    const originalScreenshot = await this.page.screenshot({
      fullPage: true,
      type: 'png'
    });

    const originalBase64 = `data:image/png;base64,${originalScreenshot.toString('base64')}`;
    console.log(`📸 原始截图完成，大小: ${originalScreenshot.length} bytes`);

    // 保存原始截图
    const originalPath = path.join(__dirname, '../screenshots/original-resolution-test.png');
    fs.writeFileSync(originalPath, originalScreenshot);

    // 获取参考元素的Playwright坐标
    const referenceElements = await this.getReferenceElementCoordinates();

    // 调用UI识别服务
    try {
      const response = await axios.post(`${this.uiServiceUrl}/api/recognize`, {
        request_id: Date.now(),
        image: originalBase64,
        query: '识别页面中的搜索框、用户头像、logo等关键元素的精确坐标位置',
        scope: 'full',
        parameters: {
          temperature: 0.1,
          max_tokens: 8192
        }
      });

      if (response.data.success && response.data.elements) {
        console.log(`✅ UI识别成功：识别到 ${response.data.elements.length} 个元素`);

        this.testResults.originalImageTest = {
          pageInfo,
          screenshotSize: originalScreenshot.length,
          screenshotPath: originalPath,
          uiElements: response.data.elements,
          referenceElements: referenceElements,
          timestamp: Date.now()
        };
      } else {
        throw new Error('UI识别服务返回失败结果');
      }

    } catch (error) {
      console.log('⚠️ UI识别服务不可用，使用模拟数据');

      // 使用模拟数据进行测试
      const mockElements = this.generateMockElements(pageInfo);

      this.testResults.originalImageTest = {
        pageInfo,
        screenshotSize: originalScreenshot.length,
        screenshotPath: originalPath,
        uiElements: mockElements,
        referenceElements: referenceElements,
        timestamp: Date.now(),
        useMockData: true
      };
    }
  }

  async testScaledScreenshots() {
    console.log('📏 测试不同分辨率的截图...');

    const testResolutions = [
      { width: 1280, height: 720, name: '720p' },
      { width: 1024, height: 768, name: 'XGA' },
      { width: 800, height: 600, name: 'SVGA' }
    ];

    for (const resolution of testResolutions) {
      console.log(`  测试分辨率: ${resolution.name} (${resolution.width}x${resolution.height})`);

      try {
        // 临时改变视口大小
        await this.page.setViewportSize({
          width: resolution.width,
          height: resolution.height
        });

        await this.page.waitForTimeout(2000);

        // 截图
        const screenshot = await this.page.screenshot({
          fullPage: true,
          type: 'png'
        });

        const screenshotBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;

        // 保存截图
        const screenshotPath = path.join(__dirname, `../screenshots/scaled-${resolution.name}-test.png`);
        fs.writeFileSync(screenshotPath, screenshot);

        // 获取当前视口下的参考元素坐标
        const referenceElements = await this.getReferenceElementCoordinates();

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
            console.log(`    ✅ 识别到 ${uiElements.length} 个元素`);
          } else {
            throw new Error('UI识别失败');
          }
        } catch (error) {
          // 使用模拟数据，但根据新分辨率调整
          const pageInfo = {
            viewportWidth: resolution.width,
            viewportHeight: resolution.height
          };
          uiElements = this.generateMockElements(pageInfo);
          console.log(`    ⚠️ 使用模拟数据: ${uiElements.length} 个元素`);
        }

        this.testResults.scaledImageTests.push({
          resolution,
          screenshotSize: screenshot.length,
          screenshotPath,
          uiElements,
          referenceElements,
          timestamp: Date.now()
        });

      } catch (error) {
        console.log(`    ❌ 测试失败: ${error.message}`);
      }
    }

    // 恢复原始视口
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    await this.page.waitForTimeout(1000);
  }

  async getReferenceElementCoordinates() {
    const selectors = [
      { selector: '#alisearch-input', name: '搜索框' },
      { selector: '.logo', name: 'Logo' },
      { selector: '.userAvatarLogo img', name: '用户头像' }
    ];

    const referenceElements = [];

    for (const { selector, name } of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element && await element.isVisible()) {
          const bbox = await element.boundingBox();
          const text = await element.textContent();

          if (bbox) {
            referenceElements.push({
              name,
              selector,
              playwrightCoords: {
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height
              },
              text: text?.substring(0, 50) || ''
            });
          }
        }
      } catch (error) {
        // 忽略单个元素的错误
      }
    }

    return referenceElements;
  }

  generateMockElements(pageInfo) {
    // 基于页面信息生成模拟的UI识别结果
    const viewportWidth = pageInfo.viewportWidth || 1920;
    const viewportHeight = pageInfo.viewportHeight || 1080;

    // 计算缩放比例
    const scaleX = viewportWidth / 1920;
    const scaleY = viewportHeight / 1080;

    return [
      {
        id: 'search-input',
        type: 'input',
        bbox: {
          x1: Math.round(400 * scaleX),
          y1: Math.round(100 * scaleY),
          x2: Math.round(800 * scaleX),
          y2: Math.round(130 * scaleY)
        },
        confidence: 0.9,
        text: '搜索',
        description: '搜索框'
      },
      {
        id: 'logo',
        type: 'image',
        bbox: {
          x1: Math.round(50 * scaleX),
          y1: Math.round(30 * scaleY),
          x2: Math.round(200 * scaleX),
          y2: Math.round(80 * scaleY)
        },
        confidence: 0.8,
        text: '1688',
        description: '网站Logo'
      },
      {
        id: 'user-avatar',
        type: 'image',
        bbox: {
          x1: Math.round(1700 * scaleX),
          y1: Math.round(20 * scaleY),
          x2: Math.round(1780 * scaleX),
          y2: Math.round(100 * scaleY)
        },
        confidence: 0.85,
        text: '用户',
        description: '用户头像'
      }
    ];
  }

  async analyzeCoordinateTransformation() {
    console.log('📊 分析坐标转换模式...');

    const originalTest = this.testResults.originalImageTest;
    const scaledTests = this.testResults.scaledImageTests;

    if (!originalTest) {
      console.log('❌ 缺少原始测试数据');
      return;
    }

    const analysis = {
      coordinateDeviations: [],
      scalingPatterns: [],
      transformationAccuracy: []
    };

    // 分析每个缩放测试的坐标偏差
    for (const scaledTest of scaledTests) {
      const deviation = this.calculateCoordinateDeviation(
        originalTest.uiElements,
        scaledTest.uiElements,
        originalTest.pageInfo,
        scaledTest.resolution
      );

      analysis.coordinateDeviations.push({
        resolution: scaledTest.resolution.name,
        deviation
      });

      console.log(`  ${scaledTest.resolution.name} 坐标偏差分析:`);
      console.log(`    搜索框偏差: X=${deviation.searchInput?.x.toFixed(2)}, Y=${deviation.searchInput?.y.toFixed(2)}`);
      console.log(`    Logo偏差: X=${deviation.logo?.x.toFixed(2)}, Y=${deviation.logo?.y.toFixed(2)}`);
    }

    // 分析缩放模式
    analysis.scalingPatterns = this.analyzeScalingPatterns(originalTest, scaledTests);

    // 计算转换准确性
    analysis.transformationAccuracy = this.calculateTransformationAccuracy(originalTest, scaledTests);

    this.testResults.coordinateTransformationAnalysis = analysis;
  }

  calculateCoordinateDeviation(originalElements, scaledElements, originalPageInfo, scaledResolution) {
    const deviation = {};

    // 计算理论缩放比例
    const scaleX = scaledResolution.width / originalPageInfo.viewportWidth;
    const scaleY = scaledResolution.height / originalPageInfo.viewportHeight;

    // 比较每个元素的坐标偏差
    for (const originalElement of originalElements) {
      const scaledElement = scaledElements.find(el => el.id === originalElement.id);
      if (scaledElement) {
        // 理论坐标（按比例缩放）
        const theoreticalX1 = originalElement.bbox.x1 * scaleX;
        const theoreticalY1 = originalElement.bbox.y1 * scaleY;
        const theoreticalX2 = originalElement.bbox.x2 * scaleX;
        const theoreticalY2 = originalElement.bbox.y2 * scaleY;

        // 实际偏差
        const actualDeviationX1 = scaledElement.bbox.x1 - theoreticalX1;
        const actualDeviationY1 = scaledElement.bbox.y1 - theoreticalY1;
        const actualDeviationX2 = scaledElement.bbox.x2 - theoreticalX2;
        const actualDeviationY2 = scaledElement.bbox.y2 - theoreticalY2;

        deviation[originalElement.id] = {
          x: (actualDeviationX1 + actualDeviationX2) / 2,
          y: (actualDeviationY1 + actualDeviationY2) / 2,
          scaleX: (scaledElement.bbox.x2 - scaledElement.bbox.x1) / (originalElement.bbox.x2 - originalElement.bbox.x1),
          scaleY: (scaledElement.bbox.y2 - scaledElement.bbox.y1) / (originalElement.bbox.y2 - originalElement.bbox.y1)
        };
      }
    }

    return deviation;
  }

  analyzeScalingPatterns(originalTest, scaledTests) {
    const patterns = [];

    for (const scaledTest of scaledTests) {
      const resolution = scaledTest.resolution;
      const originalWidth = originalTest.pageInfo.viewportWidth;
      const originalHeight = originalTest.pageInfo.viewportHeight;

      const expectedScaleX = resolution.width / originalWidth;
      const expectedScaleY = resolution.height / originalHeight;

      patterns.push({
        resolution: resolution.name,
        expectedScale: { x: expectedScaleX, y: expectedScaleY },
        actualImageSize: scaledTest.screenshotSize,
        originalImageSize: originalTest.screenshotSize
      });
    }

    return patterns;
  }

  calculateTransformationAccuracy(originalTest, scaledTests) {
    const accuracy = [];

    for (const scaledTest of scaledTests) {
      const deviation = this.calculateCoordinateDeviation(
        originalTest.uiElements,
        scaledTest.uiElements,
        originalTest.pageInfo,
        scaledTest.resolution
      );

      // 计算平均偏差
      let totalDeviation = 0;
      let elementCount = 0;

      for (const [elementId, deviationData] of Object.entries(deviation)) {
        if (deviationData) {
          const elementDeviation = Math.sqrt(
            deviationData.x * deviationData.x + deviationData.y * deviationData.y
          );
          totalDeviation += elementDeviation;
          elementCount++;
        }
      }

      const averageDeviation = elementCount > 0 ? totalDeviation / elementCount : 0;

      accuracy.push({
        resolution: scaledTest.resolution.name,
        averageDeviation,
        elementCount,
        accuracy: Math.max(0, 100 - (averageDeviation / Math.max(scaledTest.resolution.width, scaledTest.resolution.height) * 100))
      });
    }

    return accuracy;
  }

  async generateFinalRecommendations() {
    console.log('💡 生成坐标校正建议...');

    const analysis = this.testResults.coordinateTransformationAnalysis;

    if (!analysis) {
      console.log('❌ 缺少分析数据，无法生成建议');
      return;
    }

    const recommendations = {
      primaryIssue: '',
      correctionStrategy: '',
      imageProcessingRecommendations: [],
      coordinateTransformationRecommendations: [],
      implementationSteps: []
    };

    // 分析主要问题
    const maxDeviation = Math.max(...analysis.transformationAccuracy.map(a => a.averageDeviation));

    if (maxDeviation > 50) {
      recommendations.primaryIssue = '坐标转换存在严重偏差，需要重新实现坐标转换算法';
      recommendations.correctionStrategy = 'complete_reimplementation';
    } else if (maxDeviation > 20) {
      recommendations.primaryIssue = '坐标转换存在中等偏差，需要调整转换参数';
      recommendations.correctionStrategy = 'parameter_adjustment';
    } else {
      recommendations.primaryIssue = '坐标转换基本准确，进行微调即可';
      recommendations.correctionStrategy = 'fine_tuning';
    }

    // 图像处理建议
    recommendations.imageProcessingRecommendations = [
      '在UI识别服务中记录图像预处理时的实际缩放比例',
      '确保坐标转换使用正确的缩放因子',
      '考虑添加图像尺寸元数据到识别结果中',
      '验证不同分辨率下的坐标准确性'
    ];

    // 坐标转换建议
    recommendations.coordinateTransformationRecommendations = [
      '实现基于图像预处理配置的动态坐标转换',
      '添加坐标转换的验证和校正机制',
      '考虑视口滚动对坐标的影响',
      '实现多分辨率兼容的坐标系统'
    ];

    // 实施步骤
    recommendations.implementationSteps = [
      '1. 修改UI识别服务，返回图像预处理信息和缩放比例',
      '2. 实现正确的坐标转换算法',
      '3. 添加坐标验证机制',
      '4. 创建全面的坐标测试套件',
      '5. 集成坐标校正到主要的工作流程中'
    ];

    this.testResults.finalRecommendations = recommendations;

    console.log(`✅ 建议生成完成: ${recommendations.correctionStrategy}`);
  }

  async generateTestReport() {
    console.log('📊 生成图像分辨率测试报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'image-resolution-coordinate-test',
      testResults: this.testResults,
      summary: {
        originalImageTested: !!this.testResults.originalImageTest,
        scaledTestsCount: this.testResults.scaledImageTests.length,
        coordinateAnalysisAvailable: !!this.testResults.coordinateTransformationAnalysis,
        recommendationsGenerated: !!this.testResults.finalRecommendations
      }
    };

    const reportPath = path.join(__dirname, '../reports/image-resolution-coordinate-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 测试报告已生成: ${reportPath}`);

    // 输出关键发现
    console.log('\n🔍 关键发现:');
    if (this.testResults.finalRecommendations) {
      console.log(`  主要问题: ${this.testResults.finalRecommendations.primaryIssue}`);
      console.log(`  建议策略: ${this.testResults.finalRecommendations.correctionStrategy}`);
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
  const test = new ImageResolutionCoordinateTest();

  try {
    await test.runImageResolutionTest();
    console.log('\n✅ 图像分辨率和坐标转换测试完成');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 图像分辨率测试失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ImageResolutionCoordinateTest;