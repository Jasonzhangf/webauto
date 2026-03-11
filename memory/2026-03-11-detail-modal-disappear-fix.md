# Detail Modal Disappear 订阅导致流程中断问题

## 背景
在 4-tab detail 实测中发现 detail 流程意外中断，评论采集覆盖率低。

## 问题根源
1. `detail_harvest` 的 trigger 是 `detail_modal.exist`
2. `close_detail` 的 trigger 是 `modalChainTrigger`（在 safe-link 模式下是 `manual`），依赖 `closeDependsOn`
3. 当 `detail_modal.disappear` 订阅事件触发时，runtime 会认为 modal 已关闭。导致依赖 `detail_modal.exist` 的操作被标记为 stale

**关键问题：** detail 不应该有自动关闭的计时器。订阅 `disappear` 事件会导致意外中断。

## 解决方案
不要用 `detail_modal.disappear` 订阅来判断关闭，统一用 Esc 手动关闭：

1. `close_detail` 操作主动按 Esc 关闭详情
2. 关闭后触发后续链（`wait_between_notes` -> `tab_switch_if_needed` -> `open_next_detail`）
3. 不会因为订阅的 `disappear` 事件意外中断流程

## 修复内容
- 移除 `detail_modal` 的 `disappear` 事件订阅
- 文件：`modules/camo-runtime/src/autoscript/xhs-autoscript-base.mjs`
- 修改前：`events: ['appear', 'exist', 'disappear']`
- 修改后：`events: ['appear', 'exist']`

## 验证
- 运行 `npm run build:services` 构建成功
- 测试任务在 `ensure_tab_pool` 阶段卡住（没有 operation_done 事件）
- 原因：`ensure_tab_pool` 操作的 timeout 是 180s000ms，操作本身需要打开新标签页

## 后续
- 需要检查为什么 `ensure_tab_pool` 在打开标签页时卡住
- 可能是 `newPage` 操作本身耗时较长
- 或者 `waitForTabCountIncrease` 轮询等待超时

Tags: detail, modal, disappear, subscription, esc, close, 4tab, xhs
