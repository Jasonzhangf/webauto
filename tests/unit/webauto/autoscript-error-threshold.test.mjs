#!/usr/bin/env node
/**
 * 单元测试：AutoscriptRunner 错误阈值检查
 * 
 * 测试目标：
 * 1. 同一 operationId 不同 errorCode 累计触发阈值后返回 skipped
 * 2. 不同 operationId 互不影响
 * 3. 达到��值后仍可继续运行下一 operation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// 模拟 AutoscriptRunner 的最小实现
class MockAutoscriptRunner {
  constructor(script = {}) {
    this.script = script;
    this.errorThresholds = {
      enableErrorThreshold: true,
      maxErrorCountPerWindow: 10,
      errorWindowMs: 600000, // 10分钟
    };
    this.errorCounters = new Map();
    this.logs = [];
  }

  log(event, data) {
    this.logs.push({ event, ...data });
  }

  // 复制 runtime.mjs 中的 checkErrorThreshold 函数
  checkErrorThreshold(operationId, errorCode, timestamp = Date.now()) {
    if (!this.errorThresholds.enableErrorThreshold) {
      return { 
        shouldSkip: false,  // ✅ 确保返回 shouldSkip
        errorCount: 0, 
        errorWindowMs: 0 
      };
    }

    // key 仅基于 operationId，errorCode 仅用于日志
    const key = operationId;
    const counter = this.errorCounters.get(key) || { count: 0, firstErrorTime: null, lastErrorCode: null };

    const timeSinceFirstError = counter.firstErrorTime ? timestamp - counter.firstErrorTime : 0;
    if (!counter.firstErrorTime || timeSinceFirstError >= this.errorThresholds.errorWindowMs) {
      counter.count = 0;
      counter.firstErrorTime = timestamp;
      counter.lastErrorCode = errorCode;
    }

    counter.count += 1;
    counter.lastErrorCode = errorCode;
    this.errorCounters.set(key, counter);

    const shouldSkip = counter.count > this.errorThresholds.maxErrorCountPerWindow;

    if (shouldSkip) {
      this.log('autoscript:error_threshold_exceeded', {
        operationId,
        errorCode,
        lastErrorCode: counter.lastErrorCode,
        errorCount: counter.count,
        errorWindowMs: timeSinceFirstError,
        maxErrorCountPerWindow: this.errorThresholds.maxErrorCountPerWindow,
      });
    } else {
      this.log('autoscript:error_threshold_checked', {
        operationId,
        errorCode,
        errorCount: counter.count,
        timeSinceFirstError,
      });
    }

    return {
      shouldSkip,
      errorCount: counter.count,
      errorWindowMs: timeSinceFirstError,
      maxErrorCountPerWindow: this.errorThresholds.maxErrorCountPerWindow,
    };
  }
}

describe('AutoscriptRunner 错误阈值检查', () => {
  let runner;

  beforeEach(() => {
    runner = new MockAutoscriptRunner();
  });

  afterEach(() => {
    runner = null;
  });

  it('测试1: 同一 operationId 不同 errorCode 累计触发阈值后返回 skipped', () => {
    const operationId = 'post-1';
    
    // 前10次错误，使用不同的 errorCode，都应该不触发 skip
    for (let i = 1; i <= 10; i++) {
      const errorCode = `ERROR_${i}`;
      const result = runner.checkErrorThreshold(operationId, errorCode, Date.now() + i * 1000);
      assert.strictEqual(result.shouldSkip, false, `第${i}次错误不应该触发跳过`);
      assert.strictEqual(result.errorCount, i, `第${i}次错误计数应该为${i}`);
    }
    
    // 第11次错误，应该触发 skip
    const result11 = runner.checkErrorThreshold(operationId, 'ERROR_11', Date.now() + 11000);
    assert.strictEqual(result11.shouldSkip, true, '第11次错误应该触发跳过');
    assert.strictEqual(result11.errorCount, 11, '第11次错误计数应该为11');
    
    // 检查日志
    const exceededLog = runner.logs.find(log => log.event === 'autoscript:error_threshold_exceeded');
    assert.ok(exceededLog, '应该有 error_threshold_exceeded 日志');
    assert.strictEqual(exceededLog.operationId, operationId);
    assert.strictEqual(exceededLog.lastErrorCode, 'ERROR_11');
  });

  it('测试2: 不同 operationId 互不影响', () => {
    const operationId1 = 'post-1';
    const operationId2 = 'post-2';
    
    // post-1 触发11次错误
    for (let i = 1; i <= 11; i++) {
      runner.checkErrorThreshold(operationId1, 'TEST_ERROR', Date.now() + i * 1000);
    }
    
    // post-2 触发1次错误，不应该触发 skip
    const result2 = runner.checkErrorThreshold(operationId2, 'TEST_ERROR', Date.now() + 12000);
    assert.strictEqual(result2.shouldSkip, false, 'post-2 第1次错误不应该触发跳过');
    assert.strictEqual(result2.errorCount, 1, 'post-2 错误计数应该为1');
    
    // ✅ 修改：直接检查 post-1 的错误计数器，避免重复调用导致计数增加
    const counter1 = runner.errorCounters.get(operationId1);
    assert.ok(counter1, 'post-1 应该有错误计数器');
    assert.strictEqual(counter1.count, 11, 'post-1 错误计数应该为11');
  });

  it('测试3: 时间窗口过期后计数器重置', () => {
    const operationId = 'post-1';
    
    // 在10分钟内触发10次错误
    for (let i = 0; i < 10; i++) {
      const result = runner.checkErrorThreshold(operationId, 'TEST_ERROR', Date.now() + i * 1000);
      assert.strictEqual(result.shouldSkip, false, `第${i+1}次错误不应该触发跳过`);
    }
    
    // 等待超过10分钟窗口
    const expiredTimestamp = Date.now() + 11 * 60 * 1000;
    
    // 再次触发错误，应该重置计数器
    const result = runner.checkErrorThreshold(operationId, 'TEST_ERROR', expiredTimestamp);
    assert.strictEqual(result.errorCount, 1, '时间窗口过期后计数器应该重置为1');
    assert.strictEqual(result.shouldSkip, false, '重置后的第1次错误不应该触发跳过');
  });

  it('测试4: 错误阈值可以禁用', () => {
    runner.errorThresholds.enableErrorThreshold = false;
    
    const operationId = 'post-1';
    
    // 触发20次错误，应该都不触发 skip
    for (let i = 1; i <= 20; i++) {
      const result = runner.checkErrorThreshold(operationId, 'TEST_ERROR', Date.now() + i * 1000);
      assert.strictEqual(result.shouldSkip, false, `第${i}次错误不应该触发跳过（阈值已禁用）`);
      assert.strictEqual(result.errorCount, 0, '错误计数应该始终为0（阈值已禁用）');
    }
  });

  it('测试5: 多个 operationId 并发错误，互不影响', () => {
    const operationIds = ['post-1', 'post-2', 'post-3', 'post-4', 'post-5'];
    
    // 每个 operationId 触发11次错误
    for (const operationId of operationIds) {
      for (let i = 1; i <= 11; i++) {
        runner.checkErrorThreshold(operationId, 'TEST_ERROR', Date.now() + i * 1000);
      }
    }
    
    // 验证每个 operationId 的错误计数都是11
    for (const operationId of operationIds) {
      const counter = runner.errorCounters.get(operationId);
      assert.ok(counter, `${operationId} 应该有错误计数器`);
      assert.strictEqual(counter.count, 11, `${operationId} 错误计数应该为11`);
    }
    
    // 验证每个 operationId 的错误都触发了 skip
    for (const operationId of operationIds) {
      const result = runner.checkErrorThreshold(operationId, 'TEST_ERROR', Date.now() + 12000);
      assert.strictEqual(result.shouldSkip, true, `${operationId} 应该已经触发跳过`);
    }
  });

  it('测试6: 达到阈值后仍可继续运行下一 operation', () => {
    const operationId1 = 'post-1';
    const operationId2 = 'post-2';
    
    // post-1 触发11次错误，应该触发 skip
    for (let i = 1; i <= 11; i++) {
      runner.checkErrorThreshold(operationId1, 'TEST_ERROR', Date.now() + i * 1000);
    }
    
    // ✅ 修改：直接检查 post-1 的错误计数器，避免重复调用导致计数增加
    const counter1 = runner.errorCounters.get(operationId1);
    assert.strictEqual(counter1.count, 11, 'post-1 错误计数应该为11');
    
    // post-2 只触发1次错误，不应该触发 skip
    const result2 = runner.checkErrorThreshold(operationId2, 'TEST_ERROR', Date.now() + 12000);
    assert.strictEqual(result2.shouldSkip, false, 'post-2 不应该触发跳过');
    assert.strictEqual(result2.errorCount, 1, 'post-2 错误计数应该为1');
    
    // 验证两个 operationId 都可以继续运行
    assert.strictEqual(runner.errorCounters.get(operationId1).count, 11, 'post-1 错误计数应该为11');
    assert.strictEqual(runner.errorCounters.get(operationId2).count, 1, 'post-2 错误计数应该为1');
  });
});

console.log('✅ 单元测试文件已更新');
