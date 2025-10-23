#!/usr/bin/env node

/**
 * AdvancedClickNode 性能和可靠性测试框架演示
 * 展示如何使用测试框架进行全面的性能和可靠性测试
 */

const PerformanceTestFramework = require('./PerformanceTestFramework');
const AutomatedTestExecutor = require('./AutomatedTestExecutor');

async function runBasicDemo() {
  console.log('🚀 开始 AdvancedClickNode 性能测试框架演示\n');

  // 1. 创建性能测试框架实例
  console.log('📋 1. 初始化性能测试框架...');
  const testFramework = new PerformanceTestFramework({
    outputDir: './tests/performance/demo-results',
    logLevel: 'info',
    enableScreenshots: true,
    enableMemoryMonitoring: true,
    enableNetworkMonitoring: true
  });

  // 2. 添加基础功能测试
  console.log('📝 2. 添加基础功能测试用例...');
  testFramework.addTest('basic-functionality', {
    id: 'demo-basic-click',
    name: '演示基础点击测试',
    description: '演示在百度首页点击新闻链接的基础功能',
    priority: 'high',
    enabled: true,
    timeout: 60000,
    retries: 2,
    preconditions: [
      {
        type: 'network_check',
        description: '检查网络连接'
      }
    ],
    steps: [
      {
        type: 'click_test',
        description: '执行百度首页点击测试',
        workflowConfig: {
          name: '百度基础点击演示',
          preflows: [],
          "nodes": [
            { "id": "start", "type": "StartNode", "name": "开始", "next": ["init_browser"] },
            {
              "id": "init_browser",
              "type": "BrowserInitNode",
              "name": "初始化浏览器",
              "config": {
                "headless": false,
                "viewport": { "width": 1920, "height": 1080 },
                "timeout": 30000
              },
              "next": ["navigate_baidu"]
            },
            {
              "id": "navigate_baidu",
              "type": "NavigationNode",
              "name": "导航到百度首页",
              "config": {
                "url": "https://www.baidu.com",
                "waitUntil": "domcontentloaded",
                "timeout": 30000
              },
              "next": ["wait_baidu"]
            },
            {
              "id": "wait_baidu",
              "type": "WaitNode",
              "name": "等待页面加载",
              "config": { "minMs": 2000, "maxMs": 3000 },
              "next": ["test_click"]
            },
            {
              "id": "test_click",
              "type": "AdvancedClickNode",
              "name": "测试点击新闻链接",
              "config": {
                "selector": "a[href*=\"news.baidu.com\"]",
                "strategy": "auto",
                "clickMethods": ["playwright_click", "javascript_click"],
                "maxRetries": 2,
                "retryDelay": 500,
                "waitAfter": 2000,
                "timeout": 8000,
                "verifyVisibility": true,
                "scrollIntoView": true,
                "highlight": true,
                "highlightDuration": 1500,
                "saveDebugInfo": true,
                "takeScreenshots": true,
                "logLevel": "info"
              },
              "next": ["verify_result"]
            },
            {
              "id": "verify_result",
              "type": "JavaScriptExecutionNode",
              "name": "验证点击结果",
              "config": {
                "script": "console.log('验证点击结果...'); const currentUrl = window.location.href; const currentTitle = document.title; return { success: true, currentUrl: currentUrl, currentTitle: currentTitle, timestamp: new Date().toISOString() };",
                "saveScreenshots": true
              },
              "next": ["end"]
            },
            {
              "id": "end",
              "type": "EndNode",
              "name": "结束",
              "config": { "cleanup": true, "saveLogs": true }
            }
          ],
          "globalConfig": {
            "logLevel": "info",
            "screenshotOnError": true,
            "autoCleanup": true,
            "parallelExecution": false,
            "timeout": 120000
          }
        }
      }
    ],
    expectedResults: [
      {
        type: 'click_success',
        description: '点击操作成功执行',
        value: true
      }
    ],
    performanceThresholds: {
      maxAverageTime: 30000,
      maxP95Time: 45000
    },
    reliabilityThresholds: {
      minSuccessRate: 90,
      maxFailureRate: 10
    },
    tags: ['demo', 'basic', 'click', 'baidu']
  });

  // 3. 添加性能测试
  console.log('⚡ 3. 添加性能测试用例...');
  testFramework.addTest('performance-tests', {
    id: 'demo-performance-test',
    name: '演示性能测试',
    description: '演示AdvancedClickNode的性能测试能力',
    priority: 'high',
    enabled: true,
    timeout: 120000,
    retries: 1,
    steps: [
      {
        type: 'performance_test',
        description: '执行性能测试（多次迭代）',
        iterations: 5,
        workflowConfig: {
          name: '性能测试演示',
          preflows: [],
          nodes: [
            { "id": "start", "type": "StartNode", "name": "开始", "next": ["init_browser"] },
            {
              "id": "init_browser",
              "type": "BrowserInitNode",
              "name": "初始化浏览器",
              "config": {
                "headless": false,
                "viewport": { "width": 1920, "height": 1080 },
                "timeout": 30000
              },
              "next": ["navigate_baidu"]
            },
            {
              "id": "navigate_baidu",
              "type": "NavigationNode",
              "name": "导航到百度首页",
              "config": {
                "url": "https://www.baidu.com",
                "waitUntil": "domcontentloaded",
                "timeout": 30000
              },
              "next": ["test_click"]
            },
            {
              "id": "test_click",
              "type": "AdvancedClickNode",
              "name": "测试点击操作",
              "config": {
                "selector": "a[href*=\"news.baidu.com\"]",
                "strategy": "auto",
                "clickMethods": ["playwright_click", "javascript_click"],
                "maxRetries": 2,
                "retryDelay": 500,
                "waitAfter": 1000,
                "timeout": 8000,
                "verifyVisibility": true,
                "scrollIntoView": true,
                "highlight": false,
                "saveDebugInfo": false,
                "takeScreenshots": false,
                "logLevel": "warn"
              },
              "next": ["end"]
            },
            {
              "id": "end",
              "type": "EndNode",
              "name": "结束",
              "config": { "cleanup": true, "saveLogs": false }
            }
          ],
          globalConfig: {
            logLevel: 'warn',
            screenshotOnError: false,
            autoCleanup: true,
            parallelExecution: false,
            timeout: 60000
          }
        }
      }
    ],
    expectedResults: [
      {
        type: 'performance_threshold',
        description: '平均响应时间符合阈值',
        value: 15000
      }
    ],
    performanceThresholds: {
      maxAverageTime: 15000,
      maxP95Time: 20000
    },
    tags: ['demo', 'performance', 'benchmark']
  });

  // 4. 添加可靠性测试
  console.log('🔒 4. 添加可靠性测试用例...');
  testFramework.addTest('reliability-tests', {
    id: 'demo-reliability-test',
    name: '演示可靠性测试',
    description: '演示AdvancedClickNode的可靠性测试能力',
    priority: 'high',
    enabled: true,
    timeout: 180000,
    retries: 1,
    steps: [
      {
        type: 'reliability_test',
        description: '执行可靠性测试（多次迭代验证稳定性）',
        iterations: 10,
        workflowConfig: {
          name: '可靠性测试演示',
          preflows: [],
          nodes: [
            { "id": "start", "type": "StartNode", "name": "开始", "next": ["init_browser"] },
            {
              "id": "init_browser",
              "type": "BrowserInitNode",
              "name": "初始化浏览器",
              "config": {
                "headless": false,
                "viewport": { "width": 1920, "height": 1080 },
                "timeout": 30000
              },
              "next": ["navigate_baidu"]
            },
            {
              "id": "navigate_baidu",
              "type": "NavigationNode",
              "name": "导航到百度首页",
              "config": {
                "url": "https://www.baidu.com",
                "waitUntil": "domcontentloaded",
                "timeout": 30000
              },
              "next": ["test_click"]
            },
            {
              "id": "test_click",
              "type": "AdvancedClickNode",
              "name": "测试点击操作",
              "config": {
                "selector": "a[href*=\"news.baidu.com\"]",
                "strategy": "auto",
                "clickMethods": ["playwright_click", "javascript_click"],
                "maxRetries": 2,
                "retryDelay": 500,
                "waitAfter": 1000,
                "timeout": 8000,
                "verifyVisibility": true,
                "scrollIntoView": true,
                "highlight": false,
                "saveDebugInfo": false,
                "takeScreenshots": false,
                "logLevel": "error"
              },
              "next": ["end"]
            },
            {
              "id": "end",
              "type": "EndNode",
              "name": "结束",
              "config": { "cleanup": true, "saveLogs": false }
            }
          ],
          globalConfig: {
            logLevel: 'error',
            screenshotOnError: false,
            autoCleanup: true,
            parallelExecution: false,
            timeout: 60000
          }
        }
      }
    ],
    expectedResults: [
      {
        type: 'reliability_threshold',
        description: '成功率符合阈值',
        value: 85
      }
    ],
    reliabilityThresholds: {
      minSuccessRate: 85,
      maxFailureRate: 15
    },
    tags: ['demo', 'reliability', 'stability']
  });

  // 5. 运行测试
  console.log('🏃 5. 开始运行测试套件...\n');
  const startTime = Date.now();

  try {
    const results = await testFramework.runAllTests();
    const endTime = Date.now();

    // 6. 显示结果摘要
    console.log('\n✅ 测试完成！');
    console.log('=' .repeat(60));
    console.log('📊 测试结果摘要:');
    console.log(`  总测试数: ${results.testSuite.summary.totalTests}`);
    console.log(`  通过测试: ${results.testSuite.summary.passedTests}`);
    console.log(`  失败测试: ${results.testSuite.summary.failedTests}`);
    console.log(`  跳过测试: ${results.testSuite.summary.skippedTests}`);
    console.log(`  成功率: ${results.testSuite.summary.successRate}%`);
    console.log(`  总执行时间: ${(results.testSuite.summary.totalDuration / 1000).toFixed(1)}s`);
    console.log(`  实际执行时间: ${((endTime - startTime) / 1000).toFixed(1)}s`);

    // 显示性能指标
    if (results.testSuite.performanceMetrics.responseTimes) {
      const rt = results.testSuite.performanceMetrics.responseTimes;
      console.log('\n⚡ 性能指标:');
      console.log(`  平均响应时间: ${Math.round(rt.average)}ms`);
      console.log(`  最小响应时间: ${Math.round(rt.min)}ms`);
      console.log(`  最大响应时间: ${Math.round(rt.max)}ms`);
      console.log(`  P95响应时间: ${Math.round(rt.p95)}ms`);
    }

    // 显示可靠性指标
    if (results.testSuite.reliabilityMetrics.crashCount !== undefined) {
      console.log('\n🔒 可靠性指标:');
      console.log(`  崩溃次数: ${results.testSuite.reliabilityMetrics.crashCount}`);
      console.log(`  错误类型分布:`, Object.keys(results.testSuite.reliabilityMetrics.errorFrequency));
    }

    // 7. 保存详细结果
    console.log('\n💾 详细结果已保存到:');
    console.log(`  ${testFramework.options.outputDir}`);
    console.log('  包含 JSON 数据文件和 HTML 可视化报告');

    return results;

  } catch (error) {
    console.error('\n❌ 测试执行失败:', error.message);
    console.error('错误详情:', error);
    throw error;
  }
}

async function runAutomatedDemo() {
  console.log('\n🤖 开始自动化测试执行器演示...\n');

  // 1. 创建自动化测试执行器
  const executor = new AutomatedTestExecutor({
    configPath: './tests/performance/demo-config.json',
    resultsDir: './tests/performance/automated-demo-results',
    enableRemoteTrigger: true,
    remotePort: 3002,
    retentionDays: 7
  });

  try {
    // 2. 启动执行器
    console.log('🚀 启动自动化测试执行器...');
    await executor.start();

    // 3. 手动触发一次测试
    console.log('🏃 手动触发测试执行...');
    const execution = await executor.triggerExecution('advanced-click-node', {
      trigger: 'demo',
      description: '演示手动触发的测试执行'
    });

    console.log(`✅ 测试执行已启动，ID: ${execution.id}`);

    // 4. 等待一段时间让测试运行
    console.log('⏳ 等待测试执行...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 5. 获取执行状态
    const status = executor.getStatus();
    console.log('\n📊 执行器状态:');
    console.log(`  运行中: ${status.isRunning}`);
    console.log(`  当前执行: ${status.currentExecution ? status.currentExecution.id : '无'}`);
    console.log(`  历史执行: ${status.executionHistory.length} 条`);
    console.log(`  运行时间: ${Math.round(status.uptime)}s`);

    // 6. 停止执行器
    console.log('\n🛑 停止自动化测试执行器...');
    await executor.stop();

    console.log('✅ 自动化测试执行器演示完成！');

    return execution;

  } catch (error) {
    console.error('❌ 自动化测试执行器演示失败:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🎯 AdvancedClickNode 性能和可靠性测试框架演示');
  console.log('=' .repeat(60));

  try {
    // 检查命令行参数
    const args = process.argv.slice(2);
    const demoType = args[0] || 'basic';

    if (demoType === 'basic') {
      await runBasicDemo();
    } else if (demoType === 'automated') {
      await runAutomatedDemo();
    } else if (demoType === 'full') {
      await runBasicDemo();
      await runAutomatedDemo();
    } else {
      console.log('用法:');
      console.log('  node demo.js basic     - 运行基础测试框架演示');
      console.log('  node demo.js automated - 运行自动化执行器演示');
      console.log('  node demo.js full       - 运行完整演示');
      process.exit(1);
    }

    console.log('\n🎉 演示完成！您可以通过以下方式使用这个测试框架:');
    console.log('  1. 基础测试框架 - 直接运行测试套件并获取详细报告');
    console.log('  2. 自动化执行器 - 设置定时任务、远程触发和通知系统');
    console.log('  3. 自定义测试用例 - 根据您的需求添加更多测试场景');

  } catch (error) {
    console.error('\n💥 演示执行失败:', error.message);
    console.error('请检查环境配置和依赖项');
    process.exit(1);
  }
}

// 运行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runBasicDemo,
  runAutomatedDemo,
  main
};