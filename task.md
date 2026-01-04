# WebAuto 任务追踪

## 已完成 ✅

### Controller 方法恢复 (2026-01-04)
- [x] 恢复 `captureInspectorSnapshot` 完整实现（通过 fetchContainerSnapshotFromService）
- [x] 恢复 `captureInspectorBranch` 完整实现（通过 fetchDomBranchFromService）
- [x] 新增辅助方法：fetchSessions, findSessionByProfile, focusSnapshotOnContainer, cloneContainerSubtree, deepClone
- [x] 容器匹配功能恢复正常

### Unified API 消息广播修复 (2026-01-04)
- [x] `broadcastEvent()` 同时向 wsClients 和 busClients 广播消息
- [x] Floating Panel 可以通过 /bus 连接接收事件
- [x] containers.matched 事件正确传递给 UI

### 事件驱动容器系统 (2026-01-04)
- [x] MessageBusService: 统一消息总线服务
- [x] MessageConstants: Windows 风格消息命名规范
- [x] 容器消息系统核心组件实现：
  - ContainerVariableManager: 变量管理
  - TriggerConditionEvaluator: 条件评估
  - ContainerDiscoveryEngine: 容器发现
  - ContainerOperationExecutor: 操作执行
  - ContainerStatusTracker: 状态跟踪
  - RootContainerDriver: 根容器驱动
  - ContainerMessageRegistry: 消息注册
- [x] Browser Service 消息总线集成（BrowserMessageHandler + RemoteMessageBusClient）
- [x] Floating Panel UI 组件增强（消息监控、操作状态、根配置、根变量）

### 架构文档 (2026-01-04)
- [x] docs/arch/MESSAGE_SYSTEM.md: 消息系统架构设计
- [x] docs/arch/MESSAGE_SYSTEM_IMPLEMENTATION.md: 消息系统实现指南
- [x] docs/arch/MESSAGE_SYSTEM_SUMMARY.md: 消息系统总结
- [x] docs/arch/CONTAINER_MESSAGE_DESIGN.md: 容器消息设计
- [x] docs/arch/CONTAINER_DISCOVERY_AND_EXECUTION.md: 容器发现与执行机制
- [x] docs/arch/CONTAINER_SYSTEM_IMPLEMENTATION_SUMMARY.md: 容器系统实现总结

### 代码提交与推送 (2026-01-04)
- [x] Commit: f023044 - "修复 controller 方法缺失和 UI 消息总线通信问题"
- [x] Pushed to GitHub: origin/main
- [x] 工作目录清理（无临时文件、无构建产物、无测试报告、无敏感数据）

### 浮窗布局状态持久化 (2026-01-04)
- [x] Commit: fb1b068 - "添加浮窗布局状态持久化功能"
- [x] 底部面板高度自动保存到 `~/.webauto/floating-layout-state.json`
- [x] 启动时自动恢复上次布局
- [x] 拖动分割线时延迟1秒自动保存
- [x] 修复构建错误（.mjs 导入扩展名问题）

## 进行中 🚧

### 基础消息挂载与标准化
- [ ] 定义标准消息类型 `modules/messaging/src/message-types.ts`
- [ ] 消息类型：
  - `MSG_CONTAINER_APPEAR`: 容器出现
  - `MSG_CONTAINER_DISAPPEAR`: 容器消失
  - `MSG_CONTAINER_OPERATION_START`: 操作开始
  - `MSG_CONTAINER_OPERATION_COMPLETE`: 操作完成
  - `MSG_CONTAINER_OPERATION_FAILED`: 操作失败
  - `MSG_CONTAINER_FOCUS`: 容器获得焦点
  - `MSG_CONTAINER_DEFOCUS`: 容器失去焦点
  - `MSG_CONTAINER_ROOT_SCROLL_START`: 根容器滚动开始
  - `MSG_CONTAINER_ROOT_SCROLL_PROGRESS`: 滚动进度
  - `MSG_CONTAINER_ROOT_SCROLL_COMPLETE`: 滚动完成
  - `MSG_CONTAINER_ROOT_VAR_CHANGED`: 根变量变更

## 待实施 ⏳

### 功能a: 容器层次发现与 appear 消息下发
**位置**: services/container-lifecycle/
**优先级**: P0 - 立即实施

- [ ] 创建容器生命周期管理器模块
- [ ] 监听 containers.matched 事件
- [ ] 从 root 开始递归遍历容器树
- [ ] 为每个容器发布 MSG_CONTAINER_APPEAR 消息
- [ ] 消息格式：`{ containerId, parentId, domPath, selector, timestamp }`
- [ ] 子容器等待父容器 appear 完成后再下发
- [ ] 实现容器销毁时的 DISAPPEAR 消息

### 功能b: 滚动操作
**位置**: services/browser-service/BrowserSession.ts
**优先级**: P1 - 短期实施

- [ ] 添加 scroll action 处理器
- [ ] 支持滚动到指定元素或坐标
- [ ] 发布滚动开始/进度/完成消息
- [ ] 浮窗操作类型定义中添加 scroll 类型

### 功能c: 容器基础操作
**位置**: services/browser-service/BrowserSession.ts
**优先级**: P0 - 立即实施

- [ ] 实现点击操作 `executeClick({ domPath, selector })`
- [ ] 实现填充操作 `executeFill({ domPath, value })`
- [ ] 实现提取操作 `executeExtract({ domPath, type: 'text'|'url'|'image'|'video' })`
- [ ] 消息流：
  1. 发送 MSG_CONTAINER_OPERATION_START
  2. 执行操作
  3. 发送 MSG_CONTAINER_OPERATION_COMPLETE（携带结果）
  4. 失败时发送 MSG_CONTAINER_OPERATION_FAILED
- [ ] 操作结果格式：`{ containerId, operationId, result, duration }`

### 功能d: focus/defocus 状态管理
**位置**: src/renderer/ (前端) + services/browser-service/
**优先级**: P1 - 短期实施

**前端实现**:
- [ ] 维护 currentFocusedContainer 状态
- [ ] 切换时自动 defocus 旧容器，focus 新容器
- [ ] 复用高亮机制实现焦点视觉反馈

**后端实现**:
- [ ] 使用固定 channel: 'operation-focus' 进行高亮
- [ ] 发布 MSG_CONTAINER_FOCUS/MSG_CONTAINER_DEFOCUS 消息

### 操作队列管理器
**位置**: services/operation-queue/
**优先级**: P2 - 中期优化

- [ ] 接收操作请求
- [ ] 按层次排队（父容器优先）
- [ ] 追踪操作状态
- [ ] 发布状态消息
- [ ] 支持并发控制（限制同时操作数）
- [ ] 支持失败重试机制

## 待验证 ⏳

### UI 事件接收
- [ ] Floating Panel 收到 containers.matched 事件后正确显示容器树和 DOM 树
- [ ] 容器匹配状态在 UI 中正确渲染
- [ ] 容器 appear 消息接收后正确更新 UI 状态
- [ ] focus/defocus 消息接收后正确更新高亮状态

### weibo_fresh 启动流程
- [ ] 启动流程验证：端口 → 服务 → Cookie → 登录 → 容器匹配 → UI
- [ ] 容器树和 DOM 树正确渲染
- [ ] 启动时间在 30 秒内完成

## 重构计划（Phase 0: 紧急修复）

### Phase 0.1: 脚本收敛与唯一入口
- [x] 保留 `scripts/launch-headed-browser-float.mjs` 作为唯一启动入口
- [ ] 将重复/测试脚本归档到 `scripts/deprecated/`
- [ ] 在 `scripts/README.md` 补齐功能索引与入口指引

### Phase 0.2: 健康检查闭环
- [ ] 新增/整合健康检查脚本：验证服务端口 + WS + Controller 连接
- [ ] 业务就绪标准：容器树匹配成功、DOM tree 渲染成功、浮窗连接成功
- [ ] 启动脚本中自动触发健康检查并输出明确错误原因

### Phase 0.3: weibo_fresh 登录与 Cookie 注入修复
- [x] 复查 profile 加载链路与 cookie 注入链路
- [x] 使用 headless 调试定位失败点
- [x] 完成 headful 验证真实 UI 就绪
- [ ] 确保首页容器匹配成功作为健康通过条件
- [ ] 合并健康检查逻辑到主启动脚本
- [ ] 完善状态总线接口

## 验收标准

### 当前阶段验收
1. [x] **启动成功率**: weibo_fresh 能够成功启动
2. [x] **容器匹配**: containers:match 能够成功返回容器树
3. [x] **消息广播**: Unified API 的 broadcastEvent 同时向 wsClients 和 busClients 广播
4. [ ] **UI 就绪**: Floating Panel 收到 containers.matched 事件并显示容器树和 DOM 树

### 完整验收（Phase 0 结束后）
1. **启动成功率**: weibo_fresh 100% 启动成功
2. **状态透明度**: 所有模块状态实时可查
3. **错误隔离**: 单模块故障不影响整体
4. **性能指标**: 启动时间 < 30 秒，状态同步 < 1 秒
5. **维护性**: 新增模块 < 1 小时，调试时间 < 10 分钟

### 基础功能验收（核心功能补齐后）
1. **容器初始化**: 页面加载后容器按层次正确初始化
2. **基础操作**: click/fill/extract 操作可用且正确返回结果
3. **滚动操作**: 滚动操作可用且正确发送进度消息
4. **焦点管理**: focus/defocus 正确切换容器高亮状态
5. **消息流**: 所有消息按预期顺序传递
6. **状态追踪**: OperationStatusPanel 正确显示操作计数和状态

## 备注

### 已推送的代码
- services/controller/src/controller.ts: 恢复容器快照和 DOM 分支方法
- services/unified-api/server.ts: broadcastEvent 同时向 wsClients 和 busClients 广播
- services/browser-service/: 消息总线集成
- libs/operations-framework/src/event-driven/: 事件驱动框架核心
- apps/floating-panel/src/renderer/: UI 组件增强
- apps/floating-panel/src/main/index.mts: 布局状态持久化
- apps/floating-panel/src/main/preload.mjs: 布局状态 API
- apps/floating-panel/src/renderer/index.mts: 布局状态加载和保存
- docs/arch/: 完整架构文档

### 关键修复点
1. **Controller.ts**: `captureInspectorSnapshot` 和 `captureInspectorBranch` 从占位实现恢复为完整实现
2. **Unified API**: `broadcastEvent()` 方法新增 busClients 广播，确保 /bus 连接的客户端能收到事件
3. **消息总线**: 完整的事件驱动架构，支持 Windows 风格消息命名（如 MSG_CONTAINER_ROOT_SCROLL_START）
4. **构建修复**: 修复 graph/matcher.mts 和 virtual-children.mts 中错误的 .mjs 导入扩展名

### 下一步行动
1. 定义标准消息类型（modules/messaging/src/message-types.ts）
2. 实现浏览器端基础操作命令（click/fill/extract）
3. 实现容器生命周期管理器（appear 消息下发）
4. 验证前端监控面板能正确显示操作状态
5. 实现滚动操作
6. 实现 focus/defocus 状态管理
