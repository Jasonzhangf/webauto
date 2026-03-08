# 2026-03-07 detail comments harvest validation

## Goal
Re-validate XHS detail-only comments harvesting after fixing `camo` wheel anchoring and tightening the detail comment container focus chain.

## Code changes
- `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
  - `readCommentScrollContainerTarget()` now returns a safer focus point inside the comment scroll container instead of the geometric center.
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `focusCommentContext()` no longer clicks visible comment items during the scroll loop.
  - Focus chain is now `comment entry -> comment total -> comment scroll container`.
  - Added eager `flushCommentArtifacts()` so comments are forced to disk during harvesting, not only at the very end.
  - When no-progress recovery is hit after comments have already been collected, harvest exits early instead of stalling toward timeout.
- `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
  - detail loop now always schedules `close_detail`; `detail-open-by-links` no longer bypasses it.

## Required smoke
- UI CLI smoke passed after code changes:
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`

## Validation command
- `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 1 --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 1 --json`

## Run 1
- run label: `run-2026-03-07T01-47-31-698Z`
- runId: `e004d724-fab6-4a9d-ba38-04a06fd2affa`
- evidence: `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-07T01-47-31-698Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- result:
  - `comments_harvest` completed successfully
  - `commentsAdded: 19`
  - `expectedCommentsCount: 478`
  - `exitReason: scroll_stalled`
  - comments file written: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/698de0c8000000001a01e38d/comments.jsonl`
- new blocker found:
  - detail was not closed in open-by-links loop, so `wait_between_notes` kept retriggering under the same detail modal.

## Run 2
- run label: `run-2026-03-07T02-02-53-480Z`
- runId: `cbd503ff-90a3-48c2-bba7-bfa8cb7c5b61`
- evidence: `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-07T02-02-53-480Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- result:
  - `comments_harvest` again reached real harvesting path and produced forced on-disk output
  - `close_detail` was attempted for direct-link mode
  - progress sequence recorded:
    - `Escape`
    - `page:back`
    - `goto https://www.xiaohongshu.com/explore`
  - then `close_detail` still returned `CLOSE_FAILED`
  - second retry was skipped as stale trigger because `detail_modal` had already disappeared
- conclusion:
  - comment container focus + scroll path is now working well enough to harvest and persist comments
  - current next blocker is isolated to `xhs_close_detail` success criteria / post-close verification in direct-link mode

## Practical conclusion
- Base comment harvesting is no longer the blocker.
- The next unique fix point is `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs` close success detection for open-by-links detail loops.
