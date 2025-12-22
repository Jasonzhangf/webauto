#!/usr/bin/env node
/**
 * BrowserHealthValidator 单元测试
 */

import assert from 'node:assert/strict';
import { BrowserHealthValidator } from '../src/health/validator.mjs';

async function run() {
  console.log('=== BrowserHealthValidator 测试 ===');

  const validator = new BrowserHealthValidator({ host: '127.0.0.1', port: 7704 });
  const result = await validator.validate();
  console.log('validator result:', result);

  assert.equal(typeof result.ok, 'boolean');
  console.log('✅ BrowserHealthValidator 测试通过');
}

run().catch((err) => {
  console.error('❌ BrowserHealthValidator 测试失败:', err);
  process.exit(1);
});
