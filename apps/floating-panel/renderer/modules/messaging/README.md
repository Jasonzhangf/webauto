# Messaging Module

Renderer 层的消息中枢：

- 封装与 `window.desktopAPI` / WebSocket 的交互。
- 统一 topic 命名，如 `ui.dom.pick`, `controller.highlight.result`。
- 提供记录与调试 hook，配合黑盒测试。
