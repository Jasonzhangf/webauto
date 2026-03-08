# Detail Expand Replies Fix - 2026-03-08

Tags: xhs, detail, expand-replies, show-more, comments, autoscript, deepseek

## Problem
- `detail_show_more` 订阅能命中，但 `xhs_expand_replies` 之前只读取 `context.event.elements`。
- 当前 runtime 订阅事件没有把元素快照传入 action context，所以 action 看到的 `rawElements=[]`，返回 `EXPAND_REPLIES_NO_TARGETS`。

## Fix
- 在 `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs` 新增 `readExpandReplyTargets(profileId)`：
  - 在 detail root 内主动扫描可视 `.show-more` / `.reply-expand` 节点
  - 文本要求同时包含 `展开` 和 `回复`
  - 仅返回视口内可见目标，按 top/left 排序并去重
- 在 `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs` 的 `executeExpandRepliesOperation()` 中：
  - 先尝试 `event.elements`
  - 若为空则回退到 `readExpandReplyTargets(profileId)` 主动扫描
  - 点击每个目标并发出 progress trace

## Validation
- 最小验证命令：
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path ~/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 1 --auto-close-detail true --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 1 --json`
- 运行目录：
  - `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T09-56-56-563Z/`
- 关键证据：
  - `profiles/wave-001.xhs-qa-1.events.jsonl` 中出现：
    - `expand_replies ... step=1 text="展开 28 条回复"`
    - `expand_replies ... step=2 text="展开 22 条回复"`
    - `expand_replies ... step=3 text="展开 12 条回复"`
    - `expand_replies ... step=4 text="展开 25 条回复"`
    - 最终 `result={"expanded":4,"scanned":4}`

## Notes
- 这次修复解决的是“订阅已命中但 action 拿不到目标”的问题。
- detail loop 里仍有独立问题：`open_next_detail` 存在重复调度，需要单独继续收敛。
