#!/usr/bin/env node
/**
 * Phase 4: 评论展开测试（容器驱动版）
 *
 * 特别约定：
 * - 使用 CollectCommentsBlock（Warmup + Expand）验证滚动 & 展开逻辑
 * - 出错时优先通过 ESC/关闭按钮恢复到搜索列表，再重试一次
 * - 调试数据仅用于本地验证，不作为正式下载结果
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import os from 'node:os';

import { execute as collectSearchList } from '../../../dist/modules/workflow/blocks/CollectSearchListBlock.js';
import { execute as openDetail } from '../../../dist/modules/workflow/blocks/OpenDetailBlock.js';
import { execute as collectComments } from '../../../dist/modules/workflow/blocks/CollectCommentsBlock.js';
import { execute as errorRecovery } from '../../../dist/modules/workflow/blocks/ErrorRecoveryBlock.js';
import { execute as recordFixture } from '../../../dist/modules/workflow/blocks/RecordFixtureBlock.js';

const PROFILE = 'xiaohongshu_fresh';
const UNIFIED_API = 'http://127.0.0.1:7701';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const homeDir = os.homedir();
// Phase4 调试输出统一落在 ~/.webauto/download/xiaohongshu/debug/phase4
const DATA_DIR = path.join(homeDir, '.webauto', 'download', 'xiaohongshu', 'debug', 'phase4');

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

async function getCurrentUrl() {
  const data = await postController('browser:execute', {
    profile: PROFILE,
    script: 'location.href'
  }).catch(() => ({}));
  return data.data?.result || data.result || '';
}

async function printBrowserStatus(tag) {
  const url = await getCurrentUrl();
  console.log(`\n[BrowserStatus:${tag}] current URL: ${url || '未知'}`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

function printAnchor(tag, anchor) {
  if (!anchor) return;
  console.log(`\n[Anchor:${tag}]`);
  Object.entries(anchor).forEach(([key, value]) => {
    console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  });
}

function extractNoteIdFromUrl(url) {
  if (typeof url !== 'string') return '';
  const m = url.match(/\/explore\/([^/?#]+)/);
  return m ? m[1] : '';
}

async function detectPageState() {
  try {
    // 与 Phase3 一致：优先用 URL 判定当前阶段，避免 containers:match 超时
    const url = await getCurrentUrl();

    let pageType = 'unknown';
    if (typeof url === 'string') {
      if (url.includes('/explore/')) {
        pageType = 'detail';
      } else if (url.includes('/search_result')) {
        pageType = 'search';
      } else if (url.includes('xiaohongshu.com')) {
        pageType = 'home';
      }
    }

    return { pageType, rootId: null, ids: [] };
  } catch (err) {
    console.warn('[phase4] detectPageState failed:', err.message);
    return { pageType: 'unknown', rootId: null, ids: [] };
  }
}

async function runPhase4(attempt = 1) {
  console.log(`💬 Phase 4: 评论展开测试（容器驱动版）｜尝试 #${attempt}\n`);

  try {
    console.log('0️⃣ 检查当前页面状态...');
    const state = await detectPageState();
    console.log(`   页面类型: ${state.pageType} (root=${state.rootId || '未知'})`);

    if (state.pageType === 'home') {
      console.error('❌ 当前在主页，请先通过 Phase 2 进入搜索页并打开一条详情');
      await printBrowserStatus('phase4-comments:wrong-state-home');
      return;
    }

    if (state.pageType === 'search') {
      // 1. 获取搜索结果并打开详情
      console.log('1️⃣ 获取搜索结果...');
      const listResult = await collectSearchList({
        sessionId: PROFILE,
        targetCount: 1
      });

      if (!listResult.success || listResult.items.length === 0) {
        console.error('❌ 未找到搜索结果，请先运行 Phase 2 完成搜索');
        printAnchor('CollectSearchList', listResult.anchor);
        await printBrowserStatus('phase4-comments:collectList');
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

      if (!openResult.success || !openResult.detailReady) {
        console.error(`❌ 打开详情页失败: ${openResult.error || 'detail not ready'}`);
        printAnchor('OpenDetail', openResult.anchor);
        await printBrowserStatus('phase4-comments:openDetail');
        return;
      }

      printAnchor('OpenDetail', openResult.anchor);
      console.log('   ✅ 详情页已打开\n');
    } else if (state.pageType === 'detail') {
      console.log('   ✅ 检测到当前已在详情页，直接进入评论展开验证');
    } else {
      console.error('❌ 当前页面无法识别为 search/detail/home，请先手动导航到搜索结果或详情页再运行 Phase 4');
      await printBrowserStatus('phase4-comments:unknown-state');
      return;
    }

    // 3/4. 预热 + 提取评论（统一由 CollectCommentsBlock 完成）
    console.log('3️⃣ 预热并提取评论列表...');
    const commentsResult = await collectComments({
      sessionId: PROFILE
    });

    if (!commentsResult.success) {
      console.error(`❌ 评论采集失败: ${commentsResult.error}`);
      printAnchor('CollectComments', commentsResult.anchor);
      await printBrowserStatus('phase4-comments:collectComments');
      return;
    }

    printAnchor('CollectComments', commentsResult.anchor);

    // 打印 CollectComments 的入口/出口锚点与步骤状态，便于对齐 workflow 规范
    if (commentsResult.entryAnchor) {
      console.log('\n[CollectComments:entryAnchor]');
      console.log(JSON.stringify(commentsResult.entryAnchor, null, 2));
    }
    if (commentsResult.exitAnchor) {
      console.log('\n[CollectComments:exitAnchor]');
      console.log(JSON.stringify(commentsResult.exitAnchor, null, 2));
    }
    if (Array.isArray(commentsResult.steps)) {
      console.log('\n[CollectComments:steps]');
      for (const step of commentsResult.steps) {
        console.log(
          `  - ${step.id}: ${step.status}`,
          step.error ? `error=${step.error}` : '',
        );
      }
    }
    console.log(`   ✅ 评论数: ${commentsResult.comments.length}`);
    console.log(
      `   ✅ 终止条件: ${
        commentsResult.reachedEnd ? 'THE END' : commentsResult.emptyState ? '空状态' : '未知'
      }`,
    );
    console.log(
      `   ✅ 示例评论: ${commentsResult.comments[0]?.text?.substring(0, 50) || '无'}\n`,
    );

    // 4.1 将本次评论结果持久化到本地，便于人工复核（Phase4 专用调试输出）
    await ensureDir(DATA_DIR);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(
      DATA_DIR,
      `phase4-comments-${PROFILE}-${ts}.json`,
    );
    const payload = {
      profile: PROFILE,
      url: await getCurrentUrl(),
      reachedEnd: commentsResult.reachedEnd,
      emptyState: commentsResult.emptyState,
      warmupCount: commentsResult.warmupCount,
      totalFromHeader: commentsResult.totalFromHeader,
      comments: commentsResult.comments,
    };
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`   💾 已保存本次评论结果: ${outputPath}\n`);

    // 4.2 可选：录制标准化 note fixture（仅在显式开启环境变量时启用）
    if (process.env.WEBAUTO_RECORD_FIXTURE === '1') {
      const noteId = extractNoteIdFromUrl(payload.url || '');
      if (noteId) {
        const fixtureData = {
          noteId,
          keyword: '',
          detailUrl: payload.url || '',
          detail: {}, // Phase4 仅测试评论，如需完整 detail 建议在 Phase3/collect-100 中录制
          commentsResult: commentsResult,
        };
        const fixtureRes = await recordFixture({
          platform: 'xiaohongshu',
          category: 'note',
          id: noteId,
          data: fixtureData,
        });
        if (fixtureRes.success) {
          console.log(`   💾 Fixture recorded: ${fixtureRes.path}`);
        } else {
          console.warn(`   ⚠️ RecordFixtureBlock failed: ${fixtureRes.error}`);
        }
      } else {
        console.warn('   ⚠️ 无法从当前 URL 提取 noteId，跳过 fixture 录制');
      }
    }

    // 5. 使用 ESC 模式退出详情页，回到搜索列表
    console.log('5️⃣ ESC 退出详情页，返回搜索列表...');
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
      await printBrowserStatus('phase4-comments:esc-exit-failed');
      return;
    }

    console.log(
      `   ✅ ESC 恢复成功，最终阶段=${recovery.finalStage}，method=${
        recovery.method || 'unknown'
      }`,
    );
    await printBrowserStatus('phase4-comments:after-esc-exit');

    console.log('✅ Phase 4 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    await printBrowserStatus('phase4-comments:exception');

    if (attempt >= 2) {
      console.error('❌ ESC 恢复后重试仍失败，放弃本次 Phase 4');
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
    await printBrowserStatus('phase4-comments:after-esc-recovery');

    // 恢复成功后，从搜索列表重新开始当前 Phase（只重试一次）
    return runPhase4(attempt + 1);
  }
}

async function main() {
  await runPhase4(1);
}

main().catch((err) => {
  console.error('❌ Phase4 未捕获异常:', err.message || err);
});
