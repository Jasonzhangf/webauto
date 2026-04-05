---
name: webauto-dev
description: WebAuto development workflow, architecture rules, and verification process
version: 1.0
---

# WebAuto Dev Skill (Project-Specific)
# Path: .agents/skills/webauto-dev/SKILL.md

---

## I. 架构原则（硬约束，最高优先级）

### 1.1 功能分层定义

| 层级 | 目录 | 职责 | 允许包含 | 禁止包含 |
|------|------|------|----------|----------|
| **L0 Shared** | `shared/` | 跨平台通用工具 | DOM 操作、API 通信、IO、Trace、State | 任何业务逻辑、选择器、平台特定流程 |
| **L1 Provider** | `action-providers/<platform>/` | 平台特定 DOM 与数据提取 | 选择器、提取脚本、风控检测、状态机 | 编排逻辑、UI 展示、多步流程控制 |
| **L2 Orchestrator** | `apps/webauto/entry/` | 业务流程编排 | 参数解析、任务调度、结果汇总 | DOM 操作、callApi 直接调用、底层 IO |
| **L3 UI** | Apps / Plugins | 用户交互展示 | CLI 输出、网页展示 | 业务逻辑 |

### 1.2 编排独立原则

**L0 和 L1 严禁编排逻辑混入！**
- L0 只提供原子函数，不管"怎么用"、"什么时候用"
- L1 只提供平台操作单元，不管"接下来做什么"、"失败了要不要重试"
- 所有多步流程、循环控制、错误重试、状态流转必须在 **L2 编排层** 实现
- **依赖方向只能向下**：L2 → L1 → L0，严禁反向导入

### 1.3 代码共享原则

- 跨平台复用的函数**必须**提取到 `shared/`
- 禁止 XHS 和 Weibo 各自实现相同逻辑
- 单一文件不超过 300 行，巨型文件拆分按职责切分

### 1.4 仓库边界

- `camo`：通用框架，禁止包含业务文件
- `webauto`：业务应用，所有业务逻辑在此
- `modules/camo-runtime/`：vendor 副本，业务代码修改在此

### 1.5 导入规则

```javascript
// ❌ 禁止：跨层导入（业务 → vendor 上层）
import { runCamo } from '../../../../../apps/webauto/entry/lib/camo-cli.mjs';

// ✅ 正确：从 shared 导入
import { callAPI, sleep } from '../../shared/api-client.mjs';
```

### 1.6 编码规范

- 文本输入用 `fillInputValue`（禁用 `keyboard.type` 防 IME）
- 快捷键用 `keyboard:press`
- **等待必须锚点驱动**：禁止无锚点 `sleep`/`wait`，必须 `waitForAnchor` + 轮询
- 锚点出现立即返回，超时 = 最长等待时间
- 单次 CDP 调用（click/scroll/evaluate/goto）用 `withTimeout` 防止基础设施卡死（默认 15s）
- **禁止对自终止业务操作加 operation 级超时**（见 1.7）

### 1.7 超时规则（硬约束，审计红线）

**原则：只有单次基础设施调用需要超时，自终止业务操作禁止加超时。**

| 操作类型 | 示例 | 超时 | 原因 |
|----------|------|------|------|
| 单次 CDP 调用 | click/scroll/evaluate/goto/pressKey | ✅ 15s | 可能基础设施卡死，无业务退出机制 |
| 自终止循环采集 | comments_harvest/detail_harvest/feed_like | ❌ 禁止 | 有自己的退出条件（到底/停滞/预算） |
| 导航等待 | open_detail/wait_for_anchor | ✅ 有上限轮询 | 锚点驱动，轮询有 maxAttempts |

**为什么自终止操作不需要超时**：
1. 耗时由页面内容决定，不可预测（200 条评论需要 3-8 分钟）
2. 固定超时只会杀掉正在进行的合法工作（实测 60s 超时导致 15 个帖子 coverage 12-83%）
3. 操作内部已有：锚点等待 + 停滞检测（stallRounds）+ 预算上限（commentBudget）+ 到底检测（reachedBottom）
4. CDP 级别的单次操作（scroll/evaluate）已有自己的 `withTimeout` 保护

**在 `runtime.mjs:getDefaultTimeoutMs()` 中维护白名单**：
```javascript
const SELF_TERMINATING_ACTIONS = new Set([
  'xhs_detail_harvest', 'xhs_comments_harvest', 'xhs_expand_replies',
  'xhs_comment_match', 'xhs_comment_like', 'xhs_comment_reply',
  'xhs_feed_like', 'xhs_feed_like_tab_switch',
]);
if (SELF_TERMINATING_ACTIONS.has(action)) return 0; // 无超时
```

**新增任何长运行操作时，必须同步更新此白名单。**

---

## II. 开发流程（9 步，严格按序）

| 步骤 | 动作 | 产出 |
|------|------|------|
| 0 | **前置检查** | `git pull`, 读 CACHE.md / MEMORY.md |
| 1 | **理解需求** | 明确目标，对齐用户预期 |
| 2 | **代码审查** | 读现有代码，评估影响范围，避免盲改 |
| 3 | **设计文档** | `docs/arch/<name>-design.md`（中大型改动） |
| 4 | **编写代码** | 分层清晰，复用 `shared/`，单文件 <300 行 |
| 5 | **本地验证** | `node -e "import(...)"`，语法/import 检查 |
| 6 | **提交推送** | 一个 commit 一件事，`git push` |
| 7 | **手动 Camo 真机验证** | 见下方详细说明 |
| 8 | **自动编排测试 E2E** | 见下方详细说明 |
| 9 | **记录清理** | 更新 MEMORY.md / 清理 CACHE.md |

### Step 7：手动 Camo 真机验证

**必须手动跑一遍完整流程，通过后才允许进 Step 8**
1. 用 `camo` 命令手动打开浏览器，进入待验证页面
2. 按操作流程逐步执行（导航→输入→点击→滚动→提取）
3. 每步检查：DOM 状态、输入内容、锚点出现、提取结果
4. 记录实际选择器是否匹配，无锚点等待是否合理
5. **失败不能进 Step 8**，必须修复后重跑直到手动通过

### Step 8：自动编排测试 E2E

1. 提交 daemon task：`webauto daemon task submit --detach -- xhs unified ...`
2. 等待任务完成后检查日志（`~/.webauto/logs/*.log`）和事件文件
3. 验证：无报错、采集数量符合预期、输出文件生成
4. **失败立即回到 Step 4 修复**

---

## III. 验证清单

### Phase 1：本地验证
- [ ] Import 无报错（`node -e "await import('...')"`）
- [ ] 无跨层导入（禁止从 vendor 导入应用层代码）
- [ ] 代码结构清晰（L0/L1/L2 职责不混）
- [ ] 编码规范检查

### Phase 2：手动 Camo
- [ ] 流程可完整跑通
- [ ] 选择器匹配正确
- [ ] 等待有锚点
- [ ] 无无意义 sleep
- [ ] 自终止操作无 operation 级超时

### Phase 3：自动 E2E
- [ ] daemon 任务启动成功
- [ ] 日志无 operation_timeout 错误
- [ ] 采集数量符合预期
- [ ] 覆盖率 ≥ 90%（评论采集）
- [ ] 输出文件正常

---

## IV. 交付诚实原则（最高优先级红线）

**任何涉及浏览器操作或数据采集的交付，必须遵守：**

1. **截图验证前置**
   - 必须截图 → 自己打开截图检查页面内容 → 确认状态符合预期 → 才能汇报"完成"
   - 禁止未看截图就宣称成功
   - 禁止把"脚本跑完没有报错"等同于"数据采集成功"

2. **时间戳强制校验**
   - 截图/日志文件的时间戳必须与当前任务时间匹配
   - 禁止用旧任务的文件充当新任务的结果
   - 每次验证前确认 runId/timestamp，确保是**本次 run 产出**

3. **内容实质校验**
   - 截图不能是首页/空白页/加载中
   - 必须显示**预期状态**（如：评论列表已展开、详情内容完整、提取数据非空）
   - 日志中必须看到实际的业务数据行（如 `content`, `author`, `commentCount`）

4. **问题重分析流程（失败时）**
   - 发现截图/日志不符 → **立即承认汇报有误**
   - 重新检查：日志路径 + 事件文件 + 进程状态 + 截图
   - 定位根因（代码/环境/调度）→ 修复 → 重跑
   - 再次截图验证 → 确认无误 → 汇报

5. **交付物证据链**
   每次交付必须同时提供：
   - ✅ 命令执行输出（含 exit code）
   - ✅ 日志关键片段（含时间戳和业务数据）
   - ✅ 截图文件路径 + 截图内容描述
   - ✅ 状态文件内容（如 `events.jsonl` 关键行）
   - ✅ 输出文件预览（如 `posts.jsonl` 前几行）

6. **未验证不许声称完成**
   - 在浏览器真实线上验证通过之前，只能说"代码已修改，待验证"
   - 不能把"本地 import 通过"等同于"功能正常"
   - 不能把"脚本跑完无报错"等同于"采集成功"

---

## V. 注意事项

1. 中大型改动必须先写设计文档（`docs/arch/`），经批准后再编码
2. 禁止无锚点的 sleep/wait — 所有等待必须有明确的 anchor
3. 文本输入用 `fillInputValue`（防 IME 吞字符）
4. 禁止 broad kill（`pkill`/`killall`/`kill $(...)`）
5. **手动验证→自动测试**：任何页面级改动必须手动 camo 先跑一次，通过后再 daemon E2E
6. 检查工具输出结果，不基于假设认为成功
7. **编排逻辑只在 L2**：action provider 不包含多步流程控制
8. **交付必须有截图证据**：不可仅凭"没有报错"宣称成功
9. **时间戳对齐**：所有截图和日志必须是本次任务产生的，不可复用旧数据
10. **新增长运行操作时同步更新超时白名单**（见 1.7）

---

## VI. 待验证修改记录

> 本节记录所有已修改但**尚未通过浏览器真实线上验证**的改动。
> 每条记录在 E2E 验证通过后标记为 ✅ 并移入 MEMORY.md。

| 日期 | 修改内容 | 文件 | 状态 |
|------|----------|------|------|
| 2026-04-04 | 移除自终止业务操作超时（comments_harvest 等 8 个 action 返回 0） | `runtime.mjs` | ⏳ 待 E2E 验证 |
| 2026-04-04 | weibo 切换 shared 导入（common.mjs 重写、删除 trace/diagnostic-utils） | `weibo/common.mjs`, `harvest-ops.mjs` | ⏳ 待 E2E 验证 |

---

## VII. 压力测试与巡检流程（硬约束）

**核心原则：发现关键错误后，立即停止压力测试和巡检，修复后重跑，不浪费资源。**

### 完整流程

```
开始 E2E 测试
  │
  ├─ Step 1: 启动任务 + 设置巡检 clock
  │
  ├─ Step 2: 早期检查（3-5 分钟后）
  │   └─ 检查任务是否正常运行，数据是否开始产出
  │
  ├─ Step 3: 关键逻辑验证（发现数据后立即检查）
  │   ├─ ❌ 发现关键错误（如：tab 轮转后未恢复暂停帖子、覆盖率异常）
  │   └─ 立即执行：
  │       1. 停止当前任务（daemon task stop）
  │       2. 取消所有巡检 clock（clock cancel）
  │       3. 分析根因，定位代码问题
  │       4. 修复代码 + 提交推送
  │       5. 设计验证方案（针对修复的逻辑点）
  │       6. 重新启动任务 + 设置巡检
  │       7. 回到 Step 2
  │
  │   └─ ✅ 逻辑验证通过
  │       └─ 继续巡检，等待任务完成
  │
  ├─ Step 4: 任务完成后全面检查
  │   ├─ 覆盖率统计
  │   ├─ 错误分析
  │   └─ 截图验证
  │
  └─ Step 5: 汇报结果
```

### 关键规则

1. **发现关键错误立即停止**：不继续跑无效的压力测试，浪费时间
2. **先修复后重跑**：不在错误代码上反复测试，修复确认后再跑
3. **巡检不是 babysitter**：巡检只监控进度，不代替逻辑验证
4. **早期验证更重要**：前 5 分钟的检查比后 1 小时的巡检更有价值
5. **针对性验证**：修复后重跑时，巡检/check 优先检查修复的那个逻辑点

### "关键错误"定义

- Tab 轮转后未恢复暂停的帖子（PAUSED but never RESUMED）
- 覆盖率异常低（< 50%）且原因不是帖子本身无评论
- TIMEOUT 错误重新出现（已修复的超时问题回归）
- 同一帖子在同一 tab 反复出现且 used 不重置
- 采集数据为空或格式异常
- 任务启动后长时间无任何数据产出（5 分钟以上）

---

## VIII. Tab 轮转设计规范（硬约束）

### 核心原则

Tab 轮转的目的：用多 tab 并行采集，每个 tab 有预算上限（如 50 条评论），预算耗尽后切换到下一个 tab，最终所有 tab 轮转一圈后回到原 tab 继续采集未完成的帖子。

### 关键函数职责

| 函数 | 职责 | 何时调用 |
|------|------|----------|
| consumeTabBudget | 累加当前 tab 的 used 计数 | 每次评论采集后 |
| shouldPauseForTabBudget | 检查 used >= limit | comments_harvest 结束时 |
| advanceTabAndReset | 切换 tab + 重置 used | tab_switch_if_needed |
| readDetailSlotState | 读取当前 tab 的 slot 状态 | open_next_detail |
| resetDetailLinkSlot | 删除 slot + 清理状态 | close_detail (completed/failed) |

### 生命周期状态转换

[新帖子] → open_detail → [active] → comments_harvest → used >= limit? → [paused]
[paused] → saveResumeAnchor → tab_switch → 切换到其他 tab
[其他 tab 完成] → tab_switch → 回到原 tab → open_next_detail 检测 paused+resumeAnchor → [resumed]
[resumed] → comments_harvest 继续采集 → 到底? → [completed] → resetDetailLinkSlot

### 常见错误模式

**错误 1：PAUSED 时误删 slot**
finalize_detail_link 返回 deferred_rotation 后必须 return，否则后续 delete activeByTab 会误删 paused 状态。
修复：PAUSED 路径 return 后不执行后续清理，只有 completed/failed 才调用 resetDetailLinkSlot。

**错误 2：advanceTab 时 used 未重置**
只重置目标 tab 不重置当前 tab，导致 used 累积。
修复：advanceTabAndReset 离开和进入都清零 used。

### 验证检查点

日志中搜索：
- method=deferred_rotation：PAUSED 正确返回
- reused=True：成功恢复暂停帖子
- tab_switch tab=N target=M：tab 切换正确
- 同一 noteId 在不同时间出现多次 = 轮转恢复成功

---

## IX. 经验教训记录（持续更新）

### 2026-04-05：Tab 轮转恢复失败

**问题**：Tab 1 采集帖子 A，预算耗尽 PAUSED → 切换到 Tab 2 → 回到 Tab 1 时没有恢复帖子 A，取了新帖子 B。

**根因**：finalize_detail_link 在 PAUSED 时返回 deferred_rotation 后，旧代码继续执行 delete activeByTab[tabIndex]，把 slot 状态全删了。

**修复**：
1. PAUSED 路径 return 后不再执行后续清理
2. 只有 completed/failed 才调用 resetDetailLinkSlot
3. open_next_detail 检测到 paused+resumeAnchor 时跳过 claim，直接用旧 link

**教训**：
- 状态清理逻辑必须明确区分 PAUSED 和 COMPLETED
- PAUSED 意味着暂停但未完成，slot 必须保留
- 测试时检查 reused=True 是否出现，验证恢复路径

### 2026-04-05：超时统一架构

**问题**：operation timeout 60s 截断了大评论帖（200+ 条）的采集，覆盖率只有 12-83%。

**根因**：超时策略分散在 3 处（runtime.mjs / browser-service.mjs / input-pipeline），改一处不改其他无效。

**修复**：
1. 统一到 shared/api-client.mjs（DEFAULT_API_TIMEOUT_MS = 30s）
2. runtime.mjs 白名单（SELF_TERMINATING_ACTIONS）return 0
3. camo input-pipeline 也改为 30s

**教训**：
- 自终止操作（循环采集）不需要超时，有自己的退出机制
- 超时只用于单次基础设施调用（CDP/HTTP）
- 测试时检查 operation_error 中是否有 TIMEOUT

### 2026-04-04：SKILL.md YAML frontmatter

**问题**：webauto-dev skill 加载失败，报 missing YAML frontmatter delimited by ---。

**根因**：.agents/skills/webauto-dev/SKILL.md 第一行不是 ---，Codex 无法解析。

**修复**：在文件开头加上 YAML frontmatter（name/description/version）。

**教训**：所有 .agents/skills/*/SKILL.md 必须以 YAML frontmatter 开头。

---

## X. 待验证修改记录

| # | 修改内容 | 文件 | 状态 | E2E 任务 ID |
|---|----------|------|------|-------------|
| 1 | 移除自终止业务操作超时（8 个 action 返回 0） | runtime.mjs | ✅ 验证通过 | job_1775319270899_63a02cef |
| 2 | 超时统一到 shared/api-client.mjs（30s 默认） | shared/api-client.mjs, browser-service.mjs | ✅ 验证通过 | job_1775319270899_63a02cef |
| 3 | Tab 轮转恢复暂停帖子 | detail-flow-ops.mjs, detail-slot-state.mjs | ✅ 验证通过 | job_1775386786117_cc64cb73 |
| 4 | weibo 切换 shared 导入 | weibo/*.mjs | ⏳ 待 E2E | - |

## XI. CDP 拥堵与双队列架构（2026-04-05）

### 问题
- `evaluate()` 直接走 CDP 无锁，subscription polling（500ms×6）堵塞 `keyboard:press`
- 导致 input 操作延迟 70+ 秒，30s 超时误报

### 解决
- **双队列分离**：Input Lock（keyboard/mouse）+ Read Lock（evaluate/query）
- **Subscription 降频**：500ms → 2000ms
- **Health API**：`/health` 返回 `inputPipeline` + `readPipeline` 状态

### 规则
1. 所有 `page.evaluate()` 必须走 `withReadLock`
2. 所有 `keyboard:press`/`mouse:click` 走 `withInputActionLock`
3. 两个队列独立，互不阻塞
4. Read 操作有 10s 硬超时熔断
5. Windows 下 CDP 不稳定，需要 non-CDP fallback（platform.js 骨架已创建）

### 验证
- `curl http://127.0.0.1:7704/health` → 检查两个 pipeline 的 `healthy` 状态
- keyboard:press latency 应 < 3s（P99）

## XII. CDP 拥堵修复验证（2026-04-06）✅

### 问题根因
- **Subscription polling 过频**：500ms × 6 selectors = 每秒 12+ 次 `page.evaluate()`
- **evaluate 无锁**：直接走 CDP，与 keyboard:press 共享连接，造成队头阻塞
- **现象**：keyboard:press 延迟 70+ 秒，30s 超时误报 35 次

### 修复方案（camo@0.3.4）

| 修复 | 文件 | 效果 |
|------|------|------|
| **Read Lock 队列** | `input-pipeline.js` | evaluate/query 走独立队列，10s 熔断 |
| **evaluate 包裹 withReadLock** | `BrowserSession.js` | 不再堵塞 input 队列 |
| **Subscription 降频** | `subscription.mjs` | 500ms → 2000ms（-75% CDP 压力） |
| **Health API** | `browser-service/index.js` | `/health` 返回双 pipeline 状态 |

### 架构设计

```
┌───────────────────────────────────────────┐
│           CDP Connection                  │
├─────────────────┬─────────────────────────┤
│ Input Queue     │ Read Queue              │
│ (keyboard/mouse)│ (evaluate/query)        │
│ withInputLock   │ withReadLock            │
│ 15s timeout     │ 10s timeout             │
└─────────────────┴─────────────────────────┘
```

### E2E 验证结果

| 指标 | 修复前 (0.3.3) | 修复后 (0.3.4) |
|------|---------------|---------------|
| keyboard:press timeout | 35 | **0** ✅ |
| evaluate timeout | 0 | **0** ✅ |
| Total operation errors | 35 | **0** ✅ |
| Subscription 频率 | 360/min | **90/min** ✅ |

### 规则更新（强制）

1. **所有 `page.evaluate()` 必须走 `withReadLock`** — 直接调用 CDP 视为架构违规
2. **Subscription throttle 不得低于 2000ms** — 除非有特殊风控绕过需求
3. **Health 检查**：`curl http://127.0.0.1:7704/health` 应返回 `inputPipeline.healthy=true` + `readPipeline.healthy=true`
4. **P99 latency 监控**：keyboard:press 应 < 3s，超过 5s 需告警

### Windows 兼容性

- `platform.js` 已创建骨架，用于 Windows 下 non-CDP fallback
- 当前 Mac/Linux 走 CDP 路径，Windows 待实现 WebSocket/HTTP 直连

## XIII. Clock 定时工具使用规则（2026-04-06）✅

### 强制规则

**任何超过 2 分钟的等待必须使用 `clock.schedule`，禁止使用 `sleep` 或轮询。**

### 正确用法

```bash
# 30 分钟巡检，共 8 轮
clock schedule \
  --due-at "$(date -u -v+30M +%Y-%m-%dT%H:%M:%S%z)" \
  --task "巡检 E2E 任务：检查进度、错误、覆盖率" \
  --clockMdSection "## 巡检记录" \
  --recurrence "interval:30m,maxRuns:8"
```

### 错误示例

```bash
# ❌ 禁止：长时间 sleep
sleep 1800  # 等待 30 分钟

# ❌ 禁止：轮询脚本
while true; do check_status; sleep 60; done
```

### Clock.md 格式

```markdown
## 背景
E2E 压力测试验证 camo@0.3.4 修复效果

## 当前阻塞点
等待任务完成（预计 2-4 小时）

## 下次提醒要做的第一步
1. 检查 daemon status
2. 读取 job 日志最后 100 行
3. 统计 operationErrors（TIMEOUT 计数）
4. 更新"## 巡检记录"

## 不能忘的检查项
- keyboard:press timeout 应为 0
- evaluate timeout 应为 0
- 覆盖率 > 90%
```

### 巡检记录格式

```markdown
## 巡检记录

- [HH:MM] 第 N 次巡检（clock 定时）
  - Job: job_xxx
  - 状态：running/completed/failed
  - 进度：X/50 notes
  - 错误：N 个 operationErrors
  - TIMEOUT: N 个
  - 下次巡检：HH:MM
```

### 规则原因

1. **非阻塞**：clock 是后台定时，任务可继续执行其他工作
2. **持久化**：clock.md 记录完整巡检历史，便于事后审计
3. **自愈**：即使终端断开，clock 仍会触发提醒
4. **可追溯**：每次巡检 append-only，不覆盖历史
