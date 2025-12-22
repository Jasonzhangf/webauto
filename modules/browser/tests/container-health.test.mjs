#!/usr/bin/env node
/**
 * 容器健康检查模块测试
 */

import assert from 'node:assert/strict';
import { ContainerHealthValidator } from '../src/health/container-health.mjs';

async function run() {
  console.log('=== 容器健康检查模块测试 ===');

  const validator = new ContainerHealthValidator({
    controller: { host: '127.0.0.1', port: 8970 }
  });

  try {
    // 测试容器健康检查
    const result = await validator.checkContainerHealth('weibo_fresh', 'https://weibo.com');
    console.log('容器健康检查结果:', result);
    
    assert.equal(typeof result.success, 'boolean');
    assert.equal(result.profileId, 'weibo_fresh');
    assert.equal(result.url, 'https://weibo.com');

    // 测试验证方法
    const validation = await validator.validateContainerMatching('weibo_fresh', 'https://weibo.com');
    console.log('容器验证结果:', validation);
    
    assert.equal(typeof validation.healthy, 'boolean');
    assert(validation.result);

    console.log('✅ 容器健康检查模块测试通过');
  } catch (err) {
    console.error('❌ 容器健康检查模块测试失败:', err);
    process.exit(1);
  }
}

run();
