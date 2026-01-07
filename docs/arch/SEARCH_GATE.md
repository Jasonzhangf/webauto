# SearchGate 搜索节流器

## 背景

小红书（以及其他平台）对频繁搜索行为高度敏感，直接拼接 URL 或短时间内多次搜索会触发风控验证码。

为确保：
1. **所有搜索必须走"对话框搜索"流程**（模拟人工输入 + 回车）
2. **不频繁搜索**（速率控制）

引入 **SearchGate** 后台节流服务。

---

## 核心原则（硬性规则）

1. **所有平台的搜索 Block 必须先向 SearchGate 申请许可**（通过 `WaitSearchPermitBlock`）
2. **只有拿到许可后才能执行搜索**（否则阻塞或等待）
3. **禁止直跳搜索 URL**，所有搜索必须在页面内通过对话框触发
4. **Phase1 启动后自动拉起 SearchGate**（常驻后台）

---

## 架构

```
┌──────────────────┐
│   Phase1 启动    │
│ (session+login)  │
└────────┬─────────┘
         │
         ├─ spawn detached
         ├─ start-headful.mjs
         └─ search-gate-server.mjs ──┐
                                     │
                                     ▼
                            ┌────────────────┐
                            │  SearchGate    │
                            │  (HTTP 7790)   │
                            │                │
                            │ - POST /permit │
                            │ - GET /status  │
                            │ - GET /health  │
                            └────────────────┘
                                     ▲
                                     │
         ┌───────────────────────────┴──────────────────┐
         │                                              │
┌────────┴─────────┐                      ┌─────────────┴─────────┐
│ WaitSearchPermit │                      │   GoToSearchBlock     │
│     Block        │  ──(允许后执行)──→   │  (对话框搜索)         │
└──────────────────┘                      └───────────────────────┘
```

---

## 接口

### HTTP 端口：7790

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/permit` | 申请搜索许可<br/>Body: `{ key, windowMs?, maxCount? }`<br/>Response: `{ ok, allowed, waitMs, countInWindow }` |
| `GET` | `/health` | 健康检查 |
| `GET` | `/stats` | 统计信息（队列/窗口） |
| `POST` | `/shutdown` | 优雅退出 |

### 速率策略

- **默认限制**：同一 key（通常是 `profileId`）在 60s 内最多 2 次搜索
- **超限行为**：返回 `allowed: false` + `waitMs`（需等待的毫秒数）
- **窗口滑动**：每次许可授予后记录时间戳，自动清理过期记录

---

## 启动方式

### 方式1：独立启动（调试）

```bash
node scripts/search-gate-server.mjs
```

### 方式2：CLI（推荐）

```bash
# 启动
node scripts/search-gate-cli.mjs start

# 停止
node scripts/search-gate-cli.mjs stop

# 重启
node scripts/search-gate-cli.mjs restart

# 状态
node scripts/search-gate-cli.mjs status
```

### 方式3：Phase1 自动启动（生产）

```bash
node scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs
```

登录成功后自动拉起 SearchGate（detached 模式）。

---

## Workflow 集成

### 1. 定义中添加 WaitSearchPermitBlock

参考 `modules/workflow/definitions/xiaohongshu-collect-workflow-v2.ts`：

```ts
{
  blockName: 'WaitSearchPermitBlock',
  input: {
    sessionId: '$sessionId'
  }
},
{
  blockName: 'GoToSearchBlock',
  input: {
    sessionId: '$sessionId',
    keyword: '$keyword'
  }
}
```

### 2. 注册 Block

参考 `scripts/run-xiaohongshu-workflow-v2.ts`：

```ts
import * as WaitSearchPermitBlock from '../modules/workflow/blocks/WaitSearchPermitBlock';

executor.registerBlock('WaitSearchPermitBlock', { execute: WaitSearchPermitBlock.execute });
```

### 3. WaitSearchPermitBlock 内部逻辑

- 向 `http://127.0.0.1:7790/permit` POST 请求
- 如果 `allowed: true`，立即返回
- 如果 `allowed: false`，等待 `waitMs` 后重试
- 最多等待 `maxWaitMs`（默认 5 分钟）后失败

### 4. GoToSearchBlock 内部已集成

`modules/workflow/blocks/GoToSearchBlock.ts` 内部已包含对 SearchGate 的调用（位于 `execute` 函数开头），但推荐在 Workflow 定义中显式添加 `WaitSearchPermitBlock` 步骤，逻辑更清晰。

---

## 测试

### 1. 健康检查

```bash
curl http://127.0.0.1:7790/health
```

### 2. 申请许可

```bash
curl -X POST http://127.0.0.1:7790/permit \
  -H "Content-Type: application/json" \
  -d '{"key":"xiaohongshu_fresh"}'
```

### 3. 验证速率限制

```bash
node scripts/xiaohongshu/tests/test-search-gate.mjs
```

预期：
- 前 2 次请求立即授权
- 第 3 次请求被限流，需等待 ~60s

---

## 日志

SearchGate 会实时打印到终端：

```
[12:34:56] [GATE] listening on http://127.0.0.1:7790 (window: 60s, max: 2 searches per key)
[12:35:00] [GATE] /permit: key=xiaohongshu_fresh allowed=true countInWindow=1/2
[12:35:03] [GATE] /permit: key=xiaohongshu_fresh allowed=true countInWindow=2/2
[12:35:06] [GATE] /permit: key=xiaohongshu_fresh allowed=false waitMs=54000
```

---

## 注意事项

1. **不持久化**：SearchGate 重启后队列清空，已授权的请求需重新申请
2. **单点服务**：所有平台共享一个 SearchGate（通过 `key` 隔离）
3. **独立于浏览器**：不受浏览器启停影响，可常驻后台
4. **Workflow 失败时**：如果 SearchGate 不可达，`WaitSearchPermitBlock` 会抛出异常，Workflow 失败
5. **调试模式**：可设置 `WEBAUTO_SEARCH_GATE_URL=http://127.0.0.1:7790` 覆盖默认端口

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `scripts/search-gate-server.mjs` | SearchGate HTTP 服务（主入口） |
| `scripts/search-gate-cli.mjs` | CLI（start/stop/restart/status） |
| `modules/workflow/blocks/WaitSearchPermitBlock.ts` | Workflow Block（申请许可） |
| `scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs` | Phase1 + 自动启动 Gate |
| `scripts/xiaohongshu/tests/test-search-gate.mjs` | 速率限制测试脚本 |
| `modules/workflow/definitions/xiaohongshu-collect-workflow-v2.ts` | 包含 WaitSearchPermitBlock 的 Workflow 定义 |
| `scripts/run-xiaohongshu-workflow-v2.ts` | Workflow Runner（已注册 WaitSearchPermitBlock） |

---

## 参考

- `AGENTS.md` § 新增规则（2025-01-06）：SearchGate 强制节流
- `container-library/xiaohongshu/README.md`：小红书容器定义与登录锚点
- `docs/arch/PORTS.md`：端口分配（7790 = SearchGate）
