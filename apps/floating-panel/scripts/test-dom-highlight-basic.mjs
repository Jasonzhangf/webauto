#!/usr/bin/env node

/**
 * 基础 DOM 高亮回环测试
 *
 * 测试流程:
 * 1. 检查服务是否运行
 * 2. 获取当前 session 列表
 * 3. 使用 DOM 路径高亮测试
 * 4. 验证高亮命令是否成功发送
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = '/tmp/webauto-dom-highlight-test.log';
const API_BASE = 'http://127.0.0.1:7701';

function log(msg) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${timestamp}] [dom-highlight-test] ${msg}\n`;
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {
    // Ignore errors
  }
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function testDomHighlight() {
  log('=== Starting DOM Highlight Basic Test ===');

  // Step 1: Check service health
  log('[Step 1] Checking service health...');
  const health = await get(`${API_BASE}/health`);
  log(`[Step 1] Health check: ${JSON.stringify(health)}`);

  // Step 2: Get session list to find active profile
  log('[Step 2] Getting session list...');
  const sessions = await get(`${API_BASE}/v1/session/list`);
  log(`[Step 2] Sessions: ${JSON.stringify(sessions)}`);

  const profileId = sessions?.data?.[0]?.profileId || sessions?.data?.[0]?.session_id || sessions?.data?.[0]?.id;

  if (!profileId) {
    log('[ERROR] No active session found - DOM highlight requires an active browser session');
    log('This is the root cause: UI is calling highlight without providing a profile');
    return false;
  }

  log(`[Step 2] Found active session: ${profileId}`);

  // Step 3: Test DOM path highlight with profile
  log('[Step 3] Testing DOM path highlight with profile...');
  const testPath = 'root/0/0';

  const highlightRes = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile: profileId,
    path: testPath,
    options: {
      style: '2px solid rgba(33, 150, 243, 0.95)',
      channel: 'dom',
      sticky: true
    }
  });

  log(`[Step 3] DOM path highlight result: ${JSON.stringify(highlightRes)}`);

  if (highlightRes.success) {
    log('✅ DOM highlight test PASSED');
    return true;
  }
  log('❌ DOM highlight test FAILED');
  return false;
}

// Run test
testDomHighlight().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`[FATAL] Test failed with error: ${err}`);
  process.exit(1);
});
