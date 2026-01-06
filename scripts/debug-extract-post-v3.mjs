#!/usr/bin/env node
/**
 * 调试单个帖子提取功能 (v3: 手动指定Feed列表ID)
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';
const FEED_LIST_ID = 'weibo_main_page.feed_list'; // 手动指定ID

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
  console.log('🔍 调试单个帖子提取 (v3)...');

  // 1. 匹配根容器
  const match = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: { profile: PROFILE, url: PAGE_URL }
  });
  const rootId = match.data?.container?.id;
  console.log(`✅ 根容器: ${rootId}`);

  // 2. 直接 inspect Feed 列表
  console.log(`🔄 尝试 inspect Feed 列表: ${FEED_LIST_ID}`);
  const listInspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: { profile: PROFILE, containerId: FEED_LIST_ID, maxChildren: 20 }
  });

  const posts = listInspect.data?.data?.snapshot?.children || [];
  console.log(`✅ 找到帖子数量: ${posts.length}`);

  if (posts.length === 0) {
    console.error('❌ 未找到帖子');
    console.log('Inspect结果:', JSON.stringify(listInspect.data, null, 2).substring(0, 500));
    return;
  }

  // 3. 获取第一个帖子ID
  const firstPost = posts[0];
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
