# session-manager 模块

- **职责**：基于浏览器控制平面创建/管理自动化会话，负责 profile 独占、模式切换与基础状态查询。
- **CLI 能力**：
  - `cli.ts list`：列出当前服务端会话（或 test-mode 下的内存会话）；
  - `cli.ts create --profile <id> [--url <url>] [--headless]`：调用浏览器服务 `start` 命令创建 session；
  - `cli.ts delete --profile <id>`：通过服务 stop 命令释放 session。
- **实现进度**：最小会话控制逻辑已落地（`src/index.ts`），后续将继续扩展能力分配、WS 绑定和 CLI 输出。
