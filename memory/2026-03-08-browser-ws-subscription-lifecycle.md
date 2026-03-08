# Browser WS subscription lifecycle teardown

Date: 2026-03-08
Tags: camo, ws, subscription, lifecycle, teardown, runtime-bridge, detail, xhs

## Problem
- Browser WS subscribe path created runtime event bridges for `browser.runtime.event*` topics.
- Unsubscribe and last socket close did not tear down the bridge.
- Result: after autoscript exit or interrupted runs, a stale runtime bridge could remain attached to the session and continue affecting later manual post interactions.

## Evidence
- `modules/camo-backend/src/internal/ws-server.ts`
  - `handleSubscribe()` called `ensureRuntimeEventBridge(sessionId)`.
  - `handleUnsubscribe()` only removed socket topics; it did not remove session subscriber membership or evaluate bridge teardown.
  - `handleSocketClose()` removed socket from `sessionSubscribers`, but did not tear down bridge when the last runtime subscriber disappeared unless the session itself closed.
- `modules/camo-runtime/src/autoscript/runtime.mjs`
  - runner `stop()` correctly calls `this.watchHandle.stop()`.
  - So the missing lifecycle cleanup was not in autoscript polling stop, but in browser WS runtime bridge teardown.

## Fix
- Added per-socket per-session topic tracking in `modules/camo-backend/src/internal/ws-server.ts` via `socketSessionTopics`.
- On unsubscribe:
  - remove the topics from the socket's session topic set
  - remove the socket from `sessionSubscribers` for that session when no topics remain
  - call `maybeTeardownRuntimeEventBridge(sessionId)`
- On socket close:
  - remove all session topic registrations for that socket
  - if it was the last runtime subscriber for a session, teardown the runtime bridge
- Added `sessionNeedsRuntimeBridge()` and `maybeTeardownRuntimeEventBridge()` helpers.

## Verification
- `npx tsx --test modules/camo-backend/src/internal/ws-server.test.ts`
- Added tests:
  - subscribe -> unsubscribe tears down runtime bridge
  - last socket close tears down runtime bridge
- Regression suite still green:
  - `node --test tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-visible-like-inline.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/camo-env.test.mjs`

## Conclusion
- Your diagnosis was correct: this was a lifecycle management bug.
- The issue was not only "opened but never closed" at autoscript level; the concrete leak was the browser WS runtime bridge surviving unsubscribe / last socket close.
