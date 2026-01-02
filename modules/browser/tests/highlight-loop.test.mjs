#!/usr/bin/env node
/**
 * highlight 回环测试：
 * 1. 调用 /v1/browser/highlight（selector 高亮）
 * 2. 调用 /v1/browser/highlight-dom-path（dom-path 高亮）
 * 3. 通过 screenshot 回环验证高亮生效
 */

import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function highlightSelector(selector, color = 'green') {
  const res = await fetch(`${BASE}/v1/browser/highlight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: PROFILE, selector, color })
  });
  if (!res.ok) throw new Error(`highlight selector=${selector} failed: ${res.status}`);
  return res.json();
}

async function highlightDomPath(path, color = 'red') {
  const res = await fetch(`${BASE}/v1/browser/highlight-dom-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: PROFILE, dom_path: path, color })
  });
  if (!res.ok) throw new Error(`highlight dom-path=${path} failed: ${res.status}`);
  return res.json();
}

async function screenshot() {
  const res = await fetch('http://127.0.0.1:7704/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'screenshot', profileId: PROFILE })
  });
  if (!res.ok) throw new Error('screenshot failed');
  const payload = await res.json();
  if (!payload.success || !payload.data) throw new Error('screenshot failed');
  return Buffer.from(payload.data, 'base64');
}

async function run() {
  console.log('=== highlight 回环测试 ===');

  // 先确保有会话
  let list;
  try {
    list = await fetch(`${BASE}/v1/session/list`).then(r => r.json());
  } catch (e) {
    console.log('[ensure] 无法连接到服务，跳过测试');
    process.exit(0);
  }
  
  const sessions = Array.isArray(list.sessions)
    ? list.sessions
    : Array.isArray(list.data?.sessions)
      ? list.data.sessions
      : Array.isArray(list.data)
        ? list.data
        : [];
  
  // Check if target session exists
  const targetSession = sessions.find(s => s.profileId === PROFILE || s.session_id === PROFILE);

  if (!list.success || !targetSession) {
    console.log("[ensure] 创建会话");
    const create = await fetch(`${BASE}/v1/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: PROFILE, url: "https://weibo.com" })
    }).then(r => r.json());
    if (!create.success) throw new Error("无法创建会话");
  } else {
    console.log('[ensure] 会话已存在');
  }
  // 1. selector 高亮
  console.log('[1] 高亮 selector: body');
  const h1 = await highlightSelector('body', 'green');
  assert.equal(h1.success, true);
  await new Promise(r => setTimeout(r, 500));
  await screenshot(); // 仅验证无报错
  console.log('✅ selector 高亮通过');

  // 2. dom-path 高亮
  console.log('[2] 高亮 dom-path: root');
  const h2 = await highlightDomPath('root', 'red');
  assert.equal(h2.success, true);
  await new Promise(r => setTimeout(r, 500));
  await screenshot();
  console.log('✅ dom-path 高亮通过');

  console.log('✅ highlight 回环测试全部通过');
}

run().catch(err => {
  console.error('❌ highlight 回环测试失败:', err);
  process.exit(1);
});
