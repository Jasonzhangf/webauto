#!/usr/bin/env node

/**
 * 实时 DOM 高亮测试 - 模拟 UI 点击 DOM 节点
 */

import fs from 'node:fs';

const LOG_FILE = '/tmp/webauto-dom-highlight-realtime.log';
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
  log(`Response body: ${text}`);
  
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    log(`Failed to parse JSON: ${e.message}`);
    return { status: res.status, ok: res.ok, data: { success: false, error: 'Invalid JSON' } };
  }
  
  return { status: res.status, ok: res.ok, data: json };
}

async function get(url) {
  const res = await fetch(url);
  return res.json();
}

async function testRealtime() {
  log('=== 实时 DOM 高亮测试 ===\n');
  
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

  // Test 1: DOM 高亮 - 完整模拟 UI 调用
  log('[Test 1] DOM 高亮 - 模拟 UI 点击 DOM 节点');
  log('这个测试完全模拟 graph.mjs 点击 DOM 节点时的调用');
  
  const domPath = 'root/1/1/0/0/0/0/1/2/0/0/0/0/0/1/0/0';
  log(`DOM 路径: ${domPath}`);
  log(`Profile: ${profileId}`);
  
  const result = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile: profileId,
    path: domPath,
    options: {
      style: '2px solid rgba(33, 150, 243, 0.95)', // 蓝色
      channel: 'dom',
      sticky: true
    }
  });
  
  if (result.ok && result.data.success) {
    log('\n✅ DOM 高亮 API 调用成功');
    log('Details:', JSON.stringify(result.data, null, 2));
    
    // 等待 2 秒让用户看到高亮效果
    log('\n请检查浏览器中是否有蓝色高亮框...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  } else {
    log('\n❌ DOM 高亮失败');
    log('Error:', result.data.error || 'Unknown');
    return false;
  }
}

testRealtime().then(success => {
  if (success) {
    log('\n测试完成 - 请人工确认浏览器中是否有蓝色高亮框');
  }
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`\n[FATAL] ${err.message}`);
  console.error(err);
  process.exit(1);
});
