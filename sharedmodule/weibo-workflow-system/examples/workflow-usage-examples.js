/**
 * 微博主页帖子提取工作流使用示例
 * 展示如何使用 workflow.execute() 完成操作
 */

const { executeWorkflow, WorkflowManager } = require('../src/core/workflow-executor');
const { WeiboHomepagePostsExtractionWorkflow } = require('../src/workflows/weibo-homepage-posts-extraction-workflow');

/**
 * 快速使用示例
 */
async function quickExample() {
  console.log('🚀 快速使用示例 - 微博主页帖子提取\n');

  try {
    // 一行代码执行工作流
    const results = await executeWorkflow('weibo-homepage-posts-extraction', {
      headless: false,
      maxPosts: 20,
      saveResults: true,
      outputFile: 'quick-example-results.json'
    });

    console.log('📊 执行结果:', results.success ? '成功' : '失败');
    if (results.success) {
      console.log(`提取了 ${results.posts?.length || 0} 条帖子`);
    }

    return results;

  } catch (error) {
    console.error('❌ 执行失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 完整使用示例
 */
async function completeExample() {
  console.log('🔧 完整使用示例 - 微博主页帖子提取\n');

  try {
    // 1. 创建工作流管理器
    const workflowManager = new WorkflowManager();

    // 2. 注册工作流
    workflowManager.registerWorkflow(
      'weibo-homepage-posts-extraction',
      WeiboHomepagePostsExtractionWorkflow,
      require('./src/core/workflow-executor').WorkflowExecutorAdapter
    );

    // 3. 配置执行参数
    const executionOptions = {
      headless: false,           // 显示浏览器窗口
      timeout: 120000,           // 2分钟超时
      maxPosts: 50,              // 最多提取50条帖子
      saveResults: true,         // 保存结果到文件
      outputFile: 'weibo-posts.json', // 输出文件名
      cookieFile: './cookies/weibo-cookies.json', // Cookie文件
      saveCookieFile: './cookies/weibo-cookies-updated.json', // 更新Cookie
      delayBetweenWorkflows: 3000 // 工作流间隔
    };

    // 4. 执行工作流
    console.log('🌐 开始执行工作流...');
    const results = await workflowManager.execute('weibo-homepage-posts-extraction', executionOptions);

    // 5. 处理结果
    if (results.success) {
      console.log('✅ 工作流执行成功！');
      console.log(`📈 共提取 ${results.posts?.length || 0} 条帖子`);
      console.log(`📁 结果已保存到: ${executionOptions.outputFile}`);
      
      // 显示前几条帖子
      if (results.posts && results.posts.length > 0) {
        console.log('\n📝 帖子预览:');
        results.posts.slice(0, 3).forEach((post, index) => {
          console.log(`${index + 1}. ${post.authorName} - ${post.postTime}`);
          console.log(`   帖子ID: ${post.postId}`);
          console.log(`   链接: ${post.postUrl}`);
          console.log(`   内容: ${post.postContent?.substring(0, 50)}...`);
          console.log('');
        });
      }
    } else {
      console.log('❌ 工作流执行失败:', results.error);
    }

    return results;

  } catch (error) {
    console.error('❌ 执行失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 批量执行示例
 */
async function batchExample() {
  console.log('🔄 批量执行示例\n');

  try {
    const workflowManager = new WorkflowManager();

    // 注册工作流
    workflowManager.registerWorkflow(
      'weibo-homepage-posts-extraction',
      WeiboHomepagePostsExtractionWorkflow,
      require('./src/core/workflow-executor').WorkflowExecutorAdapter
    );

    // 配置多个执行任务
    const batchConfigs = [
      {
        name: 'weibo-homepage-posts-extraction',
        options: {
          headless: true,
          maxPosts: 10,
          outputFile: 'batch-1-results.json'
        }
      },
      {
        name: 'weibo-homepage-posts-extraction',
        options: {
          headless: true,
          maxPosts: 20,
          outputFile: 'batch-2-results.json'
        }
      }
    ];

    // 批量执行
    console.log('🚀 开始批量执行...');
    const batchResults = await workflowManager.executeBatch(batchConfigs, {
      delayBetweenWorkflows: 5000
    });

    // 输出批量执行结果
    console.log('📊 批量执行结果:');
    batchResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.workflowName}: ${result.success ? '✅' : '❌'}`);
      if (result.success) {
        console.log(`   提取了 ${result.results?.posts?.length || 0} 条帖子`);
      } else {
        console.log(`   错误: ${result.error}`);
      }
    });

    return batchResults;

  } catch (error) {
    console.error('❌ 批量执行失败:', error);
    return [];
  }
}

/**
 * 自定义配置示例
 */
async function customConfigExample() {
  console.log('⚙️ 自定义配置示例\n');

  try {
    // 创建自定义工作流配置
    const customWorkflow = {
      ...WeiboHomepagePostsExtractionWorkflow,
      workflow: {
        ...WeiboHomepagePostsExtractionWorkflow.workflow,
        maxPosts: 30,          // 修改最大帖子数
        timeout: 90000         // 修改超时时间
      },
      selectors: {
        ...WeiboHomepagePostsExtractionWorkflow.selectors,
        // 可以自定义选择器
        postContainer: '.custom-feed-item, .Feed_body_3R0rO'
      }
    };

    const workflowManager = new WorkflowManager();
    workflowManager.registerWorkflow(
      'custom-weibo-extraction',
      customWorkflow,
      require('./src/core/workflow-executor').WorkflowExecutorAdapter
    );

    // 执行自定义工作流
    const results = await workflowManager.execute('custom-weibo-extraction', {
      headless: false,
      saveResults: true,
      outputFile: 'custom-results.json'
    });

    console.log('🎯 自定义配置执行结果:', results.success ? '成功' : '失败');
    return results;

  } catch (error) {
    console.error('❌ 自定义配置执行失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数 - 展示不同的使用方式
 */
async function main() {
  console.log('🎯 微博主页帖子提取工作流使用示例\n');
  console.log('=' .repeat(60) + '\n');

  const examples = [
    { name: '快速使用示例', func: quickExample },
    { name: '完整使用示例', func: completeExample },
    { name: '批量执行示例', func: batchExample },
    { name: '自定义配置示例', func: customConfigExample }
  ];

  // 询问用户选择
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('请选择要运行的示例:');
  examples.forEach((example, index) => {
    console.log(`${index + 1}. ${example.name}`);
  });
  console.log('0. 运行所有示例');

  const choice = await new Promise(resolve => {
    rl.question('请输入选项 (0-4): ', resolve);
  });

  rl.close();

  const choiceNum = parseInt(choice);
  
  if (choiceNum === 0) {
    // 运行所有示例
    console.log('🚀 运行所有示例...\n');
    for (let i = 0; i < examples.length; i++) {
      console.log(`\n${i + 1}. ${examples[i].name}`);
      console.log('-'.repeat(40));
      await examples[i].func();
      console.log('\n' + '='.repeat(60));
    }
  } else if (choiceNum >= 1 && choiceNum <= examples.length) {
    // 运行指定示例
    const example = examples[choiceNum - 1];
    console.log(`🚀 运行: ${example.name}\n`);
    await example.func();
  } else {
    console.log('❌ 无效选项');
  }

  console.log('\n🎉 示例运行完成！');
}

// 导出使用函数
module.exports = {
  quickExample,
  completeExample,
  batchExample,
  customConfigExample
};

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}