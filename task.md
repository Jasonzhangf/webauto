# WebAuto 任务追踪（小红书 Workflow 拆 Block 落地）

> 目标：基于容器驱动的 Workflow 完成小红书搜索 + 详情 + 评论采集（目标 100 条）。

## 已确认前提

### ✅ 容器能力完备
- 搜索：`search_bar` + `search_result_list` + `search_result_item`
- 详情：`modal_shell` + `header` + `content` + `gallery`
- 评论：`comment_section` + `comment_item` + `show_more_button` + `end_marker` + `empty_state`
- 登录：LoginWorkflow + EnsureLoginBlock 已跑通（容器驱动）

### ✅ 登录 Workflow 已落地
**文件**：`modules/workflow/workflows/XiaohongshuLoginWorkflow.ts`

**步骤**：
1. EnsureSession：确保 `xiaohongshu_fresh` 会话存在，可选导航到首页
2. EnsureLoginBlock：只看 `*.login_anchor` / `xiaohongshu_login.login_guard`

**输出**：
- session 状态
- login.status = `logged_in` | `not_logged_in` | `uncertain`

## 设计要点

### CloseDetailBlock 策略
当前暂无专门的“关闭按钮”容器：
- 先用 `history.back()` / `ESC` / 点击遮罩通用逻辑
- 若不稳定再补 `detail.close_button` 容器

## 下一步执行计划（落地顺序）

### Phase 1: 搜索链路 Block ✅

**目标**：验证“搜索输入 → 列表容器”

**已实现**：
- [x] `GoToSearchBlock`
- [x] `CollectSearchListBlock`

**单测脚本**：
- [x] `scripts/xiaohongshu/tests/phase2-search.mjs`

### Phase 2: 详情链路 Block ✅

**目标**：验证“打开详情 → 提取正文/图片”

**已实现**：
- [x] `OpenDetailBlock`
- [x] `ExtractDetailBlock`

**单测脚本**：
- [x] `scripts/xiaohongshu/tests/phase3-detail.mjs`

### Phase 3: 评论链路 Block ✅

**目标**：验证“展开评论 → 终止条件”

**已实现**：
- [x] `ExpandCommentsBlock`
- [x] `CloseDetailBlock`

**单测脚本**：
- [x] `scripts/xiaohongshu/tests/phase4-comments.mjs`

### Phase 4: 集成 Workflow ✅

**目标**：完整采集 100 条 + 评论

**已实现**：
- [x] `XiaohongshuCollectWorkflowV2`
- [x] `scripts/run-xiaohongshu-workflow-v2.ts`

**集成测试**：
- [ ] `node scripts/run-xiaohongshu-workflow-v2.ts --keyword "手机膜" --count 100`

## 当前待执行清单

1. 运行 Phase 2/3/4 单测脚本，确认流程可用
2. 运行 `run-xiaohongshu-workflow-v2.ts` 小规模测试（5 条）
3. 扩展为 100 条完整采集

---

**最后更新**：2025-01-06
