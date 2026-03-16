# 2026-03-12 detail running 卡住修复（fix2）

Tags: xhs, detail-stage, state-machine, handoff, open_next_detail, ensure_tab_pool, dependency-gate, comments, likes, tab-rotation

## 背景
- 旧问题：detail（safe-link startup 模式）处理完首帖后，`close_detail -> wait_between_notes` 已完成，但任务仍卡 `running`。
- 首个修复（移除 open_next_detail 的 `subscription_not_exist(detail_modal)`）后，仍可复现卡住。

## 根因
- `open_next_detail.dependsOn` 固定包含 `ensure_tab_pool`。
- 在 `detailLinksStartup=true`（`--stage detail` + `detail-open-by-links`）模式下，`ensure_tab_pool` 被构建为 `enabled:false`。
- runtime 依赖满足规则要求依赖项状态必须 `done/skipped`；被禁用操作保持 `pending`，导致 `open_next_detail` 依赖永远不满足。

## 最小修复
- 文件：`modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
- 变更：`openNextDependsOn` 在 `detailLinksStartup` 下改为仅 `['wait_between_notes']`；多 tab 仍追加 `tab_switch_if_needed`。

## 单测
- `tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - 新增断言：safe-link + multi-tab 场景，`open_next_detail.dependsOn === ['wait_between_notes', 'tab_switch_if_needed']`。
  - 校准已有断言，不再要求 `ensure_tab_pool`。

## 真实验证（最小链路）
- collect runId: `76973437-7f80-49bc-a48c-48f041735604`
- detail runId: `1b71fbfa-a9e1-4563-9278-cdb78f8f15b1`
- 关键证据（events）:
  - `comments_harvest` 完成（exitReason=`tab_comment_budget_reached`）
  - `close_detail` 完成（`method=link_finalize_only`）
  - `wait_between_notes` 完成
  - `tab_switch_if_needed` 完成
  - `open_next_detail` 启动并终止 `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`
- 结果：任务终态 `completed`，不再卡 `running`。

## 证据路径
- 运行日志：
  - `.tmp/min-smoke-comments-like-fix2/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T04-25-46-501Z/profiles/wave-001.xhs-qa-1.events.jsonl`
  - `~/.webauto/state/1b71fbfa-a9e1-4563-9278-cdb78f8f15b1.events.jsonl`
- 状态查询：`node bin/webauto.mjs xhs status --run-id 1b71fbfa-a9e1-4563-9278-cdb78f8f15b1 --json`
