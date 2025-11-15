# Workflow v2 编排设计（与容器 v2 解耦）

目标：容器（Container）是“砖块”，只负责定位与操作原语；Workflow 负责“流程编排与目标选择”，通过调用容器的 operation 来推进下一步。

## 职责分离

- Container（定位 + 操作）
  - 只关心：如何在作用域内找到元素（class 选择器）与提供可执行的操作（click/scroll/type/waitFor/find-child）。
  - 不关心：步骤顺序、条件分支、重试策略、业务语义。

- Workflow（编排 + 目标）
  - 只关心：操作流程（顺序/并行）、目标选择（哪一个容器的哪一个 operation）、何时触发下一步（基于结果/反馈）。
  - 通过容器的 operation 返回的结果与反馈（hit/fail/boundaryReached）来决定下一步。

## 核心概念

- WorkflowOverlay（实例覆写）：
  - 对容器定义的 `operations/runMode` 进行实例级覆写；
  - 可设定并发与优先级（供调度器使用）。

- WorkflowStep：
  - `containerId` + `operation` + `params`；
  - `onSuccess/onFail/next` 指向下一个步骤或结束。

- WorkflowPlan：
  - 一组步骤 + 起始步骤；
  - 可由 DSL/JSON 定义；
  - 在运行时映射到 RuntimeController 的执行接口。

## 最小运行闭环（建议）

1) Workflow 构建步骤：
```json
{
  "start": "open_list",
  "steps": {
    "open_list": { "containerId": "list_root", "operation": "find-child", "onSuccess": "process_first_page" },
    "process_first_page": { "containerId": "list_item", "operation": "find-child", "onSuccess": "maybe_next_page" },
    "maybe_next_page": { "containerId": "list_root", "operation": "scroll", "params": { "distance": 1200 }, "onSuccess": "process_first_page", "onFail": "end" }
  }
}
```

2) WorkflowRunner（示意）：
```ts
// 伪代码
while (step) {
  const result = await runtime.exec(step.containerId, step.operation, step.params);
  step = result.success ? steps[step.onSuccess] : steps[step.onFail];
}
```

## 与容器引擎 v2 的接口

- runtime.start(rootId, rootHandle, mode)
- runtime.currentGraph()/currentFocus()
- runtime.exec(containerId, operation, params) → { success, data, feedback }

说明：`exec` 将路由到对应容器的 OperationQueue 中相应 operation 的执行（或临时注入一次性 operation）。

## 默认高亮（绿色）与非阻塞

- 焦点改变时即时以绿色高亮（不阻塞后续执行）。
- Workflow 只消费结果/反馈，不与高亮强耦合。

## 演进

- 增加条件路由与重试策略；
- DSL 扩展与可视化编排；
- 指标上报与追踪。

