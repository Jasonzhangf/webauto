# 2026-03-07 detail comment focus escape fix

Findings:
- User-reported wrong click was valid: when detail interaction drifts into non-detail media/image state, comments harvest must stop and recover with `Escape` before any further click/scroll.
- Live probe on `xhs-qa-1` with deepseek safe link `698de0c8000000001a01e38d` showed comment anchors were present:
  - `.chat-wrapper .count` center `2671,1839`
  - `.total` text `共 478 条评论`
  - `.note-scroller` as real comment carrier
- Bug found in anchor calculation: `.total` center was computed as `y=1`, which is effectively top-edge and can mis-hit wrong UI instead of the comment header.
- Fixed `readCommentTotalTarget` to clamp click coordinates into the visible rect.
- Added `ensureDetailInteractionState()` in comments harvest orchestration:
  - before entering comment focus flow
  - inside `ensureExpectedDetail`
  - once per harvest loop
  - behavior: if detail snapshot is invalid, send `Escape`, wait, re-check detail snapshot; fail hard if still invalid.

Evidence:
- UI CLI minimal verification passed:
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`
- Live probe against current page confirmed detail/comment containers are visible after fix.

Open issue:
- On the current live XHS page, protocol `PageDown`/existing `scrollBySelector` still did not move `.note-scroller` in this specific probe (`scrollTop` stayed `44230.5`).
- So the next fix point remains the unique scroll implementation in `dom-ops.mjs`/camo binding, not the comment anchors.
