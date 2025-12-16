---
# Actions 层
事件驱动 UI 动作模块，独立于具体 UI 容器。

## 设计原则
- 仅通过 bus 发布/订阅事件，不直接调用 invokeAction。
- 不持有 UI 状态，UI 通过事件更新自身显示。
- 可独立测试（依赖 bus Mock）。

## 模块
- `highlight-actions.js`：高亮按钮事件绑定与 UI 同步。

## 事件约定
- `ui.action.highlight`：用户触发高亮（含 selector 与 options）
- `ui.action.clearHighlight`：清除高亮
- `ui.action.togglePersistent`：切换保持高亮模式
- `dom:highlight_*`：由高亮服务转发的反馈，供 UI 更新显示。
