# UI 纯展示化与 CLI 行为解耦方案

## 目标

1. **UI 只负责界面与交互**：浮窗/调试面板不再持有业务逻辑，所有操作通过 CLI 或模块 SDK 完成；
2. **行为可脚本化**：每个功能都能被 CLI 单独调用，服务层只是包装器，方便自动化与 CI 复现；
3. **统一通信层**：UI → 网关（Node/Electron 主进程）→ CLI/服务，结果再推回 UI，保证可替换；
4. **可测试**：模块 CLI 都有静态/单元测试，UI 只需要做少量端到端校验即可。

## UI 视图与职责

| UI 区块 | 展示内容 | 交互需求 | 行为来源 |
| --- | --- | --- | --- |
| 一键启动 / Profile 管理 | 当前 profile、模式、WS 端点、健康状态 | 启动/停止、切换 headless、查看日志 | `browser-control` CLI（启动/状态）+ `session-manager` CLI（列出/附加能力） |
| 会话列表 | 当前 session 状态、URL、匹配到的容器 | 选择会话、刷新、删除 | `session-manager` CLI |
| 容器树（新窗口与内嵌） | 根容器 + 子容器树、匹配 selector、匹配次数 | 展开/折叠、手动切换 selector、创建子容器、重试匹配 | `container-matcher` CLI (`inspect-tree`/`match-root`)，`container-registry` CLI (`show`/`update`) |
| DOM 映射面板 | 页面 DOM 结构、虚线到容器的映射、节点属性 | 点击 DOM 节点高亮、按层级加载、定位容器 | `browser-control` CLI (`dom-tree`/`dom-dump`)，`operations` CLI（highlight） |
| 日志/事件流 | 各 CLI/服务的 stdout/stderr、结构化事件 | 过滤、复制、清空 | `logging` 模块（未来 CLI `log stream/flush`） |
| Operation 面板 | 根据容器推荐的操作、执行结果 | 运行操作、查看失败原因 | `operation-selector` + `operations` CLI |

> UI 仅负责把这些结果渲染为树、表格、日志面板，不接触 DOM/容器解析逻辑。

## CLI / 模块调用矩阵

| 能力 | CLI/模块 | 当前状态 | UI 接入方式 |
| --- | --- | --- | --- |
| DOM 捕获/裁剪 | `modules/browser-control` (`dom-dump`, `dom-tree`) | 已实现 fixture 模式；缺真实浏览器拉起 | UI 通过主进程调用 CLI，获取 HTML/树 JSON |
| 浏览器生命周期 | `browser-control` 计划中的 `launch/stop/status` | 未实现，需要从 `runtime/browser/scripts` 迁入 | 主进程维护一个 child process registry，UI 只发命令 |
| Session 管理 | `session-manager`（计划） | 未实现 | CLI 负责创建/销毁 WS，会返回 sessionId、端口；UI 轮询 CLI 获取状态 |
| 容器库 | `container-registry` (`list/show/test`) | 已实现 | UI 通过 CLI 加载容器定义、同步更新 |
| 容器匹配/树 | `container-matcher` (`match-root/inspect-tree`) | 已实现 | UI 调用 `inspect-tree` 得到树快照，配合 DOM 视图 |
| 日志流 | `logging`（计划） | 未实现 | CLI 提供 `log stream`，主进程订阅并推给 UI |
| 操作执行 | `operations` + `operation-selector`（计划） | 未实现 | UI 把当前容器/DOM 上下文交给 CLI，返回可执行操作及其状态 |

### 统一调用流程

1. **UI 发请求**：所有动作通过 Renderer → Electron 主进程（或 Web UI → 后端服务）的统一 `invoke(action, payload)`。
2. **主进程调 CLI**：根据 action 映射到具体 CLI 命令 + 参数，使用 `child_process.spawn` 后台执行，实时监听 stdout/stderr。
3. **结果回传**：CLI 标准输出 JSON，主进程解析后发回 UI；错误统一包装成结构化错误。
4. **日志侧写**：主进程同时把 `logging` CLI 的事件推给 UI 的日志面板，提供复制按钮。

## 重建阶段划分

1. **CLI 能力补齐**
   - browser-control：实现 `launch/stop/status`, profile 独占、headless/headful 切换；
   - session-manager：`create/list/delete`，输出 session 元数据；
   - logging：`log stream`；
   - operations + selector：最小集合（highlight、scroll）。
2. **服务层网关**
   - 在 `services/ui-gateway` 新增轻量 Node 服务，统一封装 CLI 调用；
   - 对外只暴露 WebSocket/HTTP，供浮窗或 Web UI 使用；
   - 支持订阅长连接事件（日志、容器树更新）。
3. **UI 重构**
   - Renderer 组件化：连接面板、会话列表、容器树、DOM 映射、操作面板、日志；
   - 所有按钮都发 action（如 `session:create`、`container:inspect`）；
   - 容器树与 DOM 映射拆分渲染，互不影响；
   - 浮窗 + Inspector 页面共用数据源，可并入同一窗口的 Tab。
4. **测试与 CI**
   - CLI 层继续用 `node:test` 覆盖；
   - UI 使用截图或 Playwright 驱动最少量 e2e，验证 action→CLI 流程；
   - GitHub Actions 新增 UI 构建与 smoke 测试。

## 对现有代码的影响

- `apps/floating-panel`：清理内联逻辑，改为通过 `window.api.invoke` 调用统一 action；
- `services/browser-service`：逐渐退化为 CLI wrapper，可平滑下线；
- `runtime/browser/scripts`：迁移至 `modules/browser-control` 后，由 CLI/服务调用；
- `container-library`：继续作为静态输入，UI 不直接读取文件。

按以上路线，UI 重建即可专注交互体验，所有可复用逻辑都沉入模块/CLI，满足“任何功能都能在终端复现”的要求。
