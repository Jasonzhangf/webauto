
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
- [16:02] openclaw微信 1条修复验证（job_1774250253400_91f3ef2e / runId 56ba3e44）
  - fill_keyword/submit_search 未执行；在 `wait_search_permit` 触发 `SEARCH_GATE_TIMEOUT`
  - 证据：`~/.webauto/logs/daemon-jobs/job_1774250253400_91f3ef2e.log`
- [16:06] 机器学习入门教程 1条修复验证（job_1774251243687_9c1c0440 / runId b91b4d03）
  - `fill_keyword` 成功（433ms，xhs_fill_keyword）
  - `submit_search` 成功（searchReady=true），随后 `collect_links=COLLECT_DUPLICATE_EXHAUSTED`
  - `open_first_detail=AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`，任务 `script_complete`
  - 证据：`~/.webauto/logs/daemon-jobs/job_1774251243687_9c1c0440.log`
- [16:17] 结构收敛改造（单一 API）
  - 已移除 `fill_keyword/xhs_fill_keyword` 独立操作，改为 `submit_search(xhs_submit_search)` 内部统一执行 fill+submit
  - 已移除 action handler/runtime timeout 列表中 `xhs_fill_keyword`
- [16:16] 单一 API 回归（job_1774253525052_302ddfb4 / runId e161a8f5）
  - `submit_search` 单操作内出现 `fill_start → submit_pre_fill → fill_input → submit_after_fill → Enter`
  - 结果：`submit_search` 成功，后续 `collect_links=COLLECT_DUPLICATE_EXHAUSTED`，`open_first_detail=AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`，最终 `script_complete`
  - 证据：`~/.webauto/logs/daemon-jobs/job_1774253525052_302ddfb4.log`

## 修复验证结论（当前）
✅ submit_search 不再 6 分钟无锚点挂死（已缩短为可控失败）
✅ clearAndType select 卡死已有超时防护 + fallback 路径
⚠️ 当前 run 因 keyword_rate_limit 尚未进入 submit_search，需冷却后再验证最终通过率

## 下一步
1. 等 30-60 秒后用同关键词重试 5 条，确认 submit_search 能进入 search_ready
2. 若仍被 gate 限流，切换关键词做 A/B（例如“机器学习入门”）

- [17:21] 春日穿搭 1条测试（job_1774257150219_71a0eeb1 / runId 5d15d008）
  - **submit_search 延迟 243s**：method=enter_fallback_error，click 失败后 fallback Enter
  - **afterUrl = /explore**：搜索未成功，仍在探索页（非搜索结果页）
  - **searchReady 误判**：检测到旧的推荐内容（25笔记）作为 ready
  - **collect_links = DUPLICATE_EXHAUSTED**：旧链接全部已采集
  - **根因**：Enter 键被按但搜索未触发 + searchReady 只检测容器存在，未验证 URL 变化
  - **证据**：截图显示搜索框为空、页面在探索页
  - **修复方向**：
    1. submit_search 改为 Enter-first（不再尝试 click）
    2. searchReady 增加验证：afterUrl 必须包含搜索关键词或路径变化
    3. fill 后验证输入值是否保留

## 修复验证结论（最新）
❌ submit_search 单 API 路径可用但搜索未成功执行
❌ searchReady 锚点不够严格，误判旧内容为新结果
⚠️ collect_links 在错误页面收集，导致全部 duplicate

## 下一步（优先级高）
1. 修复 submit_search：改为 Enter-first + 搜索 URL 验证
2. 修复 searchReady：验证 URL 变化（/search_result 或 keyword in URL）
3. 用全新关键字重新测试
