#!/usr/bin/env node
/**
 * 深入调试 Feed 列表内容 (v2: 修复API调用)
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';
const FEED_LIST_ID = 'weibo_main_page.feed_list';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('🔍 深入调试 Feed 列表内容 (v2)...');

  // 1. 匹配根容器（确保上下文正确）
  await post('/v1/controller/action', {
    action: 'containers:match',
    payload: { profile: PROFILE, url: PAGE_URL }
  });

  // 2. 尝试执行 find-child 操作
  console.log('\n🔄 尝试执行 find-child 操作...');
  const findRes = await post('/v1/controller/action', {
    action: 'container:operation',
    payload: {
      containerId: FEED_LIST_ID,
      operationId: 'find-child',
      config: { 
        container_id: 'weibo_main_page.feed_post' 
      },
      sessionId: PROFILE
    }
  });
  console.log('Find child 结果:', JSON.stringify(findRes, null, 2));

  // 3. 再次 Inspect Feed 列表
  console.log(`\n🔄 Inspect ${FEED_LIST_ID}...`);
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: { 
      profile: PROFILE, 
      containerId: FEED_LIST_ID, 
      maxChildren: 20 
    }
  });

  const snapshot = inspect.data?.data?.snapshot;
  
  if (snapshot?.children && snapshot.children.length > 0) {
    console.log(`✅ 找到 ${snapshot.children.length} 个子容器`);
    console.log('\n📋 子容器列表:');
    snapshot.children.forEach((child, i) => {
      console.log(`  ${i+1}. ${child.id || child.defId} (${child.type})`);
    });
  } else {
    console.log('❌ 未找到子容器');
  }
}

main().catch(console.error);
