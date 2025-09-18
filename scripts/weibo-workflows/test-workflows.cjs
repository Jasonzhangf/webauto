/**
 * 测试微博工作流系统
 */

const WorkflowOrchestrator = require('./core/workflow-orchestrator.js.cjs');
const { WeiboHomepageWorkflow } = require('./workflows/weibo-homepage-workflow.js.cjs');
const { createTestSystem, validateCookieFile } = require('../../tests/utils/test-helpers.cjs');
const { TEST_CONFIG } = require('../../tests/utils/test-config.cjs');

async function testWorkflows() {
  console.log('🚀 开始测试微博工作流系统...');

  // 验证Cookie
  const cookieValidation = validateCookieFile();
  if (!cookieValidation.valid) {
    throw new Error('Cookie验证失败');
  }

  console.log(`✅ Cookie验证成功 (${cookieValidation.count} 个Cookie)`);

  // 创建测试系统
  const testSystem = createTestSystem({
    logLevel: 'info',
    headless: false,
    timeout: 0
  });

  try {
    await testSystem.initialize();

    // 创建工作流编排器
    const orchestrator = new WorkflowOrchestrator();

    // 注册工作流
    orchestrator.registerWorkflow('weibo-homepage', WeiboHomepageWorkflow);
    console.log('📝 已注册微博主页工作流');

    // 测试主页工作流
    console.log('\n🔗 测试微博主页工作流...');

    const homepageResult = await orchestrator.executeWorkflow('weibo-homepage', {
      context: { page: testSystem.state.page, browser: testSystem.state.browser },
      maxPosts: 10, // 限制数量用于测试
      enableScrolling: true,
      contentExtraction: true
    });

    console.log('✅ 主页工作流测试完成');
    console.log(`📊 结果: ${homepageResult.summary.totalPosts} 条帖子`);

    // 保存结果
    const resultFile = `${TEST_CONFIG.paths.outputDir}/workflow-test-result-${Date.now()}.json`;
    require('fs').writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      testType: 'workflow-system',
      results: {
        homepage: homepageResult
      }
    }, null, 2));

    console.log(`📁 测试结果已保存: ${resultFile}`);

  } catch (error) {
    console.error('❌ 工作流测试失败:', error.message);
    throw error;
  } finally {
    await testSystem.cleanup();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testWorkflows()
    .then(() => {
      console.log('\n🎊 微博工作流系统测试完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 测试失败:', error.message);
      process.exit(1);
    });
}

module.exports = testWorkflows;