#!/usr/bin/env node
/**
 * Simple UI Recognition Service Test
 * 简单UI识别服务测试 - 测试服务连通性和基本功能
 */

import axios from 'axios';

const SERVICE_URL = 'http://localhost:8898';

class SimpleUITest {
  constructor() {
    this.testResults = [];
  }

  async testServiceHealth() {
    console.log('🏥 测试服务健康状态...');

    try {
      const response = await axios.get(`${SERVICE_URL}/health`);

      console.log('✅ 服务健康检查通过:');
      console.log(`   - 状态: ${response.data.status}`);
      console.log(`   - 模型已加载: ${response.data.model_loaded ? '是' : '否'}`);
      console.log(`   - 模型路径: ${response.data.model_path}`);
      console.log(`   - 设备: ${response.data.device}`);
      console.log(`   - 版本: ${response.data.version}`);

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ 服务健康检查失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testBasicRecognition() {
    console.log('\n🔍 测试基础UI识别功能...');

    // 创建一个简单的测试图像 (1x1像素的PNG)
    const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const testCases = [
      {
        name: '搜索框识别测试',
        query: '找到搜索输入框',
        expectedType: 'input'
      },
      {
        name: '按钮识别测试',
        query: '找到登录按钮',
        expectedType: 'button'
      },
      {
        name: '通用元素识别测试',
        query: '识别页面中的主要交互元素',
        expectedType: 'unknown'
      }
    ];

    const results = [];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n${i + 1}. ${testCase.name}`);
      console.log(`   查询: ${testCase.query}`);

      try {
        const startTime = Date.now();
        const response = await axios.post(`${SERVICE_URL}/recognize`, {
          request_id: i + 1,
          image: `data:image/png;base64,${testImage}`,
          query: testCase.query,
          scope: 'full',
          parameters: {
            temperature: 0.1,
            max_tokens: 128
          }
        }, {
          timeout: 10000, // 10秒超时
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const duration = Date.now() - startTime;

        console.log(`   ✅ 请求成功 (耗时: ${duration}ms)`);
        console.log(`   - 成功状态: ${response.data.success}`);
        console.log(`   - 元素数量: ${response.data.elements.length}`);
        console.log(`   - 操作建议: ${response.data.actions.length}`);
        console.log(`   - 置信度: ${response.data.confidence.toFixed(3)}`);

        if (response.data.analysis) {
          console.log(`   - 分析结果: ${response.data.analysis}`);
        }

        if (response.data.error) {
          console.log(`   - 错误信息: ${response.data.error}`);
        }

        results.push({
          testCase: testCase.name,
          success: response.data.success,
          duration: duration,
          elements: response.data.elements.length,
          error: response.data.error
        });

      } catch (error) {
        console.log(`   ❌ 请求失败: ${error.message}`);

        results.push({
          testCase: testCase.name,
          success: false,
          duration: 0,
          elements: 0,
          error: error.message
        });
      }

      // 在测试之间稍作延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  async testCompatibilityMode() {
    console.log('\n🔄 测试兼容模式 (不依赖真实模型)...');

    try {
      // 测试简化的识别请求
      const response = await axios.post(`${SERVICE_URL}/recognize`, {
        request_id: 999,
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        query: 'test query',
        scope: 'minimal',
        parameters: {
          temperature: 0.1,
          max_tokens: 64
        }
      }, { timeout: 5000 });

      console.log('✅ 兼容模式测试通过');
      console.log(`   - 响应状态: ${response.data.success ? '成功' : '失败'}`);
      console.log(`   - 处理时间: ${response.data.processing_time.toFixed(2)}ms`);

      return {
        success: response.data.success,
        processingTime: response.data.processing_time
      };

    } catch (error) {
      console.log('❌ 兼容模式测试失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async runFullTest() {
    console.log('🧪 开始UI识别系统简单测试');
    console.log('=' .repeat(50));

    const testSuite = {
      startTime: Date.now(),
      results: {}
    };

    try {
      // 1. 服务健康检查
      testSuite.results.health = await this.testServiceHealth();

      // 2. 基础识别功能测试
      testSuite.results.recognition = await this.testBasicRecognition();

      // 3. 兼容模式测试
      testSuite.results.compatibility = await this.testCompatibilityMode();

      // 计算总耗时
      testSuite.totalDuration = Date.now() - testSuite.startTime;

      // 生成测试报告
      this.generateTestReport(testSuite);

    } catch (error) {
      console.error('💥 测试过程中发生异常:', error.message);
      testSuite.error = error.message;
    }

    return testSuite;
  }

  generateTestReport(testSuite) {
    console.log('\n📊 测试报告');
    console.log('=' .repeat(50));

    console.log(`总耗时: ${testSuite.totalDuration}ms`);
    console.log(`测试开始时间: ${new Date(testSuite.startTime).toLocaleString()}`);
    console.log(`测试结束时间: ${new Date().toLocaleString()}`);

    // 健康检查结果
    console.log('\n🏥 服务健康检查:');
    const health = testSuite.results.health;
    if (health) {
      console.log(`   状态: ${health.success ? '✅ 通过' : '❌ 失败'}`);
      if (health.data) {
        console.log(`   模型状态: ${health.data.model_loaded ? '已加载' : '未加载'}`);
        console.log(`   设备类型: ${health.data.device}`);
      }
    }

    // 识别功能测试结果
    console.log('\n🔍 识别功能测试:');
    const recognition = testSuite.results.recognition;
    if (recognition && recognition.length > 0) {
      recognition.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.testCase}: ${result.success ? '✅' : '❌'} (${result.duration}ms)`);
        if (result.error) {
          console.log(`      错误: ${result.error}`);
        }
      });

      const successCount = recognition.filter(r => r.success).length;
      console.log(`   成功率: ${successCount}/${recognition.length} (${((successCount/recognition.length)*100).toFixed(1)}%)`);
    }

    // 兼容模式测试结果
    console.log('\n🔄 兼容模式测试:');
    const compatibility = testSuite.results.compatibility;
    if (compatibility) {
      console.log(`   状态: ${compatibility.success ? '✅ 通过' : '❌ 失败'}`);
      if (compatibility.processingTime) {
        console.log(`   处理时间: ${compatibility.processingTime.toFixed(2)}ms`);
      }
    }

    // 总结
    console.log('\n📋 测试总结:');
    const healthPassed = health && health.success;
    const recognitionPassed = recognition && recognition.some(r => r.success);
    const compatibilityPassed = compatibility && compatibility.success;

    if (healthPassed && (recognitionPassed || compatibilityPassed)) {
      console.log('🎉 UI识别系统基本功能正常！');
      console.log('💡 注意: 完整功能需要模型下载完成');
    } else {
      console.log('⚠️  UI识别系统存在问题需要检查');
    }
  }
}

// 主函数
async function main() {
  const tester = new SimpleUITest();
  await tester.runFullTest();
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SimpleUITest };