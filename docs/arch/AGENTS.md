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

## 快速验证

```bash
# 统一健康检查
curl http://127.0.0.1:7701/health

# 浏览器服务健康
curl http://127.0.0.1:7704/health
```

## Agent 能力（调试可用工具）

1. **浏览器 WS/CLI 能力**  
   - 通过 Unified API 暴露的 HTTP/WS 接口实时读取浏览器状态（URL、DOM、Cookie、截图等）  
   - 使用浏览器 CLI 执行脚本、模拟键鼠操作、导航、刷新页面，无需重启 session  
   - 适用于：快速验证 DOM 提取、脚本注入、页面跳转、截图等调试场景

2. **容器 CLI 能力**  
   - 可针对匹配到的容器发送指令（appear/disappear 监听、自动点击、状态查询）  
   - 适用于：检查容器状态、高亮容器、执行容器级动作

3. **事件订阅能力**  
   - 通过 Bus/WebSocket 订阅所有反馈事件，实时了解自动化执行结果与错误  
   - 适用于：构建闭环、调试长链路任务、记录操作日志

4. **高亮定位能力**  
   - 可对自定义选择的元素进行高亮、清理操作，用于确认定位是否准确  
   - 适用于：排查 DOM 选择器偏差、确认点击区域、辅助视觉验证

## 调试与登录要求

- **固定使用 profile**：所有 Web 调试必须复用 `xiaohongshu_fresh` 会话，禁止裸登或额外创建浏览器窗口，确保 Cookie/状态持续存在。
- **登录锚点检测**：进入工作流前必须检测登录成功标记（如用户头像、昵称、站内“已登录”元素）；缺失时自动跳转登录页并等待人工登录，成功后再继续任务并保存 Cookie。
- **容器驱动 workflow**：评论滚动、点击“展开 X 条回复”、图片抓取等动作需由容器 CLI 驱动，脚本仅用于验证能力。容器事件配合 WS/Bus 订阅构成闭环。
- **调试闭环**：每次调试要记录所用关键字、脚本/容器操作、成功与否，必要时高亮定位元素并截图/日志保存，方便回环验证与风控管理。
- **容器树规范**：每个页面的根容器只负责该页面的入口匹配及顶级布局，所有子容器都挂在对应页面根下（类似 DOM 结构）。禁止跨页面乱挂容器，保持容器树层级清晰，方便自动匹配与 workflow 复用。
- **容器格式参考**：若需新增/修改容器，先阅读 `container-library/README.md`（通用规范）及具体站点的 README（如 `container-library/xiaohongshu/README.md`），确保目录/ID/children 的结构符合要求。

## 事件驱动架构

WebAuto 使用事件驱动架构实现容器自动化操作，核心流程如下：

1. **容器匹配**：RuntimeController 通过 TreeDiscoveryEngine 匹配容器
2. **事件分发**：ContainerEventDispatcher 自动发送 `container:appear` 事件
3. **自动点击**：ContainerAutoClickHandler 监听 `appear` 事件并自动点击
4. **操作执行**：OperationExecutor 执行容器操作并发送完成事件

详细架构说明请参考：
- `docs/arch/EVENT_DRIVEN.md`

## 远程会话架构

Unified API 与 Browser Service 使用远程会话代理架构，通过 HTTP 通信实现服务分离。

1. **RemoteSessionManager**：统一管理远程会话
2. **RemoteBrowserSession**：代理 BrowserSession 接口
3. **HTTP 转发**：所有操作通过 `/command` 接口调用 Browser Service

详细架构说明请参考：
- `docs/arch/REMOTE_SESSION.md`

## 详细文档

- docs/arch/PORTS.md：端口与环境变量
- docs/arch/LAUNCHER.md：启动器架构
- docs/arch/AGENTS.md：完整设计原则
- docs/arch/EVENT_DRIVEN.md：事件驱动架构
- docs/arch/REMOTE_SESSION.md：远程会话架构

## 硬性规则：模块系统
1. 全仓库统一使用 ES Module（`"type": "module"`），禁止混用 CommonJS。
2. 所有源码文件扩展名：`.ts`、`.mts`、`.js`、`.mjs` 均为 ES 模块；禁止使用 `.cjs`。
3. 禁止在 ES 模块中使用 `require`、`module.exports`、`__dirname`、`__filename`；统一改用 `import`、 `export`、 `import.meta.url`、`fileURLToPath`。
4. Electron preload 脚本必须使用 `.mjs`，主进程与任何构建流程必须直接加载 `.mjs`，禁止再生成 `.cjs`；浮窗需在文档中记录如何启用 ESM preload。
5. 构建脚本、CLI 统一使用 ESM。
6. 违反上述规则即视为阻塞性 Bug，立即回滚或修复。
7. 浮窗UI（apps/floating-panel）必须使用纯ESM架构，禁止混用CJS。

## 新增规则（2025-12-24）
...
