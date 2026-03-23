Clock-Stop-When: no-open-tasks

## 背景
人工智能入门 50条/5条回归测试，验证 submit_search 稳定性与 SEARCH_INPUT_MISMATCH 修复

## 当前阻塞点
search-gate keyword 限流：wait_search_permit 正常阻塞（不是卡死），当前 keyword 在 180s 窗口已达上限

## 下次提醒要做的第一步
等待 keyword 窗口冷却后重跑（或切换关键词）

## 不能忘的检查项
- 当前 runId: 116c4423-4b56-4919-a290-33503f5b5c93
- 当前 jobId: job_1774229579527_e4731267
- wait_search_permit 触发时间: 01:33:16
- gate 证据: POST /permit 返回 allowed=false, reason=keyword_rate_limit, waitMs=27982
- 本轮核心修复提交:
  - 8791dfcd: mismatch 锚点重试
  - 9a273ec8: clearAndType 分段超时
  - f791f4b3: select失败允许继续 type

## 巡检记录
- [09:05] 50条测试 runId b4c020a1：wait_search_permit → fill_keyword → submit_search
- [09:12] submit_search 6分钟超时，根因定位为 Meta+A/keyboard:press 长阻塞
- [09:23] 修复1上线（9a273ec8）：clearAndType 分段超时
- [09:24] 5条回归 runId 0621dbac：submit_search 快速失败（10s）CLEAR_AND_TYPE_SELECT_TIMEOUT，证明不再 6 分钟挂死
- [09:32] 修复2上线（f791f4b3）：select 失败允许继续 type
- [09:33] 5条回归 runId 116c4423：当前卡在 wait_search_permit
- [09:35] 现场核验 gate：`keyword_rate_limit`，wait_search_permit 属于正常限流等待，不是僵死

## 修复验证结论（当前）
✅ submit_search 不再 6 分钟无锚点挂死（已缩短为可控失败）
✅ clearAndType select 卡死已有超时防护 + fallback 路径
⚠️ 当前 run 因 keyword_rate_limit 尚未进入 submit_search，需冷却后再验证最终通过率

## 下一步
1. 等 30-60 秒后用同关键词重试 5 条，确认 submit_search 能进入 search_ready
2. 若仍被 gate 限流，切换关键词做 A/B（例如“机器学习入门”）
