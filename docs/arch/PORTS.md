# 端口约定与环境变量

## 统一端口（新架构）

| 端口 | 服务 | 用途 | 实现文件 |
|------|------|------|----------|
| 7701 | Unified API | HTTP + WebSocket + Bus | services/unified-api/index.ts |
| 7704 | Browser Service | 浏览器会话管理 | services/browser-service/index.ts |
| 7790 | SearchGate | 搜索节流服务（每 key 60s 最多 2 次） | scripts/search-gate-server.mjs |

## 环境变量

### 浮窗相关
- `WEBAUTO_FLOATING_WS_URL`：WebSocket 端点（默认：ws://127.0.0.1:7701/ws）
- `WEBAUTO_FLOATING_BUS_PORT`：Bus 端口（默认：7701，连接到 /bus）
- `WEBAUTO_FLOATING_HEADLESS`：浮窗是否无头（默认：0，显示窗口）

### 启动参数
- `--profile <name>`：Profile 名称（默认：weibo_fresh）
- `--url <url>`：目标 URL（默认：https://weibo.com）
- `--headless`：无头模式（仅用于调试，无可见窗口）

### 搜索节流
- `WEBAUTO_SEARCH_GATE_PORT`：SearchGate 监听端口（默认：7790）；
- `WEBAUTO_SEARCH_GATE_URL`：Workflow 侧调用 SearchGate `/permit` 的完整 URL（默认：`http://127.0.0.1:7790/permit`）。

### 移除的端口
以下端口已合并到 7701，不再使用：
- 8970（Controller）
- 8790（Bus Bridge）
- 8765（独立 WebSocket）

## 启动流程

1. 清理 7701/7704 端口
2. 启动 Unified API（7701）
3. 启动 Browser Service（7704）
4. 创建浏览器会话 + 注入 Cookie
5. 启动浮窗（连接 7701/ws 和 7701/bus）
6. 验证容器匹配（通过 7701/ws）
