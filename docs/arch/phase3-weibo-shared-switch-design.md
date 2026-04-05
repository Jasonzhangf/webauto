# Phase 3: Weibo Action Providers Switch to Shared Layer

## Date: 2026-04-04

## Goal
Replace weibo local duplicate implementations with `shared/` modules, keeping weibo-specific logic (like `runCamo`, `devtoolsEval`) inline.

## Current State Analysis

### Files to Switch (10 import relationships)

| File | Current Import | Target |
|------|---------------|--------|
| `comments-ops.mjs` | `sleep, parseDevtoolsJson, devtoolsEval` from `./common.mjs` | `sleep` from `../../shared/dom-ops.mjs`, `devtoolsEval` stays via new `./common.mjs` |
| `detail-ops.mjs` | `sleep, parseDevtoolsJson, devtoolsEval` from `./common.mjs` | Same as above |
| `harvest-ops.mjs` | `sleep, devtoolsEval` from `./common.mjs` | `sleep` from shared, `devtoolsEval` via common |
| `harvest-ops.mjs` | `buildTraceRecorder` from `./trace.mjs` | `../../shared/trace.mjs` |
| `harvest-ops.mjs` | `captureScreenshotToFile, sanitizeFileComponent` from `./diagnostic-utils.mjs` | `../../shared/diagnostic-utils.mjs` |
| `harvest-ops.mjs` | `ensureDir` from `./persistence.mjs` | `../../shared/persistence.mjs` |
| `harvest-ops.mjs` | `getWeiboProfileState` from `./state.mjs` | Via new `./common.mjs` (state stays weibo-specific) |
| `timeline-ops.mjs` | `devtoolsEval, sleep` from `./common.mjs` | `sleep` from shared, `devtoolsEval` via common |
| `user-profile-ops.mjs` | `devtoolsEval` from `./common.mjs` | Via new `./common.mjs` |
| `diagnostic-utils.mjs` | `callAPI` from `../../../utils/browser-service.mjs` | `../../shared/api-client.mjs` |
| `diagnostic-utils.mjs` | `ensureDir` from `./persistence.mjs` | `../../shared/persistence.mjs` |

### Files Identical to Shared (can delete after switch)

| Local File | Shared Equivalent | Status |
|-----------|-------------------|--------|
| `./trace.mjs` | `../../shared/trace.mjs` | **Identical** → delete |
| `./diagnostic-utils.mjs` | `../../shared/diagnostic-utils.mjs` | **Identical** (after import fix) → delete |

### Files to Keep (weibo-specific)

| File | Reason |
|------|--------|
| `./common.mjs` | Contains `runCamo`, `devtoolsEval`, `parseDevtoolsJson` — weibo-specific CLI evaluation |
| `./state.mjs` | Contains weibo-specific state schema |
| `./persistence.mjs` | Contains weibo-specific `resolveWeiboOutputContext`, `mergeWeiboPosts`, `weiboPostDedupKey` |

### Key Design Decision: `devtoolsEval` stays in common.mjs

Weibo's `devtoolsEval` uses `runCamo` (camo CLI spawnSync) while shared `eval-ops.mjs` uses `callAPI` (HTTP fetch). These are different execution paths:
- XHS: `callAPI` via browser-service HTTP port 7704
- Weibo: `runCamo` via camo CLI direct command

Both are valid. Weibo keeps its own `devtoolsEval` in `common.mjs`, but `sleep` switches to shared.

## Implementation Plan

### Step 1: Rewrite `./common.mjs`
- Remove `sleep` (import from shared)
- Keep `runCamo`, `devtoolsEval`, `parseDevtoolsJson`
- Add re-export: `export { sleep } from '../../shared/dom-ops.mjs'` for backward compat

### Step 2: Rewrite `./diagnostic-utils.mjs`
- Switch `callAPI` import to `../../shared/api-client.mjs`
- Switch `ensureDir` import to `../../shared/persistence.mjs`
- File becomes identical to shared → delete it

### Step 3: Update `./harvest-ops.mjs` imports
- `sleep` → `../../shared/dom-ops.mjs` (or via common re-export)
- `buildTraceRecorder` → `../../shared/trace.mjs`
- `captureScreenshotToFile`, `sanitizeFileComponent` → `../../shared/diagnostic-utils.mjs`
- `ensureDir` → `../../shared/persistence.mjs`
- `devtoolsEval` → stays from `./common.mjs`
- `getWeiboProfileState` → stays from `./state.mjs`

### Step 4: Update `./comments-ops.mjs` imports
- `sleep` → `../../shared/dom-ops.mjs`
- `devtoolsEval`, `parseDevtoolsJson` → stays from `./common.mjs`

### Step 5: Update `./detail-ops.mjs` imports
- Same as comments-ops.mjs

### Step 6: Update `./timeline-ops.mjs` imports
- `sleep` → `../../shared/dom-ops.mjs`
- `devtoolsEval` → stays from `./common.mjs`

### Step 7: Update `./user-profile-ops.mjs` imports
- `devtoolsEval` → stays from `./common.mjs`

### Step 8: Delete redundant files
- Delete `./trace.mjs` (identical to shared)
- Delete `./diagnostic-utils.mjs` (now identical to shared)

## Verification
1. `node -e "import(...)"` for all 16 weibo mjs files
2. Manual camo test: weibo timeline harvest
3. E2E via daemon: weibo-timeline task

## Risk Assessment
- **Low risk**: All changes are import path switches, no logic changes
- **No behavioral change**: `sleep` implementation identical, `devtoolsEval` stays weibo-specific
- **Backward compatible**: `./common.mjs` re-exports `sleep` so files can migrate incrementally
