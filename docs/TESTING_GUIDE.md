# WebAuto 测试指南

## 概述

本指南介绍如何在 WebAuto 项目中编写和运行测试。

## 测试层级

### 1. 单元测试 (Unit Tests)
测试单个组件或函数，不依赖外部服务。

**位置**: `tests/unit/`
**工具**: Node.js Test Runner
**执行时间**: < 1秒

```typescript
// tests/unit/operations/registry.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerOperation, getOperation } from '../../../modules/operations/src/registry.js';

describe('OperationRegistry', () => {
  it('should register and retrieve operation', () => {
    const testOp = {
      id: 'test-op',
      run: async (ctx, config) => ({ success: true })
    };
    registerOperation(testOp);
    const op = getOperation('test-op');
    assert.ok(op);
  });
});
```

### 2. 集成测试 (Integration Tests)
测试多个组件的交互，可能需要启动服务。

**位置**: `tests/integration/`
**工具**: Node.js + ESM
**执行时间**: 5-30秒

```javascript
// tests/integration/03-test-event-flow.test.mjs
#!/usr/bin/env node
import assert from 'node:assert/strict';
import { EventBus } from '../../libs/operations-framework/src/event-driven/EventBus.ts';

async function test() {
  const bus = new EventBus();
  let received = false;
  
  bus.on('test:event', () => { received = true; });
  await bus.emit('test:event', {});
  
  assert.ok(received);
  console.log('✅ Test passed');
  process.exit(0);
}

test();
```

### 3. E2E 测试 (End-to-End Tests)
测试完整的用户场景，需要完整的服务栈。

**位置**: `tests/e2e/`
**工具**: Playwright/Puppeteer
**执行时间**: 30-60秒

## 运行测试

### 快速测试（仅单元测试）
```bash
./scripts/quick-test.sh
# 或
node tests/runner/TestRunner.mjs --suite=unit
```

### 完整测试套件
```bash
./scripts/run-all-tests.sh
# 或
node tests/runner/TestRunner.mjs --all
```

### 运行特定套件
```bash
# 单元测试
node tests/runner/TestRunner.mjs --suite=unit

# 集成测试
node tests/runner/TestRunner.mjs --suite=integration

# E2E 测试
node tests/runner/TestRunner.mjs --suite=e2e
```

### 运行单个测试文件
```bash
# TypeScript 测试
npx tsx tests/unit/event-driven/EventBus.test.ts

# JavaScript 测试
node tests/integration/03-test-event-flow.test.mjs
```

## 编写测试

### 单元测试模板

```typescript
// tests/unit/module/Component.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentClass } from '../../../path/to/Component.js';

describe('ComponentClass', () => {
  let instance;

  beforeEach(() => {
    // Setup before each test
    instance = new ComponentClass();
  });

  afterEach(() => {
    // Cleanup after each test
    instance = null;
  });

  it('should create instance', () => {
    assert.ok(instance);
  });

  it('should perform action', async () => {
    const result = await instance.performAction();
    assert.equal(result.success, true);
  });
});

console.log('✅ ComponentClass tests completed');
```

### 集成测试模板

```javascript
// tests/integration/XX-test-feature.test.mjs
#!/usr/bin/env node
import assert from 'node:assert/strict';

function log(msg) {
  console.log(`[feature-test] ${msg}`);
}

async function test() {
  try {
    log('Step 1: Setup');
    // Setup code
    
    log('Step 2: Execute');
    // Test code
    
    log('Step 3: Verify');
    assert.ok(true);
    
    log('✅ Test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

test();
```

## 测试最佳实践

### 1. AAA 模式
- **Arrange**: 准备测试数据和环境
- **Act**: 执行被测试的操作
- **Assert**: 验证结果

```typescript
it('should calculate sum correctly', () => {
  // Arrange
  const a = 5;
  const b = 3;
  
  // Act
  const result = add(a, b);
  
  // Assert
  assert.equal(result, 8);
});
```

### 2. 测试隔离
每个测试应该独立运行，不依赖其他测试。

```typescript
describe('Counter', () => {
  let counter;
  
  beforeEach(() => {
    // 每个测试前重新创建实例
    counter = new Counter();
  });
  
  it('should start at zero', () => {
    assert.equal(counter.value, 0);
  });
  
  it('should increment', () => {
    counter.increment();
    assert.equal(counter.value, 1);
  });
});
```

### 3. 描述性测试名称
使用清晰的测试名称描述预期行为。

```typescript
// ❌ Bad
it('test1', () => { ... });

// ✅ Good
it('should emit event when container is discovered', () => { ... });
```

### 4. 测试边界条件
除了正常情况，还要测试边界和错误情况。

```typescript
describe('divide', () => {
  it('should divide positive numbers', () => {
    assert.equal(divide(10, 2), 5);
  });
  
  it('should handle division by zero', () => {
    assert.throws(() => divide(10, 0), /Division by zero/);
  });
  
  it('should handle negative numbers', () => {
    assert.equal(divide(-10, 2), -5);
  });
});
```

### 5. 使用 Mock 和 Stub
隔离外部依赖。

```typescript
it('should call external service', async () => {
  const mockService = {
    fetch: async () => ({ data: 'test' })
  };
  
  const result = await component.process(mockService);
  assert.equal(result.data, 'test');
});
```

## 测试工具

### Assertions
```typescript
import assert from 'node:assert/strict';

// 相等性
assert.equal(actual, expected);
assert.deepEqual(obj1, obj2);

// 真值
assert.ok(value);
assert.strictEqual(value, true);

// 异常
assert.throws(() => fn(), /error message/);
assert.rejects(async () => asyncFn(), /error message/);

// 类型
assert.ok(typeof value === 'string');
assert.ok(value instanceof Class);
```

### 异步测试
```typescript
// Promise
it('should resolve promise', async () => {
  const result = await asyncOperation();
  assert.ok(result);
});

// Error handling
it('should reject promise', async () => {
  await assert.rejects(
    async () => failingOperation(),
    /Expected error message/
  );
});
```

## 测试覆盖率

### 查看覆盖率
```bash
# 使用 c8 生成覆盖率报告
npx c8 node tests/runner/TestRunner.mjs --all
```

### 覆盖率目标
- 单元测试: > 80%
- 集成测试: > 70%
- 总体覆盖率: > 75%

## 调试测试

### 使用 console.log
```typescript
it('should debug test', () => {
  console.log('Debug info:', value);
  assert.ok(value);
});
```

### 使用 Node.js Debugger
```bash
# 使用 --inspect 标志
node --inspect tests/integration/03-test-event-flow.test.mjs

# 或使用 --inspect-brk 在第一行暂停
node --inspect-brk tests/integration/03-test-event-flow.test.mjs
```

### VSCode 调试配置
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Current Test",
  "program": "${file}",
  "skipFiles": ["<node_internals>/**"]
}
```

## CI/CD 集成

### GitHub Actions 示例
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
```

## 常见问题

### Q: 测试运行缓慢
A: 
- 检查是否有不必要的等待
- 使用并行测试
- Mock 外部服务

### Q: 测试间歇性失败
A:
- 检查测试隔离性
- 避免依赖外部状态
- 增加超时时间

### Q: 如何测试私有方法？
A:
- 通过公共接口测试
- 或使用 TypeScript 的 @ts-ignore

## 参考资源

- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [测试最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [WebAuto 测试架构设计](/tmp/automated-test-system-design.md)

---

**最后更新**: 2025-01-01
**维护者**: WebAuto Team
