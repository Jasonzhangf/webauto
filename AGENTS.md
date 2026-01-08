# WebAuto 架构设计原则与模块职责

## 统一端口

| 端口 | 服务 | 说明 |
|------|------|------|
| 7701 | Unified API（HTTP + WebSocket + Bus） | 主入口：HTTP REST API、WebSocket 实时通信、Bus 事件总线 |
| 7704 | Browser Service（HTTP） | 会话管理 HTTP 接口 |
| 8765 | Browser Service WebSocket | 会话管理实时通信通道 |

## 启动方式

- 唯一脚本：`node scripts/start-headful.mjs`
- 业务逻辑：`launcher/headful-launcher.mjs`

## 模块职责

- 脚本：CLI 参数解析，不含业务 logic
- 模块：独立 CLI，通过 HTTP/WebSocket 通信
- 服务：无业务 logic，纯技术实现
- UI：状态展示，无业务 logic

## 快速验证

```bash
# 统一健康检查
curl http://127.0.0.1:7701/health

# 浏览器服务健康
curl http://127.0.0.1:7704/health
```

---

## Agent 调试工具与能力

- **浏览器 CLI / WebSocket 控制**：复用 `xiaohongshu_fresh` profile，通过 Unified API `POST /v1/controller/action` 的 `browser:*` 指令以及 `ws://127.0.0.1:7701/ws` 获取当前页面、URL、截图、DOM 摘要等所有浏览器侧信息。
- **容器 CLI 控制容器**：`/v1/container/<containerId>/execute` 结合 `modules/operations`，可直接触发高亮、滚动、自动点击、导航等行为；容器结构/字段定义参考 `container-library/README.md` 与 `container-library/xiaohongshu/README.md`。
- **事件订阅**：通过 Bus `ws://127.0.0.1:7701/bus` 订阅 `container:*`、`ui:*` 反馈，实时获取 auto-click、highlight、workflow execution 的状态；CLI 端也可监听 `MSG_*` 事件闭环调试。
- **高亮 & 定位**：`ui:highlight` IPC / `highlight` operation 用于视觉确认；workflow 注入器支持 overlay 渲染，可与 DOM picker 联动确认定位精准度。
- **容器目录规范**：所有容器以“根容器 → 子容器”递归结构组织，根容器 selector 必须覆盖整页主区域，子容器仅能挂在对应父目录下，禁止跨层；详细格式、字段及示例记录在 `container-library/README.md` 与 `container-library/xiaohongshu/README.md`，调试或扩展容器前先对照该文档确认根容器是否存在并匹配 DOM。
- **Session 命名规则**：所有浏览器会话统一以 `{platform}_{variant}` 命名，platform 例如 `xiaohongshu`/`weibo`，variant 例如 `fresh`/`prod`/`dev`；若需要多实例则在末尾追加两位序号（如 `xiaohongshu_fresh_01`）。脚本中严禁创建临时 profile 名，确保 headful 会话可长时间复用并避免风控。
- **单平台单会话**：同一平台在任意时刻只允许存在一个会话。启动新脚本前必须先调用 `node scripts/xiaohongshu/tests/status.mjs`（或对应平台 status 脚本）确认会话状态，若 `profile` 已存在则只能复用；若不存在再运行 Phase1 脚本创建。所有测试脚本都应该先读取状态再执行，以便随时回到统一的测试起点。
- **安全搜索流程**：严禁通过构造搜索结果 URL 直接导航；必须在页面内聚焦搜索框，通过模拟输入 + 回车触发搜索，避免触发风控。
  - （新增）所有自动搜索必须经过 SearchGate 节流服务授权：
    - SearchGate 默认规则：同一 key（通常是 profileId，例如 `xiaohongshu_fresh`）在任意 60s 窗口内最多允许 2 次搜索；
    - 入口脚本：`node scripts/search-gate-server.mjs`（监听 `WEBAUTO_SEARCH_GATE_PORT`，默认 7790）；
    - Workflow 侧的 `GoToSearchBlock` 在真正执行“对话框搜索”前会调用 SearchGate `/permit`，未获许可会阻塞等待或报错提示先启动服务。
- **通用容器调试工具**：所有基础容器调试脚本不得硬编码平台，统一通过参数或环境变量指定 `profile`/`url`：
  - `node scripts/debug-container-tree-summary.mjs <profile> [url]`：打印 `containers:match` 的摘要（根容器 ID、子节点数量等），例如小红书可传 `xiaohongshu_fresh https://www.xiaohongshu.com`。
  - `node scripts/debug-container-tree-full.mjs <profile> [url]`：打印完整的 container_tree 结构，用于检查根/子容器连线。
  - `node scripts/test-container-events-direct.mjs <profile> [url]`：订阅 Bus `container:*` 事件并触发一次 `containers:match`，用于验证容器事件派发链路。
  - `node scripts/build-container.mjs <profile> <url>`：交互式容器构建工具，支持任意站点（weibo/xiaohongshu 等），默认不再绑定具体平台。
- **Workflow 驱动调试（推荐入口）**：平台相关脚本一律通过 Workflow + Block 调用能力，脚本只做 CLI/参数解析：
  - 小红书登录与状态：`modules/workflow/workflows/XiaohongshuLoginWorkflow.ts` + `scripts/xiaohongshu/tests/phase1-session-login.mjs`。
  - 小红书采集主流程：`modules/workflow/definitions/xiaohongshu-collect-workflow-v2.ts` + `node scripts/run-xiaohongshu-workflow-v2.ts --keyword "手机膜" --count 5`。
  - 所有小红书 Block（搜索 / 列表 / 详情 / 评论 / 关闭）均返回 `anchor` 字段（containerId + Rect），配合高亮可完整回环每一步是否命中正确元素。
- **锚点 + 高亮 + Rect 回环**：调试时优先使用容器锚点而不是硬编码 DOM 选择器：
  - 通过 `container:operation highlight` 或 `scripts/container-op.mjs <profile> <containerId> highlight` 在页面上高亮容器。
  - 通过 `modules/workflow/blocks/helpers/anchorVerify.ts` / `containerAnchors.ts` 读取容器定义的 selector，并在页面内执行 `getBoundingClientRect()` 反查坐标。
  - 小红书相关 Block 的输出中都带有 `anchor.rect`，配合终端日志和浮窗高亮即可确认每个小步骤的定位是否准确。
- **统一日志与 Workflow 日志**：所有服务与 Workflow 的结构化日志统一落在 `~/.webauto/logs`：
  - 基础日志：`logging` 模块提供 `logs:stream` 控制器动作和 `modules/logging/src/cli.ts`，支持按 `--source browser|service|debug` 或 `--session <profile>` tail 日志；
  - 调试/Workflow 事件：设置 `DEBUG=1` 后，`logDebug` / `logWorkflowEvent` 会将 JSON 行写入 `debug.jsonl`，可通过 `cli.ts stream --source debug --lines 200` 或 `logs:stream` 读取；
  - Workflow 执行：`WorkflowExecutor` 已自动在每个步骤的 start/success/error 时写入一条日志（包含 workflowId/name、stepName、sessionId 以及 Block 返回的 `anchor` 信息），用于小红书采集 Workflow 的完整回放与追踪。
  - `node scripts/browser-status.mjs <profile> [--site xiaohongshu|weibo] [--url URL]`：通用浏览器状态检查（Session/URL/Cookie），对小红书支持基于容器的登录探针。
  - `node scripts/container-op.mjs <profile> <containerId> <operationId> [--config JSON]`：直接对指定容器执行 `highlight` / `extract` / `click` / `navigate` / `scroll` 等操作。

> 容器以“根容器 → 子容器”目录递归组织，与页面 DOM 结构一致；根容器 selector 必须可靠匹配页面顶层区域，子容器仅在对应根目录下出现，避免跨层级引用。

### 登录锚点模型（小红书）

- 登录态判断必须基于 **容器 ID**，禁止在脚本 / workflow 中硬编码 DOM 选择器（如 `a[title="我"]`、`.channel` 等）。
- 小红书登录约定（详细见 `container-library/xiaohongshu/README.md`）：
  - 已登录：任意根容器下命中 `*.login_anchor`（如 `xiaohongshu_home.login_anchor`、`xiaohongshu_search.login_anchor`、`xiaohongshu_detail.login_anchor`）。
  - 未登录：登录页根容器下命中 `xiaohongshu_login.login_guard`。
  - 不确定：两类容器都未命中，需由上层 workflow 决定是否跳转登录页或重试。
- 推荐参考实现：
  - `scripts/xiaohongshu/tests/status-v2.mjs`：容器驱动的登录状态检查脚本。
  - `scripts/xiaohongshu/tests/phase1-session-login.mjs`：Phase1 登录调试脚本，仅依赖登录锚点容器。
  - `modules/workflow/blocks/EnsureLoginBlock.ts`：通用 EnsureLogin Block，通过 Unified API `containers:match` 判定登录态。
- 启动脚本 `scripts/start-headful.mjs` / `launcher/core/launcher.mjs` 已接入该模型，对 `xiaohongshu_*` profile 统一使用容器驱动登录检测。

---

## Browser Service（重点）

### 职责与边界

- 负责浏览器会话生命周期管理、页面导航、Cookie 持久化、脚本执行
- 只提供技术能力，不包含业务逻辑
- 通过 HTTP/WS 对外提供统一能力，应用层不得直接侵入底层

### 目录结构

```
services/browser-service/
├── index.ts                # HTTP 入口与命令路由
├── SessionManager.ts       # 会话管理器（创建/销毁/查询）
├── BrowserSession.ts       # 单会话操作封装
├── ws-server.ts            # WebSocket 服务
├── ContainerMatcher.ts     # 容器匹配器
├── ContainerRegistry.ts    # 容器注册表
├── ProfileLock.ts          # profile 锁
├── BrowserStateService.ts  # 浏览器状态服务
├── runtimeInjector.ts      # 运行注入器
├── pageRuntime.ts          # 页面运行时
└── types/
    └── ws-types.ts         # WS 消息类型
```

### HTTP 命令接口（`POST /command`）

```ts
interface CommandPayload {
  action: string;
  args?: Record<string, any>;
}
```

#### 会话管理

| action | args | 说明 |
|--------|------|------|
| `start` | `{ profileId?, headless?, url? }` | 启动会话 |
| `stop` | `{ profileId? }` | 停止会话 |
| `getStatus` | - | 查询会话列表 |

#### 页面与脚本

| action | args | 说明 |
|--------|------|------|
| `goto` | `{ profileId?, url }` | 页面导航 |
| `screenshot` | `{ profileId?, fullPage? }` | 截图（base64） |
| `evaluate` | `{ profileId?, script }` | 执行脚本 |

#### Cookie

| action | args | 说明 |
|--------|------|------|
| `getCookies` | `{ profileId? }` | 获取 cookies |
| `saveCookies` | `{ profileId?, path }` | 保存 cookies |
| `saveCookiesIfStable` | `{ profileId?, path, minDelayMs? }` | 稳定后保存 |
| `loadCookies` | `{ profileId?, path }` | 注入 cookies |
| `autoCookies:start` | `{ profileId?, intervalMs? }` | 开启自动保存 |
| `autoCookies:stop` | `{ profileId? }` | 停止自动保存 |
| `autoCookies:status` | `{ profileId? }` | 查询自动保存状态 |

#### 不支持的命令

- `newPage`、`switchControl`：TS 服务不支持，走 controller 路由

### WebSocket 接口

- 连接：`ws://127.0.0.1:8765`
- 事件：`browser:started`、`page:navigated`

### 自动退出

当 `BROWSER_SERVICE_AUTO_EXIT=1` 且无会话时自动退出。

---

## UI（Floating Panel，重点）

### 职责与边界

- 纯 UI 展示与交互，不包含业务逻辑
- 与 Unified API 的 Bus/WebSocket 通信
- 与 Controller 通过 HTTP 调用交互

### 目录结构

```
apps/floating-panel/
├── src/
│   ├── main/
│   │   ├── index.mts      # 主进程：窗口管理、IPC、Bus WS
│   │   └── preload.mjs    # ESM preload（必须 .mjs）
│   └── renderer/
│       ├── index.mts
│       ├── index.html
│       ├── diag.ts
│       ├── ui-components.ts
│       ├── operation-ui.mts
│       ├── operation-types.ts
│       ├── logger.mts
│       ├── drag.mjs
│       └── graph/
│           ├── container-helpers.mts
│           ├── dom-helpers.mts
│           ├── matcher.mts
│           ├── view.mts
│           └── virtual-children.mts
├── scripts/
│   ├── build.mjs
│   └── test-preload.mjs
└── dist/
```

### 主进程职责

- 创建窗口并加载 `dist/renderer/index.html`
- Bus WS：`ws://127.0.0.1:7701/bus`，断线 3s 自动重连
- IPC 转发到 Unified API（如 `ui:action`）
- 通过 `webPreferences.preload` 加载 `dist/main/preload.mjs`

### IPC 通道

| Channel | 说明 |
|---------|------|
| `health` | 统一健康检查代理 |
| `ui:highlight` | 统一高亮接口代理 |
| `ui:clearHighlight` | 清理高亮 |
| `ui:debug-log` | 渲染进程调试日志 |
| `ui:action` | 转发 Controller 动作 |
| `window:minimize` / `window:close` | 窗口控制 |

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WEBAUTO_FLOATING_WS_URL` | `ws://127.0.0.1:7701/ws` | WebSocket 连接地址 |
| `WEBAUTO_FLOATING_BUS_URL` | `ws://127.0.0.1:7701/bus` | Bus 连接地址 |
| `WEBAUTO_FLOATING_HEADLESS` | - | 设为 "1" 以 headless 模式运行 |
| `WEBAUTO_FLOATING_DEVTOOLS` | - | 设为 "1" 自动打开 DevTools |

### Preload 规范

- 必须使用 ESM：`apps/floating-panel/src/main/preload.mjs`
- 构建仅复制到 `dist/main/preload.mjs`，禁止生成 `.cjs`
- 主进程 `webPreferences.preload` 直接指向 `.mjs`

---

## 硬性规则：模块系统

1. 全仓库统一使用 ES Module（`"type": "module"`），禁止混用 CommonJS。
2. 所有源码文件扩展名：`.ts`、`.mts`、`.js`、`.mjs` 均为 ES 模块；禁止使用 `.cjs`。
3. 禁止在 ES 模块中使用 `require`、`module.exports`、`__dirname`、`__filename`；统一改用 `import`、`export`、`import.meta.url`、`fileURLToPath`。
4. Electron preload 脚本必须使用 ESM（`.mjs`/`.mts`/`.js`），禁止生成 `.cjs` 版本；主进程与构建流程必须确保全链路 ESM。
5. 构建脚本、CLI 统一使用 ESM。
6. 违反上述规则即视为阻塞性 Bug，立即回滚或修复。
7. 浮窗 UI（apps/floating-panel）必须使用纯 ESM 架构，禁止混用 CJS。

## 新增规则（2025-12-24）

### 0. 【最高优先级】永远禁止使用模糊匹配的进程终止命令

**禁止使用的命令：**
- `pkill -f "node"` 或任何包含 "node" 的模糊匹配
- `pkill -f` 配合任何不够精确的模式

**原因：** 模糊匹配会���杀正在运行的开发环境、编译器、测试进程、MCP 服务器等重要服务，导致系统崩溃。

### 1. 代码修改禁止使用 Python 自动化脚本

禁止使用 Python 自动化脚本进行代码修改（如 `sed`, `awk` 配合 `python3 << 'EOF'`）。

**原因：** 自动化脚本容易出现语法错误和结构破坏，导致代码无法正常运行。

**替代方案：**
- 手动使用 `apply_patch` 工具
- 对于复杂修改，先分析代码结构，然后精确修改
- 小型修改使用简单的 sed 命令

### 2. 代码修改统一使用 TypeScript

除了必要的浏览器底层修改，所有代码修改必须使用 TypeScript/TS。

**原因：** 保持代码类型安全，利用 TypeScript 的类型系统。

**范围：**
- apps/floating-panel/src/renderer/ - 使用 TypeScript/TS
- modules/ 目录下的源码 - 使用 TypeScript

### 3. 浏览器 CLI 封装后禁止在应用层修改

浏览器 CLI 的修改应该通过命令行接口进行，禁止在应用层直接修改浏览器 CLI 以下的代码。

**原因：** 保持代码分层清晰，避免跨层修改导致的维护问题。

**范围：**
  - apps/floating-panel/ 中的所有代码
  - services/ 目录下的所有代码

---

## ESM preload 实施计划

- 浮窗 preload 源文件：`apps/floating-panel/src/main/preload.mjs`（ESM）
- 构建仅复制源文件到 `dist/main/preload.mjs`；禁止生成 .cjs 或使用 babel 转译
- 主进程：`webPreferences.preload = path.join(MAIN_DIR, 'preload.mjs')`
- Electron 版本 >= 39；contextIsolation: true，sandbox: false，nodeIntegration: false
- 测试入口：`apps/floating-panel/scripts/test-preload.mjs` 必须输出 `[preload-test] window.api OK`
- 全局回环：`scripts/test-loop-all.mjs` 的 `floating-panel:preload-loop` 使用 npx electron 执行 ESM 测试脚本
- 历史遗留 CJS 测试脚本（如 test-preload.cjs、*_wrapper.cjs）立即删除
- 其他模块的 CJS 残留逐步按最小回环替换，每一步都通过回环验证后再继续

## 详细文档

- docs/arch/PORTS.md：端口与环境变量
- docs/arch/LAUNCHER.md：启动器架构
- docs/arch/AGENTS.md：完整设计原则

---

## 新增规则（2025-01-06）

### 4. 调试脚本必须保持浏览器会话不被破坏

**原则：**
- 调试脚本必须复用现有浏览器会话（如 `xiaohongshu_fresh`），禁止每次运行脚本都重启或杀掉浏览器
- 脚本应设计为 "unattached" 模式，即在现有会话上执行操作而不影响会话状态
- 避免频繁请求连接到同一页面，优先使用页面刷新或导航而非完全重启

**原因：** 
- 保持会话状态（登录态、Cookie、页面状态）对调试连续性至关重要
- 频繁重启浏览器会破坏调试流程，降低开发效率
- 避免因重复启动导致的资源浪费和潜在错误

**范围：**
- 所有调试脚本（如 `scripts/debug-*.mjs`）
- 阶段性功能测试脚本
- 容器匹配和操作验证脚本

**替代方案：**
- 使用 `controllerAction('browser:execute', { script: 'location.reload()' })` 刷新页面
- 使用 `controllerAction('browser:execute', { script: 'window.location.href = "..." })` 导航
- 复用现有 `sessionId` 而非创建新会话

### 5. 【新增】所有搜索必须通过 SearchGate 节流

**原则：**
- 所有涉及搜索的 Workflow/Block 必须先向 `WaitSearchPermitBlock` 申请许可
- 禁止绕过 SearchGate 直接执行搜索操作
- 禁止通过构造 URL（如 `/search_result?keyword=...`）直达搜索结果页，必须在页面内通过对话框交互触发（模拟人工输入 + 回车）

**SearchGate 机制：**
- 独立后台服务（`scripts/search-gate-server.mjs`），端口 7790
- 默认速率限制：**同一 profile 每分钟最多 2 次搜索**
- Phase1 启动脚本（`scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs`）负责在登录成功后自动拉起 SearchGate

**落地执行：**
1. **申请许可**：Workflow 中必须包含 `WaitSearchPermitBlock` 步骤，指定 `sessionId`。
2. **执行搜索**：只有当 `WaitSearchPermitBlock` 返回成功后，才执行 `GoToSearchBlock`。
3. **对话框交互**：`GoToSearchBlock` 必须使用"点击输入框 -> 输入 -> 回车"的模拟操作，严禁 URL 跳转。

**原因：**
- 平台风控对频繁搜索高度敏感，直跳 URL 或高频搜索会立即触发验证码
- 集中化流速控制比分散在各个脚本中更可靠
- 模拟人工操作（对话框搜索）比 URL 跳转更安全

**范围：**
- 所有涉及搜索的 Workflow（如 `xiaohongshu-collect-workflow-v2`）
- 所有自定义搜索脚本

**调试工具：**
- `scripts/search-gate-cli.mjs status`：查看节流器状态
- `scripts/xiaohongshu/tests/test-search-gate.mjs`：验证速率限制

**参考文档：**
- `docs/arch/SEARCH_GATE.md`：SearchGate 完整设计与使用说明

### 6. 【一级违规】禁止访问无 xsec_token 的小红书链接

**原则：**
- 任何脚本 / Workflow / Block / 调试代码 **严禁** 通过构造不带 `xsec_token` 的小红书 URL 进行导航或访问（例如：`https://www.xiaohongshu.com/explore/{noteId}`、`/search_result?keyword=...` 等）。
- 严禁在小红书域名下直接通过 `window.location.href = "..."`、`location.assign(...)`、`history.pushState(...)` 等方式构造 URL 跳转，而绕过平台正常入口与 SearchGate。
- 访问无 `xsec_token` 的链接视为**一级违规**，一旦发现必须立即回滚改动并停止相关脚本。

**仅允许的访问方式：**
- 通过已有容器 / Workflow 在页面内模拟真实用户行为（点击搜索结果、点击帖子卡片、点击“更多评论”等），由页面自身生成带 `xsec_token` 的 URL。
- 所有搜索必须走 `WaitSearchPermitBlock + GoToSearchBlock`，通过输入框 + 回车触发，由页面生成搜索结果链接。
- 详情页、评论页等只能通过容器点击从当前页面进入，**禁止**手动拼接详情链接。

**禁止示例（均为一级违规）：**
- 在任何脚本中出现：
  - `window.location.href = "https://www.xiaohongshu.com/explore/xxxxxx"`（无 `xsec_token`）
  - `fetch("https://www.xiaohongshu.com/explore/xxxxxx")` 直接抓取页面
  - 人为拼接 `/explore/{noteId}`、`/search_result?keyword=...` 之类 URL 并导航

**原因：**
- 小红书对直连 / 非正常入口访问有严格风控，访问不带 `xsec_token` 的详情 / 搜索链接极易触发 404 / 风控。
- SearchGate + 对话框搜索 + 容器点击已经提供安全路径，任何绕过这些机制的 URL 导航都会破坏整体风控策略。

### 6. 【新增】所有容器操作必须约束在视口内，模拟用户可见行为

**原则：**
- 所有点击、滚动、输入等操作必须基于当前视口内**可见元素**
- 禁止操作离屏（off-screen）或不可见（display:none/visibility:hidden）元素
- 每个操作前必须通过 **容器匹配 + Rect 验证** 确认元素在视口内
- 滚动操作仅用于将元素带入视口，而非直接操作离屏元素

**落地要求：**
1. **可见性验证**：
   - 通过 `containers:match` 获取元素坐标
   - 验证 `rect.y < window.innerHeight` 且 `rect.width > 0 && rect.height > 0`
   - 高亮 1-2 秒供视觉确认（`container:operation highlight`）

2. **滚动约束**：
   - 滚动距离不超过 800px（单次用户手势范围）
   - 滚动后重新验证元素可见性
   - 禁止连续滚动（需间隔 >500ms）

3. **点击约束**：
   - 仅点击当前视口内元素
   - 使用 `element.click()` 而非 `dispatchEvent`（除非必要）
   - 点击前确保元素未被其他元素遮挡（z-index 检查）

4. **输入约束**：
   - 先聚焦（`element.focus()`）再输入
   - 模拟真实输入节奏（每字符间隔 50-200ms）
   - 输入后触发 `input` 和 `change` 事件

**代码示例（正确做法）：**
```js
// ✅ 正确：先验证可见性，再操作
const rect = await verifyAnchor(containerId);
if (!rect || rect.y > window.innerHeight) {
  // 元素不在视口，先滚动
  await scrollToElement(containerId);
  // 重新验证
  const newRect = await verifyAnchor(containerId);
  if (!newRect) throw new Error('元素不可见');
}
// 高亮确认
await highlight(containerId);
await delay(1000); // 视觉确认时间
// 执行操作
await click(containerId);
```

**反例（禁止做法）：**
```js
// ❌ 错误：直接操作可能不可见元素
document.querySelector('.hidden-button').click();
// ❌ 错误：大跨度滚动后直接操作
window.scrollTo(0, 3000);
document.querySelector('.far-away-element').click();
```

**原因：**
- 小红书等平台通过 **视口行为检测** 识别爬虫
- 真实用户不会点击离屏元素或进行非自然滚动
- 可见性验证可显著降低被风控概率

**范围：**
- 所有 Phase 脚本（1-4）
- 所有 Workflow Block（GoToSearch/OpenDetail/ExpandComments等）
- 所有容器操作（highlight/scroll/click/input）

**检测方式：**
- 每个 Block 返回 `anchor.rect` 必须满足 `rect.y < window.innerHeight`
- 调试时通过 `scripts/debug-container-tree-*.mjs` 验证可见性
- 生产环境通过日志监控离屏操作告警

**违规处理：**
- 发现离屏操作立即标记为 **阻塞性 Bug**
- 必须修复并通过 Rect 验证后方可合并

---

**审查标准**：
- A级：所有操作基于可见元素 + Rect 验证闭环
- B级：大部分操作可见，少量离屏但有合理滚动
- C级：存在直接离屏操作，需立即整改

**当前状态**：Phase 1-4 已达到 **A级** 标准（详见视口安全审查报告）

---

## 新增规则（2026-01-07）下载与持久化

### 7. 爬取结果的统一落盘规范

**根目录约束：**
- 所有爬取/下载结果必须统一落在用户目录下的 `~/.webauto/download/`，禁止写入仓库根目录下的临时 JSON/图片文件作为最终输出。
- 根路径规范：`~/.webauto/download/{platform}/...`，其中 `{platform}` 如 `xiaohongshu`、`weibo` 等。

**任务/关键字目录结构：**
- 对于按搜索关键字驱动的任务，目录结构统一为：
  - `~/.webauto/download/{platform}/{env}/{keyword}/...`
  - `{env}` 用于区分环境/用途，例如：
    - `debug`：阶段性测试脚本（Phase1–4、collect-100 调试版等）
    - `prod`：正式量产采集
  - 例如小红书采集：`~/.webauto/download/xiaohongshu/debug/华为续签难/`。

**帖子级目录结构（以小红书为例）：**
- 每个帖子一个子目录：
  - `~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/`
  - 目录内至少包含：
    - `README.md`：帖子主体内容（标题、正文、发布时间、作者信息、原始链接等），正文内引用图片需使用相对路径。
    - `images/`：图片实际文件目录，文件名建议使用 `{index}.jpg` 或保留扩展名的 `{index}.{ext}`。
    - （可选）`comments.md`：评论列表（用户名、用户 ID、时间、评论内容）按 Markdown 或纯文本落盘。
- Phase3/Phase4 调试脚本之前写入仓库根目录下的 `xiaohongshu_data/*.json` 仅作为过渡方案，后续必须迁移到上述目录结构；新代码禁止再引入类似仓库级 JSON 作为“主结果”的写盘路径。

**格式约束：**
- 结果文件应以目录 + 文本文件（`.md` / `.txt`）为主，**禁止仅依赖统一 JSON 文件作为对外可用的主结果**。
- 如确有需要，可在帖子目录内附带结构化文件（例如 `meta.json`、`comments.jsonl`），但这些只能作为内部调试或二次处理的辅助，不得取代 README.md / 目录结构本身。

**测试与量产的一致性：**
- 测试脚本与量产 Workflow 必须共用同一个根路径 `~/.webauto/download/`，仅通过 `{env}` 或其他明确的子目录前缀来区分，不允许为测试单独发明新的根目录（例如 `xiaohongshu_data/`）。
- 所有新增加的 Workflow/脚本在设计时必须先确定：
  - 对应的 `{platform}`、`{env}`、`{keyword}` 目录；
  - 帖子级目录命名（优先使用稳定的业务 ID，如 noteId）；
  - 图片/评论/元信息的文件名和相对路径约定。
