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

### P0 追加修复（2026-01-07）

- [x] 将 `AnchorVerificationBlock` 改为基于 `container-library` + `verifyAnchorByContainerId` 的锚点验证，不再在该 Block 内调用 `containers:match`，避免阶段性超时影响整条采集链路；
- [x] 调整 `SessionHealthBlock`：会话健康只依赖浏览器可响应 + 页面可访问，不再把 `containers:match` 作为硬性失败条件，`containersMatchable` 仅作为诊断字段；
- [x] 调整 `ErrorRecoveryBlock`：恢复阶段改用锚点 `xiaohongshu_search.search_result_list` / `xiaohongshu_home` 的 Rect 校验（同样通过 `verifyAnchorByContainerId`），彻底去掉内部的 `containers:match` 调用；
- [x] 调整 `LoginRecoveryBlock`：登录检测显式区分 `logged_in / not_logged_in / uncertain / error`，仅在命中 `login_guard` 时才自动触发 Phase1 登录恢复；`uncertain` 状态直接向上抛出，由集成脚本（如 `collect-100-workflow-v2.mjs`）提示用户手动运行 Phase1 或 `status-v2.mjs` 检查；对于 `error`（典型是 `containers:match` 超时）场景，若当前 URL 仍在小红书非登录页，则按“已登录（弱判断）”继续执行，并给出额外提示，避免因单次超时阻塞长任务；
- [x] 修复 `scripts/xiaohongshu/tests/collect-100-workflow-v2.mjs` 中缺失的 `delay()` 实现，确保 SearchGate 超时时可以按预期“等待 60s 再继续下一轮搜索”而不会抛出运行时错误。

> 以上改动的目标是把 `containers:match` 的不稳定性收敛到少数必要位置，并在登录/恢复/健康检查等 P0 路径上提供明确的“降级 + 提示”，避免因为单次容器匹配超时就导致整条采集流程退出或反复误触发 Phase1。

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
- [x] 添加登录状态强制检查
- [x] 实现会话健康监控
- [x] 添加 SearchGate 智能重试（非直接终止）

#### 阶段2：P1 高优先级（1-2周）
- [x] 实现断点续采机制（进度持久化）
- [x] 添加错误分类与重试策略
- [x] 实现阶段进入/离开锚点验证

#### 阶段3：P2 长期优化（2-4周）
- [x] 优雅降级策略（功能降级）
- [x] 行为模式随机化（延迟、轨迹）
- [x] 错误监控和告警机制

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

---

## 五、当前问题总结与优先级（2026-01-07）

> 仅针对“小红书 100 条采集 Workflow”这一条链路，结合近期 Phase2–Phase4 与 collect-100 调试情况整理。

### P0：必须优先修复的问题

1. **CollectSearchListBlock 不支持滚动加载**
   - 现状（已部分修复）：`CollectSearchListBlock` 已改为基于列表容器（`xiaohongshu_search.search_result_list` / `xiaohongshu_home.feed_list`）的滚动 + 采集循环，会按 containerId 去重并记录 `scrollRounds`，但在搜索结果页上当前的滚动步长有限，部分场景仍只拿到首屏 1 条。
   - 影响：在 SearchGate 已限制“60 秒 2 次搜索”的前提下，每轮搜索只吃一屏结果，严重浪费搜索配额，无法在有限搜索次数内凑够 100 条。
   - 动作：
     - ✅ 已实现：
       - 将 `CollectSearchListBlock` 重构为“滚动 + 采集”循环，列表容器支持 `search_result_list` + `home.feed_list` 双路径，按 containerId 去重增量追加 item，并在输出中返回 `scrollRounds`；
     - ⏳ 待观察：
       - 在 `/search_result` 场景下，根据后续实测调整滚动步长与终止条件，确保单关键词能吃到一屏以上结果（必要时引入“连续 N 轮无新 item”作为强终止条件）。

2. **OpenDetailBlock 点击定位不够精确**
   - 现状（已修复）：已经改为“以传入的 `containerId` 为锚点，通过 `getContainerRect` 计算卡片中心点，再在该卡片 DOM 内查找可见封面/图片元素点击”，详情锚点也改为基于 `verifyAnchorByContainerId('xiaohongshu_detail.modal_shell' \| 'xiaohongshu_detail')` 的高亮 + Rect 校验，不再依赖 `containers:match`。
   - 影响：列表/Feed 共用页面时理论上存在点错卡片的风险，一旦发生，noteId → 详情数据将被污染。
   - 动作：
     - ✅ 已实现：
       - OpenDetail 在点击前高亮并回读 `clickedItemRect`，点击时仅在该 Rect 所在卡片内查找 `a.cover.mask`/安全链接/img 并点击，打开后通过容器锚点验证详情模态 Rect；
     - ⏳ 待观察：
       - 在 `/search_result` 和 `/explore` feed 两种入口下，进一步验证不会点错卡片（通过 Phase3/Phase4 + 高亮回环人工确认）。

### P1：影响稳定性与风控风险的问题

1. **视口外操作风险仍存在**
   - 现状：大部分 Block 已有 Rect 校验，但仍有少量滚动/点击没有完全遵守 `docs/arch/VIEWPORT_SAFETY.md`（例如：列表 Rect.y 为 0 的情况下仍尝试操作，评论锚点缺失时继续滚动）。
   - 影响：存在在视口外 click/scroll 的情况，可能触发风控。
   - 动作：
     - 在搜索列表、详情、评论等 Block 中统一收紧：
       - 所有 click/scroll 前必须基于锚点 Rect 判定是否在 viewport 内，不在时先小步滚动将元素带入视口，再操作；
       - 禁止在 Rect 不可见（height/width=0 或 y > window.innerHeight）时继续进行任何用户行为模拟。

2. **Warmup / Expand 职责边界不清**
   - 现状（已部分收敛）：`WarmupCommentsBlock` 和 `ExpandCommentsBlock` 在锚点缺失时现在会直接返回失败，不再继续滚动/扫描；新增了 `CollectCommentsBlock` 用于聚合 warmup+expand，但部分脚本仍直接调用旧的两个 Block。
   - 影响：评论不完整时，很难判断是滚动展开没做好，还是提取逻辑有 bug，调试成本高。
   - 动作：
     - ✅ 已实现：
       - 新增 `CollectCommentsBlock`，内部依次调用 `WarmupCommentsBlock` 和 `ExpandCommentsBlock`，对 warmup/expand 失败直接向上抛错，并在输出中统一返回 `comments[] + reachedEnd + emptyState + warmupCount + totalFromHeader + anchor`；
       - `scripts/xiaohongshu/tests/phase4-comments.mjs` 与 `scripts/xiaohongshu/tests/collect-100-workflow-v2.mjs` 已切换为只调用 `CollectCommentsBlock`，不再在脚本层手工串 warmup+expand。
     - ⏳ 待观察：
       - 后续 P1/P2 中根据实测补强 `CollectCommentsBlock` 的视口安全和展开命中率（特别是“展开 N 条回复”的深层级），并在旧 Block 稳定后考虑对外标记为“内部使用”。

### P2：结果质量与恢复策略优化

1. **ProgressTracker 去重粒度不够**
   - 现状：当前只基于 `noteId` 去重，`seenNoteIds` 已经避免了明显的重复采集，但在多容器路径指向同一 note 的边缘场景仍可能产生少量重复。
   - 动作：
     - 在 `ProgressTracker` 与 collect-100 中增加容器维度的去重键，例如：`seenKeys.add(\`\${noteId}||\${containerId}\`)`，确保同一 noteId + containerId 只处理一次。

2. **错误恢复策略偏激进**
   - 现状：部分错误一律走“回首页 + 重试”的重型路径，即使只是临时超时或锚点验证失败，也会导致多余的导航与重试。
   - 动作：
     - 细化 `ErrorClassifier` 与 `ErrorRecoveryBlock`：
       - 对临时性错误（超时/网络抖动）仅停止当前 note，记录日志并继续下一条，不必立即回首页；
       - 对系统性错误（session 失效、频繁风控）才触发回首页/终止任务；
       - 对纯降级可接受的错误（如评论展开部分失败）通过 `GracefulFallbackBlock` 做功能降级，而不是一律重试。

---

## P2 追加改进（2025-01-07）

### 已完成

- [x] **ProgressTracker 容器维度去重**（`modules/workflow/blocks/ProgressTracker.ts`）
  - 新增 `seenKeys` 字段（格式：`noteId||containerId`），支持容器维度去重
  - 新增静态方法 `makeDedupeKey()` / `parseDedupeKey()`
  - 向后兼容旧版本进度文件（自动转换 `seenNoteIds` → `seenKeys`）
  - **影响**：解决同一 noteId 通过不同容器路径访问时被误判为重复的问题

- [x] **ErrorClassifier 细化错误分类与恢复策略**（`modules/workflow/blocks/ErrorClassifier.ts`）
  - 细化错误类型：`TEMPORARY` / `PERMANENT` / `SYSTEMIC` / `DEGRADED`
  - 细化恢复动作：`RETRY` / `SKIP_ITEM` / `GRACEFUL_DEGRADE` / `ABORT_TASK`
  - 上下文感知分类：支持 'search' / 'detail' / 'comment' / 'login' 上下文
  - 新增 `getRecoveryAction(error, context)` 工具函数，返回结构化恢复建议
  - **影响**：
    - 避免临时错误触发"回首页"等重型恢复
    - 永久性错误（404）直接跳过，不浪费重试次数
    - 系统性错误立即终止，避免无效尝试
    - 可降级错误保存部分数据，不丢失已采集内容

### 待执行

- [x] **更新 collect-100-workflow-v2.mjs 应用新策略**
  - 导入并使用 `ProgressTracker.makeDedupeKey()` / `parseDedupeKey()`
  - 使用 `seenKeys` 替代 `seenNoteIds`（7 处修改）
  - 应用细化错误策略（5 处修改）
  - 优化错误恢复流程（移除对临时错误的重型恢复）

> 以上改动的目标是在 P0（降低 containers:match 依赖）的基础上，进一步提高采集任务的去重精度与错误恢复智能度，减少因误判错误类型导致的任务中断或数据丢失。


---

## P2：持久化节点 + 离线仿真测试（设计与落地）

> 目标：把“小红书详情 + 评论采集 + 本地写盘”收敛为标准 Workflow 节点，并通过离线仿真页稳定回放，不再依赖线上 URL。

### P2.1 Workflow 节点与执行模型

- [x] 设计 Workflow 节点模型与统一执行入口（文档：`docs/arch/WORKFLOW_EXECUTION_NODE_MODEL.md`）
  - WorkflowExecutor 支持 `initialContext`，返回 `steps[]` trace（每步包含 `input/output/error/contextAfterStep`）；
  - Block 与子 Workflow 统一抽象为“节点”，通过 `CallWorkflowBlock` 串联；
  - 新增 `runWorkflowById(workflowId, initialContext)` 统一入口，脚本只做参数解析与调用。
- [x] 初步框架落地
  - 在 `modules/workflow/blocks/WorkflowExecutor.ts` 中扩展返回结构并接入 `steps[]` 记录；
  - 在 `modules/workflow/blocks/CallWorkflowBlock.ts` 中实现子 Workflow 调用节点；
  - 在 `modules/workflow/config/workflowRegistry.ts`/`modules/workflow/src/runner.ts` 中实现 workflow 注册与 `runWorkflowById`。

### P2.2 PersistXhsNoteBlock 设计与实现

- [x] 设计持久化节点（文档：`docs/arch/XIAOHONGSHU_OFFLINE_MOCK_DESIGN.md`）
  - 定义 `PersistXhsNoteBlock` 输入/输出结构；
  - 统一目录结构：`~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/content.md + images/`；
  - 内容格式与现有 collect-100 markdown 规范对齐（标题、元信息、正文、图片引用、评论列表）。
- [x] 在 `modules/workflow/blocks/` 下实现 `PersistXhsNoteBlock.ts`
  - 从 `detail` + `commentsResult` 生成 markdown 内容；
  - 使用 fetch 下载图片到 `images/`，对单张失败做降级（跳过但不整体失败）。
- [x] 将 `PersistXhsNoteBlock` 接入单 Note Workflow（`xiaohongshu-note-collect`）并注册到 workflowRegistry（可通过 `runWorkflowById` 调用）。

### P2.3 在线数据 → fixture JSON

- [x] 抽象通用 fixture 录制 Block（`RecordFixtureBlock`）
  - 输入：`platform/category/id/data`，输出到 `~/.webauto/fixtures/{platform}/{category}-{id}.json`；
  - 结构中统一包含 `capturedAt` 字段，方便后续回放与演化；
  - 可被小红书、微博等多个平台共用。
- [ ] 在在线调试路径（Phase3/Phase4 或专用脚本）中录制小红书 note fixture
  - 在 `ExtractDetailBlock` 与 `CollectCommentsBlock` 完成后，将输出聚合为 `XhsNoteFixture`；
  - 写入 `~/.webauto/fixtures/xiaohongshu/note-{noteId}.json`（仅在 DEBUG/测试模式或显式开启时启用，例如 `--recordFixture`）。
- [ ] 为 fixture 定义最小字段集合与演化策略
  - 明确 fixture 结构（noteId/keyword/detailUrl/detail/commentsResult/capturedAt）；
  - 保证后续 Persist/仿真工具对字段变更具备向后兼容能力。

### P2.4 fixture JSON → 仿真 HTML 详情页

- [x] 设计仿真页结构（文档：`docs/arch/XIAOHONGSHU_OFFLINE_MOCK_DESIGN.md`）
  - DOM 结构与 `xiaohongshu_detail.*` / `comment_section.*` 容器 selector 对齐；
  - 模拟 `.show-more` 展开更多评论按钮与简单点击脚本；
  - 图片区域按 gallery 容器定义生成 `<img>` 列表。
- [x] 新增脚本 `scripts/xiaohongshu/tests/generate-detail-mock-page.mjs`
  - 输入 fixture JSON，输出本地 HTML 仿真页；
  - 默认路径：`~/.webauto/fixtures/xiaohongshu/detail-{noteId}.html`。

### P2.5 基于仿真页的离线测试

- [x] PersistXhsNoteBlock 单块测试脚本
  - 已添加 `scripts/xiaohongshu/tests/test-persist-from-fixture.mjs`，使用 fixture JSON 作为输入直接调用 `PersistXhsNoteBlock`；
  - 本地已通过离线 demo fixture（note-offline-demo）验证写盘路径与 `content.md` 生成逻辑，图片下载在网络失败时按设计降级为告警不报错；
  - 仍建议后续结合真实小红书 fixture（由 RecordFixtureBlock 录制）再做一次人工复核。
- [ ] 单 Note Workflow 离线 E2E 脚本
  - 已添加 `scripts/xiaohongshu/tests/run-note-workflow-offline.mjs`，通过 `runWorkflowById('xiaohongshu-note-collect', ...)` 在当前 session 上执行单 note workflow；
  - 需要后续配合本地仿真 HTML 与 Browser Service 手动验证 ExtractDetail/CollectComments/PersistXhsNoteBlock 在仿真 DOM 上的表现。
- [ ] 整链路集成（可选 debug 模式）
  - 在 debug 环境下，将搜索阶段替换为“直接进入本地仿真详情页”的简化 Workflow；
  - 验证顶层 Workflow + CallWorkflowBlock 串联与写盘结果稳定性。


## P1.1 追加修复（2025-01-07）：CollectSearchListBlock containers:match 超时保护

### 问题
- `run-xiaohongshu-workflow-v2.ts` 在 Phase2 搜索完成后卡住
- 根本原因：`CollectSearchListBlock` 第一步调用 `containers:match` 超时（10 秒+）
- 虽然 P0 已修复其他 Block（Login/SessionHealth/ErrorRecovery/AnchorVerification），但 `CollectSearchListBlock` 遗漏

### 解决方案（方案 A）
为 `containers:match` 添加 5 秒超时 + 降级方案：

```typescript
// 1. 尝试 containers:match（带 5 秒超时）
try {
  const matchResult = await Promise.race([
    controllerAction('containers:match', {...}),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
  ]);
  tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
} catch (err) {
  matchTimeout = true;
}

// 2. 降级方案：使用固定容器 ID（基于 URL 判断）
if (matchTimeout || !tree) {
  if (currentUrl.includes('/search_result')) {
    listContainerId = 'xiaohongshu_search.search_result_list';
  } else {
    listContainerId = 'xiaohongshu_home.feed_list';
  }
  listContainer = { id: listContainerId };
}
```

### 验证结果
✅ 超时保护已生效：
- containers:match 5 秒超时后正常降级
- 使用固定容器 ID 成功获取列表 Rect
- 进入滚动采集循环

### 后续观察
- `containers:inspect-container` 也可能超时，需要根据实测情况添加类似保护


---

## P1.1 追加修复（2025-01-07 第 2 轮）：CollectSearchListBlock DOM 提取兜底

### 根本问题
`container:operation extract` 返回 `"Page not available for evaluation"`：
- Browser Service 的 page 对象不可用或被销毁
- 导致所有依赖页面 DOM 查询的容器操作失败
- 提取结果为空对象，noteId/title/detailUrl 全为 undefined

### 解决方案
为 `CollectSearchListBlock` 添加 DOM 提取兜底逻辑：

```typescript
try {
  const extractResult = await controllerAction('container:operation', {
    containerId: id,
    operationId: 'extract',
    config: { fields: ['title', 'link'] },
    sessionId: profile
  });
  
  if (extractResult.success) {
    extracted = extractResult.data?.extracted?.[0] || ...;
  } else {
    throw new Error(extractResult.error);
  }
} catch (err) {
  // DOM 提取兜底
  const domResult = await controllerAction('browser:execute', {
    profile,
    script: `(() => {
      const card = document.querySelector('.note-item');
      const titleEl = card.querySelector('[class*="title"]');
      const linkEl = card.querySelector('a');
      return {
        title: titleEl?.textContent?.trim() || '',
        link: linkEl?.getAttribute('href') || ''
      };
    })()`
  });
  extracted = domResult.result || {};
}
```

### 验证结果
✅ DOM 兜底成功：
- noteId: `69597373000000001e002e3c`
- title: `🌐 DeepSeek-Coder-V2开源支持338种编程语`
- detailUrl: `/explore/69597373000000001e002e3c`

### 遗留问题
❌ 滚动后只能找到 1 个 item（目标 3-5 条）：
- `containers:inspect-container` 返回的 container_tree 不包含新加载的 item
- 需要后续优化：完全移除对 `containers:inspect-container` 的依赖，改用纯 DOM 扫描


## P1.2 错误恢复机制（2025-01-07）

### 问题
Phase3/4 出错时缺乏状态恢复机制，导致：
- 出错后必须从首页重新开始
- 搜索结果丢失，需重新搜索（触发 SearchGate）
- 影响采集效率

### 解决方案
为 Phase3/4 增加 ESC 恢复模式：
- ErrorRecoveryBlock 新增 `recoveryMode: 'esc'` 参数
- 使用 `history.back()` 退出详情页返回搜索页
- 恢复成功后重新进入详情页继续执行
- 最多重试 1 次（避免无限循环）

### 技术验证
✅ `history.back()` 可成功退出详情页  
✅ 可返回搜索页并重新进入详情页  
✅ 评论展开不需要特殊处理（直接使用 Phase3 状态）  
✅ 无风控触发

### ESC 恢复流程
```
Phase3/4 出错 
  → 调用 ErrorRecoveryBlock({ recoveryMode: 'esc' })
  → 关闭详情页（容器关闭 → 点击按钮 → history.back() 降级）
  → 返回搜索结果页
  → 验证容器状态
  → 重新获取搜索列表
  → 重新进入详情页
  → 继续执行 Phase3/4 逻辑
```

### 实现文件
- `modules/workflow/blocks/ErrorRecoveryBlock.ts`：新增 `recoverWithEsc()` 函数
- `scripts/xiaohongshu/tests/phase3-detail.mjs`：catch 块集成 ESC 恢复
- `scripts/xiaohongshu/tests/phase4-comments.mjs`：catch 块集成 ESC 恢复
- `docs/arch/AGENTS.md`：新增第 7 条规则（ESC 恢复机制）

### 验证脚本
- `/tmp/test_esc_recovery*.mjs`：ESC 退出再进入可行性验证
- `/tmp/esc_recovery_conclusion.md`：技术可行性分析报告
- `/tmp/FINAL_SUMMARY.md`：完整实施总结

### 状态
✅ 已完成所有代码实现  
✅ 已完成技术验证  
✅ 已完成文档更新  
⏳ 等待真实场景测试验证

---

## P1.3 锚点收紧补充（2026-01-07）：ExpandComments / WarmupComments / CloseDetail / ErrorRecovery

### 目标
- 将评论展开、评论预热、详情关闭与 ESC 恢复全部统一到“锚点优先、无锚不动”的安全策略下，彻底消除无锚点滚动/点击带来的风控风险。

### 1）ExpandCommentsBlock：comment_item / empty_state 锚点兜底
- 文件：`modules/workflow/blocks/ExpandCommentsBlock.ts`
- 关键收紧点：
  - 在 `containers:inspect-container` 得到的 `container_tree` 上同时查找：
    - `xiaohongshu_detail.comment_section.comment_item`（评论项容器）；
    - `xiaohongshu_detail.comment_section.empty_state`（空状态容器）。
  - 新增“3.0 锚点兜底”逻辑：
    - 若 `comment_item` 为空 && 命中 `empty_state`：
      - 通过 `verifyAnchorByContainerId(empty_state)` 做一次高亮 + Rect 回环；
      - 直接返回 `success=true, comments=[], reachedEnd=true, emptyState=true`，不再执行任何 DOM 扫描脚本；
      - `anchor` 中带上 `commentSectionRect + endMarkerContainerId=end_state`，用于后续日志与 UI 高亮。
    - 若 `comment_item` 为空 && 未命中 `empty_state`：
      - 视为“评论区锚点缺失”，直接返回
        `success=false, error='comment_item & empty_state anchors not found'`；
      - 不再执行 DOM 级提取脚本，彻底避免“无锚点盲扫 DOM”的行为。
- 保留原有基于容器定义（selector + extractors）的 DOM 提取逻辑，但前提变为：
  - 必须先命中至少一个 `comment_item` 容器节点；
  - 之后才允许运行 container-driven DOM 聚合脚本。

### 2）WarmupCommentsBlock：首帧“无评论+无展开”直接停机
- 文件：`modules/workflow/blocks/WarmupCommentsBlock.ts`
- 新增逻辑：
  - 在进入滚动循环之前，对 `getCommentStats()` 的首帧结果做一次判断：
    - 若 `count=0 && total=null && hasMore=false`：
      - 认为当前详情页不存在可见评论，也不存在“展开 N 条回复”控件；
      - 直接返回：
        - `success=true, reachedEnd=true, totalFromHeader=null, finalCount=0`；
        - `anchor.commentSectionRect` 来自前面的 `verifyAnchorByContainerId(comment_section)`。
      - 不再执行任何 `scrollTop` 操作或 `user_action` 滚动，避免在完全无锚点的情况下反复滚动详情页。
- 其余逻辑保持不变：
  - 仍然优先尝试基于容器运行时的 `show_more_button` click；
  - 仅在存在 `.show-more` 等元素时才执行 DOM 级兜底点击；
  - 当一轮中 `clicked=0 && total in {0,-1} && allButtons` 为假时，立即停止后续滚动。

### 3）CloseDetailBlock：无详情锚点不关闭 + 回到 search/feed 必须有锚点
- 文件：`modules/workflow/blocks/CloseDetailBlock.ts`
- 收紧点：
  - 关闭前：
    - 使用 `containers:match` 在 `container_tree` 中查找：
      - `xiaohongshu_detail.modal_shell`（优先）；
      - `xiaohongshu_detail` 根容器（兜底）。
    - 若两者都未命中，直接返回：
      - `success=false, error='detail modal anchor not found, abort CloseDetail'`；
      - 不再尝试任何 `browser:execute`（遮罩 click / history.back），避免在非详情页上误操作。
  - 关闭后：
    - 再次调用 `containers:match`，在新树上查找：
      - `xiaohongshu_search.search_result_list`；
      - 或 `xiaohongshu_home.feed_list`（回到首页 feed 的兜底场景）。
    - 若二者之一命中：
      - 高亮 + `getContainerRect`，校验“列表在中部区域，详情不再覆盖视口中心”，写入 `anchor.searchListRect` 与 `verified`；
    - 若二者均未命中：
      - 视为关闭失败（即便没有抛异常），返回 `success=false`，并带上 pre-close 的 `detailRect`，方便日志排查。

### 4）ErrorRecoveryBlock：ESC 恢复完全基于详情锚点 + 容器 close
- 文件：`modules/workflow/blocks/ErrorRecoveryBlock.ts`
- `recoverWithEsc()` 的新行为：
  - 步骤 0：锚点前置
    - 先通过 `verifyAnchorByContainerId('xiaohongshu_detail.modal_shell')` 确认当前确实在详情 modal 上；
    - 若未命中或 Rect 异常，直接返回 `{ success:false, method:'no-detail-anchor' }`，不做任何关闭/回退动作。
  - 步骤 1：容器运行时关闭
    - 调用 `container:operation { containerId: modal_shell, operationId: 'close' }`；
    - 等待 1.5s 后读取 `location.href`，若包含 `/search_result`：
      - 认为通过容器 close 已成功返回搜索页，返回 `{ success:true, method:'container-close' }`。
  - 步骤 2：history.back 单次兜底
    - 若容器 close 抛错或未回到 `/search_result`，记录 warning 后执行：
      - `browser:execute { script: 'window.history.back()' }`；
      - 等待 2s，再次读取 `location.href`，根据是否包含 `/search_result` 返回 `{ success, method:'history-back' }` 或 `{ success:false, method:'history-back-error' }`。
  - 彻底移除原有在浏览器内拼 DOM selector (`.note-detail .close` / `.note-detail-mask`) 自己发 click 的逻辑，遵守“用容器运行时解决关闭问题”的约束。
- 顶层 `execute()` 仍保持：
  - 当 `recoveryMode='esc' && fromStage='detail' && targetStage='search'` 时优先走 `recoverWithEsc()`；
  - 在 `escResult.success=true` 的前提下，再用 `verifyStage('search')` 做一次容器级锚点验证，双重保证恢复落在 search_result 页面。

### 状态
- [x] ExpandCommentsBlock：已完成 comment_item/empty_state 锚点兜底与“无锚不动”逻辑；
- [x] WarmupCommentsBlock：已完成首帧“无评论+无展开”直接停机逻辑；
- [x] CloseDetailBlock：已完成“无详情锚点不关闭 + 必须命中 search_result_list/home.feed_list 才算成功”的收紧；
- [x] ErrorRecoveryBlock：已完成 ESC 模式基于详情锚点 + 容器 close + 单次 history.back 的重写；
- [ ] 后续仍需在真实采集流程中多轮回放日志，确认所有错误分支都能正确停在“安全但不动”的状态。
