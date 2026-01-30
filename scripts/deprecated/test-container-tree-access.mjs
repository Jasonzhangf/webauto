#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 测试如何访问容器树结构
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

async function test() {
  console.log('');
  console.log('█'.repeat(60));
  console.log('█  容器树结构访问测试');
  console.log('█'.repeat(60));
  console.log('');

  try {
    // 1. 获取根容器
    const match = await post('/v1/controller/action', {
      action: 'containers:match',
      payload: {
        profile: PROFILE,
        url: PAGE_URL
      }
    });

    const rootId = match.data?.container?.id;
    log('ROOT', `根容器ID: ${rootId}`);

    // 2. Inspect 根容器
    const inspect = await post('/v1/controller/action', {
      action: 'containers:inspect-container',
      payload: {
        profile: PROFILE,
        containerId: rootId,
        maxChildren: 50
      }
    });

    const snapshot = inspect.data?.data?.snapshot;

    // 3. 分析返回的数据结构
    console.log('');
    console.log('📊 返回的数据结构分析:');
    console.log('');

    if (snapshot.dom_tree) {
      console.log('✅ 存在 dom_tree');
      console.log(`   类型: ${typeof snapshot.dom_tree}`);
      console.log(`   根ID: ${snapshot.dom_tree.id}`);
      console.log(`   名称: ${snapshot.dom_tree.name}`);
      console.log(`   容器数量: ${snapshot.dom_tree.containers?.length || 0}`);
    }

    if (snapshot.children) {
      console.log('✅ 存在 children (简单数组)');
      console.log(`   类型: ${typeof snapshot.children}`);
      console.log(`   数量: ${snapshot.children.length}`);
    } else {
      console.log('❌ 不存在 children 简单数组');
    }

    if (snapshot.container_tree) {
      console.log('✅ 存在 container_tree');
      console.log(`   类型: ${typeof snapshot.container_tree}`);
    }

    // 4. 尝试从 dom_tree 中提取 feed_list
    if (snapshot.dom_tree?.containers) {
      const feedList = snapshot.dom_tree.containers.find(c =>
        c.id && c.id.includes('feed_list')
      );

      if (feedList) {
        log('FEED', `找到Feed列表: ${feedList.id}`);
        console.log(`   match_count: ${feedList.match_count}`);
        console.log(`   类型: ${feedList.type}`);
        console.log(`   有nodes: ${!!feedList.nodes}`);

        if (feedList.nodes && feedList.nodes.length > 0) {
          const firstNode = feedList.nodes[0];
          console.log('');
          console.log('📋 Feed第一个节点:');
          console.log(`   dom_path: ${firstNode.dom_path}`);
          console.log(`   text: ${firstNode.textSnippet?.substring(0, 50)}...`);
          console.log(`   selector: ${firstNode.selector}`);
        }
      } else {
        log('ERROR', '未找到Feed列表');
      }
    }

    // 5. 尝试从第一个帖子中查找展开按钮
    if (snapshot.dom_tree?.containers) {
      const feedPost = snapshot.dom_tree.containers.find(c =>
        c.id && c.id.includes('feed_post')
      );

      if (feedPost && feedPost.nodes && feedPost.nodes.length > 0) {
        const firstPostNode = feedPost.nodes[0];
        log('POST', `找到Feed帖子: ${feedPost.id}`);
        console.log(`   match_count: ${feedPost.match_count}`);
        console.log(`   nodes数量: ${feedPost.nodes.length}`);

        // 查找子容器
        if (feedPost.nodes.some(n => n.id && n.id.includes('expand_button'))) {
          console.log('');
          console.log('✅ 发现展开按钮容器');
          const expandNodes = feedPost.nodes.filter(n => n.id && n.id.includes('expand_button'));
          console.log(`   数量: ${expandNodes.length}`);
          expandNodes.forEach((n, i) => {
            console.log(`   ${i+1}. ${n.id} - ${n.textSnippet}`);
          });
        } else {
          console.log('');
          console.log('❌ 未发现展开按钮容器');
        }
      }
    }

    // 6. 最终结论
    console.log('');
    console.log('='.repeat(60));
    console.log('📊 数据结构访问建议:');
    console.log('='.repeat(60));
    console.log('');
    console.log('1. 使用 snapshot.dom_tree.containers 访问容器');
    console.log('2. 使用 snapshot.dom_tree.containers[].nodes 访问节点');
    console.log('3. 检查 container.id 或 container.defId 来匹配容器');
    console.log('4. 动态子容器会作为独立容器出现在 nodes 数组中');
    console.log('');

  } catch (error) {
    log('ERROR', error.message);
    console.error(error);
    process.exit(1);
  }
}

test().catch(console.error);
