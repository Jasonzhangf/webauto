# Runtime Utilities

运行时工具统一收敛到 `runtime/infra/utils/scripts/`。

当前保留目录：
- `scripts/development/`：开发期调试脚本（会话内执行、高亮等）
- `scripts/service/`：服务启停与端口清理脚本
- `scripts/` 根脚本：跨场景工具（例如 `test-services.mjs`）

已移除：
- `local-dev/`
- `scripts/local-dev/`
- 其它历史遗留脚本目录
