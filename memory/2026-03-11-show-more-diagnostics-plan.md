# 2026-03-11 Show-More Diagnostics Plan

Tags: xhs, detail, show-more, expand-replies, comments, diagnostics, instrumentation

## Verified Current State
- Latest stable 4-tab detail run: `bffa974f-7eda-4a48-947f-fd7be8d23b72`
- Summary: `openedNotes=4`, `commentsCollected=620`, `commentsExpected=1112`, coverage about `55.8%`
- No new tab-pool/login/risk blocker in the latest run; primary suspicion shifts back to reply expansion coverage.

## Current Expand-Replies Behavior
- `xhs_expand_replies` lives in `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
- It already records only aggregated `expanded` and `scanned`
- It re-reads visible targets before each click via `readExpandReplyTargets()` from `comments-ops.mjs`
- `readExpandReplyTargets()` only returns currently visible targets and dedups by rect/text

## Likely Blind Spots
- We do not persist per-note show-more diagnostics, so after a run we cannot answer:
  - how many visible show-more targets were found before the first click
  - how many total distinct show-more texts were seen across the note lifecycle
  - how many clicks succeeded versus no-op clicks
  - whether clicking one show-more caused additional hidden show-more targets to appear later
- Because we only track `expanded` and `scanned`, a low-coverage run cannot distinguish:
  - no more visible targets actually existed
  - targets existed but were never surfaced into viewport
  - targets were clicked but did not expand comments
  - targets were clicked but the resulting extra replies still were not harvested before bottom exit

## Recommended Instrumentation
1. Save per-note show-more metrics into action trace / events:
   - `showMoreVisibleInitial`
   - `showMoreVisibleMax`
   - `showMoreDistinctSeen`
   - `showMoreClicks`
   - `showMoreTextsSample`
2. After each click, capture delta snapshot:
   - comments count before / after click
   - visible show-more count before / after click
   - whether the clicked text disappeared
3. Persist a per-note artifact, for example:
   - `show-more.summary.json`
   - fields: `noteId`, `expectedComments`, `commentsCollected`, `clickAttempts`, `successfulExpansions`, `visibleTargetsTimeline`
4. Add a terminal summary field at merged run level:
   - `showMoreClicksTotal`
   - `showMoreNotesWithTargets`
   - `showMoreNotesExpanded`

## Diagnostic Goal
After instrumentation, we should be able to answer with evidence whether low coverage is caused by:
- missing show-more discovery
- failed show-more clicking
- show-more appearing late but never revisited
- harvest exiting at bottom before newly expanded replies are fully collected

## Verified Run Evidence
- Rerun completed on 2026-03-11 with runId `3b81f6c4-7cb5-469e-ad62-161eaa475c32`
- Summary path: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T02-50-04-453Z/summary.json`
- Totals: `openedNotes=4`, `commentsCollected=620`, `commentsExpected=1112`, coverage about `55.8%`
- Terminal code: `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`

## Show-More Diagnostic Findings
- Instrumentation confirmed `expand_replies` actually ran on all 4 notes, not just the first visible batch.
- Per-note diagnostics from `comments_harvest.result.showMore`:
  - `698de0c8000000001a01e38d`: no visible show-more target seen, `clicks=0`, `distinctSeen=0`
  - `6997df4d00000000150207fd`: `clicks=3`, `distinctSeen=3`, texts included `展开 8 条回复`, `展开 2 条回复`, `展开更多回复`
  - `69a46962000000000e03db94`: `clicks=2`, `distinctSeen=2`, texts included `展开 1 条回复`, `展开 2 条回复`
  - `698def79000000000b008360`: `clicks=2`, `distinctSeen=4`, texts included `展开 20 条回复`, `展开 34 条回复`, `展开 32 条回复`, `展开更多回复`
- `clickTimeline` shows the operation re-read visible targets after each click and did not stay stuck on the initial target set.
- The largest note (`698def79000000000b008360`) still exited at bottom with `283 / 551` visible-vs-expected comments after only 2 successful show-more clicks, so low coverage is not explained only by “first show-more never clicked”.

## Current Conclusion
- The previous hypothesis “show-more subscription fires once then stops forever” is not supported by this rerun.
- Current evidence says reply expansion is working for visible targets, but coverage is still low because visible targets are sparse relative to expected reply count, and the harvest loop still reaches bottom before expected comments are fully surfaced.
- Next debugging direction should focus on why many expected replies never become visible during scrolling, not on whether the current visible show-more buttons are being clicked at all.
