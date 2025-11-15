# 容器基础引擎 v2 设计（基于现有 v1 改造）

本设计基于现有 v1 架构，重点增强引擎：树状搜索、父子关系注册、自动发现、标准执行顺序与运行时语义，严格满足以下约束：

1) 从根容器开始逐层发现；2) 子容器缺省仅记录信息，只有定义了 operation 才执行任务；3) 默认 operation 为 find-child；4) operation 支持 queue 顺序执行；5) 父容器多个子容器默认顺序执行，支持并行模式；6) 顺序模式下存在“焦点容器”，默认高亮第一个 operation；7) 子容器命中需反馈父容器；8) 仅使用 CSS class 做 selector（DOM 搜索），不用 XPath；9) 支持分步加载（滚动/点击“更多”）直至边界。

## 目录结构

```
libs/containers/
  src/
    engine/
      types.ts                 # v2 核心类型
      TreeDiscoveryEngine.ts   # 树状发现（BFS），基于 class 的选择器
      RelationshipRegistry.ts  # 父子/依赖关系注册
      OperationQueue.ts        # Operation 队列与调度骨架
      FocusManager.ts          # 焦点容器管理
      ExecutionPlanner.ts      # 基于依赖图的拓扑计划
      RuntimeController.ts     # 运行控制器：发现→执行→增量加载→反馈
  schema/
    container.v2.schema.json  # 容器定义 v2 JSON Schema
    index.v2.schema.json      # 站点索引 schema（兼容现有 index）
```

## 数据模型（v2）

- ContainerDefV2
  - selectors: 仅 class 列表，支持 primary/backup/score
  - children/dependsOn: 静态关系
  - runMode: sequential | parallel（默认 sequential）
  - operations: 缺省为 `[ { type: 'find-child' } ]`
  - pagination: { mode: scroll | click, targetSelector?, maxSteps?, delayMs? }
- ContainerNodeRuntime
  - state: unknown | located | stable | failed
  - opQueue: OperationInstance[]（pending → running → done/failed）
  - feedback: { hits, fails, boundaryReached? }
  - children: 运行时识别到的子容器 id 列表
- ContainerGraph
  - nodes, edges(parentToChild/depends), indices(byName/byType/byScope/byCapability/byPagePattern)

## 标准流程（端到端）

1. 读取站点 Registry 与 PageContext（URL/标题/语言/主题/UA）。
2. 从 root 容器开始发现：将 root 节点加入图并初始化 opQueue（若未定义则默认 find-child）。
3. BFS 扫描：每命中父容器即按定义搜索其子容器（作用域为父容器 subtree）。
4. 候选评分与验证：可见性/尺寸/邻域文本/结构一致性校验（逐步引入）。
5. 构建关系图：登记 parent→child 与 dependsOn，冲突消解与去重。
6. 生成执行计划：拓扑化按依赖与 runMode（顺序/并发）排序步骤。
7. 执行：顺序模式下维护焦点容器并高亮其第一个 operation；并发模式按限流执行兄弟节点。
8. 反馈：子容器 located/stable/failed/boundaryReached 事件上报父容器更新反馈与计划。
9. 增量加载：对于分页容器按 pagination 策略（滚动/点击）触发 next；达到边界停止。

## 页面访问执行流程（与你提出的实际流程完全对齐）

1) 页面访问（刷新或定向打开）时：通过“根容器锚点”检测是否存在根容器。
- 根容器锚点即 `ContainerDefV2.anchors`（如未配置则回退到 `selectors`）。
- RootDetector 基于 DOM 的 class 搜索进行检测（禁用 XPath）。
- 若未命中，退出本轮流程；命中则认为 root 容器已发现。

2) 根容器被发现后：按根容器注册的子容器进行搜索，梳理动态容器树（默认行为）。
- TreeDiscoveryEngine 从 root 开始 BFS，限定在父容器 subtree 的 DOM 搜索。
- 生成 ContainerGraph（父子/依赖关系），并对每个容器构建默认 operation 队列（find-child）。

3) 基于“根容器实例（workflow）”注册的容器行为进行操作。
- 使用 Workflow Overlay（每个 workflow 对容器的行为覆写）：
  - 可设置某容器的 `operations`、`runMode`、优先级/并发等。
  - 无覆写则执行容器定义内的默认 operations（若为空则仅记录信息，不执行）。
- RuntimeController 读取计划并执行（顺序/并行），维护焦点、高亮、反馈与分页 next 流程。

对应代码骨架：
- `RootDetector.ts`（根容器锚点检测）
- `PageLifecycle.ts`（onNavigate → detect → discover → execute）
- `WorkflowOverlay.ts`（按 workflow 实例覆写容器行为）

## 服务形态与上下文接力（Service + Context Relay）

- Container Engine 以独立服务运行（`PORT_CONTAINER`），通过 `contextId` 管理一次页面上的运行上下文（容器图/焦点/计划）。
- Workflow 引擎（Workflow API）仅做流程编排，可持有 `contextId` 与 `sessionId` 在步骤间接力。
- 容器=砖块（定位+操作原语），Workflow=编排（步骤与目标）；二者以 `contextId` 解耦对接。
- 参考 API：`docs/APIS/ContainerEngineAPI.md`。

## 流程图（发现与执行）

发现（从根到子，BFS）：

```
[Start] → 加载 RootDef → 创建 RootNode(opQueue=默认 find-child)
  → 入队 Root
  → [BFS Loop]
      取父节点 → 对每个 childDef：
        使用 class 选择器在父作用域查询 → 命中?
           ├─ 否：记录 trace，尝试下一个 childDef
           └─ 是：创建子节点，登记 parent→child，子节点入队
  → 队列为空 → [End]
```

执行（顺序 + 焦点 + 反馈 + 增量）：

```
[Start] → 选定执行根与模式
  → 构建拓扑执行计划（按父先子、dependsOn、runMode）
  → 顺序模式：
      取下一个步骤 → 聚焦容器 (Focus=containerId) → 高亮第一个 operation → 执行 operation
        → 若 operation=find-child：
            在当前容器作用域发现子容器 → 命中? 回写 children & 反馈 → 下一步
        → 若 operation=click/scroll/type/waitFor：按配置执行 → 结果写入 opInstance
        → 若分页：按策略触发 next（滚动/点击）→ 局部再发现 → 到边界则 boundaryReached=true
  → 并行模式：同层兄弟按并发上限同时执行，上层依赖按序
  → 计划耗尽 → [End]
```

## 关键点：与 9 条约束对齐

- 根→子树发现：TreeDiscoveryEngine BFS，父作用域限制。
- 默认 operation：OperationQueue 若无定义则注入 `find-child`。
- 有/无 operation：无则仅记录；有则按队列执行。
- 队列执行：支持顺序/并发模式与并发上限；Scheduler 控制。
- 焦点容器：FocusManager 顺序模式维护；进入容器默认高亮第一个 operation。
- 高亮策略：聚焦容器时默认以“绿色”高亮，非阻塞（不等待高亮完成）。
- 反馈：RuntimeController 在子节点命中/失败时，更新父节点 `feedback` 与图。
- 仅 class 选择器：selectors 为 class 列表，不使用 XPath。
- 分步加载：PaginationConfig（scroll/click）；到边界停止（新项停滞/显式提示/最大步数）。

## 接口与依赖

引擎对外 TS 接口（参见 `src/engine/*.ts` 骨架）：
- TreeDiscoveryEngine(discoverFromRoot/discoverChildren)
- RelationshipRegistry(addParentChild/addDepends)
- OperationQueue/Scheduler（构建默认队列、拉取下一步）
- FocusManager（set/get）
- ExecutionPlanner（buildPlan）
- RuntimeController（start/currentGraph/currentFocus）

与浏览器层的依赖（注入）：
- queryByClasses(scopeHandle, selector)
- visible(handle)、bboxOf(handle)
- highlight(bboxOrHandle, opts?)：默认 `{ color:'#00C853', persistent:true }`
- perform(node, op)
- wait(ms)

## 迁移与兼容

v1 容器定义 → v2：
- 将 v1 选择器转为 class 列表（或保持最接近的 class variant）。
- 未配置 operations 的容器将自动仅记录信息。
- v1 解析入口在 v2 中由 TreeDiscoveryEngine 统一调度（可逐步接管）。

## 验收标准（第一阶段最小闭环）

- 在真实页面（如 1688 搜索或微博列表）上：
  - 根→列表容器→列表项容器能够被发现并导出 ContainerGraph。
  - 无 operations 的列表项容器仅记录；父容器收到命中反馈（计数增加）。
  - 顺序模式下焦点正确、默认高亮第一个 operation。
  - 分页容器能通过滚动或点击“更多”触发 next，至边界停止。

## 后续增强（不在本轮实施）

- 文本/结构/视觉多策略融合与回退；
- Metrics 与 Trace 端点：`/v1/containers/graph|metrics|trace`；
- 质量闭环：失败容器自动降级与再采集；
- 视觉回退（Vision Proxy）与区域优先裁剪。
