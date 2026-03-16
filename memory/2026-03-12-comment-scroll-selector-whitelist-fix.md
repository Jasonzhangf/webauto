# 2026-03-12 - detail/comments 锚点白名单修复（scroll selector）

Tags: xhs, detail, comments, anchor, scroll-selector, state-machine, reliability

## 背景
- 线上复现中，`comments_harvest` 的 `commentScrollSelector` 偶发出现 `.note-container`，导致焦点点击漂移后回到 feed，触发 `DETAIL_INTERACTION_STATE_INVALID`。
- 目标：只修 detail/comments 当前环节，不动 collect。

## 设计与实现
1. `readCommentScrollContainerTarget` 增加 selector 白名单：
   - 仅允许：`.comments-container` / `.comment-list` / `.comments-el` / `.note-scroller`
   - 若候选 selector 不在白名单，返回 `found:false` + `reason:unsupported_scroll_selector`
2. `executeCommentsHarvestOperation` 内对 `commentScroll` 二次净化：
   - 新增 `sanitizeCommentScrollTarget`
   - 若 selector 非白名单，降级为无 scroll anchor（`found:false`），避免点击错误容器
3. 保留弱锚点完成策略：
   - 只有 `commentTotal` 时，按 `comment_scroll_anchor_missing` 完成当前 note，避免硬失败。

## 验证
- 单测：`tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - 新增用例：scroll selector 为 `.note-container` 时，流程不滚动、不点击，且以 `comment_scroll_anchor_missing` 完成。
- 运行验证：
  - runId `a712caa4-0c36-4b1f-998b-ecb1bd4717ef`（单链接）
  - 关键证据：`commentScrollSelector` 为 `.note-scroller`，无 `.note-container`，任务终态 `completed`。
- 压测进行中：
  - runId `c22c2261-bf5c-4097-8ba1-0f3d96d23b93`（50 条）
  - 进行中阶段已观测到 selector 仅为 `.note-scroller` / `.comments-container`，未出现 `.note-container`。
