# Launcher 架构设计

## 职责定位

脚本只做 CLI 参数解析 + 调用 launcher 模块。真正的业务逻辑全部在 launcher 目录下。

## 入口脚本（仅保留 2 个）

| 脚本 | 用途 | 内部调用 |
|------|------|----------|
| scripts/start-headful.mjs | 兼容旧参数 | launcher/headful-launcher.mjs |
| scripts/start_browser.sh | Shell 兼容 | 同上 |

## 启动器模块（核心）

### launcher/headful-launcher.mjs
- 清理端口 7701/7704
- 启动 Unified API（7701）
- 启动 Browser Service（7704）
- 创建浏览器会话 + Cookie 注入
- 启动浮窗（连接 7701/ws + 7701/bus）
- 验证容器匹配（通过 7701/ws）
- 默认：有头浏览器 + 有头浮窗
- 参数：--profile --url --headless

## 启动流程（代码层面）

1. **端口清理**：lsof -ti :7701 :7704 | xargs kill -9
2. **服务启动**：
   - npx tsx services/unified-api/index.ts（7701）
   - node libs/browser/remote-service.js --host 127.0.0.1 --port 7704 --ws-host 127.0.0.1 --ws-port 8765
3. **会话创建**：POST /command {command:"create_session", args:{profile,url,headless:false}}
4. **Cookie 注入**：POST /command {command:"inject_cookies", args:{profile}}
5. **浮窗启动**：cd apps/floating-panel && WEBAUTO_FLOATING_WS_URL=ws://127.0.0.1:7701/ws WEBAUTO_FLOATING_BUS_PORT=7701/bus WEBAUTO_FLOATING_HEADLESS=0 npm run dev
6. **健康验证**：WebSocket 连接 7701/ws，发送 containers:match，等待 response

## 健康检查标准

必须同时满足：
- ✅ Unified API /health 200
- ✅ Browser Service /health 200
- ✅ WebSocket 握手成功（收到 ready）
- ✅ containers:match 返回 success:true
- ✅ 返回数据包含 container_tree + dom_tree

## 错误定位

| 失败点 | 典型日志 | 排查方向 |
|--------|----------|----------|
| 端口占用 | "端口 7701 被占用" | lsof -ti :7701 |
| Unified API 未就绪 | "Unified API 健康检查超时" | curl 127.0.0.1:7701/health |
| Browser Service 未就绪 | "Browser Service 健康检查超时" | curl 127.0.0.1:7704/health |
| WebSocket 连不上 | "WebSocket 错误" | ws://127.0.0.1:7701/ws |
| 容器匹配失败 | "容器匹配: 失败" | 检查返回 data |
