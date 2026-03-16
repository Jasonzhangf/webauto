# 心跳和自动关闭机制分析

## 发现的机制

### 1. Owner Watchdog (SessionManager.ts)
- **检查间隔**: 5 秒（默认）
- **功能**: 检测 owner 进程是否存活
- **行为**: 如果 owner 进程死亡，自动清理 session

### 2. Session Watchdog (session-watchdog.mjs)
- **检查间隔**: 1.2 秒（默认）
- **Idle 超时**: 
  - Headless: 30 分钟（默认）
  - Visible: 0（无超时）
- **行为**:
  - 检测 idle 超时
  - 检测空页面/blank 页面
  - 同步 viewport
  - 触发条件时关闭 session

### 3. Desktop Heartbeat (index.mts)
- **功能**: 监控 UI 心跳
- **行为**: 如果 UI 心跳超时，停止所有运行和核心服务

## 当前会话状态 (xhs-qa-1)
```json
{
  "idleTimeoutMs": 0,
  "idleMs": 33886403,
  "idle": false,
  "live": true,
  "registered": true
}
```
- ✅ Idle timeout 设置为 0（不会因超时关闭）
- ✅ Session 状态活跃
- ✅ Owner watchdog 运行中

## 对于长任务的建议
1. **设置 `--idle-timeout 0`**（无超时）或更长（如 `4h`）
2. **在稳定的环境中运行**
3. **监控进程资源使用情况**

## 标签
#heartbeat #watchdog #auto-close #session-management
