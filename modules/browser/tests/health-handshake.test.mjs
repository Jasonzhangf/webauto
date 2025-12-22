#!/usr/bin/env node
/**
 * BrowserHealthHandshake 单元测试
 */

import assert from 'node:assert/strict';
import { BrowserHealthHandshake } from '../src/health/handshake.mjs';

async function run() {
  console.log('=== BrowserHealthHandshake 测试 ===');

  const handshake = new BrowserHealthHandshake({
    host: '127.0.0.1',
    port: 7704,
    healthTimeout: 5000,
    retryInterval: 500,
    maxRetries: 5,
  });

  const result = await handshake.run();
  console.log('handshake result:', result);

  assert.equal(typeof result.ok, 'boolean');
  if (result.ok) {
    assert.ok(result.health.ok);
    assert.ok(result.communication.ok);
  }

  console.log('✅ BrowserHealthHandshake 测试通过');
}

run().catch((err) => {
  console.error('❌ BrowserHealthHandshake 测试失败:', err);
  process.exit(1);
});
