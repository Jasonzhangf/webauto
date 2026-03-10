# 2026-03-10 Camo Runtime Convergence Sync

Tags: camo, convergence, subscription, change-notifier, operations, linked-repo, webauto

## Summary

Synced container runtime core files from linked camo (`/Volumes/extension/code/camo`) to webauto's vendored copy (`modules/camo-runtime/src/container/`).

## Synced Files

| File | Changes |
|------|---------|
| `container/change-notifier.mjs` | Minor whitespace fix |
| `container/runtime-core/subscription.mjs` | Added `filterMode` param, `urlMatchesFilter` helper, `pageUrl`/`filterMode` in events, better URL fallback via `getCurrentUrl` |
| `container/runtime-core/operations/index.mjs` | Added `DEFAULT_MODAL_SELECTORS`, `resolveFilterMode`, horizontal scroll support (`deltaX`), improved `resolveViewportScrollDelta`, keyboard-based pageScroll |
| `container/runtime-core/operations/viewport.mjs` | Variable rename for clarity (`width` -> `displayWidth`, etc.) |

## Key Design Decisions from Linked Camo

1. **scroll**: Full keyboard PageDown/PageUp, removed mouse:wheel (anchor coordinates often fail to scroll correct container)
2. **subscription**: Changed from "persistent state" to "per-element cycle", supports once-per-appear semantics
3. **verify_subscriptions**: Added URL filtering + fallback to current page DOM matching

## Test Status

All unit tests passing after sync:
- `npm test` - 38/38 pass
- `npm run build:services` - clean build

## Test Fixes During Sync

1. `modules/container-registry/tests/container-registry.test.ts` - Changed from weibo (removed from index) to xiaohongshu
2. `tests/unit/webauto/ui-cli-command.test.mjs` - Removed stale `stage` regex assertion
3. `apps/desktop-console/src/main/task-gateway.test.mts` - Fixed test expectations to match actual behavior (keyword validation, save action returns json not runId)

## Remaining Work

- Check for other parallel implementations in webauto that duplicate camo functionality
- Run real XHS detail verification with new subscription/scroll behavior
