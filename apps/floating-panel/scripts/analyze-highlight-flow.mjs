#!/usr/bin/env node

/**
 * 分析高亮流程 - 容器 vs DOM
 */

import fs from 'node:fs';

const LOG_FILE = '/tmp/webauto-highlight-flow-analysis.log';
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
  log(`\nPOST ${url}`);
  log(`Body: ${JSON.stringify(body, null, 2)}`);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const text = await res.text();
  log(`Response status: ${res.status}`);
  log(`Response: ${text}`);
  
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

async function analyzeFlow() {
  log('=== 高亮流程分析 ===\n');
  
  // Clear log
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

  // 分析 1: 容器高亮 (工作正常)
  log('\n=== 容器高亮流程 (工作正常) ===');
  log('UI 点击容器 → 使用 selector (CSS 选择器)');
  log('例如: article[class*=\'Feed_wrap_\']');
  
  const containerResult = await post(`${API_BASE}/v1/browser/highlight`, {
    profile: profileId,
    selector: 'body',
    options: {
      style: '2px solid rgba(76, 175, 80, 0.95)',
      channel: 'container',
      sticky: true
    }
  });
  
  log(`\n容器高亮结果: ${containerResult.data.success ? '成功' : '失败'}`);
  if (containerResult.data.success) {
    log(`匹配数: ${containerResult.data.data?.details?.count || 0}`);
  }

  // 分析 2: DOM 高亮 (不工作)
  log('\n=== DOM 高亮流程 (不工作) ===');
  log('UI 点击 DOM 节点 → 使用 path (路径)');
  log('例如: root/1/1/0/0/0/0/1/2/0/0/0/0/0/1/0/0');
  log('问题: 这个路径可能是从快照获取的，而非实时 DOM');
  
  const domResult = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile: profileId,
    path: 'root/1',
    options: {
      style: '2px solid rgba(33, 150, 243, 0.95)',
      channel: 'dom',
      sticky: true
    }
  });
  
  log(`\nDOM 高亮结果: ${domResult.data.success ? '成功' : '失败'}`);
  if (domResult.data.success) {
    log(`匹配数: ${domResult.data.data?.details?.count || 0}`);
  }
  
  log('\n=== 关键发现 ===');
  log('容器高亮: count > 0 (使用 CSS 选择器，实时查询)');
  log('DOM 高亮: count = 0 (使用快照路径，页面动态更新后路径无效)');
  log('\n根本问题:');
  log('1. DOM 路径来自快照，而快照可能是旧的');
  log('2. 页面 DOM 结构动态变化后，路径不再有效');
  log('3. 需要将 DOM 路径转换为 CSS 选择器，或者实时重新获取路径');

  return true;
}

analyzeFlow().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`\n[FATAL] ${err.message}`);
  console.error(err);
  process.exit(1);
});
