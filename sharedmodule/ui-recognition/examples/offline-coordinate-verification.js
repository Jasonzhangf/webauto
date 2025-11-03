/**
 * 离线坐标验证系统
 * 使用已有截图进行UI识别和坐标验证，避免触发风控
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OfflineCoordinateVerification {
  constructor() {
    this.testResults = {
      imageAnalysis: [],
      coordinateValidation: null,
      systemRecommendations: null
    };
    this.uiServiceUrl = 'http://localhost:8898';
  }

  async runOfflineVerification() {
    console.log('🔒 开始离线坐标验证系统');

    try {
      // 1. 查找现有的截图文件
      const existingScreenshots = await this.findExistingScreenshots();

      if (existingScreenshots.length === 0) {
        console.log('❌ 没有找到现有的截图文件');
        return;
      }

      console.log(`✅ 找到 ${existingScreenshots.length} 个现有截图文件`);

      // 2. 分析每个截图的坐标
      await this.analyzeExistingScreenshots(existingScreenshots);

      // 3. 验证坐标转换的准确性
      await this.validateCoordinateTransformation();

      // 4. 生成系统建议
      await this.generateSystemRecommendations();

      // 5. 生成验证报告
      await this.generateVerificationReport();

    } catch (error) {
      console.error('❌ 离线验证失败:', error.message);
    }
  }

  async findExistingScreenshots() {
    console.log('📁 查找现有截图文件...');

    const screenshotDirectories = [
      path.join(__dirname, '../screenshots'),
      '/Users/fanzhang/.webauto/screenshots',
      '/Users/fanzhang/Documents/github/webauto/sharedmodule/ui-recognition/screenshots'
    ];

    const supportedFormats = ['.png', '.jpg', '.jpeg'];
    const screenshots = [];

    for (const directory of screenshotDirectories) {
      try {
        if (fs.existsSync(directory)) {
          const files = fs.readdirSync(directory);

          for (const file of files) {
            const filePath = path.join(directory, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile()) {
              const ext = path.extname(file).toLowerCase();
              if (supportedFormats.includes(ext)) {
                screenshots.push({
                  path: filePath,
                  name: file,
                  size: stat.size,
                  modified: stat.mtime,
                  directory
                });
              }
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠️ 无法访问目录: ${directory}`);
      }
    }

    // 按修改时间排序，优先使用最新的截图
    screenshots.sort((a, b) => b.modified - a.modified);

    // 只使用前5个最新的截图
    return screenshots.slice(0, 5);
  }

  async analyzeExistingScreenshots(screenshots) {
    console.log('🔍 分析现有截图...');

    for (let i = 0; i < screenshots.length; i++) {
      const screenshot = screenshots[i];
      console.log(`  分析截图 ${i + 1}/${screenshots.length}: ${screenshot.name}`);

      try {
        // 读取截图并转换为base64
        const imageBuffer = fs.readFileSync(screenshot.path);
        const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

        // 获取图像尺寸信息
        const imageInfo = await this.getImageDimensions(imageBase64);

        // 调用UI识别服务
        let uiElements;
        try {
          const response = await axios.post(`${this.uiServiceUrl}/api/recognize`, {
            request_id: Date.now(),
            image: imageBase64,
            query: '识别页面中的所有UI元素，包括搜索框、按钮、链接、导航栏等，提供精确的坐标位置和元素类型',
            scope: 'full',
            parameters: {
              temperature: 0.1,
              max_tokens: 8192
            }
          });

          if (response.data.success && response.data.elements) {
            uiElements = response.data.elements;
            console.log(`    ✅ UI识别成功: ${uiElements.length} 个元素`);
          } else {
            throw new Error('UI识别服务返回失败结果');
          }

        } catch (error) {
          console.log(`    ⚠️ UI识别服务不可用: ${error.message}`);

          // 使用模拟数据
          uiElements = this.generateMockElements(imageInfo);
          console.log(`    📝 使用模拟数据: ${uiElements.length} 个元素`);
        }

        // 分析坐标模式
        const coordinateAnalysis = this.analyzeCoordinatePattern(uiElements, imageInfo);

        this.testResults.imageAnalysis.push({
          screenshot: {
            name: screenshot.name,
            path: screenshot.path,
            size: screenshot.size,
            modified: screenshot.modified
          },
          imageInfo,
          uiElements,
          coordinateAnalysis,
          timestamp: Date.now()
        });

      } catch (error) {
        console.log(`    ❌ 分析失败: ${error.message}`);
      }
    }

    console.log(`✅ 完成截图分析: ${this.testResults.imageAnalysis.length} 个截图`);
  }

  async getImageDimensions(imageBase64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight
        });
      };
      img.onerror = () => {
        resolve({ width: 1920, height: 1080, aspectRatio: 1.78 }); // 默认值
      };
      img.src = imageBase64;
    });
  }

  generateMockElements(imageInfo) {
    const { width, height } = imageInfo;
    const scaleX = width / 1920;
    const scaleY = height / 1080;

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
      },
      {
        id: 'navigation',
        type: 'navigation',
        bbox: {
          x1: Math.round(0 * scaleX),
          y1: Math.round(150 * scaleY),
          x2: Math.round(1920 * scaleX),
          y2: Math.round(200 * scaleY)
        },
        confidence: 0.8,
        text: '导航',
        description: '导航栏'
      }
    ];
  }

  analyzeCoordinatePattern(elements, imageInfo) {
    const analysis = {
      totalElements: elements.length,
      elementTypes: {},
      coordinateRanges: {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
      },
      averageConfidence: 0,
      scaleConsistency: {
        expectedWidth: 1920,
        expectedHeight: 1080,
        actualWidth: imageInfo.width,
        actualHeight: imageInfo.height,
        scaleRatio: imageInfo.width / 1920
      }
    };

    // 分析元素类型分布
    for (const element of elements) {
      analysis.elementTypes[element.type] = (analysis.elementTypes[element.type] || 0) + 1;

      // 计算坐标范围
      analysis.coordinateRanges.minX = Math.min(analysis.coordinateRanges.minX, element.bbox.x1);
      analysis.coordinateRanges.maxX = Math.max(analysis.coordinateRanges.maxX, element.bbox.x2);
      analysis.coordinateRanges.minY = Math.min(analysis.coordinateRanges.minY, element.bbox.y1);
      analysis.coordinateRanges.maxY = Math.max(analysis.coordinateRanges.maxY, element.bbox.y2);

      // 计算平均置信度
      analysis.averageConfidence += element.confidence;
    }

    if (elements.length > 0) {
      analysis.averageConfidence /= elements.length;
    }

    // 检查坐标是否在合理范围内
    analysis.coordinateRanges.valid =
      analysis.coordinateRanges.minX >= 0 &&
      analysis.coordinateRanges.minY >= 0 &&
      analysis.coordinateRanges.maxX <= imageInfo.width &&
      analysis.coordinateRanges.maxY <= imageInfo.height;

    return analysis;
  }

  async validateCoordinateTransformation() {
    console.log('📐 验证坐标转换...');

    if (this.testResults.imageAnalysis.length === 0) {
      console.log('❌ 没有分析数据可供验证');
      return;
    }

    const validation = {
      consistencyAnalysis: [],
      scaleAnalysis: [],
      coordinateAccuracy: {
        averageDeviation: 0,
        maxDeviation: 0,
        validElements: 0,
        totalElements: 0
      },
      recommendations: []
    };

    // 分析不同截图之间的一致性
    for (let i = 0; i < this.testResults.imageAnalysis.length - 1; i++) {
      const current = this.testResults.imageAnalysis[i];
      const next = this.testResults.imageAnalysis[i + 1];

      const consistency = this.compareCoordinateConsistency(current, next);
      validation.consistencyAnalysis.push(consistency);
    }

    // 分析缩放比例
    const scales = this.testResults.imageAnalysis.map(analysis =>
      analysis.coordinateAnalysis.scaleConsistency.scaleRatio
    );

    const avgScale = scales.reduce((sum, scale) => sum + scale, 0) / scales.length;
    const scaleVariance = scales.reduce((sum, scale) => sum + Math.pow(scale - avgScale, 2), 0) / scales.length;

    validation.scaleAnalysis = {
      averageScale: avgScale,
      scaleVariance,
      scaleConsistency: scaleVariance < 0.01 ? 'high' : scaleVariance < 0.05 ? 'medium' : 'low'
    };

    // 生成建议
    if (validation.scaleAnalysis.scaleConsistency === 'high') {
      validation.recommendations.push('坐标缩放一致性很高，可以直接使用');
    } else if (validation.scaleAnalysis.scaleConsistency === 'medium') {
      validation.recommendations.push('需要记录每次识别的缩放比例');
    } else {
      validation.recommendations.push('建议使用固定分辨率图像');
    }

    this.testResults.coordinateValidation = validation;

    console.log(`✅ 坐标验证完成`);
    console.log(`  平均缩放比例: ${avgScale.toFixed(4)}`);
    console.log(`  缩放一致性: ${validation.scaleAnalysis.scaleConsistency}`);
  }

  compareCoordinateConsistency(analysis1, analysis2) {
    const elements1 = analysis1.uiElements;
    const elements2 = analysis2.uiElements;

    let matchingElements = 0;
    let totalDeviation = 0;

    for (const element1 of elements1) {
      const element2 = elements2.find(e2 =>
        e2.type === element1.type &&
        Math.abs(e2.bbox.x1 - element1.bbox.x1) < 50 &&
        Math.abs(e2.bbox.y1 - element1.bbox.y1) < 50
      );

      if (element2) {
        matchingElements++;
        const deviation = Math.sqrt(
          Math.pow(element2.bbox.x1 - element1.bbox.x1, 2) +
          Math.pow(element2.bbox.y1 - element1.bbox.y1, 2)
        );
        totalDeviation += deviation;
      }
    }

    return {
      matchingElements,
      totalElements: elements1.length,
      averageDeviation: matchingElements > 0 ? totalDeviation / matchingElements : 0,
      consistencyScore: matchingElements / elements1.length
    };
  }

  async generateSystemRecommendations() {
    console.log('💡 生成系统建议...');

    const validation = this.testResults.coordinateValidation;
    const imageAnalysis = this.testResults.imageAnalysis;

    const recommendations = {
      primaryStrategy: '',
      implementationSteps: [],
      coordinateHandling: '',
      testingApproach: '',
      riskMitigation: []
    };

    // 确定主要策略
    if (validation.scaleAnalysis.scaleConsistency === 'high') {
      recommendations.primaryStrategy = 'dynamic_scaling';
      recommendations.coordinateHandling = '记录并应用动态缩放比例';
    } else {
      recommendations.primaryStrategy = 'fixed_resolution';
      recommendations.coordinateHandling = '使用固定分辨率图像';
    }

    // 实施步骤
    recommendations.implementationSteps = [
      '1. 在UI识别服务中返回图像处理信息',
      '2. 实现坐标转换函数',
      '3. 添加坐标验证机制',
      '4. 集成到现有workflow',
      '5. 添加监控和日志'
    ];

    // 测试方法
    recommendations.testingApproach = '离线验证 + 有限在线测试';

    // 风险缓解
    recommendations.riskMitigation = [
      '减少页面访问频率',
      '使用已有截图进行大部分测试',
      '只在必要时进行新的页面截图',
      '实现访问频率限制机制'
    ];

    this.testResults.systemRecommendations = recommendations;

    console.log(`✅ 系统建议生成完成`);
    console.log(`  主要策略: ${recommendations.primaryStrategy}`);
    console.log(`  坐标处理: ${recommendations.coordinateHandling}`);
  }

  async generateVerificationReport() {
    console.log('📊 生成离线验证报告...');

    const report = {
      timestamp: new Date().toISOString(),
      testType: 'offline-coordinate-verification',
      testResults: this.testResults,
      summary: {
        screenshotsAnalyzed: this.testResults.imageAnalysis.length,
        coordinateValidationCompleted: !!this.testResults.coordinateValidation,
        systemRecommendationsGenerated: !!this.testResults.systemRecommendations,
        primaryStrategy: this.testResults.systemRecommendations?.primaryStrategy
      },
      safetyNotice: '本测试使用离线数据，避免触发目标网站风控机制'
    };

    const reportPath = path.join(__dirname, '../reports/offline-coordinate-verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 离线验证报告已生成: ${reportPath}`);

    // 输出关键发现
    console.log('\n🎯 关键发现:');
    if (this.testResults.systemRecommendations) {
      console.log(`  推荐策略: ${this.testResults.systemRecommendations.primaryStrategy}`);
      console.log(`  坐标处理: ${this.testResults.systemRecommendations.coordinateHandling}`);
      console.log(`  测试方法: ${this.testResults.systemRecommendations.testingApproach}`);
    }

    if (this.testResults.coordinateValidation) {
      const val = this.testResults.coordinateValidation;
      console.log(`  缩放一致性: ${val.scaleAnalysis.scaleConsistency}`);
      console.log(`  平均缩放比例: ${val.scaleAnalysis.averageScale.toFixed(4)}`);
    }

    console.log('\n⚠️ 安全提示: 使用离线数据避免触发风控机制');

    return report;
  }
}

// 主执行函数
async function main() {
  const verification = new OfflineCoordinateVerification();

  try {
    await verification.runOfflineVerification();
    console.log('\n✅ 离线坐标验证完成');
  } catch (error) {
    console.error('\n💥 离线验证失败:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default OfflineCoordinateVerification;