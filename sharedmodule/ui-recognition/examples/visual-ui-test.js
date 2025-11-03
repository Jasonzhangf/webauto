#!/usr/bin/env node
/**
 * Visual UI Recognition Test
 * 可视化UI识别测试 - 用绿色高亮框标注识别结果
 */

import axios from 'axios';
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { createCanvas, loadImage } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// UI识别服务配置
const UI_SERVICE_URL = 'http://localhost:8898';

class VisualUITest {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.testResults = [];
  }

  async init() {
    console.log('🚀 初始化浏览器...');

    // 启动浏览器
    this.browser = await chromium.launch({
      headless: false,  // 显示浏览器窗口以便观察
      slowMo: 100,      // 减慢操作以便观察
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    this.page = await this.context.newPage();

    console.log('✅ 浏览器初始化完成');
  }

  async navigateToTestPage() {
    console.log('\n🌐 导航到测试页面...');

    try {
      // 导航到一个有丰富UI元素的测试页面
      await this.page.goto('https://github.com', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log('✅ 已导航到GitHub首页');

      // 等待页面加载
      await this.page.waitForTimeout(2000);

      return true;
    } catch (error) {
      console.error('❌ 导航失败:', error.message);
      return false;
    }
  }

  async takeScreenshot(description) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = join(__dirname, 'screenshots', `visual-test-${description}-${timestamp}.png`);

    // 确保截图目录存在
    await fs.mkdir(dirname(screenshotPath), { recursive: true });

    // 截图
    await this.page.screenshot({
      path: screenshotPath,
      fullPage: false
    });

    console.log(`📸 截图已保存: ${screenshotPath}`);
    return screenshotPath;
  }

  async imageToBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  }

  async recognizeUI(imageBase64, query) {
    console.log(`🔍 UI识别: ${query}`);

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

      if (response.data.success && response.data.elements.length > 0) {
        const element = response.data.elements[0];
        console.log(`✅ 识别成功:`);
        console.log(`   - 元素类型: ${element.type}`);
        console.log(`   - 坐标范围: ${JSON.stringify(element.bbox)}`);
        console.log(`   - 置信度: ${element.confidence.toFixed(3)}`);

        return {
          success: true,
          elements: response.data.elements,
          actions: response.data.actions
        };
      } else {
        console.log(`❌ 识别失败: 未找到目标元素`);
        console.log(`   - 响应: ${response.data.analysis || response.data.error}`);

        return {
          success: false,
          error: response.data.error || '未找到目标元素'
        };
      }
    } catch (error) {
      console.error(`❌ UI识别异常: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async drawBoundingBoxes(originalImagePath, elements, outputSuffix) {
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
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = join(__dirname, 'screenshots', `highlighted-${outputSuffix}-${timestamp}.png`);

      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);

      console.log(`✅ 高亮图像已保存: ${outputPath}`);
      return outputPath;

    } catch (error) {
      console.error(`❌ 绘制高亮框失败: ${error.message}`);
      return null;
    }
  }

  async runVisualTest() {
    console.log('\n🎨 开始可视化UI识别测试');
    console.log('=' .repeat(60));

    const testStep = {
      name: '可视化UI识别测试',
      startTime: Date.now(),
      results: {}
    };

    try {
      // 1. 初始化浏览器
      await this.init();

      // 2. 导航到测试页面
      const navigationSuccess = await this.navigateToTestPage();
      if (!navigationSuccess) {
        throw new Error('页面导航失败');
      }

      // 3. 截取原始页面
      testStep.results.originalScreenshot = await this.takeScreenshot('original');
      const originalImageBase64 = await this.imageToBase64(testStep.results.originalScreenshot);

      // 4. 识别搜索框
      console.log('\n🔍 测试1: 识别搜索框');
      const searchRecognition = await this.recognizeUI(
        originalImageBase64,
        '找到页面中的搜索输入框'
      );

      if (searchRecognition.success) {
        // 5. 为搜索框绘制高亮框
        testStep.results.searchHighlighted = await this.drawBoundingBoxes(
          testStep.results.originalScreenshot,
          searchRecognition.elements,
          'search-box'
        );
      }

      // 6. 识别按钮
      console.log('\n🔍 测试2: 识别登录按钮');
      const buttonRecognition = await this.recognizeUI(
        originalImageBase64,
        '找到登录或注册按钮'
      );

      if (buttonRecognition.success) {
        // 7. 为按钮绘制高亮框
        testStep.results.buttonHighlighted = await this.drawBoundingBoxes(
          testStep.results.originalScreenshot,
          buttonRecognition.elements,
          'login-button'
        );
      }

      // 8. 识别导航元素
      console.log('\n🔍 测试3: 识别导航元素');
      const navRecognition = await this.recognizeUI(
        originalImageBase64,
        '找到主要的导航菜单元素'
      );

      if (navRecognition.success) {
        // 9. 为导航元素绘制高亮框
        testStep.results.navHighlighted = await this.drawBoundingBoxes(
          testStep.results.originalScreenshot,
          navRecognition.elements,
          'navigation'
        );
      }

      // 10. 判断测试结果
      const successCount = [
        searchRecognition.success,
        buttonRecognition.success,
        navRecognition.success
      ].filter(Boolean).length;

      testStep.results.success = successCount > 0;
      testStep.results.successRate = (successCount / 3) * 100;
      testStep.results.endTime = Date.now();
      testStep.results.duration = testStep.results.endTime - testStep.startTime;

      // 11. 输出测试结果
      console.log('\n📊 测试结果总结:');
      console.log(`   - 搜索框识别: ${searchRecognition.success ? '✅ 成功' : '❌ 失败'}`);
      console.log(`   - 按钮识别: ${buttonRecognition.success ? '✅ 成功' : '❌ 失败'}`);
      console.log(`   - 导航识别: ${navRecognition.success ? '✅ 成功' : '❌ 失败'}`);
      console.log(`   - 成功率: ${testStep.results.successRate.toFixed(1)}%`);
      console.log(`   - 总耗时: ${testStep.results.duration}ms`);

      if (testStep.results.success) {
        console.log('\n🎉 可视化测试成功完成！');
        console.log('💡 高亮图像已保存到 screenshots/ 目录');
      } else {
        console.log('\n⚠️  部分识别失败，请检查UI识别系统');
      }

    } catch (error) {
      console.error('💥 测试过程中发生异常:', error.message);
      testStep.results.success = false;
      testStep.results.error = error.message;
    }

    this.testResults.push(testStep);
    return testStep;
  }

  async cleanup() {
    console.log('\n🧹 清理资源...');

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
      console.error('❌ 清理资源时出错:', error.message);
    }
  }
}

// 主函数
async function main() {
  const tester = new VisualUITest();

  try {
    await tester.runVisualTest();
  } catch (error) {
    console.error('💥 主程序执行失败:', error);
  } finally {
    await tester.cleanup();
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { VisualUITest };