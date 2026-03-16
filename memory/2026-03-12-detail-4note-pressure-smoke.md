# 2026-03-12 detail 4-note pressure smoke (comments/likes)

Tags: xhs,detail,comments,likes,pressure,smoke,tab-rotation,resume-anchor,verification

## 测试目标
- 在当前 detail 评论+点赞状态机下做更长一轮（4-note）验证：
  1) 是否出现 comments recovery 长循环/卡 running
  2) 多 tab 预算轮转 + anchor 恢复是否可收敛到终态
  3) 评论退出原因分布是否符合状态机预期

## 执行命令
```bash
node bin/webauto.mjs xhs unified \
  --profile xhs-qa-1 \
  --keyword "seedance2.0" \
  --stage detail \
  --max-notes 4 \
  --do-comments true \
  --persist-comments true \
  --do-likes true \
  --like-keywords "真牛" \
  --tab-count 4 \
  --env debug \
  --output-root ./.tmp/min-smoke-stagnation-fix-4notes \
  --shared-harvest-path ./.tmp/collect-ready-200/xiaohongshu/debug/seedance2.0/safe-detail-urls.jsonl
```

## 证据
- runId: `a2d0b1d7-2dca-46ec-8cb4-a0943a9dccec`
- summary:
  - `./.tmp/min-smoke-stagnation-fix-4notes/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T10-09-43-725Z/summary.json`
- events:
  - `./.tmp/min-smoke-stagnation-fix-4notes/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T10-09-43-725Z/profiles/wave-001.xhs-qa-1.events.jsonl`

## 关键结果
- 终态：`AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED` + `script_complete`
- commentsHarvestRuns=5（assignedNotes=4，存在 1 次 budget 后恢复续采）
- commentsCollected=168
- commentsReachedBottomCount=2
- 退出原因（comments_harvest）：
  - `tab_comment_budget_reached` x3
  - `reached_bottom` x2
- 本轮未见：
  - `scroll_stalled_after_recovery`
  - `recovery_start`
  - `DETAIL_INTERACTION_STATE_INVALID`
  - `COMMENTS_CONTEXT_LOST`
  - `SUBSCRIPTION_WATCH_FAILED`

## 观察
- 在 4-note 压测下，状态机仍可收敛到终态，未出现 running 卡死。
- 由于预算轮转 + 恢复机制，存在 note 被二次打开继续采集（符合当前“锚点恢复优先”的行为设计）。
