# Agents Dev Mode 指南

为避免调试过程中弹出的浏览器/浮窗影响主机使用，我们提供了“两种模式”：

| 模式 | 启动方式 | 浏览器 | 浮窗 |
| ---- | -------- | ------ | ---- |
| 默认模式 | `npm run browser:oneclick ...` | 有头（可见窗口） | 有头（浮窗 UI） |
| Dev 模式 | `npm run browser:oneclick -- --dev-mode ...` | 无头（`headless=true`） | 不启动浮窗（或自行用 `WEBAUTO_FLOATING_HEADLESS=1` 手动调试） |

## 如何使用 Dev 模式

```bash
npm run browser:oneclick -- --profile weibo-fresh --url https://weibo.com/ --dev-mode
```

效果：
- 自动将浏览器会话设置为 `headless=true`
- 默认跳过浮窗（等价于 `--no-dev`），不会弹出任何 Electron 窗口
- 控制台输出 `[one-click] 开启 dev 模式...` 提示
- 需要调试浮窗时，可单独运行：

  ```bash
  cd apps/floating-panel
  WEBAUTO_FLOATING_HEADLESS=1 WEBAUTO_FLOATING_DEBUG=1 npm run dev
  ```

这样浮窗也在后台（无界面）启动，日志输出到终端。

## 环境变量一览

| 变量 | 说明 |
| ---- | ---- |
| `WEBAUTO_DEV_MODE=1` | 由 `--dev-mode` 自动设置，表示当前为开发测试场景 |
| `WEBAUTO_FLOATING_HEADLESS=1` | 浮窗以无界面模式运行（可在需要时手动设置） |
| `WEBAUTO_FLOATING_DEBUG=1` | 开启浮窗前端的详细日志，便于调试 |

## 建议

- 日常联调/演示：使用默认模式，方便观察浏览器和浮窗。
- 需要在后台运行脚本或你不方便被打扰时：使用 `--dev-mode`。
- 任何时候若要停止旧实例，执行 `pkill -f floating-panel` / `pkill -f one-click-browser` 清理后再启动。

## 黑盒测试约定

所有 UI/代理相关测试必须通过“黑盒、消息驱动”的方式模拟真实用户行为：

1. **浮窗总线**：浮窗会在 `WEBAUTO_FLOATING_BUS_PORT`（默认 8790）暴露一个 WebSocket，总线主题与 `window.bus` 一致。调试脚本只能通过该端口发送/订阅消息，不可直接调用内部函数。
2. **脚本入口**：使用 `npm run ui:test`（自动启动 headless 的 `browser:oneclick` + `scripts/ui/dev-driver.mjs`）来驱动测试，它会发布 `ui.window.*`、`ui.graph.expandDom` 等消息并等待事件回执，确保行为与用户点击一致。若你已经手动起好了浮窗，也可运行 `npm run ui:test:driver` 单独触发消息流。
3. **扩展用例**：新增测试时，也必须拆解成“发布消息 → 等待对应总线事件”这一流程，禁止直接操作 DOM 或调用私有 API。

## 交付前的必跑流程

- 所有交付必须在 **Dev 模式（headless）** 下先运行 `npm run ui:test`，确保消息驱动的黑盒测试完整通过。
- `npm run build` 已经内置调用 `npm run ui:test`。构建出现的任何 UI 黑盒测试失败都视为交付失败，必须修复后才能继续。
- CLI、服务端脚本、UI 层的新增功能都需要及时补充对应的黑盒测试，否则无法视为完成。

只有黑盒测试通过后，才能在有界面模式下演示或交付结果。
