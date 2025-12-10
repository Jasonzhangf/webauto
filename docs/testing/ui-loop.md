# UI & 容器回环测试

本轮改造的目标是：所有浏览器/浮窗交互都能通过**消息驱动**和**CLI**回环验证，不再依赖手动点 UI。下面的脚本组合就是标准回环：

1. `npm run service:controller:start`（可选，若让浮窗自己拉起则保持 `WEBAUTO_CONTROLLER_AUTOSTART=1`）
2. `npm run browser:oneclick -- --profile <profile> --url <url> --headless --dev`
   - 启动浏览器、会话管理、浮窗服务，并把浮窗置为 headless（`WEBAUTO_FLOATING_HEADLESS=1`）。
3. `npm run ui:test`
   - 等价于 `node scripts/ui/run-headless-tests.mjs`：
     - 通过 `WEBAUTO_FLOATING_BUS_PORT` 连接消息总线。
     - 驱动脚本 `scripts/ui/dev-driver.mjs` 按照场景依次发送 `ui.window.shrinkToBall`、`ui.window.restoreFromBall`、`ui.graph.expandDom` 等消息，验证窗口模式、DOM 展开、容器覆盖率都能返回对应事件。
     - 触发 `scripts/ui/highlight-smoke.mjs` 做高亮回环测试。
4. `scripts/ui/highlight-smoke.mjs` 现在会：
   - 通过 `scripts/ui/send-highlight-cli.mjs` 下发 `highlight_element` 与 `clear_highlight` 命令（WebSocket 8765）。
   - 读取 `~/.webauto/logs/highlight-debug.log`，确认有 request/result/clear，并且 `count > 0`。

> **必达标准**：`npm run ui:test` 成功意味着 UI 消息驱动、DOM 展开、容器覆盖、浏览器高亮都在 headless 环境验证通过；如果任一环节失败，脚本会返回非 0 并在日志中定位到缺失的消息或 log 事件。

后续新增的 UI 模块也必须在该流程中注册自己的消息（topic）与断言，这样才能保证所有功能都能“先测后交付”。
