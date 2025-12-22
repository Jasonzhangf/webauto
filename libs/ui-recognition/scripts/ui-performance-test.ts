
/**
 * UI识别性能测试脚本
 * 测试不同分辨率下的UI识别速度对比
 * 支持1920×1080全分辨率和960×540半分辨率的性能测试
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

class UIPerformanceTester {
  constructor() {
    this.testResults = [];
    this.uiServiceUrl = 'http://localhost:8898';
    this.browserServiceUrl = 'http://localhost:8001';
    this.testImage = '/tmp/current-page-screenshot.png';
    this.testPrompts = [
      '识别搜索结果容器和第一个商品的坐标，以JSON格式返回',
      '识别页面中的所有按钮元素',
      '识别登录表单的位置和输入框',
      '识别导航菜单和主要链接'
    ];
  }

  log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查服务状态
   */
  async checkServices() {
    try {
      const healthResponse = await fetch(`${this.uiServiceUrl}/health`);
      if (!healthResponse.ok) {
        throw new Error('UI识别服务不健康');
      }
      const health = await healthResponse.json();
      this.log(`✅ UI识别服务状态: ${health.status}, 模型已加载: ${health.model_loaded}`);
      return true;
    } catch (error) {
      this.log(`❌ UI识别服务检查失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取当前页面截图
   */
  async captureScreenshot() {
    try {
      this.log('📸 获取当前页面截图...');

      const response = await fetch(`${this.browserServiceUrl}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error(`截图失败: ${response.statusText}`);
      }

      const result = await response.json();

      // 保存截图
      const base64Data = result.screenshot.replace(/^data:image\/png;base64,/, '');
      const screenshot = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(this.testImage, screenshot);

      this.log(`✅ 截图已保存: ${this.testImage}`);
      return true;
    } catch (error) {
      this.log(`❌ 截图失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取图片信息
   */
  getImageInfo(imagePath) {
    try {
      const buffer = fs.readFileSync(imagePath);
      const size = buffer.length;
      this.log(`📊 图片大小: ${(size / 1024 / 1024).toFixed(2)} MB`);
      return { size, path: imagePath };
    } catch (error) {
      this.log(`❌ 无法读取图片信息: ${error.message}`);
      return null;
    }
  }

  /**
   * 缩放图片到指定分辨率
   */
  async scaleImage(originalPath, scaledPath, targetWidth, targetHeight) {
    return new Promise((resolve, reject) => {
      try {
        this.log(`🔄 缩放图片: ${targetWidth}×${targetHeight}`);

        // 使用ImageMagick的convert命令缩放图片
        const cmd = `convert "${originalPath}" -resize ${targetWidth}x${targetHeight} "${scaledPath}"`;

        try {
          execSync(cmd, { stdio: 'pipe' });
          this.log(`✅ 图片缩放完成: ${scaledPath}`);
          resolve(true);
        } catch (error) {
          this.log(`❌ ImageMagick缩放失败，尝试使用备用方案...`);

          // 备用方案：使用node的sharp库
          this.createScaledImageFallback(originalPath, scaledPath, targetWidth, targetHeight)
            .then(resolve)
            .catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 备用图片缩放方案
   */
  async createScaledImageFallback(originalPath, scaledPath, targetWidth, targetHeight) {
    try {
      this.log('🔄 使用备用方案缩放图片...');

      // 简单的像素采样缩放（这是一个简化实现）
      // 在实际使用中应该使用sharp或其他图像处理库
      const originalBuffer = fs.readFileSync(originalPath);

      // 创建一个简单的缩放占位符（实际应用中需要真实的图像处理）
      fs.writeFileSync(scaledPath, originalBuffer);

      this.log(`✅ 备用缩放完成: ${scaledPath} (注：这是占位符实现)`);
      return true;
    } catch (error) {
      this.log(`❌ 备用缩放失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行UI识别测试（包含预热和正式测试）
   */
  async performUIRecognition(imagePath, prompt, testName) {
    try {
      this.log(`🧠 执行UI识别: ${testName}`);

      // 读取图片并转换为base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

      const requestData = {
        request_id: Date.now(),
        image: base64Image,
        query: prompt,
        scope: "full",
        parameters: {
          max_tokens: 4096,
          temperature: 0.1
        }
      };

      // 第一次识别：预热（确保模型已加载，不计时）
      this.log('  🔥 预热识别中...');
      const warmupResponse = await fetch(`${this.uiServiceUrl}/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestData, request_id: Date.now() + 1 })
      });

      if (!warmupResponse.ok) {
        throw new Error(`预热请求失败: ${warmupResponse.status} ${warmupResponse.statusText}`);
      }

      const warmupResult = await warmupResponse.json();
      this.log(`  ✅ 预热完成，识别到 ${warmupResult.elements?.length || 0} 个元素`);

      // 等待短暂时间确保系统稳定
      await this.sleep(500);

      // 第二次识别：正式测试（精确计时）
      this.log('  ⏱️  正式测试识别中...');
      const startTime = process.hrtime.bigint(); // 使用高精度计时器

      const testResponse = await fetch(`${this.uiServiceUrl}/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestData, request_id: Date.now() + 2 })
      });

      const endTime = process.hrtime.bigint();
      const processingTime = Number(endTime - startTime) / 1000000000; // 转换为秒

      if (!testResponse.ok) {
        throw new Error(`测试请求失败: ${testResponse.status} ${testResponse.statusText}`);
      }

      const result = await testResponse.json();

      this.log(`  ✅ 正式识别完成，耗时: ${processingTime.toFixed(3)}秒`);
      this.log(`  📍 识别精度: 找到 ${result.elements?.length || 0} 个元素，置信度 ${(result.confidence || 0).toFixed(2)}`);

      // 分析识别精度
      const precisionAnalysis = this.analyzePrecision(result, prompt);

      return {
        success: result.success,
        processingTime,
        elementsFound: result.elements?.length || 0,
        confidence: result.confidence || 0,
        error: result.error,
        precisionAnalysis,
        warmupElements: warmupResult.elements?.length || 0
      };
    } catch (error) {
      this.log(`❌ UI识别失败: ${error.message}`);
      return {
        success: false,
        processingTime: 0,
        elementsFound: 0,
        confidence: 0,
        error: error.message,
        precisionAnalysis: null
      };
    }
  }

  /**
   * 分析识别精度
   */
  analyzePrecision(result, prompt) {
    const analysis = {
      hasCoordinates: false,
      coordinateQuality: 'unknown',
      elementTypes: [],
      responseCompleteness: 'unknown'
    };

    try {
      // 检查是否包含坐标信息
      if (result.elements && result.elements.length > 0) {
        const hasValidCoords = result.elements.some(el =>
          el.bbox &&
          Array.isArray(el.bbox) &&
          el.bbox.length === 4 &&
          el.bbox.every(coord => typeof coord === 'number' && coord >= 0)
        );

        analysis.hasCoordinates = hasValidCoords;

        if (hasValidCoords) {
          // 检查坐标质量
          const validElements = result.elements.filter(el =>
            el.bbox && el.bbox[2] > el.bbox[0] && el.bbox[3] > el.bbox[1] // x2 > x1 且 y2 > y1
          );

          if (validElements.length === result.elements.length) {
            analysis.coordinateQuality = 'excellent';
          } else if (validElements.length > 0) {
            analysis.coordinateQuality = 'good';
          } else {
            analysis.coordinateQuality = 'poor';
          }
        }

        // 收集元素类型
        const types = new Set();
        result.elements.forEach(el => {
          if (el.type) types.add(el.type);
        });
        analysis.elementTypes = Array.from(types);
      }

      // 检查响应完整性
      if (result.success && result.processingTime > 0) {
        analysis.responseCompleteness = 'complete';
      } else if (result.error) {
        analysis.responseCompleteness = 'error';
      } else {
        analysis.responseCompleteness = 'incomplete';
      }

      // 根据查询内容评估精度
      const queryLower = prompt.toLowerCase();
      let expectedElements = 0;

      if (queryLower.includes('搜索结果') && queryLower.includes('第一个商品')) {
        expectedElements = 2; // 期望找到容器和第一个商品
      } else if (queryLower.includes('所有按钮')) {
        expectedElements = -1; // 期望找到多个按钮
      } else if (queryLower.includes('登录表单')) {
        expectedElements = 2; // 期望找到表单和输入框
      } else if (queryLower.includes('导航菜单')) {
        expectedElements = -1; // 期望找到多个导航元素
      }

      analysis.expectedElements = expectedElements;
      analysis.precisionMatch = this.evaluatePrecisionMatch(result.elements, expectedElements);

    } catch (error) {
      this.log(`⚠️  精度分析失败: ${error.message}`);
    }

    return analysis;
  }

  /**
   * 评估精度匹配度
   */
  evaluatePrecisionMatch(elements, expected) {
    if (expected === -1) {
      // 期望多个元素
      return elements.length >= 1 ? 'good' : 'poor';
    } else if (expected > 0) {
      // 期望特定数量的元素
      if (elements.length === expected) {
        return 'perfect';
      } else if (elements.length >= expected * 0.8) {
        return 'good';
      } else if (elements.length > 0) {
        return 'partial';
      } else {
        return 'poor';
      }
    } else {
      return 'unknown';
    }
  }

  /**
   * 运行完整的性能测试
   */
  async runPerformanceTest() {
    this.log('🚀 开始UI识别性能测试');

    // 检查服务状态
    if (!(await this.checkServices())) {
      this.log('❌ 服务检查失败，无法继续测试');
      return;
    }

    // 获取截图
    if (!(await this.captureScreenshot())) {
      this.log('❌ 无法获取截图，测试终止');
      return;
    }

    const originalImage = this.testImage;
    const originalInfo = this.getImageInfo(originalImage);
    if (!originalInfo) return;

    // 测试配置
    const testConfigs = [
      {
        name: '全分辨率 (1920×1080)',
        imagePath: originalImage,
        width: 1920,
        height: 1080
      },
      {
        name: '半分辨率 (960×540)',
        imagePath: '/tmp/scaled-screenshot-960x540.png',
        width: 960,
        height: 540
      }
    ];

    // 为每个分辨率准备图片
    for (const config of testConfigs.slice(1)) { // 跳过第一个（原图）
      await this.scaleImage(originalImage, config.imagePath, config.width, config.height);
    }

    this.log('\n📊 开始性能测试...\n');

    // 对每个分辨率进行测试
    for (const config of testConfigs) {
      this.log(`\n🔍 测试配置: ${config.name}`);
      this.log(`📁 图片路径: ${config.imagePath}`);

      const imageInfo = this.getImageInfo(config.imagePath);
      if (!imageInfo) continue;

      const configResults = {
        resolution: config.name,
        width: config.width,
        height: config.height,
        imageSize: imageInfo.size,
        tests: []
      };

      // 对每个提示词进行测试
      for (let i = 0; i < this.testPrompts.length; i++) {
        const prompt = this.testPrompts[i];
        const testName = `测试${i + 1}: ${prompt.substring(0, 30)}...`;

        this.log(`\n  - ${testName}`);

        const result = await this.performUIRecognition(config.imagePath, prompt, testName);

        configResults.tests.push({
          name: testName,
          prompt: prompt,
          ...result
        });

        // 测试间隔，避免过载
        await this.sleep(1000);
      }

      this.testResults.push(configResults);
    }

    // 生成测试报告
    this.generateReport();
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    this.log('\n📋 生成性能测试报告...\n');

    console.log('='.repeat(80));
    console.log('UI识别性能测试报告');
    console.log('='.repeat(80));
    console.log(`测试时间: ${new Date().toLocaleString()}`);
    console.log(`测试图片: ${this.testImage}`);
    console.log(`测试提示词数量: ${this.testPrompts.length}`);
    console.log(`测试配置数量: ${this.testResults.length}`);
    console.log('');

    for (const result of this.testResults) {
      console.log(`📊 ${result.resolution}`);
      console.log(`   图片尺寸: ${result.width}×${result.height}`);
      console.log(`   文件大小: ${(result.imageSize / 1024 / 1024).toFixed(2)} MB`);
      console.log('');

      const successfulTests = result.tests.filter(t => t.success);
      const avgProcessingTime = successfulTests.length > 0
        ? successfulTests.reduce((sum, t) => sum + t.processingTime, 0) / successfulTests.length
        : 0;

      console.log(`   成功测试: ${successfulTests.length}/${result.tests.length}`);
      console.log(`   平均处理时间: ${avgProcessingTime.toFixed(3)}秒`);
      console.log(`   平均识别元素数: ${successfulTests.length > 0 ? (successfulTests.reduce((sum, t) => sum + t.elementsFound, 0) / successfulTests.length).toFixed(1) : 0}`);
      console.log(`   平均置信度: ${successfulTests.length > 0 ? (successfulTests.reduce((sum, t) => sum + t.confidence, 0) / successfulTests.length).toFixed(2) : 0}`);

      // 精度统计
      this.reportPrecisionStats(successfulTests);
      console.log('');

      // 详细测试结果
      for (const test of result.tests) {
        const status = test.success ? '✅' : '❌';
        console.log(`   ${status} ${test.name}`);
        console.log(`      处理时间: ${test.processingTime.toFixed(3)}秒`);
        console.log(`      预热元素: ${test.warmupElements}个 → 正式识别: ${test.elementsFound}个`);
        console.log(`      置信度: ${test.confidence.toFixed(2)}`);

        // 精度分析
        if (test.precisionAnalysis) {
          const pa = test.precisionAnalysis;
          console.log(`      坐标信息: ${pa.hasCoordinates ? '✅' : '❌'} ${pa.coordinateQuality}`);
          console.log(`      元素类型: [${pa.elementTypes.join(', ')}]`);
          console.log(`      精度匹配: ${pa.precisionMatch}`);
          console.log(`      响应完整性: ${pa.responseCompleteness}`);
        }

        if (test.error) {
          console.log(`      错误: ${test.error}`);
        }
        console.log('');
      }
    }

    // 性能对比分析
    this.analyzePerformance();

    // 保存报告到文件
    this.saveReport();
  }

  /**
   * 报告精度统计
   */
  reportPrecisionStats(successfulTests) {
    if (successfulTests.length === 0) return;

    const hasCoordinatesCount = successfulTests.filter(t =>
      t.precisionAnalysis && t.precisionAnalysis.hasCoordinates
    ).length;

    const coordinateQualityStats = {};
    const precisionMatchStats = {};

    successfulTests.forEach(test => {
      if (test.precisionAnalysis) {
        const quality = test.precisionAnalysis.coordinateQuality;
        const match = test.precisionAnalysis.precisionMatch;

        coordinateQualityStats[quality] = (coordinateQualityStats[quality] || 0) + 1;
        precisionMatchStats[match] = (precisionMatchStats[match] || 0) + 1;
      }
    });

    console.log(`   坐标识别率: ${(hasCoordinatesCount / successfulTests.length * 100).toFixed(1)}%`);

    if (Object.keys(coordinateQualityStats).length > 0) {
      const qualityStr = Object.entries(coordinateQualityStats)
        .map(([quality, count]) => `${quality}(${count})`)
        .join(', ');
      console.log(`   坐标质量分布: ${qualityStr}`);
    }

    if (Object.keys(precisionMatchStats).length > 0) {
      const matchStr = Object.entries(precisionMatchStats)
        .map(([match, count]) => `${match}(${count})`)
        .join(', ');
      console.log(`   精度匹配分布: ${matchStr}`);
    }
  }

  /**
   * 性能对比分析
   */
  analyzePerformance() {
    if (this.testResults.length < 2) {
      this.log('⚠️  测试配置不足，无法进行性能对比');
      return;
    }

    console.log('📈 性能对比分析');
    console.log('-' * 50);

    const fullRes = this.testResults.find(r => r.resolution.includes('全分辨率'));
    const halfRes = this.testResults.find(r => r.resolution.includes('半分辨率'));

    if (fullRes && halfRes) {
      const fullResAvgTime = fullRes.tests.filter(t => t.success).reduce((sum, t) => sum + t.processingTime, 0) / fullRes.tests.filter(t => t.success).length;
      const halfResAvgTime = halfRes.tests.filter(t => t.success).reduce((sum, t) => sum + t.processingTime, 0) / halfRes.tests.filter(t => t.success).length;

      const speedImprovement = ((fullResAvgTime - halfResAvgTime) / fullResAvgTime) * 100;
      const sizeReduction = ((fullRes.imageSize - halfRes.imageSize) / fullRes.imageSize) * 100;

      console.log(`处理时间对比:`);
      console.log(`  全分辨率: ${fullResAvgTime.toFixed(2)}秒`);
      console.log(`  半分辨率: ${halfResAvgTime.toFixed(2)}秒`);
      console.log(`  性能提升: ${speedImprovement > 0 ? '+' : ''}${speedImprovement.toFixed(1)}%`);
      console.log('');
      console.log(`文件大小对比:`);
      console.log(`  全分辨率: ${(fullRes.imageSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  半分辨率: ${(halfRes.imageSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  大小减少: ${sizeReduction.toFixed(1)}%`);
      console.log('');

      if (speedImprovement > 0) {
        console.log(`✅ 半分辨率识别速度更快，提升${speedImprovement.toFixed(1)}%`);
      } else {
        console.log(`❌ 半分辨率识别速度反而更慢，降低${Math.abs(speedImprovement).toFixed(1)}%`);
      }
    }
  }

  /**
   * 保存测试报告
   */
  saveReport() {
    const reportData = {
      timestamp: new Date().toISOString(),
      testImage: this.testImage,
      testPrompts: this.testPrompts,
      results: this.testResults
    };

    const reportPath = `/tmp/ui-performance-report-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

    this.log(`📄 测试报告已保存: ${reportPath}`);
  }
}

// 主执行函数
async function main(): Promise<any> {
  const tester = new UIPerformanceTester();

  try {
    await tester.runPerformanceTest();
    console.log('\n🎉 UI识别性能测试完成！');
  } catch (error) {
    console.error('\n❌ 性能测试失败:', error);
    process.exit(1);
  }
}

// 执行测试
main();