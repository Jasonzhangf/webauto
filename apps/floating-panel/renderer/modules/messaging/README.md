# Messaging Module

Renderer 层的消息中枢：

- 封装与 `window.desktopAPI` / WebSocket 的交互。
- 统一 topic 命名，如 `ui.dom.pick`, `controller.highlight.result`。
- 提供记录与调试 hook，配合黑盒测试。

## Topic 约定（UI → UI / UI → 后端）

- DOM 相关（由 DOM 模块发布，其他模块可订阅）：
  - `dom:highlight_request`：请求高亮某个 selector（payload: `{ selector, channel, path }`）。
  - `dom:highlight_cleared`：用户手动清除高亮。
  - `dom:highlight_feedback`：高亮结果反馈（命中数量、错误信息等）。
  - `dom:highlight_error`：高亮异常。

- UI 状态相关（由 `ui-state-service` 发布）：
  - `ui.state.snapshot`：完整 UI 状态快照。
  - `ui.state.event`：单个 UI 事件记录，用于调试/测试。

这些 topic 仅作为约定，实际订阅逻辑由 `bus-subscriptions.js` 或各模块自行注册。
