# DOM Tree 模块化设计

> 目标：让 DOM/容器树的捕获、状态、渲染彻底解耦，任何 UI 只负责视图和交互，业务逻辑通过 CLI/服务提供。

## 分层概念

| 层 | 目录 | 职责 |
| --- | --- | --- |
| Store（数据层） | `apps/floating-panel/renderer/dom-tree/store.js` | 维护 DOM 树快照、路径归一化、默认可见节点、展开/懒加载状态、分支合并。绝不触碰 DOM 或 UI。 |
| View（渲染层） | `apps/floating-panel/renderer/dom-tree/view.js` | 把 store 提供的数据渲染成树状列表，处理点击/展开事件，然后把事件回调给 orchestrator。 |
| Orchestrator（应用层） | `apps/floating-panel/renderer/app.js` | 调 CLI/WS 获取快照，把结果塞进 store，并把 View 的事件转换成 CLI/操作（例如 `containers:inspect-branch`、重连容器）。 |

## 目录结构约定

```
apps/floating-panel/renderer/
├── dom-tree/
│   ├── store.js    # 纯数据逻辑
│   └── view.js     # DOM 渲染 & 交互
├── graph/          # 画布渲染（保持独立）
└── app.js          # Orchestrator，连接 CLI/服务 & UI
```

后续在别的模块复用同一理念：

- **浏览器控制**：CLI（`modules/browser-control`）只提供指令；服务（`services/browser-service`）只做转发；UI 组件通过 CLI/服务拿能力。
- **容器/Operation**：容器定义保存在 `container-library` + `~/.webauto/container-lib`，匹配逻辑在 `modules/container-matcher`，UI 只消费快照。

## 使用说明

1. 捕获快照：`app.js` 调 `containers:inspect` 获取根树，把结果传入 `setDomTreeSnapshot(store, snapshot.dom_tree)`。
2. 渲染：`createDomTreeView` 传入 `rootElement`、`store`、`onSelectNode`、`onToggleExpand`；View 会自动从 store 读取可见节点，并根据 `childCount` 或默认深度决定是否显示 “+”。
3. 懒加载：`onToggleExpand` 被触发时，orchestrator 检查 `getDomNodeChildStats`，若需要则调 `containers:inspect-branch`，再用 `mergeDomBranchIntoTree` 写回 store。

## 约束

- Store 不可引用 DOM API。
- View 不可直接调用 CLI/服务，所有副作用必须从回调交还 orchestrator。
- 新模块也必须按照 “store / view / orchestrator” 三层放到对应子目录，避免再次出现扁平耦合。

这样既能保证浮窗 UI 可维护，也为后续 CLI 或服务端渲染提供同样的数据入口。若将来需要新的 UI（如 web 控制台），直接引入 `store.js`，复用一套状态机即可。
