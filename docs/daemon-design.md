# Daemon 定时调度与重试设计

## 概述

Daemon 负责两个核心能力：
1. **定时调度**：按计划周期性执行 XHS 采集/点赞任务
2. **任务重试**：失败任务的自动重试与退避策略

Daemon 不再作为 CLI 的中间代理（relay 已移除），仅负责调度与重试。

## 架构

### 组件关系

```
webauto schedule daemon ────→ schedule.mjs (cmdDaemon)
     │                            │
     │                            ├── schedule-store.mjs (任务持久化)
     │                            ├── account-store.mjs (账户管理)
     │                            └── xhs-unified.mjs (runUnified)
     │
     └── tick loop (setInterval)
          ├── 查询到期任务 (listDueScheduleTasks)
          ├── 获取租约 (acquireScheduleTaskClaim)
          ├── 执行任务 (runUnified via dynamic import)
          └── 记录结果 (markScheduleTaskResult)
```

### CLI 入口

```bash
# 启动 daemon（持续运行，每30秒 tick 一次）
webauto schedule daemon --interval-sec 30

# 单次执行到期任务
webauto schedule daemon --once

# 查看到期任务
webauto schedule run-due --limit 10 --json
```

## 调度模型

### 任务类型

| 类型 | 说明 | 触发方式 |
|------|------|----------|
| `interval` | 固定间隔重复 | 每隔 N 分钟检查，到 nextRunAt 时执行 |
| `once` | 单次执行 | 到 nextRunAt 时执行一次 |
| `daily` | 每日定时 | 每天 fixedTime 执行 |
| `weekly` | 每周定时 | 每周指定星期几 fixedTime 执行 |

### 任务生命周期

```
pending → claimed → running → completed
                      ↓
                   failed
                      ↓ (retry)
                   pending
```

### 租约机制

- **daemon 租约**：防止多个 daemon 实例同时运行（`acquireScheduleDaemonLease`）
- **task 租约**：防止同一任务被多个 worker 同时执行（`acquireScheduleTaskClaim`）
- 租约有效期默认 120 秒，daemon 心跳续约（`renewScheduleDaemonLease`）
- 租约过期后其他实例可抢占

### 到期判断逻辑

```
scheduleType=once:   nextRunAt <= now && !completed
scheduleType=interval: nextRunAt <= now && (completedCount < maxRuns || maxRuns=0)
scheduleType=daily:   nextRunAt <= now (基于 fixedTime 计算)
scheduleType=weekly:  nextRunAt <= now (基于 fixedDay + fixedTime 计算)
```

执行后更新 `nextRunAt`：
- interval: nextRunAt += intervalMinutes
- once: 标记 completed=true
- daily: nextRunAt = tomorrow fixedTime
- weekly: nextRunAt = next week fixedDay fixedTime

## 重试设计

### 当前状态

`schedule.mjs` 已有基础重试能力（通过 maxRuns 和 failed 标记），但缺少显式的重试退避策略。

### 待实现：指数退避重试

```javascript
// 重试参数（在 task 定义中可选配置）
{
  "retry": {
    "enabled": true,        // 是否启用重试
    "maxAttempts": 3,       // 最大重试次数
    "backoffBaseMs": 60000, // 基础退避时间（60秒）
    "backoffMultiplier": 2, // 退避倍数
    "backoffMaxMs": 3600000 // 最大退避时间（1小时）
  }
}
```

**重试流程**：
1. 任务执行失败（exit code !== 0 或异常）
2. 计算 nextRunAt = now + min(backoffBaseMs * 2^(attempt-1), backoffMaxMs)
3. 更新 task: failedCount++, lastFailedAt=now, nextRunAt=计算值
4. 下次 tick 时重新检查，若到期则再次执行
5. 达到 maxAttempts 后标记 finalFailed=true，不再重试

**退避时间示例**：
- 第 1 次失败：60 秒后重试
- 第 2 次失败：120 秒后重试
- 第 3 次失败：240 秒后重试
- 超过 maxAttempts：标记最终失败

### 错误分类

| 错误类型 | 是否重试 | 说明 |
|----------|----------|------|
| 网络超时 | ✅ | 临时性网络问题 |
| 页面加载失败 | ✅ | 浏览器或页面问题 |
| 风控拦截 | ❌ | 需人工处理 |
| 登录失效 | ❌ | 需重新登录 |
| 配置错误 | ❌ | 需修正配置 |
| 未知异常 | ✅ | 兜底重试 |

### 错误分类实现

```javascript
function classifyError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '').toLowerCase();

  // 不可重试错误
  if (code === 'RISK_CONTROL' || message.includes('risk_control')) return 'risk_control';
  if (message.includes('login') || message.includes('auth')) return 'auth_error';
  if (message.includes('invalid_config') || message.includes('missing_profile')) return 'config_error';

  // 可重试错误
  if (code === 'TIMEOUT' || message.includes('timeout')) return 'timeout';
  if (code === 'NETWORK' || message.includes('network') || message.includes('econnrefused')) return 'network';
  if (message.includes('navigation') || message.includes('page_load')) return 'page_error';

  return 'unknown'; // 默认重试
}
```

## 断点续传

### 共享采集路径

```bash
# 第一次执行：采集 + 详情
webauto xhs unified --profile xhs-1 --keyword "梅姨" --max-notes 50 --env debug

# 断点续传：只处理之前未完成的 notes
webauto xhs unified --profile xhs-1 --keyword "梅姨" --max-notes 50 \
  --shared-harvest-path ~/.webauto/download/xiaohongshu/debug/梅姨 \
  --env debug
```

### 状态持久化

- 任务状态存储在 `~/.webauto/schedules/` 目录下
- 每个任务一个 JSON 文件（taskId.json）
- 包含：任务配置、执行历史、重试计数、nextRunAt
- 支持跨 daemon 重启恢复

## Daemon 管理命令

```bash
# 启动
webauto schedule daemon --interval-sec 30

# 单次执行
webauto schedule daemon --once

# 查看任务列表
webauto schedule list --json

# 查看任务详情
webauto schedule get <taskId> --json

# 添加任务
webauto schedule add \
  --name "梅姨-每30分钟" \
  --schedule-type interval \
  --interval-minutes 30 \
  --profile xiaohongshu-batch-1 \
  --keyword "梅姨" \
  --max-notes 50 \
  --do-comments true \
  --do-likes true \
  --like-keywords "吓死了" \
  --env debug

# 更新任务
webauto schedule update <taskId> --max-notes 100

# 删除任务
webauto schedule delete <taskId>

# 手动触发
webauto schedule run <taskId>

# 导出/导入
webauto schedule export --file backup.json
webauto schedule import --file backup.json
```

## Daemon 安全

- 单实例保证：通过 lease 文件锁，防止多 daemon 并发
- 租约自动过期：daemon 异常退出后租约自动释放
- 任务级别锁：同一任务同一时间只能被一个 worker 执行
- 进程信号处理：SIGINT/SIGTERM 优雅关闭，释放租约

## 测试计划

### 单元测试

| 测试文件 | 覆盖范围 |
|----------|----------|
| `tests/unit/webauto/schedule-store.test.mjs` | 任务增删改查、租约管理 |
| `tests/unit/webauto/schedule-daemon.test.mjs` | daemon 启停、tick 循环、lease 续约 |
| `tests/unit/webauto/schedule-retry.test.mjs` | 重试策略、退避计算、错误分类 |

### 测试要点

1. **租约竞争**：模拟两个 daemon 同时启动，验证只有一个获得租约
2. **任务到期**：创建过去时间的任务，验证 tick 时被正确执行
3. **重试退避**：模拟失败，验证 nextRunAt 按退避策略更新
4. **错误分类**：验证不同错误类型的重试/不重试行为
5. **断点续传**：验证 shared-harvest-path 参数正确传递
