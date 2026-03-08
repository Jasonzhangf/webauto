Tags: xhs, detail, safe-links, max-notes, tab-state, validation

# 2026-03-08 Detail Max Notes Cap

## Context
- Task: `webauto-9981`
- Validation source: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- Goal: safe-link `detail` mode must stop after the assigned `maxNotes` budget instead of consuming the whole preserved links file.

## Root Cause
- `tab-state` loaded the full safe-link cache into `linksState.queue`.
- `maxNotes` was passed through orchestration, but queue assignment never enforced it.
- Result: `--max-notes 1` still opened note 2 and note 3 before the fix.

## Fix
- File: `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-state.mjs`
- Added `limitCollectedLinks(rows, params)` to:
  - dedupe by link key (`noteId || noteUrl || url`)
  - keep only the first `maxNotes` unique links when `maxNotes` is present
- Applied the cap in both:
  - `loadCollectedLinks(...)`
  - `syncQueueFromCache(...)`
- This keeps queue assignment as the single source of truth for safe-link progression.

## Test Coverage
- File: `tests/unit/webauto/xhs-tab-links.test.mjs`
- Added regression:
  - `caps safe-link detail progression to maxNotes unique links`

## Verification
- Syntax:
  - `node --check modules/camo-runtime/src/autoscript/action-providers/xhs/tab-state.mjs`
- Unit tests:
  - `node --test tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-tab-pool-config.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
- UI CLI gate:
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`

## Live Evidence

### `maxNotes=1`
- Command used:
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 1 --max-comments 10 --auto-close-detail true --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 1 --json`
- Run:
  - `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-54-44-168Z/`
- Evidence:
  - events: `profiles/wave-001.xhs-qa-1.events.jsonl`
  - summary: `summary.json`
  - only one `xhs_open_detail` done event
  - terminal event: `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`

### `maxNotes=2`
- Command used:
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 2 --max-comments 10 --auto-close-detail true --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 1 --json`
- Run:
  - `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-56-03-136Z/`
- Evidence:
  - events: `profiles/wave-001.xhs-qa-1.events.jsonl`
  - summary: `summary.json`
  - exactly two `xhs_open_detail` done events
  - exactly two `comments_harvest` done events
  - terminal event: `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`

## Residual Issue
- In `run-2026-03-08T10-56-03-136Z`, the second `xhs_open_detail` result noteId (`6997df4d00000000150207fd`) differed from the later harvested noteId (`699e8712000000001a033e9f`).
- This looks like opener/result note identity is being read before redirect/settle completes.
- It does not affect the `maxNotes` cap fix, but it should be reviewed before wider multi-tab rollout.
