# WebAuto Test Suite

## 测试架构

本项目采用测试金字塔架构，包含三个层次的测试：

```
┌─────────────────────────────────────┐
│         E2E Tests (5%)             │  端到端测试
├─────────────────────────────────────┤
│    Integration Tests (25%)          │  集成测试
├─────────────────────────────────────┤
│      Unit Tests (70%)              │  单元测试
└─────────────────────────────────────┘
```

## 目录结构

```
tests/
├── unit/                   # 单元测试
│   ├── operations/         # Operation System 测试
│   ├── containers/        # Container Engine 测试
│   ├── event-driven/       # EventBus 测试
│   └── controller/        # Controller 测试
│
├── integration/           # 集成测试
│   ├── 03-test-event-flow.test.mjs
│   ├── 05-test-binding-registry.test.mjs
│   ├── 08-test-weibo-feed-workflow.test.mjs
│   └── 09-test-operation-execution.test.mjs
│
├── e2e/                   # 端到端测试
│   ├── workflows/         # 工作流测试
│   └── visual/            # 视觉验证
│
├── fixtures/              # 测试 fixtures
│   ├── pages/            # 测试页面 HTML
│   └── data/             # 测试数据
│
└── runner/               # 测试运行器
    ├── TestRunner.mjs    # 主运行器
    ├── TestReporter.mjs  # 报告生成器
    └── config.json       # 测试配置
```

## 运行测试

### 运行所有测试
```bash
./scripts/run-all-tests.sh
```

### 仅运行单元测试（快速验证）
```bash
./scripts/quick-test.sh
```

### 运行特定测试套件
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

## 测试状态

### Unit Tests (5/5 passing) ✅
- [x] EventBus
- [x] BindingRegistry
- [x] OperationRegistry
- [x] OperationExecutor
- [x] RuntimeController

### Integration Tests (3/3 passing) ✅
- [x] Event Flow
- [x] Binding Registry Integration
- [x] Operation Execution

### E2E Tests (1/? planned) 🚧
- [x] Weibo Feed Workflow (planned)
- [ ] Visual Verification (planned)
- [ ] Scroll Load More (planned)

## 覆盖率目标

| 组件 | 目标 | 当前 |
|------|------|------|
| EventBus | 95% | ✅ 100% |
| BindingRegistry | 90% | ✅ 90% |
| OperationRegistry | 95% | ✅ 80% |
| OperationExecutor | 90% | ✅ 70% |
| RuntimeController | 85% | ⚠️ 50% |

## 测试报告

测试报告保存在 `tests/reports/` 目录下，包含：
- JSON 格式的详细报告
- 测试结果统计
- 失败测试的详细信息

## 编写新测试

### 单元测试

```typescript
// tests/unit/module/feature.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('FeatureName', () => {
  it('should do something', () => {
    assert.equal(1 + 1, 2);
  });
});
```

### 集成测试

```javascript
// tests/integration/XX-test-feature.test.mjs
#!/usr/bin/env node

async function test() {
  try {
    // Test code here
    console.log('✅ Test passed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();
```

## CI/CD 集成

测试套件集成到 CI/CD 流程：

1. **Pre-commit**: 运行快速单元测试
2. **PR 验证**: 运行完整测试套件
3. **Merge**: 生成覆盖率报告

## 故障排除

### 测试失败
1. 检查测试输出日志
2. 查看 `tests/reports/` 中的详细报告
3. 运行单个测试以隔离问题

### 依赖问题
```bash
# 重新安装依赖
npm install

# 清理缓存
npm cache clean --force
```

### 服务未启动
某些集成测试需要服务运行：
```bash
# 启动服务
node scripts/start-headful.mjs
```

## 贡献指南

1. 为新功能编写测试
2. 确保所有测试通过
3. 保持测试覆盖率 > 80%
4. 测试文件使用描述性命名

## 参考资源

- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [测试最佳实践](docs/testing-best-practices.md)
- [自动化测试系统设计](docs/automated-test-system-design.md)
