# WebAuto Agent Rules (Canonical)

本文件仅保留长期有效的协作规则、硬约束和入口索引。
具体任务、进度、验收、证据不在本文件堆叠临时过程。

---

## 0) WebAuto 调试唯一流程（2026-03-23，最高优先级）

> 本节高于历史调试细则；冲突时以本节为准。

1. **daemon 常驻 + task 派发**
   - 启动：`webauto daemon start`
   - 派发：`webauto daemon task submit --detach -- xhs unified ...`
   - 禁止：`webauto daemon relay ...`（已下线）
2. **调试分层执行（禁止跳层）**
   - L1 Operation（click/scroll/input/anchor-wait）
   - L2 编排单元（submit_search/open_detail/comments_harvest）
   - L3 单条闭环（1 条）
   - L4 批量（5→50→200）
3. **修改基础操作后，必须先手动 camo 验证**
   - 只有手动验证通过，才能进入自动脚本测试。
4. **等待必须锚点驱动**
   - 超时是最长等待时间，不是固定 sleep。
   - 锚点出现立即返回；禁止无锚点等待。
5. **文本输入规则（强制）**
   - 文本内容默认用 `fillInputValue`（evaluate 设置 value + input/change 事件）。
   - `keyboard.type` 不作为文本输入主路径（IME 干扰风险高）。
   - `keyboard:press` 仅用于快捷键（Enter/Meta+A 等）。
6. **XHS 调试策略默认值**
   - 默认 URL mode（非 click mode，除非用户明确要求）。
   - 评论阶段按 tab 轮转执行，`commentBudget` 用于轮转阈值（默认 50）。

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
7. **默认使用 headful（非 headless）启动**；除非用户明确要求 headless。

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

### 6.1 启动/关闭唯一真源（硬性限制）

**代码层面硬性限制**：xhs-unified/xhs-collect 入口已加入 daemon 环境检测，非 daemon 启动将直接拒绝。

| 操作 | 唯一命令 | 说明 |
|------|----------|------|
| 启动 daemon | `webauto daemon start` | 启动后台守护进程，管理所有任务 |
| 启动任务 | `webauto daemon task submit --detach -- xhs unified ...` | 通过 daemon 任务调度启动，进程不会丢失 |
| 查看任务状态 | `webauto xhs status --json` | 查看当前运行状态 |
| 查看 daemon 状态 | `webauto daemon status --json` | 查看 daemon 及所有 jobs |
| 停止任务 | API `POST /api/v1/tasks/<runId>/stop` | 停止指定 runId 的任务 |
| 停止 daemon | `webauto daemon stop` | 停止守护进程（会连带终止所有 jobs） |

**禁止行为**：
- ❌ `nohup node bin/webauto.mjs xhs unified ... &`（进程会被静默杀死）
- ❌ 直接 fork 子进程运行 xhs unified（无生命周期管理）
- ❌ 前台 exec 管道启动（管道断开进程丢失）

### 6.2 标准命令

```bash
# Daemon 管理（唯一启动/关闭真源）
webauto daemon start                          # 启动守护进程
webauto daemon status --json                  # 查看守护进程状态
webauto daemon stop                           # 停止守护进程

# 任务启动（必须通过 daemon task submit）
webauto daemon task submit --detach -- xhs unified --profile xiaohongshu-batch-1 --keyword "seedance2.0" --max-notes 100 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛" --env debug --tab-count 4
webauto daemon task submit --detach -- xhs collect --profile xiaohongshu-batch-1 --keyword "seedance2.0" --max-notes 100 --env debug

# 任务调度管理
webauto daemon task list --limit 20
webauto daemon task status --job-id <jobId>
webauto daemon task stop --job-id <jobId>
webauto daemon task delete --job-id <jobId>

# 任务状态查看
webauto xhs status --json
webauto xhs status --run-id <runId> --json

# WebAuto UI
webauto --help
webauto ui console --check
webauto ui console --build
webauto ui console --install
webauto ui console

# XHS 安装与状态
webauto xhs install --download-geoip --ensure-backend

# Camo 浏览器管理
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
- `camo`：**通用框架**（framework），提供 runtime 能力，**禁止包含任何业务特定文件**
- `webauto`：**业务项目**（application），负责业务编排与策略
- `modules/camo-runtime/`：vendor 代码，从 `@web-auto/camo` 复制非 CLI runtime 能力用于 app 端编排
- 发现业务逻辑进入 `camo` 时，必须回迁到 `webauto`
- 发现业务特定文件（如 `xhs-*.mjs`）进入 `@web-auto/camo` 时，必须移除并回迁到 `webauto` 的 `modules/camo-runtime/`

### 代码仓库关系

**modules/camo-runtime/**（webauto 项目内）：
- 定位：vendor 代码副本
- 说明：README.md 明确标注 "vendored from @web-auto/camo"
- 包含：autoscript schema/runtime + 业务特定代码（如 XHS）
- 用途：直接被 webauto 运行时使用
- 修改：在此修改业务特定功能（如 xhs-autoscript-*.mjs）

**node_modules/@web-auto/camo/**：
- 定位：独立 npm 包（@web-auto/camo）
- 来源：https://github.com/Jasonzhangf/camo.git
- 包含：通用 runtime 框架 + CLI 命令
- 用途：提供通用 runtime 能力
- 约束：**禁止包含业务特定文件**（如 xhs-*.mjs）

**架构原则**：
- camo 是框架层，保持通用性和可复用性
- webauto 是应用层，包含业务特定逻辑
- 业务文件（如 xhs-*.mjs）只存在于 webauto 项目内
- 框架升级时，业务项目更新依赖即可获得新能力


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

## 锚点驱动的超时与验证原则（强制）

### 核心设计原则

**超时 = 最长等待时间，不是固定等待时间**
- 超时是对"等待锚点出现"的最大时间限制
- 锚点出现应立即返回成功，不等超时到期
- 超时时间内锚点未出现才失败

**所有等待必须有锚点（强制）**
- **禁止无锚点等待**：任何 `sleep()`/`wait()` 必须伴随锚点检查，否则等待毫无意义
- 等待的目的是等锚点出现/变化，不是等时间流逝
- 如果无法定义锚点，说明操作本身设计有问题，需要重新审视

**容器锚点驱动**
- 所有操作以容器锚点为目标
- 超时和进度都看容器状态
- 一个容器不够就看多个容器
- 登录成功 = 登录容器锚点存在（不等 evaluate 完成）

### 错误示例（禁止）

```javascript
// 错误：固定等待
await operation();
await sleep(30000);  // 无脑等待30秒
const result = await validatePage();
```

### 正确示例

```javascript
// 正确：锚点轮询
const success = await waitForAnchor({
  selectors: ['.feeds-page', '.note-item'],
  timeoutMs: 30000,  // 最长等30秒
  intervalMs: 500,   // 每500ms检查一次
});
```

### 验证策略要求

1. **优先容器 selector 检查**（而非 evaluate）
2. **使用轮询机制**（而非固定等待）
3. **超时是最大等待时间**（不是强制等待）
4. **锚点出现立即返回**（不等待超时）

### 已知反模式

**Post validation 卡住**：
- 禁止在 validation 中调用无超时保护的 evaluate
- `goto_home` post validation 应检查容器锚点，不等 DOM snapshot


## 压力测试与巡检规范

### 启动压力测试前的必做事项
1. **使用 clock 工具设置巡检任务**（必须）
   - 每10分钟检查一次进度
   - 共6次（覆盖1小时）
   - 任务描述："巡检 XXX 压力测试：检查进度、状态、错误，并更新 clock.md"
   - clockMdSection: "## 巡检记录"

2. **更新 clock.md**（必须）
   - 在"不能忘的检查项"中记录：
     - runId
     - 目标数量
     - 关键字
     - 环境变量
     - 启动时间
     - 预计完成时间
   - 在"DELIVERY"中记录任务启动信息

3. **启动任务**
   - 使用标准命令启动
   - 记录任务输出（必要时）

4. **等待巡检**
   - 巡检任务会自动触发
   - 每次巡检更新 clock.md 的"## 巡检记录"区域

### Clock 工具使用示例
```json
{
  "action": "schedule",
  "items": [
    {
      "dueAt": "2026-03-16T14:35:00+08:00",
      "task": "巡检 XXX 压力测试：检查进度、状态、错误",
      "clockMdSection": "## 巡检记录",
      "recurrence": {
        "kind": "interval",
        "everyMinutes": 10,
        "maxRuns": 6
      }
    }
  ],
  "taskId": "test-name"
}
```

### 巡检时的操作
1. 检查任务状态：`webauto xhs status --json`
2. 记录进度、错误
3. 更新 clock.md 的"## 巡检记录"区域（append-only）
4. 如果发现异常，记录原因并采取行动

## 巡检延长策略

### 业务未完成时的巡检规则
当压力测试在初始巡检周期内未完成时：
1. **自动延长巡检**：不停止巡检，继续每10分钟检查一次
2. **记录策略变更**：在 clock.md 中明确记录"第N次巡检（初始巡检已用完，继续延长巡检）"
3. **更新预计完成时间**：根据当前进度重新计算
4. **持续监控**：直到任务状态为 completed/failed/unknown

### 巡检终止条件
只有满足以下条件之一才停止巡检：
- status: completed（成功完成）
- status: failed（失败）
- status: unknown（异常）
- progress >= total（达到目标）

### 示例
```
- [时间] 第7次巡检（6/6+）
  - 进度：25/200（12.5%）
  - 说明：初始巡检已用完，继续延长巡检
  - 巡检策略：每10分钟巡检，直到任务完成
```

## 定时任务维护规范

### 巡检期间的定时任务管理
每次巡检时必须检查并维护定时任务：

1. **检查现有定时任务**：使用 `clock action=list` 查看当前激活的定时任务
2. **保持最小激活数**：确保至少有3个激活的定时巡检任务
3. **及时补充任务**：如果激活任务少于3个，立即schedule新任务
4. **记录任务状态**：在clock.md的巡检记录中记录"定时任务状态"

### 定时任务设置示例
```json
{
  "action": "schedule",
  "items": [
    {
      "dueAt": "2026-03-16T15:27:00+08:00",
      "task": "巡检 deepseekAI 200 条压力测试：检查进度、状态、错误",
      "clockMdSection": "## 巡检记录",
      "recurrence": {
        "kind": "interval",
        "everyMinutes": 10,
        "maxRuns": 3
      }
    }
  ],
  "taskId": "inspection-task-1"
}
```

### 每次巡检检查清单
- [ ] 检查当前激活的定时任务数量（clock action=list）
- [ ] 确认激活任务 >= 3个
- [ ] 如果 < 3个，立即schedule新任务
- [ ] 在clock.md中记录"定时任务状态：N个激活任务"

## Clock 工具限制说明

### 当前环境问题
在webauto项目中使用clock工具时遇到以下限制：

1. **工具不可用**：clock命令在shell环境中找不到
2. **调用方式不明确**：通过exec_command调用clock工具的方法不正确
3. **依赖手动巡检**：当前只能依赖用户提供的Clock Reminder进行巡检

### 临时解决方案
1. **依赖用户提供的Clock Reminder**：系统会自动触发Clock Reminder
2. **记录巡检状态**：在clock.md中记录每次巡检结果
3. **保持巡检连续性**：每次Clock Reminder触发时立即执行巡检
4. **记录问题**：在"当前阻塞点"中明确记录clock工具的限制

### 长期解决方案
1. 确认clock工具的正确安装路径
2. 测试clock工具在当前环境下的调用方法
3. 如果clock工具不可用，考虑使用其他定时机制

### 巡检清单（当前环境）
- [ ] 检查任务状态
- [ ] 检查评论统计
- [ ] 更新clock.md的"## 巡检记录"区域
- [ ] 记录定时任务状态（如果clock工具可用）

## Clock定时任务设置规范（更新）

### 单任务多循环策略
**正确做法**：
- 设置1个clock定时任务
- 每次巡检后确保剩余至少3轮循环
- 如果剩余循环<3，立即补充任务

**错误做法**：
- ❌ 同时设置3个独立任务（会导致重复巡检）
- ❌ 设置后不检查剩余循环数
- ❌ 巡检记录模糊不清

### 巡检任务配置示例
```json
{
  "action": "schedule",
  "items": [{
    "dueAt": "2026-03-16T16:05:00+08:00",
    "task": "巡检 deepseekAI 200 条压力测试：检查进度、状态、评论统计、更新clock.md、检查并补充循环",
    "clockMdSection": "## 巡检记录",
    "recurrence": {
      "kind": "interval",
      "everyMinutes": 10,
      "maxRuns": 5
    }
  }],
  "taskId": "deepseekAI-inspection"
}
```

### 每次巡检必做事项
1. **检查任务状态**：`webauto xhs status --json`
2. **统计评论数据**：总数、平均值、最大/最小值
3. **更新clock.md**：追加巡检记录
4. **检查循环数**：确认剩余循环>=3
5. **补充循环**：如<3，立即通过clock.schedule补充

### 巡检记录格式
```
- [时间] 第N次（clock定时巡检）
  - 进度：X/200（Y%）
  - 状态：running/completed/failed
  - 错误：无/具体错误信息
  - 评论统计：总评论数、平均、最大、最小
  - clock定时任务状态：
    - 任务ID: xxx
    - 剩余循环: N轮
    - 下次巡检: 时间
```

---

## 🚨 问题处理标准操作（强制）

**遇到任何问题时，立即执行以下流程，不要询问用户意见**：

### 标准流程
```
检查日志 → 检查快照/截图 → 现场勘验 → 证据分析 → 直接修复 → 报告结果
```

### 检查清单

#### 1. 日志检查
```bash
# 任务事件日志
tail -200 ~/.webauto/state/<runId>.events.jsonl

# 桌面日志
tail -200 ~/.webauto/logs/desktop-lifecycle.jsonl

# 测试日志
tail -100 /tmp/xhs-test.log
```

#### 2. 快照/截图检查
```bash
# 最新截图
ls -lt ~/.webauto/download/xiaohongshu/debug/<keyword>/diagnostics/

# 诊断数据
cat ~/.webauto/download/xiaohongshu/debug/<keyword>/diagnostics/*.json | jq .
```

#### 3. 现场勘验
```bash
# 进程状态
ps aux | grep -E "camoufox|webauto" | grep -v grep

# Tab 数量
ps aux | grep "plugin-container.*tab" | grep -v grep | wc -l

# 服务健康
curl http://127.0.0.1:7701/health
curl http://127.0.0.1:7704/health
```

#### 4. 证据分析
- 预期状态 vs 实际状态
- 异常操作定位
- 根因确定

#### 5. 直接修复
- 不要等待确认
- 直接修改代码/配置
- 重启任务验证

### 禁止行为
- ❌ 询问用户"是否继续"
- ❌ 询问用户"怎么办"
- ❌ 只报告不行动
- ❌ 等待用户介入

### 强制行为
- ✅ 发现问题立即行动
- ✅ 先修复后报告
- ✅ 提供证据（日志/截图/命令输出）
- ✅ 验证修复效果

---

## 🚨 问题处理标准操作（强制）

**遇到任何问题时，立即执行以下完整流程，不要询问用户意见**：

### 完整流程
```
检查日志 → 检查快照/截图 → 现场勘验 → 证据分析 → 定位根因 → 实施修复 → 验证效果
```

### 关键原则
1. **不要只报告** - 发现问题必须行动
2. **不要只定位** - 定位根因后必须修复
3. **不要只修复** - 修复完成后必须验证
4. **不要等待确认** - 直接执行修复和验证

### 检查清单

#### 1. 日志检查
```bash
# 任务事件日志
tail -200 ~/.webauto/state/<runId>.events.jsonl

# 桌面日志
tail -200 ~/.webauto/logs/desktop-lifecycle.jsonl

# 测试日志
tail -100 /tmp/xhs-test.log
```

#### 2. 快照/截图检查
```bash
# 最新截图
ls -lt ~/.webauto/download/xiaohongshu/debug/<keyword>/diagnostics/

# 诊断数据
cat ~/.webauto/download/xiaohongshu/debug/<keyword>/diagnostics/*.json | jq .
```

#### 3. 现场勘验
```bash
# 进程状态
ps aux | grep -E "camoufox|webauto" | grep -v grep

# Tab 数量
ps aux | grep "plugin-container.*tab" | grep -v grep | wc -l

# 服务健康
curl http://127.0.0.1:7701/health
curl http://127.0.0.1:7704/health
```

#### 4. 证据分析
- 预期状态 vs 实际状态
- 异常操作定位
- 根因确定

#### 5. 定位根因
- 找到具体的代码/配置问题
- 分析为什么会出现这个问题
- 确定修复方案

#### 6. 实施修复（必须执行）
- 修改代码/配置
- 重启任务
- **禁止只定位不修复**

#### 7. 验证效果（必须执行）
- 确认问题已解决
- 任务正常运行
- 提供验证证据
- **禁止只修复不验证**

### 禁止行为
- ❌ 询问用户"是否继续"
- ❌ 询问用户"怎么办"
- ❌ 只报告不行动
- ❌ 只定位不修复
- ❌ 只修复不验证
- ❌ 等待用户介入

### 强制行为
- ✅ 发现问题立即行动
- ✅ 定位后必须修复
- ✅ 修复后必须验证
- ✅ 提供完整证据链
- ✅ 验证通过才报告

### 证据链要求
报告时必须提供：
1. 问题日志片段
2. 根因分析
3. 修复内容
4. 验证结果（命令输出/截图）

## 11) 输入法与键盘输入规则（强制）

1. **禁止依赖 keyboard.type 输入文本内容**：macOS 中文输入法（IME）会拦截 Playwright 的 `keyboard.type`，导致输入内容被吞、变形或超时。
2. **搜索输入框必须使用 fillInputValue**：通过 `evaluate()` 直接设置 `input.value`，绕过 input pipeline 和 IME。
3. **keyboard:press 仅限快捷键**：如 `Meta+A`（全选）、`Backspace`（删除）、`Enter`（提交）等不需要输入文本内容的键盘操作。
4. **browser-service input pipeline 是串行的**：所有 `keyboard:*` 和 `mouse:click` 操作通过 `withInputActionLock` 串行执行。一个操作卡住会阻塞后续所有输入操作。

```javascript
// ✅ 正确：用 fillInputValue 设置搜索关键字
await fillInputValue(profileId, ['#search-input', 'input.search-input'], keyword);

// ❌ 错误：用 keyboard:type 设置搜索关键字（会被 IME 干扰）
await callAPI('keyboard:type', { profileId, text: keyword, delay: 65 });

// ✅ 正确：用 keyboard:press 按快捷键
await pressKey(profileId, 'Enter');
```
