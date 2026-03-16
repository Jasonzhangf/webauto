# 2026-03-12 detail 50-note run stuck with watch-error loop

Tags: xhs,detail,comments,likes,50-notes,pressure,stuck-running,watch-error,recovery,evidence

## 执行目标
- 直接执行 detail 50-note 压测（评论+点赞流程）。

## 命令
```bash
node bin/webauto.mjs xhs unified \
  --profile xhs-qa-1 \
  --keyword "seedance2.0" \
  --stage detail \
  --max-notes 50 \
  --do-comments true \
  --persist-comments true \
  --do-likes true \
  --like-keywords "真牛" \
  --tab-count 4 \
  --env debug \
  --output-root ./.tmp/min-smoke-stagnation-fix-50notes \
  --shared-harvest-path ./.tmp/collect-ready-200/xiaohongshu/debug/seedance2.0/safe-detail-urls.jsonl
```

## runId 与日志
- runId: `a6722d69-ef36-404b-bb2f-07ce508dc090`
- events:
  - `./.tmp/min-smoke-stagnation-fix-50notes/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T10-56-20-140Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- detail trace:
  - `./.tmp/min-smoke-stagnation-fix-50notes/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T10-56-20-140Z/profiles/xhs-qa-1.detail-modal-trace.jsonl`

## 结果
- 任务未完成 50 条，卡在 processed=7。
- 中间关键错误：
  - `COMMENTS_SCROLL_CONTAINER_MISSING`
  - `RECOVERY_NOT_CONFIGURED`
- 之后进入持续 `SUBSCRIPTION_WATCH_FAILED fetch failed` 循环，未自然收敛终态。

## 状态快照
- `webauto xhs status --run-id ... --json`：
  - status=aborted
  - progress=7/50
  - errorEvents 含上述两条 operation_error/recovery_failed

## 额外动作
- 已尝试任务控制接口 `POST /api/v1/tasks/<runId>/control?action=stop`（registry 进入 aborted）。
- 已尝试 `camo stop xhs-qa-1`。
- 但当前执行流仍持续输出 watch_error，说明脚本进程未随 task 状态同步终止。
