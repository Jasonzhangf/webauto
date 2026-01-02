#!/usr/bin/env node
/**
 * container:match 回环测试
 * 1. 先确保有 weibo_fresh 会话
 * 2. 调用 /v1/container/match 拿容器树与 DOM
 * 3. 断言容器匹配到 weibo_main_page
 */

import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function ensureSession() {
  const list = await fetch(`${BASE}/v1/session/list`).then(r => r.json());
  const sessions = Array.isArray(list.sessions)
    ? list.sessions
    : Array.isArray(list.data?.sessions)
      ? list.data.sessions
      : [];
  if (!list.success || sessions.length === 0) {
    console.log('[ensure] 创建会话');
    const create = await fetch(`${BASE}/v1/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: PROFILE, url: 'https://weibo.com' })
    }).then(r => r.json());
    if (!create.success) throw new Error('无法创建会话');
  }
}

async function matchContainers() {
  const res = await fetch(`${BASE}/v1/container/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: PROFILE, url: "https://weibo.com" })
  });
  if (!res.ok) throw new Error(`container/match failed: ${res.status}`);
  return res.json();
}

async function run() {
  console.log('=== container:match 回环测试 ===');
  await ensureSession();
  const match = await matchContainers();
  assert.equal(match.success, true, 'match 应成功');
  assert.equal(match.data?.snapshot?.root_match?.container?.id, 'weibo_main_page', '根容器应为 weibo_main_page');
  assert.ok(Array.isArray(match.data?.snapshot?.container_tree?.children), '应有 children');
  assert.ok(Array.isArray(match.data?.snapshot?.dom_tree?.children), '应有 dom_tree');
  console.log('✅ container:match 回环测试通过');
}

run().catch(err => {
  console.error('❌ container:match 回环测试失败:', err);
  process.exit(1);
});
