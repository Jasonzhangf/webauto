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
2. 所有源码文件扩展名：`.ts`、`.mts`、`.js`、`.mjs` 均为 ES 模块；禁止使用 `.cjs`。
3. 禁止在 ES 模块中使用 `require`、`module.exports`、`__dirname`、`__filename`；统一改用 `import`、`export`、`import.meta.url`、`fileURLToPath`。
4. Electron preload 脚本必须使用 ESM（`.mjs`/`.mts`/`.js`），禁止生成 `.cjs` 版本；主进程与构建流程必须确保全链路 ESM。执行流程：升级 Electron ≥ 39，预加载脚本保持 `.mjs` 后缀，主进程 `webPreferences.preload` 直接指向 `.mjs`，测试用例必须走 ESM preload 回环。
5. 构建脚本、CLI 统一使用 ESM。
6. 违反上述规则即视为阻塞性 Bug，立即回滚或修复。
7. 浮窗 UI（apps/floating-panel）必须使用纯 ESM 架构，禁止混用 CJS。

## 新增规则（2025-12-24）

### 1. 代码修改禁止使用 Python 自动化脚本

禁止使用 Python 自动化脚本进行代码修改（如 `sed`, `awk` 配合 `python3 << 'EOF'`）。

**原因：** 自动化脚本容易出现语法错误和结构破坏，导致代码无法正常运行。

**替代方案：**
- 手动使用 `apply_patch` 工具
- 对于复杂修改，先分析代码结构，然后精确修改
- 小型修改使用简单的 sed 命令

### 2. 代码修改统一使用 TypeScript

除了必要的浏览器底层修改，所有代码修改必须使用 TypeScript/TS。

**原因：** 保持代码类型安全，利用 TypeScript 的类型系统。

**范围：**
- apps/floating-panel/src/renderer/ - 使用 TypeScript/TS
- modules/ 目录下的源码 - 使用 TypeScript

### 3. 浏览器 CLI 封装后禁止在应用层修改

浏览器 CLI 的修改应该通过命令行接口进行，禁止在应用层直接修改浏览器 CLI 以下的代码。

**原因：** 保持代码分层清晰，避免跨层修改导致的维护问题。

**范围：**
- apps/floating-panel/ 中的所有代码
- services/ 目录下的所有代码

---
