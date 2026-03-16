# 2026-03-12 detail running 状态机修复（open_next 后链路恢复）

## 背景
- 症状：detail 阶段出现 `open_next_detail` 之后只剩 `tick`，任务长期 `running`。
- 旧路径中，safe-link/manual 模式依赖 `detail_modal.exist + oncePerAppear`，在 tab 复用/锚点复用下可能不再触发下一轮处理。

## 根因
1. `open_next_detail` 完成后没有稳定、唯一地触发下一轮 detail/comments 链。
2. safe-link/manual 场景仍受 `oncePerAppear` 周期门控影响，复用锚点时可能被阻断。
3. 非阻塞失败时（`comments_harvest` skipped），`finalize_detail_link` 的 `operation_done` 条件会拦住后续链路。

## 修复
- 在 autoscript runtime 增加 `followupOperations` 调度能力：父操作 done 后可强制调度指定 followup（遵守 trigger/conditions/去重）。
- `open_next_detail.followupOperations = ['detail_harvest']`（safe-link 模式）。
- safe-link/manual 的 modal 链 `oncePerAppear=false`（detail_harvest/warmup/comments/match/reply/finalize）。
- safe-link 的 `finalize_detail_link` 去掉 `operation_done(comments_harvest)` 条件，仅依赖 `dependsOn`（done/skipped 都可继续）。

## 验证
- 单测：
  - `tests/unit/webauto/autoscript-followup-ops.test.mjs`
  - `tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - 结果：pass
- UI CLI 最小链路：`start -> status -> stop` 通过。

Tags: detail, state-machine, open_next_detail, followupOperations, manual-chain, tab-rotation, comments, running-stall
