Tags: xhs, detail, multi-tab, tab-switch, stale-trigger, safe-links, validation

# 2026-03-08 Detail Tab Switch Stale Trigger

## Context
- Task: `webauto-9981`
- Validation source: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- Goal: verify 5-link detail-only progression with `tabCount=4` and confirm multi-tab rotation is actually reached.

## Live Finding
- Run:
  - `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T11-10-56-693Z/`
- Summary:
  - `summary.json` shows `assignedNotes=5`, `openedNotes=5`, `commentsHarvestRuns=5`, terminal `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`.
- Event log:
  - `profiles/wave-001.xhs-qa-1.events.jsonl`
- Unique note progression worked:
  - opened notes: `698de0c8000000001a01e38d`, `6997df4d00000000150207fd`, `69a46962000000000e03db94`, `698def79000000000b008360`, `699e8712000000001a033e9f`
- Comment harvest also ran 5 times:
  - totals: `20`, `9`, `15`, `20`, `20`
- But multi-tab rotation did not happen:
  - `tab_switch_if_needed` was skipped 4 times with reason `stale_trigger`
  - comment tab budget kept accumulating on the same slot: `20 -> 29 -> 44 -> 64 -> 84`

## Root Cause
- `tab_switch_if_needed` was defined with:
  - `trigger: detail_modal.exist`
  - `dependsOn: ['comments_harvest']`
- In live execution, `close_detail` completed first.
- By the time `tab_switch_if_needed` was force-scheduled, `detail_modal` had already disappeared, so the runtime correctly rejected it as stale.

## Fix
- File: `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
- Changed `tab_switch_if_needed` to:
  - `enabled: options.detailLoopEnabled && closeDetailEnabled && Number(tabCount || 1) > 1`
  - `trigger: 'manual'`
  - `dependsOn: ['close_detail']`
  - `oncePerAppear: false`
- This makes tab switch part of the close -> switch -> wait -> open chain instead of a disappearing modal subscription path.

## Verification
- Syntax:
  - `node --check modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
- Unit tests:
  - `node --test tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-pool-config.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
- Added assertion:
  - multi-tab detail stage now builds `tab_switch_if_needed` as `manual + dependsOn=['close_detail']`

## Open Point
- A second live rerun was started after the fix to verify real tab rotation, but this note records only the completed pre-fix 5-link evidence plus the code/test fix.
