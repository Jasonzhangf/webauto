# 浮窗 UI 重构目录结构

## 目标

1. **能力 CLI 化**：所有浏览器/容器能力都有独立模块 + CLI，支持直接测试。
2. **服务层独立**：新增 `services/controller`，负责接收 UI 消息 → 调用 CLI → 回传结果。
3. **消息驱动 UI**：Renderer 切成 canvas / panels / state / messaging / controls 等子模块。
4. **CI 覆盖**：`npm run ui:test`、`npm run browser:highlight` 等脚本成为黑盒测试，消息日志用于断言。

## 新的目录结构

```
webauto/
├── services/
│   └── controller/          # UI 控制服务（消息桥，调用 CLI）
│       ├── README.md
│       └── src/index.ts
├── apps/
│   └── floating-panel/
│       └── renderer/
│           └── modules/
│               ├── canvas/      # Canvas 渲染
│               ├── panels/      # DOM/容器/日志面板
│               ├── state/       # Renderer 状态容器
│               ├── messaging/   # 消息桥 & 订阅
│               └── controls/    # 可复用控件
└── docs/
    └── architecture/
        └── ui-modularization.md
```

## 控制服务运行方式

1. `npm run service:controller:start` 会以独立 Node 进程形式启动 `services/controller/src/server.mjs`，监听 `ws://127.0.0.1:8970`（可通过
   `WEBAUTO_CONTROLLER_HOST/PORT` 调整）。  
2. Electron 浮窗现在通过 `ControllerClient` 连接该 WebSocket；建立连接后，所有 `ui:action` 都会转成 JSON
   请求 `{ action, payload, requestId }`，服务端再调用 CLI/模块。  
3. Controller 服务把高亮/DOM 捕获等事件通过 `type:event` 推送给客户端，浮窗 `messageBus` 会继续广播给 Renderer。  
4. 如需在 UI 启动时自动拉起服务，可保持 `WEBAUTO_CONTROLLER_AUTOSTART=1`（默认），否则提前执行
   `npm run service:controller:start` 并在 UI 中设置 `WEBAUTO_CONTROLLER_URL` 即可。

## 后续迁移步骤

1. **迁移 Electron 逻辑**：逐步把 `electron/main.js` 中的业务调用迁到 `services/controller`，Electron 只负责窗口管理 + IPC。
2. **拆分 Renderer**：把 `renderer/app.js` 的逻辑迁到 `modules/*` 中的纯函数/类，并通过消息订阅刷新。
3. **统一消息协议**：整理 topic（示例：`ui.dom.pick.request`, `controller.highlight.result`），CLI 也遵守同样的协议。
4. **扩展 CI 流程**：在 `npm run ui:test` 中新增对 controller 消息的断言；CLI 测试记录在 `docs/testing/ui-loop.md`。

完成以上拆分后，就可以删除旧的耦合实现，只保留模块化、可测试的代码。

## 高亮闭环设计（新增）

1. **事件流概览**
   - UI 按钮点击 → `ui.action.highlight` / `ui.action.clearHighlight` / `ui.action.togglePersistent`
   - `highlight-service` 将事件转换为 `dom:highlight_request` / `dom:highlight_cleared`
   - WebSocket 服务 (`ws-server.ts`) 接收请求，调用 Runtime 的 `highlight_selector` / `clear`
   - Runtime 在页面内高亮元素，广播 `dom:highlight_feedback` / `dom:highlight_error`
   - UI 订阅反馈事件，更新状态区域与“保持高亮”勾选框。

2. **模块职责**
   | 层 | 文件 | 职责 |
   | --- | --- | --- |
   | Actions | `renderer/modules/actions/highlight-actions.js` | 将 UI 操作映射为 bus 事件 |
   | Service | `renderer/modules/services/highlight-service.js` | 维护高亮状态，转发请求与反馈 |
   | Runtime | `runtime/browser/page-runtime/runtime.js` | 注入高亮/DOM 脚本，实现元素 hover/清除 |
   | Backend | `services/browser-service/ws-server.ts` | 将 `highlight_element`/`clear_highlight` 分发到 Runtime |
   | Tests | `scripts/ui/highlight-smoke.mjs` 等 | 端到端验证 |

3. **扩展方向**
   - 为 CLI 提供 `npm run browser:highlight -- --selector ...` 入口。
   - 在 Controller 服务 (`services/controller`) 中记录 `highlight` 事件，供 Web UI 或远程调试使用。
   - 为 Runtime 暴露更多钩子（如 `window.__webautoHighlightHook`）以便第三方脚本接入。
