#!/usr/bin/env node
/**
 * 测试单帖子错误阈值检查
 * 
 * 测试目标：
 * 1. 同一 operationId 的错误达到阈值后跳过
 * 2. 不同的 operationId 的错误不会相互影响
 * 3. 任务继续处理下一个帖子，不会停止整个任务
 */

// 模拟错误阈值检查（单帖子级别）
class SinglePostErrorThresholdChecker {
  constructor() {
    this.errorCounters = new Map();  // key: operationId, value: { errorCode: { count, firstErrorTime } }
    this.maxErrorCountPerWindow = 10;
    this.errorWindowMs = 600000; // 10分钟
  }

  checkErrorThreshold(operationId, errorCode, timestamp = Date.now()) {
    const counter = this.errorCounters.get(operationId) || {};
    const errorCounter = counter[errorCode] || { count: 0, firstErrorTime: null };

    // 如果是第一次错误或时间窗口已过期，重置计数器
    const timeSinceFirstError = errorCounter.firstErrorTime ? timestamp - errorCounter.firstErrorTime : 0;
    if (!errorCounter.firstErrorTime || timeSinceFirstError >= this.errorWindowMs) {
      errorCounter.count = 0;  // 重置为0，稍后会+=1
      errorCounter.firstErrorTime = timestamp;
    }

    // 增加计数
    errorCounter.count += 1;
    counter[errorCode] = errorCounter;
    this.errorCounters.set(operationId, counter);

    // 检查是否超过阈值
    const shouldSkip = errorCounter.count > this.maxErrorCountPerWindow;

    return {
      shouldSkip,  // 改为 shouldSkip，而不是 shouldStop
      errorCount: errorCounter.count,
      errorWindowMs: timeSinceFirstError,
      maxErrorCountPerWindow: this.maxErrorCountPerWindow,
    };
  }

  // 模拟处理单个帖子（可能重试多次）
  processSinglePost(post, maxRetries = 12) {
    let attempt = 0;
    let result = {
      postId: post.id,
      status: 'success',
      errorCount: 0,
      attempt: 0,
    };

    while (attempt < maxRetries) {
      attempt++;

      // 模拟总是失败
      const thresholdCheck = this.checkErrorThreshold(post.id, 'TEST_ERROR', Date.now() + attempt * 1000);
      
      if (thresholdCheck.shouldSkip) {
        result.status = 'skipped';
        result.errorCount = thresholdCheck.errorCount;
        result.attempt = attempt;
        return result;
      }
    }

    result.status = 'failed';
    result.attempt = attempt;
    return result;
  }

  // 模拟处理多个帖子
  processPosts(posts) {
    const results = [];
    for (const post of posts) {
      const result = this.processSinglePost(post, post.maxRetries || 12);
      results.push(result);
    }
    
    return results;
  }
}

console.log('=== 测试1: 同一 operationId 的错误达到阈值后跳过 ===\n');

const checker1 = new SinglePostErrorThresholdChecker();
const operationId1 = 'post-1';

console.log('错误次数 | 是否跳过 | 错误计数 | 状态');
console.log('---------|---------|---------|------');

let skippedAt11 = false;
for (let i = 1; i <= 12; i++) {
  const result = checker1.checkErrorThreshold(operationId1, 'TEST_ERROR', Date.now() + i * 1000);
  const status = result.shouldSkip ? '跳过' : '失败';
  if (result.shouldSkip && i === 11) {
    skippedAt11 = true;
  }
  console.log(`${i}        | ${result.shouldSkip ? '是' : '否'}      | ${result.errorCount}      | ${status}`);
}

if (skippedAt11) {
  console.log('\n✅ 测试1通过: 第11次错误时正确跳过该帖子\n');
} else {
  console.log('\n❌ 测试1失败: 第11次错误时未跳过该帖子\n');
  process.exit(1);
}

console.log('=== 测试2: 不同 operationId 的错误不会相互影响 ===\n');

const checker2 = new SinglePostErrorThresholdChecker();
const operationId2a = 'post-2a';
const operationId2b = 'post-2b';

// post-2a 失败11次
for (let i = 1; i <= 11; i++) {
  checker2.checkErrorThreshold(operationId2a, 'TEST_ERROR', Date.now() + i * 1000);
}

// post-2b 应该不受影响，第1次错误不应该跳过
const result2b = checker2.checkErrorThreshold(operationId2b, 'TEST_ERROR', Date.now() + 12000);

console.log('帖子     | 错误次数 | 是否跳过');
console.log('---------|---------|---------');
console.log(`post-2a  | 11      | 是`);
console.log(`post-2b  | 1       | ${result2b.shouldSkip ? '是' : '否'}`);

if (!result2b.shouldSkip) {
  console.log('\n✅ 测试2通过: 不同帖子的错误不会相互影响\n');
} else {
  console.log('\n❌ 测试2失败: 不同帖子的错误相互影响了\n');
  process.exit(1);
}

console.log('=== 测试3: 任务继续处理下一个帖子 ===\n');

const checker3 = new SinglePostErrorThresholdChecker();

// 模拟处理5个帖子
// post-1: 重试12次（前10次失败，第11次跳过）
// post-2: 重试12次（前10次失败，第11次跳过）
// post-3: 重试5次（失败，但未达到阈值）
// post-4: 重试1次（成功）
// post-5: 重试12次（前10次失败，第11次跳过）

const posts = [
  { id: 'post-1', maxRetries: 12 },  // 会在第11次跳过
  { id: 'post-2', maxRetries: 12 },  // 会在第11次跳过
  { id: 'post-3', maxRetries: 5 },   // 失败，但未达到阈值
  { id: 'post-4', maxRetries: 1 },   // 成功（模拟）
  { id: 'post-5', maxRetries: 12 },  // 会在第11次跳过
];

const results = checker3.processPosts(posts);

console.log('帖子     | 状态   | 错误次数 | 尝试次数');
console.log('---------|-------|---------|--------');
const statusCounts = { success: 0, failed: 0, skipped: 0 };
for (const result of results) {
  console.log(`${result.postId}  | ${result.status.padEnd(7)} | ${result.errorCount}      | ${result.attempt}`);
  statusCounts[result.status]++;
}

console.log('\n统计:');
console.log(`成功: ${statusCounts.success}`);
console.log(`失败: ${statusCounts.failed}`);
console.log(`跳过: ${statusCounts.skipped}`);

if (statusCounts.skipped >= 2 && statusCounts.failed >= 1) {
  console.log('\n✅ 测试3通过: 任务继续处理下一个帖子（既有跳过也有失败，任务未停止）\n');
} else {
  console.log('\n❌ 测试3失败: 任务没有正确处理所有帖子\n');
  process.exit(1);
}

console.log('=== 测试4: 时间窗口过期后计数器重置 ===\n');

const checker4 = new SinglePostErrorThresholdChecker();
const operationId4 = 'post-4';

// 在10分钟内触发10次错误
for (let i = 0; i < 10; i++) {
  const result = checker4.checkErrorThreshold(operationId4, 'TEST_ERROR', Date.now() + i * 1000);
  if (result.shouldSkip) {
    console.error(`❌ 测试4失败: 第${i+1}次错误不应该跳过`);
    process.exit(1);
  }
}

// 等待超过10分钟窗口
const expiredTimestamp = Date.now() + 11 * 60 * 1000; // 11分钟后

// 再次触发错误，应该重置计数器
const result = checker4.checkErrorThreshold(operationId4, 'TEST_ERROR', expiredTimestamp);
if (result.errorCount !== 1) {
  console.error(`❌ 测试4失败: 时间窗口过期后计数器未重置，期望=1，实际=${result.errorCount}`);
  process.exit(1);
}

console.log(`✅ 测试4通过: 时间窗口过期后计数器正确重置为1\n`);

// 总结
console.log('=== 所有测试通过 ✅ ===\n');
console.log('测试结果:');
console.log('✅ 单帖子错误阈值: ��一帖子错误达到阈值后跳过该帖子');
console.log('✅ 错误计数粒度: 不同帖子的错误不会相互影响');
console.log('✅ 任务连续性: 任务继续处理下一个帖子，不会停止整个任务');
console.log('✅ 时间窗口重置: 10分钟后计数器正确重置');
console.log('\n核心改进:');
console.log('- 错误阈值粒度: 单帖子级别（operationId），而非全局/���务级别');
console.log('- 错误处理策略: 跳过当前帖子（terminalState: skipped），继续下一个帖子');
console.log('- 任务连续性: 不会因为单个帖子的错误就停止整个任务');
console.log('- 拟人化: 模拟人类行为，遇到困难就跳过，继续下一个');
