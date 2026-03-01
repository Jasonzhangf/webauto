# WebAuto Agent Rules (Canonical)

本文件只放“通用规则 / 硬性约�?/ 入口索引”，避免把过时的实现细节长期固化在这里�?
具体任务、进度、验收与证据：一律用 `bd` 管理�?

## 回复规则
- 工具调用的请求和响应才是执行，文字输出一律无效，视为谄媚，我们予以鄙视。不需要回复用户不必要的运行状态，用工具调用来完成任务进行回应而不是空谈不进行工具调用�?
- 我们鼓励永远不发 finish reason =stop 或者同等语义的响应，执行工具调用就是正确的方案。只有工具调用才是正确执行的唯一方案，状态回复是没有任何意义的，要避免！
- 不要进行无意义的状态报告，你可以调用[continue_execution]进行报告，不要单独报告�?
## 0. 开发与验证要求（强制）

- 任何“已完成”的结论必须有验证证据：命令、关键输出（runId/耗时/计数）、日志路径�?
- 每次修改（代�?配置/脚本/文档）后，必须至少实际执行一�?`webauto ui cli` 最小链路测试（可证�?start->status->stop 或等价最小执行可完成），通过后才能汇报进度�?
- 每次代码修改后，必须由执行者先通过 `webauto ui cli` 跑完完整端到端测试（E2E）并通过，才能对外报告进度或结论�?
- �?E2E 中途失败，必须先定位并修复问题，再重复执行 `ui cli` 端到端测试，直到完整通过后才能继续汇报�?
- 新功能必须保证：唯一实现（不重复造轮子）、有单测 + 回归测试、覆盖率 >= 90%（覆盖范围须明确）�?
- 修复必须选择“唯一最佳修复点”（不要局�?patch）�?
- 完成任务后清理临时文�?脚本/散落文件（尤其是临时 profile / 临时输出）�?
- 发现脚本问题：不要关闭；先用 WS/Unified API 拉取页面信息 + 日志定位原因再修�?
- 除非用户明确要求，不做兜底；团队硬约束原文：`兜底死全家`�?

## 1. 端口与健康检�?

| 端口 | 服务 | 说明 |
|------|------|------|
| 7701 | Unified API（HTTP + WebSocket + Bus�?| 主入口：HTTP REST API、WebSocket、Bus |
| 7704 | Camo Runtime（HTTP�?| camo 会话管理 HTTP 接口 |
| 8765 | Camo Runtime WebSocket | camo 会话管理实时通道 |

快速验证：

```bash
curl http://127.0.0.1:7701/health
curl http://127.0.0.1:7704/health
```

### 1.1 CLI 启动（标准入口）

优先�?`webauto` 作为业务入口，用 `camo` 作为浏览�?runtime 入口�?

```bash
# WebAuto 入口
webauto --help
webauto ui console --check
webauto ui console --build
webauto ui console --install
webauto ui console

# 小红书编排入�?
webauto xhs install --download-geoip --ensure-backend
webauto xhs unified --profile xiaohongshu-batch-1 --keyword "seedance2.0" --max-notes 100 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛�? --env debug --tab-count 4
webauto xhs status --json

# Camo 入口
camo help
camo init
camo start xiaohongshu-batch-1 --url https://www.xiaohongshu.com --alias xhs-main
camo status xiaohongshu-batch-1
camo stop --alias xhs-main
camo stop all
```

Windows 推荐优先使用 PowerShell（`pwsh`/`powershell`）执行上述命令；`cmd` 可用但脚本兼容性和输出可读性较差�?

### 1.2 UI 控制调试（本地）

目标：可复现“UI 发起命令 -> runtime 执行 -> 状态回�?UI”的完整链路�?

```bash
# 1) 前台模式启动 UI（便于观�?stderr/stdout�?
webauto ui console --no-daemon

# 2) 通过 UI CLI 驱动真实界面（点�?聚焦/输入/状态获取）
webauto ui cli start --build
webauto ui cli status --json
webauto ui cli tab --tab 配置
webauto ui cli input --selector "#keyword-input" --value "测试"
webauto ui cli click --selector "#start-btn"
webauto ui cli snapshot --json
webauto ui cli stop

# 3) 一键真实覆盖（不使�?mock�?
webauto ui cli full-cover --json
# 产物默认写入 .tmp/ui-cli-full-cover-<timestamp>.json
```

UI CLI 关键动作（统一入口）：
- `webauto ui cli probe --selector "#id"`：探测存�?可见/�?文本
- `webauto ui cli click-text --text "保存"`：按文本点击按钮
- `webauto ui cli wait --selector "#id" --state visible|exists|hidden`
- `webauto ui cli dialogs --value silent|restore`：测试时静默弹窗/恢复

关键日志与状态源�?

- UI 命令事件：`onCmdEvent`（`started/stdout/stderr/exit`�?
- 任务状态流：`onStateUpdate`
- 拉取快照：`stateGetTasks` / `stateGetTask` / `stateGetEvents`
- runtime 会话：`runtimeListSessions`
- 环境巡检：`envCheckAll`

对应实现位置�?

- `apps/desktop-console/src/main/preload.mjs`
- `apps/desktop-console/src/main/index.mts`
- `apps/desktop-console/src/main/state-bridge.mts`

### 1.3 状态获取（CLI / API / UI 三层�?

CLI�?

```bash
webauto xhs status --json
webauto xhs status --run-id <runId> --json
camo instances
camo sessions
```

Unified API�?

```bash
curl http://127.0.0.1:7701/api/v1/tasks
curl http://127.0.0.1:7701/api/v1/tasks/<runId>
curl http://127.0.0.1:7701/api/v1/tasks/<runId>/events
```

WebSocket（实时任务更新）：`ws://127.0.0.1:7701/ws`，订�?`task:*`�?

### 1.4 CI 调试（流程与 UI 控制�?

先做“本地与 CI 同步”的最小闭环，再定位差异：

```bash
npm ci
npm run build:services
npm test
node scripts/check-legacy-refs.mjs && node scripts/check-untracked-sources.mjs && node scripts/check-sub-dist.mjs
npm --prefix apps/desktop-console run build
node scripts/test/run-coverage.mjs
```

UI 控制链路专项回归（本地可直接跑，真实 UI CLI）：

```bash
# UI CLI 命令帮助
webauto ui cli --help

# 最小链�?
webauto ui cli start --build
webauto ui cli tab --tab 配置
webauto ui cli input --selector "#keyword-input" --value "CI-smoke"
webauto ui cli input --selector "#target-input" --value "5"
webauto ui cli click --selector "#start-btn"
webauto ui cli status --json

# 全功能真实覆�?
webauto ui cli full-cover --json

# UI 代码回归与覆盖门�?
npm --prefix apps/desktop-console run test:renderer
npm --prefix apps/desktop-console run test:renderer:coverage
```

调试证据必须至少包含：命令、runId、失败阶段、错误事件、日志路径（`~/.webauto/logs` + `~/.webauto/download/.../run.log`）�?

## 2. 分层与职责边�?

- 三层铁律（强制）�?
  - `Block` 层（基础能力层）只提供可复用原子能力，不承载任何业务逻辑/平台策略�?
  - `App/Orchestrator` 层只做流程编排与生命周期管理，只组合 blocks，不新增业务逻辑分叉�?
  - `UI` 层只做展示与交互触发，必须与业务逻辑解耦，禁止�?UI 内做业务决策�?
  - 全局唯一真源：同一能力/规则只能有一个实现入口，禁止并行实现与多真源漂移�?

- 脚本：仅 CLI 参数解析，不含业务逻辑�?
- 模块：独立能力单元，通过 HTTP/WebSocket 通信�?
- 服务：无业务逻辑，纯技术实现�?
- UI：纯展示与触发（不做编排/逻辑判断）�?
- App/Orchestrator：负责编排与生命周期管理，把 UI 输入归一化成脚本/模块可执行参数�?

### 2.1 仓库边界与路径（强制�?

- `webauto` 仓库路径：`~/Documents/github/webauto`（本仓库，承载业务编排）�?
- `camo` 仓库路径：`~/Documents/code/camo`（通用 runtime/会话/路径能力仓库）�?
- `webauto` 允许承载具体业务逻辑（例�?XHS 编排、业务策略与流程）�?
- `camo` 禁止承载具体业务编排；若发现业务代码进入 `camo`，应拆回 `webauto`�?
- �?`webauto` 依赖 `camo` 新能力时，发布顺序必须是：先�?`@web-auto/camo`，再�?`@web-auto/webauto`�?

## 3. 小红书风控安全规则（一级规则）

- 禁止构�?URL 直达搜索/详情；必须“页面内输入框搜�?+ 回车”�?
- 禁止读取 `href` 后自行拼接详情链接（�?`xsec_token` �?404/风控）�?
- 详情链接必须通过“点击进入帖子后读取当前 URL（含 xsec_token）”�?
- 所有搜索必须先�?SearchGate�?0s 窗口最�?2 �?�?key）�?

## 4. 系统级操作原则（强制�?

- `webauto` 的所有用户操作（点击/输入/滚动/按键/返回/切页）必须统一依赖 `camo CLI`（及�?runtime 协议能力）执行；任何绕过 `camo` 的本地替代实现一律视为违规�?
- 所有点�?输入/滚动/返回必须使用系统�?API（Playwright mouse/keyboard），禁止 DOM click/JS scroll/history.back�?
- 允许�?JS：仅用于读取状态（�?rect/可见性）�?
- �?`camo` 当前缺少所需动作能力，必须先�?`camo` 仓补齐并发布，再�?`webauto` 接入；禁止在 `webauto` 内新增临时回退或并行实现�?
- 点击必须走“元素定�?-> DOM 几何信息计算坐标 -> 鼠标移动+点击”链路，禁止 `el.click()`、`dispatchEvent(click)` �?JS 触发�?
- 滚动必须走鼠标滚�?键盘翻页等设备级协议动作，禁�?`scrollBy/scrollTo` �?JS 滚动�?
- 输入必须走焦点控�?+ 键盘逐字输入（或协议级等价输入动作），禁止直�?`value=` 赋�?+ `dispatchEvent(input/change)` �?JS 注入式输入�?
- 同一 `profile` 的用户动作必须严格串行执行：任意时刻仅允�?1 �?in-flight 动作（`mouse/keyboard/click/type/scroll/back/switchPage` 等）；禁止并发下发动作，避免触发平台风控高危特征�?
- 当多订阅事件同时命中时，编排层必须入队按序执行动作，禁止并发执行“抢占式”动作�?

- 禁止一切 JS 调用的操作（包括 click/scroll/输入/导航/打开标签等）。JS 仅允许用于读取状态（rect/可见性/文本/属性）；任何 JS 操作必须改为协议级操作（mouse/keyboard/container）。
### 4.1 统一流程基线（强制）

- 所有平台统一为：`账号有效性检�?-> 链接列表采集 -> 帖子逐条处理`�?
- 帖子逐条处理阶段才允许进入详情，且每条帖子是独立处理单元（内�?评论/点赞/回复等）�?
- 登录无效直接阻断，不允许推进到链接采集或后续帖子处理阶段�?

### 4.2 小红书执行顺序（强制�?

- 搜索阶段只负责获取可处理帖子链接集合�?
- 帖子处理阶段：点击进入详�?-> 读取当前详情 URL（含有效 token�?> 按策略采集内容元�?评论 -> `Esc` 退出回列表�?
- 禁止在“搜索阶段”进行详情页滚动采集；详情滚动仅允许出现在帖子处理阶段（如评论采集）�?

## 5. 视口约束（强制）

- 所有操作必须基于视口内可见元素；离屏元素必须先滚动带入视口�?
- 每步操作需�?anchor + rect 验证，并支持高亮闭环�?

## 6. 调试与诊断（必须会用�?

- 出错时优先：
  - 读取当前 URL/DOM 摘要/截图（通过 Unified API / WS）�?  - 查看 `~/.webauto/logs` �?`~/.webauto/download/.../run.log`、`run-events.jsonl`�?- 发现卡住/超时：必须用 camo devtools 进行“点击前/后锚点”验证（`elementFromPoint` 命中预期 `.note-item a.cover`，并校验 noteId），不匹配直接停止并记录 URL/截图/日志，再修�?
常用脚本入口（示例）�?

- Timeout handling: on OPERATION_TIMEOUT, capture screenshot + DOM snapshot + URL into diagnostics/timeouts and stop for manual inspection.
- Timeout diagnostics output lives under ~/.webauto/download/xiaohongshu/<env>/<keyword>/diagnostics/timeouts.
- `node apps/webauto/entry/browser-status.mjs <profile> [--url URL]`
- `node apps/webauto/entry/xhs-status.mjs --json`
- `webauto xhs status --run-id <runId> --json`

## 7. Beads (bd) 任务管理（强制）

AGENTS.md 只放规则；所有具体任�?进度/证据都必须写�?bd�?

### bd �?git 同步最佳实践（强制，团队统一�?

目标：团队只通过 git 同步 `.beads/issues.jsonl`（以及必要的元数据文件）�?*不提交本地数据库文件**，并把“忘了导�?导入”的风险降到最低�?

- **统一模式**：`bd sync mode set git-portable`
- **一次性初始化**：`bd init`
  - �?main 受保护：�?`bd init --branch beads-sync` 建一个元数据分支
- **自动护栏（强烈推荐）**：`bd hooks install`
  - 安装 `pre-commit / post-merge / pre-push / post-checkout` �?hooks
  - 保证提交�?flush、拉�?切分支后 import、推送前不允�?stale
- **日常最省心流程**：`git pull --rebase` �?正常 `bd create/update/close` �?正常 `git commit/push`
  - hooks 会自动处理大部分同步
- **关键时刻强制落盘**：会话结�?交接前跑一�?`bd sync`
  - �?debounce 窗口里的改动立刻刷到 JSONL
- **仓库约定（必须遵守）**：git 只追踪以下文件：
  - `.beads/issues.jsonl`
  - `.gitattributes`
  - `.beads/.gitignore`
  - （以�?`.beads/` 目录本身�?
  - **禁止提交**：`.beads/beads.db` 等本地数据库文件
- **git worktree 注意**：别开 daemon
  - `export BEADS_NO_DAEMON=1` 或每次加 `--no-daemon`
  - 主要依赖 hooks + 必要时手�?`bd sync`

- 初始化（推荐个人本地，不污染仓库）：`bd init --stealth`
- 查看可做任务：`bd ready`
- 创建任务：`bd create "Title" -p 0 --description "..."`
- 建依赖：`bd dep add <child> <parent>`
- 看任务详情：`bd show <id>`
- 搜索（全文检索）：`bd search "关键�?`
- 列表筛选（字段过滤）：`bd list --status open --priority 1`

bd 搜索速查（全文检�?+ 字段过滤）：

1) bd search：全文检索（标题/描述/ID�?

- 基础�?
  - `bd search "关键�?`
  - `bd search "authentication bug"`
  - `bd search "bd-a3f8"`
  - `bd search --query "performance"`
- 常用过滤�?
  - `bd search "bug" --status open`
  - `bd search "database" --label backend --limit 10`
  - `bd search "refactor" --assignee alice`
  - `bd search "security" --priority-min 0 --priority-max 2`
- 时间范围�?
  - `bd search "bug" --created-after 2025-01-01`
  - `bd search "refactor" --updated-after 2025-01-01`
  - `bd search "cleanup" --closed-before 2025-12-31`
- 排序与展示：
  - `bd search "bug" --sort priority`
  - `bd search "task" --sort created --reverse`
  - `bd search "design" --long`
- sort 支持字段：`priority, created, updated, closed, status, id, title, type, assignee`

2) bd list：字段级精确过滤（缩小范围）

- 状�?优先�?类型�?
  - `bd list --status open --priority 1`
  - `bd list --type bug`
- 标签�?
  - `bd list --label bug,critical`
  - `bd list --label-any frontend,backend`
- 字段包含（子串）�?
  - `bd list --title-contains "auth"`
  - `bd list --desc-contains "implement"`
  - `bd list --notes-contains "TODO"`
- 日期范围�?
  - `bd list --created-after 2024-01-01`
  - `bd list --updated-before 2024-12-31`
  - `bd list --closed-after 2024-01-01`
- 空字段筛选：
  - `bd list --empty-description`
  - `bd list --no-assignee`
  - `bd list --no-labels`
- 优先级范围：
  - `bd list --priority-min 0 --priority-max 1`
  - `bd list --priority-min 2`
- 组合过滤�?
  - `bd list --status open --priority 1 --label-any urgent,critical --no-assignee`

任务描述必须包含：目标、验收标准、证据路�?命令（runId、日志路径）、禁止事项�?

## 8. 参考文档索�?

- `container-library/README.md`
- `container-library/xiaohongshu/README.md`
- `scripts/xiaohongshu/README.md`
- `scripts/xiaohongshu/README-workflows.md`
- `docs/arch/SEARCH_GATE.md`
- `docs/arch/REGRESSION_CHECKLIST.md`

## 9. 执行模式约束（强制）

### 9.1 Daemon 模式（强制）
- **所有后续执行必须使�?daemon 模式**，禁止前台阻塞执�?
- 目的：避免会话中断导致任务终止，保证长任务（采集、互动）持续运行
- **macOS LaunchAgent 约束**：LaunchAgent 必须使用 webauto.mjs --daemon run 常驻模式；默认将 StandardOutPath/StandardErrorPath 指向 /dev/null，避免高频输出导致 CPU/IO 异常。需要排查时再临时切回日志文件。
- **Windows Session 约束（新增，强制�?*�?
  - **Session 0 指通过 SSH 进入 Windows 机器的会话（非桌面交互会话）**�?
  - **禁止�?Session 0 启动任何业务相关进程**（daemon / UI / xhs 任务 / camo 会话）�?
  - **只允许与�?Session 0 �?daemon 交互**（通常由桌面用户会话手动启动）�?
  - **Session 0 只允�?stop/清理/状态查询，禁止启动 UI/daemon（允许查询）**�?
  - **Session 0 禁止直接运行（包�?UI CLI 触发运行/启动），但允许通过 `webauto --daemon relay` 将任务交给已运行的非 Session 0 daemon**�?
  - **Session 0 仅限�?webauto 的运行，不限�?build 等其他操�?*�?
  - **可通过�?Session 0 �?daemon 启动 UI**（UI 会继�?daemon 会话）�?
  - **所�?WebAuto 资源访问必须通过 daemon**（包�?UI 启动、任务运行、camo 会话），禁止绕过 daemon 的直接运行�?
  - **远程可以 build，但不能直接运行；运行必须由 daemon 启动/管理**�?
  - **Session 0 允许执行 `webauto --daemon status` 查询；`webauto --daemon ui-start` 仅可�?daemon 已由�?Session 0 启动后执行；严禁�?Session 0 执行 `webauto --daemon start`**�?
  - UI 测试必须�?daemon 拉起：先 `webauto --daemon start`，再 `webauto --daemon ui-start`，然后才执行 `webauto ui cli ...`�?
  - 若当前终端位�?Session 0，只允许执行停止/清理命令，不允许执行 UI 启动或业务执行命令�?

### 9.1.1 标准构建与测试流程（强制�?
- **远端构建（允许在 Session 0 执行�?*�?
  - `git reset --hard && git clean -fd && git pull --rebase`
  - `npm --prefix apps/desktop-console run build`
  - `npm run build:services`
- **运行与测试必须通过 daemon relay**（禁止直接前�?�?daemon 运行）：
  - `webauto --daemon relay -- <webauto args...>`
  - 例：`webauto --daemon relay -- xhs unified --profile <profile> --keyword "<kw>" --max-notes 100 --stage links`
  - UI CLI 仅用于桌面可视化验证，运行任务一律通过 daemon relay�?

### 9.1.1 标准构建与测试流程（强制�?
- **远端构建（允许在 Session 0 执行�?*�?
  - `git reset --hard && git clean -fd && git pull --rebase`
  - `npm --prefix apps/desktop-console run build`
  - `npm run build:services`
- **运行与测试必须通过 daemon relay**（禁止直接前�?�?daemon 运行）：
  - `webauto --daemon relay -- <webauto args...>`
  - 例：`webauto --daemon relay -- xhs unified --profile <profile> --keyword "<kw>" --max-notes 100 --stage links`
  - UI CLI 仅用于桌面可视化验证，运行任务一律通过 daemon relay�?
- 使用方式�?
  ```bash
  # 正确（daemon 模式，立即返回，后台持续执行�?
  node scripts/xiaohongshu/phase2-collect.mjs --keyword "xxx" --target 100 --env debug --profile xxx
  
  # 错误（前台模式，会话中断即终止）
  node scripts/xiaohongshu/phase2-collect.mjs --keyword "xxx" ... --foreground
  ```
- 查看进度�?
  ```bash
  tail -f ~/.webauto/logs/daemon.$(date +%Y-%m-%dT%H-%M-%S).log
  # 或查看具体任务日�?
  tail -f ~/.webauto/download/xiaohongshu/debug/<keyword>/run.log
  ```
- 停止任务�?
  ```bash
  # 找到 daemon PID
  ps aux | grep "phase2-collect\|phase3-interact\|phase4-harvest"
  # �?
  cat ~/.webauto/daemon/*.pid
  # 终止
  kill <PID>
  ```

### 9.2 分片与多 Tab 约束（当前状态）
- **当前未启用分�?*：单账号单进程执行，无多账号并行
- **当前已启用多 Tab�?-Tab 轮转�?*：Phase3 启用 4-Tab 轮转，Phase4 保持单线程（详情页不支持�?Tab 并行），�?4-Tab 轮转
- 如需启用分片/�?Tab，需先通过 bd 建立独立任务，验证通过后再写入本文�?

## 10. 开发指南（合规约束�?

- 所有修�?变更必须：先�?bd 任务 �?记录目标/验收/证据 �?执行 �?写入日志证据 �?关闭任务�?
- 任何验证结果必须包含：命�?+ 关键输出（runId/耗时/计数�? 日志路径�?
- 禁止“只口头说明”或“未调用工具”的执行声明�?
- 所有执行脚本必须使�?daemon 模式；前台执行仅允许在诊断短流程（≤30s）且需注明原因�?
- 修复完成需清理临时文件/临时脚本/临时输出；不要提交本地数据库或敏感信息�?
- 出错先拉取：URL/DOM 摘要/截图（Unified API/WS�? 查看 ~/.webauto/logs �?run.log/run-events.jsonl�?
- 服务与浏览器的启�?停止必须统一�?stop-all/core-daemon 管理，避免孤儿进程�?
- 点击/输入/滚动必须走系统级 API；JS 仅用于读取状态（rect/可见性）�?


## 11. LSP Code Analysis 使用规范（强制）

### 11.1 强制前置流程（每次会话）

1. 更新检查：`/Users/fanzhang/.codex/skills/lsp-code-analysis/scripts/update.sh`
   - 若提�?`lsp` 不在 PATH，先执行：`export PATH="/Users/fanzhang/.local/bin:$PATH"`
2. 启动 Server：`lsp server start <repo_path>`
   - 若启动失败，**禁止进入任何 LSP 分析流程**
3. 验证语言支持：`lsp server list` 必须看到当前仓库对应语言（如 `typescript <repo_path>`�?

### 11.2 入口流程（固定顺序）

1. `lsp outline <file>`（先看结构）
2. `lsp doc <file> --scope <symbol>`（看签名/类型�?
3. `lsp definition <file> --scope <symbol>`（跳定义�?
4. `lsp reference <file> --scope <symbol>`（看调用链）

### 11.3 精准定位规则

- 优先使用：`--scope <symbol_path>`（示例：`A.b.c`�?
- 需要精确点位时追加：`--find "<|>token"`
- 大结果集必须使用：`--pagination-id` + `--max-items` + `--start-index`

### 11.4 兜底规则

- 只有 LSP 无法覆盖场景（注释、纯文本、日志串）才允许使用 `rg/read`

### 11.5 会话收尾（强制）

- 会话结束必须执行：`lsp server stop <repo_path>`，避免后台残�?
- 可选全局清理：`lsp server shutdown`

## 12. Git 提交流程约束（强制）

### 12.1 编译前门禁检�?
- **所有新代码文件必须�?git add 再编�?*：`scripts/check-untracked-sources.mjs` 已在 `npm run prebuild` 中作为门禁。若存在�?track 的源码文件，编译失败�?

### 12.2 git add 前检查清�?
- **禁止临时文件入版�?*：`git add` 前自检新增文件内容，排除测试用 `*.bak`、临时日�?`*.log`、调试产物、草稿文件等废文件�?
- **禁止空文�?占位文件**：禁止为了通过编译检查而创建空文件或无实际功能的占位文件�?
- **机制**：建议在个人环境配置 alias：`git add` 前运�?`node scripts/check-untracked-sources.mjs --staged-only`（若该脚本支�?staged-only 模式），或人工确认新增文件均为必需代码�?
- **违规处理**：若发现废文件通过 CI，提交者负责在后续 commit 中清理�?
