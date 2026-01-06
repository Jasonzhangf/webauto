#!/usr/bin/env node
/**
 * 分析微博DOM结构，理解动态容器匹配机制
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function analyzeDOMStructure() {
  console.log('');
  console.log('█'.repeat(60));
  console.log('█  分析微博DOM结构 - 理解动态容器机制');
  console.log('█'.repeat(60));
  console.log('');

  // 1. 获取根容器
  log('ROOT', '获取根容器...');
  const rootMatch = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: { profile: PROFILE, url: PAGE_URL }
  });

  if (!rootMatch.data?.matched) {
    log('ERROR', '根容器匹配失败');
    return;
  }

  const rootId = rootMatch.data.container.id;
  log('SUCCESS', `根容器: ${rootId}`);

  // 2. 检查根容器的子容器
  log('CHILDREN', '获取根容器子元素...');
  const rootInspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId: rootId,
      maxChildren: 10
    }
  });

  const rootChildren = rootInspect.data?.data?.snapshot?.children || [];
  log('INFO', `根容器子元素数量: ${rootChildren.length}`);

  rootChildren.forEach((child, i) => {
    log('CHILD', `${i+1}. ${child.id || child.defId} (type: ${child.type})`);
  });

  // 3. 检查是否有feed_list
  const feedList = rootChildren.find(c => 
    (c.id && c.id.includes('feed_list')) || 
    (c.defId && c.defId.includes('feed_list'))
  );

  if (!feedList) {
    log('ERROR', '未找到feed_list容器');
    return;
  }

  log('SUCCESS', `Feed列表: ${feedList.id || feedList.defId}`);

  // 4. 检查feed_list的子容器（应该是posts）
  log('POSTS', '获取Feed列表子元素...');
  const feedListInspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId: feedList.id || feedList.defId,
      maxChildren: 10
    }
  });

  const posts = feedListInspect.data?.data?.snapshot?.children || [];
  log('INFO', `帖子容器数量: ${posts.length}`);

  posts.forEach((post, i) => {
    log('POST', `${i+1}. ${post.id || post.defId} (type: ${post.type})`);
  });

  // 5. 检查第一个帖子的子容器（寻找expand_button）
  if (posts.length > 0) {
    const firstPost = posts[0];
    
    log('EXPAND', '检查第一个帖子的子容器...');
    const postInspect = await post('/v1/controller/action', {
      action: 'containers:inspect-container',
      payload: {
        profile: PROFILE,
        containerId: firstPost.id || firstPost.defId,
        maxChildren: 20
      }
    });

    const postChildren = postInspect.data?.data?.snapshot?.children || [];
    log('INFO', `帖子子容器数量: ${postChildren.length}`);

    postChildren.forEach((child, i) => {
      const hasExpand = (child.id || child.defId || '').includes('expand_button');
      const marker = hasExpand ? '🔥' : '  ';
      log('CHILD', `${marker} ${i+1}. ${child.id || child.defId} (type: ${child.type})`);

      // 展开动态容器的具体信息
      if (child.id && child.id.includes('child_')) {
        log('DETAIL', `  → 动态容器ID: ${child.id}`);
        if (child.metadata) {
          log('DETAIL', `  → Metadata: ${JSON.stringify(child.metadata).substring(0, 100)}...`);
        }
      }
    });

    // 6. 分析结论
    console.log('\n' + '='.repeat(60));
    console.log('📊 DOM结构分析结论');
    console.log('='.repeat(60));
    console.log('');

    if (postChildren.some(c => (c.id || c.defId || '').includes('expand_button'))) {
      console.log('✅ 发现固定展开按钮容器');
      console.log('   说明: 我们的expand_button容器定义被正确匹配');
    } else {
      console.log('❌ 未发现固定展开按钮容器');
      console.log('   说明: 展开按钮被识别为动态容器');
    }

    const dynamicChildren = postChildren.filter(c => 
      (c.id || c.defId || '').includes('child_')
    );

    if (dynamicChildren.length > 0) {
      console.log('');
      console.log('📋 动态容器列表:');
      dynamicChildren.forEach((child, i) => {
        console.log(`   ${i+1}. ${child.id || child.defId}`);
        if (child.metadata?.alias) {
          console.log(`      别名: ${child.metadata.alias}`);
        }
      });
      console.log('');
      console.log('💡 动态容器的处理建议:');
      console.log('   1. 固定容器: 选择器明确匹配，如我们的expand_button');
      console.log('   2. 动态容器: 每次DOM变化生成新的ID，需要通过alias或metadata匹配');
      console.log('   3. 容器树: 固定容器可以定义为子容器，通过children数组声明');
    }

    // 7. 检查expand_button容器定义
    console.log('');
    console.log('🔍 检查expand_button容器定义...');
    const fs = await import('fs/promises');
    const expandButtonDef = await fs.readFile('container-library/weibo/weibo_main_page/feed_post/expand_button/container.json', 'utf-8');
    console.log(JSON.stringify(JSON.parse(expandButtonDef), null, 2));
    console.log('');
  }

  console.log('');
  console.log('='.repeat(60));
}

analyzeDOMStructure().catch(console.error);
