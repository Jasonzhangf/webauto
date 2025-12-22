# WebAuto 架构设计原则与模块职责

## 统一端口

- 7701：Unified API（HTTP + WebSocket + Bus）
- 7704：Browser Service（会话管理）

## 启动方式

- 唯一脚本：node scripts/start-headful.mjs
- 业务逻辑：launcher/headful-launcher.mjs

## 模块职责

- 脚本：CLI 参数解析，不含业务 logic
- 模块：独立 CLI，通过 HTTP/WebSocket 通信
- 服务：无业务 logic，纯技术实现
- UI：状态展示，无业务 logic

## 详细文档

- docs/arch/PORTS.md：端口与环境变量
- docs/arch/LAUNCHER.md：启动器架构
- docs/arch/AGENTS.md：完整设计原则

## 快速验证

```bash
# 统一健康检查
curl http://127.0.0.1:7701/health

# 浏览器服务健康
curl http://127.0.0.1:7704/health
```
## 硬性规则：模块系统
1. 全仓库统一使用 ES Module（`"type": "module"`），禁止混用 CommonJS。
2. 所有源码文件扩展名：`.ts`、`.mts`、`.js`、`.mjs` 均为 ES 模块；`.cjs` 仅用于必须 CommonJS 的遗留依赖。
3. 禁止在 ES 模块中使用 `require`、`module.exports`、`__dirname`、`__filename`；统一改用 `import`、 `export`、 `import.meta.url`、`fileURLToPath`。
4. Electron preload 脚本必须使用 `.cjs`，主进程显式加载 `.cjs`；禁止出现 `.mjs` 路径以避免模块冲突。
5. 构建脚本、CLI 统一使用 CommonJS，Node ≥ 14 原生支持。
6. 违反上述规则即视为阻塞性 Bug，立即回滚或修复。
7. 浮窗UI（apps/floating-panel）必须使用纯CJS架构，禁止混用ESM以避免Electron加载错误。
