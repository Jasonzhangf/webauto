#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 调试单个帖子提取功能
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
  console.log('🔍 调试单个帖子提取...');

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
    payload: { profile: PROFILE, containerId: rootId, maxChildren: 20 }
  });
  
  const feedList = rootInspect.data?.data?.snapshot?.children?.find(c => 
    c.id?.includes('feed_list') || c.defId?.includes('feed_list')
  );
  
  if (!feedList) {
    console.error('❌ 未找到Feed列表');
    return;
  }
  console.log(`✅ Feed列表: ${feedList.id || feedList.defId}`);

  // 3. 查找第一个帖子
  const listInspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: { profile: PROFILE, containerId: feedList.id || feedList.defId, maxChildren: 10 }
  });

  const firstPost = listInspect.data?.data?.snapshot?.children?.[0];
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
