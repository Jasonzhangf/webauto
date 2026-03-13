# Collect Terminal State Machine Implementation (2026-03-13)

## Implementation Summary

Added terminal state detection to `modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs` with three termination conditions:

### 1. Bottom Marker Detection
- Keywords: "没有更多", "到底了", "已显示全部", "没有更多内容", "没有更多了"
- Throws: `COLLECT_REACHED_BOTTOM` with marker details
- Implementation: `readSearchBottomMarker()` function

### 2. Duplicate Link Exhaustion
- Threshold: 5 consecutive rounds with no new unique links
- State tracking: `state.collectDuplicateOnlyRounds`
- Throws: `COLLECT_DUPLICATE_EXHAUSTED` with duplicateRounds count

### 3. Scroll Stuck Detection
- Threshold: 3 consecutive failed scroll attempts
- Supports rollback: PageUp + PageDown retry pattern
- State tracking: `state.collectScrollStuckRounds`, `state.collectScrollRollbackNeeded`
- Helper: `readListScrollInfo()`, `checkScrollMove()`
- Throws: `COLLECT_SCROLL_STUCK` with scroll details

## Test Results

### Test 1: Small Scale (50 notes) - PASS
- Command: `--keyword "AI智能助手" --max-notes 50 --env debug`
- runId: `2db0164f-4ec3-4764-b9ee-2d6fae516866`
- Result: Collected 50 notes successfully
- terminalCode: `AUTOSCRIPT_DONE_LINKS_COLLECTED`

### Test 2: Medium Scale (500 notes) - BLOCKED
- Command: `--keyword "大模型应用场景" --max-notes 500 --env debug`
- runId: `13fb34d0-718a-4ce6-b214-26f0ab7b3f8c`
- Collected: 220 notes then stuck
- Last persist: `2026-03-13T05:12:08.749Z`

## Issue Analysis

### Observed Behavior
- Terminal logic code was added but **not triggered**
- No `autoscript:operation_terminal` events in logs
- Infinite tick events with no progress for 10+ minutes
- Camo confirms list is at bottom (scrollHeight == clientHeight)

### Root Cause (Tentative)
Terminal detection code may not be in the correct position within the while loop execution path. The code exists but the execution flow never reaches it.

### Evidence Path
- Code: `modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs` (lines 686-975)
- Logs: `/tmp/collect-terminal-test500/xiaohongshu/debug/大模型应用场景/collect/run-2026-03-13T05-11-39-285Z/`
- Output: `/tmp/collect-terminal-test500/xiaohongshu/debug/大模型应用场景/safe-detail-urls.jsonl`

## Next Action Required
Fix terminal logic placement to ensure it executes in the main while loop before the scroll operation. The code needs to be positioned where it will be evaluated every iteration.

## Tags
webauto, collect, terminal-state-machine, xhs, scroll-stuck, duplicate-exhaustion, bottom-marker
