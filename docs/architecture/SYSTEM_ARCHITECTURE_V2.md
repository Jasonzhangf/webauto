# 系统整体架构（v2，总览）

本文汇总当前项目的整体架构、模块关系、容器与 Workflow 的驱动方式，以及已实现/近期计划的具体功能，作为实施前的总览文档。

## 架构总览

组件与职责：
- Orchestrator（7700）：统一拉起并健康聚合 Workflow API 与 Vision Proxy。
- Workflow API（7701）：会话管理、浏览器直控、工作流运行（v1 端点已就绪）。
- Vision Proxy（7702）：视觉识别代理，支持 Python 与 LM Studio 两种后端。
- Container Engine（7703 新增）：容器引擎服务化，负责根锚点检测、树状发现、焦点高亮与运行时容器图管理；通过 `contextId` 与 Workflow 接力。

关系拓扑（ASCII）：
```
[Client]
   │           
   ├─(REST)→ [Workflow API:7701] ──(Playwright/DOM)→ Browser Session
   │                                        ▲
   │                                        │
   └─(REST)→ [Container Engine:7703] ───────┘  (通过 Workflow API 的 eval/highlight/mouse 接口)

[Orchestrator:7700] 负责启动/健康聚合: Workflow API + Vision Proxy
[Vision Proxy:7702] 可被 Workflow/后续容器视觉回退调用
```

## 模块关系

- libs/containers（v2 引擎）
  - `src/engine/*`：容器引擎核心（RootDetector/TreeDiscovery/RuntimeController 等）。
  - `schema/*`：v2 容器定义与索引 Schema。
- libs/operations-framework：工作流基础设施（既有 v1 仍可复用，后续以 Workflow v2 编排对接）。
- services/engines/container-engine：容器服务形态，向外提供 REST API 与 context 管理。
- services/engines/api-gateway（Workflow API）：对浏览器进行 eval/highlight/mouse 等操作，容器服务通过它进行 DOM 搜索与高亮。
- services/engines/vision-engine：视觉识别代理（后续用于容器视觉回退）。

## 容器的驱动方式（Container Driving）

容器定位与操作以“砖块”方式提供，不关心整体流程：
1) 页面访问时先做“根锚点检测”（anchors/selectors，仅 class，不用 XPath）。
2) 命中根后，从根开始按父作用域 BFS 发现子容器，构建 ContainerGraph（父子/依赖）。
3) 容器默认注入 `find-child` operation；如果容器未定义 operation，则仅记录信息，不执行任务。
4) 顺序模式下维护“焦点容器”，聚焦即以绿色高亮（非阻塞），默认高亮第一个 operation 的目标。
5) 子容器命中/失败/到边界事件向父容器反馈；支持分页（滚动/点击“更多”）按步骤加载，直至边界。

相关实现：
- 根检测：`libs/containers/src/engine/RootDetector.ts`
- 发现：`libs/containers/src/engine/TreeDiscoveryEngine.ts`
- 运行控制：`libs/containers/src/engine/RuntimeController.ts`
- 队列：`libs/containers/src/engine/OperationQueue.ts`
- 焦点：`libs/containers/src/engine/FocusManager.ts`
- 计划：`libs/containers/src/engine/ExecutionPlanner.ts`

## Workflow 的驱动方式（Workflow Driving）

Workflow 只关心流程编排与操作目标，通过容器的 operation 推进下一步：
- Workflow Overlay：为某个 workflow 实例覆写容器的 `operations`/`runMode`/并发/优先级等行为。
- Workflow Plan：由步骤（containerId + operation + params + onSuccess/onFail）构成，按计划调用容器运行时接口推进。
- 上下文接力：Workflow 拿到 `contextId` 后，在各步骤中使用该 context 查询/执行，不与容器细节耦合。

相关文档与实现：
- 设计：`docs/architecture/WORKFLOW_V2_DESIGN.md`
- 行为覆写：`libs/containers/src/engine/WorkflowOverlay.ts`

## 服务接口（摘要）

- Container Engine（7703）：
  - `POST /v1/containers/context/create`：创建上下文，做根锚点检测→发现→启动运行；返回 `contextId`。
  - `GET /v1/containers/context/:id/graph`：导出容器图。
  - `GET /v1/containers/context/:id/focus`：查询当前焦点。
- Workflow API（7701）：
  - 浏览器直控端点（`/v1/browser/*`）、鼠标键盘原语、页面信息、容器操作、工作流运行等（详见 `docs/APIS/WorkflowAPI.md`）。

## 具体功能（当前阶段）

- 容器引擎 v2 最小闭环：根锚点检测 → 从根发现一层子容器 → 焦点绿色高亮（非阻塞） → 子容器入图与父子关系注册。
- 仅 class 选择器 DOM 搜索（不使用 XPath），父容器作用域内查询，降低误报。
- 默认 operation 为 `find-child`；未定义 operation 的子容器仅记录不执行。
- 上下文接力：通过 `contextId` 对接 Workflow，Workflow 只负责编排和目标选择。

## 下一步（建议）

1) 完成分页与边界闭环：在 RuntimeController 中实现滚动/点击“更多”的 `pagination` 流程与边界判定（新项停滞/显式提示/步数上限）。
2) 扩展执行队列：支持兄弟节点并行（可配置并发）与 dependsOn 约束；完善 ExecutionPlanner。
3) 增量再发现：Mutation/URL/Viewport 触发的局部再发现，带防抖与背压。
4) 只读端点：`/v1/containers/context/:id/metrics|trace`，输出命中率、耗时与步骤序列，便于调试。
5) 真实页面样例：提供 1688 搜索页 root/children 定义与最小 workflow 覆写，验证“根→子→分页→边界”的一条链路。

