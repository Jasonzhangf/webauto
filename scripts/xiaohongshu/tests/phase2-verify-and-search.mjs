#!/usr/bin/env node
/**
 * Phase 2: 小红书搜索验证（带容器锚点确认版）
 *
 * 修改要点：
 * 1. 先检查当前位置，如果不在搜索列表则先回退
 * 2. 确认回退成功后再执行搜索
 * 3. 增加每一步的锚点验证
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute as goToSearch } from '../../../modules/workflow/blocks/GoToSearchBlock.ts';
import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.ts';

const PROFILE = 'xiaohongshu_fresh';
const KEYWORDS = ['手机膜', '雷军', '小米', '华为', '鸿蒙'];
const UNIFIED_API = 'http://127.0.0.1:7701';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_SEARCH_GATE_PORT = process.env.WEBAUTO_SEARCH_GATE_PORT || '7790';
const DEFAULT_SEARCH_GATE_BASE = `http://127.0.0.1:${DEFAULT_SEARCH_GATE_PORT}`;
const DEFAULT_SEARCH_GATE_URL = `${DEFAULT_SEARCH_GATE_BASE}/permit`;

async function controllerAction(action, payload = {}) {
  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data || data;
}

async function getCurrentUrl() {
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: 'location.href'
    });
    return result?.result || '';
  } catch (err) {
    console.error('[getCurrentUrl] 错误:', err.message);
    return '';
  }
}

async function detectCurrentStage() {
  console.log('\n🔍 检查当前页面状态（基于 DOM）...');

  const script = `
    (() => {
      const url = window.location.href;
      const path = window.location.pathname;

      // 详情模态框检测
      const hasDetailModal = document.querySelector('.note-detail-mask, .note-detail-page, .note-detail-dialog');
      if (hasDetailModal) {
        return { stage: 'detail', url, reason: 'detail-modal-found' };
      }

      // 路径判断
      if (path.includes('/search_result')) {
        return { stage: 'search', url, reason: 'search-result-path' };
      }

      if (path === '/explore' || path === '/') {
        // 检查是否有搜索结果列表（可能是已搜索后回退）
        const hasFeeds = document.querySelector('.feeds-container');
        const hasSearchInput = document.querySelector('#search-input');
        if (hasFeeds && hasSearchInput) {
          // 检查是否在搜索状态（URL 可能包含 search_query 参数）
          const searchParams = new URLSearchParams(window.location.search);
          if (searchParams.has('keyword') || url.includes('search')) {
            return { stage: 'search', url, reason: 'search-params' };
          }
        }
        return { stage: 'home', url, reason: 'explore-path' };
      }

      return { stage: 'unknown', url, reason: 'no-match', path };
    })()
  `;

  try {
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script }
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });

    const data = await response.json();
    const result = data.data?.result || data.result;

    console.log(`   当前 URL: ${result.url}`);
    console.log(`   检测结果: ${result.stage} (${result.reason})`);

    return result.stage || 'unknown';
  } catch (error) {
    console.log(`   ❌ DOM 检测失败: ${error.message}`);
    return 'unknown';
  }
}

async function checkContainersAtCurrentPage() {
  console.log('\n🔍 检查当前匹配到的容器...');

  const containersToCheck = [
    'xiaohongshu_home',
    'xiaohongshu_home.feed_list',
    'xiaohongshu_search.search_bar',
    'xiaohongshu_search.search_result_list',
    'xiaohongshu_detail.modal_shell',
    'xiaohongshu_detail',
    'xiaohongshu_login.login_guard'
  ];

  const foundContainers = [];

  for (const containerId of containersToCheck) {
    try {
      const result = await controllerAction('containers:match', {
        url: 'https://www.xiaohongshu.com',
        sessionId: PROFILE,
        selectors: [containerId]
      });

      if (result.matches && result.matches.length > 0) {
        const match = result.matches[0];
        if (match.found) {
          foundContainers.push({
            id: containerId,
            rect: match.rect,
            path: match.path,
            confidence: match.confidence || 1.0
          });
          console.log(`   ✅ ${containerId}`);
        } else {
          console.log(`   ❌ ${containerId}
`);
        }
      }
    } catch (err) {
      console.log(`   ⚠️  ${containerId} (检查失败)`);
      console.log(`      错误: ${err.message}\n`);
    }
  }

  return foundContainers;
}

async function ensureInSearchList() {
  console.log('\n🔄 确保当前在搜索列表页...');

  // 使用 DOM 检测替代容器匹配（避免超时）
  const currentStage = await detectCurrentStage();
  const currentUrl = await getCurrentUrl();
  console.log(`当前 URL: ${currentUrl}\n`);

  // 判断是否已经在搜索页
  const atSearchOrHome = currentStage === 'search' || currentStage === 'home';
  const atDetail = currentStage === 'detail';

  if (atSearchOrHome && !atDetail) {
    console.log('✅ 已在搜索/首页，可以直接搜索');
    return true;
  }

  if (atDetail) {
    console.log('📖 当前在详情页，需要关闭...');
  } else {
    console.log('❌ 未识别当前位置，尝试回退...');
  }

  // 尝试回退到搜索页
  console.log('🏃 尝试回退到搜索列表...');

  // 方案1: ESC 关闭模态框
  try {
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `(() => {
        const evt = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
        document.dispatchEvent(evt);
        setTimeout(() => {
          const evt2 = new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true });
          document.dispatchEvent(evt2);
        }, 50);
      })()`
    });

    await new Promise(r => setTimeout(r, 2000));

    // 使用 DOM 检测验证回退效果
    const stageAfterEsc = await detectCurrentStage();
    if (stageAfterEsc === 'search' || stageAfterEsc === 'home') {
      console.log('✅ ESC 关闭成功，已回到搜索列表');
      return true;
    }
  } catch (err) {
    console.log('ESC 回退失败，尝试下一方案...');
  }

  // 方案2: 容器操作关闭
  try {
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_detail.modal_shell',
      operationId: 'close',
      sessionId: PROFILE
    });

    await new Promise(r => setTimeout(r, 1500));

    const stageAfterClose = await detectCurrentStage();
    if (stageAfterClose === 'search' || stageAfterClose === 'home') {
      console.log('✅ 容器关闭成功');
      return true;
    }
  } catch (err) {
    console.log('容器关闭失败，尝试最后一招...');
  }

  // 方案3: history.back()
  try {
    const urlBeforeBack = await getCurrentUrl();
    console.log(`当前URL: ${urlBeforeBack}. 执行 history.back()...`);

    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: 'window.history.back()'
    });

    await new Promise(r => setTimeout(r, 3000));

    // 检查回退后效果
    const stageAfterBack = await detectCurrentStage();
    if (stageAfterBack === 'search' || stageAfterBack === 'home') {
      console.log('✅ 历史记录回退成功');
      return true;
    }
  } catch (err) {
    console.log('历史记录回退失败');
  }

  console.log('❌ 所有回退方案均失败');
  return false;
}

async function ensureSearchGate() {
  // （与 phase2-search.mjs 相同，省略重复代码）
  // 为简化演示，这里直接检查本地端点
  try {
    const res = await fetch(`${DEFAULT_SEARCH_GATE_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      console.log(`[SearchGate] 在线: ${DEFAULT_SEARCH_GATE_BASE}`);
      return;
    }
  } catch {}

  console.warn(`[SearchGate] 未连接，如在本地请手动启动: node scripts/search-gate-server.mjs`);
}

async function main() {
  console.log('🔍 Phase 2: 搜索验证（带锚点确认版）\n');

  try {
    // 0. 确保 SearchGate
    await ensureSearchGate();

    // 1. 检查并确保在搜索列表页
    const atList = await ensureInSearchList();
    if (!atList) {
      console.error('❌ 无法回到搜索列表，放弃');
      process.exit(1);
    }

    // 2. 选择关键字（或从命令行读取）
    const userArgs = process.argv.slice(2);
    const keywordFromUser = userArgs.find(arg => !arg.startsWith('-'));
    const keyword = keywordFromUser || '华为';

    console.log(`\n📖 选择关键字: ${keyword}`);

    // 3. 执行搜索
    console.log('\n📝 执行搜索...');
    const searchRes = await goToSearch({
      sessionId: PROFILE,
      keyword
    });

    if (!searchRes.success) {
      console.error(`❌ 搜索失败: ${searchRes.error}`);
      process.exit(1);
    }

    console.log(`✅ 搜索完成，当前URL: ${searchRes.url}`);

    // 4. 检查搜索结果列表锚点
    console.log('\n🔍 检查搜索结果列表锚点...');
    const containersAfterSearch = await checkContainersAtCurrentPage();
    const hasSearchResultItems = containersAfterSearch.some(c =>
      c.id === 'xiaohongshu_search.search_result_item'
    );

    if (!hasSearchResultItems) {
      console.error('❌ 未找到搜索结果项');
      process.exit(1);
    }

    console.log('✅ 搜索结果列表确认完毕');

    // 5. 收集搜索列表
    console.log('\n📋 收集搜索结果......');
    const listRes = await collectSearchList({
      sessionId: PROFILE,
      targetCount: 10
    });

    if (!listRes.success) {
      console.error(`❌ 收集失败: ${listRes.error}`);
      process.exit(1);
    }

    console.log(`✅ 收集成功: ${listRes.count} 条`);
    listRes.items.slice(0, 3).forEach((it, i) => {
      console.log(`   ${i + 1}. ${it.title || '无标题'}  (id: ${it.noteId})`);
    });

    console.log('\n✅ Phase 2 完成 - 列表锚点验证通过');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();