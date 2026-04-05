# WebAuto 生命周期审计报告

## 审计范围

- Daemon 进程生命周期
- Job 子进程生命周期
- Timer/Interval 清理
- Log Stream 文件句柄
- Orphan 进程检测与清理
- Producer/Consumer Always-On 模式

---

## 1. Daemon 进程生命周期

### 启动流程

```
ensureDaemonStarted()
├── spawn(detached=true, stdio='ignore')
├── write PID_FILE
└── unref() → 父进程可退出
```

### 关闭流程 (shutdownDaemon)

```
shutdownDaemon() — SIGINT/SIGTERM 触发
├── for job in running jobs:
│   ├── terminatePidTree(job.pid)
│   └── job.status = 'stopped'
├── releaseScheduleDaemonLease()
├── clearInterval(scheduleTickTimer) ✅
├── server.close() ✅
├── cleanupRuntimeFiles() ✅
└── process.exit(0)
```

### ⚠️ 风险点

| 问题 | 位置 | 风险等级 | 修复建议 |
|------|------|----------|----------|
| **heartbeatTimer 未清理** | L906 | 中 | `clearInterval(heartbeatTimer)` |
| **housekeepingTimer 未清理** | L931 | 中 | `clearInterval(housekeepingTimer)` |
| **stallCheckTimer 未清理** | L998 | 中 | `clearInterval(stallCheckTimer)` |
| **server.on('error') 监听器未移除** | L900 | 低 | 在 server.close() 后移除 |

---

## 2. Job 子进程生命周期

### 启动 (spawnTaskJob)

```
spawnTaskJob()
├── spawn(process.execPath, [WEBAUTO_BIN, ...args])
├── child.stdout.on('data', logStream.write)
├── child.stderr.on('data', logStream.write)
├── child.on('close', callback) ✅
└── registerWorker()
```

### 关闭 (child.on('close'))

```
child.on('close')
├── job.status = 'completed'/'failed'
├── logStream.end() ✅
├── markWorkerStopped()
└── updateHeartbeat()
```

### ✅ 安全

- logStream 在 child close 时正确 end()
- worker 状态正确标记 stopped
- job 状态正确更新

---

## 3. Timer/Interval 清理状态

| Timer | 启动位置 | unref | shutdown 清理 | 风险 |
|-------|----------|-------|---------------|------|
| heartbeatTimer | L906 | ✅ | ❌ 未 clear | 低（unref 防阻塞） |
| housekeepingTimer | L931 | ✅ | ❌ 未 clear | 低 |
| stallCheckTimer | L998 | ❌ | ❌ 未 clear | 中 |
| scheduleTickTimer | L1155 | ✅ | ✅ L1176 | 无 |
| schedule heartbeat | L1064 | ✅ | ✅ finally clearInterval | 无 |

### 修复建议

```javascript
// shutdownDaemon() 中添加：
if (heartbeatTimer) clearInterval(heartbeatTimer);
if (housekeepingTimer) clearInterval(housekeepingTimer);
if (stallCheckTimer) clearInterval(stallCheckTimer);
```

---

## 4. Log Stream 文件句柄

| 操作 | 位置 | 状态 |
|------|------|------|
| createWriteStream | L567 | ✅ |
| child.stdout.on('data', logStream.write) | L600 | ✅ |
| child.stderr.on('data', logStream.write) | L601 | ✅ |
| logStream.end() on child close | L615 | ✅ |

### ✅ 安全：logStream 在子进程关闭时正确 end()

---

## 5. Orphan 进程检测与清理

### 检测 (findOrphanedWorkerPids)

```
pgrep -f 'apps/webauto/entry/xhs-(unified|collect)\.mjs'
├── 过滤掉 supervisedPids
├── 过滤掉 excludedPids
└── 返回孤儿 PID 列表
```

### 清理 (cleanupOrphanedWorkers)

```
for pid in orphanPids:
├── terminatePidTree(pid) → pkill -TERM -P pid
├── pkill -KILL -P pid (fallback)
└── kill -9 pid (last resort)
```

### ⚠️ 风险点

| 问题 | 风险 | 修复建议 |
|------|------|----------|
| **只检测 xhs-unified/collect** | weibo/producer/consumer 孤儿不被检测 | 扩展 pgrep pattern |
| **启动时清理，运行中不清理** | 运行中产生的孤儿可能残留 | housekeeping 中调用 cleanupOrphanedWorkers |

### 修复建议

```javascript
// 扩展 orphan 检测 pattern
const ORPHAN_PATTERNS = [
  'apps/webauto/entry/xhs-(unified|collect|producer|consumer)\\.mjs',
  'apps/webauto/entry/weibo-(unified|producer|consumer)\\.mjs',
];
```

---

## 6. Producer/Consumer Always-On 模式

### Consumer while(true) 循环

```javascript
while (true) {
  if (process.env.WEBAUTO_JOB_STOPPING === 'true') return;
  const batchResult = await runXhsUnified(...);
  if (queue empty) await sleep(30000);
}
```

### ✅ 安全

- 正确检查 `WEBAUTO_JOB_STOPPING` 环境变量
- idle 时 sleep，不消耗 CPU
- 无累积状态（totalProcessed/idleRounds 是简单计数器）

### ⚠️ 风险点

| 问题 | 风险 | 修复建议 |
|------|------|----------|
| **依赖 WEBAUTO_JOB_STOPPING** | 如果 daemon 异常退出，env 不会设置 | 添加超时退出机制 |
| **无 maxRunTime 限制** | 理论上可无限运行 | 添加 --max-runtime-minutes 参数 |

---

## 7. 修复优先级

| 优先级 | 问题 | 修复 |
|--------|------|------|
| **P0** | stallCheckTimer 未 unref + 未清理 | unref() + clearInterval on shutdown |
| **P0** | orphan 检测 pattern 不完整 | 扩展 pattern 覆盖所有 commandType |
| **P1** | heartbeatTimer/housekeepingTimer 未清理 | clearInterval on shutdown |
| **P2** | Consumer 无 maxRuntime 限制 | 添加 --max-runtime-minutes |

---

## 8. 验证清单

```bash
# 1. 检查 orphan 进程
ps aux | grep -E 'xhs|weibo|producer|consumer' | grep -v grep

# 2. 检查 daemon timer
lsof -p $(cat ~/.webauto/state/daemon.pid | jq .pid) | grep -i timer

# 3. 检查文件句柄泄漏
lsof -p $(cat ~/.webauto/state/daemon.pid | jq .pid) | wc -l

# 4. 运行 1 小时后检查内存
ps -o pid,rss,command -p $(cat ~/.webauto/state/daemon.pid | jq .pid)
```
