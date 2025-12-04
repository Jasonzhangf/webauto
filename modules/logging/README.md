# logging 模块

- **职责**：提供统一的日志/事件读取能力，聚合 `~/.webauto/logs` 下的浏览器、服务与会话日志，并暴露 CLI 调试入口。
- **CLI 能力**：
  - `cli.ts stream --source browser --lines 200`：按源或文件路径读取最近 N 行日志；
  - `cli.ts stream --session weibo-fresh`：自动映射到 `~/.webauto/logs/session-weibo-fresh.log`；
  - `cli.ts flush --source browser --truncate`：读取并可选地清空日志文件。
- **实现进度**：最小 tail/flush 能力已落地，后续会扩展实时 follow、结构化事件以及与 UI 的集成。
