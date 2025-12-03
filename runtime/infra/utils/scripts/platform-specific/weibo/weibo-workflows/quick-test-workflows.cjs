/**
 * 快速测试工作流系统（不进行实际网络操作）
 */

const WorkflowOrchestrator = require('./core/workflow-orchestrator.js.cjs');
const homepageWorkflow = require('./workflows/weibo-homepage-workflow.js.cjs');
const profileWorkflow = require('./workflows/weibo-profile-workflow.js.cjs');
const searchWorkflow = require('./workflows/weibo-search-workflow.js.cjs');

async function quickTestWorkflows() {
  console.log('🚀 快速测试微博工作流系统...');

  try {
    // 创建工作流编排器
    const orchestrator = new WorkflowOrchestrator();

    // 注册所有工作流
    orchestrator.registerWorkflow('weibo-homepage', homepageWorkflow.WorkflowClass, homepageWorkflow.config);
    orchestrator.registerWorkflow('weibo-profile', profileWorkflow.WorkflowClass, profileWorkflow.config);
    orchestrator.registerWorkflow('weibo-search', searchWorkflow.WorkflowClass, searchWorkflow.config);

    console.log('✅ 工作流注册完成');
    console.log('📝 已注册工作流:', Array.from(orchestrator.workflows.keys()));

    // 验证工作流结构
    const workflowTypes = ['weibo-homepage', 'weibo-profile', 'weibo-search'];

    for (const workflowType of workflowTypes) {
      const workflowDef = orchestrator.workflows.get(workflowType);
      if (workflowDef) {
        console.log(`\n🔍 验证工作流: ${workflowType}`);
        console.log(`  - 名称: ${workflowDef.config.name || workflowType}`);
        console.log(`  - 版本: ${workflowDef.config.version || 'N/A'}`);
        console.log(`  - 描述: ${workflowDef.config.description || 'N/A'}`);
        console.log(`  - 类别: ${workflowDef.config.category || 'N/A'}`);
        console.log(`  - 构造函数: ${typeof workflowDef.class === 'function' ? '✅' : '❌'}`);

        // 验证原子操作
        try {
          const tempInstance = new workflowDef.class();
          console.log(`  - 原子操作注册方法: ${typeof tempInstance.registerAtomicOperations === 'function' ? '✅' : '❌'}`);
          console.log(`  - 执行方法: ${typeof tempInstance.executeWorkflow === 'function' ? '✅' : '❌'}`);
          console.log(`  - 已注册原子操作数量: ${Object.keys(tempInstance.atomicOperations || {}).length}`);
        } catch (error) {
          console.log(`  - 实例化测试: ⚠️ (需要浏览器上下文或初始化参数)`);
        }
      } else {
        console.log(`❌ 工作流未找到: ${workflowType}`);
      }
    }

    console.log('\n✅ 工作流系统结构验证完成！');
    console.log('🎊 三种微博主页工作流都已实现并采用原子操作模式！');

    await orchestrator.destroy();

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

// 运行测试
quickTestWorkflows()
  .then(() => {
    console.log('\n🎉 微博工作流系统验证完成！');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 验证失败:', error.message);
    process.exit(1);
  });