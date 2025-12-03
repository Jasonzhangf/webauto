/**
 * 批量工作流执行示例
 * 演示如何批量执行多个工作流
 */

const path = require('path');
const { chromium } = require('playwright');
const WorkflowOrchestrator = require('../core/workflow-orchestrator');

/**
 * 批量工作流执行示例
 */
async function batchExecutionExample() {
  console.log('🚀 开始批量工作流执行示例...');

  // 创建工作流编排器
  const orchestrator = new WorkflowOrchestrator({
    maxConcurrentWorkflows: 3,
    defaultTimeout: 120000,
    autoSaveReports: true,
    delayBetweenWorkflows: 3000
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
    page.setDefaultTimeout(30000);

    console.log('✅ 浏览器启动完成');

    // 准备执行上下文
    const executionContext = {
      page,
      browser: page.context().browser,
      context: page.context()
    };

    // 示例1: 批量执行不同类型的工作流
    console.log('\n📋 示例1: 批量执行不同类型工作流');
    await executeMixedWorkflows(orchestrator, executionContext);

    // 示例2: 批量执行相同工作流的不同配置
    console.log('\n📋 示例2: 批量执行相同工作流的不同配置');
    await executeMultipleSearches(orchestrator, executionContext);

    // 示例3: 条件批量执行
    console.log('\n📋 示例3: 条件批量执行');
    await executeConditionalWorkflows(orchestrator, executionContext);

    console.log('\n✅ 所有批量执行示例完成');

  } catch (error) {
    console.error('❌ 批量执行示例失败:', error);
  } finally {
    // 清理资源
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    await orchestrator.destroy();
  }
}

/**
 * 执行混合类型的工作流
 */
async function executeMixedWorkflows(orchestrator, context) {
  try {
    console.log('🔄 执行混合类型工作流...');

    const workflowConfigs = [
      {
        name: 'weibo-homepage',
        options: {
          context: context,
          maxPosts: 15,
          saveResults: true
        }
      },
      {
        name: 'weibo-search',
        options: {
          context: context,
          keyword: '科技',
          maxResults: 10,
          sortBy: 'recent'
        }
      },
      {
        name: 'weibo-search',
        options: {
          context: context,
          keyword: '新闻',
          maxResults: 10,
          sortBy: 'hot'
        }
      }
    ];

    const batchOptions = {
      continueOnError: true,
      delayBetweenWorkflows: 2000
    };

    const results = await orchestrator.executeBatch(workflowConfigs, batchOptions);

    console.log('📊 批量执行结果:');
    let successfulCount = 0;
    let failedCount = 0;

    results.forEach((result, index) => {
      const workflowName = workflowConfigs[index].name;
      console.log(`${index + 1}. ${workflowName}: ${result.success ? '✅ 成功' : '❌ 失败'}`);

      if (result.success) {
        successfulCount++;

        if (result.result.posts) {
          console.log(`   帖子数量: ${result.result.posts.length}`);
        }
        if (result.result.searchResults) {
          console.log(`   搜索结果: ${result.result.searchResults.length}`);
        }
      } else {
        failedCount++;
        console.log(`   错误: ${result.error}`);
      }
    });

    console.log(`\n📈 批量执行统计:`);
    console.log(`- 总数: ${results.length}`);
    console.log(`- 成功: ${successfulCount}`);
    console.log(`- 失败: ${failedCount}`);
    console.log(`- 成功率: ${((successfulCount / results.length) * 100).toFixed(2)}%`);

    return results;

  } catch (error) {
    console.error('❌ 混合工作流执行失败:', error);
    throw error;
  }
}

/**
 * 执行多个搜索工作流
 */
async function executeMultipleSearches(orchestrator, context) {
  try {
    console.log('🔄 执行多个搜索工作流...');

    const keywords = ['人工智能', '机器学习', '深度学习', '数据科学', '区块链'];
    const workflowConfigs = keywords.map(keyword => ({
      name: 'weibo-search',
      options: {
        context: context,
        keyword: keyword,
        maxResults: 8,
        sortBy: 'recent',
        includeRelated: false
      }
    }));

    const batchOptions = {
      continueOnError: true,
      delayBetweenWorkflows: 1500
    };

    const results = await orchestrator.executeBatch(workflowConfigs, batchOptions);

    console.log('📊 多关键词搜索结果:');

    // 聚合搜索结果
    const aggregatedResults = {
      totalKeywords: keywords.length,
      successfulSearches: 0,
      totalResults: 0,
      keywordStats: {}
    };

    results.forEach((result, index) => {
      const keyword = keywords[index];

      if (result.success && result.result.searchResults) {
        aggregatedResults.successfulSearches++;
        aggregatedResults.totalResults += result.result.searchResults.length;

        aggregatedResults.keywordStats[keyword] = {
          resultCount: result.result.searchResults.length,
          averageRelevance: result.result.searchResults.reduce((sum, r) => sum + (r.relevanceScore || 0), 0) / result.result.searchResults.length,
          topResult: result.result.searchResults[0]
        };
      } else {
        aggregatedResults.keywordStats[keyword] = {
          resultCount: 0,
          error: result.error
        };
      }
    });

    // 显示统计信息
    console.log(`\n📈 聚合统计:`);
    console.log(`- 搜索关键词: ${aggregatedResults.totalKeywords}`);
    console.log(`- 成功搜索: ${aggregatedResults.successfulSearches}`);
    console.log(`- 总结果数: ${aggregatedResults.totalResults}`);
    console.log(`- 平均每词结果: ${(aggregatedResults.totalResults / aggregatedResults.totalKeywords).toFixed(2)}`);

    // 显示每个关键词的详细统计
    console.log('\n📊 关键词详细统计:');
    Object.entries(aggregatedResults.keywordStats).forEach(([keyword, stats]) => {
      console.log(`\n🔍 ${keyword}:`);
      if (stats.resultCount > 0) {
        console.log(`   结果数: ${stats.resultCount}`);
        console.log(`   平均相关性: ${stats.averageRelevance?.toFixed(2) || 'N/A'}`);
        if (stats.topResult) {
          console.log(`   最佳结果: ${stats.topResult.author} - ${stats.topResult.title?.substring(0, 50)}...`);
        }
      } else {
        console.log(`   失败: ${stats.error || '未知错误'}`);
      }
    });

    return results;

  } catch (error) {
    console.error('❌ 多搜索工作流执行失败:', error);
    throw error;
  }
}

/**
 * 条件批量执行工作流
 */
async function executeConditionalWorkflows(orchestrator, context) {
  try {
    console.log('🔄 执行条件批量工作流...');

    // 定义条件工作流配置
    const workflowConfigs = [];

    // 根据当前时间决定是否执行主页工作流
    const currentHour = new Date().getHours();
    if (currentHour >= 9 && currentHour <= 18) {
      console.log('🕘 工作时间，执行主页工作流');
      workflowConfigs.push({
        name: 'weibo-homepage',
        options: {
          context: context,
          maxPosts: 25
        }
      });
    }

    // 根据日期决定是否执行特定搜索
    const today = new Date().getDay();
    if (today === 1 || today === 3 || today === 5) {
      console.log('📅 特定日期，执行技术趋势搜索');
      workflowConfigs.push({
        name: 'weibo-search',
        options: {
          context: context,
          keyword: '技术趋势',
          maxResults: 15
        }
      });
    }

    // 总是执行的搜索工作流
    workflowConfigs.push({
      name: 'weibo-search',
      options: {
        context: context,
        keyword: '热门话题',
        maxResults: 10
      }
    });

    console.log(`📋 条件匹配，将执行 ${workflowConfigs.length} 个工作流`);

    if (workflowConfigs.length === 0) {
      console.log('⚠️ 没有匹配的工作流条件');
      return [];
    }

    const batchOptions = {
      continueOnError: true,
      delayBetweenWorkflows: 2000
    };

    const results = await orchestrator.executeBatch(workflowConfigs, batchOptions);

    console.log('📊 条件批量执行结果:');
    results.forEach((result, index) => {
      const config = workflowConfigs[index];
      console.log(`${index + 1}. ${config.name}: ${result.success ? '✅ 成功' : '❌ 失败'}`);

      if (result.success) {
        if (result.result.posts) {
          console.log(`   帖子: ${result.result.posts.length} 条`);
        }
        if (result.result.searchResults) {
          console.log(`   搜索结果: ${result.result.searchResults.length} 条`);
        }
      } else {
        console.log(`   错误: ${result.error}`);
      }
    });

    return results;

  } catch (error) {
    console.error('❌ 条件批量执行失败:', error);
    throw error;
  }
}

/**
 * 生成批量执行报告
 */
async function generateBatchReport(orchestrator, results, configs) {
  try {
    console.log('\n📊 生成批量执行报告...');

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalWorkflows: configs.length,
        successfulWorkflows: results.filter(r => r.success).length,
        failedWorkflows: results.filter(r => !r.success).length,
        successRate: ((results.filter(r => r.success).length / configs.length) * 100).toFixed(2) + '%'
      },
      details: results.map((result, index) => ({
        workflowName: configs[index].name,
        success: result.success,
        executionTime: result.executionTime || 0,
        resultCount: result.success ?
          (result.result.posts?.length || result.result.searchResults?.length || 0) : 0,
        error: result.error || null
      })),
      recommendations: [
        '建议监控工作流执行的成功率',
        '可以设置自动重试机制提高成功率',
        '建议优化执行间隔以避免被限制'
      ]
    };

    console.log('📄 批量执行报告:');
    console.log(`- 生成时间: ${report.generatedAt}`);
    console.log(`- 总工作流: ${report.summary.totalWorkflows}`);
    console.log(`- 成功率: ${report.summary.successRate}`);
    console.log(`- 详细结果: ${report.details.length} 条`);

    // 保存报告
    const reportPath = path.join(__dirname, '..', 'reports', `batch-execution-${Date.now()}.json`);
    const fs = require('fs').promises;
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`📁 报告已保存: ${reportPath}`);

    return report;

  } catch (error) {
    console.error('❌ 生成报告失败:', error);
    throw error;
  }
}

/**
 * 获取运行中的工作流状态
 */
async function showRunningWorkflows(orchestrator) {
  console.log('\n🏃 运行中的工作流:');

  const runningWorkflows = orchestrator.getRunningWorkflows();
  if (runningWorkflows.length === 0) {
    console.log('当前没有运行中的工作流');
    return;
  }

  runningWorkflows.forEach(workflow => {
    console.log(`- ${workflow.name} (ID: ${workflow.id})`);
    console.log(`  运行时间: ${workflow.executionTime}ms`);
    console.log(`  开始时间: ${new Date(workflow.startTime).toLocaleString()}`);
  });
}

/**
 * 获取统计信息
 */
async function showBatchStatistics(orchestrator) {
  console.log('\n📊 批量执行统计信息:');

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
    await batchExecutionExample();
  } catch (error) {
    console.error('❌ 批量执行示例失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

module.exports = {
  batchExecutionExample,
  executeMixedWorkflows,
  executeMultipleSearches,
  executeConditionalWorkflows,
  generateBatchReport,
  showRunningWorkflows,
  showBatchStatistics
};