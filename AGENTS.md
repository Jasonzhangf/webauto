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
