/**
 * Real Test Script
 * 真实测试脚本，测试与真实UI-Ins模型的连接
 */

import axios from 'axios';

const SERVICE_URL = 'http://localhost:8899';

async function testRealModel(): Promise<any> {
  console.log('🧪 测试真实UI-Ins模型服务');
  console.log('=' .repeat(50));

  try {
    // 1. 检查服务健康状态
    console.log('\n📊 检查服务健康状态...');
    const healthResponse = await axios.get(`${SERVICE_URL}/health`);
    console.log('✅ 服务健康:', healthResponse.data);
    console.log(`  模型已加载: ${healthResponse.data.model_loaded ? '是' : '否'}`);
    console.log(`  依赖状态:`, healthResponse.data.dependencies);

    if (!healthResponse.data.model_loaded) {
      console.log('\n⚠️  模型未加载，使用模拟模式');
      console.log('  要使用真实模型，请确保已安装:');
      console.log('  pip install torch torchvision transformers pillow');
    }

    // 2. 测试基础识别功能
    console.log('\n🔍 测试基础UI识别功能...');

    // 创建一个测试图像（简单的PNG）
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const testCases = [
      {
        name: '点击测试',
        query: 'Click the search button',
        description: '测试点击指令识别'
      },
      {
        name: '中文点击测试',
        query: '点击登录按钮',
        description: '测试中文指令识别'
      },
      {
        name: '输入测试',
        query: '在用户名输入框中输入文本',
        description: '测试输入指令识别'
      },
      {
        name: '通用识别测试',
        query: '识别页面中的所有可交互元素',
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
            max_tokens: 128,
            top_p: 0.9
          }
        }, { timeout: 30000 }); // 30秒超时

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
          });
        }

        if (response.data.actions.length > 0) {
          console.log(`   - 操作建议:`);
          response.data.actions.forEach((action, index) => {
            console.log(`     ${index + 1}. ${action.type}: ${action.reason}`);
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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 3. 性能测试
    console.log('\n⚡ 性能测试 (3次连续请求)...');
    const perfTimes = [];

    for (let i = 0; i < 3; i++) {
      try {
        const start = Date.now();
        const response = await axios.post(`${SERVICE_URL}/recognize`, {
          request_id: 100 + i,
          image: testImage,
          query: `性能测试 #${i + 1}`,
          scope: 'full'
        }, { timeout: 30000 });

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

    // 4. 错误处理测试
    console.log('\n🧪 错误处理测试...');

    // 测试无效图像
    try {
      const errorResponse = await axios.post(`${SERVICE_URL}/recognize`, {
        request_id: 999,
        image: 'invalid_base64_image',
        query: '测试错误处理'
      });
      console.log('⚠️  无效图像测试应该失败但成功了');
    } catch (error) {
      console.log('✅ 无效图像测试: 正确拒绝无效图像');
    }

    console.log('\n🎉 真实模型测试完成！');

    // 5. 总结
    console.log('\n📋 测试总结:');
    console.log(`- 服务状态: ${healthResponse.data.model_loaded ? '真实模型模式' : '模拟模式'}`);
    console.log(`- 功能测试: ${testCases.length} 个测试用例`);
    console.log(`- 性能测试: ${perfTimes.length} 次有效测试`);

    if (healthResponse.data.model_loaded) {
      console.log('- 建议: 服务运行正常，可以使用真实UI-Ins模型');
    } else {
      console.log('- 建议: 安装模型依赖后重启服务以使用真实模型');
      console.log('  命令: pip install torch torchvision transformers pillow');
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 提示: 请确保Python服务正在运行');
      console.log('   启动命令: cd python-service && python3 working_server.py');
    } else if (error.response) {
      console.log('服务器响应错误:', error.response.data);
    }
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testRealModel().catch(console.error);
}

export { testRealModel };