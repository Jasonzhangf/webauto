/**
 * 简单工作流执行示例
 * 演示如何执行单个微博工作流
 */

const path = require('path');
const { chromium } = require('playwright');
const WorkflowOrchestrator = require('../core/workflow-orchestrator');

/**
 * 简单工作流执行示例
 */
async function simpleExecutionExample() {
  console.log('🚀 开始简单工作流执行示例...');

  // 创建工作流编排器
  const orchestrator = new WorkflowOrchestrator({
    maxConcurrentWorkflows: 2,
    defaultTimeout: 120000,
    autoSaveReports: true
  });

  let browser = null;
  let context = null;
  let page = null;

  try {
    // 启动浏览器
    console.log('🌐 启动浏览器...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    // 创建浏览器上下文
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    // 创建页面
    page = await context.newPage();

    // 设置页面超时
    page.setDefaultTimeout(30000);

    console.log('✅ 浏览器启动完成');

    // 示例1: 执行微博主页工作流
    console.log('\n📋 示例1: 执行微博主页工作流');
    await executeHomepageWorkflow(orchestrator, page);

    // 示例2: 执行个人主页工作流
    console.log('\n📋 示例2: 执行个人主页工作流');
    await executeProfileWorkflow(orchestrator, page);

    // 示例3: 执行搜索工作流
    console.log('\n📋 示例3: 执行搜索工作流');
    await executeSearchWorkflow(orchestrator, page);

    console.log('\n✅ 所有示例执行完成');

  } catch (error) {
    console.error('❌ 示例执行失败:', error);
  } finally {
    // 清理资源
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    await orchestrator.destroy();
  }
}

/**
 * 执行微博主页工作流
 */
async function executeHomepageWorkflow(orchestrator, page) {
  try {
    console.log('🔄 执行微博主页工作流...');

    // 准备执行上下文
    const executionContext = {
      page,
      browser: page.context().browser,
      context: page.context()
    };

    // 执行工作流
    const result = await orchestrator.executeWorkflow('weibo-homepage', {
      context: executionContext,
      maxPosts: 20,
      saveResults: true
    });

    console.log('📊 微博主页工作流结果:');
    console.log(`- 成功: ${result.success ? '是' : '否'}`);
    console.log(`- 帖子数量: ${result.posts?.length || 0}`);
    console.log(`- 执行时间: ${result.metadata?.executionTime || 0}ms`);

    if (result.posts && result.posts.length > 0) {
      console.log('\n📝 最新5条帖子:');
      result.posts.slice(0, 5).forEach((post, index) => {
        console.log(`${index + 1}. ${post.author} - ${post.time}`);
        console.log(`   ${post.content.substring(0, 100)}...`);
        console.log(`   链接: ${post.url}`);
        console.log('');
      });
    }

    return result;

  } catch (error) {
    console.error('❌ 微博主页工作流执行失败:', error);
    throw error;
  }
}

/**
 * 执行个人主页工作流
 */
async function executeProfileWorkflow(orchestrator, page) {
  try {
    console.log('🔄 执行个人主页工作流...');

    // 准备执行上下文
    const executionContext = {
      page,
      browser: page.context().browser,
      context: page.context()
    };

    // 示例用户主页URL（需要替换为实际的用户主页）
    const profileUrl = 'https://weibo.com/u/1234567890';

    // 执行工作流
    const result = await orchestrator.executeWorkflow('weibo-profile', {
      context: executionContext,
      profileUrl: profileUrl,
      maxPosts: 15,
      includeUserInfo: true
    });

    console.log('📊 个人主页工作流结果:');
    console.log(`- 成功: ${result.success ? '是' : '否'}`);
    console.log(`- 用户名: ${result.userInfo?.username || '未知'}`);
    console.log(`- 帖子数量: ${result.posts?.length || 0}`);
    console.log(`- 粉丝数: ${result.userInfo?.stats?.followers || 0}`);
    console.log(`- 执行时间: ${result.metadata?.executionTime || 0}ms`);

    if (result.userInfo) {
      console.log('\n👤 用户信息:');
      console.log(`- 用户名: ${result.userInfo.username}`);
      console.log(`- 简介: ${result.userInfo.description || '未设置'}`);
      console.log(`- 位置: ${result.userInfo.location || '未知'}`);
      console.log(`- 统计: ${result.userInfo.stats.posts} 帖子, ${result.userInfo.stats.followers} 粉丝, ${result.userInfo.stats.following} 关注`);
    }

    return result;

  } catch (error) {
    console.error('❌ 个人主页工作流执行失败:', error);
    throw error;
  }
}

/**
 * 执行搜索工作流
 */
async function executeSearchWorkflow(orchestrator, page) {
  try {
    console.log('🔄 执行搜索工作流...');

    // 准备执行上下文
    const executionContext = {
      page,
      browser: page.context().browser,
      context: page.context()
    };

    // 搜索关键词
    const keyword = '技术';

    // 执行工作流
    const result = await orchestrator.executeWorkflow('weibo-search', {
      context: executionContext,
      keyword: keyword,
      maxResults: 10,
      sortBy: 'recent',
      includeRelated: true
    });

    console.log('📊 搜索工作流结果:');
    console.log(`- 成功: ${result.success ? '是' : '否'}`);
    console.log(`- 关键词: ${result.keyword}`);
    console.log(`- 搜索结果: ${result.searchResults?.length || 0}`);
    console.log(`- 相关搜索: ${result.relatedSearches?.length || 0}`);
    console.log(`- 执行时间: ${result.searchMetadata?.executionTime || 0}ms`);

    if (result.searchResults && result.searchResults.length > 0) {
      console.log('\n🔍 前5条搜索结果:');
      result.searchResults.slice(0, 5).forEach((result, index) => {
        console.log(`${index + 1}. ${result.author} - ${result.time}`);
        console.log(`   ${result.title || result.content.substring(0, 100)}...`);
        console.log(`   相关性: ${result.relevanceScore?.toFixed(2) || 'N/A'}`);
        console.log(`   链接: ${result.url}`);
        console.log('');
      });
    }

    if (result.relatedSearches && result.relatedSearches.length > 0) {
      console.log('\n🔗 相关搜索:');
      result.relatedSearches.slice(0, 5).forEach((search, index) => {
        console.log(`${index + 1}. ${search}`);
      });
    }

    return result;

  } catch (error) {
    console.error('❌ 搜索工作流执行失败:', error);
    throw error;
  }
}

/**
 * 获取工作流列表
 */
async function listWorkflows(orchestrator) {
  console.log('\n📋 可用的工作流列表:');

  const workflows = orchestrator.getWorkflowList();
  workflows.forEach(workflow => {
    console.log(`- ${workflow.name}: ${workflow.description}`);
    console.log(`  版本: ${workflow.version}`);
    console.log(`  分类: ${workflow.category}`);
    console.log('');
  });
}

/**
 * 获取统计信息
 */
async function showStatistics(orchestrator) {
  console.log('\n📊 工作流统计信息:');

  const stats = orchestrator.getStatistics();
  console.log(`- 总工作流数: ${stats.totalWorkflows}`);
  console.log(`- 已完成: ${stats.completedWorkflows}`);
  console.log(`- 失败: ${stats.failedWorkflows}`);
  console.log(`- 成功率: ${stats.successRate}`);
  console.log(`- 平均执行时间: ${stats.averageExecutionTime.toFixed(2)}ms`);
  console.log(`- 运行中的工作流: ${stats.runningWorkflows}`);
}

// 主执行函数
async function main() {
  try {
    await simpleExecutionExample();
  } catch (error) {
    console.error('❌ 示例执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

module.exports = {
  simpleExecutionExample,
  executeHomepageWorkflow,
  executeProfileWorkflow,
  executeSearchWorkflow,
  listWorkflows,
  showStatistics
};