#!/usr/bin/env node
/**
 * BrowserService 通信模块单元测试
 */

import assert from 'node:assert/strict';
import { BrowserService } from '../src/service.mjs';

async function run() {
  console.log('=== BrowserService 通信模块测试 ===');

  // Check if service is running
  try {
    await fetch('http://127.0.0.1:7704/health');
  } catch (e) {
    console.log('[ensure] 无法连接到 BrowserService 服务，跳过测试');
    process.exit(0);
  }

  const service = new BrowserService({ host: '127.0.0.1', port: 7704 });

  // 1. 健康检查
  const health = await service.health();
  console.log('health:', health);
  assert.equal(typeof health.ok, 'boolean');

  // 2. getStatus
  const status = await service.getStatus();
  console.log('status:', status);
  assert.equal(status.success, true);
  assert.ok(Array.isArray(status.sessions));

  console.log('✅ BrowserService 测试通过');
}

run().catch((err) => {
  console.error('❌ BrowserService 测试失败:', err);
  process.exit(1);
});
