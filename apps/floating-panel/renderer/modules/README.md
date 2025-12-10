# Floating Panel Modules

该目录按照功能拆分浮窗 Renderer 层：

- `canvas/`：Canvas 渲染与连线，独立处理尺寸/重绘，不再感知业务状态。
- `panels/`：DOM 面板、容器面板、日志面板等 UI 控件，每个面板独立订阅消息。
- `state/`：轻量状态容器，仅负责把消息映射为渲染所需的衍生数据。
- `messaging/`：Renderer 内部的消息桥与订阅逻辑，封装 bus、DevTools 报告等。
- `controls/`：可重用 UI 控件（高亮按钮、抓取按钮等），通过基类与消息交互。

后续会把 `app.js` 中的巨量逻辑拆分到上述模块，实现「一个面板一个模块」的结构。
