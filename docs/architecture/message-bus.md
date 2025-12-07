# WebAuto 消息总线设计

## 目标
- 所有 UI/窗口/控件/CLI 行为都统一通过消息表达，不直接调用彼此的内部 API。
- 任何 Actor 只做两件事：订阅若干消息、收到后执行逻辑并发布新的消息（状态/事件/错误）。
- 让 headless 调试和自驱动测试只需“发布消息 + 监听消息”即可感知整个系统状态。

## 核心组件

### Message Bus
- Node/Renderer 共享的事件总线（封装 `EventEmitter` 或专用类）。
- 提供 API：
  - `bus.publish(topic, payload)`
  - `bus.subscribe(topic, handler, options)`（支持一次性、过滤器、带优先级等可扩展参数）
  - `bus.request(topic, payload)`（可选，用于 request/response 模式）
- 命名建议：`系统.角色.动作`，例如：
  - `ui.window.shrinkToBall`
  - `ui.window.restoreFromBall`
  - `ui.window.stateChanged`
  - `ui.ball.doubleClick`
  - `ui.ball.stateChanged`
  - `ui.control.devReport`
  - `ui.graph.domBranchLoaded`
  - `ui.graph.containerRemapped`
  - `ui.test.ping`
- Renderer 通过 `window.bus`/`desktopAPI` 访问；主进程通过共享实例；CLI 通过 IPC/WebSocket。

### Actors（被测系统）
1. **主窗口**  
   - 订阅：`ui.window.shrinkToBall`、`ui.window.restoreFromBall`、`ui.window.toggleHeadless`  
   - 执行：调用 Electron API shrink/restore/headless，并在完成后 `publish('ui.window.stateChanged', { mode, headless })`  
   - 错误：`publish('ui.window.error', { message })`

2. **球窗口**  
   - 订阅：`ui.ball.doubleClick`、`ui.window.restoreFromBall`  
   - 执行：调用 ball Electron API，成功后 `publish('ui.ball.stateChanged', { mounted: true/false })`  
   - DevReport：挂 BallClient，定期/事件化 `publish('ui.control.devReport', {...})`

3. **UI 控件（Graph、Panel、树等）**  
   - 继承 `BaseControl`，在 `update()` 时 `bus.publish('ui.control.devReport', this.inspect())`  
   - 若控件有特定事件（如 Graph 的 DOM 展开、连线），另行发布：
     - `ui.graph.domExpandRequested`
     - `ui.graph.domBranchLoaded`
     - `ui.graph.containerRemapped`

4. **CLI / Test Driver**  
   - 作为标准 Actor：`publish('ui.window.shrinkToBall')` → `subscribe('ui.window.stateChanged')` 等  
   - 可以实现 `ui.test.cycle`：  
     1. 发 `ui.window.shrinkToBall`  
     2. 等 `ui.window.stateChanged(mode='ball')` 或 `ui.control.devReport` 中 `controlId='ball'` 的 mounted  
     3. 发 `ui.ball.doubleClick`  
     4. 等 `ui.window.stateChanged(mode='normal')` + `ball unmounted`  
     5. 监控 `ui.*.error`，记录结果，`publish('ui.test.cycleFinished', { success, duration })`

### Observer（感知系统）
- 现有 DevReport/Electron dev socket 即是只读消息源，接入 bus 即可：  
  - `ui.control.devReport`：含 `controlId`, `rect`, `scrollInfo`, `interaction`, `errors` 等  
  - 新增 `ui.window.stateChanged`, `ui.ball.stateChanged` 等，完成窗口级状态巡检  
- 可扩展：将 bus 事件序列化存档，或提供 WebSocket API 供远程监控。

## 实施计划

1. **实现 `messageBus`**：  
   - Node 层（主进程）创建单例 `MessageBus`，并通过 IPC 将事件转发到 Renderer / CLI。  
   - Renderer 暴露 `window.bus`（可读）、`bus.publish/subscribe` 代理。

2. **主窗口/球窗口接入**：  
   - 将现有按钮事件改为 `bus.publish`；主窗口订阅消息后执行 Electron API；完成后发 stateChanged。  
   - 球窗口同理，且将 BallClient 的报告映射为 bus 消息。

3. **控件接入**：  
   - BaseControl 调用 `bus.publish('ui.control.devReport', inspect())`。  
   - Graph store 的 `graphEvents` 改为 bus 消息（`ui.graph.domBranchLoaded`, `ui.graph.containerRemapped` 等）。  
   - 其他控件（日志面板、操作面板等）按需发布自己的状态/错误。

4. **CLI/Test Driver**：  
   - 新增 CLI 命令（如 `npm run ui:test-cycle`），内部只通过 bus 与系统交互。  
   - 可脚本化 shrink/restore、DOM 展开、容器连线等测试流程。

5. **调试/监控工具**：  
   - `window.devUI` 可附加 `devUI.subscribe(topic, fn)` 以便在 DevTools console 直接监听消息。  
   - 日志系统/Observer 订阅 `ui.*.error`/`ui.control.devReport` 进行报警或可视化。

## 与现有系统的兼容
- 在过渡期，入口仍可保留直接调用，直到 bus 流程稳定；之后完全切换为“消息→执行→状态消息”。  
- CLI 目前已有 Actions/Operations，可逐步改为只 publish 消息；主进程统一订阅 `operations.run` 等消息去执行。

## 下一步
1. 在 `apps/floating-panel/electron/main.js`/Renderer 实现 bus 单例与 IPC 桥。  
2. 主窗口 actor 订阅 `ui.window.*`、球窗口订阅 `ui.ball.*`，并发布 stateChanged。  
3. BaseControl + graph 控件发布 DevReport/graph 事件。  
4. 写 `scripts/ui/test-cycle.mjs`（或 npm script）作为消息驱动的自测入口。
5. 用 headless 模式 + `devUI`/bus 事件验证整个链路（shrink→ball→restore→验证控件状态）。
