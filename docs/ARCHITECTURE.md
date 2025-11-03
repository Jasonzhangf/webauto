# WebAuto 服务化架构（草案）

本架构将现有「网页 Workflow 引擎」与「UI 图像识别」模块以服务形式统一编排，满足：
- 工作流模块可启动浏览器，保持长驻、不退出；浏览器上下文在会话中持久化（SessionRegistry）。
- 图像识别以服务形式存在，接收 API 调用；同时提供 Node 代理层进行统一日志记录（不做鉴权）。
- 主控 Orchestrator 负责自动拉起两个服务、端口被占用则强杀、健康校验直至可用。

## 服务组件

- Orchestrator（主控服务）
  - 端口：`7700`
  - 职责：
    - 启动/停止/重启子服务（Workflow API、Vision Proxy）
    - 端口占用检测与强杀
    - 聚合健康状态
  - 仅与两个 Node 服务交互；Vision Proxy 内部自管 Python 子进程

- Workflow API 服务（网页工作流）
  - 端口：`7701`
  - 职责：
    - 运行工作流（调用现有引擎与节点体系）
    - 强制覆盖结束策略：`persistSession=true`、`cleanup=false`（浏览器不退出，SessionRegistry 持久化）
    - 会话管理（start/close/list）
    - 浏览器直控（导航、点击、输入、执行脚本、截图、高亮）

- Vision Proxy（UI 识别代理，含 Python 服务管理）
  - 端口：`7702`
  - 职责：
    - 对外转发识别请求与健康检查（/health, /recognize）
    - 统一记录日志（请求、响应、耗时、错误）
    - 进程内管理 Python 识别服务（FastAPI，默认端口 `8899`）的启动/健康/重启

## 启动顺序与健康

1. Orchestrator 启动后：
   - 检测/强杀端口：7701（workflow-api）、7702（vision-proxy）
   - 顺序拉起：Workflow API -> Vision Proxy
2. Vision Proxy 启动后：
   - 如 Python 服务未就绪，则在后台启动 `python-service/server.py`（8899），并轮询 `/health` 直至就绪。
3. Orchestrator `/health` 聚合两个子服务健康状态（Vision Proxy 的健康包含其下游 Python 服务可用性）。

## 会话生命周期

- Workflow API 运行工作流时将强制确保 EndNode：
  - `persistSession = true`（保留会话与浏览器）
  - `cleanup = false`（不关闭浏览器，由服务端 API 管理）
- 通过 `/sessions/close` 显式释放会话（关闭页面、Context、浏览器）。
- SessionRegistry 进程内存保存，服务重启会清空（如需跨重启共享，可后续扩展文件/DB 持久化）。

## 端口与强杀策略

- macOS/Linux：`lsof -ti :PORT | xargs kill -9`，失败重试，超时告警
- Windows（预留）：`netstat -ano | findstr :PORT` 解析 PID 后 `taskkill /F /PID`

## 目录结构（新增）

```
services/
  orchestrator/
    server.js
    lib/processManager.js
    config.js
    README.md
  workflow-api/
    server.js
    controllers/
      workflowController.js
      sessionController.js
      browserController.js
    lib/
      workflowService.js
      sessionAdapter.js
      portUtils.js
    README.md
  vision-proxy/
    server.js
    lib/
      pythonProcessManager.js
      requestLogger.js
      portUtils.js
    README.md
docs/
  APIS/
    WorkflowAPI.md
    VisionProxyAPI.md
    OrchestratorAPI.md
  PORTS.md
TODO.md
tasks/
  BOARD.md
  tracker.json
  labels.json
```

## 兼容与扩展

- 兼容现有工作流 JSON：Workflow API 在运行前对 EndNode 做策略注入/兜底追加。
- 高亮注入：现有 `highlight-service.js` 已在 `BrowserInitNode` 中注入，无需改动。
- 识别模型：Python 侧当前为模拟，后续可替换为真实模型服务（接口保持不变）。

