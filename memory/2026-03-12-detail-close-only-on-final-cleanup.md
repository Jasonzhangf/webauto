# 2026-03-12 detail: close only at terminal cleanup

- Date: 2026-03-12
- Scope: `detail` stage only（不改 collect）

## User requirement
- `close detail` 不在单帖循环里执行。
- 单帖只做 finalize（写盘/队列完成/锚点推进）。
- 仅在“全部链接处理完成”进入终态时做一次清理关闭。
- 链接直开 detail 无模态关闭按钮：循环期间直接 goto 下一个链接。

## Code decisions
1. Keep per-note transition as `finalize_detail_link` (no UI close).
2. Add terminal cleanup in `xhs_open_detail` exhausted path:
   - when no next link (or repeated link exhausted), run cleanup sequence once:
     - `page:back` first
     - if still in detail, fallback `goto` list/discover
   - then raise `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED` terminal code.
3. Expose `cleanupOnDone` on `open_next_detail` params for openByLinks flow.

## Evidence
- Unit tests:
  - `tests/unit/webauto/xhs-open-detail-requeue.test.mjs`
    - new case: exhausted links triggers terminal cleanup (`page:back`) then terminal done
  - `tests/unit/webauto/xhs-unified-template-stage.test.mjs`
    - assert `open_next_detail.params.cleanupOnDone === true` in safe-link detail flow

- Real run smoke (with shared harvested links):
  - Command:
    - `node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword "seedance2.0" --max-notes 1 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛逼" --env debug --output-root ./.tmp/min-smoke-terminal-cleanup3 --tab-count 4 --shared-harvest-path ./.tmp/min-smoke-comments-like-fix2/xiaohongshu/debug/seedance2.0/safe-detail-urls.jsonl`
  - runId: `e3da8bfe-359c-48af-a035-f839bf061c09`
  - Key event log:
    - `.tmp/min-smoke-terminal-cleanup3/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T04-53-30-761Z/profiles/wave-001.xhs-qa-1.events.jsonl`
    - `open_next_detail` emitted cleanup progress:
      - `stage=open_detail_done_cleanup`
      - `result.method=not_in_detail`
    - then terminal:
      - `code=AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`

## Tags
Tags: xhs, detail, finalize_detail_link, terminal-cleanup, anchor, state-machine, comments, likes
