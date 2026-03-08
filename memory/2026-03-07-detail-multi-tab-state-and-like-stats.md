# 2026-03-07 detail multi-tab state and like stats

## Goal
补齐 detail 多条编排缺失的 tab-slot 状态机，并把单页 detail 的点赞结果、正文/评论统计通过任务状态持续推到 UI/WS。

## Changes
- 新增 `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-slot-state.mjs`
  - 统一封装 detail tab-slot 状态：`active/paused/completed/failed`
  - 提供 `shouldCloseCurrentDetail()` / `shouldReuseDetailForCurrentTab()`
- 修改 `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`
  - `open_detail` 支持识别当前 slot 已 pause 的 detail，并在同 tab 复用而不是再次打开链接
  - `close_detail` 支持多 tab 轮转时 defer close；仅在 slot 完成/失败时真正关闭并推进队列
- 修改 `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - comments harvest 结束后，按 `completed/paused/failed` 写回 slot 进度
  - `paused` 语义：本 tab 已达评论预算，但 detail 保持打开，供轮转回来继续
  - `failed` 语义：未到底、未空评论、也未预算暂停，属于中途未完成，需要后续 close 时 requeue
- 修改 `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
  - `readLikeTargetByIndex()` 新增 liked 判定与 like 状态读取
- 修改 `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs` 的 `executeCommentLikeOperation`
  - 已点赞评论不再重复点；统计为 `liked` 且累加 `alreadyLikedSkipped`
  - 输出统一字段：`hitCount / likedCount / skippedCount / alreadyLikedSkipped / dedupSkipped`
- 修改 `apps/webauto/entry/lib/xhs-unified-runtime-blocks.mjs`
  - detail_harvest 统计正文/图片/视频/作者维度
  - comment_like 兼容读取新字段并累计到 profile stats
- 修改 `apps/webauto/entry/lib/xhs-unified-profile-blocks.mjs`
  - 任务状态 update 中加入：
    - `likesSkippedTotal`
    - `likeAlreadySkipped`
    - `likeDedupSkipped`
    - `detailContentRuns`
    - `detailImageCount`
    - `detailVideoCount`
    - `detailAuthorCount`
  - 这些字段会通过 unified task update -> WS `task:update` -> Desktop UI `onStateUpdate` 链路实时更新

## Validation
- unit tests passed:
  - `node --test tests/unit/webauto/xhs-detail-slot-state.test.mjs tests/unit/webauto/xhs-tab-links.test.mjs tests/unit/webauto/xhs-tab-switch.test.mjs apps/webauto/tests/autoscript/detail-queue.spec.ts tests/unit/webauto/xhs-unified-template-stage.test.mjs`
- ui cli minimal verification passed:
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs ui cli start --build`
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs ui cli status --json`
  - `WEBAUTO_BRING_TO_FRONT_MODE=never node bin/webauto.mjs ui cli stop`

## Important Semantics
- 单页 detail 点赞现在已经有“已点赞跳过并计入 liked/already liked stats”的实现，但还没有完成真实手动/E2E 验证证据。
- UI 不需要轮询文件：运行时状态已经走 `reporter.update()` -> Unified API task state -> WS `task:update` -> Desktop `onStateUpdate`。
- 多页轮转时，每个 tab slot 的 detail 进度应只由 slot state 驱动；不要再依赖全局单 active 语义做关闭判断。
