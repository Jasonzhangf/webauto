# WebAuto Workflow 执行与节点模型（v2 方案）

> 目标：统一脚本调用方式，让所有业务逻辑都落在 Block/Workflow 中，并且每一步都有可追踪的上下文与错误日志；同时把 Block 和 Workflow 都抽象为“节点”，支持大 Workflow 串联小 Workflow。

## 1. 术语与分层

- **Block（基础块）**：最小执行单元，一个函数 `execute(input) => output`，内部只能调用统一 API（controller/container-operation 等），不能写页面级业务脚本。
- **Workflow Definition（定义）**：按顺序列出若干 Step，每个 Step 调用一个 Block 或子 Workflow。
- **Workflow Executor（执行器）**：负责按定义顺序执行 Step，维护上下文并记录日志。
- **Workflow Node（节点）**：统一抽象，Block 是原子节点，子 Workflow 也是节点；大 Workflow 可以看作由多个节点串联而成。

## 2. WorkflowExecutor v2 行为约定

### 2.1 输入与上下文

- `execute(definition, initialContext?)`：
  - `definition`: `{ id?, name?, steps: [{ blockName, input }] }`
  - `initialContext`: 任意对象，作为第 0 步的上下文起点（脚本只需要把 `sessionId/keyword/targetCount/env` 放进来）。
- 执行时内部维护一个 `context`：
  - 初始：`context = { ...initialContext }`
  - 每个 Step 执行成功后：`context = { ...context, ...result }`
  - Step 的 `input` 支持 `$xxx` 引用：在执行前会通过当前 `context` 做递归替换。

### 2.2 返回结果（带步骤级 trace）

`WorkflowExecutionResult` 结构扩展为：

- `success: boolean`：整体是否成功（没有严重错误）。
- `errors: string[]`：归总错误信息。
- `results: any[]`：每个 Step 的原始返回结果（按顺序）。
- `steps: { index, blockName, input, output, error?, contextAfterStep }[]`：
  - `input`：该 Step 解析后的最终输入（已做 `$xxx` 替换）。
  - `output`：Block/子 Workflow 返回的对象。
  - `error`：若该 Step 返回 `result.error` 或抛出异常，则记录错误字符串。
  - `contextAfterStep`：合并后的上下文快照（可以是精简版，只包含关键字段）。

> 要求：这份结构是脚本 / 调试工具的唯一真相来源，所有“为什么失败到哪一步”必须可以通过 `steps[]` 重建。

### 2.3 日志与错误

- 每个 Step 自动写结构化日志（现有 `logWorkflowEvent` 已接入）：
  - `status: 'start' | 'success' | 'error'`
  - `workflowId/workflowName/stepIndex/stepName`
  - `sessionId/profileId`
  - `anchor`（如果 Block 输出里有）
  - 新增：精简版 `inputSummary`（去掉巨大数组和敏感字段）。
- 错误处理：
  - Block 内部返回 `error` 字段 → 视为该 Step 失败，记录到 `steps[index].error` 和 `errors[]`。
  - Block 抛异常 → 捕获后写入统一错误文案 `BlockName execution failed: ...`。

## 3. 节点模型：Block 与 Workflow 的统一抽象

### 3.1 节点定义

- 逻辑上我们把“可以被执行并返回一个部分上下文”的东西都视为节点：
  - Block：形如 `EnsureSession`, `GoToSearchBlock`, `CollectCommentsBlock` 等；
  - 子 Workflow：例如 `XiaohongshuLoginWorkflow`, `XiaohongshuSearchCollectWorkflow`。
- 节点接口（概念层）：

```ts
interface WorkflowNode {
  id: string;
  execute(input: any, parentContext: any): Promise<Record<string, any>>;
}
```

- WorkflowExecutor 不关心节点内部细节，只关心“输入 → 输出 patch”。

### 3.2 子 Workflow 作为节点：CallWorkflowBlock

- 新增通用 Block：`CallWorkflowBlock`：
  - 输入：
    - `workflowId: string`：要调用的子 Workflow 编号。
    - `context?: any`：覆盖/补充传给子 Workflow 的 initialContext。
    - `mergeMode?: 'merge' | 'namespace'`：输出如何回写父上下文。
    - `stopOnFailure?: boolean`：子 Workflow 失败时是否直接让当前 Step 失败。
  - 行为：
    1. 组合 initialContext：`childContext = { ...parentContext, ...(input.context || {}) }`
    2. 调用 `runWorkflowById(workflowId, childContext)`。
    3. 根据 `mergeMode`：
       - `merge`：把 `childResult.results` 最后一条（或某个聚合输出）平铺到父 `context`。
       - `namespace`：写成 `context[workflowId] = childResult`。
    4. 如果 `stopOnFailure && !childResult.success`：
       - 返回 `{ success: false, error: 'Child workflow failed: ...', childResult }`。
       - 让当前 Step 被标记为 `error`。

> 约定：小 Workflow（例如登录、持久化）优先用 CallWorkflowBlock 作为“节点”挂到更大的组合 Workflow 里。

## 4. Workflow 注册与统一调用

### 4.1 Workflow Registry

- 新增一个统一注册表（例如 `modules/workflow/config/workflowRegistry.ts`）：
  - 暴露：`registerWorkflow(def)` / `getWorkflowById(id)`。
  - 把所有“正式对外的 Workflow”挂在这里：
    - `xiaohongshu-login`
    - `xiaohongshu-search-collect`
    - `xiaohongshu-note-persist`
    - ……（微博等）
- 脚本和 Block 不再从 random TS 文件手动 import definition，而是通过 id 查询。

### 4.2 统一入口：runWorkflowById

- 在 `modules/workflow/src` 增加一个 helper：

```ts
export async function runWorkflowById(
  workflowId: string,
  initialContext: any,
): Promise<WorkflowExecutionResult> {
  const def = workflowRegistry.get(workflowId);
  if (!def) throw new Error(`Workflow not found: ${workflowId}`);

  const executor = createDefaultWorkflowExecutor(); // 内部统一注册所有 Block
  return executor.execute(def, initialContext);
}
```

- 脚本层统一模式：
  1. 解析 CLI 参数；
  2. 构造 `initialContext`（`sessionId/keyword/targetCount/env` 等）；
  3. 调用 `runWorkflowById('xiaohongshu-search-collect', initialContext)`；
  4. 根据 `result.success` / `result.errors` 决定进程退出码。

> 所有业务脚本必须遵守：**只调用 Workflow，不直接操作 DOM，不直接写抓取逻辑**。

## 5. 小红书主链路在该模型下的拆分

### 5.1 原子 Block（节点）

- 会话与登录：
  - `EnsureSession`
  - `EnsureLoginBlock`
  - `SessionHealthBlock`
  - `LoginRecoveryBlock`
- 搜索与列表：
  - `WaitSearchPermitBlock`
  - `GoToSearchBlock`
  - `CollectSearchListBlock`
- 详情与评论：
  - `OpenDetailBlock`
  - `ExtractDetailBlock`
  - `WarmupCommentsBlock`
  - `ExpandCommentsBlock`
  - `CollectCommentsBlock`
  - `CloseDetailBlock`
  - `ErrorRecoveryBlock`
  - `AnchorVerificationBlock`
- 持久化与监控：
  - `ProgressTracker`（工具类）
  - `PersistXhsNoteBlock`（待新增：将帖子写入 `~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/`）
  - `MonitoringBlock`
  - `BehaviorRandomizer` / `ErrorClassifier` / `GracefulFallbackBlock`

### 5.2 Workflow 级节点（组合）

- `xiaohongshu-login`：
  - Step1: EnsureSession
  - Step2: EnsureLoginBlock
- `xiaohongshu-note-collect`（单 Note 详情 + 评论 + 持久化）：
  - Step1: OpenDetailBlock
  - Step2: ExtractDetailBlock
  - Step3: WarmupCommentsBlock + ExpandCommentsBlock / CollectCommentsBlock
  - Step4: PersistXhsNoteBlock
  - Step5: CloseDetailBlock（含错误恢复）
- `xiaohongshu-search-collect`（主采集 Workflow）：
  - Step1: CallWorkflowBlock(`xiaohongshu-login`)
  - Step2: Search 循环（WaitSearchPermitBlock + GoToSearchBlock + CollectSearchListBlock）
  - Step3: 对列表中每个 note 调用 `CallWorkflowBlock('xiaohongshu-note-collect')`
  - Step4: 调用 ProgressTracker/MonitoringBlock 完成断点续跑与告警

> 其中 “Search 循环 + 遍历 note 列表” 部分仍由脚本负责“循环控制”和任务配额，实际操作完全由 Block/Workflow 完成。

## 6. 约束与最佳实践

1. **脚本只做编排**：
   - CLI 解析、参数检查、调用 `runWorkflowById`、处理返回结果。
   - 禁止在脚本中直接调用 `browser:execute` 写自己的 DOM 逻辑。
2. **所有页面行为都必须下沉到 Block**：
   - 滚动、点击、“展开评论”、extract、下载图片等，都通过容器 operation（`click/scroll/extract`）+ Block 完成。
3. **每个 Step 必须可追踪**：
   - Block 的输出需要包含足够的信息（锚点、Rect、统计计数等），便于在 `WorkflowExecutionResult.steps[]` 和日志里重建行为链。
4. **Workflow 之间的连接一律通过 CallWorkflowBlock 或 runWorkflowById**：
   - 禁止在 Block 里直接 import 并调用某个 Workflow 的 execute 函数。
5. **错误恢复放在 Workflow 内部，而不是脚本里散落逻辑**：
   - ESC 恢复、回退到搜索页等逻辑由 `ErrorRecoveryBlock`/相关 Block 承担，脚本只看到“这一步成功/失败”。

---

后续代码改造会按照本设计逐步推进：
- 扩展 `WorkflowExecutor` 返回步骤级 trace；
- 实现 `CallWorkflowBlock` 与 `workflowRegistry` + `runWorkflowById`；
- 将小红书主链路迁移到上述“节点 + Workflow 串联”的模型上，脚本层只保留编排和参数处理。

