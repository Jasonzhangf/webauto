# 2026-03-11 Show-More Diagnostics Plan

Tags: xhs, detail, show-more, expand-replies, comments, diagnostics, instrumentation

## Verified Current State
- Latest stable 4-tab detail run: `bffa974f-7eda-4a48-947f-fd7be8d23b72`
- Summary: `openedNotes=4`, `commentsCollected=620`, `commentsExpected=1112`, coverage about `55.8%`
- No new tab-pool/login/risk blocker in the latest run; primary suspicion shifts back to reply expansion coverage.

## Current Expand-Replies Behavior
- `xhs_expand_replies` lives in `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
- It already records only aggregated `expanded` and `scanned`
- It re-reads visible targets before each click via `readExpandReplyTargets()` from `comments-ops.mjs`
- `readExpandReplyTargets()` only returns currently visible targets and dedups by rect/text

## Likely Blind Spots
- We do not persist per-note show-more diagnostics, so after a run we cannot answer:
  - how many visible show-more targets were found before the first click
  - how many total distinct show-more texts were seen across the note lifecycle
  - how many clicks succeeded versus no-op clicks
  - whether clicking one show-more caused additional hidden show-more targets to appear later
- Because we only track `expanded` and `scanned`, a low-coverage run cannot distinguish:
  - no more visible targets actually existed
  - targets existed but were never surfaced into viewport
  - targets were clicked but did not expand comments
  - targets were clicked but the resulting extra replies still were not harvested before bottom exit

## Recommended Instrumentation
1. Save per-note show-more metrics into action trace / events:
   - `showMoreVisibleInitial`
   - `showMoreVisibleMax`
   - `showMoreDistinctSeen`
   - `showMoreClicks`
   - `showMoreTextsSample`
2. After each click, capture delta snapshot:
   - comments count before / after click
   - visible show-more count before / after click
   - whether the clicked text disappeared
3. Persist a per-note artifact, for example:
   - `show-more.summary.json`
   - fields: `noteId`, `expectedComments`, `commentsCollected`, `clickAttempts`, `successfulExpansions`, `visibleTargetsTimeline`
4. Add a terminal summary field at merged run level:
   - `showMoreClicksTotal`
   - `showMoreNotesWithTargets`
   - `showMoreNotesExpanded`

## Diagnostic Goal
After instrumentation, we should be able to answer with evidence whether low coverage is caused by:
- missing show-more discovery
- failed show-more clicking
- show-more appearing late but never revisited
- harvest exiting at bottom before newly expanded replies are fully collected

## Verified Run Evidence
- Rerun completed on 2026-03-11 with runId `3b81f6c4-7cb5-469e-ad62-161eaa475c32`
- Summary path: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T02-50-04-453Z/summary.json`
- Totals: `openedNotes=4`, `commentsCollected=620`, `commentsExpected=1112`, coverage about `55.8%`
- Terminal code: `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`

## Show-More Diagnostic Findings
- Instrumentation confirmed `expand_replies` actually ran on all 4 notes, not just the first visible batch.
- Per-note diagnostics from `comments_harvest.result.showMore`:
  - `698de0c8000000001a01e38d`: no visible show-more target seen, `clicks=0`, `distinctSeen=0`
  - `6997df4d00000000150207fd`: `clicks=3`, `distinctSeen=3`, texts included `展开 8 条回复`, `展开 2 条回复`, `展开更多回复`
  - `69a46962000000000e03db94`: `clicks=2`, `distinctSeen=2`, texts included `展开 1 条回复`, `展开 2 条回复`
  - `698def79000000000b008360`: `clicks=2`, `distinctSeen=4`, texts included `展开 20 条回复`, `展开 34 条回复`, `展开 32 条回复`, `展开更多回复`
- `clickTimeline` shows the operation re-read visible targets after each click and did not stay stuck on the initial target set.
- The largest note (`698def79000000000b008360`) still exited at bottom with `283 / 551` visible-vs-expected comments after only 2 successful show-more clicks, so low coverage is not explained only by “first show-more never clicked”.

## Current Conclusion
- The previous hypothesis “show-more subscription fires once then stops forever” is not supported by this rerun.
- Current evidence says reply expansion is working for visible targets, but coverage is still low because visible targets are sparse relative to expected reply count, and the harvest loop still reaches bottom before expected comments are fully surfaced.
- Next debugging direction should focus on why many expected replies never become visible during scrolling, not on whether the current visible show-more buttons are being clicked at all.

## 2026-03-11 Follow-up Fix
- User requirement confirmed: `expand_replies` must run inside `comments_harvest` on every scroll round, and a single detail page may expand multiple times across the same harvest lifecycle.
- Implementation change:
  - removed the standalone `expand_replies` operation from the detail autoscript template
  - moved reply expansion into `executeCommentsHarvestOperation()` so it runs once before the initial snapshot and again before each later round
  - added aggregation so `lastCommentsHarvest.showMore` now reflects all expand passes in the note lifecycle, not only the last pass
- Verification:
  - `node --test tests/unit/webauto/xhs-show-more-diagnostics.test.mjs tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-open-detail-requeue.test.mjs tests/unit/webauto/xhs-interaction-guard.test.mjs tests/unit/webauto/search-gate-core.test.mjs tests/unit/webauto/verify-subscriptions-fallback.test.mjs tests/unit/webauto/xhs-login-guard-signal.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - `34/34` passed
- UI CLI verification note:
  - `node bin/webauto.mjs ui cli start --build` succeeded and Desktop Console started with PID `61387`
  - immediate follow-up `ui cli status --json` failed because the window auto-closed during startup; evidence in `~/.webauto/logs/desktop-lifecycle.jsonl` and `~/.webauto/logs/ui-cli-actions.jsonl`
  - this appears to be an unrelated existing UI lifecycle issue, not a failure in the show-more change itself

## 2026-03-11 Anchor Drift Finding
- Manual debugging confirmed a second root cause after repeated expand became active:
  - after clicking `.show-more`, the detail DOM can reflow and move the visible comment block
  - the old harvest loop kept using the pre-expand visible comment anchor as the next scroll focus target
  - this stale anchor can point outside the real comment scroll container after DOM reflow, causing wrong-direction scrolling and accidental clicks on unrelated controls such as collect/favorite
- Fix implemented in `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`:
  - after every expand pass with `expanded > 0`, `comments_harvest` now immediately re-runs comment-context focus
  - the re-focus path explicitly prefers the comment scroll container instead of the previously visible comment item
  - the refreshed scroll target replaces the stale `commentScroll` before the next keyboard scroll step
- Regression coverage added:
  - `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - new test asserts that after expand-triggered DOM change, the subsequent scroll uses refreshed `.note-scroller` anchor coordinates rather than the stale comment item position
- Verification:
  - `node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - `25/25` passed

## 2026-03-11 4-Tab Resume Chain Fix
- New blocker confirmed from real run `553d96cf-e31f-4b05-baa9-dcdbb6eddba8`:
  - first note paused correctly at `tab_comment_budget_reached`
  - `close_detail` returned `method=deferred_rotation`
  - `tab_switch_if_needed` returned `tabIndex=2, targetIndex=0, reason=paused_slot_rotation`
  - but `open_next_detail` never fired afterward, so the run stayed at `progress=1/4`
- Root cause:
  - `open_next_detail` still depended on `comments_harvest`
  - after a paused first tab, `comments_harvest` for the next tab had not yet run, so the dependency graph blocked the next open even though `wait_between_notes` and `tab_switch_if_needed` had already completed
- Fix:
  - `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
  - `open_next_detail.dependsOn` is now `['wait_between_notes', 'ensure_tab_pool', 'tab_switch_if_needed']` for multi-tab safe-link detail flow
  - this keeps `comments_harvest` as the work inside the opened detail, not a prerequisite for opening the next detail
- Additional resume improvement from user requirement:
  - before pausing a tab, `comments_harvest` now snapshots two consecutive visible comments as `resumeAnchor`
  - when that tab resumes, harvest probes the visible DOM for the same consecutive pair and clicks back onto that location before continuing
  - implementation files:
    - `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-slot-state.mjs`
    - `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
    - `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
- Verification:
  - `node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - `37/37` passed
  - `node bin/webauto.mjs ui cli status --json` returned `ok=true, ready=true, pid=40619` on 2026-03-11

## 2026-03-11 Resume Binding Drift Finding
- Verified from real merged run `run-2026-03-11T05-18-51-116Z` that the remaining low coverage is no longer explained by tab deadlock or missing expand clicks.
- Evidence:
  - `open_next_detail` did continue after `tab_switch_if_needed`; the chain no longer stalled behind a global `detail_modal` state.
  - `after_expand_reanchor` appeared in real events for large notes, confirming post-expand scroll re-anchoring was active.
  - `resume_anchor_save` appeared multiple times, but the same run produced no `resume_anchor_probe` events.
- Root cause found in code path:
  - `executeCommentsHarvestOperation()` resolved the active slot through `resolveRuntimeNoteBinding()`.
  - That helper preferred `detailLinkState.activeTabIndex` and then `tabState.cursor`, so after a paused-slot rotation the resumed detail could still inherit the wrong slot binding.
  - Real evidence matched this: later harvest on note `698de0c8000000001a01e38d` started with `expectedNoteId=null` and `tabIndex=4`, even though the live note was a previously paused note and should have restored by note-bound slot state.
- Fix implemented:
  - `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `resolveRuntimeNoteBinding()` now falls back to scanning slot state by current `state.currentNoteId/currentHref` when the active/cursor tab does not have a bound link.
  - This keeps slot resolution aligned to the current note instead of blindly trusting the rotated cursor.
- Regression coverage added:
  - `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - new test covers resume-anchor restore when `tabState.cursor` and `detailLinkState.activeTabIndex` have already rotated away from the paused slot, but the current note binding still identifies the correct slot.

## 2026-03-11 Manual Once-Per-Appear Cycle Fix
- Fresh real run `74e79678-56c6-4744-a02e-d92152af3575` proved the first-note path was healthy after the slot-binding fix:
  - first big note `698de0c8000000001a01e38d` started with `expectedNoteId=698de0c8000000001a01e38d`
  - `after_expand_reanchor` appeared in real events
  - `resume_anchor_save` fired at the 50-comment tab budget edge
  - `open_next_detail` opened the second note successfully after `tab_switch_if_needed`
- New blocker then surfaced in the same run:
  - after `open_next_detail` completed, the runtime stayed on repeated `detail_modal.exist/detail_show_more.exist` ticks and did not start a second `warmup_comments_context` / `comments_harvest`
  - real evidence showed only one completed `comments_harvest`, while later modal state kept changing under the same persistent `detail_modal`
- Root cause:
  - manual-triggered `oncePerAppear` operations that derive their cycle from `subscription_exist` conditions still used only `presenceVersion`
  - in multi-tab safe-link detail flow the modal can stay globally present while the note changes, so the cycle key must include `subscription.stateKey` just like direct `detail_modal.exist` triggers
- Fix implemented:
  - `modules/camo-runtime/src/autoscript/runtime.mjs`
  - `getOperationCycleKey()` now folds in `event.stateKey` / subscription `stateKey` for `subscription_exist`-derived once-per-appear cycles before falling back to `presenceVersion`
  - this allows manual chains such as `detail_harvest -> warmup_comments_context -> comments_harvest` to re-arm when the modal stays mounted but the note path changes
- Regression coverage added:
  - `tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - new test proves a manual `subscription_exist(detail_modal)` once-per-appear chain restarts across note stateKey changes and does not stay locked to the first modal presence
- Verification:
  - `node --test tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - `42/42` passed
  - `npm run build:services` passed

## 2026-03-11 Condition-Based Cycle Reset Fix
- Real run `51988dcc-4b0d-4d83-9063-8bd3a36fb543` exposed one more multi-tab safe-link blocker on the 4th note `698def79000000000b008360`.
- Evidence from `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T07-42-19-164Z/profiles/wave-001.xhs-qa-1.events.jsonl`:
  - `open_next_detail` did open the 4th note successfully.
  - `close_detail` then ran against the previous paused slot and briefly navigated it away.
  - `warmup_comments_context` still started, but before `comments_harvest` began, a `detail_modal.disappear` event reset subscription state to `exists=false`.
  - `comments_harvest` was skipped with `reason=stale_conditions`, payload showing `subscription_exist(detail_modal)` false and `stateKey=""`.
- Root cause in runtime:
  - `getOperationCycleKey()` had already been fixed to derive manual `oncePerAppear` cycles from `subscription_exist(detail_modal)` state.
  - But `resetCycleOperationsForSubscription()` still only reset operations whose trigger subscription matched the changing subscription.
  - Manual-chain operations such as `warmup_comments_context` and `comments_harvest` use trigger=`manual` and derive cycle identity from `conditions: subscription_exist(detail_modal)`, so they were not being fully re-armed on the next modal presence cycle.
- Fix implemented in `modules/camo-runtime/src/autoscript/runtime.mjs`:
  - `resetCycleOperationsForSubscription()` now uses `getOperationCycleSubscriptionId(operation)` instead of only checking `trigger.subscriptionId`.
  - This makes trigger-based and condition-based `oncePerAppear` operations share the same reset truth source.
- Regression coverage added:
  - `tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - new test proves a manual `subscription_exist(detail_modal)` chain restarts after a real disappear/appear cycle even when the pathname stays the same.
- Verification:
  - `node --test tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
  - `43/43` passed
  - `npm run build:services` passed
  - `node bin/webauto.mjs ui cli status --json` returned `ok=true, ready=true, pid=24626` on 2026-03-11

## 2026-03-11 Fresh 4-Tab Re-Run Evidence
- Fresh verification run after the condition-based cycle reset fix:
  - runId: `9f00ad2f-fcd7-43df-b057-1a4658c7b43c`
  - merged dir: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T07-57-35-088Z`
- Verified mid-run evidence from events:
  - first large note `698de0c8000000001a01e38d` harvested again with `expectedNoteId` stable, repeated `show-more` expansion, and `after_expand_reanchor` present.
  - the run advanced through later notes; `open_next_detail` reached the 4th note `698def79000000000b008360`.
  - unlike the previous broken run, the 4th note did not stop at `comments_harvest -> stale_conditions`.
  - actual evidence shows:
    - `open_next_detail` done for `698def79000000000b008360`
    - `comments_harvest` started for that note
    - `expectedNoteId=698def79000000000b008360`
    - initial expand pass executed with texts like `展开 20 条回复` / `展开 35 条回复`
    - `after_expand_reanchor` appeared for the 4th note as well
- Current meaning:
  - the blocker "4th note opens but never enters comments harvest" is no longer reproducing in the fresh run.
  - remaining work is to wait for terminal summary and then evaluate coverage / resume behavior, not to re-open the previous stale-conditions bug.

## 2026-03-11 Fresh 4-Tab Re-Run Summary
- The fresh run completed successfully:
  - runId: `9f00ad2f-fcd7-43df-b057-1a4658c7b43c`
  - summary: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T07-57-35-088Z/summary.json`
  - terminal code: `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`
- Verified totals:
  - `assignedNotes=4`
  - `openedNotes=7`

## 2026-03-11 Comment Panel Reopen Misfire Fix
- Real run `31b99595-7210-49b0-9e4b-db6596cd1923` exposed a new low-coverage blocker unrelated to session stop.
- Evidence from `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T10-48-09-906Z/profiles/wave-001.xhs-qa-1.events.jsonl` for note `69a46962000000000e03db94`:
  - `open_next_detail` and `detail_harvest` both succeeded.
  - At lines `747-749`, `focus_comment_context_targets_read` already had `commentTotalFound=true` and `commentScrollFound=true`, but `visibleCommentFound=false`.
  - The old logic still treated this as “need to click comment entry again”, clicked `.chat-wrapper .count`, then by lines `770-774` all comment anchors disappeared and the note exited with `comment_panel_not_opened`.
  - This matches the user-observed failure mode where comment-entry clicks can collapse or navigate away from an already-open comment panel.
- Unique fix point: `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `focusCommentContext()` now treats any existing comment context as authoritative: if either visible comments, comment total, or comment scroll container already exists, it will not click the comment entry again.
  - Added progress event `focus_comment_context_entry_skip` with `reason=existing_comment_context` for diagnostics.
  - `comment_panel_not_opened` is now only returned when all three signals are absent after the probe path.
- Regression coverage added in `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`:
  - new test proves that when `.total` and `.note-scroller` already exist but no visible `.comment-item` has rendered yet, the flow skips entry-click and focuses `.note-scroller` directly.
- Verification:
  - `node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - `11/11` passed
  - `node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - in the sampled output, the targeted suites continued passing with no regression signal before command output truncation
  - `npm run build:services` passed
- Current meaning:
  - the next real 4-tab rerun should specifically verify that notes with pre-opened comment context no longer collapse into `comment_panel_not_opened` after an unnecessary entry click.

## 2026-03-11 Camo Command Log And Stop-Source Finding
- Linked `camo` true source now writes a global command log at:
  - `~/.camo/logs/command-log.jsonl`
- Logged fields are now enough to trace command origin end-to-end:
  - `ts`
  - `action`
  - `profileId`
  - CLI `command` / `args`
  - request `payload`
  - `meta.sender.source`
  - `meta.sender.cwd`
  - `meta.sender.pid`
  - `meta.sender.ppid`
  - `meta.sender.argv`
- Verified camo-side evidence:
  - unit tests passed in linked camo with `node --test tests/unit/utils/command-log.test.mjs tests/unit/utils/browser-service.test.mjs`
  - request payload now carries sender metadata, so later live stop/debug commands can be tied back to the exact caller cwd and process chain
- New webauto blocker isolated with current artifacts:
  - run under inspection: `e399cce6-e0b5-418c-8761-b92aaacb8026`
  - merged events: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T09-44-20-345Z/profiles/wave-001.xhs-qa-1.events.jsonl`
  - browser-service log: `~/.webauto/logs/browser-service.crash.jsonl`
  - desktop lifecycle log: `~/.webauto/logs/desktop-lifecycle.jsonl`
- Verified sequence:
  - around `2026-03-11T09:46:53Z`, Desktop Console emitted `window_close -> window_all_closed -> before_quit -> window_closed -> app_exit_cleanup_start`
  - at nearly the same time, browser-service recorded a stop edge for the active runtime and the run then degraded into repeated `SUBSCRIPTION_WATCH_FAILED` / `session for profile xhs-qa-1 not started`
  - current webauto source still runs `cleanupCamoSessionsBestEffort()` inside `cleanupRuntimeEnvironment()` even on `reason="window_closed"`
  - that helper unconditionally issues `camo stop all`
- Current conclusion:
  - the active 4-tab XHS session can still be killed by Desktop Console shutdown even though `window_closed` already skips run-process termination and core-service shutdown
  - the next fix point is webauto desktop cleanup policy, not XHS harvest logic itself

## 2026-03-11 Stuck-Run Forensics And Runtime Guard Fix
- New stuck run under inspection:
  - runId: `fd24f253-53cf-40a7-bd67-7a1d9052b9a1`
  - events: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T08-39-06-414Z/profiles/wave-001.xhs-qa-1.events.jsonl`
  - modal trace: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T08-39-06-414Z/profiles/xhs-qa-1.detail-modal-trace.jsonl`
- Verified behavior from artifacts:
  - first note still started with correct initial focus on `.note-scroller`
  - round 3 reached `expand_replies_pass` and then emitted only `focus_comment_context_start` for `mode=after_expand_loop`
  - no later `focus_comment_context_done`, no `operation_error`, no `operation_done`, and no `summary.json`
  - Unified status/API still reported `status=running, processed=1/4`, so this was a stale running task, not a completed run
- Verified browser-service evidence:
  - `~/.webauto/logs/browser-service.crash.jsonl` shows `mouse:click`, `evaluate`, `page:list`, and `getStatus` continuing around `2026-03-11T08:40:33Z`
  - there was no matching browser-service or unified-api crash at that timestamp
- Runtime hardening fix applied in true source:
  - file: `modules/camo-runtime/src/autoscript/runtime.mjs`
  - `runOperation()` now wraps unexpected `executeOnce()` throws and normalizes them into `OPERATION_EXCEPTION` instead of letting the operation queue reject and leaving the task stuck in `running`
- Regression added:
  - `tests/unit/webauto/autoscript-debug-snapshot.test.mjs`
  - new case proves a thrown `xhs_comments_harvest` handler error becomes `operation_error` + debug snapshot + nonblocking skip flow, rather than hanging silently
- Verification:
  - `node --test tests/unit/webauto/autoscript-debug-snapshot.test.mjs tests/unit/webauto/autoscript-timeout.test.mjs` => `8/8` pass
  - `npm run build:services` => pass
- Current meaning:
  - the exact inner cause of the `after_expand_loop` stall is still under active debug
  - but the runtime can no longer silently leave future reproductions in a stale `running` state if the provider throws unexpectedly

## 2026-03-11 Comment Focus Misclick Fix
- New live debugging evidence from running task `8bc33d2b-3698-40fe-8c24-4c91aeb509f7` showed the current focus step could still click a visible `.comment-item` before the comments scroller was focused.
- Evidence path:
  - `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T08-17-46-744Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- Verified offending events before the fix:
  - `focus_comment_context_after_scroll_focus` on note `698de0c8000000001a01e38d` reported `focusSource="visible_comment"`, `focusSelector=".comment-item"`
  - same pattern also appeared on later notes such as `69a46962000000000e03db94` and `698def79000000000b008360`
- User-observed symptom matched the trace:
  - clicking inside the comment focus phase could hit body media / image region, then corrupt the scroll anchor and even trigger wrong actions such as collection/favorite.
- Fix implemented in true source:
  - file: `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - change: when the comment scroll container exists, the runtime now always uses the scroll container as the actual clickable focus target.
  - `visible_comment` / `comment_total` stay only as detected context for diagnostics; they are no longer used as the actual click anchor when `.note-scroller` is available.
  - progress payload now distinguishes:
    - `focusSource` / `focusSelector`: actual clicked target
    - `detectedSource` / `detectedSelector`: best visible semantic target detected before clicking
- Regression coverage added:
  - `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - updated reanchor test now asserts the first click is `.note-scroller`, not the stale visible comment item
  - added a dedicated initial-focus test proving comments harvest clicks only the scroll container even when a visible comment item exists
- Verification:
  - `timeout 120 node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - result: `9/9` pass on 2026-03-11
- Operational meaning:
  - this removes the known "正文图片被点开 -> 锚点错乱 -> 反向滚动/误触收藏" focus-path bug at the comments entry / refocus stage.
  - next live rerun should confirm event payload switches from `focusSource="visible_comment"` to `focusSource="comment_scroll"` on initial focus as well, not only after expand reanchor.

## 2026-03-11 Live Re-Run Confirmation
- Fresh verification run:
  - runId: `fd24f253-53cf-40a7-bd67-7a1d9052b9a1`
  - merged dir: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T08-39-06-414Z`
- Early run evidence confirms the fix on real runtime behavior, not only unit tests:
  - `open_first_detail` opened note `698de0c8000000001a01e38d`
  - `comments_harvest` started normally
  - initial focus event now reports:
    - `focusSource="comment_scroll"`
    - `focusSelector=".note-scroller"`
    - `detectedSource="visible_comment"`
    - `detectedSelector=".comment-item"`
  - exact evidence lines live in:
    - `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T08-39-06-414Z/profiles/wave-001.xhs-qa-1.events.jsonl`
    - around `focus_comment_context_after_scroll_focus` / `focus_comment_context_done` for note `698de0c8000000001a01e38d`
- This verifies the intended split is now true in production flow:
  - semantic detection can still recognize a visible comment item
  - actual click anchor is forced to the comment scroll container
- Guard state during this fresh rerun:
  - no `risk_guard`
  - no `login_guard`
  - `commentsHarvestRuns=4`
  - `commentsCollected=185`
  - `commentsExpected=1114`
- Per-note verified comment harvest results:
  - `698de0c8000000001a01e38d`: `59 / 484`, paused at tab budget, `after_expand_reanchor` present, show-more clicks `6`
  - `6997df4d00000000150207fd`: `43 / 48`, reached bottom, show-more clicks `5`
  - `69a46962000000000e03db94`: `21 / 29`, paused at tab budget, show-more clicks `2`
  - `698def79000000000b008360`: `62 / 553`, paused at tab budget, show-more clicks `8`
- Important conclusion:
  - the previous runtime blocker is fixed: all 4 assigned notes now entered and completed `comments_harvest` at least once.
  - remaining low coverage is no longer caused by the 4th note being skipped; it is now a harvesting depth / revisit / budget strategy problem.
  - `openedNotes=7` while `assignedNotes=4` indicates the detail loop still re-opened some notes, so the next debugging target should shift to duplicate-open behavior and paused-note revisit policy.

## 2026-03-11 Manual Graph Re-Schedule Fix
- Fresh run `9f00ad2f-fcd7-43df-b057-1a4658c7b43c` revealed a second runtime issue after the 4th-note blocker was fixed:
  - `assignedNotes=4` but `openedNotes=7`
  - event evidence showed repeated `detail_links_claim` for the same note ids:
    - `6997df4d00000000150207fd` claimed twice before being marked done
    - `69a46962000000000e03db94` claimed three times, including one `reused=true` reopen
    - `698def79000000000b008360` claimed twice
- Root cause:
  - after every successful manual operation, runtime still called `scheduleReadyOperations(event)` on the same manual event.
  - manual dependency chains were already advanced by `scheduleDependentOperations(operation.id, event)`.
  - the extra whole-graph rescan caused sibling manual operations like `open_next_detail` to become schedulable again after unrelated manual completions such as `warmup_comments_context` or `comments_harvest`.
- Fix implemented in `modules/camo-runtime/src/autoscript/runtime.mjs`:
  - after `operation_done` and `skipped_nonblocking`, whole-graph `scheduleReadyOperations()` now runs only for non-manual events.
  - manual chains continue exclusively through dependency-driven `scheduleDependentOperations()`, preventing duplicate sibling scheduling.
- Regression coverage added:
  - `tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - new test: `does not reschedule sibling manual operations after a manual dependency already advanced the chain`
- Verification:
  - focused new test passed with `node --test --test-name-pattern "does not reschedule sibling manual operations" tests/unit/webauto/autoscript-stale-trigger-resume.test.mjs`
  - existing related suites passed:
    - `node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-unified-template-stage.test.mjs`
    - `28/28` passed
  - `npm run build:services` passed

## 2026-03-11 Reanchor Logging Truth-Source Fix
- Verified rerun under inspection:
  - runId: `e399cce6-e0b5-418c-8761-b92aaacb8026`
  - events: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-11T09-44-20-345Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- Verified result:
  - the old `expand` 后直接僵死且没有 error 的问题已不再复现；该 run 多次越过 `after_expand_loop`
  - 但 `after_expand_reanchor` 仍错误记录 `focusSource="visible_comment"`，而同一轮更早的 `focus_comment_context_before_focus_click` / `focus_comment_context_after_scroll_focus` 已证明实际点击的是 `.note-scroller`
- True-source fix:
  - file: `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `focusCommentContext()` 现在返回 `clickedFocusTarget`
  - `after_expand_reanchor` 改为记录实际点击目标 `clickedFocusTarget`
  - 同时保留 `detectedFocusSource/detectedFocusSelector` 作为诊断字段，避免丢失可见评论项探测信息
- Regression coverage:
  - file: `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - new case asserts `after_expand_reanchor.focusSource === comment_scroll` while `detectedFocusSource === visible_comment`
- Verification:
  - `node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/autoscript-debug-snapshot.test.mjs tests/unit/webauto/autoscript-timeout.test.mjs`
  - `npm run build:services`
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`

## 2026-03-11 New Blocker After Hang Fix
- Same rerun `e399cce6-e0b5-418c-8761-b92aaacb8026` exposed a new blocker after the hang fix:
  - events lines `717-730` show both `comments_harvest` and the follow-up `detail_harvest` failing with `message="fetch failed"`
  - immediately before that, browser-service log shows an explicit `action="stop" profileId="xhs-qa-1"` at `2026-03-11T09:46:53.816Z`
  - evidence path: `~/.webauto/logs/browser-service.crash.jsonl` around lines `8542288-8542310`
- Verified sequence:
  - browser-service was still serving `evaluate`, `page:list`, `keyboard:press`, `getStatus` successfully for `xhs-qa-1`
  - then a direct `stop xhs-qa-1` happened
  - after that, watch loop emitted repeated `SUBSCRIPTION_WATCH_FAILED fetch failed`
  - browser-service restarted later and then returned `session for profile xhs-qa-1 not started`
- Current conclusion:
  - 当前真正阻塞点已从 `expand 后 focus 卡死` 切换为 `运行中 session 被 stop，导致后续 fetch failed`
  - stray `xhs-comments-budget` evaluate noise exists in browser-service log, but it does not explain the precise failure edge because the decisive event for this run is the explicit `stop xhs-qa-1`
  - next debugging step is to trace who issued browser-service `stop` for the active profile during the detail run

## 2026-03-11 Detail Modal Disappear Subscription Root Cause

### Problem Evidence
- Real 8-note detail run `662195dd-04df-4c43-b455-023a2952f897` (merged dir `run-2026-03-11T11-30-28-885Z`) exposed a new blocker unrelated to comment entry logic.
- Evidence from events file:
  - First note `698de0c8000000001a01e38d`: `detail_harvest.operation_start` at line 156 (11:32:07.265), `detail_harvest.operation_done` at line 157 (11:32:07.490) with latency 224ms.
  - Then `detail_modal.disappear` at line 227 (11:32:15.762) — 8 seconds later, with no `close_detail` operation in between.
  - `comments_harvest.operation_error` at line 244 (11:32:17.839) with code `COMMENTS_CONTEXT_LOST`.

### Root Cause
- `detail_harvest` trigger is `detail_modal.exist`, and it completes in ~200ms by reading snapshot only.
- After `detail_harvest` completes, the modal stays open but no further interaction happens before `comments_harvest` starts.
- The `detail_modal.disappear` subscription event fires (likely Xiaohongshu auto-close after idle timeout, NOT 风控).
- This causes `detail_harvest` and `comments_harvest` conditions to become stale, blocking the chain.

### User Requirement
- **Do NOT rely on `detail_modal.disappear` subscription to detect close.**
- **Use manual `Esc` key press via `close_detail` operation as the single source of truth for closing detail.**
- This avoids accidental chain breaks from unexpected subscription events.

### Fix Plan
- `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`:
  - `close_detail` should always use `manual` trigger in safe-link mode, not depend on `detail_modal.exist` conditions.
  - `detail_harvest` and `comments_harvest` should not be blocked by `detail_modal.disappear` events.
- Remove `closeDetailConditions` that check `subscription_exist(detail_modal)`.
- Ensure `close_detail` always runs `pressKey('Escape')` to manually close, then the chain continues via `wait_between_notes` -> `tab_switch_if_needed` -> `open_next_detail`.

### Next Step
- Modify `xhs-autoscript-detail-ops.mjs` to remove `detail_modal.exist` conditions from `close_detail`.
- Re-run 8-note detail test and verify no more `detail_modal.disappear` surprises.
