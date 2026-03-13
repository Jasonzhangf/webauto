# Collect 终态状态机 (2026-03-13)

## 终态触发条件

### 1. COLLECT_REACHED_BOTTOM
- **触发条件**: 检测到页面底部标记文本
- **检测方式**: `readSearchBottomMarker()` 返回 `found: true`
- **优先级**: 最高（立即终止）

### 2. COLLECT_DUPLICATE_EXHAUSTED
- **触发条件**: 连续5轮只发现重复链接（无新链接）
- **计数器**: `state.collectDuplicateOnlyRounds`
- **阈值**: `maxDuplicateOnlyRounds = 5`
- **重置条件**: 发现新链接时重置为0

### 3. COLLECT_SCROLL_STUCK
- **触发条件**: 连续3轮无法滚动
- **计数器**: `state.collectScrollStuckRounds`
- **阈值**: `maxScrollStuckRounds = 3`
- **重置条件**: 成功滚动时重置为0

## 状态管理函数

### 重复链接检测
- `markDuplicateOnly()`: 标记当前轮次只发现重复链接
- `resetDuplicateOnly()`: 当有新链接添加时重置计数器
- `checkDuplicateOnlyTerminal()`: 检查是否达到阈值

### 滚动卡住检测
- `markScrollStuck()`: 标记当前轮次滚动卡住
- `resetScrollStuck()`: 成功滚动后重置计数器
- `checkScrollStuckTerminal()`: 检查是否达到阈值

## 验证结果 (2026-03-13)

### 50条测试
- **runId**: 743912a8-94cd-4633-8f77-10d0a9fc6578
- **结果**: 成功收集50条，正常结束
- **terminalCode**: AUTOSCRIPT_DONE_LINKS_COLLECTED

### 500条压力测试
- **runId**: f299529a-ec41-4062-8176-c713fab2e40c
- **结果**: 在220条时触发 COLLECT_DUPLICATE_EXHAUSTED
- **原因**: 连续5轮只发现重复链接，页面内容已耗尽
- **收集数量**: 220条
- **所有链接**: 都包含 xsec_token
- **截图证据**: 显示搜索结果页面，无更多新内容

## 结论

终态状态机工作正常：
1. COLLECT_DUPLICATE_EXHAUSTED 正确触发，避免了无限循环
2. 所有收集的链接都包含有效的 xsec_token
3. 在页面内容耗尽时能够正确终止
4. 不再出现"卡在运行中状态"的问题
