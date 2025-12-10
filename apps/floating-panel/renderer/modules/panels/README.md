# Panels Module

按面板划分 DOM 操作/容器操作/日志等 UI，每个面板：

- 独立订阅消息和 state 切片。
- 通过消息触发操作（例如 `ui.dom.pick`, `ui.container.remap`）。
- 不依赖其他面板的内部状态。
