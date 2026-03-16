# 2026-03-12 detail comments+likes state machine audit refresh

Tags: xhs,detail,comments,likes,state-machine,ascii,audit,anchors

## 目标
- 按用户要求输出“正文 + comments + 点赞 + 轮转 + 终态清理”审核版状态机。
- 保持当前唯一真源路径不变，仅更新状态机内容，不触碰 collect。

## 变更
- 文档：`docs/arch/state-machines/xhs-detail-comments-likes.v2026-03-12.md`
- 更新点：
  - 将 inline like 明确为 comments_harvest 子循环步骤（非独立主状态）
  - 明确 progress anchor 判定（新增评论 or scrollSignature 变化）
  - 明确 churn-only 不算进度
  - 明确预算命中先保存 resume anchor，再进入 tab 轮转
  - 保持“仅终态清理关闭 detail”的约束

## 验证
- 本次仅文档层更新（代码逻辑不变），无需新增运行验证。
