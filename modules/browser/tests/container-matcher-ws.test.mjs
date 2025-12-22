#!/usr/bin/env node
/**
 * BrowserContainerMatcher WebSocket 单元测试
 */

import assert from 'node:assert/strict';
import { BrowserContainerMatcher } from '../src/container/matcher.mjs';

async function run() {
  console.log('=== BrowserContainerMatcher WebSocket 测试 ===');

  const matcher = new BrowserContainerMatcher({ controller: { host: '127.0.0.1', port: 8970 } });

  try {
    // 连接 Controller WebSocket
    await matcher.ensureConnected();
    console.log('✅ WebSocket 连接成功');

    // 测试容器树
    const tree = await matcher.getContainerTree('weibo_fresh', { maxDepth: 1, maxChildren: 1 });
    console.log('container tree result:', tree);
    assert.equal(typeof tree.success, 'boolean');

    console.log('✅ BrowserContainerMatcher WebSocket 测试通过');
  } finally {
    matcher.disconnect();
  }
}

run().catch((err) => {
  console.error('❌ BrowserContainerMatcher WebSocket 测试失败:', err);
  process.exit(1);
});
