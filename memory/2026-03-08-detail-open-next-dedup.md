Tags: xhs, detail, safe-links, open-next, orchestration, runtime, validation

# 2026-03-08 Detail open_next dedup

## Problem
- In detail-only safe-link runs, `open_next_detail` could be scheduled twice after one close/open cycle.
- Before the fix there was one real second open for the same target, later reduced to a harmless `reused:true` second execution.

## Fix
- `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
  - `open_next_detail.trigger` is now `manual` in `detailOpenByLinks` mode.
  - `open_next_detail` adds `conditions: [{ type: 'subscription_not_exist', subscriptionId: 'detail_modal' }]`.
- `modules/camo-runtime/src/autoscript/runtime.mjs`
  - add `subscription_not_exist` condition support.
- `modules/camo-runtime/src/autoscript/schema.mjs`
  - allow `subscription_not_exist` in condition subscription validation.

## Why
- Safe-link detail progression should be driven by dependency completion, not by the raw modal disappearance event.
- Once the next detail has opened, any delayed reschedule must be blocked while `detail_modal` is visible.

## Validation
- Run `72fa976a-3710-4b62-980c-cb15ba10a2d4`
  - Path: `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-11-14-441Z/`
  - Evidence:
    - first real open: lines `183-185`
    - second execution was only `reused:true`: lines `194-196`
- Run `b0b36b6d-f8d1-4f89-a133-cb28382395cd`
  - Path: `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-14-10-468Z/`
  - Evidence:
    - first note `comments_harvest` completed: lines `103-136`
    - `close_detail` + `wait_between_notes` progressed: lines `137-161`
    - only one `open_next_detail`: lines `346/352/360`
    - no second `open_next_detail` entry for the same cycle
