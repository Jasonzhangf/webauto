# Clock - 小红书 50 条采集巡检

## 背景
正在进行小红书完整流程测试（collect + detail 50 条，评论 + 点赞非空）。

## 当前阻塞点
之前遇到 auto-resume 时 `ensure_tab_pool` 误执行导致搜索结果丢失。已修复编译配置，当前验证中。

## 下次提醒要做的第一步
检查运行状态：
1. 检查 runId: 987bfa51-fea1-4196-a08a-42f40eb81827 的最新日志
2. 确认 `ensure_tab_pool` 是否再次误执行
3. 确认评论采集和点赞流程是否正常
4. 检查是否有点赞命中记录

## 不能忘的检查项
- ensure_tab_pool 操作不应该出现（因为 resume=true）
- totalLinks 应该是 50（从 safe-detail-urls.jsonl 读取）
- 评论采集覆盖率应 >= 90%
- 点赞命中应该非空（like-keywords="整理"）
