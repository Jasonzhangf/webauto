# WebAuto Stress Testing Framework

## 测试分层

| 层级 | 目录 | 说明 |
|------|------|------|
| L1 | `l1-infrastructure/` | 基础模块压力测试（浏览器输入、CDP、Session） |
| L2 | `l2-orchestration/` | 编排阶段压力测试（采集、评论、Tab 轮转） |
| L3 | `l3-recovery/` | 崩溃恢复测试（进程崩溃、断网、内存熔断） |

## 使用方式

```bash
# 运行单个测试
node apps/webauto/stress-tests/l1-infrastructure/stress-camo-input.mjs --profile xhs-qa-1

# 运行 L1 全部
node apps/webauto/stress-tests/l1-infrastructure/run-all.mjs

# 运行完整套件
node apps/webauto/stress-tests/run-suite.mjs
```

## 设计文档

详见 `docs/arch/stress-testing-framework-design.md`
