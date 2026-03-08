# Project Memory

## Runtime Defaults
- `webauto` should treat `WEBAUTO_BRING_TO_FRONT_MODE=never` as the default runtime policy unless the user explicitly overrides it.
- `webauto` forwards `WEBAUTO_BRING_TO_FRONT_MODE` into `CAMO_BRING_TO_FRONT_MODE` for `camo` runtime control.
- `camo` formal policy is `CAMO_BRING_TO_FRONT_MODE=never`; legacy alias `CAMO_SKIP_BRING_TO_FRONT=1` remains compatibility-only.

## XHS Detail Rules
- Detail validation must use existing safe links with `xsec_token`; do not use ad-hoc search terms like "测试" or "脚本" for validation.
- Current safe-link validation source is `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`.
- If a login guard/container appears, stop actions immediately; do not continue probing or high-frequency retries.
- All operations must land on visible elements only, and each action must have an explicit carrying container.

## Comment Harvesting Rules
- Comment scrolling must be container-anchored, not page-centered.
- The validated comment focus chain is: `comment entry -> comment total -> comment scroll container`.
- Do not click comment items while establishing comment scroll focus.
- Scroll scope must remain inside the comment container; if detail context or comment context is lost, stop the comment scroll loop.
- Comment scrolling needs pacing and scope guards to avoid risk escalation.
- On current XHS detail pages, the real comment scroll carrier is `.note-scroller`; `.comments-container` and `.comments-el` are content blocks, not independently scrollable carriers.
- Current protocol-level `mouse:wheel` and `PageDown` did not move `.note-scroller` during manual validation, while direct JS `scrollTop` on `.note-scroller` did move comments. Treat protocol-to-container scroll binding as unresolved until manually revalidated.
- Clicking `.chat-wrapper .count` or `.total` currently focuses `P.content-input`; do not assume those clicks establish a usable keyboard scroll focus.
- Revalidated on 2026-03-06: the workable protocol path is `click .note-scroller -> PageDown x2 -> continue with keyboard scroll`. The first `PageDown` may be ignored; the second starts moving `.note-scroller`.
- After this fix, the next blocking issue moved to `comments_harvest` exit behavior inside unified orchestration, not the scroll carrier itself.
- Revalidated later on 2026-03-06: protocol events do reach the page, but current `camo` wheel anchoring is still broken for XHS detail comments. Evidence: page probe recorded `wheel=1`, `keydown=1`, `keyup=1`, but `.note-scroller.scrollTop` stayed unchanged; `mouse:wheel` with `anchorX=2564, anchorY=228` arrived at page coordinates `x=1279, y=228`, proving the browser-service anchor was clamped into the wrong coordinate space.
- Before changing detail orchestration again, fix `camo` protocol scroll anchoring first; otherwise comment scroll validation will keep producing false negatives even when the target point is inside the comment DOM.
- Revalidated on 2026-03-07 after fixing `camo`: `mouse:wheel` now lands on the requested XHS detail point instead of collapsing to half-width. Evidence: requested `anchorX=2564, anchorY=228`, page-observed wheel event also arrived at `x=2564, y=228` after restarting the patched browser-service.
- Real detail comment container was then moved by protocol wheel on XHS: after `chat-wrapper -> total -> comment-item` anchoring, `.note-scroller.scrollTop` changed from `297` to `507`. Treat `camo` wheel anchoring as fixed; next work returns to `webauto` detail orchestration and container binding.
- 2026-03-07 manual detail revalidation: if comments are already visible, do not click comment entry or comment total again. Go straight to `.note-scroller` focus.
- 2026-03-07 manual detail revalidation: no hardcoded coordinates are allowed for comment actions; all points must come from current visible rects.
- 2026-03-07 manual detail revalidation: on the live deepseek detail page, `click .note-scroller` alone does not change `scrollTop`, but `scrollBySelector('.note-scroller')` does move comments (`1590 -> 3956 -> 6162.5`) without opening the image viewer.
- 2026-03-07 strategy validation result: prefer strategy 1 as the unified safe path — `click comment entry -> click comment scroll container -> scroll`. It worked on live notes and moved `.note-scroller` without opening the image viewer.
- 2026-03-07 strategy validation result: strategy 2 is only a fallback concept. In current validated samples, comments were already visible, so no body-content scrolling was needed to discover comments.

## Validation Rules
- Prefer manual validation before automation when changing interaction primitives.
- For detail work, validate with real `camo` operations first, then wire the orchestration.
- Minimal post-change verification in this repo remains `node bin/webauto.mjs ui cli start --build`, `node bin/webauto.mjs ui cli status --json`, `node bin/webauto.mjs ui cli stop`.

## Unified Tab Strategy
- Unified detail runs should pre-open the required tab pool during startup and then reuse those tabs.
- After startup pre-open, later runtime should switch among existing tabs only and must not dynamically create replacement tabs.
- Tab switching should prefer the initialized tab-pool slot mapping instead of assuming live page-list order is the pool order.
- 2026-03-07: detail comment focus bug fix
- Wrong clicks can open正文图片; comments harvest must detect invalid interaction state and send Escape before continuing.
- Visible-anchor fix: readCommentTotalTarget now clamps target point into viewport; prior y=1 anchor was invalid and could miss/bleed into wrong target.
- 2026-03-07: never hardcode coordinates for detail comment actions; always derive points from visible element rects.
- If comments are already visible in detail, do not click comment entry/total again; go straight to comment scroll container focus.
- 2026-03-07: comment harvest should treat no-scroll as acceptable only when comments are empty or scroll state is already at bottom; otherwise require real scroll progress evidence.
- 2026-03-07 5-link detail validation: accept pass only when viewer stays closed and either scrollTop increases, comments are empty, or container is at bottom.

## 2026-03-07 Detail Tail Requeue Semantics
- `detail` 总体编排要求：单个链接失败不阻断整体目标，失败链接入队尾，继续处理后续链接；超过重试上限才标记 exhausted。
- 根因：旧实现中 direct-link detail 在 `xhs_open_detail` 成功后或 `xhs_comments_harvest` 结束后就被过早标记 done，导致后续 detail/comment 子阶段失败时无法回到队尾。
- 修复方向：
  - `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-state.mjs` 改为 `queue/byTab/completed/exhausted` 四态，并提供 `requeueTabLinkToTail()`。
  - `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs` 改为 open 成功只标记 active，`xhs_close_detail` 关闭时再根据 `detailLinkState.activeFailed` 决定 done 或 requeue。
  - `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs` 中 detail/comment 子阶段失败必须统一写入 `state.detailLinkState.activeFailed=true` 和 `lastFailureCode`。
- 最小验证：本地队列语义验证通过，顺序为 `a fail -> requeue tail -> b done -> c done -> a retry done`；当 `detailLinkRetryMax=2` 时，第 3 次失败进入 exhausted，不再死循环。
- 2026-03-07: `readVisibleCommentTarget()` for XHS detail must select from the current visible comment area inside the comment scroll container, not the first viewport comment node. Use viewport+container dual-visibility scoring so highlight probes do not drift to正文/边缘元素 during scroll settle.
- 2026-03-07: XHS detail 评论滚动中，普通轮次禁止重复点击评论滚动容器；否则会偶发点开正文图片。应将“滚动容器 selector”和“焦点参考 target”解耦：selector 固定评论容器，focusTarget 优先当前 visible comment；普通滚动只 probe 不 click，只有 initial/recovery 阶段才允许重新 focus click。

## 2026-03-07 Inline Visible Comment Like
- XHS detail 点赞已改为 `comments_harvest` 轮次内联执行：每轮读取当前可视评论后立刻对可视命中评论点赞，不再依赖 harvest 结束后的 standalone `comment_like` 阶段。
- 已点赞评论不再点击，但会统计为 `liked`，并累计到 `alreadyLikedSkipped`。
- unified task/WS like 统计要从 `comments_harvest` 的 result 直接读取，而不是等待 `comment_like` 事件。

## 2026-03-08 Single-Link Detail Validation
- `readLikeTargetByIndex()` must stay scoped to the active visible comment container, not `document.querySelectorAll(...)` over all comment nodes in the page. Global indexing drifts to off-screen comments and causes false `like_target_missing` / negative-rect failures.
- Live single-link validation on the preserved `deepseek` safe links proved the current baseline on note `699e8712000000001a033e9f`: detail content persisted, comments persisted, and inline visible-comment likes succeeded with `likedCount=2` on visible indexes `[14,19]`.
- `executeDetailHarvestOperation()` must persist `content.md` via the existing content writer so single-link detail validation produces the same content artifact shape as later batch detail runs.

## 2026-03-08 Detail Open Progression
- In safe-link `detail` mode, `open_next_detail` must not listen to raw `detail_modal.disappear`. The reliable progression is `close_detail -> wait_between_notes -> open_next_detail`.
- Runtime now supports `subscription_not_exist` conditions. `open_next_detail` uses it to block any re-trigger while `detail_modal` is already visible.
- Validation evidence:
  - Run `72fa976a-3710-4b62-980c-cb15ba10a2d4` at `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-11-14-441Z/` showed one real `open_next_detail` and one extra harmless `reused:true` open.
  - Run `b0b36b6d-f8d1-4f89-a133-cb28382395cd` at `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-08T10-14-10-468Z/` showed only one `open_next_detail` occurrence (lines 346/352/360 in `profiles/wave-001.xhs-qa-1.events.jsonl`) with no second duplicate scheduling.
- Multi-tab state machine now has direct unit coverage for unique per-tab assignment, failed-link requeue-to-tail, paused-slot reuse, completed-slot closeability, and failed-slot closeability.
- 2026-03-08: fixed autoscript dependency force-run semantics so subscription-triggered detail ops cannot run under unrelated events; see `memory/2026-03-08-runtime-force-run-trigger-guard.md`.
- 2026-03-08: safe-link `detail` mode must cap progression at the first `maxNotes` unique links from `safe-detail-urls.jsonl`; do not treat the whole file as runnable when the run only assigned a smaller budget.
- Single source of truth for that cap is `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-state.mjs`, where cached safe links are normalized and limited before queue assignment.
- Live validation:
  - `run-2026-03-08T10-54-44-168Z` stopped after exactly 1 opened note and 1 comments harvest, then ended with `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`.
  - `run-2026-03-08T10-56-03-136Z` stopped after exactly 2 opened notes and 2 comments harvest runs, then ended with `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`.
- 2026-03-08: safe-link `detail` open results must report the settled canonical note identity, not the pre-settle assigned link id.
- Live redirect-settle evidence from `run-2026-03-08T11-03-54-124Z`:
  - first note stayed stable: `open_first_detail -> detail_harvest -> comments_harvest` all used `698de0c8000000001a01e38d`.
  - second assigned safe link was `6997df4d00000000150207fd`, but live settle observed a redirect to `684bdeeb0000000023014875`; `xhs_open_detail` now reports `684bdeeb0000000023014875`, and later `detail_harvest` / `comments_harvest` use the same id.
- Single source of truth for that canonical identity is now `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`, which re-reads href/noteId after open and persists the settled value into runtime state.
- 2026-03-08: multi-tab `detail` rotation cannot rely on `detail_modal.exist` after `close_detail`. `tab_switch_if_needed` must be a manual dependency of `close_detail`; otherwise it is skipped as `stale_trigger` every cycle and rotation never happens.
- Pre-fix live evidence from `run-2026-03-08T11-10-56-693Z`: 5 safe links completed with `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`, but `tab_switch_if_needed` was skipped 4 times as stale, so all notes still ran on slot 1 and tab budget climbed `20 -> 29 -> 44 -> 64 -> 84`.



## 2026-03-08 21:29:04 - 100-link Test Status


**Status**: In Progress (14/100 notes opened)
**Root Cause**: 
- `ensure_tab_pool` new_tab_failed at bootstrap
- `comments_harvest` timeout (180s) on note 15
- Only 14 unique notes opened out of 100 target

**Next Steps**:
1. Fix timeout handling to retry/skip instead of exit
2. Increase tab pool initialization robustness
3. Re-run 100-link test
