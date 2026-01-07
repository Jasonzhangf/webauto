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
当前暂无专门的"关闭按钮"容器：
- 先用 `history.back()` / `ESC` / 点击遮罩通用逻辑
- 若不稳定再补 `detail.close_button` 容器

### 全链路统一用 Workflow/Block
- 小红书相关的新能力一律通过 **Workflow Block** 落地，脚本只做 CLI/参数解析/调用 Block，不再写"大一坨"业务脚本。
- 登录态、搜索、列表、详情、评论全部以 Block 形式存在，并通过集成 Workflow 串联。

### 锚点 + 高亮 + Rect 回环（新增硬约束）

> 所有"小红书相关"的 Block / Workflow 步骤都必须有"容器锚点"与可视化回环，否则视为"瞎操作"，不得以 success 结束。

- 每个步骤至少一个**容器锚点**：  
  - 通过 `containers:match` / `containers:inspect-container` 找到明确的 containerId（例如 `xiaohongshu_search.search_bar` / `xiaohongshu_detail.comment_section.comment_item`）。  
  - 找不到锚点 = 该步骤直接失败，不能继续做 DOM 操作。
- 每个步骤都要对锚点执行一次 **highlight**：  
  - 通过 `container:operation highlight`，在页面上高亮锚点容器，供人工确认。  
  - 调试脚本可以复用 `scripts/container-op.mjs <profile> <containerId> highlight`。
- 每个步骤都要做一次 **Rect 回读**（位置反查）：  
  - 在高亮后，对锚点 DOM 执行 `getBoundingClientRect()`（通过 `browser:execute` 或 UI overlay 事件）返回 `{x,y,width,height}`。  
  - Step 的 success 条件必须包含：Rect 非 0 且落在预期区域（例如 search_bar 在顶部，comment_section 在详情下方）。  
  - Block 的输出中应携带关键锚点的 `containerId + rect`，便于集成 Workflow 和日志统一调试。

### XiaohongshuCollectWorkflowV2 设计清单（基于登录 Workflow 之上）

0) **Login Workflow（已落地 ✅）**  
   - Step1：EnsureSession（Browser Service `/command`）  
   - Step2：EnsureLoginBlock（`containers:match`，登录锚点模型）  
   - 输出：`session.status`, `login.status` = `logged_in` / `not_logged_in` / `uncertain`

1) **GoToSearchBlock（已实现）**  
   - 输入：`keyword`, `sessionId`  
   - 容器：`xiaohongshu_search.search_bar`  
   - 动作：  
     - `containers:match` → 确认搜索页 + `search_bar` 存在  
     - 通过 `container:operation(type + key)` 或 DOM 搜索框输入 + 回车触发搜索（禁止拼 `search_result` URL）  
   - 输出：`searchPageReady`, `searchExecuted`, `url`

2) **CollectSearchListBlock（已实现）**  
   - 容器：`xiaohongshu_search.search_result_list` + `xiaohongshu_search.search_result_item`  
   - 动作：  
     - `containers:match` → 定位 `search_result_list`  
     - `containers:inspect-container` → 获取子级 `search_result_item`  
     - 对每个 item 做 `extract`（`title/link/detail_url/note_id/xsec_token`）  
     - 按 `note_id` 去重  
   - 输出：`items[]`（含 `containerId/noteId/title/detailUrl/raw`）

3) **OpenDetailBlock（已实现）**  
   - 容器：`xiaohongshu_search.search_result_item`（`navigate` operation）  
   - 动作：  
     - 对选中的 item 执行 `navigate`  
     - 轮询 `containers:match`，直到 `xiaohongshu_detail.modal_shell` 出现  
   - 输出：`detailReady`

4) **ExtractDetailBlock（已实现）**  
   - 容器：`xiaohongshu_detail.header` / `content` / `gallery`  
   - 动作：  
     - 对各子容器执行 `extract`，得到作者、标题、正文文本、图片 URL 列表  
   - 输出：`detail = { header, content, gallery }`

5) **WarmupCommentsBlock（已实现）**  
   - 容器：`xiaohongshu_detail.comment_section` 及其子容器  
   - 动作：  
     - 多轮：`scroll(comment_section)` → `find-child(show_more_button)` → 自动点击「展开 N 条回复」  
     - 统计当前 DOM 中已渲染的 `.comment-item` 数量以及头部"共 N 条评论"文案，用于判断是否继续滚动  
     - 不做任何内容提取，只负责把评论区滚到底并尽可能展开所有回复  
   - 输出：`reachedEnd`, `totalFromHeader`, `finalCount`

6) **ExpandCommentsBlock（已实现）**  
   - 容器：`xiaohongshu_detail.comment_section` 及其子容器  
   - 动作：  
     - 在 Warmup 完成后，不再滚动/点击，只基于当前稳定 DOM 一次性遍历 `.comment-item`  
     - 通过 DOM 提取 `user_name/user_id/user_link/text/timestamp`，形成完整评论列表（含回复）  
     - 基于 `end_marker`（THE END） 或 `empty_state`（空评论）判断是否到达终止位置  
   - 输出：`comments[]`, `reachedEnd`, `emptyState`

7) **CloseDetailBlock（已实现）**  
   - 动作：优先点击遮罩关闭模态；失败时退回 `history.back()`  
   - 输出：`method`（`mask_click` / `history_back` / `unknown`）

## 下一步执行计划（落地顺序）

### Phase 1: 搜索链路 Block ✅

**目标**：验证"搜索输入 → 列表容器"

**已实现**：
- [x] `GoToSearchBlock`
- [x] `CollectSearchListBlock`

**单测脚本**：
- [x] `scripts/xiaohongshu/tests/phase2-search.mjs`

### Phase 2: 详情链路 Block ✅

**目标**：验证"打开详情 → 提取正文/图片"

**已实现**：
- [x] `OpenDetailBlock`
- [x] `ExtractDetailBlock`

**单测脚本**：
- [x] `scripts/xiaohongshu/tests/phase3-detail.mjs`

### Phase 3: 评论链路 Block ✅

**目标**：验证"预热评论区 + 提取评论 → 终止条件"

**已实现**：
- [x] `WarmupCommentsBlock`
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

### 🚨 当前阻塞问题（已基本解除）

- 核心 Block（搜索 / 列表 / 详情 / 评论 / 关闭）已全部接入 **锚点 + 高亮 + Rect 回环**，可以通过 Workflow 输出中的 `anchor` 字段做全链路调试。
- `containers:match`/`container:operation` 关键路径均已增加 10s 防御性超时，失败不会再直接“挂死”，脚本会回读浏览器 URL 并退出。
- 现阶段主要工作变为：**通过 Workflow+锚点日志验证 100 条采集流程是否稳定**。 

### 📋 紧急任务清单（按优先级）

#### 1. 【P0】修复 containers:match 超时问题
- [x] 检查 Unified API `/v1/controller/action` 的 `containers:match` 为何超时
- [x] 确认 Browser Service 的 page 对象是否可用
- [x] 添加超时日志和错误处理
  - 结论：`UiController.handleContainerMatch` 本身没有阻塞点，超时主要来自上层脚本/Block 多次串行调用 `containers:match`（尤其是 `anchorVerify.getContainerRect` 中的嵌套调用）。
  - 当前策略：在锚点验证工具中尽量避免重复 `containers:match`，改用已有 snapshot/inspect 结果；对必须调用处增加明确的超时保护和错误日志。

#### 2. 【P0】为所有 Block 添加锚点 + 高亮 + Rect 回环
- [x] **GoToSearchBlock**：
  - 锚点：`xiaohongshu_search.search_bar`
  - 高亮：执行 highlight 确认搜索框位置
  - Rect：验证搜索框在页面顶部（y < 200）
  - 输出：`anchor.containerId + rect + verified`
- [x] **CollectSearchListBlock**：
  - 锚点：`xiaohongshu_search.search_result_list` + `search_result_item`
  - 高亮：高亮列表容器和第一个 item
  - Rect：验证列表在页面中部，item 非空
  - 输出：`anchor.listContainerId + listRect + firstItemContainerId + firstItemRect + verified`
- [x] **OpenDetailBlock**：
  - 锚点：选中的 `search_result_item` + 打开后的 `xiaohongshu_detail.modal_shell`/`xiaohongshu_detail`
  - 高亮：点击前高亮 item，详情出现后高亮详情根容器
  - Rect：点击目标和详情模态均返回 Rect，详情模态需覆盖视口大部分区域
  - 输出：`anchor.clickedItemContainerId + clickedItemRect + detailContainerId + detailRect + verified`
- [x] **ExtractDetailBlock**：
  - 锚点：`xiaohongshu_detail.header` / `content` / `gallery`
  - 高亮：逐个高亮各子容器
  - Rect：验证各子容器位置合理（header 在顶部，content 在中间，gallery 在下方）
  - 输出：`anchor.headerContainerId/contentContainerId/galleryContainerId + 对应 Rect + verified`
- [x] **WarmupCommentsBlock**：  
  - 锚点：`xiaohongshu_detail.comment_section`  
  - 高亮：高亮评论区根容器，回读 Rect 验证其位于详情下方  
  - 输出：`anchor.commentSectionContainerId + commentSectionRect`，同时返回 `totalFromHeader/finalCount` 方便对比 72 条目标  
- [x] **ExpandCommentsBlock**：
  - 锚点：`xiaohongshu_detail.comment_section` + 样本 `comment_item` + `end_marker/empty_state`
  - 高亮：高亮评论区根容器、样本评论以及 THE END/空状态容器
  - Rect：验证评论区在详情下方，样本评论/终止标记可见
  - 输出：`anchor.commentSectionContainerId + commentSectionRect + sampleCommentContainerId + sampleCommentRect + endMarkerRect + verified`
- [x] **CloseDetailBlock**：
  - 锚点：关闭前的详情根容器 + 关闭后的 `search_result_list`
  - 高亮：关闭前高亮详情模态，关闭后高亮搜索结果列表
  - Rect：验证关闭后 modal 不再覆盖视口中心、列表重新出现在中部区域
  - 输出：`anchor.detailContainerId + detailRect + searchListContainerId + searchListRect + verified`

#### 3. 【P1】创建锚点验证辅助函数
- [x] `modules/workflow/blocks/helpers/anchorVerify.ts`：
  - `verifyAnchor(containerId, sessionId)`: 返回 `{found, highlighted, rect}`
  - `highlightContainer(containerId, sessionId, style?, duration?)`: 执行高亮
  - `getContainerRect(containerId, sessionId)`: 返回 getBoundingClientRect()（内部已为 `containers:match` 和 `browser:execute` 增加 10s 超时；后续仍需避免不必要的重复 `containers:match`，优先复用调用方已有 snapshot）

#### 4. 【P1】重构 Phase2/3/4 测试脚本
- [x] phase2-search-v2.mjs（简化版已完成，使用 browser:execute 绕过 containers:match）：在每个步骤前打印"正在执行 XX"，执行后打印"XX 完成，锚点：YY，Rect：ZZ"
- [x] phase3-detail.mjs：调用 Block 后打印 `anchor` 信息（包含 Rect），失败时同时输出浏览器 URL
- [x] phase4-comments.mjs：同上，额外输出评论区/终止锚点的 `anchor` 信息

#### 5. 【P2】完成后续测试
- [ ] 运行 Phase 2/3/4 单测脚本，确认流程可用
- [ ] 运行 `run-xiaohongshu-workflow-v2.ts` 小规模测试（5 条）
- [ ] 扩展为 100 条完整采集

### 【P2】Workflow 统一日志系统（进行中）

**目标**：所有小红书 Workflow 执行过程都有可回放的结构化日志（包含锚点信息），统一落在 `~/.webauto/logs/debug.jsonl`，通过 logging CLI / Controller 读取。

- [x] 在 `modules/logging` 中扩展：
  - 新增 `logWorkflowEvent(event)`，基于 `logDebug('workflow', status, event)` 写入 `debug.jsonl`；
  - 在 `DEFAULT_SOURCES` 中新增 `debug`，支持 `cli.ts stream --source debug` 与 `logs:stream` 使用。
- [x] 在 `WorkflowExecutor` 中接入 Workflow 事件：
  - 每个步骤执行前写入 `status=start` 事件（workflowId/name、stepName/index、sessionId/profileId）；
  - 步骤成功后写入 `status=success`，附带 Block 返回的 `anchor`（用于追踪锚点 Rect）；
  - 失败或异常时写入 `status=error`，记录 error 文本与 step 信息。
- [x] 更新 `modules/logging/README.md`，说明 `debug.jsonl` 和 Workflow 日志用法。
- [ ] 在 docs/arch/AGENTS.md（或小红书 Workflow 文档）中补充“如何通过 `logs:stream` / logging CLI 查看 Workflow 日志”的示例。

### 【P1】SearchGate 搜索节流服务（进行中）

**目标**：所有小红书搜索必须经由“对话框搜索 + SearchGate 节流”，避免频繁搜索触发风控。

- [x] 新增后台 SearchGate 服务脚本：`scripts/search-gate-server.mjs`
  - 接口：
    - `POST /permit`：输入 `profileId/key`，默认规则为“60s 内最多 2 次”，返回 `allowed + waitMs`；
    - `GET /health`：健康检查；
    - `POST /shutdown`：优雅退出。
  - 端口：默认 `7790`，可通过 `WEBAUTO_SEARCH_GATE_PORT` 配置。
- [x] 在 `GoToSearchBlock` 中接入节流逻辑：
  - 搜索前调用 `waitSearchPermit()`，向 `WEBAUTO_SEARCH_GATE_URL`（默认 `http://127.0.0.1:7790/permit`）申请许可；
  - 若未获许可则按返回的 `waitMs` 轮询等待，最多重试数轮；
  - 若服务不可达则抛出明确错误，提示先运行 `node scripts/search-gate-server.mjs`。
- [x] 在 `AGENTS.md` / `docs/arch/PORTS.md` 中记录 SearchGate 端口与“所有搜索必须经由 SearchGate + 对话框搜索”的硬性规则。
- [ ] 后续：在 Phase1 或统一启动脚本中增加 SearchGate 的健康检查提示（未必自动启动，但至少在未运行时给出明确警告）。

#### 6. 【已完成】将通用容器调试脚本去平台硬编码
   - `scripts/debug-container-tree-summary.mjs`：通过参数/环境获取 `profile`/`url`，默认不再绑定 weibo/xiaohongshu。
   - `scripts/debug-container-tree-full.mjs`：同上，必须显式指定 profile，可选 url。
   - `scripts/test-container-events-direct.mjs`：支持 `<profile> [url]`，不再内置 `weibo_fresh` + `https://weibo.com/`。
   - `scripts/build-container.mjs`：改为强制传入 `<profile> <url>`，示例中给出 weibo/xhs，但运行时不再默认任何平台。

#### 7. 【进行中】详情模态框容器对齐（当前执行中）
   - [x] 调整 `xiaohongshu_detail.gallery` 容器 selector：主 selector 改为 `.media-container`，备选保留 `.note-slider-list` 等，确保媒体区域锚点高亮落在图片区域。
   - [x] 调整 `xiaohongshu_detail.comment_section` 容器 selector：主 selector 改为 `.comments-el`，备选保留 `.comment-list` 等，`metadata.required_descendants_any` 增加 `.comments-el`，确保评论滚动在模态框内部执行。
   - [x] 调整 `xiaohongshu_detail.modal_shell` 容器 metadata：`required_descendants_any` 增加 `.media-container`、`.comments-el`，并在备选 selector 中补充 `.media-container`，让模态框根容器更贴合当前 DOM 结构。
   - [x] 调整根容器 `page_patterns` 以避免页面类型混淆：
       - `xiaohongshu_detail`：`page_patterns` 调整为 `["/explore/*"]`，只在详情页命中；
       - `xiaohongshu_search`：`page_patterns` 调整为 `["/search_result*","*/search_result*"]`，只在搜索结果页命中；
       - 保持 `xiaohongshu_home` 只覆盖主页 `/explore`，通过 ContainerMatcher 的评分优先级区分 home/detail。
   - [x] 在 Phase3 / Phase4 脚本入口增加“页面状态检测”：
       - 调用 `containers:match` 读取 `snapshot.root_match` + `container_tree`，根据是否存在 `xiaohongshu_home` / `xiaohongshu_search` / `xiaohongshu_detail` 判定当前页面类型；
       - Phase3：`home` 直接报错退出；`search` 才执行列表 + 打开详情；`detail` 则跳过搜索与点击，直接执行详情提取 Block；
       - Phase4：同样基于页面类型选择“从搜索打开详情”或“直接在当前详情页展开评论”，`home/unknown` 状态拒绝继续执行。
   - [x] 在 `phase3-detail.mjs` / `phase4-comments.mjs` 中完整验证基础锚点：
       - 打开单条详情后，`ExtractDetailBlock` 通过 `verifyAnchorByContainerId` 高亮 `xiaohongshu_detail.header/content/gallery`，并回读 Rect（作者 / 正文 / 图片区域）；
       - `ExpandCommentsBlock` 通过 `verifyAnchorByContainerId` 高亮 `xiaohongshu_detail.comment_section`、`comment_item`、`end_marker`，Rect 校验通过，终止锚点命中 `- THE END -`。
   - [ ] 在评论锚点已稳定的前提下，补齐评论内容提取：
       - 避免直接依赖 `container:operation extract`（当前存在 `Page not available for evaluation` 问题），改为基于 `comment_section` 根元素的 DOM 提取（`browser:execute`）；
       - 确认能稳定抽取单条评论的 `user_name`、`user_id`、`text`、`timestamp`，并在 `ExpandCommentsBlock` 的 `comments[]` 中返回。

---

**最后更新**：2026-01-06 (完成所有 Block 锚点 + 高亮 + Rect 回环接入，并接好 Phase3/4 测试日志)

## P0 任务进展总结（2025-01-06）

### 已完成

1. **containers:match 超时问题调查** ✅
   - 发现 `captureInspectorSnapshot` 超时，暂时无法解决
   - 临时方案：创建 `containerAnchors.ts`，直接从容器定义读取 selector，用 `browser:execute` 进行高亮+Rect回环

2. **创建锚点验证辅助函数** ✅
   - `modules/workflow/blocks/helpers/simpleAnchor.ts`：简化版，直接用 selector
   - `modules/workflow/blocks/helpers/containerAnchors.ts`：容器驱动版，从容器定义加载 selector

3. **为 Block 添加锚点 + 高亮 + Rect 回环** ✅
   - `GoToSearchBlock`：已添加 `anchor { containerId, selector, rect }` 到输出，在执行搜索前验证搜索框锚点
   - `CollectSearchListBlock`：已内置列表+第一项的锚点验证（已有代码，无需重复添加）

4. **Phase2/3/4 v2 测试脚本** ✅
   - `scripts/xiaohongshu/tests/phase2-search-v2.mjs`：简化版，用 `browser:execute` 直接验证锚点
   - `scripts/xiaohongshu/tests/phase3-detail-v2.mjs`：详情页锚点验证
   - `scripts/xiaohongshu/tests/phase4-comments-v2.mjs`：评论区锚点验证

### 当前状态

- Unified API (7701) 和 Browser Service (7704) 需要重新启动
- 容器索引已更新为 `xiaohongshu/search/container.json`
- Block 级别的锚点验证已实现，但需要服务运行才能测试

### 下一步

1. 重启服务（需要用户手动执行 `node scripts/start-headful.mjs`）
2. 运行 `npx tsx scripts/test-phase2-with-anchor.mjs` 验证 Block 锚点功能
3. 更新 task.md 标记 P0 任务完成情况

---

## 【新增】P0+：搜索节流机制（SearchGate）- 2025-01-06

### 背景

平台风控对频繁搜索高度敏感，必须：
1. **所有搜索走对话框交互**（模拟人工输入 + 回车），禁止直跳 URL
2. **后台流速控制**：默认 2 次/分钟

### 实施方案

- **SearchGate 服务**：独立常驻进程（`scripts/search-gate-server.mjs`），端口 7790
- **WaitSearchPermitBlock**：Workflow 步骤，在执行搜索前先申请许可
- **Phase1 自动启动**：`scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs` 登录成功后自动拉起 SearchGate

### 已完成 ✅

1. **后台服务**：
   - `scripts/search-gate-server.mjs`：HTTP 接口（POST /permit、GET /health、GET /stats）
   - `scripts/search-gate-cli.mjs`：CLI（start/stop/restart/status）

2. **Workflow 集成**：
   - `modules/workflow/blocks/WaitSearchPermitBlock.ts`：申请搜索许可
   - `modules/workflow/definitions/xiaohongshu-collect-workflow-v2.ts`：添加 `WaitSearchPermitBlock` 步骤
   - `scripts/run-xiaohongshu-workflow-v2.ts`：注册新 Block

3. **Phase1 增强**：
   - `scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs`：自动启动 SearchGate

4. **文档**：
   - `docs/arch/SEARCH_GATE.md`：完整设计与使用说明
   - `AGENTS.md`：新增硬性规则 § 5（所有搜索必须通过 SearchGate）

5. **测试脚本**：
   - `scripts/xiaohongshu/tests/test-search-gate.mjs`：验证速率限制

### 验证步骤

```bash
# 1. 启动 Phase1（自动拉起 SearchGate）
node scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs

# 2. 验证 SearchGate 状态
node scripts/search-gate-cli.mjs status

# 3. 测试速率限制
node scripts/xiaohongshu/tests/test-search-gate.mjs

# 4. 运行 Workflow（包含 WaitSearchPermitBlock）
npx tsx scripts/run-xiaohongshu-workflow-v2.ts --keyword "手机膜" --count 5
```

### 约束

- **所有 Workflow 涉及搜索时必须先调用 `WaitSearchPermitBlock`**
- **禁止绕过 SearchGate 直接执行搜索**（会触发风控）
- **Phase2/3/4 测试脚本不应主动触发搜索，除非经由 SearchGate 许可**

#### 10. 【已完成】评论 Warmup 使用“聚焦 + PageDown”原生滚动

- [x] 从 `scripts/xiaohongshu-native-click-collector-v4.mjs` 复用聚焦与滚动思路：
  - 在 `WarmupCommentsBlock` 中新增原生点击函数 `nativeClick`（通过 `user_action: move/down/up` 模拟鼠标点击）；
  - 新增 `focusCommentsArea`：在详情模态框内优先选择 `.comments-el .comment-item` / `.comment-item` / `.note-content` / `.author-container` 中第一个可见元素，高亮并计算中心点，然后用 `nativeClick` 把焦点显式落到评论区域；
  - 去掉早期对评论根元素的直接 `click()` 焦点逻辑，避免 PageDown 落在错误区域。
- [x] Warmup 滚动策略改为“只发送 PageDown 键盘事件”：
  - 每一轮：先执行基于容器的 `find-child`（触发 `comment_section.show_more_button` 的 `metadata.auto_click`），再在当前视口内做一次 DOM 兜底展开，然后发送一次 `PageDown`；
  - 不再使用早期的鼠标滚动实验逻辑，保证行为与旧脚本一致。
- [x] Phase4 验证结果：
  - `node scripts/xiaohongshu/tests/phase4-comments.mjs` 在单条详情页上验证，通过 Warmup + Expand 后评论数为 30 / 36，`end_marker` 高亮到视口中间，Rect 校验通过，关闭模态框正常；
  - 整个过程为“先聚焦评论区，再 PageDown 滚动”，滚动行为为用户可见。

> 后续若需要继续提高“展开 N 条回复”的命中率，再以容器 `appear` 事件 + DOM 兜底的方式优化，但不再改动“聚焦 + PageDown”的基础滚动模型。

---

## 【新增】Phase 5：collect-100-workflow-v2 可靠性设计（2025-01-06）

### 背景

当前 `collect-100-workflow-v2.mjs` 存在结构性缺陷：
- 无持久化任务状态 → 崩溃后需从头开始
- 无去重机制 → 可能重复采集同一 noteId
- 无阶段回环验证 → 失败后无法恢复到安全起点
- 登录状态无强制检查 → 未登录时继续采集会触发风控

### 设计目标

1. **持久性任务状态保存**：进程崩溃/中断后可恢复
2. **去重执行**：基于 noteId 幂等采集，避免重复写入
3. **阶段进入/离开锚点**：每个阶段必须有明确的进入和离开验证
4. **错误恢复**：失败后回到主页面/搜索页，恢复到安全起点继续执行
5. **视口安全**：所有操作均在可见元素范围内，模拟用户行为

### 核心机制

#### 1. 持久化任务状态

**状态文件**：`xiaohongshu_data/.progress_<sessionId>.json`

```json
{
  "version": 1,
  "sessionId": "xiaohongshu_fresh",
  "updatedAt": "2025-01-06T15:00:00.000Z",
  "keywordIndex": 2,
  "searchRound": 5,
  "collectedCount": 37,
  "seenNoteIds": ["<noteId1>", "<noteId2>"]
}
```

**保存时机**：
- 每采集 5 条保存一次
- 每完成一个 keyword 搜索后保存一次
- 发生异常前写入当前阶段状态

#### 2. 去重执行

**去重依据**：noteId（从 URL 或 detail container 中提取）

**规则**：
- 采集前：若 noteId 已存在 → 直接跳过
- 写入前：再次检查 seenNoteIds，确保幂等

#### 3. 阶段进入/离开锚点

| 阶段 | 进入锚点 | 离开锚点 | 说明 |
|------|----------|----------|------|
| Phase2 Search | `xiaohongshu_search.search_bar` | `xiaohongshu_search.search_result_list` | 搜索框输入 → 搜索结果容器出现 |
| Phase3 Detail | `xiaohongshu_detail.modal_shell` | `xiaohongshu_search.search_result_list` | 详情 modal 打开 → 关闭回列表 |
| Phase4 Comments | `xiaohongshu_detail.comment_section` | `xiaohongshu_detail.modal_shell` | 评论区域出现 → 仍保持在详情页 |

**验证要求**：
- 进入：容器存在 + rect 可见
- 离开：目标锚点出现，前一锚点消失

#### 4. 错误恢复机制

**恢复策略**：

| 错误类型 | 恢复策略 |
|----------|----------|
| SearchGate 超时 | 等待窗口 + 重试搜索 |
| Search 失败 | 回到首页 → 重新进入搜索 |
| Detail 失败 | 关闭 modal → 回搜索列表 |
| Comment 失败 | 保持详情页 → 跳过评论 |
| Session 失效 | 调用 Phase1 登录恢复 |

**恢复流程**：
```ts
try {
  await openDetail(...);
  await extractDetail(...);
} catch (err) {
  await closeDetail(...).catch(() => ({}));
  const ok = await verifyAnchor('xiaohongshu_search.search_result_list');
  if (!ok) await navigateHome();
}
```

### 5. 视口安全约束

所有操作必须满足：
- `rect.y < window.innerHeight`
- `rect.width > 0 && rect.height > 0`
- 仅操作可见元素

详见：`docs/arch/VIEWPORT_SAFETY.md`

### 实施计划

#### 阶段1：P0 阻塞性修复（立即）
- [ ] 添加登录状态强制检查
- [ ] 实现会话健康监控
- [ ] 添加 SearchGate 智能重试（非直接终止）

#### 阶段2：P1 高优先级（1-2周）
- [ ] 实现断点续采机制（进度持久化）
- [ ] 添加错误分类与重试策略
- [ ] 实现阶段进入/离开锚点验证

#### 阶段3：P2 长期优化（2-4周）
- [ ] 优雅降级策略（功能降级）
- [ ] 行为模式随机化（延迟、轨迹）
- [ ] 错误监控和告警机制

### 验证清单

- [ ] 断点续采可恢复（Ctrl+C后重跑）
- [ ] 采集过程无重复 noteId
- [ ] 每阶段进入/离开锚点均验证成功
- [ ] 失败后能回到搜索页
- [ ] SearchGate 节流正常
- [ ] 操作均在视口内

### 相关文件

- `scripts/xiaohongshu/tests/collect-100-workflow-v2.mjs`
- `modules/workflow/blocks/WaitSearchPermitBlock.ts`
- `modules/workflow/blocks/GoToSearchBlock.ts`
- `modules/workflow/blocks/OpenDetailBlock.ts`
- `modules/workflow/blocks/ExtractDetailBlock.ts`
- `modules/workflow/blocks/ExpandCommentsBlock.ts`
- `modules/workflow/blocks/CloseDetailBlock.ts`
- `docs/arch/VIEWPORT_SAFETY.md`
- `docs/arch/COLLECT_WORKFLOW_RELIABILITY.md`

---

**状态**：设计中（2025-01-06）  
**目标**：达到"无人值守、可恢复、可监控"的生产级标准
