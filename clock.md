## 背景

正在调试 XHS detail 模式下 `ensure_tab_pool` 操作卡住的问题。

**已完成的修复:**
- 移除 `detail_modal.disappear` 订阅事件，防止详情页被意外中断
- 提交: `fix(detail): remove disappear event from detail_modal subscription`

**当前问题:**
- `ensure_tab_pool` 操作在 `detail` 模式下卡住
- 事件日志停在 `ensure_tab_pool` 的 `pacing_wait` 后
- 没有后续的 `operation_done` 或 `open_first_detail` 事件

## 当前阻塞点

`ensure_tab_pool` 使用无条件轮询等待页面数量增加：
1. `seedOnOpen: false` 导致新标签页是 `about:blank`
2. `waitForTabCountIncrease` 轮询 `page:list` 等待页面数量增加
3. 如果页面数量没有增加，会一直等待直到超时（20-40秒）

**根本原因:** 不应该无条件等待，应该看锚点（checkpoint/container）。

## 下次提醒要做的第一步

1. 检查当前 run 状态和事件日志
2. 确认 `ensure_tab_pool` 是否仍在运行或已超时
3. 分析为什么 `waitForTabCountIncrease` 没有检测到新页面
4. 决定修复方案：
   - 方案 A：修改 `ensure_tab_pool` 使用锚点检测
   - 方案 B：在 detail 模式下跳过 `ensure_tab_pool`
   - 方案 C：设置 `seedOnOpen: true` 并传入 seed URL

## 不能忘的检查项

- 确认 `detail_modal.disappear` 已移除
- 确认 `ensure_tab_pool` 的 `timeoutMs` 配置（180秒）
- 检查 browser-service 日志是否有 `newPage` 相关错误
- 确认页面数量是否真的没有增加
