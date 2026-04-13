# Always-On Architecture Phase 1 Summary

## 审计发现与修复

基于 `docs/arch/always-on-architecture-audit.md` 的深度审计，Phase 1 修复了 3 个 P0（不崩溃能力）问题。

---

## P0-1: Consumer 状态持久化 ✅ 已完成

**问题描述 (P7)**：
- Consumer 心跳只打日志，不持久化状态
- 崩溃后无法恢复已处理进度
- 重启后从 0 开始，浪费已处理的链接

**解决方案**：
- 创建 `lib/consumer-state.mjs` 模块
- 持久化文件：`~/.webauto/state/consumer/<env>/<keyword>/consumer-state.json`
- 记录字段：processed、lastProcessedNoteId、consecutiveErrors、lastError
- 集成到 `xhs-consumer-runner.mjs`：
  - 启动时 `loadConsumerState()` 恢复进度
  - 心跳时 `saveConsumerState()` 持久化
  - 成功处理后 `updateProcessedCount()` 更新
  - 错误时 `recordError()` 记录

**验证结果**：
```
=== Consumer State Persistence Test ===
- State reset: ✅
- Processed count tracking: ✅
- Error tracking: ✅
- Crash recovery: ✅ (processed=3 restored from state file)
- State file persistence: ✅

✅ P0-1 VERIFIED: Consumer can recover from crash
```

---

## P0-2: Producer 服务端去重 ✅ 已完成

**问题描述 (P8)**：
- Producer 去重依赖本地 `posts.jsonl` 文件
- 文件损坏 = 重复入队
- 多实例无法共享去重集合

**解决方案**：
- SearchGate 新增服务端去重 API：
  - `POST /detail-links/record-seen` (登记已处理帖子)
  - `POST /detail-links/check-seen` (批量检查是否已处理)
- `seenRecords` 全局去重集合（跨队列持久化）
- 持久化文件：`~/.webauto/state/search-gate/seen-records.jsonl`
- Producer 入队前调用 `check-seen` 过滤已处理链接

**修改文件**：
- `runtime/infra/utils/search-gate-core.mjs` (+100行)
- `scripts/search-gate-server.mjs` (+20行)
- `apps/webauto/entry/xhs-producer-runner.mjs` (+20行)

**验证结果**：
```
=== Producer Server-Side Dedup E2E Test ===
- First enqueue: 3 links (expected 3) ✅
- Second enqueue: 0 links (expected 0) ✅
- links.jsonl entries: 3 (expected 3) ✅
- seen-records.jsonl persisted: ✅

✅ P0-2 VERIFIED: Duplicate links correctly filtered
```

---

## P0-3: Monitor Daemon 集成 ✅ 已完成

**问题描述 (P10)**：
- Weibo Monitor 完全脱离 daemon 体系
- 无健康检查、无自动恢复、无错误重试
- 崩溃后无重启机制

**解决方案**：
1. 注册为 `ALWAYS_ON_COMMAND_TYPES`：`'weibo-special-follow-monitor'`
2. CLI 命令处理：`bin/webauto.mjs` 新增 handler
3. Daemon 平台映射：`daemon.mjs` 新增 `weibo-special-follow` 平台识别
4. Monitor runner 增强：
   - `BROWSER_SERVICE_URL` 健康检查
   - `HEALTH_CHECK_INTERVAL_MS` (5分钟周期检查)
   - `MAX_CONSECUTIVE_ERRORS` (3次错误触发健康检查)
   - `WEBAUTO_JOB_STOPPING` (daemon stop signal 响应)
   - `consecutiveErrors` 错误追踪

**修改文件**：
- `apps/webauto/entry/lib/schedule-store.mjs` (+1行)
- `bin/webauto.mjs` (+7行)
- `apps/webauto/entry/daemon.mjs` (+1行)
- `apps/webauto/entry/lib/weibo-special-follow-monitor-runner.mjs` (+50行)

**验证结果**：
```
=== Monitor Daemon Integration Test ===
- Schedule-store registration: ✅
- CLI command handler: ✅
- Daemon platform mapping: ✅
- Monitor health checks: ✅ (6/6 checks pass)
- Consumer state persistence: ✅ (5/5 functions)

✅ P0-3 VERIFIED: Weibo monitor now part of daemon system
```

---

## 测试覆盖

| 测试文件 | 验证内容 | 结果 |
|----------|----------|------|
| `producer-dedup-api.test.mjs` | SearchGate API 功能 | ✅ |
| `producer-dedup-e2e.test.mjs` | Producer 去重逻辑 | ✅ |
| `consumer-state-persistence.test.mjs` | Consumer 状态恢复 | ✅ |
| `monitor-daemon-integration.test.mjs` | Monitor daemon 集成 | ✅ |

---

## 架构评分更新

| 维度 | 审计前 | Phase 1 后 |
|------|--------|------------|
| 可插拔性 | 7/10 | 7/10 (无变化) |
| 可扩展性 | 6/10 | 6/10 (无变化) |
| **不崩溃能力** | **5/10** | **8/10** (+3) |
| **整体** | **6/10** | **7/10** (+1) |

---

## 下一步 (Phase 2)

P1 问题（可扩展性瓶颈）：
- **P1-1**: Schedule Tick 并行调度 (resourceMutex 驱动)
- **P1-2**: Tick 异常重试机制
- **P1-3**: Lease renew 失败处理

预计 2-3 周，目标是可扩展性评分从 6/10 提升到 8/10。
