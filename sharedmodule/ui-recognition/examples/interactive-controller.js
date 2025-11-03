/**
 * 交互式UI控制器
 * 允许用户通过命令行控制浏览器进行UI识别和操作
 */

import http from 'http';
import fs from 'fs';
import readline from 'readline';

class InteractiveController {
  constructor() {
    this.browserServiceUrl = 'http://localhost:8001';
    this.uiServiceUrl = 'http://localhost:8899';
    this.currentScreenshot = null;
    this.lastRecognitionResults = null;

    this.setupReadline();
  }

  setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\n🤖 UI控制 > '
    });
  }

  async start() {
    console.log('🎮 交互式UI控制器启动');
    console.log('📡 浏览器服务:', this.browserServiceUrl);
    console.log('🤖 UI识别服务:', this.uiServiceUrl);
    console.log('\n📋 可用命令:');
    console.log('  screenshot     - 截取当前页面');
    console.log('  recognize <查询> - UI识别（例如: recognize 搜索框和按钮）');
    console.log('  highlight <描述> - 高亮指定元素（例如: highlight 搜索框）');
    console.log('  clear          - 清除所有高亮');
    console.log('  click <描述>    - 点击指定元素');
    console.log('  status         - 查看服务状态');
    console.log('  help           - 显示帮助');
    console.log('  exit           - 退出程序');

    this.rl.prompt();

    this.rl.on('line', async (input) => {
      await this.handleCommand(input.trim());
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\n👋 再见！');
      process.exit(0);
    });
  }

  async handleCommand(input) {
    if (!input) return;

    const [command, ...args] = input.split(' ');
    const fullArgs = args.join(' ');

    try {
      switch (command.toLowerCase()) {
        case 'screenshot':
          await this.takeScreenshot();
          break;
        case 'recognize':
          await this.recognizeUI(fullArgs || '识别页面中的所有UI元素');
          break;
        case 'highlight':
          await this.highlightElements(fullArgs);
          break;
        case 'clear':
          await this.clearHighlights();
          break;
        case 'click':
          await this.clickElement(fullArgs);
          break;
        case 'status':
          await this.checkStatus();
          break;
        case 'help':
          this.showHelp();
          break;
        case 'exit':
          this.rl.close();
          break;
        default:
          console.log(`❌ 未知命令: ${command}`);
          console.log('💡 输入 "help" 查看可用命令');
      }
    } catch (error) {
      console.error(`❌ 执行命令失败: ${error.message}`);
    }
  }

  async takeScreenshot() {
    console.log('📸 正在截取页面截图...');

    try {
      const response = await this.httpPost(`${this.browserServiceUrl}/screenshot`);
      const result = JSON.parse(response);

      if (result.success) {
        this.currentScreenshot = result.screenshot;
        console.log('✅ 截图成功');
        console.log(`📅 时间戳: ${new Date(result.timestamp).toLocaleString()}`);
        console.log(`📏 截图大小: ${(result.screenshot.length / 1024).toFixed(1)} KB`);
      } else {
        console.log('❌ 截图失败:', result.error);
      }
    } catch (error) {
      console.error('❌ 截图请求失败:', error.message);
    }
  }

  async recognizeUI(query) {
    if (!this.currentScreenshot) {
      console.log('❌ 请先截图 (输入 "screenshot")');
      return;
    }

    console.log(`🔍 正在识别: "${query}"`);

    try {
      const response = await this.httpPost(`${this.uiServiceUrl}/recognize`, {
        request_id: Date.now(),
        image: this.currentScreenshot,
        query: query,
        scope: 'full',
        parameters: {
          temperature: 0.1,
          max_tokens: 8192
        }
      });

      const result = JSON.parse(response);

      if (result.success) {
        this.lastRecognitionResults = result.elements;
        console.log(`✅ UI识别成功: 找到 ${result.elements.length} 个元素`);

        if (result.elements.length > 0) {
          console.log('\n📋 识别结果:');
          result.elements.forEach((elem, i) => {
            console.log(`  ${i + 1}. ${elem.type || '未知类型'} - ${elem.description || elem.text || '无描述'}`);
            console.log(`     位置: (${elem.bbox?.x1 || 0}, ${elem.bbox?.y1 || 0}) → (${elem.bbox?.x2 || 0}, ${elem.bbox?.y2 || 0})`);
            console.log(`     置信度: ${(elem.confidence || 0).toFixed(2)}`);
            console.log('');
          });
        } else {
          console.log('⚠️ 未找到匹配的元素');
        }
      } else {
        console.log('❌ UI识别失败:', result.error);
      }
    } catch (error) {
      console.error('❌ UI识别请求失败:', error.message);
    }
  }

  async highlightElements(description) {
    if (!this.lastRecognitionResults || this.lastRecognitionResults.length === 0) {
      console.log('❌ 请先进行UI识别 (输入 "recognize <查询>")');
      return;
    }

    console.log(`🎨 正在高亮: "${description}"`);

    // 查找匹配的元素
    const matchedElements = this.lastRecognitionResults.filter(elem => {
      const searchText = (elem.text || '').toLowerCase();
      const descText = (elem.description || '').toLowerCase();
      const idText = (elem.id || '').toLowerCase();
      const targetText = description.toLowerCase();

      return searchText.includes(targetText) ||
             descText.includes(targetText) ||
             idText.includes(targetText);
    });

    if (matchedElements.length === 0) {
      console.log('⚠️ 未找到匹配的元素');
      console.log('💡 可用元素:');
      this.lastRecognitionResults.forEach((elem, i) => {
        console.log(`  ${i + 1}. ${elem.description || elem.text || elem.id || '无描述'}`);
      });
      return;
    }

    console.log(`🎯 找到 ${matchedElements.length} 个匹配元素`);

    try {
      const response = await this.httpPost(`${this.browserServiceUrl}/highlight`, {
        elements: matchedElements.map(elem => ({
          bbox: elem.bbox,
          color: '#00ff00',
          label: elem.description || elem.text || '识别元素'
        }))
      });

      const result = JSON.parse(response);

      if (result.success) {
        console.log('✅ 高亮成功');
        console.log(`📅 时间戳: ${new Date(result.timestamp).toLocaleString()}`);
      } else {
        console.log('❌ 高亮失败:', result.error);
      }
    } catch (error) {
      console.error('❌ 高亮请求失败:', error.message);
    }
  }

  async clearHighlights() {
    console.log('🧹 正在清除高亮...');

    try {
      // 通过执行JavaScript来清除高亮
      const response = await this.httpPost(`${this.browserServiceUrl}/highlight`, {
        elements: [{
          bbox: { x1: 0, y1: 0, x2: 0, y2: 0 },
          color: 'transparent',
          label: 'clear',
          action: 'clear'
        }]
      });

      const result = JSON.parse(response);

      if (result.success) {
        console.log('✅ 高亮已清除');
      } else {
        console.log('⚠️ 清除高亮失败，但可以继续使用');
      }
    } catch (error) {
      console.log('⚠️ 清除高亮失败:', error.message);
    }
  }

  async clickElement(description) {
    if (!this.lastRecognitionResults || this.lastRecognitionResults.length === 0) {
      console.log('❌ 请先进行UI识别 (输入 "recognize <查询>")');
      return;
    }

    console.log(`👆 正在点击: "${description}"`);

    // 查找匹配的元素
    const matchedElement = this.lastRecognitionResults.find(elem => {
      const searchText = (elem.text || '').toLowerCase();
      const descText = (elem.description || '').toLowerCase();
      const idText = (elem.id || '').toLowerCase();
      const targetText = description.toLowerCase();

      return searchText.includes(targetText) ||
             descText.includes(targetText) ||
             idText.includes(targetText);
    });

    if (!matchedElement) {
      console.log('⚠️ 未找到匹配的元素');
      console.log('💡 可用元素:');
      this.lastRecognitionResults.forEach((elem, i) => {
        console.log(`  ${i + 1}. ${elem.description || elem.text || elem.id || '无描述'}`);
      });
      return;
    }

    const centerX = Math.floor((matchedElement.bbox.x1 + matchedElement.bbox.x2) / 2);
    const centerY = Math.floor((matchedElement.bbox.y1 + matchedElement.bbox.y2) / 2);

    console.log(`🎯 点击位置: (${centerX}, ${centerY})`);

    try {
      // 这里需要在浏览器服务中实现点击功能
      console.log('⚠️ 点击功能需要在浏览器服务中实现');
      console.log('🔧 建议的坐标:', centerX, centerY);
    } catch (error) {
      console.error('❌ 点击请求失败:', error.message);
    }
  }

  async checkStatus() {
    console.log('🔍 检查服务状态...');

    try {
      // 检查浏览器服务
      const browserResponse = await this.httpGet(`${this.browserServiceUrl}/health`);
      const browserStatus = JSON.parse(browserResponse);

      // 检查UI识别服务
      const uiResponse = await this.httpGet(`${this.uiServiceUrl}/health`);
      const uiStatus = JSON.parse(uiResponse);

      console.log('\n📊 服务状态报告:');
      console.log(`🌐 浏览器服务: ${browserStatus.success ? '✅ 运行中' : '❌ 离线'}`);
      console.log(`   登录状态: ${browserStatus.isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);
      console.log(`   状态: ${browserStatus.status}`);

      console.log(`🤖 UI识别服务: ${uiStatus.status === 'healthy' ? '✅ 健康' : '❌ 异常'}`);
      console.log(`   模型加载: ${uiStatus.model_loaded ? '✅ 已加载' : '❌ 未加载'}`);

      console.log(`📸 截图状态: ${this.currentScreenshot ? '✅ 已截图' : '❌ 未截图'}`);
      console.log(`🔍 识别结果: ${this.lastRecognitionResults ? `✅ ${this.lastRecognitionResults.length} 个元素` : '❌ 未识别'}`);

    } catch (error) {
      console.error('❌ 状态检查失败:', error.message);
    }
  }

  showHelp() {
    console.log('\n📋 交互式UI控制器帮助:');
    console.log('');
    console.log('🔧 基础命令:');
    console.log('  screenshot              - 截取当前页面');
    console.log('  recognize <查询>        - UI识别（支持中文）');
    console.log('  highlight <描述>        - 高亮指定元素');
    console.log('  clear                   - 清除所有高亮');
    console.log('');
    console.log('🎯 操作命令:');
    console.log('  click <描述>            - 点击指定元素');
    console.log('');
    console.log('ℹ️ 信息命令:');
    console.log('  status                  - 查看服务状态');
    console.log('  help                    - 显示此帮助');
    console.log('  exit                    - 退出程序');
    console.log('');
    console.log('💡 使用示例:');
    console.log('  screenshot');
    console.log('  recognize 搜索框和用户头像');
    console.log('  highlight 搜索框');
    console.log('  highlight 用户头像');
    console.log('');
    console.log('🎮 工作流程:');
    console.log('  1. 先截图: screenshot');
    console.log('  2. 再识别: recognize <你想要找的元素>');
    console.log('  3. 最后高亮: highlight <具体元素描述>');
  }

  httpPost(url, data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const request = http.request(url, options, (response) => {
        let responseData = '';
        response.on('data', chunk => responseData += chunk);
        response.on('end', () => resolve(responseData));
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('请求超时'));
      });

      request.write(postData);
      request.end();
    });
  }

  httpGet(url) {
    return new Promise((resolve, reject) => {
      const request = http.get(url, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });

      request.on('error', reject);
      request.setTimeout(5000, () => {
        request.destroy();
        reject(new Error('请求超时'));
      });
    });
  }
}

// 启动交互式控制器
const controller = new InteractiveController();
controller.start().catch(error => {
  console.error('💥 控制器启动失败:', error.message);
  process.exit(1);
});

export default InteractiveController;