# Detail Comment Scope Fix - 2026-03-06

## Problem
Detail comment harvest sometimes clicked the wrong target and scrolled the main note body/media instead of the comment area. The observed failure mode was exiting the detail or moving inside正文图片区 because the scroll anchor was too broad.

## User-required interaction sequence
1. Enter detail.
2. Click the comment button (`.chat-wrapper` / comment icon).
3. Click the comment total (`.total`, e.g. `共 477 条评论`).
4. Focus the comment scroll container.
5. Only then perform scroll / harvest.

## Code changes
- `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
  - added `readCommentTotalTarget(profileId)` to locate the visible comment total inside the detail modal.
  - added `readCommentScrollContainerTarget(profileId)` and restricted it to comment containers only: `.comments-container`, `.comment-list`, `.comments-el`.
  - required the container to actually contain comment children or `.total`, explicitly excluding the generic `.note-scroller` body container.
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `executeCommentsHarvestOperation` now refocuses the comment context before harvest and before each scroll/recovery cycle.
  - sequence is enforced as: comment entry -> comment total -> comment container focus.
  - before each focus click, validate the current note is still the expected detail note.
  - before each scroll, refocus comment container again so wheel/PageDown stays scoped to comments.

## Intent
This reduces two concrete risks:
- scrolling the body/media area instead of comments
- losing detail context and continuing operations on the wrong surface

## Next verification target
Run detail-only validation against existing `safe-detail-urls.jsonl` (deepseek dataset), not unified search, and inspect whether the first scroll happens only after comment total focus.
