# Detail Comment Focus Target Fix - 2026-03-06

## New finding
Even after restricting the scroll container away from `.note-scroller`, the runtime could still leave keyboard focus on the media/body surface. That meant PageDown continued acting on the image/content area instead of the comments stack.

## Fix
- Added `readCommentFocusTarget(profileId)` in `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`.
- This target is the first visible `.comment-item` inside `.comments-container/.comment-list/.comments-el`.
- `executeCommentsHarvestOperation` now focuses in strict order:
  1. comment button
  2. comment total
  3. visible comment item
  4. only then reuse the comment scroll container for subsequent scroll cycles

## Why
The scroll container alone was not enough; keyboard scrolling follows the focused interaction area. Focusing a real visible comment item is a stronger guard than focusing the surrounding comments shell.

## Evidence path
This fix was made after observing detail harvest runs where comments were harvested but user-observed scrolling still hit the image area.
