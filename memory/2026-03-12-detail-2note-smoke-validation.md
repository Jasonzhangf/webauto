# 2026-03-12 detail 2-note smoke validation after stagnation anchor fix

Tags: xhs,detail,comments,likes,anchor,smoke,2-notes,tab-rotation,verification

## 本轮目标
- 在不改 collect 的前提下，验证 detail 评论+点赞环节：
  1) 新增“scroll 有位移不应误判停滞”的单测
  2) 执行 2-note 最小实跑，观察评论退出原因与终态收敛

## 单测
- 文件：`tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
- 新增用例：
  - `keeps harvesting when scroll anchor advances even without new comments, and exits on reached_bottom instead of stalled`
- 结果：目标测试集 `pass 43 / fail 0`

## UI CLI 验证
- 最小链路：`ui cli start/status/stop` 通过
- full-cover 报告：
  - `.tmp/ui-cli-full-cover-2026-03-12T05-43-14-212Z.json`

## 2-note 实跑
- runId: `b01d0d56-4e29-482a-bdc8-8300fbab6f42`
- summary:
  - `./.tmp/min-smoke-stagnation-fix-2notes/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T05-43-30-942Z/summary.json`
- events:
  - `./.tmp/min-smoke-stagnation-fix-2notes/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T05-43-30-942Z/profiles/wave-001.xhs-qa-1.events.jsonl`

关键结果：
- openedNotes=2
- commentsHarvestRuns=2
- commentsCollected=80（53 + 27）
- 退出原因分布：
  - note1: `tab_comment_budget_reached`
  - note2: `reached_bottom`
- 终态：`AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED` + `script_complete`
- 本轮日志未出现 `recovery_start` / `scroll_stalled_after_recovery`

## 结论
- 当前锚点行为符合预期：
  - tab 预算命中时保存 resume anchor + 轮转
  - scroll 位移可持续推进，不会被过早停滞退出
  - exhausted 后一次性清理并终态结束
