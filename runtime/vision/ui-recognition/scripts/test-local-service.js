#!/usr/bin/env node
/**
 * Test Local Service Script
 * 测试本地UI识别服务
 */

import axios from 'axios';

const SERVICE_URL = 'http://localhost:8898';

async function testLocalService() {
  console.log('🧪 测试本地UI识别服务');
  console.log('=' .repeat(50));

  try {
    // 1. 检查服务健康状态
    console.log('\n📊 检查服务健康状态...');
    const healthResponse = await axios.get(`${SERVICE_URL}/health`);
    console.log('✅ 服务健康:', healthResponse.data);
    console.log(`  模型已加载: ${healthResponse.data.model_loaded ? '是' : '否'}`);
    console.log(`  模型路径: ${healthResponse.data.model_path}`);
    console.log(`  设备: ${healthResponse.data.device}`);

    // 2. 测试基础识别功能
    console.log('\n🔍 测试基础UI识别功能...');

    // 创建一个测试图像
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const testCases = [
      {
        name: '点击搜索按钮',
        query: 'Find the search button and provide its coordinates',
        description: '测试英文指令识别'
      },
      {
        name: '中文点击测试',
        query: '找到登录按钮并提供坐标',
        description: '测试中文指令识别'
      },
      {
        name: '输入框测试',
        query: '定位用户名输入框的位置',
        description: '测试输入框识别'
      },
      {
        name: '通用识别测试',
        query: '识别页面中的主要交互元素',
        description: '测试通用UI识别'
      }
    ];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n${i + 1}. ${testCase.name}: ${testCase.description}`);
      console.log(`   指令: ${testCase.query}`);

      try {
        const response = await axios.post(`${SERVICE_URL}/recognize`, {
          request_id: i + 1,
          image: testImage,
          query: testCase.query,
          scope: 'full',
          parameters: {
            temperature: 0.1,
            max_tokens: 256,
            top_p: 0.9
          }
        }, { timeout: 60000 }); // 60秒超时，给模型加载时间

        console.log(`   ✅ 识别成功:`);
        console.log(`   - 处理时间: ${response.data.processing_time.toFixed(2)}ms`);
        console.log(`   - 元素数量: ${response.data.elements.length}`);
        console.log(`   - 操作建议: ${response.data.actions.length}`);
        console.log(`   - 置信度: ${response.data.confidence.toFixed(3)}`);

        if (response.data.elements.length > 0) {
          console.log(`   - 识别结果:`);
          response.data.elements.forEach((element, index) => {
            console.log(`     ${index + 1}. ${element.text} (${element.type})`);
            console.log(`        位置: [${element.bbox.join(', ')}]`);
            console.log(`        置信度: ${element.confidence.toFixed(3)}`);
            console.log(`        描述: ${element.description}`);
          });
        }

        if (response.data.actions.length > 0) {
          console.log(`   - 操作建议:`);
          response.data.actions.forEach((action, index) => {
            console.log(`     ${index + 1}. ${action.type}: ${action.reason}`);
            if (action.text) {
              console.log(`        输入: ${action.text}`);
            }
          });
        }

        if (response.data.analysis) {
          console.log(`   - 分析结果: ${response.data.analysis}`);
        }

      } catch (error) {
        console.log(`   ❌ 识别失败: ${error.message}`);
        if (error.response) {
          console.log(`   错误详情: ${error.response.data.error}`);
        }
      }

      // 在测试之间稍作延迟
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 3. 性能测试
    console.log('\n⚡ 性能测试 (2次连续请求)...');
    const perfTimes = [];

    for (let i = 0; i < 2; i++) {
      try {
        const start = Date.now();
        const response = await axios.post(`${SERVICE_URL}/recognize`, {
          request_id: 100 + i,
          image: testImage,
          query: `性能测试 #${i + 1} - find any button`,
          scope: 'full'
        }, { timeout: 60000 });

        const totalTime = Date.now() - start;
        perfTimes.push(response.data.processing_time);
        console.log(`  测试 ${i + 1}: 总时间 ${totalTime}ms, 推理时间 ${response.data.processing_time}ms`);

      } catch (error) {
        console.log(`  测试 ${i + 1}: 失败 - ${error.message}`);
      }
    }

    if (perfTimes.length > 0) {
      const avgTime = perfTimes.reduce((a, b) => a + b, 0) / perfTimes.length;
      const minTime = Math.min(...perfTimes);
      const maxTime = Math.max(...perfTimes);

      console.log('\n📊 性能统计:');
      console.log(`- 平均推理时间: ${avgTime.toFixed(2)}ms`);
      console.log(`- 最快推理时间: ${minTime}ms`);
      console.log(`- 最慢推理时间: ${maxTime}ms`);
      console.log(`- QPS (估算): ${(1000 / avgTime).toFixed(2)}`);
    }

    console.log('\n🎉 本地服务测试完成！');

    // 4. 总结
    console.log('\n📋 测试总结:');
    console.log(`- 服务地址: ${SERVICE_URL}`);
    console.log(`- 功能测试: ${testCases.length} 个测试用例`);
    console.log(`- 性能测试: ${perfTimes.length} 次有效测试`);
    console.log(`- 模型状态: ${healthResponse.data.model_loaded ? '已加载' : '按需加载'}`);
    console.log(`- 设备类型: ${healthResponse.data.device}`);

    console.log('\n💡 使用说明:');
    console.log('1. 服务会在首次请求时加载模型（如果本地没有）');
    console.log('2. 首次请求可能需要较长时间（模型下载和加载）');
    console.log('3. 后续请求会很快，因为模型已加载到内存');
    console.log('4. 使用MPS加速（Apple Silicon GPU）');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 提示: 请确保本地服务正在运行');
      console.log('   启动命令: python3 python-service/local_model_server.py');
    } else if (error.response) {
      console.log('服务器响应错误:', error.response.data);
    }
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testLocalService().catch(console.error);
}

export { testLocalService };