#!/usr/bin/env node

/**
 * 完整的高亮诊断 - 容器 vs DOM
 */

import fs from 'node:fs';

const LOG_FILE = '/tmp/webauto-final-highlight-diagnosis.log';
const API_BASE = 'http://127.0.0.1:7701';

function log(msg) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${timestamp}] ${msg}\n`;
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {}
}

async function post(url, body) {
  log(`POST ${url}`);
  log(`Body: ${JSON.stringify(body, null, 2)}`);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const text = await res.text();
  log(`Response status: ${res.status}`);
  log(`Response: ${text}\n`);
  
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { status: res.status, ok: res.ok, data: { success: false, error: text } };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function get(url) {
  const res = await fetch(url);
  return res.json();
}

async function diagnose() {
  log('=== 完整高亮诊断 ===\n');
  
  try {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
  } catch {}

  // Get active session
  const sessions = await get(`${API_BASE}/v1/session/list`);
  const profileId = sessions?.sessions?.[0]?.profileId;
  
  if (!profileId) {
    log('❌ 没有活跃会话');
    return false;
  }
  
  log(`✅ 活跃会话: ${profileId}\n`);

  // Test 1: 容器高亮 - 使用 CSS 选择器
  log('=== Test 1: 容器高亮 (CSS 选择器) ===');
  const containerSelector = 'body';  // 使用最简单的选择器
  const containerResult = await post(`${API_BASE}/v1/browser/highlight`, {
    profile: profileId,
    selector: containerSelector,
    options: {
      style: '2px solid rgba(76, 175, 80, 0.95)',  // 绿色
      channel: 'container',
      sticky: true
    }
  });
  
  log(`容器高亮结果: ${containerResult.ok && containerResult.data.success ? '成功' : '失败'}`);
  if (containerResult.data.success) {
    log(`匹配元素数: ${containerResult.data.data?.details?.count || 0}`);
  }

  // Test 2: DOM 高亮 - 使用 DOM 路径
  log('=== Test 2: DOM 高亮 (DOM 路径) ===');
  const domPath = 'root/0';  // 使用最简单的路径
  const domResult = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile: profileId,
    path: domPath,
    options: {
      style: '2px solid rgba(33, 150, 243, 0.95)',  // 蓝色
      channel: 'dom',
      sticky: true
    }
  });
  
  log(`DOM 高亮结果: ${domResult.ok && domResult.data.success ? '成功' : '失败'}`);
  if (domResult.data.success) {
    log(`匹配元素数: ${domResult.data.data?.details?.count || 0}`);
  }

  // Test 3: 获取实时 DOM 树
  log('\n=== Test 3: 获取实时 DOM 树 ===');
  const treeResult = await post(`${API_BASE}/v1/controller/action`, {
    action: 'dom:branch:2',
    profile: profileId,
    url: sessions.sessions[0].current_url,
    path: 'root',
    maxDepth: 2,
    maxChildren: 5
  });
  
  if (treeResult.ok && treeResult.data.success) {
    log('✅ 获取 DOM 树成功');
    const node = treeResult.data.data?.node;
    if (node) {
      log(`根节点: ${node.path}, tag: ${node.tag}`);
      if (node.children && node.children.length > 0) {
        log(`子节点数: ${node.children.length}`);
        log('前3个子节点:');
        node.children.slice(0, 3).forEach((child, idx) => {
          log(`  [${idx}] ${child.path}, tag: ${child.tag}`);
        });
      }
    }
  } else {
    log('❌ 获取 DOM 树失败');
    log(`错误: ${treeResult.data.error}`);
  }

  // Summary
  log('\n=== 诊断总结 ===');
  
  const containerCount = containerResult.data.data?.details?.count || 0;
  const domCount = domResult.data.data?.details?.count || 0;
  
  log(`容器高亮 (body): ${containerCount > 0 ? '✅' : '❌'} count=${containerCount}`);
  log(`DOM 高亮 (root/0): ${domCount > 0 ? '✅' : '❌'} count=${domCount}`);
  
  if (containerCount === 0 && domCount === 0) {
    log('\n⚠️  两者都不工作！');
    log('可能原因:');
    log('1. 浏览器会话没有连接或页面未加载');
    log('2. WebSocket 通信失败');
    log('3. highlight runtime 未加载');
    return false;
  }
  
  if (containerCount > 0 && domCount === 0) {
    log('\n⚠️  容器高亮工作，DOM 高亮不工作！');
    log('可能原因:');
    log('1. DOM 路径过时（快照 vs 实时）');
    log('2. DOM 结构已变化，路径无效');
    log('3. 需要使用实时获取的路径');
    return false;
  }
  
  if (containerCount > 0 && domCount > 0) {
    log('\n✅ 两者都工作！');
    log('问题可能在 UI 传递了错误的路径或参数');
    return true;
  }

  return false;
}

diagnose().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`\n[FATAL] ${err.message}`);
  console.error(err);
  process.exit(1);
});
