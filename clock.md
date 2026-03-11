## 背景
正在验证 XHS 4-tab detail 新一轮实测，当前 runId 为 bffa974f-7eda-4a48-947f-fd7be8d23b72，命令为 safe-link detail 4-tab deepseek 运行。

## 当前阻塞点
需要等待运行继续推进后再检查是否完成，确认 ensure_tab_pool 之后是否顺利完成 4 帖 detail，以及 commentsCollected / openedNotes / operationErrors 是否有变化。

## 下次提醒要做的第一步
读取最新 merged run 目录的 summary.json；若尚未生成，则 tail profiles/wave-001.xhs-qa-1.events.jsonl 并读取 node bin/webauto.mjs xhs status --json。

## 不能忘的检查项
确认 runId 是否仍为 bffa974f-7eda-4a48-947f-fd7be8d23b72；记录 openedNotes、commentsCollected、commentsExpected、commentsReachedBottomCount、terminalCode，以及是否出现新的 risk/login/new_tab_failed blocker。
