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
