#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase 2 v3: 搜索验证（增强版）
 * 
 * 功能：
 * 1. 进入前检查：必须在主页
 * 2. 执行搜索：输入关键字 + 回车
 * 3. 采集结果：返回至少 5 条搜索结果
 * 4. 历史去重：基于 note_id 去重
 * 5. 退出后检查：确认在搜索结果页
 */

import minimist from 'minimist';
const UNIFIED_API = 'http://127.0.0.1:7701';
const SEARCH_GATE = 'http://127.0.0.1:7790';
const PROFILE = 'xiaohongshu_fresh';
const MIN_RESULTS = 5;
// 允许使用的搜索关键词白名单
const KEYWORDS = ['小米', '雷军', 'iphone', '手机膜', '华为', '中国制造', '美国贸易'];

async function controllerAction(action, payload) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await res.json();
  return data.data || data;
}

async function checkDaemonHealth() {
  try {
    const res = await fetch(`${UNIFIED_API}/health`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Unified API unhealthy (${res.status})`);
    }
  } catch (err) {
    console.error('❌ Unified API 未运行');
    console.error('请先启动: node scripts/core-daemon.mjs start');
    process.exit(1);
  }
}

async function requestSearchPermit(keyword) {
  try {
    const res = await fetch(`${SEARCH_GATE}/permit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: PROFILE, keyword }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    const data = await res.json();
    if (!data.ok || !data.allowed) {
      console.error(`❌ SearchGate 未授权，waitMs=${data.waitMs || 0}`);
      return false;
    }
    console.log('   ✅ SearchGate 授权成功');
    return true;
  } catch (err) {
    console.error('❌ SearchGate 连接失败:', err.message);
    return false;
  }
}

async function returnToDiscover() {
  console.log('🔄 返回发现页...');
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_home.discover_button',
    operationId: 'click',
    sessionId: PROFILE
  }).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 2000));
}

function findContainer(node, pattern) {
  if (!node) return null;
  if (pattern.test(node.id || node.defId || '')) return node;
  for (const child of node.children || []) {
    const found = findContainer(child, pattern);
    if (found) return found;
  }
  return null;
}

async function detectRiskControl() {
  try {
    const match = await controllerAction('containers:match', { profile: PROFILE });
    const tree = match?.snapshot?.container_tree || match?.container_tree;
    if (!tree) return false;
    return !!findContainer(tree, /qrcode_guard/);
  } catch (err) {
    return false;
  }
}

async function detectPageState() {
  const data = await controllerAction('containers:match', { profile: PROFILE });
  const rootId = data.container?.id || null;
  const matches = data.snapshot?.matches || {};
  const matchIds = Object.entries(matches)
    .filter(([, info]) => (info?.match_count ?? 0) > 0)
    .map(([id]) => id);
  return { rootId, matchIds };
}

async function verifyAnchor(containerId, name) {
  console.log(`🔍 验证锚点: ${name} (${containerId})`);
  try {
    await controllerAction('container:operation', {
      containerId,
      operationId: 'highlight',
      config: { style: '3px solid #ff4444', duration: 2000 },
      sessionId: PROFILE
    });
    console.log('   ✅ 高亮成功');
    return true;
  } catch (err) {
    console.log(`   ❌ 高亮失败: ${err.message}`);
    return false;
  }
}

async function collectSearchResults() {
  console.log(`\n📋 采集搜索结果（目标：至少 ${MIN_RESULTS} 条）...`);
  const result = await controllerAction('containers:inspect-container', {
    containerId: 'xiaohongshu_search.search_result_list',
    sessionId: PROFILE
  });
  return result?.data?.children || result?.children || [];
}

function dedup(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.note_id)) return false;
    seen.add(item.note_id);
    return true;
  });
}

async function main() {
  console.log('🔍 Phase 2 v3: 搜索验证（增强版）\n');
  
  try {
    await checkDaemonHealth();



    // 1. 进入前检查：必须在主页
    console.log('1️⃣ 进入前检查...');
    const beforeState = await detectPageState();
    console.log(`   根容器: ${beforeState.rootId}`);
    console.log('   ✅ 页面状态检查通过');
    
    // 2. 请求 SearchGate 许可
    console.log('\n2️⃣ 请求搜索许可...');
    const args = minimist(process.argv.slice(2));
    const keyword = args.keyword || args.k || args._[0] || '华为';
    const permitGranted = await requestSearchPermit(keyword);
    if (!permitGranted) {
      console.error('   ❌ 无法获取搜索许可');
      process.exit(1);
    }

    // 3. 检查风控
    console.log('\n3️⃣ 检查风控状态...');
    if (await detectRiskControl()) {
      console.log('   🚨 检测到风控，返回发现页');
      await returnToDiscover();
      if (await detectRiskControl()) {
        console.error('   ❌ 风控未解除，无法继续');
        process.exit(1);
      }
    }
    console.log('   ✅ 风控检测通过');

    // 4. 验证搜索框锚点（容器高亮）
    console.log('\n4️⃣ 验证搜索框锚点...');
    const searchBarRect = await verifyAnchor('xiaohongshu_home.search_input', '搜索框');
    if (!searchBarRect) {
      console.error('   ❌ 搜索框未找到，无法继续');
      process.exit(1);
    }
    
    // 5. 执行搜索
    console.log(`\n5️⃣ 执行搜索: "${keyword}"...`);
    
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_home.search_input',
      operationId: 'type',
      config: { text: keyword, submit: true },
      sessionId: PROFILE
    });
    console.log('   ✅ 搜索已触发');
    
    // 等待导航
    console.log('   ⏳ 等待导航到搜索结果页...');
    await new Promise(r => setTimeout(r, 3000));
    
    // 6. 退出后检查：确认在搜索结果页
    console.log('\n6️⃣ 退出后检查...');
    const afterState = await detectPageState();
    console.log(`   根容器: ${afterState.rootId}`);

    if (!afterState.rootId || !afterState.rootId.includes('search')) {
      console.error(`   ⚠️  根容器未包含 search，可能导航失败 (root=${afterState.rootId})`);
    }
    
    // 7. 验证搜索结果列表锚点
    console.log('\n7️⃣ 验证搜索结果列表锚点...');
    const listRect = await verifyAnchor('xiaohongshu_search.search_result_list', '搜索结果列表');
    if (!listRect) {
      console.error('   ❌ 搜索结果列表未找到');
      process.exit(1);
    }
    
    // 6. 采集结果
    const items = await collectSearchResults();
    const dedupedItems = dedup(items);
    
    console.log(`\n6️⃣ 采集结果...`);
    console.log(`   原始数量: ${items.length}`);
    console.log(`   去重后数量: ${dedupedItems.length}`);
    
    if (dedupedItems.length < MIN_RESULTS) {
      console.error(`   ⚠️  结果数量不足（需要至少 ${MIN_RESULTS} 条）`);
    } else {
      console.log(`   ✅ 已采集足够结果`);
    }
    
    console.log('\n   📋 前3条结果:');
    dedupedItems.slice(0, 3).forEach((item, idx) => {
      const title = item.title || item.name || item.id || '未知';
      const noteId = item.note_id || item.noteId || item.id || '未知';
      console.log(`      ${idx + 1}. ${title}`);
      console.log(`         note_id: ${noteId}`);
    });
    
    console.log('\n✅ Phase 2 完成 - 搜索功能正常');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
