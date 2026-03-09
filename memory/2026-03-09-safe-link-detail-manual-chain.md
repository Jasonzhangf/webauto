# Safe-Link Detail Manual Chain

Date: 2026-03-09
Tags: xhs, detail, safe-link, autoscript, runtime, comments, close-detail

## Problem

Using preserved safe links only, live run `504d0961-f229-4c9d-8bc8-00465ab61ce1` under:
`/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T00-20-33-307Z/`
showed that `comments_harvest` completed on the same modal, but the chain never transferred control to `close_detail -> wait_between_notes -> open_next_detail`.

Evidence from `profiles/wave-001.xhs-qa-1.events.jsonl`:
- `comments_harvest` done at `2026-03-09T00:23:14.646Z`
- then `detail_harvest` and `warmup_comments_context` restarted on the same modal
- no `close_detail`, `wait_between_notes`, or `open_next_detail` events appeared

## Root Cause

Two issues combined:

1. Safe-link detail orchestration still bound modal-stage ops to raw `detail_modal.exist` subscription triggers.
   That allowed the same visible modal heartbeat to reschedule `detail_harvest`, `warmup_comments_context`, and `comments_harvest` again before the close chain could take over.

2. Runtime `oncePerAppear` bookkeeping only derived appear-count cycles from subscription triggers.
   After switching safe-link modal ops to `manual`, the runner no longer knew they were still cycle-bound to `detail_modal`, so `oncePerAppear` would not protect those manual ops unless runtime also read subscription conditions.

## Fix

### Orchestration

File: `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`

For `detailOpenByLinks === true`:
- `detail_harvest`
- `warmup_comments_context`
- `comments_harvest`
- `comment_match_gate`
- `comment_reply`
- `close_detail`

now use:
- `trigger: 'manual'`
- `conditions: [{ type: 'subscription_exist', subscriptionId: 'detail_modal' }]`
  and `close_detail` additionally keeps the `operation_done(closeDependsOn)` condition.

Result: in safe-link mode, modal-stage execution is driven only by dependency chaining, not by raw modal heartbeat events.

### Runtime

File: `modules/camo-runtime/src/autoscript/runtime.mjs`

Added `getOperationCycleSubscriptionId()` so `getTriggerAppearCount()` can derive cycle state from:
- normal subscription triggers, or
- `oncePerAppear` operations whose conditions reference a subscription (`subscription_exist`, `subscription_not_exist`, `subscription_appear`).

Result: manual ops in safe-link modal chains still honor the modal appear cycle and will not rerun on the same modal once completed for that cycle.

## Verification

Static:
- `node --check modules/camo-runtime/src/autoscript/runtime.mjs`
- `node --check modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`

Unit:
- `node --test tests/unit/webauto/xhs-tab-pool-config.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
- result: `22/22 pass`

Added regressions:
- `tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - safe-link detail modal ops are manual-chain driven
- `tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - budget-paused `comments_harvest` on the same modal does not restart before `close_detail`

## Live Follow-up

Started a new live safe-link detail validation:
- command uses preserved links only:
  `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword deepseek --stage detail --detail-open-by-links true --shared-harvest-path /Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl --max-notes 1 --env debug --do-comments true --persist-comments true --skip-account-sync --tab-count 1 --json`
- runId: `fd59bbdd-6382-4173-87a9-ca12ba6df572`
- run root: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T00-49-08-700Z/`

Early evidence confirms the front of the chain is now manual:
- `open_first_detail` done
- `detail_harvest` start trigger = `manual`
- `warmup_comments_context` start trigger = `manual`
- `comments_harvest` start trigger = `manual`

At this checkpoint the live run is still harvesting comments and had not yet reached `close_detail`; further polling is required.
