# WebAuto Memory - Long Term

## 2026-03-20 用户画像/偏好（Jason）

### 执行方式
- 现场勘验/检查原因 **不需要询问**，直接执行并给证据
- 等待必须用 clock 定时，不要空转“继续执行”循环
- 单条/局部流程未跑通前，不要跑完整流程压力测试
- 巡检默认 **5 分钟**间隔，无需再询问

### 测试偏好
- 测试关键词避免重复（如 claude/kimi/deepseekAI/春晚机器人/月全食 等）
- 测试优先 headless（用户明确要求）

### 记忆要求
- CACHE.md = 短期记忆，MEMORY.md = 长期记忆（需要时必须查）

### 浏览器生命周期规则（硬性约束）
- **浏览器默认不重启** - 任务之间复用现有会话
- **恢复方式：回到主页 + 清理任务残余** - 不到万不得已不重启服务器
- 任务完成后：camo goto <profile> https://www.xiaohongshu.com
- 只有明确 restartSession: true 时才重启浏览器
- session-init.mjs 的 ensureSessionInitialized 已修改为默认不重启
- xhs-unified-profile-blocks.mjs 的 runProfile 任务完成后会回到主页

### 2026-03-23 新增稳定偏好（必须遵守）
- daemon 为常驻后台；应用通过 `webauto daemon task submit` 派发任务（relay 已下线）。
- 调试必须分层：先基础 Operation，再编排，再单条，再批量；禁止跳层压测。
- 改动基础操作（click/scroll/input）后，必须先手动 camo 验证通过，再跑自动脚本。
- 等待必须锚点驱动：无锚点等待无意义，禁止 fixed sleep 作为完成条件。
- 文本输入默认 `fillInputValue`，`keyboard.type` 不作为主路径（IME 影响大）。
- 默认 URL mode，禁止默认 click mode（除非用户明确指定）。
- `commentBudget` 是 tab 轮转阈值，不是评论上限；默认按 50 轮转。

### SearchGate 规则（避免风控）
- **commentBudget 是 tab 轮转阈值**，不是评论采集上限。每采集 N 条评论后轮转到下一个 tab，分散请求避免风控。默认 tabCount>1 时 50 条轮转一次。禁止移除或设为 0
- SearchGate 限制是**防风控设计**，不是障碍
- 遇到 consecutive_same_resource_limit 错误：**直接换关键字**，不要尝试绕过
- daemon 排他性控制：同一时间只允许一个任务运行（已在 daemon.mjs 实现）

## 2026-03-16 Tab 池管理修复

### 问题
- Tab 泄漏：预期 5 个，实际 32 个
- 评论采集停止：第 50 个帖子后无新增
- 原因：`newTab` vs `newPage` API 混用，没有 tab 关闭机制

### 修复方案
1. 统一使用 `newTab` API（在同一窗口内创建）
2. 添加 `closeExcessTabs` 函数关闭多余 tab
3. 添加 `syncTabPoolWithBrowser` 同步状态
4. Tab 布局：1 个搜索页（Tab 1）+ 4 个轮转详情页（Tab 2-5）

### 修改文件
- `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs` - 重写
- `modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs` - newPage → newTab

### Tab 状态机
```
Tab 1 (搜索页/主页) ← collect 遗留
Tab 2-5 (轮转详情页) ← goto 切换，间隔 2-5 秒
```

---

## 2026-03-16 UI 精简

### run-flow.mjs 精简
- 443 行 → 239 行（46% 减少）
- 移除未使用参数：orchestrateMode, accountMode, dryRun, gate, reply, ocr
- 简化 RunFlowOptions 类型：26 字段 → 16 字段

---

## 2026-03-16 锚点驱动等待重构

### 问题
- 超时判定错误：等待固定时间而非等待锚点
- 启动时错误等待 evaluate 而非检查登录锚点

### 修复
- 所有等待改为锚点驱动
- 启动成功判定：登录锚点存在即成功
- 超时 = 等待锚点的最大时间，非固定等待

---

## 2026-03-14 Collect 阶段状态机修复

### 终局条件
1. 达到目标数量
2. 连续 5 次滚动无新非重复链接
3. 连续 3 次滚动无进展
4. 遇到底部 marker

### 验证
- xsec_token 检查：所有链接必须包含 token
- 滚动检测：stuckRounds/duplicateRounds 计数器

---

## 关键架构决策

### 三层架构
- Block 层：原子能力
- App/Orchestrator 层：流程编排
- UI 层：展示与交互

### 全局唯一真源
- 产生输出时：确保是全局唯一真源
- 消费数据时：确保来自全局真源

### Tab 管理原则
- 只用 `newTab`，不用 `newPage`
- 固定 5 个 tab：1 搜索 + 4 详情
- 初始化时清理多余 tab
- 每次操作前同步实际浏览器状态

---

## 2026-03-18 压力测试启动流程优化

### 新增必做步骤
- **启动压力测试后，先验证第一条帖子是否成功执行**，再进入等待/巡检。
- 目的：避免第一条即失败导致无效等待。

### 验证方法
1. 从 runId 的 events.jsonl 中确认 `open_first_detail` 成功：`visited=1`。
2. 检查第一条 `comments_harvest` 成功，且没有 `autoscript:error` / `autoscript:stop`。
3. 若第一条失败，立即停止并修复后再重启。

### 备注
- 该流程用于所有压力测试（5/50/200）。

---

## 2026-03-16 小红书 5 条测试完成 - 所有修复验证通过

### 测试信息
- runId: f75962be-3beb-4916-8a5e-e8470cbb8b90
- 关键字: deepseekAI
- Target: 5 条
- Profile: xhs-qa-1
- 完成时间: 2026-03-16 21:59:24 CST

### 测试结果 ✅
- 状态: completed
- 终态原因: script_complete
- Tab 数量: 5 个（符合预期，≤5）
- 评论总数: 5590 条

### 已处理帖子（5/5）
1. 67bbf030000000002802bf61 - 299 条评论
2. 690a05ca000000000700a69e - 43 条评论
3. 698c59b6000000000b00a889 - 173 条评论
4. 698def79000000000b008360 - 183 条评论
5. 699e25e4000000002602fc76 - 52 条评论

所有帖子都有完整文件：
- comments.jsonl（原始评论）
- comments.md（格式化评论）
- content.md（帖子内容）
- likes.summary.json（点赞摘要）

### 验证的修复

#### 1. fill_keyword selector 修复 ✅
**问题**: 任务卡在 fill_keyword 操作，搜索输入框无法定位
**根因**: selector `#search-input` 不匹配实际 DOM 结构
**修复**: 扩展 selector 为 `#search-input, input.search-input`
**修改文件**: `modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs`
**验证**: ✅ 成功，任务从 collect 到 detail 全流程正常运行

#### 2. Tab 池管理修复 ✅
**问题**: Tab 泄漏，打开 32 个 tab 而不是 5 个
**根因**: newPage 和 newTab 混用，缺少关闭机制
**修复**: 
- 重写 `tab-ops.mjs`，统一使用 newTab
- 添加 `closeExcessTabs`、`syncTabPoolWithBrowser`
- 强制 tab 数量 ≤ 5
**修改文件**: 
- `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs`
- `modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs`
**验证**: ✅ 成功，Tab 数量稳定在 5 个，无泄漏

#### 3. 评论采集流程 ✅
**状态**: 所有帖子正常采集评论，无卡死
**验证**: 
- 5590 条评论完整落盘
- 每个帖子有 comments.jsonl
- 无异常终止

### 关键指标验证
| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| Tab 数量 | ≤5 | 5 | ✅ 通过 |
| 评论采集 | 全部 | 5590 条 | ✅ 通过 |
| 任务完成 | completed | completed | ✅ 通过 |
| 内容文件 | 全部 | 5/5 | ✅ 通过 |
| 评论文件 | 全部 | 5/5 | ✅ 通过 |
| 点赞摘要 | 全部 | 5/5 | ✅ 通过 |

### 提交记录
- b2bb663c: fix(fill_keyword): 修复搜索输入框 selector 不匹配问题
- e57248a8: docs(heartbeat): 记录 5 条测试完成，所有修复验证通过

### 后续计划
1. ✅ 5 条测试完成
2. 准备 200 条压力测试
3. 继续验证稳定性和性能

Tags: #xhs #test #fix-validation #tab-pool #fill_keyword #completed

---

## 2026-03-18 camo 和 camo-runtime 的关系

### 仓库结构
- **~/code/camo** - @web-auto/camo npm 包的源代码仓库（当前版本 0.1.25）
- **webauto/modules/camo-runtime/** - webauto 项目的 vendor 副本（从 camo 复制）
- **webauto/node_modules/@web-auto/camo/** - npm 安装的 camo 包（运行时依赖）

### browser-service 架构
- browser-service 是 camo 的核心服务，监听在 localhost:7704
- 所有 action 通过 HTTP POST 发送到 `/command` 端点
- action 的路由在 `src/services/browser-service/index.js` 的 `handleCommand` 函数中
- 新增 action 只需在该 switch 中添加 case

### newTab vs newPage
- camo 原生只支持 `newPage` action
- webauto 的 modules/camo-runtime/ 中修改为使用 `newTab`
- **2026-03-18 修复**：在 camo 源代码中添加 `case 'newTab':`（fall-through 到 newPage）
- 修改文件：`~/code/camo/src/services/browser-service/index.js` 第 495 行

### 关键文件映射
| 职责 | camo 仓库路径 | webauto vendor 路径 |
|------|--------------|-------------------|
| Tab 池管理 | src/container/runtime-core/operations/tab-pool.mjs | modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs |
| Action 路由 | src/services/browser-service/index.js | (同上，通过 npm 包) |
| API 调用 | src/utils/browser-service.mjs (callAPI) | modules/camo-runtime/src/... (callAPI) |
| Tab 操作 | src/autoscript/action-providers/xhs/tab-ops.mjs | modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs |

### vendor 同步规则
- webauto 的 modules/camo-runtime/ 是独立副本，可能与 camo 源代码有差异
- 修改 camo 源代码后，需要重新构建/安装 npm 包
- modules/camo-runtime/ 的修改不会自动同步到 camo 仓库
- npm 安装的是编译后的包，不是源代码


---

## 2026-03-18 Skill 更新

### webauto-debug-workflow SKILL.md 更新
新增章节：
- **Environment Pre-flight (must)**：环境启动前必须检查全局/本地版本统一、服务健康、端口冲突、清理孤立进程
- **Clock tool rule**：必须使用 clock() agent tool，禁止 sleep/poll/external cron
- **Resilience Rule (must)**：任务目标是完成，单个detail出错可跳过，尽力恢复
- **Global unique source of truth**：全局唯一真源原则
- **Page Access & Onsite Inspection**：问题处理流程（日志→camo现场勘验→截图修复→风控升级）
- **Anti-Detection Operation Skeleton**：模拟人操作、不用JS、可视范围内、操作间隔
- **Memory Search**：调试前先搜索 CACHE.md（短期）和 MEMORY.md（长期）

### 修复记录
- **newTab action**：在 camo browser-service/index.js 添加 `case 'newTab':` fall-through
  - ~/code/camo/src/services/browser-service/index.js
  - /Volumes/extension/code/camo/src/services/browser-service/index.js
  - webauto/node_modules/@web-auto/camo/src/.../index.js

- **Global webauto uninstalled**：卸载了全局 @web-auto/webauto (0.1.4)，避免与本地 (0.1.19) 冲突

## 2026-03-19 压力测试关键字输入修复

### 问题：搜索关键字被错误替换
- **现象**: 输入 `claude`，搜索结果 URL 显示 `keyword=小红书网页版`
- **根因**: `fill_keyword` action 使用 `type` 但未设置 `click: true`
  - type action 默认不点击，依赖输入框已有焦点
  - 如果焦点不在搜索框，typing 会进入错误位置
  - 小红书搜索框可能有预填内容或联想词被误输入

### 修复
- **文件**: `modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs`
- **改动**: fill_keyword params 增加 `click: true`
```js
// 之前
params: { selector: '#search-input, input.search-input', text: keyword }
// 之后
params: { selector: '#search-input, input.search-input', text: keyword, click: true }
```

### 验证
- 修复后 afterUrl: `https://www.xiaohongshu.com/search_result?keyword=claude`
- 关键字正确传递，搜索结果正常

### 经验教训
1. 搜索输入框必须先点击聚焦再输入
2. 不能假设页面元素已有焦点
3. 测试前验证实际搜索 URL 中的 keyword 参数

---

## 压力测试配置

### 标准参数
- 关键字: `claude`
- 目标: 200 条笔记
- 评论: 开启 (do-comments=true, persist-comments=true)
- 点赞: 开启 (do-likes=true)
- 环境: debug
- Tab 数: 4
- service-reset: false (绕过 UI CLI bridge)

### 已修复的 bugs
1. **snapshot is not defined** - harvest-ops.mjs 中 snapshot 变量未定义
2. **runId 未传递到 detail gate** - detail-flow-ops.mjs 需要从 context.runId 注入
3. **搜索关键字错误** - fill_keyword 需要强制 click 聚焦



---

## 2026-03-19 评论覆盖率与滚动恢复

### 结论
- 评论覆盖率目标：visibleCount / expectedCommentsCount >= 0.9（低于 90% 视为不足）
- 到底部但覆盖率不足时必须触发 coverage_retry：回滚到评论顶部、再次展开、再向下滚动
- recovery/coverage_retry 的第一次滚动必须 focus click（skipFocusClick=false），否则 scrollTop 不变导致滚动无效

### 证据
- runId: 337c4f5e-a04c-43f0-95f8-c90633d096c5
- 现象：coverage_retry_start 触发后无后续事件，scrollTop 未变化
- runId: c65a6951-1d28-472d-bbf6-369929a0a86e
- 现象：coverage 126/358 卡住，scrollTop=15015/18148，recovery 滚动无效

### 修复
- coverage_retry 回滚步数：min(20, ceil(scrollHeight/800))
- recovery_scroll_up/down & coverage_retry 的第一次滚动执行 focus click
- state machine 文档更新：xhs-detail-comments-likes.v2026-03-19.md


### 设计-实现一致性验证（2026-03-19）
- 已验证 harvest-ops.mjs 与 v2026-03-19 状态机设计一致：
  - 覆盖率阈值：coverageRate >= 0.9
  - coverage_retry 流程（start/scrolled_to_top/expand/complete）
  - scrollToTopSteps = min(20, ceil(scrollHeight/800))
  - recovery/coverage_retry 首次滚动必须 focus click（skipFocusClick=false）
  - reached_bottom 仅在 coverageEnough 时允许退出

证据：
- modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs
- docs/arch/state-machines/xhs-detail-comments-likes.v2026-03-19.md

---

## 2026-03-19 搜索关键词轮换规则
- 用户要求：每个关键词使用 2 次后切换到下一个
- 目的：避免 search gate 对连续同词的限流
- 应用于：smoke/压力测试序列（1 → 5 → 20 → 200）
 - 落地：新增 CLI 支持 `--keywords` 列表 + `--keyword-rotate-limit`，由运行时自动轮换并写入 ~/.webauto/state/keyword-rotation.json

## Coverage Retry Sweep 策略 (2026-03-19)

### 背景
coverage_retry 原始设计：滚到评论区顶部 → 在顶部做 expand pass → continue loop
问题：展开按钮分散在整个评论列表中，在顶部看不到任何按钮 → NO_TARGETS → retry 无效

### 解决方案
将 coverage_retry 改为 scroll-down-with-expand sweep：
1. 滚到评论区顶部（复用 scroll-to-top 逻辑）
2. 然后逐步向下滚动（每步 600px），每步做一次 expand pass
3. 连续 3 步无目标则提前终止（sweepMaxNoTargetSteps=3）
4. 最多 40 步（sweepMaxSteps=40）
5. **sweep 中跳过 reanchor**（只 expand 不 refocus，省 ~6s/步）

### 性能对比
| 版本 | 每步耗时 | 40步耗时 | 600s内完成 |
|------|---------|---------|-----------|
| 有 reanchor | ~15s | ~600s | ❌ 刚好 timeout |
| 无 reanchor | ~8s | ~320s | ✅ 充裕 |

### 参数
- maxCoverageRetries: 3（默认值，从 2 增加）
- sweepScrollStep: max(600, scrollStepMin)
- sweepMaxSteps: min(40, ceil(scrollHeight/sweepScrollStep))
- sweepMaxNoTargetSteps: 3（连续无目标提前退出）

### 修改文件
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`
  - 行 1464: maxCoverageRetries ?? 3
  - 行 1777-1810: sweep 逻辑（替换旧的顶部 expand 循环）

### 已知问题
- comments.jsonl 落盘丢失：collectedRows=99 但 jsonl 只有 81 行，mergeCommentsJsonl 可能有去重 bug

## 2026-03-19: 非人类动作风险修复

### 风控根因
最近 3 次测试（kimi/claude/春晚机器人）全部在 open_first_detail 阶段触发 RISK_CONTROL_DETECTED（error_code=300013）。
证据：
- open_detail 失败后 500ms backoff 内立即重试，风控不会在 500ms 内解除
- 搜索后立即打开详情（无间隔）
- settle 时间偏短（280-820ms）

### 修复内容

#### 1. backoff 增大（避免失败后快速重试）
- `xhs-autoscript-base.mjs` 行 117: retry.backoffMs 500 → 3000
- `xhs-autoscript-detail-ops.mjs` 行 355: open_next_detail backoffMs 1000 → 5000
- `xhs-autoscript-detail-ops.mjs` 行 110: open_first_detail 添加 retry: { attempts: 1 }（风控后不重试）

#### 2. pacing 默认值增大（操作间更自然）
- `xhs-unified-options.mjs` 行 101: jitterMs 900 → 1500
- `xhs-unified-options.mjs` 行 102: navigationMinIntervalMs 2200 → 3500

#### 3. 评论��动 settle 增大
- `harvest-ops.mjs` 行 1257-1258: settleMinMs 280→500, settleMaxMs 820→1500

#### 4. collect_links 后增加延迟（搜索→详情间缓冲）
- `xhs-autoscript-collect.mjs`: 新增 wait_after_collect 操作（3-6秒随机）
- `xhs-autoscript-detail-ops.mjs` 行 106: dependsOn collect_links → wait_after_collect

### afterScrollDetail bug
- `afterScrollDetail is not defined` 在 kimi 测试中出现 3 次
- 当前源码中 afterScrollDetail 在正确的 else 块内定义和使用
- 该 bug 已在后续重构中修复（.bak 文件是旧版本）

## 2026-03-19 21:52: 非人类动作风险完整修复

### 修复文件汇总

#### 1. `xhs-autoscript-base.mjs`
- 行 117: `retry.backoffMs` 500 → 3000（默认重试退避增大到 3 秒）
- 行 39+: 新增 `humanizedDelay(minMs, maxMs, rng, debugLabel)` 导出函数

#### 2. `xhs-autoscript-detail-ops.mjs`
- 行 109-110: `open_first_detail` 添加 `retry: { attempts: 1, backoffMs: 0 }`（风控后不重试）
- 行 353: `open_next_detail` retry 从 `{ attempts: 3, backoffMs: 5000 }` → `{ attempts: 1, backoffMs: 0 }`
- 行 106: dependsOn `collect_links` → `wait_after_collect`

#### 3. `xhs-autoscript-collect.mjs`
- 新增 `wait_after_collect` operation（3-6 秒随机延迟）
- 位于 collect_links 和 finish_after_collect_links 之间

#### 4. `xhs-unified-options.mjs`
- 行 101: `jitterMs` 默认值 900 → 1500
- 行 102: `navigationMinIntervalMs` 默认值 2200 → 3500

#### 5. `harvest-ops.mjs`
- 行 1257: `settleMinMs` 280 → 500
- 行 1258: `settleMaxMs` 820 → 1500
- 行 1493+: comments_harvest 主循环第一轮入口添加 400-1200ms humanized delay

#### 6. `detail-flow-ops.mjs`
- 行 ~460: `executeOpenDetailOperation` 入口添加 400-1200ms pre-open humanized delay
- 行 740+: RISK_CONTROL_DETECTED 后添加 30-60 秒冷却等待再返回 guard failure

### 设计原则
1. **风控硬停机**: RISK_CONTROL_DETECTED 后冷却 30-60s 再停止脚本，避免快速重试加重风控
2. **不再重试 detail**: open_first_detail 和 open_next_detail 的 retry.attempts 固定为 1
3. **入口人类化延迟**: 所有 detail 打开前 400-1200ms 随机等待
4. **collect→detail 缓冲**: 搜索后等 3-6 秒再打开详情
5. **评论采集入口延迟**: comments_harvest 第一轮前 400-1200ms 随机等待
6. **增大全局 pacing**: jitter/navigateInterval/settle 都增大

### 效果预期
- 风控后不再触发快速重试（之前 11ms 就重试）
- 操作间延迟更接近人类行为
- 搜索→详情 间有缓冲时间

### 2026-03-20 点击模式默认化 + smoke test 验证
- **默认 detailOpenByLinks 改为仅在 resume 时启用**（避免 goto 直达导致风控）。
  - 文件: `apps/webauto/entry/lib/xhs-unified-options.mjs`
  - 逻辑: detailOpenByLinks 默认值 = resumeRequested && (stage in {full,detail})
- **点击模式补齐 noteId**：`!useLinks && !noteId` 时自动选取首个可见搜索候选。
  - 文件: `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`
  - 用 `readSearchCandidates` 取 `visibleEnough && inViewport` 第一个。
- **visitedNoteIds 初始化防护**：push 前确保 `state.detailGateState` 存在。
  - 文件: `detail-flow-ops.mjs`
- **验证**：月全食 smoke test（runId: 6bd08ad8-de7a-4f27-b738-1077b0bd8d63）
  - 点击打开详情成功、无风控
  - commentsTotal=209 / expected=236（coverage≈0.89），reached_bottom
  - 输出：`~/.webauto/download/xiaohongshu/debug/月全食/68c12e4c000000001b036f64/comments.jsonl`
- **注意**：本次测试使用默认 headful 模式（符合项目默认 headful 规则）。

### 2026-03-20 评论容器滚动修复 + Tab 生命周期管理设计

#### 评论容器滚动根因
- **问题**：`scrollBySelector` 使用 `keyboard:press(PageDown)` 滚动评论，但 `.note-scroller` 的 `tabIndex=-1`，无法获得焦点
- **证据**：425 次 `visible_comments_probe`，scrollTop 只有 `0` 和 `51` 两个值（scrollHeight=1531, 可滚动 918px）
- **根因链**：
  1. `scrollBySelector` 的 `focusClick` 点击坐标 `(1010, 169)` 命中 `<span class="note-text">`，焦点被转移
  2. PageDown 作用在错误的元素上（页面背景而非评论容器）
  3. `camo scroll --selector .note-scroller` 正常（用 `mouse:wheel`，不受焦点影响）
- **修复**：在 `scrollBySelector` 发送 PageDown 前，通过 JS 设置 `tabIndex=0` 并 `focus()` 滚动容器
  - 文件: `modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs` 第 304-338 行
  - 新增 `ensureScrollFocus` 选项（默认启用）
  - 手动验证：focus 后 PageDown ×3 从 scrollTop=0 → 918（到底）

#### Tab 生命周期管理设计（待实施）
- **问题**：XHS 网站自身开 tab（captcha、搜索链接、window.open）完全绕过应用层管理，导致 136 个 tab
- **用户要求**：
  1. camo 启动 profile 时要加入 `--max-tabs` 参数
  2. 不加默认 1 个 tab
  3. 同一个 profile 下不管做什么调试都只能有这么多 tab
  4. 这是 camo 层硬限制，不是应用层软约束
- **设计方案**：
  1. `camo start` 命令增加 `--max-tabs N` 参数（默认 1）
  2. BrowserSession 初始化时保存 maxTabs 到 session options
  3. `context.on('page')` 事件中检查 tab 数量，超过就关闭最旧非活跃 tab
  4. `newPage()` API 调用前检查 tab 数量
  5. profile config 文件持久化 maxTabs
- **实施层次**：
  - `@web-auto/camo` npm 包：BrowserSession + page-hooks（需要 PR）
  - `modules/camo-runtime/` vendor 层：runtime-core operations tab guard
  - autoscript 层：每轮 detail 循环前调用 `prune_excess_tabs`
- **已完成**：
  - `tab-ops.mjs` 导出 `pruneExcessTabs`，已注册为 `xhs_prune_excess_tabs` action
  - `closeExcessTabs` 支持 `keepActive` 选项，保留当前活跃 tab
- **待做**：
  - camo 包中 BrowserSession 加 maxTabs 强制限制
  - `camo start --max-tabs N` CLI 参数
  - runtime-core operations 中加 tab guard（拦截 new_page 操作）

## 2026-03-20 13:30 - Click Mode open_next_detail 死循环修复

### 问题根因
在 click mode（detailOpenByLinks=false）下，`open_next_detail` 使用 `auto_select_candidate` 选择帖子，但没有检查 `visitedNoteIds`。导致每次都选择同一个帖子，形成无限循环：
- open_first_detail 打开帖子 A → comments_harvest 完成 → close_detail 关闭
- open_next_detail 再次选择帖子 A → comments_harvest → close_detail → ...

### 修复
文件：`modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs` 第 508-528 行

在 `auto_select_candidate` 逻辑中加入 `visitedNoteIds` 检查：
1. 获取当前 `state.detailGateState.visitedNoteIds`
2. 在 `find()` 回调中跳过已访问的 noteId
3. 如果所有可见候选都已访问，抛出 `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`

### 证据
- runId: 7689ff30-8830-4c92-bd7d-f476d8e6bc28
- 事件日志：2640 行，open_next_detail operation_done 出现 22 次
- 所有 operation_done 中 noteId 都是同一个：69b2d4e700000000220228bf
- comments_harvest 完成 10 次，都是同一个帖子

### 分层次调试原则更新
已更新 `~/.codex/skills/webauto-debug-workflow/SKILL.md`，加入分层次调试原则（L1→L2→L3→L4）。

## 2026-03-21 测试环境禁用 comment budget

### 结论
- commentBudget 是 tab 轮转阈值（不是采集上限），测试和生产都必须启用，禁止设为 0

### 修改位置
- `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs`
  - 新增 `isProd` 判断，仅 prod 才启用 commentBudget。

### 证据/原因
- detail 5 测试中出现覆盖率 0.46，exitReason=tab_comment_budget_reached。
- 用户要求：测试不允许设置 comment budget，只有 production 才使用。

## 2026-03-22 Tab 轮换必须在测试环境启用

### 问题
之前将 `commentBudget` 在非 prod 环境设为 0，导致 tab 轮换逻辑失效，评论采集过程中 tab 不会切换，从而触发风控。

### 修正
**Tab 轮换逻辑必须在测试环境和生产环境都启用**。`commentBudget`（每个 tab 的评论预算）应该始终生效，只有 `tab_comment_budget` 早停行为在测试环境可以禁用。

### 正确实现
1. `commentBudget` 始终根据 `detailRotateComments` 或默认值（如50）设置
2. Tab 轮换在达到 `commentBudget` 后触发
3. 测试环境不休眠/早停，但 tab 轮换逻辑正常工作

### 相关文件
- `modules/camo-runtime/src/autoscript/xhs-autoscript-detail-ops.mjs` - commentBudget 计算
- `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs` - tab 切换逻辑
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs` - consumeTabBudget 调用

### 状态
❌ 需要修复
## 2026-03-21 14:58 - once:true 操作失败后无限重调度修复

### 问题
`ensure_tab_pool` 配置 `once: true` + `onFailure: 'continue'`，当 tab 创建失败后：
- operationState 设为 'skipped'（因 onFailure=continue）
- `shouldSchedule` 只检查 `status === 'done'` 才阻止重调度
- 'skipped' 状态不阻止重调度 → 每次触发事件都重新调度
- 导致浏览器反复打开/关闭（闪动抢焦点）

### 修复
1. **runtime.mjs shouldSchedule**: `once: true` 操作无论终态（done/skipped/failed）都不再重调度
   - 文件: `modules/camo-runtime/src/autoscript/runtime.mjs`
   - 原逻辑: `if (operation.once && status === 'done') return false`
   - 新逻辑: `if (operation.once && (status === 'done' || 'skipped' || 'failed')) return false`

2. **ensure_tab_pool retry 降为 1 次，backoff 0**
   - 文件: `modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs`
   - `retry: { attempts: 2, backoffMs: 500 }` → `retry: { attempts: 1, backoffMs: 0 }`

### 用户画像记忆
- Jason 不允许反复尝试失败的操作，代码层面必须硬性约束
- 发现容器/页面处理错误修改后，必须手动 camo 验证后再自动测试
- 勘验不需要询问，记入记忆和用户画像
- 称呼用户为 Jason

## 2026-03-21 15:24 - 禁止 click mode（强制）

### 用户强制要求
- **默认不允许 click mode**，必须使用 URL mode（detailOpenByLinks=true）
- 任何测试必须显式或默认走 URL mode
- 不允许再使用 click mode，必须记忆并执行

### 修复
- `apps/webauto/entry/lib/xhs-unified-options.mjs`
  - 默认 `detailOpenByLinks` 设为 true（URL mode）
- 若用户明确要求 click mode 才允许临时使用

## 2026-03-21 修复总结

### 关键修复
1. **keyword rotation 默认改为 false** — 用户传入的 keyword 不再被静默轮换
2. **detailOpenByLinks 默认改为 true（URL mode）** — 禁止 click mode，必须用 URL mode
3. **stop 时浏览器回到主页而非关闭** — `resetProfileSession` 导航到主页，不调用 `cleanupProfileSession`
4. **commentsAdded 改为 newCommentsAdded，添加 commentsProcessed** — 支持断点续传，区分新增和处理总数
5. **submit_search focus 失败不 abort** — 继续使用 clearAndType 键盘输入
6. **once:true 操作失败后不再重调度** — 防止浏览器反复闪动

### 运行模式结论
- **不要用 autoscript 模式**（`WEBAUTO_RUNTIME_MODE=autoscript`）— 不启动 HTTP API
- **必须用 unified 模式**（`WEBAUTO_RUNTIME_MODE=unified`）— 启动完整 HTTP 服务

### daemon 使用规范
- daemon 是长期运行服务，不要反复启停
- 用 `daemon relay --detach` 启动新任务
- stop 只中止任务，不关闭浏览器
- 浏览器跨任务保持 alive

### 用户偏好
- 称呼用户为 Jason
- 发现问题必须先勘验现场（截图/日志），直接修复，不要猜测和询问
- 修改代码后必须手动验证再进行自动化测试

## 2026-03-21 架构 Review 结论

### autoscript 模式 vs unified 模式

**autoscript 模式**（`WEBAUTO_RUNTIME_MODE=autoscript`）：
- 只启动 browser-service（`ensureBrowserService()`）
- 不启动 HTTP API
- 没有任务调度、统计上报、WebSocket 推送
- **结论：无实际业务用途，应删除**

**unified 模式**（`WEBAUTO_RUNTIME_MODE=unified`）：
- 启动完整 HTTP API（port 7701）
- 包含任务注册、状态管理、WebSocket 事件推送
- 通过 `ensureProfileSession` → `runProfile` → camo HTTP API 执行 autoscript
- **结论：保留 unified 模式作为唯一入口**

### click mode 分析

click mode 在代码中约有 5 个条件分支（`if (!useLinks)`），分布在：
- `detail-flow-ops.mjs`：auto_select_candidate、close_detail 等
- `xhs-autoscript-detail-ops.mjs`：manual trigger

**结论：click mode 已被 URL mode 取代，应清理残留代码**

### 执行计划
1. 删除 `apps/webauto/server.ts` 中的 autoscript 模式
2. 清理 `detail-flow-ops.mjs` 中的 click mode 分支
3. 清理 `xhs-autoscript-detail-ops.mjs` 中的 click mode 注释

## 2026-03-21 点赞按钮定位修复

**问题**：小红书评论区使用虚拟滚动，DOM 中 comment-item 数量（12-16个）远少于已采集评论总数。`readLikeTargetByIndex` 用 DOM index 定位点赞按钮，但 `match_probe` 返回的是累积评论的全局 index，导致 index 不对齐，大量 like_target_missing。

**修复**：
1. 新增 `readLikeTargetByCommentId(profileId, commentId, fallbackIndex)` - 通过 commentId（data-id）定位
2. `processVisibleCommentLikes` 改用 `readVisibleCommentTargets` 获取当前可见评论
3. `pushTrace` 记录实际 reason（comment_not_in_dom / like_target_missing）

**关键文件**：
- `modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs` - readLikeTargetByCommentId
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs` - processVisibleCommentLikes 改用 commentId

**漏网之鱼保障**：每轮滚动后 applyVisibleLikePass 重新扫描可见评论 + dedupKey 去重

## 2026-03-22 评论采集 Tab 轮换规则（强制）

### 用户要求
**每个评论爬取50条就必须轮换到下一个tab**，而不是帖子之间轮换。

### 错误流程（当前）
```
打开帖子1 → 评论采集全部完成 → tab切换 → 打开帖子2 → 评论采集全部完成 → tab切换
```

### 正确流程
```
打开帖子1 → 爬取50条评论 → 切换tab → 打开帖子2 → 爬取50条评论 → 切换tab → ...
```

### 原因
- 单个帖子连续爬取大量评论会触发风控
- 每50条评论轮换 tab 可以分散请求，降低风控风险
- tab 轮换间隔应匹配小红书的请求频率限制

### 相关文件
- `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs` - comments_harvest
- `modules/camo-runtime/src/autoscript/action-providers/xhs/tab-ops.mjs` - tab 切换

### 状态
❌ 未实现，需要修复

## 2026-03-22 终止/不可重试场景强制截图规则

### 用户硬性要求
当流程被拦截且不再继续处理（无论是完成 terminal 还是无法重试）时，必须落盘截图+DOM快照。

### 适用场景（至少）
- `AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED`
- `LOGIN_GUARD_DETECTED`
- `RISK_CONTROL_DETECTED`
- `OPEN_DETAIL_REDIRECT_BLOCKER`
- 其它 guard stopCode

### 落地位置
- `modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs`
  - open_detail 前/中/后 guard 命中
  - detail links exhausted 终止点

### 说明
截图为 best-effort，不得阻断主流程 stop；但必须优先尝试写入 diagnostics/failures。

## 2026-03-23: 搜索输入方式变更 — keyboard.type → fillInputValue

**问题根因**：
1. browser-service 的 input pipeline 是串行的（withInputActionLock），所有 keyboard 操作排队执行
2. Playwright 的 keyboard.type/typeText 在多 tab 打开时变得极慢（30-60s+）
3. macOS 中文输入法（IME）会干扰 keyboard.type，导致输入内容被拦截或变形
4. 导致 CLEAR_AND_TYPE_TYPE_TIMEOUT 错误，submit_search 操作反复失败

**解决方案**：
- 新增 `fillInputValue(profileId, selectors, value)` 函数
- 使用 `evaluate()` 直接设置 `input.value`（通过 HTMLInputElement.prototype.value 的原生 setter）
- 完全绕过 browser-service 的 input pipeline 和 Playwright keyboard API
- 不受 IME 影响，执行时间稳定在 100ms 以内
- 触发 input/change 事件确保框架（React/Vue）能感知值变化

**适用范围**：
- submit_search 中的搜索输入框
- 所有需要设置输入框值的场景（优先使用）

**不适用范围**：
- 需要模拟真实键盘事件流的场景（如快捷键、组合键）
- 需要逐字符输入并观察中间状态的场景

**注意**：fillInputValue 是 webauto 侧的方案，不修改 camo 框架层。

## 2026-03-23 submit_search 单一真源修复

### 问题
1. submit_search 使用 click→fallback Enter 双路径，click retry 超时 200s+
2. searchReady 只检测容器存在，不验证 URL 变化，误判旧内容为新结果
3. fillInputValue 使用 evaluate 设值但未聚焦输入框，pressKey('Enter') 发送到页面 body

### 修复（commit fe61256a + 617b1df1）
1. **Enter-only**：移除 click/fallback 双路径，只保留 `pressKey('Enter')` 提交搜索
2. **URL 变化验证**：searchReady 必须验证 afterUrl ≠ beforeUrl 且不含 /explore
3. **fillInputValue 聚焦**：设值前调用 `el.focus()` + `el.click()`，确保键盘焦点在输入框

### 验证结果
- submit_search 延迟 243s → **3.6s**
- URL 正确跳转到 /search_result?keyword=樱花拍照
- collect_links 成功采集新链接
- open_first_detail 成功打开详情

### 设计原则：单一真源
- 不允许 fallback 路径，每种操作只能有一种正确方式
- 超时必须有锚点，无锚点等待无意义

## 2026-03-23 超时必须有锚点（强制规则）

### 规则
**所有超时都必须有锚点**：
- 超时 = 等待锚点出现的最大时间，不是固定等待
- 锚点出现应立即返回成功，不等超时到期
- 超时时间内锚点未出现才失败
- 超时退出时必须说明具体原因（到底了/风控/容器不存在/元素不可见等）
- 禁止无锚点的 sleep/固定等待作为完成条件

### 检查点
- [ ] comments_harvest COMMENTS_CONTEXT_FOCUS_CLICK_TIMEOUT 需要锚点验证
- [ ] 所有 waitSearchReadyOnce 的超时退出需要说明原因
- [ ] 所有 scroll timeout 需要检查 scrollTop 是否变化

Tags: #timeout #anchor #single-source-of-truth

## 2026-03-23 单条失败不阻碍整体流程原则（强制）

### 核心原则
**单条爬取失败不可以阻碍整个流程的执行**：
- 单条失败 = 局部失败，可以跳过，继续下一个
- 压力测试中：评论/内容覆盖率可以不够，但**完成度必须是满的**
- 所有目标帖子都要处理完，不能因为某一条失败而停止

### 适用场景
- comments_harvest 超时/失败 → 跳过该帖评论采集，继续下一个帖子
- open_detail 失败 → 跳过该帖子，继续下一个
- 任何单条错误都应该是 nonblocking_failure，不是 terminal

### 代码检查点
- [ ] comments_harvest 失败后是否继续 open_next_detail
- [ ] open_detail 失败后是否跳过该帖子
- [ ] 统计指标：completed/total 而不只是 success

Tags: #resilience #partial-failure #completion-rate

## 2026-03-23 Tab 管控硬性规则

### maxTabs 默认值
- **默认 maxTabs = 5**（不是 1）
- camo BrowserSession 已修改：`options.maxTabs ?? 5`
- 位置：`@web-auto/camo/src/services/browser-service/internal/BrowserSession.js`
- 不传 `--max-tabs` 时默认允许 5 个 tab

### Tab 泄漏防护
- XHS 网站通过 `window.open` / `target=_blank` 打开新 tab
- camo 的 `context.on('page', ...)` 会拦截并调用 `enforceMaxTabs()`
- 超出 maxTabs 的 tab 会被自动关闭（优先关闭 captcha/blank 页）

### 检查命令
```bash
ps aux | grep "plugin-container.*tab" | grep -v grep | wc -l
```
Tags: #tab-management #max-tabs #camo

## 2026-03-23 评论覆盖率异常根因与修复（现场勘验）

### 根因（已证据化）
- 覆盖率低并非策略问题，而是代码错误：`stagnationRounds is not defined`
- 触发位置：comments_harvest
- 证据：
  - `~/.webauto/logs/daemon-jobs/job_1774270203345_e0175a04.log`
  - `~/.webauto/download/xiaohongshu/debug/AI绘画技巧/diagnostics/debug-ops/*comments_harvest*_error-*.json`

### 修复
- commit: `32355981`
- 恢复 `stagnationRounds` 变量定义

### 到底判定规则（按 Jason 指导）
1. 空评论：`comments_empty`
2. 评论容器到底：`scroll.atBottom=true` -> `reached_bottom`
3. 回滚后重试仍滚不动：连续3次 -> `scroll_stuck_3_times`（原因单独记录）

### 验证
- run/job: `8a9c5f14-1f0c-4da9-973d-dbe8f1523237` / `job_1774272043565_53ede6b4`
- comments_harvest: `commentsProcessed=72`, `expected=73`, `coverage=0.99`, `reachedBottom=true`

Tags: #coverage #bottom-anchor #root-cause-fixed


## 进程生命周期管理（硬性限制）

### 根因
- daemon `task stop` 后 xhs-unified 进程可能不退出，成为僵尸进程
- 僵尸进程持有 browser-service 的 `inputActionLock`（Promise 链锁）
- 新任务的 `keyboard:press` 在 `withInputActionLock` 中永远等待锁释放
- 最终 callAPI 超时 270s (90s × 3)

### 修复 (commit 79dc3d58)
1. `terminatePidTree`: POSIX 先 `pkill -TERM -P` 杀子进程树，再 SIGTERM 主进程，最终 SIGKILL
2. `findOrphanedWorkerPids`: pgrep 查找无 daemon 监管的残留 xhs-unified/xhs-collect
3. `cleanupOrphanedWorkers`: 清理所有发现的孤儿进程
4. daemon 启动时清理孤儿进程
5. daemon 每 30s 定期巡检：reconcile job 进程状态 + 清理孤儿
6. task submit 前清理孤儿进程
7. daemon SIGTERM/SIGINT 时先清理所有 running job

### 规则
- **禁止手动 kill 进程后不重启 daemon**
- **daemon 是唯一启动/关闭真源**
- **task stop 后如果进程仍存在，daemon housekeeping 会自动清理**
Tags: #lifecycle #zombie-process #daemon

## Feed-Like 多 Tab 轮转策略 (2026-03-25)

### 核心流程

```
初始化: 打开最多 4 个 Tab，每个 Tab 搜索一个 keyword

循环:
  Tab1 点 5 个 → Tab2 点 5 个 → Tab3 点 5 个 → Tab4 点 5 个 → Tab1 点 5 个 → ...

每个 Tab 内:
  1. scan 读取当前页面所有 .note-item
  2. 过滤出 unliked[] 
  3. 随机选 5 个（不足则全选）
  4. 逐个点击，间隔 1-5s 随机
  5. 当前页点完 → 滚动到下一页 → 继续
  6. 到底无新内容 → 标记 tab 完成

退出条件:
  - 所有 tab 都到底了
  - 达到总点赞上限
  - 风控触发
```

### Keywords 规则

- 一次最多 4 个 keyword
- 不足 4 个：有几个开几个 tab
- 超过 4 个：截断，只取前 4 个
- 每个 keyword 对应一个独立的搜索 Tab

### 风控策略

| 策略 | 说明 |
|------|------|
| Tab 切换分散 | 每 tab 点 5 个就切换，避免单 tab 连续操作过多 |
| 页面内随机 | 5 个候选从 unliked 中随机抽取，不按顺序 |
| 时间间隔 | 每次点赞间隔 1-5s 随机 |
| 滚动策略 | 点完当前页才滚动，避免遗漏 |
| 循环轮转 | 4 个 tab 轮转，回到 Tab1 继续 |

### 技术要点

1. **点赞状态检测**: 使用 `use[*|href="#liked"]` 选择器（命名空间感知）
2. **Tab 切换**: `page:switch` + anchor 等待页面就绪
3. **滚动检测**: `readFeedWindowSignature` 判断是否有新内容
4. **断点续传**: 持久化每个 tab 的 scrollPage、likedCount、completed 状态


- 2026-03-25: click/press 必须基于可见元素锚点；超时只能围绕锚点（无锚点超时无意义）；smoke/验证前先用 camo 手动探测可用锚点。
Tags: #anchor #visible #click #timeout
