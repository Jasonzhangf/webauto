/**
 * Simple Test Script
 * 简单测试脚本，测试与Python服务的连接
 */

import axios from 'axios';

const SERVICE_URL = 'http://localhost:8899';

async function testConnection(): Promise<any> {
  console.log('🔗 测试Python服务连接...');

  try {
    // 测试健康检查
    console.log('\n📊 健康检查...');
    const healthResponse = await axios.get(`${SERVICE_URL}/health`);
    console.log('✅ 服务健康:', healthResponse.data);

    // 测试识别功能
    console.log('\n🔍 测试UI识别功能...');

    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAMElEQVR42mP8//8/AyIiMjJ6RURERHGBkYGhhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWBgYGBkZGRkAAAAA//8DAJcFMBsKAAAAAElFTkSuQmCC';

    const recognizeResponse = await axios.post(`${SERVICE_URL}/recognize`, {
      request_id: 1,
      image: testImage,
      query: '识别页面中的可交互元素',
      scope: 'full',
      parameters: {
        temperature: 0.1,
        max_tokens: 512
      }
    });

    console.log('✅ 识别成功:');
    console.log(`- 元素数量: ${recognizeResponse.data.elements.length}`);
    console.log(`- 操作建议: ${recognizeResponse.data.actions.length}`);
    console.log(`- 处理时间: ${recognizeResponse.data.processing_time.toFixed(2)}ms`);
    console.log(`- 置信度: ${recognizeResponse.data.confidence.toFixed(3)}`);

    if (recognizeResponse.data.elements.length > 0) {
      console.log('\n🎯 识别到的元素:');
      recognizeResponse.data.elements.forEach((element, index) => {
        console.log(`  ${index + 1}. ${element.text} (${element.type}) - 置信度: ${element.confidence.toFixed(3)}`);
      });
    }

    if (recognizeResponse.data.actions.length > 0) {
      console.log('\n⚡ 操作建议:');
      recognizeResponse.data.actions.forEach((action, index) => {
        console.log(`  ${index + 1}. ${action.type}: ${action.reason}`);
      });
    }

    console.log('\n🎉 基础功能测试完成！服务运行正常。');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 提示: 请确保Python服务正在运行');
      console.log('   启动命令: cd python-service && python3 server.py');
    }
  }
}

// 运行测试
testConnection();