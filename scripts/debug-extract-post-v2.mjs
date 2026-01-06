#!/usr/bin/env node
/**
 * 调试单个帖子提取功能 (v2: 使用递归查找)
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

function findContainerRecursively(snapshot, containerIdPart) {
  if (!snapshot) return null;
  
  // 检查直接子元素
  if (snapshot.children) {
    const found = snapshot.children.find(c => 
      (c.id && c.id.includes(containerIdPart)) || 
      (c.defId && c.defId.includes(containerIdPart))
    );
    if (found) return found;
    
    // 递归查找
    for (const child of snapshot.children) {
      const deepFound = findContainerRecursively(child, containerIdPart);
      if (deepFound) return deepFound;
    }
  }
  
  // 检查 dom_tree
  if (snapshot.dom_tree && snapshot.dom_tree.containers) {
    const found = snapshot.dom_tree.containers.find(c => 
      c.id && c.id.includes(containerIdPart)
    );
    if (found) return found;
  }
  
  return null;
}

async function main() {
  console.log('🔍 调试单个帖子提取 (v2)...');

  // 1. 匹配根容器
  const match = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: { profile: PROFILE, url: PAGE_URL }
  });
  const rootId = match.data?.container?.id;
  console.log(`✅ 根容器: ${rootId}`);

  // 2. 查找Feed列表
  const rootInspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: { profile: PROFILE, containerId: rootId, maxChildren: 50 }
  });
  
  // 尝试在顶层 children 中查找
  let feedList = rootInspect.data?.data?.snapshot?.children?.find(c => 
    c.id?.includes('feed_list') || c.defId?.includes('feed_list')
  );
  
  // 如果没找到，尝试在 dom_tree 中查找
  if (!feedList) {
    feedList = findContainerRecursively(rootInspect.data?.data?.snapshot, 'feed_list');
  }
  
  if (!feedList) {
    console.error('❌ 未找到Feed列表');
    // 输出 children 列表以供调试
    console.log('根容器子元素:');
    rootInspect.data?.data?.snapshot?.children?.forEach(c => {
      console.log(`  - ${c.id || c.defId}`);
    });
    return;
  }
  console.log(`✅ Feed列表: ${feedList.id || feedList.defId}`);

  // 3. 查找第一个帖子
  const listInspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: { profile: PROFILE, containerId: feedList.id || feedList.defId, maxChildren: 10 }
  });

  // 同样尝试递归查找帖子
  let firstPost = listInspect.data?.data?.snapshot?.children?.[0];
  if (!firstPost) {
    firstPost = findContainerRecursively(listInspect.data?.data?.snapshot, 'feed_post');
  }

  if (!firstPost) {
    console.error('❌ 未找到帖子');
    return;
  }
  
  const postId = firstPost.id || firstPost.defId;
  console.log(`✅ 第一个帖子: ${postId}`);

  // 4. 执行提取
  console.log('🔄 执行提取操作...');
  const extractRes = await post('/v1/controller/action', {
    action: 'container:operation',
    payload: {
      containerId: postId,
      operationId: 'extract',
      config: {
        fields: {
          author: "header a[href*='weibo.com']",
          content: "div[class*='detail_wbtext']",
          timestamp: "time",
          url: "a[href*='weibo.com'][href*='/status/']",
          authorUrl: "a[href*='weibo.com/u/']"
        },
        include_text: true
      },
      sessionId: PROFILE
    }
  });

  console.log('📄 提取结果:');
  console.log(JSON.stringify(extractRes, null, 2));
}

main().catch(console.error);
