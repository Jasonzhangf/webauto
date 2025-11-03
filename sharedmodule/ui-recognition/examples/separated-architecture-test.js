/**
 * 分离式架构测试
 * 测试浏览器控制服务和UI识别协调器
 */

import { spawn } from 'child_process';
import http from 'http';

class SeparatedArchitectureTest {
  constructor() {
    this.browserService = null;
    this.coordinatorService = null;
    this.services = [];
  }

  async runTest() {
    console.log('🚀 开始分离式架构测试');
    console.log('📋 测试目标: 验证浏览器控制 + UI识别 + 高亮协调的分离式架构\n');

    try {
      // 1. 启动浏览器控制服务
      await this.startBrowserService();

      // 2. 等待服务启动
      await this.waitForService('http://localhost:8001/health', '浏览器控制服务');

      // 3. 启动UI识别协调器
      await this.startCoordinatorService();

      // 4. 等待协调器启动
      await this.waitForService('http://localhost:8002/health', 'UI识别协调器');

      // 5. 检查所有服务状态
      await this.checkServicesStatus();

      // 6. 启动浏览器并登录
      await this.startBrowserAndLogin();

      // 7. 执行UI识别与高亮测试
      await this.performUIRecognitionTest();

      console.log('\n✅ 分离式架构测试完成！');
      console.log('👁 请查看浏览器页面上的绿色高亮效果');
      console.log('⏳ 保持服务运行，可以继续进行其他测试...');

      // 保持服务运行
      await this.keepServicesRunning();

    } catch (error) {
      console.error('❌ 分离式架构测试失败:', error.message);
      await this.cleanup();
    }
  }

  async startBrowserService() {
    console.log('🌐 启动浏览器控制服务...');

    return new Promise((resolve, reject) => {
      this.browserService = spawn('node', [
        'services/browser-control-service.js'
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let output = '';
      this.browserService.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(`[浏览器服务] ${text}`);

        if (text.includes('浏览器控制服务启动成功')) {
          resolve();
        }
      });

      this.browserService.stderr.on('data', (data) => {
        const text = data.toString();
        process.stderr.write(`[浏览器服务错误] ${text}`);
      });

      this.browserService.on('error', (error) => {
        console.error('❌ 浏览器服务启动失败:', error.message);
        reject(error);
      });

      this.browserService.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ 浏览器服务退出，代码: ${code}`);
          reject(new Error(`浏览器服务退出，代码: ${code}`));
        }
      });

      this.services.push(this.browserService);

      // 超时处理
      setTimeout(() => {
        if (!output.includes('浏览器控制服务启动成功')) {
          reject(new Error('浏览器服务启动超时'));
        }
      }, 30000);
    });
  }

  async startCoordinatorService() {
    console.log('🎯 启动UI识别协调器...');

    return new Promise((resolve, reject) => {
      this.coordinatorService = spawn('node', [
        'services/ui-highlight-coordinator.js'
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let output = '';
      this.coordinatorService.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(`[协调器服务] ${text}`);

        if (text.includes('UI识别与高亮协调器启动成功')) {
          resolve();
        }
      });

      this.coordinatorService.stderr.on('data', (data) => {
        const text = data.toString();
        process.stderr.write(`[协调器服务错误] ${text}`);
      });

      this.coordinatorService.on('error', (error) => {
        console.error('❌ 协调器服务启动失败:', error.message);
        reject(error);
      });

      this.coordinatorService.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ 协调器服务退出，代码: ${code}`);
          reject(new Error(`协调器服务退出，代码: ${code}`));
        }
      });

      this.services.push(this.coordinatorService);

      // 超时处理
      setTimeout(() => {
        if (!output.includes('UI识别与高亮协调器启动成功')) {
          reject(new Error('协调器服务启动超时'));
        }
      }, 30000);
    });
  }

  async waitForService(url, serviceName) {
    console.log(`⏳ 等待${serviceName}启动...`);

    const maxAttempts = 30;
    const interval = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.httpRequest(url);

        // 检查浏览器服务状态
        if (url.includes('8001')) {
          const data = JSON.parse(response);
          if (data.success && (data.status === 'stopped' || data.status === 'running')) {
            console.log(`✅ ${serviceName}已就绪`);
            return;
          }
        }
        // 检查协调器服务状态
        else if (url.includes('8002')) {
          const data = JSON.parse(response);
          if (data.success && data.status === 'running') {
            console.log(`✅ ${serviceName}已就绪`);
            return;
          }
        }
        // 其他服务检查
        else if (response.includes('running') || response.includes('healthy')) {
          console.log(`✅ ${serviceName}已就绪`);
          return;
        }
      } catch (error) {
        // 服务还未启动，继续等待
      }

      await this.sleep(interval);
    }

    throw new Error(`${serviceName}启动超时`);
  }

  async httpRequest(url) {
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

  async checkServicesStatus() {
    console.log('\n🔍 检查所有服务状态...');

    try {
      const response = await this.httpRequest('http://localhost:8002/status');
      const status = JSON.parse(response);

      console.log('\n📊 服务状态报告:');
      console.log(`🎯 协调器: ${status.coordinator.status}`);
      console.log(`🌐 浏览器服务: ${status.browserService ? status.browserService.status : '不可用'}`);
      console.log(`🤖 UI识别服务: ${status.uiService ? status.uiService.status : '不可用'}`);
      console.log(`📈 整体状态: ${status.overall}`);

      if (status.overall !== 'ready') {
        throw new Error('服务未完全就绪');
      }

    } catch (error) {
      console.error('❌ 服务状态检查失败:', error.message);
      throw error;
    }
  }

  async startBrowserAndLogin() {
    console.log('\n🔐 启动浏览器并登录1688...');

    const response = await this.httpPost('http://localhost:8001/start', {});
    const result = JSON.parse(response);

    if (!result.success) {
      throw new Error(`浏览器启动失败: ${result.error}`);
    }

    console.log('✅ 浏览器启动并登录成功');
  }

  async performUIRecognitionTest() {
    console.log('\n🎯 执行UI识别与高亮测试...');

    const response = await this.httpPost('http://localhost:8002/recognize-and-highlight', {
      query: '识别页面中的搜索框和用户头像，提供精确的坐标位置'
    });

    const result = JSON.parse(response);

    if (!result.success) {
      throw new Error(`UI识别与高亮失败: ${result.error}`);
    }

    console.log('\n📋 测试结果:');
    console.log(`✅ 截图: ${result.workflow.screenshot.success ? '成功' : '失败'}`);
    console.log(`✅ 识别: 找到 ${result.workflow.recognition.totalElements} 个元素，目标元素 ${result.workflow.recognition.targetElements} 个`);
    console.log(`✅ 高亮: 成功高亮 ${result.workflow.highlight.highlightedElements} 个元素`);

    if (result.elements && result.elements.length > 0) {
      console.log('\n🎯 高亮的元素:');
      result.elements.forEach((elem, i) => {
        console.log(`  ${i + 1}. ${elem.description} - (${elem.bbox.x1},${elem.bbox.y1})`);
      });
    }
  }

  async httpPost(url, data) {
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
        response.on('end', () => {
          try {
            resolve(responseData);
          } catch (error) {
            reject(error);
          }
        });
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('POST请求超时'));
      });

      request.write(postData);
      request.end();
    });
  }

  async keepServicesRunning() {
    console.log('\n⏳ 服务保持运行中...');
    console.log('💡 提示: 可以通过以下方式继续测试:');
    console.log('   curl -X POST http://localhost:8002/recognize-and-highlight -H "Content-Type: application/json" -d \'{"query":"识别搜索框"}\'');
    console.log('   curl http://localhost:8002/status');
    console.log('\n按 Ctrl+C 退出并清理所有服务');

    return new Promise((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\n🧹 收到退出信号，正在清理服务...');
        await this.cleanup();
        resolve();
      });

      // 防止Promise永远不resolve
      setInterval(() => {}, 1000);
    });
  }

  async cleanup() {
    console.log('🧹 清理所有服务...');

    for (const service of this.services) {
      if (service && !service.killed) {
        service.kill('SIGTERM');
      }
    }

    // 等待服务清理
    await this.sleep(2000);
    console.log('✅ 所有服务已清理');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 主执行函数
async function main() {
  const test = new SeparatedArchitectureTest();

  console.log('📌 分离式UI识别架构测试');
  console.log('📌 架构: 浏览器控制服务(8001) + UI识别协调器(8002) + UI识别服务(8898)');
  console.log('📌 功能: 浏览器登录保持 → 截图 → UI识别 → 坐标回传 → 高亮显示\n');

  try {
    await test.runTest();
  } catch (error) {
    console.error('\n💥 分离式架构测试失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SeparatedArchitectureTest;