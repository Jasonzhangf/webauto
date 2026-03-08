Tags: xhs, detail, tab-state, multi-tab, unit-test, state-machine

# 2026-03-08 tab state machine coverage

## Goal
- Ensure the detail multi-tab state machine is explicitly covered by unit tests, not only by live runs.

## Added coverage
- `tests/unit/webauto/xhs-tab-links.test.mjs`
  - keeps unique link assignment per tab
  - requeues a failed link to queue tail
  - confirms a later tab receives the requeued link with incremented retry count
- `tests/unit/webauto/xhs-detail-slot-state.test.mjs`
  - paused slot remains reusable and should not close
  - completed slot becomes closeable
  - failed slot becomes closeable and must not be reused

## Validation
- Command:
  - `node --test tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs`
- Result:
  - `5` tests passed
- Minimal repo gate:
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`
  - all passed on `2026-03-08`
