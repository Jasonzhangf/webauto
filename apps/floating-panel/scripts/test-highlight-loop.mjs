#!/usr/bin/env node

/**
 * 完整高亮功能回环测试
 * 
 * 测试:
 * 1. 容器高亮（使用 selector）
 * 2. DOM 高亮（使用 dom path）
 * 3. 验证必须传 profile，不能使用默认值
 */

import fs from 'node:fs';

const LOG_FILE = '/tmp/webauto-highlight-loop-test.log';
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
  const json = await res.json();
  return { status: res.status, ok: res.ok, data: json };
}

async function get(url) {
  const res = await fetch(url);
  return res.json();
}

async function testHighlightLoop() {
  log('=== 高亮功能完整回环测试 ===\n');
  
  // 清空日志
  try {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
  } catch {}

  let passed = 0;
  let failed = 0;

  // Step 1: 获取活跃会话
  log('[Step 1] 获取活跃会话...');
  const sessions = await get(`${API_BASE}/v1/session/list`);
  const profileId = sessions?.sessions?.[0]?.profileId || 
                    sessions?.data?.sessions?.[0]?.profileId;
  
  if (!profileId) {
    log('❌ 测试中止: 没有活跃会话');
    return false;
  }
  
  log(`✅ 找到活跃会话: ${profileId}\n`);

  // Test 1: 容器高亮（使用 selector）
  log('[Test 1] 容器高亮 - 带 profile');
  const containerResult = await post(`${API_BASE}/v1/browser/highlight`, {
    profile: profileId,
    selector: 'body',
    options: {
      style: '2px solid rgba(76, 175, 80, 0.95)',
      channel: 'container',
      sticky: true
    }
  });
  
  if (containerResult.ok && containerResult.data.success) {
    log('✅ 容器高亮成功');
    passed++;
  } else {
    log(`❌ 容器高亮失败: ${JSON.stringify(containerResult.data)}`);
    failed++;
  }

  // Test 2: DOM 高亮（使用 dom path）
  log('\n[Test 2] DOM 高亮 - 带 profile');
  const domResult = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile: profileId,
    path: 'root/0/0',
    options: {
      style: '2px solid rgba(33, 150, 243, 0.95)',
      channel: 'dom',
      sticky: true
    }
  });
  
  if (domResult.ok && domResult.data.success) {
    log('✅ DOM 高亮成功');
    passed++;
  } else {
    log(`❌ DOM 高亮失败: ${JSON.stringify(domResult.data)}`);
    failed++;
  }

  // Test 3: 验证不带 profile 必须失败
  log('\n[Test 3] 容器高亮 - 不带 profile（应该失败）');
  const noProfileResult = await post(`${API_BASE}/v1/browser/highlight`, {
    selector: 'body',
    options: {
      style: '2px solid red',
      channel: 'test'
    }
  });
  
  if (!noProfileResult.ok || !noProfileResult.data.success) {
    log('✅ 正确拒绝了没有 profile 的请求');
    passed++;
  } else {
    log('❌ 错误: 不带 profile 的请求不应该成功');
    failed++;
  }

  // Test 4: 验证 DOM 路径不带 profile 必须失败
  log('\n[Test 4] DOM 高亮 - 不带 profile（应该失败）');
  const noDomProfileResult = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    path: 'root/0/0',
    options: { channel: 'test' }
  });
  
  if (!noDomProfileResult.ok || !noDomProfileResult.data.success) {
    log('✅ 正确拒绝了没有 profile 的 DOM 高亮请求');
    passed++;
  } else {
    log('❌ 错误: DOM 高亮不带 profile 的请求不应该成功');
    failed++;
  }

  // Summary
  log('\n=== 测试总结 ===');
  log(`通过: ${passed}`);
  log(`失败: ${failed}`);
  log(`总计: ${passed + failed}`);
  
  if (failed === 0) {
    log('\n✅ 所有测试通过！');
    return true;
  } else {
    log('\n❌ 有测试失败');
    return false;
  }
}

testHighlightLoop().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`\n[FATAL] ${err.message}`);
  console.error(err);
  process.exit(1);
});
