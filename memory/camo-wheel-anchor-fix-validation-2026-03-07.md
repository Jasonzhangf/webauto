# 2026-03-07 camo wheel anchor fix validation

## Goal
Validate that the `camo` wheel anchor fix works on a real XHS detail page before resuming `webauto` detail orchestration work.

## Code change
- Repo: `~/code/camo`
- File: `src/services/browser-service/internal/browser-session/input-ops.js`
- Change: `mouseWheel` now reads interactive viewport metrics from page runtime (`window.innerWidth` / `visualViewport`) instead of clamping anchors only against Playwright's cached `page.viewportSize()`.
- Test added: `src/services/browser-service/internal/BrowserSession.input.test.js`

## Automated evidence
- Test command:
  - `cd /Users/fanzhang/code/camo && node --test src/services/browser-service/internal/BrowserSession.input.test.js`
- Result:
  - `pass 12`
  - New assertion passed: `mouseWheel prefers interactive viewport metrics for anchor clamping`

## Real-page evidence
### Probe 1: raw wheel anchor delivery
- Session restarted on patched browser-service.
- Validation script:
  - `node scripts/test/camo-wheel-probe.mjs`
  - `node scripts/test/camo-wheel-move-probe.mjs`
- Before fix:
  - requested: `2564,228`
  - page wheel event: `1279,228`
- After fix:
  - requested: `2564,228`
  - page wheel event: `2564,228`
  - page move event: `2564,228`

### Probe 2: comment container movement
- Validation script:
  - `node scripts/test/camo-comment-scroll-probe.mjs`
- XHS detail page metrics:
  - `.note-scroller` rect: left `2309`, top `178`, width `439`, height `1624`
  - comment count visible: `244`
- Protocol sequence:
  - click comment entry
  - click comment total
  - click comment anchor (`comment-item` center)
  - wheel at anchored point
- Result:
  - `.note-scroller.scrollTop` before anchored wheel: `297`
  - `.note-scroller.scrollTop` after anchored wheel: `507`

## Conclusion
- The previous blocker was real and is now fixed in `camo`.
- Protocol wheel can now hit the intended comment-area coordinates on XHS detail pages.
- Real comment scrolling through `.note-scroller` works again with a container-anchored protocol path.
- Next step should return to `webauto` detail orchestration only; base runtime wheel delivery is no longer the blocker.
