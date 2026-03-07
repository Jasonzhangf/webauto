# 2026-03-07 detail tail requeue semantics

## Goal
让 `detail` 总体编排满足：单个链接失败不阻断整体目标，失败链接入队尾，继续处理后续链接；超过重试上限才标记 exhausted。

## Root Cause
旧实现里 direct-link detail 的链接在两个地方被过早消费：
- `xhs_open_detail` 成功后立即 `advanceLinkForTab()`，等同于提前 done。
- `xhs_comments_harvest` 结束后直接 `markTabLinkDone()`。

这会导致 detail/comment 子阶段后续失败时，当前链接已经从队列里永久移除，无法回到队尾重试。

## Fix Direction
唯一修复点落在 detail 链接状态机：
- `tab-state.mjs`
  - 改为 `queue / byTab / completed / exhausted` 四态。
  - 新增 `readActiveLinkForTab()`。
  - 新增 `requeueTabLinkToTail()`，支持 `detailLinkRetryMax` 上限。
- `detail-flow-ops.mjs`
  - `xhs_open_detail` 成功时只记录 active link，不立即 done。
  - `open-by-links` 打开失败时立即 requeue tail。
  - `xhs_close_detail` 成功关闭时，再根据 `detailLinkState.activeFailed` 决定：
    - `false` -> `markTabLinkDone()`
    - `true` -> `requeueTabLinkToTail()`
- `harvest-ops.mjs`
  - detail/comment 子阶段失败要统一写入 `state.detailLinkState.activeFailed=true` 和 `lastFailureCode`。
  - `comments_harvest` 结束不再直接 `markTabLinkDone()`。

## Minimal Validation
本地直接验证队列语义：
- 顺序验证通过：`a fail -> requeue tail -> b done -> c done -> a retry done`
- 上限验证通过：`detailLinkRetryMax=2` 时，第 3 次失败进入 `exhausted`，不再死循环

## Constraints
- 不改变 collect。
- 不引入 fallback 逻辑。
- 仍以 `safe-detail-urls.jsonl` 为 detail 唯一输入。
