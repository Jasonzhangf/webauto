#!/usr/bin/env node
/**
 * 深入调试 Feed 列表内容
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
  console.log('🔍 深入调试 Feed 列表内容...');

  // 1. 匹配根容器（确保上下文正确）
  await post('/v1/controller/action', {
    action: 'containers:match',
    payload: { profile: PROFILE, url: PAGE_URL }
  });

  // 2. Inspect Feed 列表
  console.log(`🔄 Inspect ${FEED_LIST_ID}...`);
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: { 
      profile: PROFILE, 
      containerId: FEED_LIST_ID, 
      maxChildren: 20 
    }
  });

  const snapshot = inspect.data?.data?.snapshot;
  console.log('Snapshot keys:', Object.keys(snapshot || {}));
  
  if (snapshot?.container_tree) {
    console.log('✅ 存在 container_tree');
    console.log('类型:', snapshot.container_tree.type);
    console.log('子容器数量:', snapshot.container_tree.children?.length);
    
    if (snapshot.container_tree.children && snapshot.container_tree.children.length > 0) {
      console.log('\n📋 子容器列表:');
      snapshot.container_tree.children.forEach((child, i) => {
        console.log(`  ${i+1}. ${child.id || child.defId} (${child.type})`);
        if (child.metadata) {
          // console.log(`     Meta: ${JSON.stringify(child.metadata)}`);
        }
      });
    }
  }

  // 3. 尝试强制查找子元素
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

}

main().catch(console.error);
