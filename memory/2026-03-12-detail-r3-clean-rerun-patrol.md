# 2026-03-12 detail clean rerun + timed patrol (r3)

Tags: xhs,detail,clean-run,patrol,verification,comments,state-machine

## 清场
- `node bin/webauto.mjs daemon stop`
- 清理范围（仅临时/调试产物，基于 `~/.webauto`）：
  - `~/.webauto/tmp/detail-clean-20260312-r{1,2,3}`（重建 r3）
  - `~/.webauto/download/xiaohongshu/debug/*`
  - `~/.webauto/logs/*`（仅文件）
  - `~/.webauto/state/*.json*`
  - `~/.webauto/run/events/progress-events.jsonl`
- 校验：logs/state/xhs_debug 文件计数均为 0。

## r3 collect
- runId: `840548f1-d23a-49ae-8382-1695b058be43`
- 结果：`AUTOSCRIPT_DONE_LINKS_COLLECTED`
- 输出根：`~/.webauto/tmp/detail-clean-20260312-r3`

## r3 detail
- runId: `766d8351-64b2-4935-a2e9-f71620d0bd38`
- 命令：detail 50 + tab=4 + rotate-comments=50 + sharedHarvestPath 指向 r3 safe links
- 事件文件：
  - `~/.webauto/tmp/detail-clean-20260312-r3/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T14-20-41-670Z/profiles/wave-001.xhs-qa-1.events.jsonl`

## 定时巡查
- 巡查进程 session: `1914`
- 策略：60s 间隔，最多 10 轮；每轮采集 runId/status/progress/comments/likes + 最新事件文件尾部关键事件。
- 已执行：
  - patrol1: progress 1/50, comments 0
  - patrol2: progress 2/50, comments 6
  - patrol3: progress 3/50, comments 57
- 结论：巡查机制生效，任务在推进。
