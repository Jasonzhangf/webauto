#!/usr/bin/env node
/**
 * BrowserContainerMatcher 单元测试（基于 Controller）
 */

import assert from 'node:assert/strict';
import { BrowserContainerMatcher } from '../src/container/matcher.mjs';

async function run() {
  console.log('=== BrowserContainerMatcher 测试（Controller） ===');

  const matcher = new BrowserContainerMatcher({ controller: { host: '127.0.0.1', port: 8970 } });

  // 这里只测试接口是否可调用
  const tree = await matcher.getContainerTree('weibo_fresh', { maxDepth: 1, maxChildren: 1 });
  console.log('container tree result:', tree);
  assert.equal(typeof tree.success, 'boolean');

  console.log('✅ BrowserContainerMatcher 测试通过');
}

run().catch((err) => {
  console.error('❌ BrowserContainerMatcher 测试失败:', err);
  process.exit(1);
});
