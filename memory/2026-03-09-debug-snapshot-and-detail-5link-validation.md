Tags: xhs, detail, debug-snapshot, diagnostics, safe-links, validation

# 2026-03-09 Debug Snapshot Fix And 5-Link Detail Validation

## Context
- Task: `webauto-9981`
- Validation source: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- Goal for this pass:
  - fix real debug screenshot persistence
  - validate 5-link safe-link detail-only progression with real evidence

## Fix
- Root cause of debug snapshot failure was argument order mismatch in screenshot persistence.
- File fixed:
  - `modules/camo-runtime/src/autoscript/action-providers/xhs/diagnostic-utils.mjs`
- Change:
  - `savePngBase64(base64, filePath)` -> `savePngBase64(filePath, base64)`
- Previous failure was:
  - `ENAMETOOLONG: name too long, mkdir 'iVBORw0K...'`
  - meaning the base64 payload was passed as a path.

## Probe Verification
- Direct probe succeeded after the fix:
  - operation: `xhs_debug_snapshot`
  - profile: `xhs-qa-1`
- Evidence:
  - JSON: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/diagnostics/debug-ops/manual-probe_manual_debug_probe_1_point-2026-03-09T05-05-17-739Z.json`
  - PNG: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/diagnostics/debug-ops/manual-probe_manual_debug_probe_1_point-2026-03-09T05-05-17-739Z.png`
- Screenshot API raw check also succeeded:
  - payload keys: `success,data`
  - `data` type: string
  - size observed: `15028800`

## 5-Link Live Validation
- Command:
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 5 --skip-account-sync --env debug --tab-count 1 --do-comments true --persist-comments true --do-likes false --json`
- Run root:
  - `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T05-06-06-293Z`
- runId:
  - `260200a3-3e3b-4ca2-b68a-dd028cace423`
- Event log:
  - `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T05-06-06-293Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- Summary:
  - `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T05-06-06-293Z/summary.json`

## Result
- Run completed successfully with terminal code:
  - `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`
- Summary totals:
  - `assignedNotes = 5`
  - `openedNotes = 5`
  - `commentsHarvestRuns = 5`
  - `commentsCollected = 687`
  - `commentsExpected = 1332`
  - `commentsReachedBottomCount = 5`
  - `detailContentRuns = 5`
  - `operationErrors = 0`
- Unique comment outputs confirmed for 5 notes:
  - `698de0c8000000001a01e38d/comments.jsonl` -> 288 lines
  - `6997df4d00000000150207fd/comments.jsonl` -> 70 lines
  - `69a46962000000000e03db94/comments.jsonl` -> 112 lines
  - `698def79000000000b008360/comments.jsonl` -> 292 lines
  - `699e8712000000001a033e9f/comments.jsonl` -> 158 lines
- Event log confirms per-note progression through:
  - `open_next_detail`
  - `detail_harvest`
  - `comments_harvest`
  - `close_detail`
  - `wait_between_notes`
  - final terminal completion
- Verified comments container remained active during harvest via repeated progress events:
  - `focus_comment_context_done selector=.note-scroller hasVisibleComment=true`
  - `before_scroll_action selector=.note-scroller`
  - `post_scroll_state detailVisible=true commentsContextAvailable=true`

## Specific Note Coverage Evidence
- `698de0c8000000001a01e38d`
  - expected `480`, collected `259`, coverage `0.54`, reached bottom
- `6997df4d00000000150207fd`
  - expected `48`, collected `29`, coverage `0.60`, reached bottom
- `69a46962000000000e03db94`
  - expected `25`, collected `15`, coverage `0.60`, reached bottom
- `698def79000000000b008360`
  - expected `541`, collected `266`, coverage `0.49`, reached bottom
- `699e8712000000001a033e9f`
  - expected `238`, collected `118`, coverage `0.50`, reached bottom

## Diagnostics Note
- This particular live run did not hit degraded `ensure_tab_pool` or operation error paths, so no auto debug snapshot was emitted during the run.
- That path is still validated separately by the direct probe and unit tests.

## Verification
- Syntax:
  - `node --check modules/camo-runtime/src/autoscript/action-providers/xhs/diagnostic-utils.mjs`
  - `node --check modules/camo-runtime/src/autoscript/action-providers/xhs/diagnostic-ops.mjs`
  - `node --check modules/camo-runtime/src/autoscript/runtime.mjs`
- Tests:
  - `node --test tests/unit/webauto/autoscript-debug-snapshot.test.mjs tests/unit/webauto/autoscript-timeout.test.mjs tests/unit/webauto/subscription-transient-error.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - Result: `22/22 pass`
