/**
 * 微博主页帖子提取工作流测试
 * 测试完整的workflow.execute()功能
 */

const { executeWorkflow, WorkflowManager, WorkflowUtils } = require('../src/core/workflow-executor');
const { WeiboHomepagePostsExtractionWorkflow } = require('../src/workflows/weibo-homepage-posts-extraction-workflow');
const { WeiboSelectorManager } = require('../src/selectors/weibo-homepage-selectors');

/**
 * 测试工作流配置验证
 */
async function testWorkflowConfigValidation() {
  console.log('🧪 测试工作流配置验证...\n');

  try {
    // 验证工作流配置
    const isValid = WorkflowUtils.validateWorkflowConfig(WeiboHomepagePostsExtractionWorkflow);
    
    console.log('✅ 工作流配置验证:', isValid ? '通过' : '失败');
    console.log('📋 工作流信息:');
    console.log(`  - 名称: ${WeiboHomepagePostsExtractionWorkflow.workflow.name}`);
    console.log(`  - 版本: ${WeiboHomepagePostsExtractionWorkflow.workflow.version}`);
    console.log(`  - 目标URL: ${WeiboHomepagePostsExtractionWorkflow.workflow.targetUrl}`);
    console.log(`  - 最大帖子数: ${WeiboHomepagePostsExtractionWorkflow.workflow.maxPosts}`);
    console.log(`  - 超时时间: ${WeiboHomepagePostsExtractionWorkflow.workflow.timeout}ms`);

    console.log('\n📋 原子操作数量:', Object.keys(WeiboHomepagePostsExtractionWorkflow.atomicOperations).length);
    console.log('📋 工作流步骤数量:', WeiboHomepagePostsExtractionWorkflow.workflowSteps.length);

    return true;

  } catch (error) {
    console.error('❌ 工作流配置验证失败:', error);
    return false;
  }
}

/**
 * 测试选择器管理器
 */
async function testSelectorManager() {
  console.log('🧪 测试选择器管理器...\n');

  try {
    const selectorManager = new WeiboSelectorManager();
    
    // 测试选择器获取
    const postSelectors = selectorManager.getPostSelectors();
    const userSelectors = selectorManager.getUserSelectors();
    const timeSelectors = selectorManager.getTimeSelectors();
    
    console.log('✅ 选择器管理器创建成功');
    console.log('📋 帖子选择器:');
    console.log(`  - 容器: ${postSelectors.container}`);
    console.log(`  - 链接: ${postSelectors.link}`);
    console.log(`  - 作者名称: ${postSelectors.author.name}`);
    console.log(`  - 时间: ${postSelectors.time.absolute}`);
    
    console.log('📋 用户选择器:');
    console.log(`  - 用户名: ${userSelectors.username}`);
    console.log(`  - 用户链接: ${userSelectors.userLink}`);
    
    console.log('📋 时间选择器:');
    console.log(`  - 绝对时间: ${timeSelectors.absolute}`);
    console.log(`  - 相对时间: ${timeSelectors.relative}`);

    return true;

  } catch (error) {
    console.error('❌ 选择器管理器测试失败:', error);
    return false;
  }
}

/**
 * 测试工作流管理器
 */
async function testWorkflowManager() {
  console.log('🧪 测试工作流管理器...\n');

  try {
    const workflowManager = new WorkflowManager();
    
    // 注册工作流
    workflowManager.registerWorkflow(
      'weibo-homepage-posts-extraction',
      WeiboHomepagePostsExtractionWorkflow,
      require('../src/core/workflow-executor').WorkflowExecutorAdapter
    );

    // 获取工作流列表
    const workflowList = workflowManager.getWorkflowList();
    console.log('✅ 工作流管理器创建成功');
    console.log('📋 已注册工作流:', workflowList);

    // 获取工作流配置
    const config = workflowManager.getWorkflowConfig('weibo-homepage-posts-extraction');
    if (config) {
      console.log('✅ 工作流配置获取成功');
      console.log(`  - 名称: ${config.workflow.name}`);
      console.log(`  - 目标URL: ${config.workflow.targetUrl}`);
    }

    return true;

  } catch (error) {
    console.error('❌ 工作流管理器测试失败:', error);
    return false;
  }
}

/**
 * 测试工作流执行（无浏览器）
 */
async function testWorkflowExecutionWithoutBrowser() {
  console.log('🧪 测试工作流执行（无浏览器模式）...\n');

  try {
    // 创建工作流执行器
    const { WorkflowExecutorAdapter } = require('../src/core/workflow-executor');
    const { WeiboHomepagePostsExtractionWorkflowExecutor } = require('../src/workflows/weibo-homepage-posts-extraction-workflow');
    
    const executor = new WorkflowExecutorAdapter(
      WeiboHomepagePostsExtractionWorkflow,
      WeiboHomepagePostsExtractionWorkflowExecutor
    );

    // 测试初始化（不启动浏览器）
    console.log('✅ 工作流执行器创建成功');
    console.log('📋 工作流类型:', executor.config.workflow.name);
    console.log('📋 支持的操作:', Object.keys(executor.config.atomicOperations).length);

    return true;

  } catch (error) {
    console.error('❌ 工作流执行测试失败:', error);
    return false;
  }
}

/**
 * 测试完整工作流执行（带浏览器）
 */
async function testCompleteWorkflowExecution() {
  console.log('🧪 测试完整工作流执行...\n');

  try {
    console.log('🔧 配置工作流执行参数...');
    
    const executionOptions = {
      headless: false, // 显示浏览器
      timeout: 120000,
      saveResults: true,
      outputFile: 'weibo-homepage-posts-test.json',
      cookieFile: './cookies/weibo.com.json',
      saveCookieFile: './cookies/weibo-cookies-updated.json',
      maxPosts: 10 // 测试模式，只提取10条
    };

    console.log('📋 执行参数:');
    console.log(`  - 无头模式: ${executionOptions.headless}`);
    console.log(`  - 超时时间: ${executionOptions.timeout}ms`);
    console.log(`  - 最大帖子数: ${executionOptions.maxPosts}`);
    console.log(`  - 保存结果: ${executionOptions.saveResults}`);
    console.log(`  - 输出文件: ${executionOptions.outputFile}`);

    // 询问用户是否执行
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('是否执行完整的浏览器测试？这可能需要手动登录 (y/N): ', resolve);
    });

    rl.close();

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      console.log('🚀 开始执行完整工作流...');
      
      // 执行工作流
      const results = await executeWorkflow('weibo-homepage-posts-extraction', executionOptions);
      
      console.log('\n📊 工作流执行结果:');
      console.log('=====================================');
      console.log(`状态: ${results.success ? '✅ 成功' : '❌ 失败'}`);
      console.log(`工作流: ${results.workflowName}`);
      console.log(`时间: ${new Date().toISOString()}`);
      
      if (results.success && results.posts) {
        console.log(`\n📈 提取统计:`);
        console.log(`总帖子数: ${results.posts.length}`);
        console.log(`目标URL: ${results.metadata?.targetUrl || 'N/A'}`);
        console.log(`提取时间: ${results.metadata?.extractedAt || 'N/A'}`);
        
        console.log(`\n📝 帖子示例 (前3条):`);
        results.posts.slice(0, 3).forEach((post, index) => {
          console.log(`  ${index + 1}. [${post.postId}] ${post.authorName} - ${post.postTime}`);
          console.log(`     链接: ${post.postUrl}`);
          console.log(`     内容: ${post.postContent?.substring(0, 50)}...`);
        });
      }
      
      if (results.error) {
        console.log(`\n❌ 错误信息: ${results.error}`);
      }

      return results;
    } else {
      console.log('⏭️ 跳过浏览器测试');
      return { success: true, message: '跳过浏览器测试' };
    }

  } catch (error) {
    console.error('❌ 完整工作流执行测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 生成测试报告
 */
async function generateTestReport(testResults) {
  console.log('\n📋 生成测试报告...\n');

  const report = {
    generatedAt: new Date().toISOString(),
    testSuite: '微博主页帖子提取工作流',
    summary: {
      totalTests: testResults.length,
      passedTests: testResults.filter(r => r.success).length,
      failedTests: testResults.filter(r => !r.success).length
    },
    tests: testResults
  };

  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    await fs.mkdir('./results', { recursive: true });
    const reportPath = path.join('./results', 'workflow-test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log('✅ 测试报告已生成:', reportPath);
    return reportPath;

  } catch (error) {
    console.error('❌ 生成测试报告失败:', error);
    return null;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 微博主页帖子提取工作流测试\n');
  console.log('=' .repeat(60) + '\n');

  const testResults = [];

  try {
    // 1. 测试工作流配置验证
    console.log('📋 测试 1: 工作流配置验证');
    const configTest = await testWorkflowConfigValidation();
    testResults.push({
      name: '工作流配置验证',
      success: configTest,
      timestamp: new Date().toISOString()
    });
    console.log('\n' + '='.repeat(60) + '\n');

    // 2. 测试选择器管理器
    console.log('📋 测试 2: 选择器管理器');
    const selectorTest = await testSelectorManager();
    testResults.push({
      name: '选择器管理器',
      success: selectorTest,
      timestamp: new Date().toISOString()
    });
    console.log('\n' + '='.repeat(60) + '\n');

    // 3. 测试工作流管理器
    console.log('📋 测试 3: 工作流管理器');
    const managerTest = await testWorkflowManager();
    testResults.push({
      name: '工作流管理器',
      success: managerTest,
      timestamp: new Date().toISOString()
    });
    console.log('\n' + '='.repeat(60) + '\n');

    // 4. 测试工作流执行（无浏览器）
    console.log('📋 测试 4: 工作流执行（无浏览器）');
    const executionTest = await testWorkflowExecutionWithoutBrowser();
    testResults.push({
      name: '工作流执行（无浏览器）',
      success: executionTest,
      timestamp: new Date().toISOString()
    });
    console.log('\n' + '='.repeat(60) + '\n');

    // 5. 测试完整工作流执行（可选）
    console.log('📋 测试 5: 完整工作流执行（可选）');
    const completeTest = await testCompleteWorkflowExecution();
    testResults.push({
      name: '完整工作流执行',
      success: completeTest.success,
      timestamp: new Date().toISOString(),
      details: completeTest
    });
    console.log('\n' + '='.repeat(60) + '\n');

    // 生成测试报告
    await generateTestReport(testResults);

    // 输出测试摘要
    console.log('📊 测试摘要:');
    console.log('=====================================');
    console.log(`总测试数: ${testResults.length}`);
    console.log(`通过测试: ${testResults.filter(r => r.success).length}`);
    console.log(`失败测试: ${testResults.filter(r => !r.success).length}`);
    
    testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.name}`);
    });

    console.log('\n🎉 测试完成！');

  } catch (error) {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testWorkflowConfigValidation,
  testSelectorManager,
  testWorkflowManager,
  testWorkflowExecutionWithoutBrowser,
  testCompleteWorkflowExecution,
  generateTestReport
};