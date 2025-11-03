#!/usr/bin/env node
/**
 * Weibo UI Recognition Test
 * 微博UI识别测试 - 使用我们的UI识别系统识别搜索框并执行操作
 */

import { chromium } from 'playwright';
import axios from 'axios';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// UI识别服务配置
const UI_SERVICE_URL = 'http://localhost:8898';

class WeiboUITest {
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

  async navigateToWeibo() {
    console.log('\n🌐 导航到微博...');

    try {
      // 导航到微博
      await this.page.goto('https://weibo.com', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log('✅ 已导航到微博首页');

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
    const screenshotPath = join(__dirname, 'screenshots', `weibo-${description}-${timestamp}.png`);

    // 确保截图目录存在
    const fs = await import('fs');
    await fs.promises.mkdir(dirname(screenshotPath), { recursive: true });

    // 截图
    await this.page.screenshot({
      path: screenshotPath,
      fullPage: false
    });

    console.log(`📸 截图已保存: ${screenshotPath}`);
    return screenshotPath;
  }

  async imageToBase64(imagePath) {
    const fs = await import('fs');
    const imageBuffer = await fs.promises.readFile(imagePath);
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
        timeout: 60000,
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
          element: element,
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

  async clickElement(bbox) {
    console.log(`🖱️  执行点击操作: ${JSON.stringify(bbox)}`);

    try {
      // 计算点击中心点
      const centerX = (bbox[0] + bbox[2]) / 2;
      const centerY = (bbox[1] + bbox[3]) / 2;

      console.log(`   点击坐标: (${centerX}, ${centerY})`);

      // 执行点击
      await this.page.mouse.click(centerX, centerY);

      // 等待可能的页面变化
      await this.page.waitForTimeout(1000);

      console.log('✅ 点击操作完成');
      return true;
    } catch (error) {
      console.error(`❌ 点击操作失败: ${error.message}`);
      return false;
    }
  }

  async typeText(text, selector = null) {
    console.log(`⌨️  输入文本: ${text}`);

    try {
      if (selector) {
        await this.page.fill(selector, text);
      } else {
        // 如果没有选择器，使用当前焦点元素
        await this.page.keyboard.type(text);
      }

      await this.page.waitForTimeout(500);
      console.log('✅ 文本输入完成');
      return true;
    } catch (error) {
      console.error(`❌ 文本输入失败: ${error.message}`);
      return false;
    }
  }

  async testSearchBoxRecognition() {
    console.log('\n🎯 开始搜索框识别测试');
    console.log('=' .repeat(50));

    const testStep = {
      name: '搜索框识别和操作测试',
      startTime: Date.now(),
      results: {}
    };

    try {
      // 1. 截取初始页面
      testStep.results.initialScreenshot = await this.takeScreenshot('initial');
      const initialImageBase64 = await this.imageToBase64(testStep.results.initialScreenshot);

      // 2. 识别搜索框
      const searchRecognition = await this.recognizeUI(
        initialImageBase64,
        '找到微博的搜索输入框并返回其精确坐标'
      );

      testStep.results.searchRecognition = searchRecognition;

      if (!searchRecognition.success) {
        testStep.results.success = false;
        testStep.results.error = '搜索框识别失败';
        testStep.endTime = Date.now();
        testStep.results.duration = testStep.endTime - testStep.startTime;
        this.testResults.push(testStep);
        return testStep;
      }

      // 3. 点击搜索框
      testStep.results.clickSuccess = await this.clickElement(searchRecognition.element.bbox);

      if (!testStep.results.clickSuccess) {
        testStep.results.success = false;
        testStep.results.error = '点击搜索框失败';
        testStep.endTime = Date.now();
        testStep.results.duration = testStep.endTime - testStep.startTime;
        this.testResults.push(testStep);
        return testStep;
      }

      // 4. 截取点击后的页面
      testStep.results.afterClickScreenshot = await this.takeScreenshot('after-click');

      // 5. 输入搜索文本
      testStep.results.inputSuccess = await this.typeText('UI识别测试', null);

      // 6. 截取输入后的页面
      testStep.results.afterInputScreenshot = await this.takeScreenshot('after-input');
      const afterInputImageBase64 = await this.imageToBase64(testStep.results.afterInputScreenshot);

      // 7. 验证输入是否成功（再次识别输入框）
      const verificationRecognition = await this.recognizeUI(
        afterInputBase64,
        '验证搜索输入框是否激活并包含文本'
      );

      testStep.results.verificationRecognition = verificationRecognition;

      // 8. 判断测试结果
      testStep.results.success = testStep.results.clickSuccess &&
                              testStep.results.inputSuccess &&
                              verificationRecognition.success;

      testStep.results.endTime = Date.now();
      testStep.results.duration = testStep.results.endTime - testStep.startTime;

      if (testStep.results.success) {
        console.log('🎉 测试成功完成！');
        console.log(`   - 搜索框识别: ✅`);
        console.log(`   - 点击操作: ✅`);
        console.log(`   - 文本输入: ✅`);
        console.log(`   - 验证成功: ✅`);
        console.log(`   - 总耗时: ${testStep.results.duration}ms`);
      } else {
        console.log('❌ 测试失败');
        console.log(`   - 搜索框识别: ${testStep.results.searchRecognition.success ? '✅' : '❌'}`);
        console.log(`   - 点击操作: ${testStep.results.clickSuccess ? '✅' : '❌'}`);
        console.log(`   - 文本输入: ${testStep.results.inputSuccess ? '✅' : '❌'}`);
        console.log(`   - 验证成功: ${verificationRecognition.success ? '✅' : '❌'}`);
        console.log(`   - 失败原因: ${testStep.results.error || '部分操作失败'}`);
        console.log(`   - 总耗时: ${testStep.results.duration}ms`);
      }

    } catch (error) {
      console.error('💥 测试过程中发生异常:', error.message);
      testStep.results.success = false;
      testStep.results.error = error.message;
      testStep.results.endTime = Date.now();
      testStep.results.duration = testStep.results.endTime - testStep.startTime;
    }

    this.testResults.push(testStep);
    return testStep;
  }

  async runFullTest() {
    console.log('🧪 开始微博UI识别完整测试');
    console.log('=' .repeat(60));
    console.log('测试目标:');
    console.log('1. 打开微博网页');
    console.log('2. 使用UI识别系统定位搜索框');
    console.log('3. 使用魔法鼠标点击搜索框');
    console.log('4. 输入测试文本');
    console.log('5. 验证操作成功');
    console.log('=' .repeat(60));

    try {
      // 初始化浏览器
      await this.init();

      // 导航到微博
      const navigationSuccess = await this.navigateToWeibo();
      if (!navigationSuccess) {
        throw new Error('微博导航失败');
      }

      // 执行主要测试
      await this.testSearchBoxRecognition();

      // 等待一段时间观察结果
      console.log('\n⏳ 等待5秒观察测试结果...');
      await this.page.waitForTimeout(5000);

      // 最终截图
      await this.takeScreenshot('final-result');

    } catch (error) {
      console.error('💥 测试失败:', error.message);
    }
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

  printTestSummary() {
    console.log('\n📊 测试结果总结');
    console.log('=' .repeat(50));

    if (this.testResults.length === 0) {
      console.log('❌ 没有执行任何测试');
      return;
    }

    this.testResults.forEach((result, index) => {
      const status = result.results.success ? '✅ 成功' : '❌ 失败';
      const duration = result.results.duration || 0;

      console.log(`${index + 1}. ${result.name}: ${status} (${duration}ms)`);

      if (!result.results.success && result.results.error) {
        console.log(`   错误: ${result.results.error}`);
      }
    });

    const successCount = this.testResults.filter(r => r.results.success).length;
    const totalCount = this.testResults.length;

    console.log('\n📈 统计信息:');
    console.log(`- 总测试数: ${totalCount}`);
    console.log(`- 成功数: ${successCount}`);
    console.log(`- 失败数: ${totalCount - successCount}`);
    console.log(`- 成功率: ${((successCount / totalCount) * 100).toFixed(1)}%`);

    if (successCount === totalCount) {
      console.log('\n🎉 所有测试通过！UI识别系统工作正常。');
    } else {
      console.log('\n⚠️  部分测试失败，请检查UI识别系统配置。');
    }
  }
}

// 主函数
async function main() {
  const tester = new WeiboUITest();

  try {
    await tester.runFullTest();
  } catch (error) {
    console.error('💥 主程序执行失败:', error);
  } finally {
    tester.printTestSummary();
    await tester.cleanup();
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { WeiboUITest };