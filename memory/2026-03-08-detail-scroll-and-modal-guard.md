# Detail scroll + modal guard

Date: 2026-03-08
Tags: detail, xhs, comments, scroll, modal, autoCloseDetail, comment-container, note-scroller

## What changed
- Tightened comment scroll container selection in `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`.
- Prefer real comment containers (`.comments-container`, `.comment-list`, `.comments-el`) before `.note-scroller`.
- Require visible comment context (`.total` or visible comment items), visible-ratio threshold, and `elementFromPoint` hit on the chosen center to avoid anchoring wheel/scroll to正文图片区.
- In `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`, comments scroll now always uses `commentScroll` as `focusTarget`; it no longer falls back to a visible comment target for the scroll anchor.
- Increased default detail comment scroll step to `520..760` in both runtime and CLI option builders.
- For `stage=detail` with `maxNotes<=1`, default `autoCloseDetail=false` so single-note validation does not auto-close the modal unless explicitly requested.

## Why
- Previous runs still sometimes anchored scroll on `.note-scroller` / media region, causing accidental image focus/open and making the modal appear to auto-close.
- Small scroll deltas made progress too slow and amplified repeated focus churn.
- Single-note detail validation should keep the modal open by default; otherwise the close path interferes with manual verification.

## Verification
- `node --test tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-visible-like-inline.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/camo-env.test.mjs`
- `node -e "import('./apps/webauto/entry/lib/xhs-unified-options.mjs').then(async m=>{const o=await m.buildUnifiedOptions({keyword:'deepseek',env:'debug','max-notes':'1',stage:'detail','detail-open-by-links':'true','do-comments':'true'},'xhs-qa-1',{}); console.log(JSON.stringify({autoCloseDetail:o.autoCloseDetail,commentsScrollStepMin:o.commentsScrollStepMin,commentsScrollStepMax:o.commentsScrollStepMax,noteIntervalMs:o.noteIntervalMs,tabOpenMinDelayMs:o.tabOpenMinDelayMs},null,2));})"`
- Result: `autoCloseDetail=false`, `commentsScrollStepMin=520`, `commentsScrollStepMax=760`, tests pass.

## Remaining requirement
- Next step is manual single-detail verification on the preserved `deepseek` safe-detail links, with no UI CLI and no full unified batch run until the per-link scroll/like path is confirmed stable.
