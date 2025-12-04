# browser-control 模块

- **职责**：抽象浏览器生命周期，包括 profile 目录独占、前/后台(headless) 切换、DevTools 管控与 DOM 捕获。
- **CLI 能力**：
  - `cli.ts dom-dump/dom-tree`：输出原始 HTML 及裁剪后的 DOM 树（支持 fixture）；
  - `cli.ts launch`：一键启动浏览器服务 + 会话（继承原 one-click-browser 逻辑），支持 `--profile`、`--url`、`--headless`、`--no-dev` 等参数；
  - `cli.ts status`：检查浏览器服务健康度与活跃会话；
  - `cli.ts stop`：按 profile 停止会话/清理独占进程。
- **实现进度**：浏览器拉起逻辑已迁入 `src/launcher.ts`，可通过 CLI 调用；后续将继续把 Python/Node 双端脚本统一至该模块。
