#!/usr/bin/env node
/**
 * 调试根容器inspect结果
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

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
  console.log('调试根容器inspect结果\n');

  // 1. 获取根容器ID
  const match = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      url: PAGE_URL
    }
  });

  console.log('根容器匹配结果:');
  console.log(JSON.stringify(match, null, 2));
  console.log('');

  const rootId = match.data?.container?.id;
  if (!rootId) {
    console.error('未找到根容器');
    return;
  }

  console.log('根容器ID:', rootId);
  console.log('');

  // 2. Inspect根容器
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId: rootId,
      maxChildren: 20
    }
  });

  console.log('根容器inspect结果:');
  console.log(JSON.stringify(inspect, null, 2));
  console.log('');

  const snapshot = inspect.data?.data?.snapshot;
  console.log('Snapshot结构:');
  console.log('  container_tree?.containers?:', snapshot?.container_tree?.containers?.length);
  console.log('  children?:', snapshot?.children?.length);
  console.log('');

  // 3. 列出所有子容器
  if (snapshot?.children) {
    console.log('子容器列表:');
    snapshot.children.forEach((child, i) => {
      console.log(`  ${i+1}. ${child.id || child.defId} (type: ${child.type})`);
    });
  }

  // 4. 查找包含feed的容器
  if (snapshot?.children) {
    const feedChildren = snapshot.children.filter(c => 
      (c.id && c.id.includes('feed')) || 
      (c.defId && c.defId.includes('feed'))
    );
    console.log('');
    console.log('包含"feed"的子容器:');
    if (feedChildren.length > 0) {
      feedChildren.forEach((child, i) => {
        console.log(`  ${i+1}. ${child.id || child.defId}`);
      });
    } else {
      console.log('  无');
    }
  }
}

main().catch(console.error);
