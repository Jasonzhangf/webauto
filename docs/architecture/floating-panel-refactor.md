## 浮窗容器视图重构规划

### 目标
- 统一为单画布节点+连线视图，树状结构只作为画布节点的展开逻辑，不再出现第二块 UI。
- DOM 节点实时懒加载：点击 `+` 时调用 branch API 获取下一层，将返回结果立刻挂入画布。
- 模块自洽：每个模块有独立目录与自测脚本，接入浮窗前即可验证逻辑。

### 模块与目录划分
```
modules/
  graph-engine/
    src/
      graphStore.ts        # 纯数据层：容器/DOM节点、连线、展开/折叠状态、懒加载标记
      layout.ts            # 负责根据节点层级计算坐标，供 Canvas 使用
    tests/
      graphStore.test.ts   # 插入/展开/删除节点等单元测试
      layout.test.ts       # 断言坐标输出、对齐方式

  dom-branch-fetcher/
    src/
      fetchBranch.ts       # 封装 containers:inspect-branch 调用；可输入 profile/url/path
      cli.ts               # `npm run dom-branch:fetch -- --profile ...` 手动调试入口
    tests/
      fetchBranch.test.ts  # 用 fixture DOM/模拟返回值做单测

apps/floating-panel/
  core/
    orchestrator.js        # 负责把 CLI/WS 数据喂给 graph-engine，并暴露测试入口
    __tests__/
      orchestrator.test.mjs
  renderer/
    graph/
      canvas-view.js       # 仅处理画布渲染/交互，依赖 graph-engine 提供的节点+布局
      interactions.js      # 拖线、节点点击、tooltip 等；可在 Node 环境用 jsdom 模拟
```

### 模块职责
| 模块 | 职责 | 自测方式 |
| ---- | ---- | -------- |
| `graph-engine/src/graphStore.ts` | 管理节点、连线、展开/懒加载状态；提供 API（`addContainers`/`expandNode`/`linkNodes`）| `graphStore.test.ts`：构造假数据，断言状态树与返回值 |
| `graph-engine/src/layout.ts` | 计算节点坐标、连线控制点、箭头位置 | `layout.test.ts`：输入少量节点，断言坐标/间距 |
| `dom-branch-fetcher/src/fetchBranch.ts` | 统一的 DOM 分支拉取逻辑，既可访问实时 WS 也可读 fixture | `fetchBranch.test.ts` 模拟 HTTP/WS，验证参数与解析 |
| `dom-branch-fetcher/src/cli.ts` | 独立 CLI，方便在桌面直接验证某个 path | 手动执行 `npm run dom-branch:fetch -- --profile weibo-fresh --path root/0` |
| `apps/floating-panel/core/orchestrator.js` | 把 backend API 产出的 snapshot 转换为 graph-engine 填充所需的数据流；负责监听 Canvas 事件并触发 `fetchBranch`/`containers:remap` | `orchestrator.test.mjs`：mock backend responses，断言 graph store 行为 |
| `apps/floating-panel/renderer/graph/canvas-view.js` | Canvas 渲染器。根据 graph-engine layout 渲染节点+连线，并把点击/拖拽事件回调给 orchestrator | `interactions.test.mjs`：使用 jsdom + mock canvas context，验证事件触发 |

### 测试命令
新增 npm script 方便批量执行：
```
"test:floating-graph": "tsx --test modules/graph-engine/tests/**/*.ts",
"test:dom-branch": "tsx --test modules/dom-branch-fetcher/tests/**/*.ts",
"test:floating-orchestrator": "node apps/floating-panel/core/__tests__/orchestrator.test.mjs"
```
开发阶段先在各模块目录运行单测，通过后再把 orchestrator 与 renderer 接通。

### 集成顺序
1. **graph-engine**：实现 store + layout，保证单测绿。
2. **dom-branch-fetcher**：实现 fetch 函数与 CLI，跑完自测并能在 CLI 看到返回数据。
3. **orchestrator**：使用 mock backend（或 CLI）填充 graph store，跑 `orchestrator.test.mjs` 确保事件流程正确。
4. **canvas-view**：改造 renderer，只依赖 graph-engine 提供的节点/布局。交互测试完成后再与 orchestrator 打通。
5. **浮窗联调**：在 `app.js` 中替换旧逻辑，调真实 backend 验证。必要时再增加端到端测试脚本。
