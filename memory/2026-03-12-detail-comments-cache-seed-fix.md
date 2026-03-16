# 2026-03-12 detail comments cache seed fix (tab-rotation duplicate recount)

Tags: xhs,detail,comments,tab-rotation,resume-anchor,state-machine,bugfix,verification

## 背景
- 用户要求：清空旧调试痕迹后重跑，给出清晰结论；当前重点是 detail 的评论获取/点赞流程状态机。
- 清空后首次 50-run 复现：runId `8a9c1256-0de4-40e8-b571-f9042f6801d1` 在 `processed=5` 后循环，反复回到同 4 个 note。

## 复现证据（旧问题）
事件文件：
- `~/.webauto/tmp/detail-clean-20260312-r1/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T13-30-36-623Z/profiles/wave-001.xhs-qa-1.events.jsonl`

关键模式：
- `open_next_detail` 重复同 note 且 `reused=true`。
- `comments_harvest` 对同 note 每轮都 `commentsAdded` 近似固定（如 56/59/51/55），`exitReason=tab_comment_budget_reached`。
- `tab_switch_if_needed` 连续 `reason=paused_slot_rotation`，但下轮仍重复旧窗口，`processed` 不前进。

## 根因
`executeCommentsHarvestOperation` 的去重种子只来自 `state.lastCommentsHarvest`（单 note 全局），
在多 tab 轮转后返回旧 note 时，无法带回该 note 的历史评论集合，导致把同一可见窗口再次当新评论计数。

## 修复
文件：
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`

改动：
1. 引入 `readJsonlRows`。
2. 新增按 note 的评论缓存种子来源：
   - `state.detailCommentsByNote[noteId]`（内存）
   - 持久化 `comments.jsonl`（当 `persistComments=true`）
   - 同 note 的 `state.lastCommentsHarvest.comments`
3. 对以上来源做统一 key 去重后作为 `existingRows`。
4. 结束时回写 `state.detailCommentsByNote[noteId] = collectedRows`，供下次回到该 note 继续。

## 单测
命令：
- `npm run -s test -- tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`

结果：通过。
新增断言：
- `reuses persisted note comments when paused tab revisits the same detail, preventing repeated budget recount`

## 回归实跑（新 run）
collect:
- runId `516388a1-401e-47d2-a894-6907454ef599`
- 输出根：`~/.webauto/tmp/detail-clean-20260312-r2`
- safe links: `~/.webauto/tmp/detail-clean-20260312-r2/xiaohongshu/debug/seedance2.0/safe-detail-urls.jsonl`

detail 50-run:
- runId `06af2504-a718-48d4-b841-19e7e277abcc`
- 事件文件：
  `~/.webauto/tmp/detail-clean-20260312-r2/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T13-59-33-268Z/profiles/wave-001.xhs-qa-1.events.jsonl`

关键改善证据：
- 不再卡在 `processed=5`，已推进到 `processed=7`（巡检时刻）。
- 同 note 再次进入时 `commentsTotal` 递增而非重复固定窗口：
  - `699ec9...`: 50 -> 113
  - `69a15b...`: 53 -> 106
  - `69909a...`: 59 -> 117
  - `699043...`: 12 -> 20，且第二轮 `exitReason=reached_bottom`
- `open_*_detail` 已出现 7 个唯一 note（非 4-note 死循环）。

## 当前结论（该时刻）
- “多 tab 回到旧 note 后重复计同一评论窗口导致 running 卡住”的主因已修复。
- 50-run 仍在运行中（未终态），但已越过旧卡点并持续前进。
