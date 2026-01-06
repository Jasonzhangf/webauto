#!/usr/bin/env node
/**
 * 检查API响应结构
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // 1. 容器匹配
  const match = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: { profile: PROFILE, url: PAGE_URL }
  });
  console.log('=== containers:match 响应结构 ===');
  console.log(JSON.stringify(match, null, 2));
  console.log('');

  // 2. inspect容器
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: { profile: PROFILE, containerId: match.data?.container?.id, maxChildren: 20 }
  });
  console.log('=== containers:inspect-container 响应结构 ===');
  console.log(JSON.stringify(inspect, null, 2));
  console.log('');

  // 3. 检查结构路径
  console.log('=== 结构路径分析 ===');
  console.log('match.data:', match.data ? 'exists' : 'null');
  console.log('inspect.data:', inspect.data ? 'exists' : 'null');
  console.log('inspect.data.data:', inspect.data?.data ? 'exists' : 'null');
  console.log('inspect.data.snapshot:', inspect.data?.snapshot ? 'exists' : 'null');
  console.log('inspect.data.data.snapshot:', inspect.data?.data?.snapshot ? 'exists' : 'null');
}

main().catch(console.error);
