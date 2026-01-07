#!/usr/bin/env node
/**
 * Phase 3: 详情页正文/图片提取（容器驱动版）
 */

import { execute as collectSearchList } from '../../../modules/workflow/blocks/CollectSearchListBlock.ts';
import { execute as openDetail } from '../../../modules/workflow/blocks/OpenDetailBlock.ts';
import { execute as extractDetail } from '../../../modules/workflow/blocks/ExtractDetailBlock.ts';

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
    console.warn('[phase3] detectPageState failed:', err.message);
    return { pageType: 'unknown', rootId: null, ids: [] };
  }
}

async function main() {
  console.log('📄 Phase 3: 详情页提取测试（容器驱动版）\n');

  try {
    console.log('0️⃣ 检查当前页面状态...');
    const state = await detectPageState();
    console.log(`   页面类型: ${state.pageType} (root=${state.rootId || '未知'})`);

    if (state.pageType === 'home') {
      console.error('❌ 当前在主页，请先通过 Phase 2 进入搜索页并点击打开一条详情');
      await printBrowserStatus('phase3-detail:wrong-state-home');
      return;
    }

    if (state.pageType === 'search') {
      // 从搜索页自动选一条，点击进入详情
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
  }
}

main();
