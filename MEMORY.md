# MEMORY.md

## General Memory
- [2026-03-12] Collect 流程已作为稳定基线，除非重大变更且先征得同意，不再主动改 collect。  
  Tags: collect, baseline, stability

## Collect Pipeline
- [2026-03-12] `:has()` 选择器解析修复：解析器需剥离伪类/伪元素再提取 class，避免 `:has(a.cover)` 误匹配导致 collect 卡住。  
  Tags: collect, selector, change-notifier
- [2026-03-13] Search gate 拒绝需重试：`SEARCH_GATE_REJECTED/DENIED` 使用指数退避重试，不可直接抛错终止。  
  Tags: search-gate, retry, collect
- [2026-03-13] `xsec_token` 修复：collect 必须写入 `detailUrl`（带 token 的 explore 链接）；无 token 的候选直接丢弃。  
  Tags: collect, xsec_token, safe-detail-url
- [2026-03-13] 终态检测：禁止在 `candidates.length===0` 时提前 `continue`，确保底部/重复/滚动卡住三种 terminal 逻辑执行。  
  Tags: collect, terminal-state
- [2026-03-13] Auto-resume 必须使用持久化下载根 `~/.webauto/download` 作为已完成检测来源，即使 `--output-root` 指向临时目录。  
  Tags: auto-resume, output-root

## Detail Safe-Link Pipeline
- [2026-03-07] detail 链接队列状态机：`queue/byTab/completed/exhausted`；失败链接 requeue 到尾部并受 `detailLinkRetryMax` 限制。  
  Tags: detail, safe-links, queue, retry
- [2026-03-12] 默认不回队列：`requeueFailedLinks=false` 时失败链接直接 `complete`，仅显式开启才 release。  
  Tags: detail, finalize, no-requeue-default
- [2026-03-08] `maxNotes` 上限在 tab-state 强制按“去重后的唯一链接”截断队列。  
  Tags: detail, max-notes, tab-state
- [2026-03-08] Canonical settle：`open_detail` 必须在 modal settle 后再读 noteId，使用最终 canonical noteId。  
  Tags: detail, canonical, settle
- [2026-03-08] `open_next_detail` 去重：detailOpenByLinks 下用 `manual` trigger + `subscription_not_exist(detail_modal)` 约束。  
  Tags: detail, open-next, dedup
- [2026-03-12] detailLinksStartup 时 `open_next_detail` 不再依赖 disabled 的 `ensure_tab_pool`；followup chain 由 `followupOperations` 触发 `detail_harvest`。  
  Tags: detail, dependencies, followup
- [2026-03-08] 多 tab 切换：`tab_switch_if_needed` 改为 `dependsOn: close_detail` 的 manual 链，避免 stale trigger。  
  Tags: detail, tab-switch
- [2026-03-09] safe-link detail 启动后进入 tab 复用模式（reuseOnly），不再动态开新 tab。  
  Tags: detail, tab-pool, reuse-only

## Comments & Likes State Machine
- [2026-03-07] 滚动验收：无滚动进度仅在“评论为空”或“已到底”时允许；否则必须有真实滚动证据。  
  Tags: comments, scroll, acceptance
- [2026-03-12] 进度锚点：只认“新增评论”或“scroll signature 变化”；可见顺序抖动不算进度。  
  Tags: comments, anchors, stagnation
- [2026-03-13] derivedAtBottom：`scrollTop+clientHeight>=scrollHeight-1` 即认为到底；recovery 前后必须重新判断是否到底。  
  Tags: comments, recovery, atBottom
- [2026-03-12] 评论滚动容器白名单：仅允许 `.comments-container/.comment-list/.comments-el/.note-scroller`；非白名单直接降级为无锚点完成。  
  Tags: comments, scroll-selector, whitelist
- [2026-03-12] 评论缓存按 note 复用：从 `comments.jsonl` + `state.detailCommentsByNote` + 上次 harvest 复合去重，避免 tab 轮转回到旧 note 反复计数。  
  Tags: comments, cache, tab-rotation
- [2026-03-08] 评论滚动 step 默认 520..760，滚动锚点强制使用 commentScroll；`maxNotes<=1` 时默认 `autoCloseDetail=false`。  
  Tags: comments, scroll-step, autoCloseDetail
- [2026-03-12] inline like 作为 `comments_harvest` 子循环步骤，不是独立主状态；状态机文档需保持一致。  
  Tags: likes, state-machine

## Runtime / Infra
- [2026-03-08] 强制调度必须满足 trigger：`forceRun` 不可绕过 `isTriggered()`，subscription dependent 需 `isTriggerStillValid()`。  
  Tags: runtime, trigger-guard
- [2026-03-08] Browser WS 订阅生命周期：unsubscribe / last socket close 必须 teardown runtime bridge。  
  Tags: ws, subscription, teardown
- [2026-03-08] detail 多 tab 状态机已有单测覆盖，包含 requeue/slot closeable 规则。  
  Tags: tests, tab-state
