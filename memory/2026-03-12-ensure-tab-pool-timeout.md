# ensure_tab_pool 超时问题分析

## 背景

`detail` 模式下 `ensure_tab_pool` 操作卡住，没有 `operation_done` 事件。

## 问题分析

### 1. 当前实现的问题

**无条件轮询等待：**
```javascript
// tab-pool.mjs: waitForTabCountIncrease
while (Date.now() - startedAt <= waitMs) {
  const listed = await callApiWithTimeout('page:list', { profileId }, listTimeoutMs);
  const { pages } = extractPageList(listed);
  if (pages.length > beforeCount) {
    return { ok: true, ... };
  }
  await sleep(effectivePollMs);
}
```

**问题：**
- `seedOnOpen: false` 导致新标签页是 `about:blank`
- `page:list` 返回的页面数量可能不会立即增加
- 轮询等待超时（`tabAppearTimeoutMs` 默认 20s+）

### 2. 根本原因

**不应该无条件等待，应该看锚点：**

当前逻辑：
1. 发送 `newPage` 命令
2. 等待页面数量增加
3. 如果增加，继续

**应该改成：**
1. 发送 `newPage` 命令
2. 检查新页面是否出现（通过 checkpoint/container）
3. 如果出现，继续

### 3. 具体配置问题

**xhs-autoscript-ops.mjs 中的配置：**
```javascript
{
  id: 'ensure_tab_pool',
  params: {
    tabCount,
    openDelayMs: tabOpenDelayMs,  // ~2700ms
    minDelayMs: tabOpenMinDelayMs,
    reuseOnly: false,
    normalizeTabs: false,
    seedOnOpen: false,  // 问题：不加载 URL
    shortcutOnly: false,
  },
  timeoutMs: 180000,  // 3 分钟超时
}
```

**问题：**
- `seedOnOpen: false` = 打开空白页
- `tabAppearTimeoutMs = Math.max(20000, openDelayMs + 15000)` = ~20-40 秒
- `openCommandTimeoutMs = Math.max(60000, apiTimeoutMs, tabAppearTimeoutMs + 30000)` = 60-90 秒

### 4. 修复方案

**方案 A：修改 ensure_tab_pool 逻辑**
- 增加锚点检测（checkpoint）
- 不再无条件轮询 `page:list`
- 检测特定 container 出现后再继续

**方案 B：修改 XHS 配置**
- `seedOnOpen: true` 并传入 seed URL
- 或在 detail 模式下跳过 `ensure_tab_pool`

**方案 C：简化 tab pool**
- detail 模式不需要多 tab
- 用单 tab 轮转

### 5. 下一步

1. 确认 detail 模式是否真的需要 `ensure_tab_pool`
2. 如果需要，修改检测逻辑为锚点检测
3. 如果不需要，在 detail 模式下禁用或简化

## 6. 2026-03-12 新增需求（用户明确）

用户要求把 detail 阶段交接后的运行状态机固定为：

1. 评论爬取到“当前 detail 结束”后必须立即更新 slot 状态；
2. 按 4-tab 轮转规则推进：
   - 当前 tab 评论未到 50：同 tab 直接请求下一个链接；
   - 当前 tab 评论达到 50：切换下一 tab；
   - 若目标 tab 不存在且未超过 4 tab：自动补开新 tab；
   - 若无可用链接：终态结束。

补充约束：
- 不改 collect 逻辑；
- 单一真源放在 detail loop（comments_harvest -> close/wait -> tab switch -> open_next）。

## 7. 差距定位（实现前）

- 现有 `xhs_tab_switch_if_needed` 在目标 slot 缺失时直接返回 `TAB_POOL_SLOT_MISSING`；
- 不满足“无 tab 时自动开新 tab（<=4）”的状态机要求；
- 这会导致 detail loop 在轮转分支上停滞，出现 running 卡住风险。

## 8. 已落地实现（2026-03-12）

### 代码对齐

- 文件：`modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs`
  - 新增 runtime tabPool 自修复与补槽逻辑：
    - `ensureRuntimeTabPool`
    - `normalizeAndSyncSlots`
    - `resolveTabSeedUrl`
    - `ensureTabSlotReady`
    - `rotateToTargetTab`
  - 轮转分支不再在 slot 缺失时直接失败；
  - 当 `targetTabIndex` 不存在且 `currentSlots < tabCount` 时，自动 `newPage` 补开 tab，再切换；
  - 仍保持上限受 `tabCount` 约束（4-tab 场景由配置提供 `tabCount=4`）。

- 文件：`tests/unit/webauto/xhs-tab-switch.test.mjs`
  - 新增用例：
    - `creates a missing next tab slot (<=tabCount) before switching during paused-slot rotation`
  - 覆盖路径：`page:list -> newPage -> page:list -> page:switch`
  - 断言 `createdTabs=1` 与 runtime slot 扩容生效。

### 验证证据

- 单测命令：
  - `npm run -s test -- tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - 结果：通过（0 fail）

- UI CLI 最小链路：
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`
  - 结果：通过，状态 ready=true

- UI CLI 全链路覆盖：
  - `node bin/webauto.mjs ui cli full-cover --json`
  - 结果：通过
  - 报告：`/Users/fanzhang/Documents/github/webauto/.tmp/ui-cli-full-cover-2026-03-12T03-08-12-291Z.json`

## 9. 2026-03-12 追加：safe-link detail 不再执行“关闭详情”动作

### 用户确认的行为变更

- “用链接打开的 detail 不存在模态框，没有关闭按钮，直接 goto 新链接”。
- 即：在 `openByLinks=true` 的 detail loop 中，`close_detail` 只做队列终结（done/release），不再尝试 `Esc/X/back/goto-list` 关闭动作。

### 落地改动

- 文件：`modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`
  - `executeCloseDetailOperation` 新增 openByLinks 早返回分支：
    - paused slot：`deferred_rotation`（维持原行为）
    - stale closed：`release(... skip=true, reason=stale_closed)`（维持防重开语义）
    - completed/failed：仅做 `complete/release`，`method=link_finalize_only`
  - 非 openByLinks 场景保留原有 close 逻辑。

- 文件：`tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - 原 “back 关闭” 用例改为“link_finalize_only，不触发关闭动作”；
  - 断言 `callAPI` 不再出现 `keyboard:press/page:back/goto`。

### 验证补充

- 单测命令：
  - `npm run -s test -- tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - 结果：通过（0 fail）

- 修改后 UI CLI 最小链路：
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`
  - 结果：通过（ready=true，pid=46818）

Tags: ensure_tab_pool, timeout, detail, tab, checkpoint, anchor, state-machine, 4tab, tab-rotation, dynamic-tab-create, comments-budget
