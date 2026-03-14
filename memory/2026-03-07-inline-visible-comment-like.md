# 2026-03-07 Inline Visible Comment Like

Tags: xhs, detail, comments, likes, inline-like, visible-comments, ws-stats, autoscript

## Decision
- XHS detail 点赞不再作为 `comments_harvest` 之后的独立 `comment_like` 阶段执行。
- 新规则改为：在 `comments_harvest` 每一轮读取当前可视评论后，立即对当前可视命中的评论执行点赞。
- 这与评论 harvest 不同：评论采集是只读快照；点赞必须对当前可视窗口中的真实元素执行点击。

## Why
- 旧编排里 `comments_harvest -> comment_match_gate -> comment_like -> close_detail` 在真实运行中 `comment_like` 没有稳定触发，close 会先发生。
- 用户要求“点赞在每一轮滚动时做”，即 detect visible comment 时就做，而不是 harvest 完再补做。
- 这种方式也更符合“只能操作可见元素”的项目约束。

## Code Changes
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - 新增 inline visible-like 处理：
    - 每轮 `readCommentsSnapshot()` 后，按 `likeKeywords/matchMode/matchMinHits/maxLikesPerRound` 扫描当前可视评论。
    - 仅对当前可视且命中的评论读取 like target 并点击。
    - 已点赞评论跳过点击，但统计为 `liked`，并记入 `alreadyLikedSkipped`。
    - 用 noteId/commentId(或 authorId+content) 做去重，避免滚动中重复点赞。
  - `comments_harvest` 返回结果中直接带回：
    - `hitCount`
    - `likedCount`
    - `skippedCount`
    - `alreadyLikedSkipped`
    - `dedupSkipped`
    - `likedIndexes`
    - `alreadyLikedIndexes`
    - `summaryPath`
    - `likeStatePath`
- `modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs`
  - 新增 `likeSummaryPath`
  - 新增 `appendLikeStateRows()`
  - 新增 `writeLikeSummary()`
- `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
  - `comments_harvest.params` 注入 `doLikes/likeKeywords/matchMode/matchMinHits/maxLikesPerRound/persistLikeState/saveEvidence`
  - 删除 standalone `comment_like` operation
  - `comment_match_gate` 仅保留给 reply 流程使用
- `modules/camo-runtime/src/autoscript/xhs-unified-options.mjs`
  - `pickCloseDependency()` 不再依赖 `comment_like`
- `apps/webauto/entry/lib/xhs-unified-runtime-blocks.mjs`
  - 任务/WS 统计从 `comments_harvest` 直接累计 like stats，而不是依赖 `comment_like`

## Validation
- 单测通过：
  - `node --test tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs apps/webauto/tests/autoscript/detail-queue.spec.ts tests/unit/webauto/xhs-unified-template-stage.test.mjs tests/unit/webauto/xhs-visible-like-inline.test.mjs`
- 最小 UI CLI 链路通过：
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs ui cli start --build`
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs ui cli status --json`
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs ui cli stop`

## Notes
- 目前 reply 仍保留 `comment_match_gate`，因为 reply 仍然依赖“匹配后的评论集合”。
- like 的实时统计现在应该通过 `comments_harvest` 的 operation_done 事件进入 unified task state / WS 更新。
- 下一步需要用单页 detail 实测确认：滚动轮次中已点赞 comment 会被记为 liked 且不重复点击，summary/state 文件持续落盘。

## 2026-03-12 Priority Update
- 用户确认：`reply` 暂时不是重点，后续再做。
- 当前迭代主线：只聚焦 **评论获取（comments_harvest）+ 评论点赞（inline like）** 的可靠性与最小测试闭环。
- 测试策略：
  - 最小单测集合优先覆盖：
    - `xhs-detail-close-and-budget`（评论采集循环/预算暂停/恢复锚点）
    - `xhs-visible-like-inline`（点赞内聚在 comments_harvest，统计回传）
  - 若最小单测通过，再根据需要补充 live smoke。

### Minimal test evidence (2026-03-12)
- Command:
  - `node --test tests/unit/webauto/xhs-detail-close-and-budget.test.mjs tests/unit/webauto/xhs-visible-like-inline.test.mjs`
- Result:
  - `13` passed, `0` failed
  - 覆盖了 comments_harvest 的预算暂停/恢复锚点和 inline like 统计回传
- UI CLI 最小链路：
  - `node bin/webauto.mjs ui cli start --build`
  - `node bin/webauto.mjs ui cli status --json`
  - `node bin/webauto.mjs ui cli stop`
  - 结果：通过（ready=true, pid=68431）

Tags: xhs, detail, comments, likes, inline-like, visible-comments, ws-stats, autoscript, priority, minimal-test, reply-deferred
