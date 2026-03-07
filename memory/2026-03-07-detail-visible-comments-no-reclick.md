# 2026-03-07 detail visible comments no reclick rule

Rule:
- Do not hardcode coordinates for XHS detail comment actions.
- All click/focus points must be derived from the current visible element rect.
- If comments are already visible in detail (`readVisibleCommentTarget` hits), do not re-click comment entry or comment total.
- Only use `comment entry -> comment total` when the comment area is not yet visible because the正文/布局 keeps comments out of view.

Code update:
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - `focusCommentContext()` now checks visible comments first.
- `readVisibleCommentTarget()` must choose from the current visible comment area inside the comment scroll container, not simply the first viewport comment node.
- Selection rule: score only comment nodes that are simultaneously visible in viewport and inside the comment container; reject body/media-edge nodes even if they briefly intersect during scroll settle.
  - Existing visible comments short-circuit the `entry/total` click path.
- `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs`
  - comment target points remain rect-derived, not hardcoded.
- 2026-03-07 补充：普通滚动轮次不能每次都重新点击评论滚动容器。那样会偶发把焦点打到正文/图片区域并触发图片查看器。正确策略是：
  - 初次进入评论时允许一次容器 focus click；
  - 恢复阶段允许重新 focus；
  - 普通滚动阶段只做 probe，不做 focus click；
  - `scrollBySelector()` 使用 `focusTarget`，优先采用当前 visible comment 作为滚动焦点参考，但实际滚动 selector 仍绑定评论容器。
