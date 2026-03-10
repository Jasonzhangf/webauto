# Project Memory

- 2026-03-06: Camo protocol-level click/wheel/keydown reach the page, but historical mouse wheel anchoring had a coordinate-space bug. Wheel anchoring fixes belong in `camo`; `webauto` detail orchestration should rely on container-anchored scrolling only after camo-level validation. Tags: camo, wheel, anchor, detail, xhs
- 2026-03-09: Safe-link XHS detail flow must not use raw `detail_modal.exist` as the sole scheduling source for `detail_harvest -> warmup_comments_context -> comments_harvest -> close_detail` in `detailOpenByLinks` mode. In safe-link mode this chain must be serialized through manual dependency scheduling, with `detail_modal` only as a visibility condition. Runtime `oncePerAppear` accounting must also understand manual ops that are cycle-bound by subscription conditions, otherwise the same modal can retrigger comment harvest on budget pause/failure. Tags: xhs, detail, safe-link, autoscript, runtime, state-machine
## 2026-03-09 Detail Loop Notes

- 2026-03-10: XHS 测试流程约束更新。1) `collect` 已验证稳定且快，后续真实验证优先跑 `detail`。2) 做 `detail` 前先换热点新闻语料，生成约 20 个关键词，并按“每 2 次搜索换一个关键词”轮换，避免对同一搜索词高频重复。3) `detail` 验证必须持续换不同 safe links，禁止重复消费同一个 link。Tags: xhs, testing, risk-control, detail, keyword-rotation, safe-links
- 2026-03-10: XHS `open_link` 风控语义要求补充。若某个 safe link 因 gate reject 被拒绝，运行时必须把该 link 排到队尾并继续尝试后续 link，因为只要不连续访问同一资源，后续再访问它不应继续被 reject。未完成 link 的续跑不应被当作新的连续命中。Tags: xhs, search-gate, open-link, queue, risk-control
- 2026-03-10: XHS detail 第二流程的链接队列真源已明确迁到 SearchGate。流程必须是：detail 启动先把整批 linklist `init` 到 gate；每次开帖前由 gate `next/claim` 发一个 link，同时默认把该 link 轮转到队尾；完成后 worker 发送 `done` 才从 gate 队列移除；如果未完成或 gate reject，则只 `release` 不移除，后续继续轮转；若出现 login/risk guard，必须立即停机并清空 gate 队列，不能跳过。Tags: xhs, detail, search-gate, queue, risk-control, guard

- Safe-link detail orchestration now uses a manual dependency chain for modal-stage ops (`detail_harvest -> warmup_comments_context -> comments_harvest -> close_detail -> wait_between_notes -> open_next_detail`) so the same `detail_modal.exist` heartbeat cannot reschedule work on the same modal.
- Safe-link startup should pre-open the tab pool once, then reuse slots only; dynamic refill during detail progression is treated as a bug.
- `comments_harvest` no-progress recovery rule: only treat as stalled after comment content stays unchanged for 30s; recovery pattern is up-scroll 3-5 times, then one down-scroll, repeat up to 3 cycles before exiting the note with `scroll_stalled_after_recovery`.
- Like-stage must still enable `comment_match_gate` even when reply flow is disabled; the gate is controlled by `matchGateEnabled`, not by `stageReplyEnabled`.
- Detail comment scroll defaults were increased to favor larger single-step progress, but the actual delta must stay within `95%` of the current comment viewport height so one scroll never exceeds a single visible portrait screen.
- 2026-03-09: `xhs_debug_snapshot` real落盘故障来自 `savePngBase64()` 参数顺序传反；修复后 debug probe 已能生成 JSON+PNG 证据到 `~/.webauto/download/xiaohongshu/debug/deepseek/diagnostics/debug-ops/`。Tags: xhs, diagnostics, debug-snapshot
- 2026-03-09: safe-link detail 5 条真实验证已通过，runId `260200a3-3e3b-4ca2-b68a-dd028cace423`，运行根目录 `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T05-06-06-293Z/`；结果为 `openedNotes=5`、`commentsHarvestRuns=5`、`commentsCollected=687`、`commentsReachedBottomCount=5`、terminal=`AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`。Tags: xhs, detail, safe-links, validation
- 2026-03-09: Multi-tab XHS detail flow must bind inputs, outputs, browser actions, WS events, and dedup state by `noteId`; `tab` is only the page container. Effective runtime identity is `slot/tab + noteId`. Before comment focus/scroll/like/persist, verify current page `noteId` matches the expected slot binding from `detailLinkState.activeByTab`/`linksState.byTab`; only single-tab mode may fall back to global `state.currentNoteId/currentHref`. This rule comes from run `3f04bcf0-881a-4204-ad67-17ab08dd5aa4`, where tab switch executed but comment harvest reused the previous note context. Tags: xhs, detail, noteid, multi-tab, binding, state-machine

## 2026-03-09 Detail 脚本实测结果 (runId e8e2d635)

**配置**: `--tab-count 2 --max-notes 2 --do-comments --do-likes`

**结果**:
- 58 个帖子目录有 comments.jsonl
- 评论总数 1845 条
- 点赞记录 297 条 (全部 reason=already_liked/null)

**问题**:
1. **多 tab 未生效**: 配置 `--tab-count 2`，所有操作仍在 `tabIndex: 1`
2. **滚动停滞**: exitReason 全部是 `scroll_stalled_after_recovery`
3. **评论覆盖率低**: 481 条预期评论只采 20 条 (4%)
4. **脚本未完成**: 无 AUTOSCRIPT_DONE 事件
5. **点赞未执行**: 无 reason=liked 记录

**证据路径**:
- events: `~/.webauto/download/xiaohongshu/debug/deepseek/merged/run-2026-03-09T10-26-00-040Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- like-state: `~/.webauto/download/xiaohongshu/debug/deepseek/.like-state.jsonl`

Tags: xhs, detail, test-result, tab-pool, scroll, like

## 2026-03-09 Tab Pool 压力测试结果

- 初始 6 个 tab (index 0-5)
- 切换 10 次全部成功
- 关闭 tab 5/4/3/2 命令全部返回 ok=true
- 但关闭后 list-pages 仍显示 6 个 tab，其中 4 个是 `about:newtab`

**结论**: camo close-page 命令返回 ok=true，但实际 tab 未真正关闭，只是被重置为 `about:newtab`

Tags: camo, tab-pool, close-page, bug

## 2026-03-09 滚动压力测试结果

### mouse:wheel 命令
- **结果**: 滚动完全无效
- 初始 top=710，15 次向下滚动后仍然是 top=710
- 原因: mouse:wheel 不带 anchor 参数时，wheel 事件没有正确发送到目标容器

### camo scroll 命令 (带 --selector)
- **结果**: 有效
- 初始 top=860，滚动后到达 top=3710
- 向上/向下滚动都有效
- 但 scrollTop (4460) 超过了 scrollHeight-clientHeight (3970-1624=2346)
- **问题**: max 计算有误，或 scrollHeight 在动态增长

### 结论
1. `mouse:wheel` 无 anchor 时不工作，必须使用 `scroll --selector` 命令
2. webauto detail 脚本应使用 `scroll` 命令而非 `mouse:wheel`
3. scrollHeight 动态变化，需要实时读取

Tags: camo, scroll, wheel, bug, detail

## 2026-03-09 camo 修复 (v0.1.24)

### close-page bug
- 问题: close-page 返回 ok=true，但 tab 变成 about:newtab，未真正关闭
- 根因: Playwright page.close() 有时不生效，页面变成占位符
- 修复:
  - closePage() 使用 { runBeforeUnload: false }
  - 失败时先 goto about:blank 再关闭
  - listPages() 过滤 about:newtab/about:blank

### mouse:wheel vs scroll
- 问题: mouse:wheel 不带 anchor 时滚动完全无效
- 压力测试: mouse wheel --deltay 300 执行 15 次，scrollTop 完全不变
- 修复: 使用 scroll --down --amount 300 --selector .note-scroller 代替

### 测试结果
- Tab: 创建 5 个关闭 1 个，total=4 与 list 一致 ✓
- 滚动: scroll --selector 有效，scrollTop 从 860 到 3710 ✓

Tags: camo, close-page, scroll, wheel, bug-fix

- 2026-03-10: 4-tab detail regression guardrails tightened. Verified by unit tests that safe-link `close_detail` can finish via `page:back` without forced homepage `goto`, and `comments_harvest` now exits with `tab_comment_budget_reached` once current tab budget is hit, marking the slot `paused` for rotation instead of scrolling a single post to bottom. Live run `2459ed86-2aea-48b5-a8cb-c1691806ab5f` then showed a different blocker: startup stalled inside `ensure_tab_pool` before first detail open, so the next debug target is tab-pool initialization rather than comment harvesting. Tags: xhs, detail, 4-tab, close-detail, tab-budget, ensure-tab-pool, validation

- 2026-03-10: Real 4-tab detail run `2459ed86-2aea-48b5-a8cb-c1691806ab5f` completed after recovering from two `ensure_tab_pool` `new_tab_failed` errors, but exposed a remaining queue bug: with `assignedNotes=4`, `open_next_detail` reopened note `698def79000000000b008360` twice, so `openedNotes/commentsHarvestRuns` became `5/5` instead of staying within the assigned set. Remaining live debug targets are tab-pool startup flakiness and duplicate reopen/done semantics for safe-link detail rotation. Tags: xhs, detail, 4-tab, ensure-tab-pool, duplicate-open, queue, validation
