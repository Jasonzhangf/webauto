# 2026-03-12 detail comments stagnation anchor fix

Tags: xhs,detail,comments,anchor,stagnation,recovery-loop,likes,state-machine,verification

## 背景
- 现象：detail 评论采集中，在部分帖子上会出现长时间 recovery 上下滚循环。
- 旧行为：可见评论顺序变化会被判定为“有进度”，导致 `lastProgressAt` 被反复刷新，退出条件被拖长。

## 设计决策（最小改动）
1. 新增 `stagnationRounds` 与 `stagnationExitRounds`。
2. 进度只认两类：
   - 评论集合真实增长（`newComments.length > 0`）
   - 滚动元信息真实变化（scroll signature 变化）
3. 可见评论顺序抖动不再单独重置进度时钟。
4. 达到 stagnation 阈值后允许直接以 `scroll_stalled_after_recovery` 退出，避免长 recovery 循环。

## 代码位置
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - comments_harvest 主循环增加：
    - `stagnationExitRounds` 配置
    - `stagnationRounds` 计数
    - `makeScrollSignature` / `makeWindowSignature` 锚点签名

## 测试
- 新增单测：
  - `tests/unit/webauto/xhs-detail-close-and-budget.test.mjs`
  - 用例：`exits with scroll_stalled_after_recovery when visible comments churn without growth and scroll anchor does not move`

- 验证命令（通过）：
```bash
npm run -s test -- \
  tests/unit/webauto/xhs-detail-close-and-budget.test.mjs \
  tests/unit/webauto/xhs-open-detail-requeue.test.mjs \
  tests/unit/webauto/xhs-unified-template-stage.test.mjs
```
- 结果：pass 42 / fail 0

## 实跑证据
- runId: `22961787-5afd-4a8d-874f-48d597248f76`
- 日志：
  - `./.tmp/min-smoke-stagnation-fix/xiaohongshu/debug/seedance2.0/merged/run-2026-03-12T05-36-05-647Z/profiles/wave-001.xhs-qa-1.events.jsonl`
- 关键点：
  - `comments_harvest` 完成，`exitReason=tab_comment_budget_reached`，并保存 resume anchor
  - 终态 `autoscript:stop reason=script_complete`
  - `open_next_detail` exhausted 后清理完成，`AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`

## 状态机文档同步
- `docs/arch/state-machines/xhs-detail-comments-likes.v2026-03-12.md`
  - 补充“评论进度锚点”与“stagnation 退出”规则。
