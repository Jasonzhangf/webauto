Tags: xhs, detail, comments, recovery, tab-pool, safe-links, validation

# 2026-03-09 Detail Comments Recovery And Tab Reuse

## Context
- Task: `webauto-9981`
- Validation source remains: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- Root cause from latest failing run `run-2026-03-08T13-03-51-632Z`: `comments_harvest` failed during recovery focus with `mouse:click(retry) timed out`, not because tab creation truly failed.

## Findings
- `ensure_tab_pool` in the failing run ended as `operation_done`; later stall was unrelated to tab bootstrap.
- Actual blocker was recovery inside `executeCommentsHarvestOperation()` repeatedly requiring a focus click before recovery scrolling.
- User rule clarified for no-progress recovery:
  - only treat as timeout when comment content has not changed for 30s
  - if downward progress stalls and not at bottom: scroll up 3-5 times, then scroll down once
  - repeat recovery cycle 3 times, then record exit and continue next link
- User rule for tab strategy:
  - safe-link detail startup may prepare the pool
  - after startup, rotate among existing tabs only
  - do not keep dynamically opening replacement tabs during detail progression

## Code Changes
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - Added `noChangeTimeoutMs` and `lastProgressAt` tracking.
  - Recovery no longer exits immediately just because comments were already collected.
  - Recovery focus click failures now degrade to existing scroll target instead of aborting `comments_harvest`.
  - Recovery loop now follows the validated pattern: up-scroll rounds first, then one down-scroll round, with explicit `scroll_stalled_after_recovery` exit reason only after no-change timeout and max recoveries.
- `modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs`
  - Added `reuseOnly` mode for `ensure_tab_pool`.
  - In reuse-only mode, tab pool initialization stops trying to open new tabs and only uses existing pages.
- `modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs`
  - Safe-link detail startup now passes `reuseOnly: true` into `ensure_tab_pool`.

## Verification
- Syntax:
  - `node --check modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `node --check modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs`
  - `node --check modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs`
- Unit tests:
  - `node --test tests/unit/webauto/xhs-tab-pool-config.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - Result: 18/18 passing

## Next Step
- Re-run safe-link detail validation and confirm:
  - stalled notes exit with `scroll_stalled_after_recovery` instead of whole-run abort
  - next safe link continues
  - no dynamic tab creation attempts appear after startup pool selection

## Additional Fix
- `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
  - Fixed `comment_match_gate` enablement to use `options.matchGateEnabled` instead of `stageReplyEnabled`.
  - This preserves the required two-step like flow in `stage=like`: `comments_harvest -> comment_match_gate`, even when reply is disabled.

## Additional Verification
- `node --check modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
- `node --test tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs tests/unit/webauto/xhs-tab-pool-startup.test.mjs tests/unit/webauto/xhs-unified-options-entry.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-tab-pool-config.test.mjs`
- Result: `28/28 pass`

## Scroll Step Update
- Detail comment scrolling was adjusted to use a larger default step while still remaining inside one visible portrait screen.
- Code changes:
  - `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
    - default `scrollStepMin/scrollStepMax` increased from `280/420` to `560/840`
    - real per-scroll cap changed to `floor(commentViewportHeight * 0.95)` so a single scroll never exceeds one screen
  - `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
    - `comments_harvest.params.scrollStep` now uses `commentsScrollStepMax`
- Regression update:
  - `tests/unit/webauto/xhs-unified-template-stage.test.mjs` now asserts `scrollStep === scrollStepMax` for single-note detail stage

## Live Recheck Note
- Pre-change live run still provides the stable evidence for comment-container progress:
  - runId: `19ac31ae-65a6-482b-9c66-6092a08ecd91`
  - event log: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T03-36-46-297Z/profiles/wave-001.xhs-qa-1.events.jsonl`
  - `commentsScroll.top` advanced up to `32606.5`, with `comments.jsonl` at `288` rows
- Post-change rerun:
  - runId: `d6424539-7a1b-4c10-ace2-d1a75c29f4ac`
  - event log: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T03-44-00-469Z/profiles/wave-001.xhs-qa-1.events.jsonl`
  - observation: run was interrupted before it re-entered the detail harvest segment; logs showed `SUBSCRIPTION_WATCH_FAILED` during navigation, so this rerun is not valid evidence for the new step size.


## Live Rerun Evidence
- Command:
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 1 --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 1`
- Run:
  - `run-2026-03-08T21-34-32-420Z`
  - runId: `8f3cc554-b790-42df-9c96-3b271c7b9801`
- Event log:
  - `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T21-34-32-420Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- Result:
  - `ensure_tab_pool` completed successfully with `tabCount=1`; no dynamic tab-open retry loop appeared.
  - `detail_harvest` completed and `comments_harvest` entered steady scrolling.
  - Live `commentsScroll.top` advanced `489.5 -> 973.5 -> 1466.5`, proving the scroll loop remained bound to the comment container.
  - Existing persisted comments for note `698de0c8000000001a01e38d` remain available at `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/698de0c8000000001a01e38d/comments.jsonl` (`287` rows currently present).
- Residual issue:
  - The single-note rerun did not self-terminate within the observation window; it was manually interrupted after confirming stable comment-container progress.
  - Next fix should target harvest completion conditions / progress-to-exit semantics, not tab bootstrap or comment-container binding.


## State Machine Finding
- After fixing comment recovery and tab reuse, the next blocker moved into autoscript manual dependency scheduling.
- Live run `da24b7dc-3153-47ca-8a4c-d2488bf505ff` (`run-2026-03-08T22-06-42-753Z`) showed:
  - `comments_harvest` completed with `exitReason=scroll_stalled_after_recovery`, `failed=true`, `commentsAdded=40`
  - but `close_detail`, `wait_between_notes`, and `open_next_detail` never started.
- Root cause is in `modules/camo-runtime/src/autoscript/runtime.mjs`: forced manual dependents still wrote `lastTriggerKey` as `manual:<timestamp>` in `enqueueOperation()`, so later force-run attempts on the same chain compared equal and were blocked.
- Patch applied:
  - `buildTriggerKey()` now returns `force:<operationId>` for manual triggers when the operation is currently in `forceRunOperationIds`.
- Added regression:
  - `tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - case: manual `close_detail -> wait_between_notes -> open_next_detail` chain must reach terminal `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`.
- Verification:
  - `node --check modules/camo-runtime/src/autoscript/runtime.mjs`
  - `node --test tests/unit/webauto/xhs-tab-pool-config.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - Result: 20/20 pass
