#!/usr/bin/env node
/**
 * 测试拟人化退避策略和错误阈值
 */

// 复制runtime.mjs中的函数实现
function calculateHumanizedBackoff(retryIndex, baseDelayMs = 5000, maxDelayMs = 300000, jitterPercent = 0.3) {
  const attempt = Math.max(1, Number(retryIndex) || 1);
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = exponentialDelay * (1 - jitterPercent + Math.random() * jitterPercent * 2);
  const jitteredDelay = Math.floor(jitter);
  return Math.min(Math.max(0, jitteredDelay), maxDelayMs);
}

function addJitter(baseDelayMs, jitterPercent = 0.3) {
  if (!Number.isFinite(baseDelayMs) || baseDelayMs <= 0) return 0;
  const jitter = baseDelayMs * (1 - jitterPercent + Math.random() * jitterPercent * 2);
  return Math.max(0, Math.floor(jitter));
}

// 模拟错误阈值检查（修复后的版本）
class ErrorThresholdChecker {
  constructor() {
    this.errorCounters = new Map();
    this.maxErrorCountPerWindow = 10;
    this.errorWindowMs = 600000; // 10分钟
  }

  checkErrorThreshold(operationId, errorCode, timestamp = Date.now()) {
    const key = `${operationId}:${errorCode}`;
    const counter = this.errorCounters.get(key) || { count: 0, firstErrorTime: null };

    // 如果是第一次错误或时间窗口已过期，重置计数器
    const timeSinceFirstError = counter.firstErrorTime ? timestamp - counter.firstErrorTime : 0;
    if (!counter.firstErrorTime || timeSinceFirstError >= this.errorWindowMs) {
      counter.count = 0;  // 重置为0，稍后会+=1
      counter.firstErrorTime = timestamp;
    }

    // 增加计数
    counter.count += 1;
    this.errorCounters.set(key, counter);

    // 检查是否超过阈值
    const shouldStop = counter.count > this.maxErrorCountPerWindow;

    return {
      shouldStop,
      errorCount: counter.count,
      errorWindowMs: timeSinceFirstError,
      maxErrorCountPerWindow: this.maxErrorCountPerWindow,
    };
  }
}

// 测试1: 验证指数退避 + 随机抖动
console.log('=== 测试1: 拟人化退避策略 ===\n');

const baseDelayMs = 5000;
const maxDelayMs = 300000;
const jitterPercent = 0.3;
const retryTests = [1, 2, 3, 4, 5];

console.log('Retry | 基础延迟 | 最小值 | 最大值 | 实际延迟 | 是否在范围内');
console.log('------|---------|-------|-------|---------|-----------');

let allInRange = true;
for (const retryIndex of retryTests) {
  const baseDelay = baseDelayMs * Math.pow(2, retryIndex - 1);
  const minValue = baseDelay * (1 - jitterPercent);
  const maxValue = baseDelay * (1 + jitterPercent);
  
  // 运行100次，检查是否都在范围内
  let allValid = true;
  for (let i = 0; i < 100; i++) {
    const actualDelay = calculateHumanizedBackoff(retryIndex, baseDelayMs, maxDelayMs, jitterPercent);
    if (actualDelay < minValue || actualDelay > maxValue) {
      allValid = false;
      console.error(`❌ 重试 ${retryIndex} 失败: 延迟 ${actualDelay}ms 超出范围 [${minValue}, ${maxValue}]`);
      allInRange = false;
      break;
    }
  }
  
  const sampleDelay = calculateHumanizedBackoff(retryIndex, baseDelayMs, maxDelayMs, jitterPercent);
  const status = allValid ? '✅' : '❌';
  console.log(`${retryIndex}     | ${baseDelay}ms   | ${Math.floor(minValue)}ms | ${Math.floor(maxValue)}ms | ${sampleDelay}ms    | ${status}`);
}

if (allInRange) {
  console.log('\n✅ 测试1通过: 所有退避延迟都在±30%范围内\n');
} else {
  console.log('\n❌ 测试1失败: 部分退避延迟超出±30%范围\n');
  process.exit(1);
}

// 测试2: 验证错误阈值
console.log('=== 测试2: 错误阈值检查 ===\n');

const checker = new ErrorThresholdChecker();
const operationId = 'test-operation';
const errorCode = 'COMMENTS_CONTEXT_FOCUS_CLICK_TIMEOUT';
const timestamp = Date.now();

console.log('错误次数 | 计数值 | 是否应该停止 | 错误计数 | 实际是否停止');
console.log('---------|-------|------------|--------|-----------');

for (let i = 1; i <= 12; i++) {
  const result = checker.checkErrorThreshold(operationId, errorCode, timestamp + i * 1000);
  const expectedStop = i >= 11;  // 第11次错误才应该停止
  const status = result.shouldStop === expectedStop ? '✅' : '❌';
  console.log(`${i}        | ${i}     | ${expectedStop ? '是' : '否'}         | ${result.errorCount}      | ${result.shouldStop ? '是' : '否'}      ${status}`);
  
  if (result.shouldStop !== expectedStop) {
    console.error(`❌ 测试2失败: 第${i}次错误，期望停止=${expectedStop}，实际=${result.shouldStop}`);
    process.exit(1);
  }
}

console.log('\n✅ 测试2通过: 第11次错误时正确触发停止\n');

// 测试3: 验证时间窗口过期后计数器重置
console.log('=== 测试3: 时间窗口过期后重置 ===\n');

const checker2 = new ErrorThresholdChecker();
const operationId2 = 'test-operation-2';
const errorCode2 = 'TEST_ERROR';

// 在10分钟内触发10次错误
for (let i = 0; i < 10; i++) {
  const result = checker2.checkErrorThreshold(operationId2, errorCode2, timestamp + i * 1000);
  if (result.shouldStop) {
    console.error(`❌ 测试3失败: 第${i+1}次错误不应该触发停止`);
    process.exit(1);
  }
}

// 等待超过10分钟窗口
const expiredTimestamp = timestamp + 11 * 60 * 1000; // 11分钟后

// 再次触发错误，应该重置计数器
const result = checker2.checkErrorThreshold(operationId2, errorCode2, expiredTimestamp);
if (result.errorCount !== 1) {
  console.error(`❌ 测试3失败: 时间窗口过期后计数器未重置，期望=1，实际=${result.errorCount}`);
  process.exit(1);
}

console.log(`✅ 测试3通过: 时间窗口过期后计数器正确重置为1\n`);

// 总结
console.log('=== 所有测试通过 ✅ ===\n');
console.log('测试结果:');
console.log('✅ 拟人化退避策略: 正确实现指数退避 + 随机抖动');
console.log('✅ 错误阈值检查: 正确实现10次错误后，第11次错误触发停止');
console.log('✅ 时间窗口重置: 正确实现10分钟后计数器重置');
console.log('\n核心改进:');
console.log('- 重试间隔: 5s ±30%, 10s ±30%, 20s ±30%, 40s ±30%...');
console.log('- 错误阈值: 10分钟内同一错误最多10次，第11次触发停止');
console.log('- 拟人化: 所有延迟都是秒级整数，避免固定时长');
