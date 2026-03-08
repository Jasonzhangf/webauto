# Camo Container Scroll Focus - 2026-03-06

## Problem
Detail comment harvesting was still using page-level wheel / PageDown semantics. Even when webauto found comment-related selectors, the actual scroll primitive in camo/browser-service did not bind scrolling to a visible container anchor. This violated the rule that every operation must land on a visible element with a carrying container.

## Root Cause
Code review showed:
- `webauto/modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs` used `wheel()` that only presses `PageDown/PageUp`.
- `camo/src/commands/browser.mjs` resolved a target for `scroll --selector`, but still sent plain `mouse:wheel` without binding the pointer/focus to the target container.
- `camo/src/container/runtime-core/operations/index.mjs` also resolved a scroll anchor but ignored it during actual wheel dispatch.
- `camo/src/services/browser-service/internal/browser-session/input-ops.js` always moved the pointer to viewport center before wheel.

## Fix
Implemented the fix in camo, not webauto orchestration:
1. `camo/src/container/runtime-core/operations/selector-scripts.mjs`
   - `buildScrollTargetScript()` now supports `requireVisibleContainer`.
   - Returns rect/target metadata for the resolved container.
   - Treats XHS detail scroll carriers (`.comments-container`, `.comment-list`, `.comments-el`, `.note-scroller`) as valid container candidates.
2. `camo/src/commands/browser.mjs`
   - `camo scroll --selector ...` now fails if no visible container is resolved.
   - Clicks the resolved container center first.
   - Sends `anchorX/anchorY` with `mouse:wheel`.
3. `camo/src/container/runtime-core/operations/index.mjs`
   - Runtime `scroll` now requires a resolved visible anchor.
   - Clicks anchor center before scroll.
   - Propagates `anchorX/anchorY` to browser-service.
4. `camo/src/services/browser-service/index.js`
   - `mouse:wheel` now accepts `anchorX/anchorY`.
5. `camo/src/services/browser-service/internal/browser-session/input-ops.js`
   - Wheel pointer move now uses `anchorX/anchorY` instead of hardcoded viewport center when provided.
6. `camo/tests/unit/commands/browser.test.mjs`
   - Updated browser scroll test to assert click-before-wheel and anchored wheel payload.

## Validation
### Unit / CLI verification
- Command: `cd ~/code/camo && npm test -- --runInBand tests/unit/commands/browser.test.mjs`
- Result: browser scroll command test passed after asserting `evaluate -> mouse:click -> mouse:wheel`.

### Manual detail-page verification
Used existing safe detail links only.
Profile: `xhs-qa-1`

Validated by manual camo operations:
1. `camo goto xhs-qa-1 <safe detail url>`
2. `camo click xhs-qa-1 '.chat-wrapper' --highlight`
3. `camo click xhs-qa-1 '.total' --highlight`
4. `camo scroll xhs-qa-1 --selector '.comments-container, .comment-list, .comments-el, .note-scroller' --down --amount 220 --highlight`

Observed evidence:
- Scroll command no longer runs without a visible selector container.
- Scroll target metadata is returned, including resolved container rect and class.
- The command now explicitly clicks the container before wheel dispatch.

## Important finding from manual detail pages
XHS detail pages are not consistent:
- On some notes, `.note-scroller` is the actual scroll carrier.
- On some notes, comments are too short and there is no independently scrollable comments container.
- In short-comment notes, the resolved carrier can still be `.note-scroller`, because comments live inside the detail scroller.

This means webauto detail orchestration must still distinguish:
- comment container available and independently scrollable
- only detail scroller available
- no meaningful comment scroll possible (short note / no extra comments)

The primitive is now correct at camo layer: scroll requires a visible carrier container and binds pointer to it before wheel.
