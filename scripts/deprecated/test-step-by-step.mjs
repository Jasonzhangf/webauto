#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 分步验证微博容器功能
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

async function test1_checkSession() {
  console.log('\n' + '='.repeat(60));
  console.log('测试1: 检查会话状态');
  console.log('='.repeat(60));

  const result = await post('/v1/controller/action', {
    action: 'session:list',
    payload: {}
  });

  const sessions = result.data?.data?.sessions || [];
  const weiboSession = sessions.find(s => s.profileId === PROFILE);

  if (weiboSession) {
    log('SUCCESS', `微博会话存在: ${weiboSession.current_url}`);
    return true;
  } else {
    log('WARNING', '微博会话不存在，需要创建');
    return false;
  }
}

async function test2_matchContainers() {
  console.log('\n' + '='.repeat(60));
  console.log('测试2: 容器匹配');
  console.log('='.repeat(60));

  const result = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      url: PAGE_URL
    }
  });

  if (result.data?.matched) {
    log('SUCCESS', `根容器匹配成功: ${result.data.container.id}`);
    return result.data.container.id;
  } else {
    log('FAILED', '根容器匹配失败');
    return null;
  }
}

async function test3_inspectContainer(containerId) {
  console.log('\n' + '='.repeat(60));
  console.log('测试3: 检查容器子元素');
  console.log('='.repeat(60));

  const result = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId,
      maxChildren: 50
    }
  });

  const snapshot = result.data?.data?.snapshot;
  const children = snapshot?.children || [];

  log('INFO', `容器ID: ${containerId}`);
  log('INFO', `子容器数量: ${children.length}`);
  
  children.forEach((child, i) => {
    const hasExpand = child.id?.includes('expand_button') || child.defId?.includes('expand_button');
    const marker = hasExpand ? '🔥' : '  ';
    log('CHILD', `${marker} ${i+1}. ${child.id || child.defId} (type: ${child.type})`);
  });

  return children;
}

async function test4_findExpandButton(children) {
  console.log('\n' + '='.repeat(60));
  console.log('测试4: 查找展开按钮');
  console.log('='.repeat(60));

  const expandButtons = children.filter(c => 
    c.id?.includes('expand_button') || c.defId?.includes('expand_button')
  );

  if (expandButtons.length > 0) {
    log('SUCCESS', `找到 ${expandButtons.length} 个展开按钮`);
    expandButtons.forEach((btn, i) => {
      log('EXPAND', `${i+1}. ${btn.id || btn.defId}`);
    });
    return expandButtons[0];
  } else {
    log('WARNING', '未找到展开按钮（可能当前页面没有需要展开的内容）');
    return null;
  }
}

async function test5_clickExpandButton(expandButton) {
  console.log('\n' + '='.repeat(60));
  console.log('测试5: 点击展开按钮');
  console.log('='.repeat(60));

  if (!expandButton) {
    log('SKIP', '跳过测试（无展开按钮）');
    return null;
  }

  try {
    const result = await post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: expandButton.id || expandButton.defId,
        operationId: 'click',
        config: { wait_after: 1000 },
        sessionId: PROFILE
      }
    });

    log('SUCCESS', '展开按钮点击成功');
    log('RESULT', JSON.stringify(result, null, 2));
    
    await sleep(2000); // 等待内容加载
    
    return result;
  } catch (error) {
    log('FAILED', `点击失败: ${error.message}`);
    return null;
  }
}

async function test6_extractPostAfterExpand(postId) {
  console.log('\n' + '='.repeat(60));
  console.log('测试6: 提取展开后的帖子内容');
  console.log('='.repeat(60));

  if (!postId) {
    log('SKIP', '跳过测试（无帖子ID）');
    return null;
  }

  try {
    const result = await post('/v1/controller/action', {
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

    const extracted = result.data?.data?.extracted?.[0];
    
    if (extracted) {
      log('SUCCESS', '帖子内容提取成功');
      log('AUTHOR', extracted.author || 'N/A');
      log('CONTENT', (extracted.content || extracted.text || 'N/A').substring(0, 100) + '...');
      log('URL', extracted.url || 'N/A');
    } else {
      log('FAILED', '未能提取到帖子内容');
    }

    return extracted;
  } catch (error) {
    log('FAILED', `提取失败: ${error.message}`);
    return null;
  }
}

async function test7_findFeedList(rootId) {
  console.log('\n' + '='.repeat(60));
  console.log('测试7: 查找Feed列表容器');
  console.log('='.repeat(60));

  const result = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId: rootId,
      maxChildren: 10
    }
  });

  const children = result.data?.data?.snapshot?.children || [];
  const feedList = children.find(c => 
    c.id?.includes('feed_list') || c.defId?.includes('feed_list')
  );

  if (feedList) {
    log('SUCCESS', `找到Feed列表: ${feedList.id || feedList.defId}`);
    return feedList;
  } else {
    log('FAILED', '未找到Feed列表容器');
    return null;
  }
}

async function test8_getFeedPosts(feedListId) {
  console.log('\n' + '='.repeat(60));
  console.log('测试8: 获取Feed帖子列表');
  console.log('='.repeat(60));

  if (!feedListId) {
    log('SKIP', '跳过测试（无Feed列表ID）');
    return [];
  }

  const result = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId: feedListId,
      maxChildren: 20
    }
  });

  const posts = result.data?.data?.snapshot?.children || [];
  
  log('SUCCESS', `找到 ${posts.length} 个帖子容器`);
  
  posts.slice(0, 5).forEach((post, i) => {
    log('POST', `${i+1}. ${post.id || post.defId}`);
  });

  return posts;
}

async function main() {
  console.log('');
  console.log('█'.repeat(60));
  console.log('█  微博容器功能分步验证测试');
  console.log('█'.repeat(60));

  try {
    // 测试1: 检查会话
    const hasSession = await test1_checkSession();

    // 测试2: 匹配容器
    const rootId = await test2_matchContainers();
    if (!rootId) throw new Error('容器匹配失败');

    // 测试7: 查找Feed列表
    const feedList = await test7_findFeedList(rootId);
    
    // 测试8: 获取Feed帖子
    const posts = await test8_getFeedPosts(feedList?.id || feedList?.defId);

    if (posts.length > 0) {
      // 测试3: 检查第一个帖子的子容器
      const firstPostChildren = await test3_inspectContainer(posts[0].id || posts[0].defId);

      // 测试4: 查找展开按钮
      const expandButton = await test4_findExpandButton(firstPostChildren);

      if (expandButton) {
        // 测试5: 点击展开按钮
        await test5_clickExpandButton(expandButton);

        // 测试6: 提取展开后的内容
        const parentPostId = (expandButton.id || expandButton.defId).replace('.expand_button', '');
        await test6_extractPostAfterExpand(parentPostId);
      }
    }

    // 最终报告
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试完成总结');
    console.log('='.repeat(60));
    console.log('✅ 会话检查: ' + (hasSession ? '通过' : '失败'));
    console.log('✅ 容器匹配: ' + (rootId ? '通过' : '失败'));
    console.log('✅ Feed列表: ' + (feedList ? '通过' : '失败'));
    console.log('✅ 帖子数量: ' + posts.length);
    console.log('');
    console.log('🎯 下一步: 基于验证结果实现事件驱动工作流');
    console.log('='.repeat(60));

  } catch (error) {
    log('ERROR', error.message);
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
