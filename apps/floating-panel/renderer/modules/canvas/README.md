# Canvas Module

负责容器/DOM 关系的画布渲染：

- 提供纯渲染 API（`renderGraph(graphState)`）。
- 暴露节点/连线的命中检测，以便 UI 绑定交互。
- 不直接依赖全局 state，只接收数据对象与回调。
