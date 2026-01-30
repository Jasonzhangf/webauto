#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 测试容器检查脚本
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

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
  try {
    console.log('Testing container inspection...');
    
    // 检查会话
    const sessions = await post('/v1/controller/action', {
      action: 'session:list',
      payload: {}
    });
    console.log('Sessions:', sessions);
    
    // 检查容器
    const inspect = await post('/v1/controller/action', {
      action: 'containers:inspect',
      payload: {
        profile: PROFILE,
        url: 'https://weibo.com/',
        maxDepth: 3,
        maxChildren: 10
      }
    });
    console.log('Container inspection result:', JSON.stringify(inspect, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
