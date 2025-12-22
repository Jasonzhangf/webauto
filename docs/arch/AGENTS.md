# WebAuto 架构设计原则（统一版）

## 统一端口

- 7701：Unified API（HTTP + WebSocket + Bus）
- 7704：Browser Service（会话管理）

## 模块职责

- 脚本：CLI 参数解析，不含业务逻辑
- 模块：独立 CLI，通过 HTTP/WebSocket 通信
- 服务：无业务逻辑，纯技术实现
- UI：状态展示，无业务逻辑

## 启动方式

- 唯一脚本：`node scripts/start-headful.mjs`
- 业务逻辑：`launcher/headful-launcher.mjs`

## 快速验证

```bash
# 标准启动（有头浏览器 + 浮窗）
node scripts/start-headful.mjs --profile weibo_fresh --url https://weibo.com

# 调试模式（无头）
node scripts/start-headful.mjs --profile weibo_fresh --url https://weibo.com --headless

# 统一健康检查
curl http://127.0.0.1:7701/health

# 浏览器服务健康
curl http://127.0.0.1:7704/health
```
