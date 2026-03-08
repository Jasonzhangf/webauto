Tags: xhs, detail, safe-links, canonical, redirect, noteId, validation

# 2026-03-08 Detail Canonical Settle

## Context
- Task: `webauto-9981`
- Validation source: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- Goal: make `xhs_open_detail` report the actual settled note identity when a preserved safe link redirects/canonicalizes after open.

## Root Cause
- Safe-link detail progression already respected `maxNotes`, but open-result identity was emitted too early.
- Some preserved links do not remain on their assigned note id after the modal settles.
- Result: `xhs_open_detail` could report the assigned safe-link note id while `detail_harvest` and `comments_harvest` later ran against the redirected canonical note.

## Fix
- File: `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`
- Added `extractNoteIdFromUrl(rawUrl)`.
- Added `settleOpenedDetailState(profileId, params, pushTrace, expectedNoteId)` to re-read the detail href/noteId after open.
- Updated `executeOpenDetailOperation(...)` to persist and return the settled canonical note id instead of the pre-settle assigned id.

## Verification
- Syntax:
  - `node --check modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`
- Focused unit tests:
  - `node --test tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-tab-pool-config.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`

## Live Evidence
- Run:
  - `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T11-03-54-124Z/`
- Summary:
  - `summary.json` shows `assignedNotes=2`, `openedNotes=2`, `commentsHarvestRuns=2`, terminal `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`.
- Event log:
  - `profiles/wave-001.xhs-qa-1.events.jsonl`
- Stable first note:
  - `open_first_detail` done result noteId `698de0c8000000001a01e38d`
  - `detail_harvest.detail.href` also contains `698de0c8000000001a01e38d`
  - `comments_harvest.result.noteId` is `698de0c8000000001a01e38d`
- Redirected second note:
  - `open_next_detail` settle step 1 observed assigned `6997df4d00000000150207fd`
  - `open_next_detail` settle step 2 observed redirected `684bdeeb0000000023014875`
  - final `open_next_detail` done result noteId is `684bdeeb0000000023014875`
  - later `detail_harvest.detail.href` and `comments_harvest.result.noteId` also use `684bdeeb0000000023014875`

## Decision
- For safe-link `detail` mode, the runtime must trust the settled live detail identity over the originally assigned safe-link note id.
- Queue assignment stays in `tab-state.mjs`, but canonical opened-note identity is resolved in `detail-flow-ops.mjs`.
