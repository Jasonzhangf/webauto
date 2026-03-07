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
