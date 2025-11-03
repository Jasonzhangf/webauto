#!/usr/bin/env node
/**
 * Image Input Test
 * 图片输入测试 - 测试模型能否接收和处理图片进行查找
 */

import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// UI识别服务配置
const UI_SERVICE_URL = 'http://localhost:8898';

class ImageInputTest {
  constructor() {
    this.testResults = [];
  }

  // 创建一个测试图片，包含一些UI元素
  async createTestImage() {
    console.log('🎨 创建测试图片...');

    // 创建画布
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');

    // 背景色
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 800, 600);

    // 绘制搜索框
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(100, 50, 300, 40);
    ctx.strokeStyle = '#cccccc';
    ctx.strokeRect(100, 50, 300, 40);
    ctx.fillStyle = '#888888';
    ctx.font = '16px Arial';
    ctx.fillText('Search...', 110, 75);

    // 绘制登录按钮
    ctx.fillStyle = '#007bff';
    ctx.fillRect(450, 50, 100, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.fillText('Login', 475, 75);

    // 绘制导航菜单
    const navItems = ['Home', 'Products', 'About', 'Contact'];
    navItems.forEach((item, index) => {
      ctx.fillStyle = '#333333';
      ctx.fillRect(100 + index * 120, 150, 100, 30);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(item, 120 + index * 120, 170);
    });

    // 绘制表单
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(100, 250, 200, 30);
    ctx.strokeStyle = '#cccccc';
    ctx.strokeRect(100, 250, 200, 30);
    ctx.fillStyle = '#888888';
    ctx.fillText('Username', 110, 270);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(100, 300, 200, 30);
    ctx.strokeStyle = '#cccccc';
    ctx.strokeRect(100, 300, 200, 30);
    ctx.fillStyle = '#888888';
    ctx.fillText('Password', 110, 320);

    // 绘制提交按钮
    ctx.fillStyle = '#28a745';
    ctx.fillRect(100, 350, 100, 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Submit', 130, 375);

    // 保存图片
    const imagePath = join(__dirname, 'test-ui-image.png');
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(imagePath, buffer);

    console.log(`✅ 测试图片已创建: ${imagePath}`);
    return imagePath;
  }

  async imageToBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  }

  async testImageRecognition(imageBase64, query, testName) {
    console.log(`\n🔍 ${testName}: ${query}`);

    try {
      const response = await axios.post(`${UI_SERVICE_URL}/recognize`, {
        request_id: Date.now(),
        image: imageBase64,
        query: query,
        scope: 'full',
        parameters: {
          temperature: 0.1,
          max_tokens: 256
        }
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ 请求成功:`);
      console.log(`   - 处理时间: ${response.data.processing_time.toFixed(2)}ms`);
      console.log(`   - 成功状态: ${response.data.success}`);
      console.log(`   - 元素数量: ${response.data.elements.length}`);
      console.log(`   - 置信度: ${response.data.confidence.toFixed(3)}`);

      if (response.data.analysis) {
        console.log(`   - 分析结果: ${response.data.analysis}`);
      }

      if (response.data.elements.length > 0) {
        console.log(`   - 识别到的元素:`);
        response.data.elements.forEach((element, index) => {
          console.log(`     ${index + 1}. ${element.type}: ${JSON.stringify(element.bbox)}`);
          console.log(`        置信度: ${element.confidence.toFixed(3)}`);
          console.log(`        描述: ${element.description}`);
        });
      }

      if (response.data.actions.length > 0) {
        console.log(`   - 操作建议:`);
        response.data.actions.forEach((action, index) => {
          console.log(`     ${index + 1}. ${action.type}: ${action.reason}`);
        });
      }

      return {
        success: response.data.success,
        elements: response.data.elements,
        actions: response.data.actions,
        processingTime: response.data.processing_time
      };

    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
      if (error.response) {
        console.log(`   错误详情: ${error.response.data.error}`);
      }
      return {
        success: false,
        error: error.message
      };
    }
  }

  async drawBoundingBoxes(originalImagePath, elements, outputSuffix) {
    if (elements.length === 0) {
      console.log(`   没有元素需要标注`);
      return null;
    }

    console.log(`🎨 绘制高亮框...`);

    try {
      // 加载原始图像
      const image = await loadImage(originalImagePath);

      // 创建画布
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');

      // 绘制原始图像
      ctx.drawImage(image, 0, 0);

      // 设置高亮框样式
      ctx.strokeStyle = '#00FF00';  // 绿色
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';  // 半透明绿色填充

      // 为每个识别到的元素绘制高亮框
      elements.forEach((element, index) => {
        const [x1, y1, x2, y2] = element.bbox;

        console.log(`   绘制框 ${index + 1}: [${x1}, ${y1}, ${x2}, ${y2}]`);

        // 绘制填充矩形
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        // 绘制边框
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // 添加标签
        ctx.fillStyle = '#00FF00';
        ctx.font = '14px Arial';
        ctx.fillText(`${element.type} (${(element.confidence * 100).toFixed(1)}%)`, x1, y1 - 5);
      });

      // 保存高亮图像
      const outputPath = join(__dirname, `highlighted-${outputSuffix}.png`);

      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);

      console.log(`✅ 高亮图像已保存: ${outputPath}`);
      return outputPath;

    } catch (error) {
      console.error(`❌ 绘制高亮框失败: ${error.message}`);
      return null;
    }
  }

  async runImageInputTest() {
    console.log('🖼️  开始图片输入测试');
    console.log('=' .repeat(60));

    try {
      // 1. 创建测试图片
      const testImagePath = this.createTestImage();
      const imageBase64 = await this.imageToBase64(testImagePath);

      // 2. 测试不同的查询
      const testCases = [
        {
          name: '搜索框识别',
          query: '找到搜索输入框'
        },
        {
          name: '登录按钮识别',
          query: '找到登录按钮'
        },
        {
          name: '导航菜单识别',
          query: '找到导航菜单元素'
        },
        {
          name: '表单输入框识别',
          query: '找到用户名输入框'
        },
        {
          name: '提交按钮识别',
          query: '找到提交按钮'
        }
      ];

      const results = [];
      let successCount = 0;

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const result = await this.testImageRecognition(imageBase64, testCase.query, `测试${i + 1}`);

        results.push({
          testName: testCase.name,
          ...result
        });

        if (result.success && result.elements.length > 0) {
          successCount++;
          // 为成功的测试绘制高亮框
          await this.drawBoundingBoxes(testImagePath, result.elements, `test-${i + 1}`);
        }

        // 在测试之间稍作延迟
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 3. 生成测试报告
      console.log('\n📊 图片输入测试报告');
      console.log('=' .repeat(50));

      results.forEach((result, index) => {
        const status = result.success && result.elements.length > 0 ? '✅' : '❌';
        const time = result.processingTime || 0;
        console.log(`${index + 1}. ${result.testName}: ${status} (${time.toFixed(2)}ms)`);

        if (result.error) {
          console.log(`   错误: ${result.error}`);
        }
      });

      console.log(`\n📈 统计信息:`);
      console.log(`- 总测试数: ${results.length}`);
      console.log(`- 成功数: ${successCount}`);
      console.log(`- 失败数: ${results.length - successCount}`);
      console.log(`- 成功率: ${((successCount / results.length) * 100).toFixed(1)}%`);

      if (successCount > 0) {
        console.log('\n🎉 图片输入功能测试成功！');
        console.log('💡 模型能够接收图片并识别UI元素');
        console.log('💡 高亮图像已保存到当前目录');
      } else {
        console.log('\n⚠️  图片输入功能需要进一步调试');
      }

      return {
        success: successCount > 0,
        results: results,
        successRate: (successCount / results.length) * 100
      };

    } catch (error) {
      console.error('💥 测试过程中发生异常:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 主函数
async function main() {
  const tester = new ImageInputTest();
  await tester.runImageInputTest();
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ImageInputTest };