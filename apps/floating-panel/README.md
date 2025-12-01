# WebAuto Floating Console

跨平台 Electron 浮窗应用，作为 WebAuto 控制平面 UI：

- 独立窗口、置顶 + 拖拽，适合与浏览器同屏调试
- 通过 WebSocket (`ws://127.0.0.1:8765` 默认) 调用 Python 控制平面
- 内置会话管理（创建/列表/删除）、容器匹配、实时日志查看
- 与 DOM 注入菜单解耦，UI 崩溃不会阻断 CLI

## 开发/运行

0. **一键启动（推荐验证原型）**
   ```bash
   ./scripts/run-floating-console.sh
   ```
   > 支持 `--host` / `--port` 传参，会自动拉起 Python WS 服务，再启动浮窗 UI，退出时一并清理。

1. **安装依赖**（第一次使用）
   ```bash
   cd apps/floating-panel
   npm install
   ```
2. **启动 WebSocket 服务**（从仓库根目录运行 Python server）
   ```bash
   cd ../..
   python scripts/start_websocket_server.py --host 127.0.0.1 --port 8765
   cd apps/floating-panel
   ```
3. **启动浮窗应用**
   ```bash
   cd apps/floating-panel
   npm run dev   # 开发模式，可用 npm start 直接运行
   ```
4. 在 UI 中配置 host/port（可保存到本地），点击“连接”即可实时查看会话状态、调试容器匹配。

> 注意：Log 面板会展示每条 WebSocket 命令/响应；窗口默认置顶，可用左上角📌按钮切换。
