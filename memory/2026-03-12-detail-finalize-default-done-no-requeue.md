# 2026-03-12 detail finalize 默认 done（失败不回队列）

## 背景
- 现象：`finalize_detail_link` 在 `slot.failed=true` 时会走 `detail_flow_failed_release`，导致同一 safe-link 被重新 claim。
- 在 openByLinks + 不关 detail 的链路下，这会触发“同 link 重复打开/事件空转”，任务可能长期 running。

## 决策
- 在 `xhs_close_detail`（openByLinks）中，新增规则：
  - 默认 `requeueFailedLinks=false`（即使失败也 `completeDetailLink`，标记 done）。
  - 仅显式 `requeueFailedLinks=true` 时，失败 link 才 `release` 回队列。
- 保持现有 `stale_closed + skip=true` 逻辑不变（已关闭详情时按 skip 处理，避免误重开）。

## 代码
- `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`
  - `executeCloseDetailOperation`：两处 queue 决策都改为受 `requeueFailedLinks` 控制。
- `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - 新增断言：失败 slot 在默认配置下走 complete，不走 release。
- `docs/arch/state-machines/xhs-detail-comments-likes.v2026-03-12.md`
  - 补充 S6 规则（默认 done，不回队列；可选显式 requeue）。

## 验证
- 单测：
  - `npm run -s test -- tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-open-detail-requeue.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - 结果：pass 40, fail 0。
- 实跑：
  - runId `53583d7c-5eac-40c9-af37-a30186e8a93d`（完成，未卡 running）。
  - 历史长跑 `f646117c-ed1c-4c4b-b12d-26a4ed91b46e` 事件中出现新行为：`finalize_detail_link action=done removed=true`，随后 `open_next_detail` 终态 cleanup 并 `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`。

Tags: xhs, detail, finalize, no-requeue-default, state-machine, anchors, running-stuck
