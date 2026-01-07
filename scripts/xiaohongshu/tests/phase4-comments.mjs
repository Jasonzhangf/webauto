#!/usr/bin/env node
/**
 * Phase 4: 评论展开测试（容器驱动版）
 */

import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.ts';
import { execute as openDetail } from '../../../modules/workflow/blocks/OpenDetailBlock.ts';
import { execute as warmupComments } from '../../../modules/workflow/blocks/WarmupCommentsBlock.ts';
import { execute as expandComments } from '../../../modules/workflow/blocks/ExpandCommentsBlock.ts';
import { execute as closeDetail } from '../../../modules/workflow/blocks/CloseDetailBlock.ts';

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

function printAnchor(tag, anchor) {
  if (!anchor) return;
  console.log(`\n[Anchor:${tag}]`);
  Object.entries(anchor).forEach(([key, value]) => {
    console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  });
}

async function detectPageState() {
  try {
    const matchResult = await postController('containers:match', {
      profile: PROFILE
    });
    const snapshot = matchResult.data?.snapshot || matchResult.snapshot || {};
    const tree = snapshot.container_tree;
    const rootId = snapshot.root_match?.container?.id || tree?.id || null;

    const ids = [];
    const collect = (node) => {
      if (!node) return;
      if (node.id) ids.push(node.id);
      if (Array.isArray(node.children)) {
        node.children.forEach(collect);
      }
    };
    collect(tree);

    const hasDetail = ids.includes('xiaohongshu_detail');
    const hasSearch = ids.includes('xiaohongshu_search');
    const hasHome = ids.includes('xiaohongshu_home');

    let pageType = 'unknown';
    if (hasDetail) pageType = 'detail';
    else if (hasSearch) pageType = 'search';
    else if (hasHome) pageType = 'home';

    return { pageType, rootId, ids };
  } catch (err) {
    console.warn('[phase4] detectPageState failed:', err.message);
    return { pageType: 'unknown', rootId: null, ids: [] };
  }
}

async function main() {
  console.log('💬 Phase 4: 评论展开测试（容器驱动版）\n');

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

    // 3. 预热评论区：滚动 + 自动展开（不做提取）
    console.log('3️⃣ 预热评论区（滚动 + 自动展开，不提取）...');
    const warmupResult = await warmupComments({
      sessionId: PROFILE,
      maxRounds: 6
    });

    if (!warmupResult.success) {
      console.error(`❌ 评论预热失败: ${warmupResult.error}`);
      printAnchor('WarmupComments', warmupResult.anchor);
      await printBrowserStatus('phase4-comments:warmupComments');
      return;
    }

    printAnchor('WarmupComments', warmupResult.anchor);
    console.log(`   ✅ 预热后已渲染评论数: ${warmupResult.finalCount} / ${warmupResult.totalFromHeader ?? '未知'}`);

    // 4. 纯提取评论（不再滚动/点击）
    console.log('4️⃣ 提取评论列表...');
    const commentsResult = await expandComments({
      sessionId: PROFILE
    });

    if (!commentsResult.success) {
      console.error(`❌ 评论展开失败: ${commentsResult.error}`);
      printAnchor('ExpandComments', commentsResult.anchor);
      await printBrowserStatus('phase4-comments:expandComments');
      return;
    }

    printAnchor('ExpandComments', commentsResult.anchor);
    console.log(`   ✅ 评论数: ${commentsResult.comments.length}`);
    console.log(`   ✅ 终止条件: ${commentsResult.reachedEnd ? 'THE END' : commentsResult.emptyState ? '空状态' : '未知'}`);
    console.log(`   ✅ 示例评论: ${commentsResult.comments[0]?.text?.substring(0, 50) || '无'}\n`);

    // 5. 关闭详情页
    console.log('5️⃣ 关闭详情页...');
    const closeResult = await closeDetail({
      sessionId: PROFILE
    });

    if (!closeResult.success) {
      console.error(`❌ 关闭详情页失败: ${closeResult.error}`);
      printAnchor('CloseDetail', closeResult.anchor);
      await printBrowserStatus('phase4-comments:closeDetail');
      return;
    }

    printAnchor('CloseDetail', closeResult.anchor);
    console.log(`   ✅ 关闭方式: ${closeResult.method}\n`);

    console.log('✅ Phase 4 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    await printBrowserStatus('phase4-comments:exception');
  }
}

main();
