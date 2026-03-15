# WebAuto Agent Rules (Canonical)

本文件仅保留长期有效的协作规则、硬约束和入口索引。
具体任务、进度、验收、证据不在本文件堆叠临时过程。

---

## 1) 回复与执行规则（强制）

1. 以工具调用为准：真正执行必须落在命令/工具调用，纯口头状态不算完成。
2. 不做空转汇报：无实际动作时，不输出冗长进度废话。
3. 默认直接执行：可自行查询、规划并推进；仅在高风险/不确定时再询问。
4. 优先连续推进：除非被阻塞，不要无意义暂停。

---

## 2) Clock 定时工具规则（强制）

### 2.1 唯一工具
- 所有定时相关能力只使用 `clock`。
- 禁止用轮询脚本、sleep、外部 cron、伪造“定时回复”等方式替代。

### 2.2 调用规范
- `dueAt` 必须是 ISO8601 绝对时间（含时区）。
- 每个提醒必须有唯一 `clockMdSection`，用于映射到 `clock.md` 任务区块。
- 允许 recurrence（如 interval / daily / weekly），但需遵守参数约束。

### 2.3 clock.md 任务结构（标准化）
每个任务区块必须包含并长期维持以下字段/子区块：
- 元字段：`STATUS`、`TASK`、`NEXT_DUE_AT`、`OWNER`、`EPIC_POLICY`
- `### DELIVERY`
- `### REVIEW`
- `### APPROVE`

### 2.4 到点触发行为
- 到点后先读取对应 `clock.md` 区块。
- 若 `DELIVERY` 有内容：先走 AI review，再写入 `REVIEW`。
- `DELIVERY` 必须 **append-only**（只能追加，不可覆盖历史）。
- 审核通过后写入 `APPROVE`，写入长期记忆，然后**初始化** `clock.md`。

### 2.5 审核信息隔离
- 提交侧（主模型）应看到审核结论（`REVIEW_RESULT` / `REVIEW` / `APPROVE`）。
- 审核侧提示词与内部审查策略不得泄露给提交侧。
- 必须做到“结果可见、审查提示不可见”。

### 2.6 初始化语义
- “清空 clock.md”不等于留空文件。
- 必须重置为初始化模板，并确保流程进入 DELIVERY/REVIEW/APPROVE 闭环。

---

## 3) Memory / Cache 规则（强制）

### 3.1 文件职责
- `MEMORY.md`：长期记忆（Long-term），记录稳定约束、架构决策、可复用经验。
- `CACHE.md`：短期会话缓存，记录最近模型与用户对话、工具结果、review 过程。

### 3.2 写入要求
- 任务进行中：短期信息写 `CACHE.md`。
- 阶段完成/任务完成：将可复用结论追加到 `MEMORY.md`（长期）。
- `CACHE.md` 不允许截断关键轮次；需保留完整有效上下文。
- `MEMORY.md` 长期区默认只追加，不随意删改历史。

### 3.3 触发原则
- 用户明确要求“记住/保存记忆”时，必须写入记忆。
- 用户要求“查询记忆/回忆”时，先检索记忆再执行实现。
- 反复出现的偏好、命令、约束应沉淀到长期记忆。

---

## 4) 开发与验证要求（强制）

1. 任何失败先看日志再判断，反馈中必须附日志路径：
   - `~/.webauto/logs`
   - `~/.webauto/download/.../run.log`
2. 任何“已完成”必须给证据：命令、关键输出（runId/耗时/计数）、日志路径。
3. 每次改动后至少跑一条 `webauto ui cli` 最小链路（start/status/stop 或等价）。
4. 对外汇报前，必须通过一次完整 E2E；失败则先修复再重跑。
5. 新功能要求：唯一实现、配套单测与回归、覆盖率目标可说明。
6. 禁止默认 fallback；除非用户明确要求。

---

## 5) 端口与健康检查

| 端口 | 服务 | 说明 |
|---|---|---|
| 7701 | Unified API (HTTP + WebSocket + Bus) | 主入口 |
| 7704 | Camo Runtime (HTTP) | camo 会话管理 |
| 8765 | Camo Runtime WebSocket | camo 实时通道 |

快速检查：

```bash
curl http://127.0.0.1:7701/health
curl http://127.0.0.1:7704/health
```

---

## 6) CLI 标准入口

```bash
# WebAuto
webauto --help
webauto ui console --check
webauto ui console --build
webauto ui console --install
webauto ui console

# XHS
webauto xhs install --download-geoip --ensure-backend
webauto xhs unified --profile xiaohongshu-batch-1 --keyword "seedance2.0" --max-notes 100 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛" --env debug --tab-count 4
webauto xhs status --json

# Camo
camo help
camo init
camo start xiaohongshu-batch-1 --url https://www.xiaohongshu.com --alias xhs-main
camo status xiaohongshu-batch-1
camo stop --alias xhs-main
camo stop all
```

Windows 优先 `pwsh` / `powershell`。

---

## 7) 架构与分层（强制）

- 三层强制：
  - Block 层：原子能力
  - App/Orchestrator 层：流程编排
  - UI 层：展示与交互触发
- 同一能力必须单一真源，禁止并行实现。
- UI 与业务逻辑必须解耦。

仓库边界：
- `webauto`：业务编排与策略
- `camo`：通用 runtime 能力
- 发现业务逻辑进入 `camo` 时，必须回迁到 `webauto`。

---

## 8) 小红书风控与执行约束（强制）

1. 页面状态判断必须基于容器锚点，不以 URL 作为唯一依据。
2. 搜索必须页面内输入并回车，禁止构造 URL 直达搜索。
3. 详情直达仅允许已采集且含 `xsec_token` 的安全链接。
4. 禁止从 href 自行拼接 token。
5. 所有搜索先过 SearchGate 限流。

执行顺序：
- 账号有效性检查 → 链接采集 → 帖子逐条处理。
- 登录无效直接阻断，不进入后续阶段。

---

## 9) 系统级操作原则（强制）

1. 用户操作统一经 `camo` 执行。
2. 点击/输入/滚动/按键必须走系统级事件链路。
3. JS 仅允许读状态（rect/可见性/文本），禁止 JS 直接操作行为。
4. 同一 profile 的交互动作必须串行（单 in-flight）。

---

## 10) 调试与诊断

调试与诊断流程已迁移到文档：
- `docs/arch/webauto-debugging.md`
