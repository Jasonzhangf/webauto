/**
 * 复合工作流执行示例
 * 演示如何执行复合工作流和工作流编排
 */

const path = require('path');
const { chromium } = require('playwright');
const WorkflowOrchestrator = require('../core/workflow-orchestrator');

/**
 * 复合工作流执行示例
 */
async function compositeExecutionExample() {
  console.log('🚀 开始复合工作流执行示例...');

  // 创建工作流编排器
  const orchestrator = new WorkflowOrchestrator({
    maxConcurrentWorkflows: 2,
    defaultTimeout: 300000,
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
    page.setDefaultTimeout(30000);

    console.log('✅ 浏览器启动完成');

    // 准备执行上下文
    const executionContext = {
      page,
      browser: page.context().browser,
      context: page.context()
    };

    // 示例1: 执行完整扫描复合工作流
    console.log('\n📋 示例1: 执行完整扫描复合工作流');
    await executeCompleteScanWorkflow(orchestrator, executionContext);

    // 示例2: 执行关键词监控工作流
    console.log('\n📋 示例2: 执行关键词监控工作流');
    await executeKeywordMonitoringWorkflow(orchestrator, executionContext);

    // 示例3: 执行用户追踪工作流
    console.log('\n📋 示例3: 执行用户追踪工作流');
    await executeUserTrackingWorkflow(orchestrator, executionContext);

    // 示例4: 创建自定义复合工作流
    console.log('\n📋 示例4: 创建自定义复合工作流');
    await executeCustomCompositeWorkflow(orchestrator, executionContext);

    console.log('\n✅ 所有复合工作流执行示例完成');

  } catch (error) {
    console.error('❌ 复合工作流执行示例失败:', error);
  } finally {
    // 清理资源
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    await orchestrator.destroy();
  }
}

/**
 * 执行完整扫描复合工作流
 */
async function executeCompleteScanWorkflow(orchestrator, context) {
  try {
    console.log('🔄 执行完整扫描复合工作流...');

    // 创建复合工作流配置
    const workflowConfigs = [
      {
        name: 'homepage',
        enabled: true,
        options: {
          context: context,
          maxPosts: 20
        },
        priority: 1
      },
      {
        name: 'search',
        enabled: true,
        options: {
          context: context,
          keyword: '热门',
          maxResults: 15
        },
        priority: 2
      },
      {
        name: 'search',
        enabled: true,
        options: {
          context: context,
          keyword: '新闻',
          maxResults: 10
        },
        priority: 3
      }
    ];

    // 创建复合工作流
    const compositeWorkflow = await orchestrator.createCompositeWorkflow('complete-scan', workflowConfigs);

    // 执行复合工作流
    const result = await orchestrator.executeCompositeWorkflow('complete-scan', {
      context: context,
      stopOnError: false
    });

    console.log('📊 完整扫描复合工作流结果:');
    let totalPosts = 0;
    let successfulWorkflows = 0;

    result.forEach((subResult, index) => {
      const workflowName = workflowConfigs[index].name;
      console.log(`${index + 1}. ${workflowName}: ${subResult.success ? '✅ 成功' : '❌ 失败'}`);

      if (subResult.success && subResult.result) {
        successfulWorkflows++;

        if (subResult.result.posts) {
          totalPosts += subResult.result.posts.length;
          console.log(`   帖子数: ${subResult.result.posts.length}`);
        }
        if (subResult.result.searchResults) {
          totalPosts += subResult.result.searchResults.length;
          console.log(`   搜索结果: ${subResult.result.searchResults.length}`);
        }
      } else {
        console.log(`   错误: ${subResult.error}`);
      }
    });

    console.log(`\n📈 复合工作流统计:`);
    console.log(`- 子工作流: ${result.length}`);
    console.log(`- 成功工作流: ${successfulWorkflows}`);
    console.log(`- 总帖子数: ${totalPosts}`);
    console.log(`- 成功率: ${((successfulWorkflows / result.length) * 100).toFixed(2)}%`);

    return result;

  } catch (error) {
    console.error('❌ 完整扫描复合工作流执行失败:', error);
    throw error;
  }
}

/**
 * 执行关键词监控工作流
 */
async function executeKeywordMonitoringWorkflow(orchestrator, context) {
  try {
    console.log('🔄 执行关键词监控工作流...');

    // 监控关键词列表
    const keywords = ['人工智能', '机器学习', '区块链', '量子计算', '元宇宙'];

    // 创建关键词监控工作流配置
    const workflowConfigs = keywords.map(keyword => ({
      name: 'keyword-monitoring',
      enabled: true,
      options: {
        context: context,
        keywords: [keyword],
        monitoringPeriod: 24 // 24小时
      },
      priority: 1
    }));

    // 创建复合工作流
    const compositeWorkflow = await orchestrator.createCompositeWorkflow('keyword-monitoring', workflowConfigs);

    // 执行复合工作流
    const result = await orchestrator.executeCompositeWorkflow('keyword-monitoring', {
      context: context,
      stopOnError: false
    });

    console.log('📊 关键词监控结果:');

    // 聚合监控结果
    const monitoringSummary = {
      totalKeywords: keywords.length,
      activeKeywords: 0,
      totalAlerts: 0,
      keywordStats: {}
    };

    result.forEach((subResult, index) => {
      const keyword = keywords[index];
      console.log(`\n🔍 ${keyword}:`);

      if (subResult.success && subResult.result) {
        monitoringSummary.activeKeywords++;

        const monitoringResult = subResult.result;
        monitoringSummary.keywordStats[keyword] = {
          posts: monitoringResult.keywordResults?.[keyword]?.posts?.length || 0,
          alerts: monitoringResult.alerts?.length || 0,
          trends: monitoringResult.trends?.trending?.length || 0
        };

        monitoringSummary.totalAlerts += monitoringResult.alerts?.length || 0;

        console.log(`   帖子数: ${monitoringSummary.keywordStats[keyword].posts}`);
        console.log(`   告警数: ${monitoringSummary.keywordStats[keyword].alerts}`);
        console.log(`   趋势数: ${monitoringSummary.keywordStats[keyword].trends}`);

        if (monitoringResult.alerts && monitoringResult.alerts.length > 0) {
          console.log('   🚨 告警详情:');
          monitoringResult.alerts.forEach((alert, alertIndex) => {
            console.log(`     ${alertIndex + 1}. ${alert.type} - ${alert.message}`);
          });
        }
      } else {
        console.log(`   ❌ 监控失败: ${subResult.error}`);
      }
    });

    console.log(`\n📈 关键词监控总结:`);
    console.log(`- 监控关键词: ${monitoringSummary.totalKeywords}`);
    console.log(`- 活跃关键词: ${monitoringSummary.activeKeywords}`);
    console.log(`- 总告警数: ${monitoringSummary.totalAlerts}`);
    console.log(`- 平均每关键词告警: ${(monitoringSummary.totalAlerts / monitoringSummary.totalKeywords).toFixed(2)}`);

    return result;

  } catch (error) {
    console.error('❌ 关键词监控工作流执行失败:', error);
    throw error;
  }
}

/**
 * 执行用户追踪工作流
 */
async function executeUserTrackingWorkflow(orchestrator, context) {
  try {
    console.log('🔄 执行用户追踪工作流...');

    // 追踪用户列表（示例用户名）
    const targetUsers = ['用户A', '用户B', '用户C'];

    // 创建用户追踪工作流配置
    const workflowConfigs = targetUsers.map(user => ({
      name: 'user-tracking',
      enabled: true,
      options: {
        context: context,
        targetUsers: [user],
        trackingDepth: 2
      },
      priority: 1
    }));

    // 创建复合工作流
    const compositeWorkflow = await orchestrator.createCompositeWorkflow('user-tracking', workflowConfigs);

    // 执行复合工作流
    const result = await orchestrator.executeCompositeWorkflow('user-tracking', {
      context: context,
      stopOnError: false
    });

    console.log('📊 用户追踪结果:');

    // 聚合追踪结果
    const trackingSummary = {
      totalUsers: targetUsers.length,
      trackedUsers: 0,
      totalAnomalies: 0,
      userStats: {}
    };

    result.forEach((subResult, index) => {
      const user = targetUsers[index];
      console.log(`\n👤 ${user}:`);

      if (subResult.success && subResult.result) {
        trackingSummary.trackedUsers++;

        const trackingResult = subResult.result;
        trackingSummary.userStats[user] = {
          posts: trackingResult.userTrackingData?.[user]?.profile?.posts || 0,
          followers: trackingResult.userTrackingData?.[user]?.profile?.followers || 0,
          recentPosts: trackingResult.userTrackingData?.[user]?.recentPosts?.length || 0,
          anomalies: trackingResult.anomalies?.filter(a => a.user === user)?.length || 0
        };

        trackingSummary.totalAnomalies += trackingSummary.userStats[user].anomalies;

        console.log(`   帖子数: ${trackingSummary.userStats[user].posts}`);
        console.log(`   粉丝数: ${trackingSummary.userStats[user].followers}`);
        console.log(`   最近帖子: ${trackingSummary.userStats[user].recentPosts}`);
        console.log(`   异常数: ${trackingSummary.userStats[user].anomalies}`);

        if (trackingResult.userTrackingData?.[user]?.recentPosts) {
          console.log('   📝 最近帖子:');
          trackingResult.userTrackingData[user].recentPosts.slice(0, 2).forEach((post, postIndex) => {
            console.log(`     ${postIndex + 1}. ${post.content.substring(0, 100)}...`);
          });
        }
      } else {
        console.log(`   ❌ 追踪失败: ${subResult.error}`);
      }
    });

    console.log(`\n📈 用户追踪总结:`);
    console.log(`- 追踪用户: ${trackingSummary.totalUsers}`);
    console.log(`- 成功追踪: ${trackingSummary.trackedUsers}`);
    console.log(`- 总异常数: ${trackingSummary.totalAnomalies}`);
    console.log(`- 平均每用户异常: ${(trackingSummary.totalAnomalies / trackingSummary.totalUsers).toFixed(2)}`);

    return result;

  } catch (error) {
    console.error('❌ 用户追踪工作流执行失败:', error);
    throw error;
  }
}

/**
 * 执行自定义复合工作流
 */
async function executeCustomCompositeWorkflow(orchestrator, context) {
  try {
    console.log('🔄 执行自定义复合工作流...');

    // 创建自定义复合工作流配置
    const customWorkflowConfig = [
      // 第一步：主页扫描
      {
        name: 'homepage',
        enabled: true,
        options: {
          context: context,
          maxPosts: 10
        },
        priority: 1,
        description: '扫描主页热门内容'
      },
      // 第二步：技术相关搜索
      {
        name: 'search',
        enabled: true,
        options: {
          context: context,
          keyword: '技术',
          maxResults: 8
        },
        priority: 2,
        description: '搜索技术相关内容'
      },
      // 第三步：新闻搜索
      {
        name: 'search',
        enabled: true,
        options: {
          context: context,
          keyword: '新闻',
          maxResults: 8,
          sortBy: 'hot'
        },
        priority: 3,
        description: '搜索热门新闻'
      },
      // 第四步：个人主页追踪（如果有特定用户）
      {
        name: 'profile',
        enabled: false, // 示例中禁用，因为没有具体的用户URL
        options: {
          context: context,
          profileUrl: 'https://weibo.com/u/1234567890',
          maxPosts: 5
        },
        priority: 4,
        description: '追踪特定用户'
      }
    ];

    // 过滤启用的工作流
    const enabledWorkflows = customWorkflowConfig.filter(w => w.enabled);

    // 创建复合工作流
    const compositeWorkflow = await orchestrator.createCompositeWorkflow('custom-scan', enabledWorkflows);

    // 执行复合工作流
    const result = await orchestrator.executeCompositeWorkflow('custom-scan', {
      context: context,
      stopOnError: false
    });

    console.log('📊 自定义复合工作流结果:');

    // 分析执行结果
    const analysis = {
      totalWorkflows: enabledWorkflows.length,
      completedWorkflows: 0,
      totalDataPoints: 0,
      workflowResults: {}
    };

    result.forEach((subResult, index) => {
      const workflowConfig = enabledWorkflows[index];
      console.log(`\n📋 ${workflowConfig.description} (${workflowConfig.name}):`);

      if (subResult.success && subResult.result) {
        analysis.completedWorkflows++;

        let dataCount = 0;
        if (subResult.result.posts) {
          dataCount = subResult.result.posts.length;
          console.log(`   ✅ 成功，提取 ${dataCount} 条帖子`);
        } else if (subResult.result.searchResults) {
          dataCount = subResult.result.searchResults.length;
          console.log(`   ✅ 成功，提取 ${dataCount} 条搜索结果`);
        } else if (subResult.result.userInfo) {
          dataCount = 1;
          console.log(`   ✅ 成功，提取用户信息`);
        }

        analysis.totalDataPoints += dataCount;
        analysis.workflowResults[workflowConfig.name] = {
          success: true,
          dataCount: dataCount
        };
      } else {
        console.log(`   ❌ 失败: ${subResult.error}`);
        analysis.workflowResults[workflowConfig.name] = {
          success: false,
          error: subResult.error
        };
      }
    });

    console.log(`\n📈 自定义复合工作流分析:`);
    console.log(`- 总工作流: ${analysis.totalWorkflows}`);
    console.log(`- 完成工作流: ${analysis.completedWorkflows}`);
    console.log(`- 数据点总数: ${analysis.totalDataPoints}`);
    console.log(`- 成功率: ${((analysis.completedWorkflows / analysis.totalWorkflows) * 100).toFixed(2)}%`);
    console.log(`- 平均每工作流数据点: ${(analysis.totalDataPoints / analysis.completedWorkflows).toFixed(2)}`);

    // 生成综合报告
    const comprehensiveReport = await generateComprehensiveReport(result, enabledWorkflows);
    console.log('\n📄 综合报告已生成');

    return result;

  } catch (error) {
    console.error('❌ 自定义复合工作流执行失败:', error);
    throw error;
  }
}

/**
 * 生成综合报告
 */
async function generateComprehensiveReport(results, workflowConfigs) {
  try {
    console.log('📊 生成综合报告...');

    const report = {
      generatedAt: new Date().toISOString(),
      workflowType: 'composite',
      summary: {
        totalWorkflows: workflowConfigs.length,
        completedWorkflows: results.filter(r => r.success).length,
        failedWorkflows: results.filter(r => !r.success).length,
        successRate: ((results.filter(r => r.success).length / workflowConfigs.length) * 100).toFixed(2) + '%'
      },
      workflowDetails: results.map((result, index) => ({
        name: workflowConfigs[index].name,
        description: workflowConfigs[index].description,
        success: result.success,
        dataPoints: result.success ?
          (result.result.posts?.length || result.result.searchResults?.length || 1) : 0,
        executionTime: result.executionTime || 0,
        error: result.error || null
      })),
      insights: [
        '复合工作流能够有效整合多个数据源',
        '建议根据业务需求调整工作流优先级',
        '可以考虑添加更多的数据验证步骤'
      ],
      recommendations: [
        '定期执行复合工作流以保持数据新鲜度',
        '监控各个子工作流的执行状态',
        '根据实际效果优化工作流配置'
      ]
    };

    // 保存报告
    const reportPath = path.join(__dirname, '..', 'reports', 'composite', `comprehensive-report-${Date.now()}.json`);
    const fs = require('fs').promises;
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`📁 综合报告已保存: ${reportPath}`);

    return report;

  } catch (error) {
    console.error('❌ 生成综合报告失败:', error);
    throw error;
  }
}

/**
 * 显示复合工作流统计信息
 */
async function showCompositeStatistics(orchestrator) {
  console.log('\n📊 复合工作流统计信息:');

  const stats = orchestrator.getStatistics();
  console.log(`- 总工作流数: ${stats.totalWorkflows}`);
  console.log(`- 已完成: ${stats.completedWorkflows}`);
  console.log(`- 失败: ${stats.failedWorkflows}`);
  console.log(`- 成功率: ${stats.successRate}`);
  console.log(`- 平均执行时间: ${stats.averageExecutionTime.toFixed(2)}ms`);
  console.log(`- 运行中的工作流: ${stats.runningWorkflows}`);

  // 显示工作流列表
  console.log('\n📋 可用的工作流:');
  const workflows = orchestrator.getWorkflowList();
  workflows.forEach(workflow => {
    console.log(`- ${workflow.name}: ${workflow.description}`);
  });
}

// 主执行函数
async function main() {
  try {
    await compositeExecutionExample();
  } catch (error) {
    console.error('❌ 复合工作流执行示例失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

module.exports = {
  compositeExecutionExample,
  executeCompleteScanWorkflow,
  executeKeywordMonitoringWorkflow,
  executeUserTrackingWorkflow,
  executeCustomCompositeWorkflow,
  generateComprehensiveReport,
  showCompositeStatistics
};