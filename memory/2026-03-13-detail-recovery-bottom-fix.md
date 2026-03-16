Tags: xhs, detail, comments, recovery, atBottom, state-machine, optimization

# 2026-03-13 Detail Recovery Bottom Fix

## 问题
- 压力测试中发现部分笔记触发 26 次 recovery，导致单笔记耗时 > 13 分钟
- 典型案例：noteId `691d824e000000000d03eecf`
- 日志显示评论已到底，但 `atBottom` 字段缺失，导致 recovery 循环未终止

## 根因
- `scrollMeta.atBottom` 为空时没有 fallback 判定
- recovery 触发前未检查 derivedAtBottom
- recovery 后未重新计算 bottom 状态

## 修复内容
- **新增 derivedAtBottom 逻辑**：
  - `scrollTop + clientHeight >= scrollHeight - 1` 即判定到底
- **recovery 触发前新增底部拦截**：
  - 若已到底，直接退出，不进入 recovery
- **recovery 后重新计算 derivedAtBottom**

## 修改文件
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`

## 状态机更新
- 新增 `xhs-detail-comments-likes.v2026-03-13.md`
- 增补锚点规则：
  - reached_bottom 判定必须使用 derivedAtBottom
  - recovery 触发前必须确认未到底
  - recovery 后必须重新计算 derivedAtBottom

## 验证计划
1. 运行 detail 压力测试，观察 recovery 次数下降
2. 特别关注 `noteId 691d824e` 同类案例是否快速退出
3. 观察 `exitReason` 是否为 `reached_bottom` 而非 `scroll_stalled_after_recovery`
