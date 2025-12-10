# UI Controller Service

该目录用于承载浮窗 UI 和底层能力之间的独立服务层。目标：

1. 监听消息总线（WebSocket/IPC），接收来自 UI 的请求。
2. 通过 CLI/模块化能力（browser-control、session-manager、operations 等）串联执行。
3. 统一记录日志、健康状态，并把结构化响应再广播给 UI。
4. 提供脚本化入口，CI 可以直接 `node services/controller/src/index.ts --bus ws://...` 运行黑盒测试。

后续会把当前 Electron main 进程里的业务逻辑迁移到这里，形成「能力 → 服务 → UI」的分层结构。
