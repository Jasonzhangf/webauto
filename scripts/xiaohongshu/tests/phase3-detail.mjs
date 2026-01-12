#!/usr/bin/env node
/**
 * Phase 3: 详情页正文/图片提取（容器驱动版）
 *
 * 要求：
 * - 只通过容器点击进入详情页，禁止手动构造 URL 导航
 * - 出错时优先通过 ESC/关闭按钮恢复到搜索列表，再重试一次
 *
 * 注意：运行时必须使用 dist 产物，禁止直接引用 TS 源文件。
 */

import { execute as collectSearchList } from '../../../dist/modules/workflow/blocks/CollectSearchListBlock.js';
import { execute as openDetail } from '../../../dist/modules/workflow/blocks/OpenDetailBlock.js';
import { execute as extractDetail } from '../../../dist/modules/workflow/blocks/ExtractDetailBlock.js';
import { execute as errorRecovery } from '../../../dist/modules/workflow/blocks/ErrorRecoveryBlock.js';

const PROFILE = 'xiaohongshu_fresh';
const UNIFIED_API = 'http://127.0.0.1:7701';

async function postController(action, payload) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function printBrowserStatus(tag) {
  try {
    const data = await postController('browser:execute', {
      profile: PROFILE,
      script: 'location.href'
    }).catch(() => ({}));
    const url = data?.data?.result || data?.result || '';
    console.log(`\n[BrowserStatus:${tag}] current URL: ${url || '未知'}`);
  } catch (err) {
    console.log(`\n[BrowserStatus:${tag}] 获取失败: ${err.message}`);
  }
}

function printAnchor(tag, anchor) {
  if (!anchor) return;
  console.log(`\n[Anchor:${tag}]`);
  Object.entries(anchor).forEach(([key, value]) => {
    console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  });
}

async function detectPageState() {
  try {
    // 优先用 URL 做轻量级判定，避免 containers:match 超时把脚本直接打死
    const data = await postController('browser:execute', {
      profile: PROFILE,
      script: 'location.href'
    }).catch(() => ({}));
    const url = data?.data?.result || data?.result || '';

    let pageType = 'unknown';
    if (typeof url === 'string') {
      if (url.includes('/explore/')) {
        pageType = 'detail';
      } else if (url.includes('/search_result')) {
        pageType = 'search';
      } else if (url.includes('xiaohongshu.com')) {
        // 对于 /explore 主页，我们按 home 处理（当前版本搜索结果也复用该页面）
        pageType = 'home';
      }
    }

    return { pageType, rootId: null, ids: [] };
  } catch (err) {
    console.warn('[phase3] detectPageState failed:', err.message);
    return { pageType: 'unknown', rootId: null, ids: [] };
  }
}

async function runPhase3(attempt = 1) {
  console.log(`📄 Phase 3: 详情页提取测试（容器驱动版）｜尝试 #${attempt}\n`);

  try {
    console.log('0️⃣ 检查当前页面状态...');
    const state = await detectPageState();
    console.log(`   页面类型: ${state.pageType} (root=${state.rootId || '未知'})`);

    if (state.pageType === 'search' || state.pageType === 'home') {
      // 从搜索/主页（当前版本搜索结果也落在 /explore feed）自动选一条，点击进入详情
      console.log('1️⃣ 获取搜索结果...');
      const listResult = await collectSearchList({
        sessionId: PROFILE,
        targetCount: 1
      });

      if (!listResult.success || listResult.items.length === 0) {
        console.error('❌ 未找到搜索结果，请先运行 Phase 2 完成搜索');
        await printBrowserStatus('phase3-detail:collectList');
        return;
      }

      const item = listResult.items[0];
      printAnchor('CollectSearchList', listResult.anchor);
      console.log(`   ✅ 选中结果: ${item.title || '无标题'} (${item.noteId || '无ID'})\n`);

      console.log('2️⃣ 打开详情页...');
      const openResult = await openDetail({
        sessionId: PROFILE,
        containerId: item.containerId
      });

      // 打印 OpenDetail 的入口/出口锚点与步骤状态，方便对齐后续 workflow 规范
      if (openResult.entryAnchor) {
        console.log('\n[OpenDetail:entryAnchor]');
        console.log(JSON.stringify(openResult.entryAnchor, null, 2));
      }
      if (openResult.exitAnchor) {
        console.log('\n[OpenDetail:exitAnchor]');
        console.log(JSON.stringify(openResult.exitAnchor, null, 2));
      }
      if (Array.isArray(openResult.steps)) {
        console.log('\n[OpenDetail:steps]');
        for (const step of openResult.steps) {
          console.log(
            `  - ${step.id}: ${step.status}`,
            step.error ? `error=${step.error}` : '',
          );
        }
      }

      if (!openResult.success || !openResult.detailReady) {
        console.error(`❌ 打开详情页失败: ${openResult.error || 'detail not ready'}`);
        printAnchor('OpenDetail', openResult.anchor);
        await printBrowserStatus('phase3-detail:openDetail');
        return;
      }

      printAnchor('OpenDetail', openResult.anchor);
      console.log('   ✅ 详情页已打开\n');
    } else if (state.pageType === 'detail') {
      console.log('   ✅ 检测到已经在详情页，跳过搜索和点击，直接验证提取');
    } else {
      console.error('❌ 当前页面无法识别为 search/detail/home，请先手动导航到搜索结果或详情页再运行 Phase 3');
      await printBrowserStatus('phase3-detail:unknown-state');
      return;
    }

    // 提取详情内容
    console.log('3️⃣ 提取详情内容...');
    const detailResult = await extractDetail({
      sessionId: PROFILE
    });

    if (!detailResult.success) {
      console.error(`❌ 提取失败: ${detailResult.error}`);
      printAnchor('ExtractDetail', detailResult.anchor);
      await printBrowserStatus('phase3-detail:extractDetail');
      return;
    }

    printAnchor('ExtractDetail', detailResult.anchor);
    const detail = detailResult.detail || {};
    console.log('   ✅ 提取成功:');
    console.log(`      - 作者: ${detail.header?.author_name || '未知'}`);
    console.log(`      - 标题: ${detail.content?.title || '无标题'}`);
    console.log(`      - 正文长度: ${(detail.content?.text || '').length}`);
    console.log(`      - 图片数: ${(detail.gallery?.images || []).length}`);

    console.log('\n✅ Phase 3 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    await printBrowserStatus('phase3-detail:exception');

    if (attempt >= 2) {
      console.error('❌ ESC 恢复后重试仍失败，放弃本次 Phase 3');
      return;
    }

    console.log('🔄 尝试通过 ESC / 关闭按钮恢复到搜索列表...');
    const recovery = await errorRecovery({
      sessionId: PROFILE,
      fromStage: 'detail',
      targetStage: 'search',
      recoveryMode: 'esc',
      maxRetries: 2
    });

    if (!recovery.success) {
      console.error('❌ ESC 恢复失败，当前无法安全回到搜索列表');
      if (recovery.currentUrl) {
        console.error('   当前 URL:', recovery.currentUrl);
      }
      return;
    }

    console.log(
      `✅ ESC 恢复成功，最终阶段=${recovery.finalStage}，method=${recovery.method || 'unknown'}`,
    );
    await printBrowserStatus('phase3-detail:after-esc-recovery');

    // 恢复成功后，从搜索列表重新开始当前 Phase（只重试一次）
    return runPhase3(attempt + 1);
  }
}

async function main() {
  await runPhase3(1);
}

main().catch((err) => {
  console.error('❌ Phase3 未捕获异常:', err.message || err);
});
