#!/usr/bin/env node

/**
 * 动态1688搜索脚本
 * 使用标准GBK编码动态生成搜索URL并执行搜索
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import GBKEncoder from '../utils/gbk-encoder.js';

// 工作流模板
const WORKFLOW_TEMPLATE = {
  "name": "1688动态搜索工作流",
  "description": "动态生成GBK编码的1688搜索工作流",
  "version": "1.0.0",
  "preflows": ["1688-login-preflow"],
  "nodes": [
    { "id": "start", "type": "StartNode", "name": "开始", "next": ["attach"] },
    {
      "id": "attach",
      "type": "AttachSessionNode",
      "name": "会话接力",
      "config": {},
      "next": ["navigate_search"]
    },
    {
      "id": "navigate_search",
      "type": "NavigationNode",
      "name": "导航到搜索页",
      "config": {
        "url": "{{searchURL}}",
        "waitUntil": "domcontentloaded",
        "timeout": 30000
      },
      "next": ["wait_search"]
    },
    {
      "id": "wait_search",
      "type": "WaitNode",
      "name": "等待搜索结果加载",
      "config": { "minMs": 3000, "maxMs": 5000 },
      "next": ["extract_results"]
    },
    {
      "id": "extract_results",
      "type": "PageSnapshotNode",
      "name": "提取搜索结果",
      "config": {
        "script": "console.log('🔍 提取1688搜索结果...'); const offerItems = document.querySelectorAll('.sm-offer-item, .offer-item, .sm-offer, [class*=offer]'); console.log('找到 ' + offerItems.length + ' 个商品项'); let merchantLinks = []; let merchantTitles = []; if (offerItems.length > 0) { for (let i = 0; i < Math.min(20, offerItems.length); i++) { const item = offerItems[i]; const link = item.querySelector('a[href*=\"1688.com\"]'); const title = item.querySelector('h4, [class*=title], a[title]'); if (link && link.href) { merchantLinks.push(link.href); merchantTitles.push(title ? title.textContent.trim() : ''); } } } console.log('🔗 提取的商家链接数量:', merchantLinks.length); console.log('📝 前3个商品标题:', merchantTitles.slice(0, 3)); return { success: true, keyword: '{{keyword}}', merchantLinks: merchantLinks, merchantTitles: merchantTitles, totalFound: merchantLinks.length, currentUrl: window.location.href, pageTitle: document.title, timestamp: new Date().toISOString() };",
        "saveScreenshots": true
      },
      "next": ["open_first"]
    },
    {
      "id": "open_first",
      "type": "NavigationNode",
      "name": "打开第一条商家链接",
      "config": {
        "url": "{{previous.merchantLinks[0]}}",
        "waitUntil": "domcontentloaded",
        "timeout": 30000
      },
      "next": ["wait_first_page"]
    },
    {
      "id": "wait_first_page",
      "type": "WaitNode",
      "name": "等待商家页面加载",
      "config": { "minMs": 2000, "maxMs": 3000 },
      "next": ["analyze_first_page"]
    },
    {
      "id": "analyze_first_page",
      "type": "PageSnapshotNode",
      "name": "分析商家页面",
      "config": {
        "script": "console.log('🔍 分析第一条商家页面...'); const pageInfo = { url: window.location.href, title: document.title, timestamp: new Date().toISOString() }; const isMerchantPage = window.location.href.includes('1688.com') && (window.location.href.includes('/offer/') || window.location.href.includes('/company/') || window.location.href.includes('member_id=')); const merchantInfo = {}; const companyTitle = document.querySelector('[class*=company], [class*=title], h1'); const contactInfo = document.querySelector('[class*=contact], [class*=phone], [class*=tel]'); const productImages = document.querySelectorAll('img[src*=\"1688\"]'); merchantInfo.companyName = companyTitle ? companyTitle.textContent.trim() : ''; merchantInfo.hasContact = !!contactInfo; merchantInfo.imageCount = productImages.length; console.log('📋 商家页面信息:', { isMerchantPage, url: pageInfo.url, title: pageInfo.title, merchantInfo }); return { success: true, pageInfo: pageInfo, merchantInfo: merchantInfo, isMerchantPage: isMerchantPage };",
        "saveScreenshots": true
      },
      "next": ["save_results"]
    },
    {
      "id": "save_results",
      "type": "ResultSaverNode",
      "name": "保存完整结果",
      "config": {
        "outputDir": "archive/workflow-records",
        "filenameTemplate": "1688-dynamic-search-{timestamp}.json",
        "includeMetadata": true,
        "mergeData": true
      },
      "next": ["end"]
    },
    {
      "id": "end",
      "type": "EndNode",
      "name": "结束",
      "config": { "cleanup": false, "saveLogs": true }
    }
  ],
  "globalConfig": {
    "logLevel": "info",
    "screenshotOnError": true,
    "autoCleanup": false,
    "parallelExecution": false,
    "timeout": 180000
  }
};

/**
 * 生成动态搜索工作流
 * @param {string} keyword - 搜索关键词
 * @returns {Object} 工作流配置对象
 */
function generateDynamicWorkflow(keyword) {
  // 创建工作流副本
  const workflow = JSON.parse(JSON.stringify(WORKFLOW_TEMPLATE));

  // 更新全局配置中的关键词
  workflow.globalConfig.keyword = keyword;
  workflow.description = `动态搜索"${keyword}"的工作流`;

  // 设置输出文件名
  const saveNode = workflow.nodes.find(node => node.id === 'save_results');
  if (saveNode) {
    saveNode.config.filenameTemplate = `1688-search-${keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}-{timestamp}.json`;
  }

  return { workflow };
}

/**
 * 执行动态搜索
 * @param {string} keyword - 搜索关键词
 * @param {boolean} debug - 是否启用调试模式
 */
function runDynamicSearch(keyword, debug = false) {
  console.log(`🚀 开始动态搜索: ${keyword}`);

  // 生成工作流
  const { workflow } = generateDynamicWorkflow(keyword);

  // 创建临时工作流文件
  const tempWorkflowFile = `workflows/temp/dynamic-search-${Date.now()}.json`;

  // 确保临时目录存在
  const tempDir = path.dirname(tempWorkflowFile);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 写入工作流文件
  fs.writeFileSync(tempWorkflowFile, JSON.stringify(workflow, null, 2));
  console.log(`📝 临时工作流文件: ${tempWorkflowFile}`);

  try {
    // 执行工作流
    const command = `CAMOUFOX_PATH="/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox" node scripts/run-with-preflows.js ${tempWorkflowFile}${debug ? ' --debug' : ''}`;
    console.log(`⚡ 执行命令: ${command}`);

    const result = execSync(command, {
      encoding: 'utf8',
      stdio: 'inherit'
    });

    console.log('✅ 搜索完成');
    return result;
  } catch (error) {
    console.error('❌ 搜索执行失败:', error.message);
    throw error;
  } finally {
    // 清理临时文件
    if (fs.existsSync(tempWorkflowFile)) {
      fs.unlinkSync(tempWorkflowFile);
      console.log('🗑️ 已清理临时工作流文件');
    }
  }
}

// 命令行参数处理
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法:');
    console.log('  node scripts/run-1688-dynamic-search.js <搜索关键词> [--debug]');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/run-1688-dynamic-search.js "钢化膜"');
    console.log('  node scripts/run-1688-dynamic-search.js "手机" --debug');
    process.exit(1);
  }

  const keyword = args[0];
  const debug = args.includes('--debug');

  try {
    runDynamicSearch(keyword, debug);
  } catch (error) {
    console.error('搜索失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateDynamicWorkflow, runDynamicSearch };