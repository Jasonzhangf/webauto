#!/usr/bin/env node
/**
 * BrowserHealthCommunicator 单元测试
 */

import assert from 'node:assert/strict';
import { BrowserHealthCommunicator } from '../src/health/communicator.mjs';

async function run() {
  console.log('=== BrowserHealthCommunicator 测试 ===');

  const communicator = new BrowserHealthCommunicator({ host: '127.0.0.1', port: 7704 });
  const result = await communicator.run();
  console.log('communicator result:', result);

  assert.equal(typeof result.ok, 'boolean');
  console.log('✅ BrowserHealthCommunicator 测试通过');
}

run().catch((err) => {
  console.error('❌ BrowserHealthCommunicator 测试失败:', err);
  process.exit(1);
});
