# Search Gate Retry Fix (2026-03-13)

## Problem
Like-only pressure test failed with `SEARCH_GATE_REJECTED` error when the gate denied consecutive same keyword searches. The original code threw the error immediately, causing the entire script to stop.

## Root Cause
In `modules/camo-runtime/src/autoscript/action-providers/xhs/search-gate-ops.mjs`, the `executeWaitSearchPermitOperation` function caught `SEARCH_GATE_REJECTED` and `SEARCH_GATE_DENIED` errors and immediately threw them, stopping the script.

## Fix Applied
Modified `executeWaitSearchPermitOperation` to retry with exponential backoff instead of throwing:

- `SEARCH_GATE_REJECTED`: 5s base backoff, 1.5x multiplier, max 60s
- `SEARCH_GATE_DENIED`: 3s base backoff, 1.2x multiplier, max 30s
- Both log trace events with retry flags

This allows the script to wait and retry when the gate denies due to consecutive same keyword or other reasons, instead of failing immediately.

## Files Changed
- `modules/camo-runtime/src/autoscript/action-providers/xhs/search-gate-ops.mjs`

## Next Steps
1. Re-run like-only pressure test with low-frequency keywords (cherry/comet/kimi)
2. Verify that gate rejections are handled with retries instead of stopping
3. Check logs for `consecutiveSameRetry` and `gateDeniedRetry` trace events
