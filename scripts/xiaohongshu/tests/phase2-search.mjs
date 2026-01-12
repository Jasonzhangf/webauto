#!/usr/bin/env node
/**
 * Phase 2: 小红书搜索验证（容器驱动版）
 * 目标：验证搜索输入 + 列表容器是否可用
 * 约束：
 *   1. 所有搜索必须通过对话框搜索（GoToSearchBlock 内部已保证）。
 *   2. 所有搜索必须先经过 SearchGate 节流服务授权（本脚本启动/检测 SearchGate）。
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import { execute as goToSearch } from '../../../dist/modules/workflow/blocks/GoToSearchBlock.js';
import { execute as collectSearchList } from '../../../dist/modules/workflow/blocks/CollectSearchListBlock.js';

const PROFILE = 'xiaohongshu_fresh';
// 允许使用的搜索关键词白名单
const KEYWORDS = ['小米', '雷军', 'iphone', '手机膜', '华为', '中国制造', '美国贸易'];
const UNIFIED_API = 'http://127.0.0.1:7701';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_SEARCH_GATE_PORT = process.env.WEBAUTO_SEARCH_GATE_PORT || '7790';
const DEFAULT_SEARCH_GATE_BASE = `http://127.0.0.1:${DEFAULT_SEARCH_GATE_PORT}`;
const DEFAULT_SEARCH_GATE_URL = `${DEFAULT_SEARCH_GATE_BASE}/permit`;

function resolveKeyword() {
  const argv = minimist(process.argv.slice(2));
  const fromFlag = argv.keyword || argv.k;
  const fromPositional =
    Array.isArray(argv._) && argv._.length > 0 ? argv._[argv._.length - 1] : undefined;
  const candidate = fromFlag || fromPositional;
  if (candidate && typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return KEYWORDS[0];
}

async function printBrowserStatus(tag) {
  try {
    const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: 'location.href' }
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });
    const data = await res.json().catch(() => ({}));
    const url = data?.data?.result || data?.result || '';
    console.log(`\n[BrowserStatus:${tag}] current URL: ${url || '未知'}`);
  } catch (err) {
    console.log(`\n[BrowserStatus:${tag}] 获取失败: ${err.message}`);
  }
}

async function ensureSearchGate() {
  const gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || DEFAULT_SEARCH_GATE_URL;
  const healthUrl = gateUrl.replace(/\/permit$/, '/health');

  async function checkHealth() {
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return !!data?.ok;
    } catch {
      return false;
    }
  }

  // 如果已经在跑，直接返回
  if (await checkHealth()) {
    console.log(`[SearchGate] 已在线: ${healthUrl}`);
    return;
  }

  // 仅在使用默认本地地址时尝试自动启动；如果用户自定义了远程 URL，则由用户自行管理
  if (process.env.WEBAUTO_SEARCH_GATE_URL && process.env.WEBAUTO_SEARCH_GATE_URL !== DEFAULT_SEARCH_GATE_URL) {
    console.warn(`[SearchGate] 检测到自定义 WEBAUTO_SEARCH_GATE_URL，但健康检查失败: ${healthUrl}`);
    console.warn('[SearchGate] 请手动启动或修复自定义 SearchGate 服务');
    return;
  }

  const scriptPath = path.join(repoRoot, 'scripts', 'search-gate-server.mjs');
  console.log(`[SearchGate] 未检测到服务，准备启动: node ${scriptPath}`);

  try {
    const child = spawn('node', [scriptPath], {
      cwd: repoRoot,
      stdio: 'ignore',
      detached: true
    });
    child.unref();
    console.log(`[SearchGate] 已后台启动，pid=${child.pid}`);
  } catch (err) {
    console.error('[SearchGate] 启动失败:', err?.message || err);
    return;
  }

  // 简单等待一小段时间再做一次健康检查
  await new Promise((r) => setTimeout(r, 1500));
  if (await checkHealth()) {
    console.log(`[SearchGate] 启动成功: ${healthUrl}`);
  } else {
    console.warn('[SearchGate] 启动后健康检查仍然失败，请在另一个终端手动检查 node scripts/search-gate-server.mjs');
  }
}

async function main() {
  console.log('🔍 Phase 2: 搜索验证（容器驱动版）\n');
  
  try {
    // 0. 确保 SearchGate 已启动（用于控制搜索频率）
    await ensureSearchGate();

    // 1. 选择关键字
    const keyword = resolveKeyword();
    console.log(`1️⃣ 选择关键字: ${keyword}`);

    // 2. 执行搜索
    console.log('\n2️⃣ 执行搜索...');
    const searchResult = await goToSearch({
      sessionId: PROFILE,
      keyword
    });

    // 打印入口锚点 / 出口锚点 / steps 状态
    console.log('\n[GoToSearch:entryAnchor]');
    console.log(JSON.stringify(searchResult.entryAnchor || searchResult.anchor || null, null, 2));

    console.log('\n[GoToSearch:exitAnchor]');
    console.log(JSON.stringify(searchResult.exitAnchor || null, null, 2));

    if (Array.isArray(searchResult.steps)) {
      console.log('\n[GoToSearch:steps]');
      for (const step of searchResult.steps) {
        console.log(
          `  - ${step.id}: ${step.status}`,
          step.error ? `error=${step.error}` : '',
        );
        if (step.anchor) {
          console.log(
            '    anchor=',
            JSON.stringify(step.anchor),
          );
        }
      }
    }

    if (!searchResult.success) {
      console.error(`❌ 搜索失败: ${searchResult.error}`);
      await printBrowserStatus('phase2-search:goToSearch');
      return;
    }

    console.log(`   ✅ 搜索完成`);
    console.log(`      - searchPageReady: ${searchResult.searchPageReady}`);
    console.log(`      - searchExecuted: ${searchResult.searchExecuted}`);
    console.log(`      - currentUrl: ${searchResult.url}\n`);

    // 3. 收集搜索列表
    console.log('3️⃣ 收集搜索结果列表...');
    const listResult = await collectSearchList({
      sessionId: PROFILE,
      targetCount: 10
    });

    if (!listResult.success) {
      console.error(`❌ 列表收集失败: ${listResult.error}`);
      await printBrowserStatus('phase2-search:collectList');
      return;
    }

    console.log(`   ✅ 收集成功: ${listResult.count} 条`);
    console.log('   📋 示例结果:');
    listResult.items.slice(0, 3).forEach((item, idx) => {
      console.log(`      ${idx + 1}. ${item.title || '无标题'} (${item.noteId || '无ID'})`);
    });

    console.log('\n✅ Phase 2 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    await printBrowserStatus('phase2-search:exception');
  }
}

main();
