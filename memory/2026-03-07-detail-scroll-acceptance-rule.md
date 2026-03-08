# 2026-03-07 detail scroll acceptance rule

Rule:
- For detail comments, lack of scroll movement is acceptable only when:
  - comments are empty (`expectedCommentsCount == 0` or no comments and no UI count), or
  - the comment scroll container is already at bottom.
- Otherwise, detail validation must expect real scroll progress evidence.

Implementation update:
- `readCommentsSnapshot()` now returns scroll meta from `.note-scroller` / comment container:
  - `top`
  - `clientHeight`
  - `scrollHeight`
  - `atTop`
  - `atBottom`
- `executeCommentsHarvestOperation()` now tracks:
  - `reachedBottom`
  - `commentsEmpty`
  - `exitReason`
- exit reasons now distinguish:
  - `comments_empty`
  - `reached_bottom`
  - `max_comments_reached`
  - `no_progress_with_comments`
  - `scroll_stalled`
