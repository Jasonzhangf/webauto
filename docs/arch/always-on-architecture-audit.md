# Always-On 架构审计报告

**审计日期**: 2026-04-13  
**审计范围**: 小红书 (XHS) + 微博 (Weibo) 搜索与监控脚本  
**审计目标**: 检查架构的可插拔性、可扩展性、不崩溃能力

---

## 1. 架构概览

### 1.1 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **Daemon** | `entry/daemon.mjs` | 守护进程、任务调度、生命周期管理 |
| **Schedule Store** | `entry/lib/schedule-store.mjs` | 任务存储、锁机制、去重、并发控制 |
| **Schedule Retry** | `entry/lib/schedule-retry.mjs` | 错误分类、重试策略、backoff 计算 |
| **XHS Producer** | `entry/xhs-producer-runner.mjs` | 热搜扫描、帖子入队、去重 |
| **XHS Consumer** | `entry/xhs-consumer-runner.mjs` | 链接处理、持久运行、自动恢复 |
| **Weibo Producer** | `entry/weibo-producer-runner.mjs` | 时间线采集、去重入队 |
| **Weibo Consumer** | `entry/weibo-consumer-runner.mjs` | 微博详情处理、持久运行 |
| **Weibo Monitor** | `entry/lib/weibo-special-follow-monitor-runner.mjs` | 特别关注监控、新帖检测 |

### 1.2 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Daemon (守护进程)                              │
│  - Schedule Tick (30s)                                               │
│  - Lease 管理 (2min)                                                  │
│  - 任务排他性控制                                                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Producer     │   │  Consumer     │   │  Monitor      │
│  (定时扫描)    │   │  (持久运行)    │   │  (定时巡检)    │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Queue / State                                 │
│  - search-gate queue (claim/complete/release)                        │
│  - posts.jsonl (已处理记录)                                           │
│  - post-state.json (监控状态)                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 可插拔性分析

### 2.1 ✅ 已实现的可插拔能力

#### 命令类型注册机制
```javascript
// schedule-store.mjs L10-22
const SUPPORTED_COMMAND_TYPES = [
  'xhs-unified',
  '1688-search',
  'weibo-timeline',
  'weibo-user-profile',
];
const ALWAYS_ON_COMMAND_TYPES = [
  'xhs-producer', 'xhs-consumer',
  'weibo-producer', 'weibo-consumer',
];
```
**优点**: 通过常量数组定义，新增平台只需追加类型。

#### 任务参数标准化
```javascript
// daemon.mjs L1074-1082
const commandType = String(task?.commandType || 'xhs-unified').trim();
let commandArgv = ensureProfileArg(commandType, task?.commandArgv || {});
if (task?.taskMode) commandArgv['task-mode'] = task.taskMode;
```
**优点**: 参数通过 `commandArgv` 对象传递，支持任意扩展。

#### Runner 统一接口
```javascript
// 所有 runner 都遵循相同接口
export async function runProducerTask(args = {}) { ... }
export async function runConsumerTask(args = {}) { ... }
```
**优点**: 新增 runner 只需实现统一接口，无需修改 daemon。

### 2.2 ⚠️ 可插拔性脆弱点

#### 问题 1: Profile 参数注入硬编码
```javascript
// daemon.mjs L781-810
function ensureProfileArg(commandType, argv) {
  const profile = argv.profile || argv.p;
  if (!profile) {
    // 硬编码默认 profile
    if (commandType.includes('xhs')) return { ...argv, profile: 'xhs-qa-1' };
    if (commandType.includes('weibo')) return { ...argv, profile: 'weibo' };
    ...
  }
}
```
**风险**: 新增平台必须在此函数添加 case，否则无默认 profile。

**建议**: 改为配置驱动，从 `policy.json` 读取默认 profile 映射。

#### 问题 2: Runner 动态导入路径耦合
```javascript
// xhs-consumer-runner.mjs L65
const { runUnified } = await import('./xhs-unified.mjs');

// weibo-consumer-runner.mjs L45
const { runWeiboUnified } = await import('./weibo-unified-runner.mjs');
```
**风险**: Runner 之间硬编码依赖路径，无法独立替换。

**建议**: 改为通过 registry 或依赖注入机制。

#### 问题 3: 平台特定逻辑分散
```javascript
// healthCheckAndRecover 在每个 runner 独立实现
// xhs-consumer-runner.mjs L24-55
// xhs-producer-runner.mjs L20-45
```
**风险**: 恢复逻辑重复实现，维护成本高，行为不一致。

**建议**: 提取到 `lib/health-recovery.mjs` 共享模块。

---

## 3. 可扩展性分析

### 3.1 ✅ 已实现的扩展能力

#### 调度策略可配置
```javascript
// schedule-store.mjs L24-32
const DEFAULT_SCHEDULER_POLICY = {
  maxConcurrency: 1,
  maxConcurrencyByPlatform: {},
  resourceMutex: {
    enabled: true,
    dimensions: ['account', 'profile'],
    allowCrossPlatformSameAccount: false,
  },
};
```
**优点**: 通过 `policy.json` 可调整并发控制。

#### 重试策略可配置
```javascript
// schedule-retry.mjs L35-40
export const RETRY_DEFAULTS = {
  baseMs: 60000,        // 1 minute base
  multiplier: 2,        // exponential backoff
  maxMs: 3600000,       // 1 hour max
  maxAttempts: 3,       // max 3 retries
};
```
**优点**: 支持自定义重试参数。

#### 任务生命周期钩子
```javascript
// schedule-store.mjs L710-730
// claimScheduleTask → renewScheduleTaskClaim → releaseScheduleTaskClaim
```
**优点**: 提供任务执行前/中/后的钩子点。

### 3.2 ⚠️ 扩展性脆弱点

#### 问题 4: Schedule Tick 串行执行
```javascript
// daemon.mjs L1127-1135
const dueTasks = listDueScheduleTasks(10);
for (const task of dueTasks) {
  if (state.shuttingDown) break;
  const activeJobs = state.jobsOrder.map(...).filter(j => j.status === 'running');
  if (activeJobs.length > 0) break; // 排他性：有任务运行就停止
  await scheduleExecuteTask(task);  // 串行 await
}
```
**风险**: 任务串行执行，无法并行处理多平台任务。

**影响**: 扩展到多平台时效率降低。

**建议**: 改为基于 resourceMutex 的并行调度，不同平台可同时运行。

#### 问题 5: Monitor 缺少统一调度框架
```javascript
// weibo-special-follow-monitor-runner.mjs 独立实现
// - 没有通过 daemon task submit
// - 没有使用 schedule-store
// - 没有统一的生命周期管理
```
**风险**: Monitor 脱离 daemon 体系，无法统一管理、监控、恢复。

**建议**: 将 Monitor 注册为新的 commandType: `weibo-special-follow-monitor`。

#### 问题 6: 缺少任务优先级机制
```javascript
// listDueScheduleTasks 只按 nextRunAt 排序
// 没有 priority 字段
```
**风险**: 无法区分紧急任务和普通任务。

**建议**: 任务模型增加 `priority` 字段，调度��优先处理高优先级。

---

## 4. 不崩溃能力分析

### 4.1 ✅ 已实现的容错机制

#### 错误分类与重试
```javascript
// schedule-retry.mjs
// 风控错误 → 不重试，禁用任务
// 认证错误 → 不重试
// 网络/超时 → exponential backoff 重试
```
**优点**: 区分可恢复和不可恢复错误。

#### Lease 防止孤儿进程
```javascript
// schedule-store.mjs
// acquireScheduleDaemonLease → renewScheduleDaemonLease → releaseScheduleDaemonLease
// 过期 lease 自动回收: reapStaleLocks()
```
**优点**: Daemon 崩溃后不会留下孤儿任务。

#### Consumer 自动恢复
```javascript
// xhs-consumer-runner.mjs L24-55
async function healthCheckAndRecover(profileId) {
  // 1. 检查 browser-service health
  // 2. 失败 → camo start 重启
  // 3. 验证恢复
}
```
**优点**: 连续错误达到阈值自动恢复。

#### Stop Signal 响应
```javascript
// xhs-consumer-runner.mjs L80
if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
  return { ok: true, reason: 'stop_signal' };
}
```
**优点**: 优雅退出，不丢失状态。

### 4.2 ⚠️ 容错脆弱点（高危）

#### 问题 7: Consumer 无持久化心跳状态 ⚠️ HIGH
```javascript
// xhs-consumer-runner.mjs
// 心跳只输出到 console.log，不持久化
console.log(`[consumer] heartbeat: processed=${totalProcessed}`);
```
**风险**: Consumer 进程崩溃后无法恢复进度，已处理的链接可能丢失。

**建议**: 
1. 每次处理完成后写入 `consumer-state.json`
2. 启动时读取状态恢复进度

#### 问题 8: Producer 去重依赖本地文件 ⚠️ HIGH
```javascript
// xhs-producer-runner.mjs L58-72
function loadExistingNoteIds(outputDir) {
  const postsPath = path.join(outputDir, 'posts.jsonl');
  // 读取本地文件去重
}
```
**风险**: 
1. 文件损坏 → 去重失效 → 重复处理
2. 多实例部署 → 文件不共享 → 重复入队

**建议**: 使用数据库或服务端去重（search-gate queue）。

#### 问题 9: Schedule Tick 异常不重试 ⚠️ MEDIUM
```javascript
// daemon.mjs L1136-1140
} catch (err) {
  logDaemonEvent('schedule_tick_error', { error: err?.message });
} finally {
  scheduleRunning = false;  // 不重试，直接结束
}
```
**风险**: 一次 tick 异常导致整个调度周期停止。

**建议**: tick 异常后记录并继续下一周期，不阻塞后续任务。

#### 问题 10: Monitor 缺少崩溃恢复 ⚠️ HIGH
```javascript
// weibo-special-follow-monitor-runner.mjs
// 没有健康检查
// 没有自动恢复
// 没有错误重试
// 进程崩溃后完全停止
```
**风险**: Monitor 崩溃后无法自动恢复，需要人工介入。

**建议**: 
1. 增加 daemon 管理入口
2. 增加 healthCheckAndRecover
3. 持久化巡检状态

#### 问题 11: 队列空时无超时保护 ⚠️ MEDIUM
```javascript
// xhs-consumer-runner.mjs L110-115
if (reason === 'AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED') {
  await sleep(CONSUMER_IDLE_INTERVAL_MS);  // 30s
  continue;  // 无限循环
}
```
**风险**: 长时间空闲可能导致资源浪费或状态过期。

**建议**: 增加 `maxIdleTimeMs` 配置，超时后优雅退出并释放资源。

#### 问题 12: Lease Renew 失败无处理 ⚠️ MEDIUM
```javascript
// daemon.mjs L1121-1127
setInterval(() => {
  renewScheduleDaemonLease({ ownerId: scheduleOwnerId, leaseMs: SCHEDULE_LEASE_MS });
}, hbMs).unref();
// renew 失败不检查结果
```
**风险**: renew 失败后 lease 过期，任务被其他 daemon 抢占。

**建议**: renew 失败后记录并尝试重新 acquire。

---

## 5. 架构改进建议

### 5.1 紧急修复 (P0)

| 问题 | 修复方案 | 预估工作量 |
|------|----------|-----------|
| P7 Consumer 无状态持久化 | 增加 `consumer-state.json` | 2h |
| P8 Producer 去重依赖本地文件 | 改用 search-gate 去重 | 3h |
| P10 Monitor 无崩溃恢复 | 增加 daemon 管理入口 | 4h |

### 5.2 重要改进 (P1)

| 问题 | 修复方案 | 预估工作量 |
|------|----------|-----------|
| P4 任务串行执行 | 基于 resourceMutex 并行调度 | 6h |
| P9 Tick 异常不重试 | 异常后继续下一周期 | 1h |
| P12 Lease Renew 无检查 | 增加失败处理逻辑 | 2h |

### 5.3 架构优化 (P2)

| 问题 | 修复方案 | 预估工作量 |
|------|----------|-----------|
| P1 Profile 硬编码 | 配置驱动默认 profile | 2h |
| P3 恢复逻辑重复 | 提取共享模块 | 3h |
| P6 缺少优先级 | 增加 priority 字段 | 2h |

---

## 6. 架构健康评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **可插拔性** | 7/10 | 命令类型注册机制完善，但 profile/runner 存在硬编码 |
| **可扩展性** | 6/10 | 调度策略可配置，但任务串行执行限制并发能力 |
| **不崩溃能力** | 5/10 | 错误分类/lease/自动恢复已实现，但状态持久化严重不足 |
| **整体健康度** | 6/10 | 基础架构完善，需要重点修复状态持久化和并行调度 |

---

## 7. 建议的架构演进路线

### Phase 1: 状态持久化强化 (1-2 周)
- Consumer state 持久化
- Producer 去重改用服务端
- Monitor daemon 化

### Phase 2: 并行调度支持 (2-3 周)
- resourceMutex 驱动的并行调度
- 平台级并发控制
- 任务优先级机制

### Phase 3: 模块化重构 (3-4 周)
- 共享 health-recovery 模块
- Runner registry 机制
- 配置驱动参数注入

---

## 8. 审计结论

**总体评价**: Always-On ���构设计思路正确，Producer-Consumer 模式清晰，但存在以下关键脆弱点：

1. **状态持久化不足**: Consumer/Monitor 崩溃后无法恢复进度
2. **去重机制脆弱**: 依赖本地文件，多实例场景失效
3. **任务调度串行**: 限制扩展到多平台的并发能力
4. **Monitor 脱离体系**: 缺少统一生命周期管理

**优先级建议**: 先修复 P0 状态持久化问题，再优化调度并发能力。

---

*审计人: Jason*  
*审计工具: Claude Code Explorer + Manual Code Review*
