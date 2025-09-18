#!/usr/bin/env node

/**
 * 微博工作流运行器
 * 统一的微博工作流执行入口
 */

const path = require('path');
const fs = require('fs').promises;
const { program } = require('commander');
const { chromium } = require('playwright');
const WorkflowOrchestrator = require('./core/workflow-orchestrator');

// 版本信息
const VERSION = '1.0.0';

// 配置选项
const DEFAULT_CONFIG = {
  browser: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  },
  context: {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  },
  orchestrator: {
    maxConcurrentWorkflows: 2,
    defaultTimeout: 120000,
    autoSaveReports: true,
    delayBetweenWorkflows: 2000
  }
};

/**
 * 主函数
 */
async function main() {
  try {
    // 解析命令行参数
    program
      .name('weibo-workflow-runner')
      .description('微博工作流运行器')
      .version(VERSION)
      .option('-w, --workflow <type>', '工作流类型 (homepage|profile|search|composite)')
      .option('-c, --config <file>', '配置文件路径')
      .option('-o, --output <dir>', '输出目录', './output')
      .option('--headless', '无头模式运行')
      .option('--max-posts <number>', '最大帖子数量', '50')
      .option('--keyword <text>', '搜索关键词')
      .option('--profile-url <url>', '个人主页URL')
      .option('--timeout <number>', '超时时间（毫秒）', '120000')
      .option('--delay <number>', '工作流间隔（毫秒）', '2000')
      .option('--verbose', '详细输出')
      .action(async (options) => {
        await executeWorkflow(options);
      });

    // 添加子命令
    program
      .command('list')
      .description('列出所有可用的工作流')
      .action(async () => {
        await listWorkflows();
      });

    program
      .command('batch <file>')
      .description('执行批量工作流配置文件')
      .option('--continue-on-error', '遇到错误时继续执行')
      .action(async (file, options) => {
        await executeBatchWorkflows(file, options);
      });

    program
      .command('monitor <keywords...>')
      .description('执行关键词监控')
      .option('--period <hours>', '监控时间范围（小时）', '24')
      .action(async (keywords, options) => {
        await executeKeywordMonitoring(keywords, options);
      });

    program
      .command('track <users...>')
      .description('执行用户追踪')
      .option('--depth <number>', '追踪深度', '3')
      .action(async (users, options) => {
        await executeUserTracking(users, options);
      });

    await program.parseAsync();

  } catch (error) {
    console.error('❌ 程序执行失败:', error);
    process.exit(1);
  }
}

/**
 * 执行单个工作流
 */
async function executeWorkflow(options) {
  console.log('🚀 开始执行微博工作流...');

  let browser = null;
  let context = null;
  let page = null;
  let orchestrator = null;

  try {
    // 加载配置
    const config = await loadConfig(options.config);
    const workflowType = options.workflow || 'homepage';

    // 创建工作流编排器
    orchestrator = new WorkflowOrchestrator({
      ...DEFAULT_CONFIG.orchestrator,
      ...config.orchestrator,
      maxConcurrentWorkflows: 1,
      delayBetweenWorkflows: options.delay
    });

    // 启动浏览器
    browser = await chromium.launch({
      ...DEFAULT_CONFIG.browser,
      ...config.browser,
      headless: options.headless
    });

    // 创建浏览器上下文
    context = await browser.newContext({
      ...DEFAULT_CONFIG.context,
      ...config.context
    });

    // 创建页面
    page = await context.newPage();
    page.setDefaultTimeout(parseInt(options.timeout));

    console.log('✅ 环境初始化完成');

    // 准备执行上下文
    const executionContext = {
      page,
      browser,
      context
    };

    // 根据工作流类型执行
    let result;
    switch (workflowType) {
      case 'homepage':
        result = await executeHomepageWorkflow(orchestrator, executionContext, options);
        break;
      case 'profile':
        result = await executeProfileWorkflow(orchestrator, executionContext, options);
        break;
      case 'search':
        result = await executeSearchWorkflow(orchestrator, executionContext, options);
        break;
      case 'composite':
        result = await executeCompositeWorkflow(orchestrator, executionContext, options);
        break;
      default:
        throw new Error(`未知的工作流类型: ${workflowType}`);
    }

    // 保存结果
    if (result && options.output) {
      await saveResult(result, options.output, workflowType);
    }

    console.log(`✅ 工作流执行完成: ${workflowType}`);
    return result;

  } catch (error) {
    console.error('❌ 工作流执行失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    if (orchestrator) await orchestrator.destroy();
  }
}

/**
 * 执行主页工作流
 */
async function executeHomepageWorkflow(orchestrator, context, options) {
  console.log('📋 执行微博主页工作流...');

  const result = await orchestrator.executeWorkflow('weibo-homepage', {
    context: context,
    maxPosts: parseInt(options.maxPosts),
    saveResults: true
  });

  console.log('📊 主页工作流结果:');
  console.log(`- 成功: ${result.success ? '是' : '否'}`);
  console.log(`- 帖子数量: ${result.posts?.length || 0}`);
  console.log(`- 执行时间: ${result.metadata?.executionTime || 0}ms`);

  return result;
}

/**
 * 执行个人主页工作流
 */
async function executeProfileWorkflow(orchestrator, context, options) {
  console.log('📋 执行个人主页工作流...');

  const profileUrl = options.profileUrl;
  if (!profileUrl) {
    throw new Error('个人主页工作流需要 --profile-url 参数');
  }

  const result = await orchestrator.executeWorkflow('weibo-profile', {
    context: context,
    profileUrl: profileUrl,
    maxPosts: parseInt(options.maxPosts),
    includeUserInfo: true
  });

  console.log('📊 个人主页工作流结果:');
  console.log(`- 成功: ${result.success ? '是' : '否'}`);
  console.log(`- 用户名: ${result.userInfo?.username || '未知'}`);
  console.log(`- 帖子数量: ${result.posts?.length || 0}`);

  return result;
}

/**
 * 执行搜索工作流
 */
async function executeSearchWorkflow(orchestrator, context, options) {
  console.log('📋 执行搜索工作流...');

  const keyword = options.keyword;
  if (!keyword) {
    throw new Error('搜索工作流需要 --keyword 参数');
  }

  const result = await orchestrator.executeWorkflow('weibo-search', {
    context: context,
    keyword: keyword,
    maxResults: parseInt(options.maxPosts),
    includeRelated: true
  });

  console.log('📊 搜索工作流结果:');
  console.log(`- 成功: ${result.success ? '是' : '否'}`);
  console.log(`- 关键词: ${result.keyword}`);
  console.log(`- 搜索结果: ${result.searchResults?.length || 0}`);

  return result;
}

/**
 * 执行复合工作流
 */
async function executeCompositeWorkflow(orchestrator, context, options) {
  console.log('📋 执行复合工作流...');

  const workflowConfigs = [
    {
      name: 'weibo-homepage',
      options: {
        context: context,
        maxPosts: Math.floor(parseInt(options.maxPosts) / 3)
      }
    },
    {
      name: 'weibo-search',
      options: {
        context: context,
        keyword: options.keyword || '热门',
        maxResults: Math.floor(parseInt(options.maxPosts) / 3)
      }
    }
  ];

  const result = await orchestrator.executeBatch(workflowConfigs, {
    continueOnError: true,
    delayBetweenWorkflows: parseInt(options.delay)
  });

  console.log('📊 复合工作流结果:');
  console.log(`- 总工作流: ${result.length}`);
  console.log(`- 成功工作流: ${result.filter(r => r.success).length}`);

  return result;
}

/**
 * 列出所有可用的工作流
 */
async function listWorkflows() {
  console.log('📋 可用的工作流列表:');

  const orchestrator = new WorkflowOrchestrator();
  const workflows = orchestrator.getWorkflowList();

  workflows.forEach(workflow => {
    console.log(`- ${workflow.name}: ${workflow.description}`);
    console.log(`  版本: ${workflow.version}`);
    console.log(`  分类: ${workflow.category}`);
    console.log('');
  });

  await orchestrator.destroy();
}

/**
 * 执行批量工作流
 */
async function executeBatchWorkflows(configFile, options) {
  console.log('📋 执行批量工作流...');

  let browser = null;
  let context = null;
  let page = null;
  let orchestrator = null;

  try {
    // 加载批量配置
    const config = await loadBatchConfig(configFile);

    // 创建工作流编排器
    orchestrator = new WorkflowOrchestrator({
      ...DEFAULT_CONFIG.orchestrator,
      delayBetweenWorkflows: config.delay || 2000
    });

    // 启动浏览器
    browser = await chromium.launch({
      ...DEFAULT_CONFIG.browser,
      headless: config.headless || false
    });

    // 创建浏览器上下文
    context = await browser.newContext({
      ...DEFAULT_CONFIG.context
    });

    // 创建页面
    page = await context.newPage();
    page.setDefaultTimeout(config.timeout || 120000);

    // 准备执行上下文
    const executionContext = {
      page,
      browser,
      context
    };

    // 转换配置格式
    const workflowConfigs = config.workflows.map(workflow => ({
      name: workflow.type,
      options: {
        context: executionContext,
        ...workflow.options
      }
    }));

    // 执行批量工作流
    const results = await orchestrator.executeBatch(workflowConfigs, {
      continueOnError: options.continueOnError
    });

    console.log('📊 批量执行结果:');
    console.log(`- 总工作流: ${results.length}`);
    console.log(`- 成功: ${results.filter(r => r.success).length}`);
    console.log(`- 失败: ${results.filter(r => !r.success).length}`);

    // 保存批量结果
    if (config.output) {
      await saveBatchResults(results, config.output);
    }

    return results;

  } catch (error) {
    console.error('❌ 批量工作流执行失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    if (orchestrator) await orchestrator.destroy();
  }
}

/**
 * 执行关键词监控
 */
async function executeKeywordMonitoring(keywords, options) {
  console.log('📋 执行关键词监控...');

  let browser = null;
  let context = null;
  let page = null;
  let orchestrator = null;

  try {
    // 创建工作流编排器
    orchestrator = new WorkflowOrchestrator();

    // 启动浏览器
    browser = await chromium.launch({
      ...DEFAULT_CONFIG.browser,
      headless: false
    });

    // 创建浏览器上下文
    context = await browser.newContext({
      ...DEFAULT_CONFIG.context
    });

    // 创建页面
    page = await context.newPage();
    page.setDefaultTimeout(120000);

    // 准备执行上下文
    const executionContext = {
      page,
      browser,
      context
    };

    // 创建关键词监控工作流配置
    const workflowConfigs = keywords.map(keyword => ({
      name: 'keyword-monitoring',
      options: {
        context: executionContext,
        keywords: [keyword],
        monitoringPeriod: parseInt(options.period)
      }
    }));

    // 执行监控
    const results = await orchestrator.executeBatch(workflowConfigs, {
      continueOnError: true
    });

    console.log('📊 关键词监控结果:');
    results.forEach((result, index) => {
      const keyword = keywords[index];
      console.log(`- ${keyword}: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    });

    return results;

  } catch (error) {
    console.error('❌ 关键词监控失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    if (orchestrator) await orchestrator.destroy();
  }
}

/**
 * 执行用户追踪
 */
async function executeUserTracking(users, options) {
  console.log('📋 执行用户追踪...');

  let browser = null;
  let context = null;
  let page = null;
  let orchestrator = null;

  try {
    // 创建工作流编排器
    orchestrator = new WorkflowOrchestrator();

    // 启动浏览器
    browser = await chromium.launch({
      ...DEFAULT_CONFIG.browser,
      headless: false
    });

    // 创建浏览器上下文
    context = await browser.newContext({
      ...DEFAULT_CONFIG.context
    });

    // 创建页面
    page = await context.newPage();
    page.setDefaultTimeout(120000);

    // 准备执行上下文
    const executionContext = {
      page,
      browser,
      context
    };

    // 创建用户追踪工作流配置
    const workflowConfigs = users.map(user => ({
      name: 'user-tracking',
      options: {
        context: executionContext,
        targetUsers: [user],
        trackingDepth: parseInt(options.depth)
      }
    }));

    // 执行追踪
    const results = await orchestrator.executeBatch(workflowConfigs, {
      continueOnError: true
    });

    console.log('📊 用户追踪结果:');
    results.forEach((result, index) => {
      const user = users[index];
      console.log(`- ${user}: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    });

    return results;

  } catch (error) {
    console.error('❌ 用户追踪失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    if (orchestrator) await orchestrator.destroy();
  }
}

/**
 * 加载配置文件
 */
async function loadConfig(configFile) {
  if (!configFile) {
    return {};
  }

  try {
    const configData = await fs.readFile(configFile, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.warn('⚠️ 配置文件加载失败，使用默认配置:', error.message);
    return {};
  }
}

/**
 * 加载批量配置文件
 */
async function loadBatchConfig(configFile) {
  try {
    const configData = await fs.readFile(configFile, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(`批量配置文件加载失败: ${error.message}`);
  }
}

/**
 * 保存结果
 */
async function saveResult(result, outputDir, workflowType) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${workflowType}-result-${timestamp}.json`;
    const outputPath = path.join(outputDir, filename);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

    console.log(`📁 结果已保存: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('❌ 保存结果失败:', error);
    throw error;
  }
}

/**
 * 保存批量结果
 */
async function saveBatchResults(results, outputDir) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `batch-result-${timestamp}.json`;
    const outputPath = path.join(outputDir, filename);

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalWorkflows: results.length,
        successfulWorkflows: results.filter(r => r.success).length,
        failedWorkflows: results.filter(r => !r.success).length
      },
      results: results
    };

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

    console.log(`📁 批量结果已保存: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('❌ 保存批量结果失败:', error);
    throw error;
  }
}

// 主执行
if (require.main === module) {
  main();
}

module.exports = {
  executeWorkflow,
  listWorkflows,
  executeBatchWorkflows,
  executeKeywordMonitoring,
  executeUserTracking,
  DEFAULT_CONFIG
};