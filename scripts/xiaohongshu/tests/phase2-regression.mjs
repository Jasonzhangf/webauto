#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase2 回归测试脚本
 * 
 * 目标：使用已登录 profile 快速验证 Phase2 关键 blocks
 * 特点：
 *   1. 跳过 Phase1 登录（复用已有登录 session）
 *   2. 验证 GoToSearchBlock + CollectSearchListBlock
 *   3. 输出 runId、日志路径、统计结果
 * 
 * 用法：
 *   node scripts/xiaohongshu/tests/phase2-regression.mjs --profile xiaohongshu_batch-2 --keyword "咖啡" --target 50
 */

import minimist from 'minimist';
import { execute as detectPageState } from '../../../dist/modules/workflow/blocks/DetectPageStateBlock.js';
import { execute as goToSearch } from '../../../dist/modules/workflow/blocks/GoToSearchBlock.js';
import { execute as collectSearchList } from '../../../dist/modules/workflow/blocks/CollectSearchListBlock.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const argv = minimist(process.argv.slice(2));

// 配置参数
const PROFILE = argv.profile || argv.p || 'xiaohongshu_batch-2';
const KEYWORD = argv.keyword || argv.k || '咖啡';
const TARGET = parseInt(argv.target || argv.t || '50', 10);
const ENV = argv.env || 'debug';
const SERVICE_URL = argv.service || 'http://127.0.0.1:7701';

// 生成 runId
const runId = `phase2-reg-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const downloadRoot = join(homedir(), '.webauto', 'download', 'xiaohongshu', ENV, KEYWORD);
const logPath = join(downloadRoot, 'run.log');
const resultPath = join(downloadRoot, 'phase2-regression-result.json');

// 日志函数
function log(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    runId,
    level,
    message,
    ...meta
  };
  console.log(`[${level.toUpperCase()}] ${message}`);
  return entry;
}

// 确保目录存在
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// 保存结果
function saveResult(result) {
  ensureDir(downloadRoot);
  writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  log('info', `Result saved: ${resultPath}`);
}

// 主流程
async function main() {
  log('info', '=== Phase2 Regression Test ===', { runId, profile: PROFILE, keyword: KEYWORD, target: TARGET });
  
  const startTime = Date.now();
  const steps = [];
  let success = false;
  let error = null;
  let collectedCount = 0;

  try {
    // Step 1: 检测页面状态
    log('info', '[Step 1] Detecting page state...');
    const stateResult = await detectPageState({ sessionId: PROFILE });
    steps.push({
      step: 'detectPageState',
      status: stateResult.success ? 'success' : 'failed',
      data: { url: stateResult.url, pageType: stateResult.pageType }
    });
    log('info', `Page state: ${stateResult.pageType}`, { url: stateResult.url });

    // Step 2: GoToSearchBlock（含 SearchGate 许可）
    log('info', '[Step 2] Executing GoToSearchBlock...', { keyword: KEYWORD });
    const searchResult = await goToSearch({
      sessionId: PROFILE,
      keyword: KEYWORD,
      env: ENV,
      serviceUrl: SERVICE_URL
    });
    steps.push({
      step: 'goToSearch',
      status: searchResult.success ? 'success' : 'failed',
      data: {
        searchPageReady: searchResult.searchPageReady,
        searchExecuted: searchResult.searchExecuted,
        url: searchResult.url,
        entryAnchor: searchResult.entryAnchor,
        exitAnchor: searchResult.exitAnchor
      }
    });
    
    if (!searchResult.success) {
      throw new Error(`GoToSearchBlock failed: ${searchResult.error}`);
    }
    log('info', 'Search executed', { url: searchResult.url });

    // Step 3: CollectSearchListBlock
    log('info', '[Step 3] Executing CollectSearchListBlock...', { target: TARGET });
    const collectResult = await collectSearchList({
      sessionId: PROFILE,
      targetCount: TARGET,
      env: ENV,
      serviceUrl: SERVICE_URL
    });
    steps.push({
      step: 'collectSearchList',
      status: collectResult.success ? 'success' : 'failed',
      data: {
        count: collectResult.count,
        targetCount: TARGET,
        anchor: collectResult.anchor
      }
    });
    
    collectedCount = collectResult.count || 0;
    if (!collectResult.success) {
      throw new Error(`CollectSearchListBlock failed: ${collectResult.error}`);
    }
    
    success = true;
    log('info', 'Collection complete', { collected: collectedCount });

  } catch (err) {
    error = err.message;
    log('error', `Regression failed: ${error}`);
  }

  const duration = Date.now() - startTime;
  
  // 汇总结果
  const result = {
    runId,
    timestamp: new Date().toISOString(),
    profile: PROFILE,
    keyword: KEYWORD,
    target: TARGET,
    success,
    error,
    duration,
    steps,
    collectedCount,
    paths: {
      downloadRoot,
      resultPath,
      logPath
    }
  };

  saveResult(result);

  // 输出摘要
  console.log('\n=== Regression Summary ===');
  console.log(`Run ID: ${runId}`);
  console.log(`Profile: ${PROFILE}`);
  console.log(`Keyword: ${KEYWORD}`);
  console.log(`Target: ${TARGET}`);
  console.log(`Success: ${success ? '✅' : '❌'}`);
  console.log(`Collected: ${collectedCount}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Result: ${resultPath}`);
  
  if (error) {
    console.log(`Error: ${error}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
