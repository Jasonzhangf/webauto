# Detail Container Scroll Adapter - 2026-03-06

## What changed
After confirming the real root cause was camo scroll not being container-bound, webauto detail harvesting was adapted to consume the container-scoped scroll path instead of raw page-level wheel/PageDown logic.

## Webauto changes
### `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
- `readCommentScrollContainerTarget(profileId)` now:
  - searches `.comments-container`, `.comment-list`, `.comments-el`, `.note-scroller`
  - scores candidates so independently scrollable comment containers win first
  - falls back to `.note-scroller` only when needed
  - returns `selector`, `className`, `canScroll`, `rect`, `center`

### `modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs`
- added `scrollBySelector(profileId, selector, options)`
- this delegates to camo/browser-service `scroll` instead of local `wheel()`/PageDown

### `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
- comment harvest no longer uses `wheel(profileId, delta)` for downward progress
- recovery no longer uses raw `PageUp/PageDown`; it uses `scrollBySelector(...)`
- if comment panel does not actually open (entry click succeeded but no `.total` and no visible `.comment-item`), comments harvest exits cleanly with `commentsSkippedReason=comment_panel_not_opened`

## Why this matters
This enforces the rule:
- every operation must land on a visible element
- scroll must have an explicit carrying container
- if no valid container exists, the operation must stop/skip instead of blind scrolling

## Manual evidence
- camo-side container scroll validation was run on XHS safe detail links with `xhs-qa-1`
- multiple notes were tested from `safe-detail-urls.jsonl`
- observed outcomes:
  - some notes expose only `.note-scroller` as effective carrier
  - some notes do not open a real comments panel after clicking `.chat-wrapper`
  - in those cases webauto must skip comments harvest instead of issuing blind scrolls
