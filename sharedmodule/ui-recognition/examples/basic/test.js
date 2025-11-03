/**
 * Basic Test for UI Recognition Service
 * 基础测试用例，验证核心功能
 */

import { UIRecognitionService } from '../../src/index.js';
import { createDummyImage } from './utils.js';

async function runBasicTest() {
  console.log('🚀 开始UI识别服务基础测试');
  console.log('=' .repeat(50));

  // 1. 创建服务实例
  console.log('\n📦 创建UI识别服务...');
  const service = new UIRecognitionService({
    modelPath: 'Tongyi-MiA/UI-Ins-7B',
    servicePort: 8899
  });

  // 监听服务事件
  service.on('status', (event) => {
    console.log(`📊 服务状态: ${event.status} - ${event.message}`);
  });

  service.on('request-start', (event) => {
    console.log(`🚀 请求开始: ID=${event.requestId}`);
  });

  service.on('request-complete', (event) => {
    console.log(`✅ 请求完成: ID=${event.requestId}, 时间=${event.processingTime}ms`);
  });

  service.on('request-error', (event) => {
    console.log(`❌ 请求失败: ID=${event.requestId}, 错误=${event.error}`);
  });

  service.on('error', (event) => {
    console.log(`🔥 服务错误: ${event.error}`);
  });

  try {
    // 2. 启动服务
    console.log('\n🔧 启动服务...');
    await service.start();
    console.log('✅ 服务启动成功');

    // 3. 检查服务状态
    console.log('\n📊 检查服务状态:');
    const status = service.getStatus();
    console.log(JSON.stringify(status, null, 2));

    // 4. 创建测试图像
    console.log('\n🖼️ 准备测试图像...');
    const testImage = createDummyImage();
    console.log(`✅ 测试图像已准备 (大小: ${Math.round(testImage.length / 1024)}KB)`);

    // 5. 测试全页面识别
    console.log('\n🔍 测试全页面识别...');
    const fullResult = await service.recognize({
      image: testImage,
      query: '识别页面中的所有可交互元素',
      scope: 'full'
    });

    console.log('\n📋 全页面识别结果:');
    console.log(`- 成功: ${fullResult.success}`);
    console.log(`- 元素数量: ${fullResult.elements.length}`);
    console.log(`- 操作建议: ${fullResult.actions.length}`);
    console.log(`- 处理时间: ${fullResult.processingTime}ms`);
    console.log(`- 置信度: ${fullResult.metadata.confidence.toFixed(3)}`);

    if (fullResult.elements.length > 0) {
      console.log('\n🎯 识别到的元素:');
      fullResult.elements.forEach((element, index) => {
        console.log(`  ${index + 1}. ${element.text} (${element.type}) - 置信度: ${element.confidence.toFixed(3)}`);
        console.log(`     位置: [${element.bbox.join(', ')}]`);
      });
    }

    if (fullResult.actions.length > 0) {
      console.log('\n⚡ 操作建议:');
      fullResult.actions.forEach((action, index) => {
        console.log(`  ${index + 1}. ${action.type}: ${action.reason}`);
        if (action.text) {
          console.log(`     输入: ${action.text}`);
        }
      });
    }

    // 6. 测试区域识别
    console.log('\n🔍 测试区域识别...');
    const regionResult = await service.recognize({
      image: testImage,
      query: '识别此区域的表单元素',
      scope: 'partial',
      region: { x: 50, y: 30, width: 400, height: 200 }
    });

    console.log('\n📋 区域识别结果:');
    console.log(`- 成功: ${regionResult.success}`);
    console.log(`- 元素数量: ${regionResult.elements.length}`);
    console.log(`- 处理时间: ${regionResult.processingTime}ms`);

    // 7. 测试目标定位
    console.log('\n🎯 测试目标定位...');
    const targetResult = await service.recognize({
      image: testImage,
      query: '找到并定位: 登录按钮',
      scope: 'full'
    });

    console.log('\n📋 目标定位结果:');
    console.log(`- 成功: ${targetResult.success}`);
    console.log(`- 找到元素: ${targetResult.elements.length}`);
    console.log(`- 分析结果: ${targetResult.analysis}`);

    // 8. 性能测试
    console.log('\n⚡ 性能测试 (5次连续请求)...');
    const perfTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const result = await service.recognize({
        image: testImage,
        query: `性能测试 #${i + 1}`,
        scope: 'full'
      });
      perfTimes.push(result.processingTime);
      console.log(`  测试 ${i + 1}: ${result.processingTime}ms - 元素: ${result.elements.length}`);
    }

    const avgTime = perfTimes.reduce((a, b) => a + b, 0) / perfTimes.length;
    const minTime = Math.min(...perfTimes);
    const maxTime = Math.max(...perfTimes);

    console.log('\n📊 性能统计:');
    console.log(`- 平均响应时间: ${avgTime.toFixed(2)}ms`);
    console.log(`- 最快响应时间: ${minTime}ms`);
    console.log(`- 最慢响应时间: ${maxTime}ms`);
    console.log(`- QPS (估算): ${(1000 / avgTime).toFixed(2)}`);

    // 9. 错误处理测试
    console.log('\n🧪 错误处理测试...');

    // 测试无效图像
    const errorResult1 = await service.recognize({
      image: 'invalid_base64_image',
      query: '测试错误处理'
    });
    console.log(`- 无效图像测试: ${errorResult1.success ? '失败' : '成功'} - ${errorResult1.error}`);

    // 测试无效区域
    const errorResult2 = await service.recognize({
      image: testImage,
      query: '测试错误处理',
      scope: 'partial',
      region: null  // 应该提供region但没提供
    });
    console.log(`- 无效区域测试: ${errorResult2.success ? '失败' : '成功'} - ${errorResult2.error}`);

    console.log('\n✅ 基础测试完成！');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    // 10. 停止服务
    console.log('\n🛑 停止服务...');
    await service.stop();
    console.log('✅ 服务已停止');
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runBasicTest().catch(console.error);
}

export { runBasicTest };