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

Tags: ensure_tab_pool, timeout, detail, tab, checkpoint, anchor
