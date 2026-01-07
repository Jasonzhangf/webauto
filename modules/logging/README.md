# logging 模块

- **职责**：提供统一的日志/事件读取能力，聚合 `~/.webauto/logs` 下的浏览器、服务、会话与 Workflow 日志，并暴露 CLI 调试入口。

## CLI 能力

- `cli.ts stream --source browser --lines 200`：按源读取最近 N 行浏览器/服务日志；
- `cli.ts stream --session xiaohongshu_fresh`：自动映射到 `~/.webauto/logs/session-xiaohongshu_fresh.log`（如存在）；
- `cli.ts stream --source debug --lines 200`：读取 `debug.jsonl` 中最近的结构化调试/Workflow 事件；
- `cli.ts flush --source browser --truncate`：读取并可选地清空日志文件。

## Workflow 日志

- 结构化 Workflow 事件会写入 `~/.webauto/logs/debug.jsonl`，仅在环境变量 `DEBUG=1` 时启用。
- 核心 API：
  - `logDebug(module, event, data)`：通用调试日志（模块级）；
  - `logWorkflowEvent({ workflowId, workflowName, stepIndex, stepName, status, sessionId, error, anchor })`：Workflow 级事件。
- `WorkflowExecutor` 已接入 `logWorkflowEvent`，对每个步骤输出：
  - `status=start|success|error`；
  - step 名称、索引、sessionId/profileId；
  - Block 返回的 `anchor` 信息（用于回放小红书搜索/详情/评论的锚点 Rect 和容器 ID）。

## 实现进度

- 已完成：基础 tail/flush 能力、`logs:stream` Controller 集成、`debug.jsonl` + Workflow 结构化日志写入。
- 后续计划：实时 follow、与浮窗 UI 的联动展示、按 Workflow/Session 过滤的专用 CLI。
