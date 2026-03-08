# 2026-03-06 camo wheel anchor probe

## Goal
Verify whether XHS detail comment scrolling failure is caused by webauto orchestration or by camo protocol input delivery.

## What was verified
- Installed a page-side probe on a real XHS detail page for `click`, `wheel`, `keydown`, and `keyup` events.
- Executed protocol-level actions through camo/browser-service:
  - `mouse:click`
  - `mouse:wheel`
  - `keyboard:press(PageDown)`
- Read `.note-scroller.scrollTop` before and after each action.

## Evidence
- Click/wheel/keydown all reached the page:
  - `probe.clicks = 1`
  - `probe.wheel = 1`
  - `probe.keydown = 1`
  - `probe.keyup = 1`
- But `.note-scroller.scrollTop` did not move.
- Critical finding:
  - requested wheel anchor: `anchorX=2564, anchorY=228`
  - page-observed wheel coordinates: `x=1279, y=228`
  - page-observed wheel target: `link-wrapper bottom-channel`

## Conclusion
- Protocol events are reaching the page.
- Current camo/browser-service `mouse:wheel` anchor handling is clamping/translating X coordinates into the wrong coordinate space for this headful XHS session.
- Because of that, wheel lands on the wrong element and comment scroll validation becomes a false negative.
- `keyboard:press(PageDown)` also reaches the page, but in this XHS detail context it does not move `.note-scroller`, so it cannot replace correct wheel anchoring.

## Next step
- Fix camo wheel anchoring in `~/code/camo` before changing XHS detail orchestration again.
