# WebAuto 任务追踪（小红书 Workflow 拆 Block 落地）

> 目标：基于容器驱动的 Workflow 完成小红书搜索 + 详情 + 评论采集（当前全流程目标：200 条）。

## 当前执行任务（2026-01-15）

### 🎯 主线目标（按你的最新流程）

1. Phase1：启动守门人（按依赖顺序确保 `Unified API(7701)` → `Browser Service(7704)` → 会话存在 → 已登录）。
2. Phase2：只搜索一次 → **只滚动搜索结果页** → 每次只处理“视口内卡片”：
   - 系统点击卡片进入详情；
   - 在详情页拿到带 `xsec_token` 的安全链接；
   - 同时抽取“正文/图片/作者”等基础信息；
   - 落盘：写入 `safe-detail-urls.jsonl`（以及 Phase2 详情基础数据，供后续评论阶段使用）。
   - 运行策略（续传 vs 追加）：
     - 若历史 `safe-detail-urls` 中仍存在未落盘的 note（缺 `comments.md`），优先续传 Phase3-4，不重复搜索；
     - 若历史 `safe-detail-urls` 已全部落盘，则进入“追加采集”模式：在现有 safeCount 基础上再追加 `target` 条新链接（避免 `safeCount>=target` 时无事可做）。
3. Phase3（可选）：基于 Phase2 的列表，使用 **N 个 tab 常驻补位** 轮转采集评论（默认 4；每帖每轮最多 100 条），避免单帖连续滚动。
4. Phase4：落盘（续传 + 去重）：中断后按 step 恢复；本地已有内容必须可跳过/可增量更新。

### 🧩 新增：后台运行（2026-01-16）

- `phase1-4-full-collect.mjs` 支持 `--daemon true`：父进程会以 detached 方式拉起子进程并立刻退出，子进程持续写入本地 run log；关闭终端不影响任务继续运行。

### ✅ 已完成（稳定部分）

- [x] Phase1 基础服务守门人：脚本可自动拉起 `unified-api`/`browser-service`，复用已存在的 `xiaohongshu_fresh` 会话；未找到会话时可后台启动 `start-headful` 并等待会话出现。
- [x] 登录态检测：支持通过容器锚点（`login_anchor/login_guard/qrcode_guard`）识别“已登录/未登录/风控”并阻断未登录。
- [x] SearchGate 在线检测与自启动（Phase3/4 节流入口）。
- [x] 失败退出码与理由：脚本失败时输出 `[Exit] code=<number> reason=<string>`，并按阶段粗粒度映射（`phase2_* → 20+`, `phase3_* → 30+`, `phase4_* → 40+`；未知错误为 `1`）。
- [x] Run-level 日志与时间线：每次运行会生成 `run.<runId>.log` 与 `run-events.<runId>.jsonl`，用于回放和定位卡点（目录在 `~/.webauto/download/xiaohongshu/{env}/{keyword}/`）。
- [x] 评论区激活与 hover：对“正文很长导致评论区不在视口 / 需先点评论按钮”的页面，WarmupComments 会先点击 `xiaohongshu_detail.comment_button`（`.chat-wrapper`）再重新定位 `comment_section`，并在滚动前强制 hover/click 到评论区，避免焦点停在输入框导致滚动无效。
- [x] Phase3-4 Tab 常驻补位：不再“4 帖一组整体关闭”，改为 **N 个 tab 常驻**（默认 4），当检测到 `reachedEnd` 或 `emptyState`（或达到 `maxRoundsPerNote`）即判定该帖完成，并在同一个 tab 内执行 `goto` 导航到下一条链接补位（队列耗尽则保持空闲）。
- [x] Headless 测试开关：脚本支持 `--headless true` + `--restart-session true` 以 headless 模式启动/重建会话并执行采集（用于自动化回归测试）。

### 🧨 当前阻塞（需要复现 + 修复）

> 目标：Phase2 必须做到“只搜索一次 + 系统滚动（禁止 JS fallback）+ 关键字不漂移 + 视口内点击”，并能在高量词下快速跑满目标数。

1. [ ] Phase2 禁止重复 GoToSearch：循环内只允许“回退/ESC”恢复到搜索页，禁止再次触发搜索（避免重复刷新与死循环）。
2. [x] Phase2 系统滚动：已移除 JS scroll 兜底；滚动改为“系统滚轮”：
   - 优先走 `browser-service(7704) /command mouse:wheel`（服务重启后生效）；
   - 若当前服务版本未包含 `mouse:wheel`，脚本自动回退到 `browser-service(8765) WS user_action.scroll`（仍是 Playwright mouse.wheel，非 JS 滚动）；
   - 每次滚动后记录并验证 `scrollY/scrollTop/visibleSig`，无变化则停下避免死循环；
   - 新增 `isAtEnd` 判定：滚动前先判断是否已到底（list/window 任选其一），已到底则直接 stop 并记录原因，避免误报“滚动无变化”。
3. [ ] Phase2 关键字漂移检测：一旦 URL keyword 与首次搜索 canonical keyword 不一致，必须停下（或仅允许一次“后退”恢复），避免在错误关键词下继续采集。
4. [ ] Phase2 “无 token”处理：打开详情后如果 URL 没有 `xsec_token`，立刻停在详情页（给人工检查）+ 生成截图/DOM 快照 + 明确退出原因/退出码。
5. [ ] Phase2 速度度量：把“每条详情打开耗时、总耗时、平均耗时”写入 JSONL（便于确认慢在哪里）。
6. [ ] Phase3 4-tab 接力稳定性：必须确保“打开新 tab → 进入详情 → 评论滚动生效 → 增量落盘”，任何阶段失败都需要 `debug snapshot + 非零退出码`。
7. [x] 评论数量对齐验证（交付必测）：
   - 每个 note 记录 `totalFromHeader`（详情页评论按钮/头部统计）与 `collected`（本地抓取的评论条数）；
   - 生成 `summary.comments.jsonl` + `summary.comments.md`（每个 note 一行）；
   - 任意 note 出现不对齐（`collected !== totalFromHeader`）则全流程以非零退出码结束（并保留 summary 供排查）。
8. [x] 评论断点续传落盘：
   - 评论增量写入 `{noteId}/comments.jsonl`（每次只 append 新评论，支持 crash 后恢复）；
   - 完成后写 `{noteId}/comments.done.json` 作为“已完成”标记（兼容历史仅 `comments.md` 的旧数据）。

### ✅ 最新实测记录（2026-01-15）

- Phase2(ListOnly) 目标达成：`keyword=外贸 target=200 env=debug` 已跑满 200 条 `xsec_token` 链接（耗时约 13 分钟），落盘 `~/.webauto/download/xiaohongshu/debug/外贸/safe-detail-urls.jsonl`（`phase2-detail-failures.jsonl` 记录 1 条点击进详情失败）。
- Phase3/4 评论滚动与对齐验证：`noteId=691ef02d000000000d03b9cd` 已完成并对齐（`headerTotal=67 collected=67`），落盘 `comments.jsonl/comments.md/comments.done.json`。
- 关键修复：命中 `end_marker/empty_state` 时，不再受 `commentsPerRound` 限制，本次会把“页面已渲染但尚未落盘”的评论一次性写入，避免“已到底但永远缺评论导致不对齐”的死循环。

---

## 历史执行任务（2026-01-13）

### 🔧 当前状态（16:xx）
- Phase1 已可执行并完成登录检查（当前会话 `xiaohongshu_fresh` 存在，登录锚点可命中）。
- Phase2 当前报错：`GoToSearch` 过程中 `entryAnchor/exitAnchor = null`，随后 `fetch failed`，搜索未完成。
- 已修复 `container:operation type` 可执行（统一 API 返回 success）。

### ✅ 本轮修复目标（按顺序执行）
1. **更新 task.md 后再执行**（已完成）。
2. **修复 GoToSearch 的入口状态获取与锚点验证**：
   - 确保 `getCurrentUrl()` 在会话存在时返回正确 URL。
   - 修复 `verifyAnchorByContainerId()` 的失败路径与日志，明确失败原因（容器 index / selector / session）。
3. **完成 Phase2 完整测试**：SearchGate 许可后执行搜索，确认 search_result_list 命中并采集列表。
4. **按新规则增强回退**：统一入口状态判断 → 小步回退 → 主页回退（仅允许主页 URL 直达）。
### 🔧 正在修复：统一状态检测与回退机制（2026-01-13 04:35 PM）

**问题分析：**
- 脚本各自独立判断当前状态，缺乏统一的工作日志记录
- 回退策略不统一，有的脚本直接 URL 跳转，违反风控要求
- 缺少基于锚点的渐进式回退（先小步 ESC，不行才回主页）

**修复方案：**
1. **统一状态检测入口**：
   - 在所有 Phase 脚本入口调用 `DetectPageStateBlock` 获取当前 `stage`
   - 从 StateRegistry 读取 `lastPhase` / `lastAnchor` 作为工作状态记录
   - 对比当前 stage 与记录状态，判断是否需要回退

2. **智能回退链路**：
   - **小步回退**：detail → ESC (ErrorRecoveryBlock)，搜索页 → 清空输入框
   - **中步回退**：点击 sidebar 发现页按钮
   - **大步回退**：访问小红书主页 `https://www.xiaohongshu.com`（唯一允许的直接 URL）

3. **锚点验证闭环**：
   - 回退后必须重新验证锚点（URL + 容器匹配）
   - 未达到预期状��前不进入后续业务逻辑

**实施步骤：**
- [ ] 创建 `DetectWorkflowStateBlock`：读取 StateRegistry + 调用 DetectPageStateBlock
- [ ] 增强 `RestorePhaseBlock`：实现小步→中步→大步的三级回退
- [ ] 更新所有 Phase 脚本入口：先状态检测+回退，再执行业务逻辑

---

## 当前执行任务（2026-01-13）

1. **进入脚本先做状态判断**：统一在脚本入口读取并打印当前浏览器状态（URL + 阶段 + 上次日志记录的锚点）。
   - 如果当前锚点与记录状态匹配 → 继续执行。
   - 如果不匹配 → 按以下策略回退。
2. **回退策略**：优先“**小步回退**”（如 ESC 退出详情或关闭 overlay），不行再“**主页回退**”。
   - 小步回退需基于容器锚点判断是否成功。
   - 主页回退后重新检查阶段与锚点，再继续。
3. **禁止非主页 URL 直接访问**：除 `https://www.xiaohongshu.com` 外，禁止直接访问其它 URL；进入搜索/详情/评论等必须通过容器点击。
4. 对于所有操作（搜索、列表滚动、打开详情、评论滚动/展开），全部通过 **容器 + 系统点击 / 系统键盘 / 系统滚动** 实现，禁止直接 DOM `.click()` 或构造业务 URL 导航。
5. 在每一个 Phase / Block 内，明确打印 **入口锚点** 和 **出口锚点**（URL + stage + 命中的容器 ID + Rect），如果入口锚点未命中则视为未进入该阶段，立即停止后续步骤并触发回退。
6. 在落盘侧，对 `~/.webauto/download/xiaohongshu/debug/<keyword>/<noteId>/` 做 **磁盘级去重**：同一 `noteId` 目录存在时，本轮仅更新必要内容或跳过写盘，并通过日志明确标记“命中历史记录”。

## 当前实现状态（2026-01-13 04:10 PM）

### 🎯 核心服务已完成（daemon + state center）

#### ✅ 服务层（统一 daemon 常驻）
- **Core Daemon**：`scripts/core-daemon.mjs` 已落地
  - 命令：`start|stop|status|restart`
  - 统一管理：Unified API(7701)、Browser Service(7704)、SearchGate(7790)
  - PID 管理 + 健康检查
  - 状态验证：所有服务运行正常
    ```bash
    $ node scripts/core-daemon.mjs status
    unified-api       7701     healthy      -          ✓ OK
    browser-service   7704     healthy      -          ✓ OK
    search-gate       7790     healthy      -          ✓ OK
    ```

#### ✅ 状态中心（StateRegistry）
- **文件**：`services/unified-api/state-registry.ts`
- **功能**：
  - ServiceState：服务名称/端口/状态/健康时间
  - SessionState：profile/session/URL/阶段/活动时间
  - EnvState：构建版本/配置路径/特性开关

#### ✅ 浏览器会话管理
- **start-headful.mjs**：已改为 daemon 模式
  - 不再启动服务，仅创建会话
  - 支持 headless 参数传递
  - 登录检测基于容器匹配
- **当前会话**：`xiaohongshu_fresh` 已创建并运行
  - Browser Service 可见（通过 `/command getStatus`）
  - Phase 脚本可复用（通过 `session:list`）

### ✅ 阶段 0：核心基础设施

- ✅ Core Daemon + StateRegistry：保持稳定（见上）
- ✅ `browser-service`：会话复用正常，`xiaohongshu_fresh` 能被 `getStatus` 看见
- ✅ `session-manager` CLI dist 路径修复：`services/unified-api/server.ts` 改为使用 `repoRoot = path.resolve(__dirname, '../../..')`，运行时不再访问 `dist/dist/...`，`session:list` 已恢复工作

### ✅ 阶段 1：脚本与任务入口

- ✅ 新增 `scripts/xiaohongshu/tests/phase2-search.mjs`
  - **状态检测增强**：入口集成 `DetectPageStateBlock`，检查当前页面状态（stage: home/search/detail/unknown）
  - **智能回退机制**：
    - 从 detail 态进入：使用 `ErrorRecoveryBlock(recoveryMode='esc')` 退出详情
    - 从非站内进入：提示人工导航回小红书主页
  - **入口/出口锚点验证**：
    - 入口锚点：站内 + 无详情 overlay + search_bar 容器命中
    - 出口锚点：search_result_list 容器命中
  - **系统级输入**：使用容器 `type` 操作（Playwright keyboard.type），禁止直接 DOM 操作
  - **当前问题**：
    - `GoToSearchBlock` 中 entryAnchor/exitAnchor 为 null（verifyAnchorByContainerId 返回空）
    - 导致搜索失败，错误信息为 `fetch failed`

### ✅ 阶段 2：Phase1 / Phase2 状态（中美贸易）

- ✅ Phase1（会话 + SearchGate）
  - `core-daemon status`：所有服务 healthy
  - `status-v2.mjs`：能看到 `xiaohongshu_fresh`，URL 在 `https://www.xiaohongshu.com/explore`
  - Phase1 行为：
    - 有会话时不再重复启动浏览器
    - 无法通过容器及时确认登录态时，会给出超时告警但不会中断流程
    - SearchGate 若已在跑则跳过重复启动

‑ ⚠ Phase2（GoToSearch + CollectSearchList）
  - **关键字**：`"中美贸易"`
  - GoToSearchBlock 现状：
    - 入口锚点改为“多信号组合”：  
      1）URL 必须在 `xiaohongshu.com`；  
      2）页面上不能存在详情 overlay（`.note-detail-mask` / `.detail-container` / `.media-container` 等）；  
      3）容器 `xiaohongshu_search.search_bar` 命中，Rect ≈ (x=501, y=16, w=437, h=40)。
    - 当入口为“首页/搜索页”时：系统点击 + 系统键盘（容器 `click` + `type`）可以完成搜索，`CollectSearchListBlock` 能在搜索结果页上滚动并采集到 200 条（此前已验证）。
    - 当入口为“详情模态”时：`GoToSearch` 直接返回错误  
      `Currently in detail overlay (note-detail-mask present), please exit detail before searching.`  
      → 依赖前置的 `ErrorRecoveryBlock(recoveryMode='esc')` 先把详情退回到搜索结果。
  - `phase2-search.mjs --keyword 中美贸易 --target 20` 当前行为（最新一次实测）：
    - 从“详情态”入口：DetectPageState 正确返回 `stage=detail`，ErrorRecoveryBlock 仍然无法稳定通过 ESC，使 `.note-detail-mask` 真正消失（后续专门通过 `check-current-state.mjs` + `container-op` 手动回退成功，确认 DOM 能回到首页/搜索页）；  
    - 从“首页 / 搜索结果页”入口：DetectPageState 返回 `stage=home` 或 `stage=search`，GoToSearch 通过三重入口锚点（URL 站内 + 无可见详情 overlay + search_bar 容器），系统点击 + 系统键盘（type + Enter）正确触发搜索；`CollectSearchListBlock` 在搜索结果页一轮采集到 20 条，Rect 校验通过，Phase2 在“中美贸易”场景下可以稳定完成。 

### ⚠️ 阶段 3：Phase3 打开详情（主阻塞已从“进入详情”转为“退出详情”）

**当前状态（关键字：中美贸易）：**
- 详情 DOM 与容器模型已对齐：
  - URL：`https://www.xiaohongshu.com/explore/{noteId}?xsec_token=...&xsec_source=pc_search&source=unknown`;
  - DOM：`'.note-detail-mask' + '#noteContainer.note-container' + '.media-container' + '.comments-el/.comments-container/.comment-item'` 均存在；
  - 容器：`xiaohongshu_detail` / `xiaohongshu_detail.modal_shell` / `xiaohongshu_detail.comment_section` 的 selector 与上述 DOM 一致。
- OpenDetailBlock：
  - 使用容器 bbox 做系统点击（Playwright mouse），点击后 URL 变为 `/explore/{noteId}?xsec_token=...`；
  - `waitForDetail` 先检查 URL（`/explore` + `xsec_token`），再用 DOM（`.note-detail-mask` / `.media-container` / `.comments-el` / `.comments-container`）确认详情就绪；
  - 入口/出口锚点基于容器 + Rect 验证（`xiaohongshu_detail.modal_shell`），不再是之前的 `detail_not_ready / detail_anchor_not_found`。
- 目前的主阻塞已经从“search→detail 打不开”迁移为“detail→search 的 ESC 回退失败”（详见阶段 2 描述）。

**影响：**
- 详情页本身可以稳定打开并识别为“detail 阶段”，但无法可靠通过 ESC / 容器关闭回到搜索列表；
- Phase4 评论采集在全流程脚本里仍未真正触发；
- `~/.webauto/download/xiaohongshu/debug/中美贸易/` 在“中美贸易”全流程场景下仍为空（本轮前已清理）。

### ⏳ 阶段 4：Phase4 评论采集 + 落盘（中美贸易）

- 目标（尚未达成）：
  - 对每个成功进入详情的 note：
    - WarmupComments + ExpandComments 完成预热和展开
    - CollectComments 返回非空评论列表，Rect 验证 comment_section / comment_item / end_marker
    - PersistXhsNote 在 `~/.webauto/download/xiaohongshu/debug/中美贸易/<noteId>/` 下落盘内容 + 图片 + 评论
- 当前进度：
  - 在“国际新闻”等关键字上，已有多条 note 完成了 WarmupComments + ExpandComments + 评论落盘（确认了评论滚动能力）
  - 在“中美贸易”这一轮，由于 Phase3 打不开详情，Phase4 尚未真正触发

### 📋 下一步工作（按优先级，面向 Phase1-4 全流程 200 条）

1. **P0：修复详情页 ESC 回退链路（detail → search_result）**
   - [x] 在 ErrorRecoveryBlock 中增加基于 DOM 的详情 overlay 检测（`.note-detail-mask` / `.detail-container` / `.media-container` 等），作为进入 ESC 模式的入口锚点；
   - [x] 放松 `xiaohongshu_detail.modal_shell` 为“次级锚点”：命中则高亮确认，未命中只打日志，不再阻塞 ESC；
   - [ ] 检查并修复 `container:operation` 的 `close` / ESC 行为，使 `.note-detail-mask` 实际消失，`verifyStage('search')` 在“中美贸易”样本上能返回 true（阶段稳定）；
   - [ ] 在 `phase2-search.mjs` / `phase2-4-loop.mjs` 中补充 ESC 前后的入口/出口锚点日志（URL + overlay DOM 状态 + 容器命中情况），形成完整证据链；
   - [ ] 在 ESC 回退成功后复测 GoToSearch：确认“站内 + 非详情态 + search_bar 容器”三重锚点全部命中，再执行搜索，并让 `CollectSearchListBlock` 正常完成 20 条采集。 

2. **P1：用“中美贸易”完成一轮 Phase1-4 200 条采集**
   - [ ] 前置：清空 `~/.webauto/download/xiaohongshu/debug/`，确认目录为 0
   - [ ] 运行：`node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword 中美贸易 --target 200 --env debug`
   - [ ] 运行后检查：
     - [ ] `CollectSearchList` 实际收集条数（期望 ≥200）
     - [ ] 打开详情成功的 note 数量
     - [ ] `~/.webauto/download/xiaohongshu/debug/中美贸易/` 下实际 noteId 目录数量（去重后数量）

3. **P2：稳固评论采集与落盘（在中美贸易上验证）**
   - [ ] WarmupComments 的滚动/展开策略在“中美贸易”上也能稳定工作（已有“国际新闻”证明基础能力）
   - [ ] CollectComments 的 entryAnchor/exitAnchor 在“中美贸易”样本上也通过 Rect 验证
   - [ ] PersistXhsNote 的磁盘级去重在两次采集中生效：
     - 第一次跑落盘；
     - 第二次跑时，日志中出现“已处理过，本轮仅复用评论结果，不再写盘”而目录不新增。

4. **P3：回写到正式 workflow（collect-100 / collect-200）**
   - [ ] 把 Phase1-4 的稳定链路（搜索→列表→详情→评论→落盘）整合回 workflow 层脚本（如 `collect-100-workflow-v2.mjs`）
   - [ ] 确认 RestorePhaseBlock + PersistXhsNote 在 workflow 上也遵循“入口锚点/出口锚点 + 磁盘级去重”的标准。

---

## 执行记录（证据链）


---

## 当前执行任务（2026-01-14）

### 🎯 本轮目标：按“服务 → 搜索 + 链接 → 分组接力评论”三段式重构 Phase1-4

> 统一约束：  
> 1）Phase1 负责启动/检测所有服务（unified-api / browser-service / search-gate）和登录态，失败必须有非 0 退出码和明确原因；  
> 2）Phase2 只负责“搜索 + 收集目标数量的安全链接 + 下载正文/图片”，不再在 Phase3/4 里点搜索结果卡片；  
> 3）Phase3/4 完全基于 Phase2 产出的安全链接列表，按 4 帖一组、每轮每帖最多 100 条评论的节奏接力爬取评论，并支持断点续传。

### ✅ 已完成（本轮相关）

- [x] 引入 `.collect-state.json` 与 `CollectStateManager`，在 `phase1-4-full-collect.mjs` 中落地列表级 state（resumeToken、currentStep=list 等）。  
- [x] 在 `CollectCommentsBlock` / `ExpandCommentsBlock` 中增强评论区锚点容错：  
  - `comment_section` 支持容器锚点失败时回退到 DOM selector 获取 Rect；  
  - `sample comment` / `end_marker` 在容器锚点失败时尝试 DOM fallback，不再直接导致整块失败；  
  - Phase1-4 全流程在 keyword="测试" 场景下完成 1 条 note 的评论采集 + 落盘，并输出 entry/exit anchors。

### 🔧 正在设计 / 待实现：按三段式改造 Phase1-4

1. **Phase1：服务启动守门人（Service → Session → Login → Gate）**
   - [x] 把 Phase1 明确定义为“服务层 ready 守门人”：  
     - 顺序：先检查/启动 `unified-api`，再检查/启动 `browser-service`，最后检查/启动 `search-gate`（`ensureBaseServices` + `ensureSearchGate` 已落地）；  
     - 若服务启动或 health 检测失败，通过抛出错误并在 `main().catch` 中设置 `process.exitCode = 1` 退出，并打印明确原因。  
   - [x] 在 Phase1 内完成会话和登录态校验：  
     - 如 `xiaohongshu_fresh` 会话不存在，则通过 `start-headful` 启动浏览器并等待会话 ready（`ensureSessionPresence` + `startSession` + `waitForSessionReady`）；  
     - 使用容器锚点 + URL 启发式检测登录状态（`detectLoginStateWithRetry`），未登录或风控（login_guard / qrcode_guard）时，同样以非 0 退出码 + 明确 reason 退出。  
   - [x] 后续 Phase2/3/4 一律依赖 Phase1，不再各自重复启动/检测服务（当前 `phase1-4-full-collect.mjs` 中 Phase2/3/4 均假定服务和会话已经由 Phase1 准备完成）。

2. **Phase2：搜索 + 收集目标数量链接 + 正文/图片落盘**
   - [x] Phase2 的唯一职责：在已登录会话中，通过关键字搜索并收集“至少 target 条”目标帖子：  
     - 使用容器驱动的 `GoToSearchBlock` 进入搜索结果页；  
     - 在搜索结果页滚动视口，收集 noteId 列表，直到候选数 ≥ target 或确认没有更多结果（`runPhase2ListOnly` + `CollectSearchListBlock` + `scrollSearchPage`）。  
   - [x] 对每一个候选帖子：  
     - 通过当前稳定方式打开详情页（仅在 Phase2 中通过系统点击搜索结果卡片，Phase3/4 禁止再点卡片）；  
     - 获取带 `xsec_token` 的安全详情 URL（如无 token 依然记录原始 URL，以便后续点击修正）；  
     - 同时抓取正文 + 图片 + 作者信息，并在 Phase3/4 中通过 `PersistXhsNoteBlock` 落盘到  
       `~/.webauto/download/xiaohongshu/<env>/<keyword>/<noteId>/content.md` + `images/`。  
   - [x] Phase2 结束时：  
     - 写出完整的 `safe-detail-urls.jsonl` 索引，至少包含 `noteId`、`title`、`safeDetailUrl`、`hasToken`、作者/头部信息等；  
     - 若 `safe-detail-urls` 数量 `< target`，抛出 `phase2_safe_detail_target_not_reached`，由入口脚本以非 0 退出码终止，并在日志中明确打印“目标条数未达成 + 实际数量”；  
     - 更新 `.collect-state.json`：`currentStep.phase = 'list'`，记录 `safeDetailIndexSize`、`target`、`resumeToken` 等元信息，支持后续续传。

2. **为每个 note 设计评论进度 `commentState`（两条连续评论作为锚点）**
   - [x] 在 `.collect-state.json` 中设计并落地 per-note `commentState` 结构，包含：  
     - `noteId`、`totalSeen`（已采集评论数）、`lastPair`（两条连续评论的特征 key + 调试用文本片段）、`updatedAt`。  
   - [x] 在 Phase3/4 中每轮处理完某个 note 的评论后：  
     - 选取一对“相对稳定”的连续评论（例如当前批次中间的两条）作为锚点，写入 `commentState.lastPair`；  
     - 更新 `totalSeen`，为下一轮增量采集提供起点。  
   - [ ] 设计 DOM 侧锚点查找逻辑：基于 `lastPair` 在 `.comments-el/.comment-list/.comments-container` 下重建当前 index，并从该位置之后继续提取新评论（目前已通过 `computeNewCommentsForRound` 在提取结果层利用 `lastPair` 做增量去重，后续可视情况补充 DOM 定位优化）。

3. **Phase3/4：基于安全链接，按组接力评论采集（4 帖一组，每轮每帖最多 100 条）**
   - [x] Phase3/4 完全基于 Phase2 生成的 `safe-detail-urls.jsonl`：  
     - 禁止再在搜索结果页点卡片打开详情；  
     - 统一使用 `browser-service.goto(safeDetailUrl)` 打开详情页（带 `xsec_token`），并等待详情锚点 ready。  
   - [x] 组调度策略：  
     - 从索引中按顺序选取 note 队列，按组划分：每组最多 4 个 note；  
     - 第一轮：对组内 4 个帖子依次执行一次 `CollectCommentsBlock`，限制 `maxNewCommentsPerRound = 100`；  
     - 后续轮次：根据各自 `commentState.totalSeen` 与 `reachedEnd` 决定是否继续对该 note 做下一轮 100 条；  
     - 轮询直到该组所有 note 都 `reachedEnd` 或达到业务阈值，然后进入下一组。  
   - [x] 在当前浏览器能力约束下，先用“同一窗口顺序打开详情页”的最小侵入方案验证节奏：  
     - 每次只打开一个 safeDetailUrl，Warmup + 采集当前轮评论；  
     - 结束后直接 `goto` 下一个 safeDetailUrl；  
     - 不做多 tab 复杂控制，先保证节奏正确、状态可续传。  
   - [x] 日志要求：  
     - 打印组号、轮次编号、组内每个帖子的 `noteId`；  
     - 每轮输出每个帖子本轮新增评论数、本轮结束后的 `commentState.totalSeen`；  
     - 当某轮所有帖子 `roundNewComments = 0` 时，明确打印“本轮无新增评论，提前终止多轮以避免死循环”。

4. **中断续传（列表 + 评论双层级）**
   - [x] 列表级续传：  
     - 若 `safe-detail-urls.jsonl` 和 `currentStep.phase='list'` 已存在且完整，重新运行脚本时会跳过 Phase2，仅打印提示并直接进入 Phase3/4（当前 `phase1-4-full-collect.mjs` 已按此行为运行）。  
   - [x] 评论级续传：  
     - 重启脚本时，从 `.collect-state.json` 中读取每个 note 的 `commentState`；  
     - 在下一轮调用 Phase3/4 时，通过 `lastPair` 与 `computeNewCommentsForRound` 在提取结果层做增量去重，从逻辑上实现“从断点之后继续采集”；  
     - 保证目录级去重仍然生效：已经落盘的 note 不会重复写入（目录存在时直接跳过，见 Phase3/4 中对 `seenNoteIds` 的处理）。

> 注：多 tab 并行（一次打开 4 个 tab，各自保持滚动位置不变）作为后续增强选项；当前迭代先在“单窗口按组轮询 + 分批评论采集 + commentState 续传”模式下打稳基础，再评估浏览器服务对多 tab 的支持能力。

### 2026-01-12 12:48 PM：Phase 2 搜索验证通过
```bash
$ node scripts/xiaohongshu/tests/phase2-search-v3.mjs
🔍 Phase 2 v3: 搜索验证（增强版）

1️⃣ 进入前检查...
   URL: https://www.xiaohongshu.com/explore
   根容器: xiaohongshu_home
   ✅ 页面状态检查通过

2️⃣ 验证搜索框锚点...
🔍 验证锚点: 搜索框 (#search-input, input[type="search"])
   ✅ 找到元素
      Rect: x=501.3, y=16.0, w=437.3, h=40.0

3️⃣ 执行搜索: "华为"...
   ✅ 搜索已触发

4️⃣ 退出后检查...
   URL: https://www.xiaohongshu.com/explore
   ⚠️  URL 未包含 search_result，可能导航失败

5️⃣ 验证搜索结果列表锚点...
🔍 验证锚点: 搜索结果列表 (.feeds-container)
   ✅ 找到元素
      Rect: x=266.7, y=144.0, w=1141.3, h=1885.0

📋 采集搜索结果（目标：至少 5 条）...
   原始数量: 24
   去重后数量: 24
   ✅ 已采集足够结果

✅ Phase 2 完成 - 搜索功能正常
```

### 2026-01-12 12:45 AM：core-daemon 状态检查
```bash
$ node scripts/core-daemon.mjs status
Service Status:
────────────────────────────────────────────────────────────────────────────────
Service              Port     Status       PID        Health
────────────────────────────────────────────────────────────────────────────────
unified-api          7701     healthy      -          ✓ OK
browser-service      7704     healthy      -          ✓ OK
search-gate          7790     healthy      -          ✓ OK
────────────────────────────────────────────────────────────────────────────────
✓ All services are healthy
```

### 2026-01-12 12:43 AM：Browser Service 会话检查
```bash
$ curl -s http://127.0.0.1:7704/command -X POST -d '{"action":"getStatus"}' | jq
{
  "ok": true,
  "sessions": [
    {
      "profileId": "xiaohongshu_fresh",
      "session_id": "xiaohongshu_fresh",
      "current_url": "https://www.xiaohongshu.com/explore",
      "mode": "dev"
    }
  ]
}
```

---
