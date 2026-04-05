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
