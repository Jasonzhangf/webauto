# 2026-03-08 runtime force-run trigger guard

Tags: autoscript, runtime, dependency-scheduling, xhs, detail, trigger-guard, subscriptions

- Problem: detail dependency continuation was able to run under unrelated events because `forceRun` bypassed trigger matching in `AutoscriptRunner.shouldSchedule()`.
- Evidence from live runs:
  - `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-21-35-626Z/profiles/wave-001.xhs-qa-1.events.jsonl:2413`
  - `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-21-35-626Z/profiles/wave-001.xhs-qa-1.events.jsonl:2469`
  - `comments_harvest` started while the triggering subscription context was `home_search_input` or `null`, even though its trigger is `detail_modal.exist`.
- Root cause:
  - dependency scheduling reused arbitrary current/base events;
  - `forceRun` skipped `isTriggered()`;
  - subscription dependents could therefore execute in non-detail contexts.
- Fix:
  - `scheduleDependentOperations()` now builds a synthetic event per dependent based on the dependent's own trigger.
  - `shouldSchedule()` always requires trigger match.
  - forced scheduling also requires `isTriggerStillValid()` for subscription-triggered operations.
- Regression coverage:
  - `tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - added case: subscription dependents must not force-run when their target subscription is not active.
- Validation:
  - `node --check modules/camo-runtime/src/autoscript/runtime.mjs`
  - `node --test tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-pool-config.test.mjs`
