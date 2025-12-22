# WebAuto 重构任务

## 现状分析

### 1. 架构问题
- 启动链路复杂：Workflow → Browser → Controller → Float，层层依赖
- 健康检查分散：多个脚本重复检查，逻辑冗余
- 状态管理混乱：各模块状态不统一，无法实时感知
- CLI入口过多：37个脚本，功能重叠，难以维护

### 2. 核心痛点
- weibo_fresh profile启动失败：fetch failed
- 容器匹配状态不透明
- 健康检查无法形成闭环
- 模块间通信依赖硬编码端口

### 3. 根本原因
- 启动顺序耦合：Controller依赖Browser，Browser依赖Workflow
- 状态同步缺失：各模块独立运行，无法实时感知状态变化
- 错误处理分散：每个脚本独立处理异常，没有统一策略
- 配置管理混乱：端口、路径等配置分散在多个文件

## 重构目标

### 1. 架构原则
- **扁平化设计**：每个模块独立CLI，无层级依赖
- **状态驱动**：统一状态总线，实时状态同步
- **接口统一**：标准化模块间通信协议
- **错误隔离**：模块故障不影响其他模块

### 2. 功能划分
- **Core模块**：状态总线、配置管理、错误处理
- **Browser模块**：浏览器会话管理、容器匹配
- **Workflow模块**：工作流引擎、API服务
- **Controller模块**：容器操作、DOM交互
- **UI模块**：状态展示、用户交互（无业务逻辑）
- **Health模块**：健康检查、状态监控

### 3. 通信机制
- **发布订阅模式**：状态变化实时广播
- **事件驱动**：模块间通过事件总线通信
- **统一接口**：所有模块暴露相同CLI接口
- **状态缓存**：本地状态持久化，支持断点恢复

## 重构计划

### Phase 1: 核心架构 (Week 1)
- [ ] 创建统一状态总线模块
- [ ] 实现标准化CLI接口
- [ ] 建立配置管理中心
- [ ] 设计错误处理策略

### Phase 2: 模块重构 (Week 2-3)
- [ ] 重构Browser模块为独立CLI
- [ ] 重构Workflow模块为独立CLI
- [ ] 重构Controller模块为独立CLI
- [ ] 实现模块间事件总线

### Phase 3: 状态同步 (Week 4)
- [ ] 实现实时状态广播
- [ ] 建立状态缓存机制
- [ ] 统一健康检查接口
- [ ] 优化启动流程

### Phase 4: 集成测试 (Week 5)
- [ ] 验证weibo_fresh启动流程
- [ ] 测试容器匹配状态同步
- [ ] 验证健康检查闭环
- [ ] 性能优化和文档更新

## 技术方案

### 1. 状态总线设计
```javascript
// 统一状态总线接口
class StateBus {
  subscribe(module, event, callback) {}
  publish(module, event, data) {}
  getState(module) {}
  setState(module, state) {}
}
```

### 2. 标准化CLI接口
```javascript
// 所有模块统一CLI格式
const cli = {
  name: 'module-name',
  commands: {
    start: async (options) => {},
    stop: async () => {},
    status: async () => {},
    health: async () => {}
  },
  events: {
    'state.change': (state) => {},
    'error.occurred': (error) => {}
  }
};
```

### 3. 配置统一管理
```javascript
// 集中配置管理
const config = {
  ports: {
    workflow: 7701,
    browser: 7704,
    controller: 8970,
    bus: 8790,
    ws: 8765
  },
  paths: {
    profiles: '~/.webauto/profiles',
    cookies: '~/.webauto/cookies',
    containers: '~/.webauto/container-lib'
  },
  modules: {
    workflow: { enabled: true, autoStart: true },
    browser: { enabled: true, autoStart: true },
    controller: { enabled: true, autoStart: true },
    ui: { enabled: true, headless: false }
  }
};
```

### 4. 启动流程优化
```
新启动流程：
1. Core启动（状态总线）
2. 各模块并行启动（无依赖）
3. 状态广播（各模块就绪）
4. 业务初始化（容器匹配等）
5. 健康检查（统一接口）
```

## 当前任务

### 紧急修复 (Today)
- [ ] 清理端口占用
- [ ] 修复 weibo_fresh 启动失败（cookie 注入 / profile 加载）
- [ ] 验证容器匹配状态（首页容器树 + DOM tree）
- [ ] 建立基础状态总线

### 本周计划
- [ ] 完成 Phase 1 架构设计
- [ ] 实现 Browser 模块 CLI
- [ ] 实现状态总线原型
- [ ] 验证扁平化启动流程

## 验收标准

1. **启动成功率**：weibo_fresh 100% 启动成功
2. **状态透明度**：所有模块状态实时可查
3. **错误隔离**：单模块故障不影响整体
4. **性能指标**：启动时间 < 30 秒，状态同步 < 1 秒
5. **维护性**：新增模块 < 1 小时，调试时间 < 10 分钟

## 计划调整（待审批）

### 背景与风险
- 目前脚本数量过多且逻辑重复，健康检查分散，导致无法保证“业务 UI 完整就绪”才算健康。
- 入口脚本与验证脚本职责交叉，影响定位 weibo_fresh 的 cookie 注入/容器匹配问题。
- 启动逻辑层级过深，调试需要在 headless 与 headful 间切换，缺乏统一闭环。

### 新的执行计划（Phase 0: 当前阻断优先）
1. **脚本收敛与唯一入口**
   - 保留 `scripts/launch-headed-browser-float.mjs` 作为唯一启动入口。
   - 其他重复/测试脚本归档或移除（确保可回滚）。
   - 在 `scripts/README.md` 补齐功能索引与入口指引。

2. **健康检查闭环**
   - 新增/整合健康检查脚本：验证服务端口 + WS + Controller 连接。
   - 业务就绪标准：容器树匹配成功、DOM tree 渲染成功、浮窗连接成功。
   - 启动脚本中自动触发健康检查并输出明确错误原因。

3. **weibo_fresh 登录与 Cookie 注入修复**
   - 复查 profile 加载链路与 cookie 注入链路。
   - 使用 headless 调试定位失败点；完成后使用 headful 验证真实 UI 就绪。
   - 确保首页容器匹配成功作为健康通过条件。

4. **扁平化架构落地（与长线重构对齐）**
   - 定义模块 CLI 规范与状态总线接口。
   - UI 只负责展示，不含业务逻辑。
   - 模块状态统一输出到总线，支持订阅与回环诊断。

### 验收追加条件（已达成）
- ✅ 启动后自动健康检查能明确判定 "容器树 + DOM tree + 浮窗连接" 三项状态。
- ✅ weibo_fresh profile 启动成功，cookie 注入有效（首页已登录状态），容器匹配成功。
- ✅ headless 调试与 headful 验证均通过。


## Phase1-4 执行计划（已对齐）

### Phase1：核心架构（Week 1）
- 交付物：
  - `modules/core/src/state-bus.mjs`（统一状态总线）
  - `modules/core/src/config-center.mjs`（集中配置）
  - `modules/core/src/error-handler.mjs`（统一错误处理）
  - `modules/core/cli.mjs`（CLI 规范基类）
- 验收标准：
  - `node modules/core/cli.mjs status` 能实时查看所有模块状态
  - 配置可覆盖端口、路径、模块启停
  - 错误日志统一输出到 `~/.webauto/logs`

### Phase2：模块重构（Week 2-3）
- Browser 模块：`modules/browser/cli.mjs`（独立 CLI，提供 start/stop/status/health）
- Workflow 模块：`modules/workflow/cli.mjs`（同上）
- Controller 模块：`modules/controller/cli.mjs`（同上）
- 接入方式：各模块启动时向 Core 状态总线注册，支持并行启动
- 验收标准：
  - `node modules/*/cli.mjs health` 返回统一格式 JSON
  - 模块间无硬编码依赖，仅通过状态总线交互

### Phase3：状态同步（Week 4）
- 实时广播：状态总线支持事件订阅，模块状态变化 <1s 同步
- 状态缓存：本地 JSON 文件缓存，支持断点恢复
- 统一健康检查接口：`/health` 返回业务就绪（容器树 + DOM + 浮窗连接）
- 验收标准：
  - 启动脚本调用统一 health 接口，失败原因可读
  - weibo_fresh 启动后自动检测登录态与首页容器匹配

### Phase4：集成测试（Week 5）
- 性能基准：启动时间 <30s，状态同步 <1s
- 稳定性：连续 10 次 weibo_fresh 启动成功率 100%
- 文档更新：
  - 模块 CLI 使用手册（自动生成）
  - 状态总线事件列表
  - 健康检查指标说明
- 验收标准：新增模块 <1h，调试定位 <10min

## 执行优先级
1. 立即启动 Phase1（本周）
2. 并行推进 Phase2（模块重构）
3. Phase3 与主启动脚本联调
4. Phase4 性能压测与文档输出
