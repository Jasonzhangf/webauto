#!/usr/bin/env node

/**
 * DOM 路径调试脚本 - 验证路径是否能正确解析
 */

import fs from 'node:fs';

const LOG_FILE = '/tmp/webauto-dom-path-debug.log';
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
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

async function debugDomPath() {
  log('=== DOM 路径解析调试 ===\n');
  
  // Clear log
  try {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
  } catch {}

  // Get active session
  log('[Step 1] 获取活跃会话...');
  const sessions = await get(`${API_BASE}/v1/session/list`);
  const profileId = sessions?.sessions?.[0]?.profileId;
  
  if (!profileId) {
    log('❌ 没有活跃会话');
    return false;
  }
  
  log(`✅ 活跃会话: ${profileId}\n`);

  // Test 1: 获取 DOM 树根节点
  log('[Test 1] 获取 DOM 树根节点');
  const rootResult = await post(`${API_BASE}/v1/dom/branch/2`, {
    profile: profileId,
    url: 'https://weibo.com/',
    path: 'root'
  });
  
  if (rootResult.ok && rootResult.data.success) {
    log('✅ 获取根节点成功');
    log(`根节点路径: ${rootResult.data.data.node?.path || 'N/A'}`);
    log(`根节点标签: ${rootResult.data.data.node?.tag || 'N/A'}`);
    log(`子节点数: ${rootResult.data.data.node?.children?.length || 0}`);
  } else {
    log('❌ 获取根节点失败');
    return false;
  }

  // Test 2: 获取下一级节点
  log('\n[Test 2] 获取下一级节点 (root/0)');
  const childResult = await post(`${API_BASE}/v1/dom/branch/2`, {
    profile: profileId,
    url: 'https://weibo.com/',
    path: 'root/0'
  });
  
  if (childResult.ok && childResult.data.success) {
    log('✅ 获取 child 节点成功');
    log(`路径: ${childResult.data.data.node?.path || 'N/A'}`);
    log(`标签: ${childResult.data.data.node?.tag || 'N/A'}`);
    log(`子节点数: ${childResult.data.data.node?.children?.length || 0}`);
  } else {
    log('❌ 获取 child 节点失败');
    log('Response:', JSON.stringify(childResult.data, null, 2));
  }

  // Test 3: 尝试我们之前测试的路径
  log('\n[Test 3] 测试具体路径 (root/1/1/0/0/0/0/1/2/0/0/0/0/0/1/0/0)');
  const specificPath = 'root/1/1/0/0/0/0/1/2/0/0/0/0/0/1/0/0';
  const specificResult = await post(`${API_BASE}/v1/dom/branch/2`, {
    profile: profileId,
    url: 'https://weibo.com/',
    path: specificPath
  });
  
  if (specificResult.ok && specificResult.data.success) {
    log('✅ 获取具体路径节点成功');
    log(`路径: ${specificResult.data.data.node?.path || 'N/A'}`);
    log(`标签: ${specificResult.data.data.node?.tag || 'N/A'}`);
    log(`ID: ${specificResult.data.data.node?.id || 'N/A'}`);
    log(`类: ${JSON.stringify(specificResult.data.data.node?.classes || [])}`);
  } else {
    log('❌ 获取具体路径节点失败');
    log('Response:', JSON.stringify(specificResult.data, null, 2));
  }

  // Test 4: 检查父路径是否存在
  log('\n[Test 4] 检查父路径 (root/1/1/0/0/0/0/1/2/0/0/0/0/0/1/0)');
  const parentPath = 'root/1/1/0/0/0/0/1/2/0/0/0/0/0/1/0';
  const parentResult = await post(`${API_BASE}/v1/dom/branch/2`, {
    profile: profileId,
    url: 'https://weibo.com/',
    path: parentPath
  });
  
  if (parentResult.ok && parentResult.data.success) {
    log('✅ 获取父路径节点成功');
    log(`路径: ${parentResult.data.data.node?.path || 'N/A'}`);
    log(`标签: ${parentResult.data.data.node?.tag || 'N/A'}`);
    log(`子节点数: ${parentResult.data.data.node?.children?.length || 0}`);
    if (parentResult.data.data.node?.children) {
      log('子节点:');
      parentResult.data.data.node.children.forEach((child, idx) => {
        log(`  [${idx}] path: ${child.path}, tag: ${child.tag}, id: ${child.id}`);
      });
    }
  } else {
    log('❌ 获取父路径节点失败');
    log('Response:', JSON.stringify(parentResult.data, null, 2));
  }

  return true;
}

debugDomPath().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`\n[FATAL] ${err.message}`);
  console.error(err);
  process.exit(1);
});
