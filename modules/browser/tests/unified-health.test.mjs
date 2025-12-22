#!/usr/bin/env node
/**
 * 统一健康检查模块测试
 */

import assert from 'node:assert/strict';
import { UnifiedHealthValidator } from '../src/health/unified-health.mjs';

async function run() {
  console.log('=== 统一健康检查模块测试 ===');

  const validator = new UnifiedHealthValidator({
    controller: { host: '127.0.0.1', port: 8970 },
    browser: { host: '127.0.0.1', port: 7704, wsHost: '127.0.0.1', wsPort: 8765 }
  });

  try {
    // 测试仅浏览器健康检查
    const browserOnly = await validator.performHealthCheck({
      browser: { timeoutMs: 2000 }
    });
    console.log('浏览器健康检查:', browserOnly.browser?.healthy);
    assert.equal(typeof browserOnly.browser?.healthy, 'boolean');
    assert.equal(typeof browserOnly.overall, 'boolean');

    console.log('✅ 统一健康检查模块测试通过');
  } catch (err) {
    console.error('❌ 统一健康检查模块测试失败:', err);
    process.exit(1);
  }
}

run();
