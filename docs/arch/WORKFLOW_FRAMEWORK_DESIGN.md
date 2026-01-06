# WebAuto Workflow 框架设计文档

## 核心设计原则

1. **分离关注点**
   - Workflow Framework（骨架）：通用的编排引擎，不包含具体业务逻辑
   - Workflow Configuration（配置）：通过 JSON/YAML 定义具体流程
   - Workflow Runtime（运行时）：事件驱动的执行引擎
   - Container System（容器系统）：处理DOM分析和容器匹配

2. **容器固定逻辑 + DOM动态获取**
   - 容器定义文件是静态的（JSON），定义了固定的容器层次结构
   - 每次DOM变化时，触发容器匹配流程
   - 匹配结果包含：固定容器和动态发现的子容器
   - 匹配结果通过事件系统分发给所有订阅者

3. **事件驱动架构**
   ```
   DOM变化
     ↓
   容器匹配系统
     ↓
   container.appear 事件
     ↓
   Workflow Runtime
     ↓
   Trigger → Action → Event Chain
   ```

## 架构分层

### 1. Workflow Framework（骨架层）

**职责**：
- 提供工作流编排的基本原语
- 管理步骤执行顺序和条件判断
- 处理事件订阅和分发
- 提供配置文件加载和验证

**核心类**：
```typescript
// Framework Layer
- WorkflowEngine        // 工作流引擎，执行配置定义的流程
- WorkflowStep         // 单个步骤，可以是顺序、并行、循环
- WorkflowTrigger       // 触发器，决定何时启动工作流
- ActionExecutor        // 动作执行器，调用具体的操作API
- EventDispatcher       // 事件分发器，管理事件订阅和分发
- ConfigLoader         // 配置加载器，加载和验证配置文件
```

**配置文件结构**：
```json
{
  "workflow": {
    "name": "weibo-feed-extraction",
    "version": "1.0",
    "triggers": [
      {
        "event": "container.appear",
        "filter": { "containerIdPattern": "weibo_main_page.feed_post.*" },
        "actions": [
          { "type": "extract" },
          { "type": "check-expand" }
        ]
      }
    ],
    "steps": [
      {
        "id": "init",
        "name": "初始化",
        "actions": [
          { "type": "session.ensure" },
          { "type": "container.match" }
        ]
      },
      {
        "id": "collection-loop",
        "name": "数据采集循环",
        "condition": {
          "variable": "extractedCount",
          "operator": "lt",
          "value": 150
        },
        "repeat": {
          "max": 120,
          "until": {
            "condition": {
              "variable": "extractedCount",
              "operator": "gte",
              "value": 150
            }
          }
        },
        "actions": [
          { "type": "scroll", "config": { "distance": 800, "waitAfter": 3000 } },
          { "type": "extract.batch" },
          { "type": "variable.increment", "config": { "variable": "scrollCount" } }
        ]
      }
    ],
    "outputs": {
      "format": "markdown",
      "file": "weibo_posts_150.md"
    }
  }
}
```

### 2. Workflow Runtime（运行时层）

**职责**：
- 管理工作流的生命周期（启动、暂停、停止）
- 执行具体的 workflow steps
- 处理变量管理（计数器、标志位）
- 与事件系统集成，响应容器事件

**核心类**：
```typescript
// Runtime Layer
- WorkflowRunner        // 运行具体的工作流实例
- StepExecutor         // 执行单个步骤
- VariableManager      // 管理工作流级别的变量
- EventSubscriber       // 订阅和处理事件
- StateMachine          // 管理工作流状态（运行、暂停、完成、失败）
```

**工作流状态机**：
```
idle → running → paused → completed
                ↓
              failed
```

### 3. Event System（事件系统）

**职责**：
- 提供统一的事件发布和订阅机制
- 管理事件类型和事件过滤器
- 支持容器系统的 `container.appear` 事件
- 支持工作流的 `workflow.*` 事件

**事件类型**：
```typescript
// Container Events
- container.appear           // 容器出现（固定或动态）
- container.disappear         // 容器消失
- container.state.changed     // 容器状态变更

// Workflow Events
- workflow.started          // 工作流启动
- workflow.step.start      // 步骤开始
- workflow.step.complete    // 步骤完成
- workflow.step.failed     // 步骤失败
- workflow.paused           // 工作流暂停
- workflow.completed        // 工作流完成
- workflow.failed           // 工作流失败

// DOM Events
- dom.scrolled            // DOM滚动
- dom.loaded               // DOM加载完成
```

### 4. Container System（容器系统）

**职责**：
- 执行容器匹配（固定容器 + 动态容器）
- 管理容器定义的加载和验证
- 触发 container.appear 事件
- 提供容器操作接口

**核心类**：
```typescript
// Container Layer
- ContainerMatcher        // 容器匹配器
- ContainerRegistry       // 容器注册表
- DynamicContainerDiscoverer  // 动态容器发现器
- ContainerOperationExecutor  // 容器操作执行器
```

**容器匹配流程**：
```
1. 加载容器定义文件
   ↓
2. DOM快照分析
   ↓
3. 匹配固定容器（根据 container.json）
   ↓
4. 发现动态容器（根据 DOM 结构）
   ↓
5. 生成完整的容器树（固定 + 动态）
   ↓
6. 触发 container.appear 事件（每个容器）
```

## 工作流执行模型

### 配置驱动的执行模式

用户通过配置文件定义工作流，Framework 提供以下能力：

1. **Trigger 定义**
   - 基于事件触发：当特定事件发生时启动工作流
   - 基于时间触发：定时启动工作流
   - 基于条件触发：满足特定条件时启动工作流

2. **Step 定义**
   - 顺序步骤：按顺序执行
   - 并行步骤：同时执行多个操作
   - 条件步骤：基于条件判断是否执行
   - 循环步骤：重复执行直到满足条件
   - 子工作流：调用其他工作流

3. **Action 类型**
   - `session.ensure`     // 确保会话存在
   - `session.create`       // 创建新会话
   - `container.match`     // 执行容器匹配
   - `container.operation` // 执行容器操作（click、scroll、extract等）
   - `browser.execute`    // 执行浏览器脚本
   - `variable.set`        // 设置变量
   - `variable.increment`    // 增加变量
   - `emit.event`         // 发布事件
   - `wait`               // 等待一段时间

4. **Variable 管理**
   - 工作流级别的变量
   - 支持基本类型：number、string、boolean、array
   - 支持操作：set、increment、get、compare


### 状态驱动的步骤推进

**结论**：需要通过状态来驱动下一步。这是事件驱动和配置编排在工程上稳定运行的核心。

**设计要点**：
- 每个 step 都有明确状态：`idle` → `running` → (`completed` | `failed` | `skipped`)。
- Step 的进入条件由状态机判断，而不是由调用方手工串联。
- 事件驱动与状态机协作：事件只改变状态或触发动作，状态变化推进到下一步。

**状态驱动模式**：
```
workflow.start
  ↓
step.init (running)
  ↓ (completed)
step.match_containers (running)
  ↓ (completed)
step.expand_all (running)
  ↓ (completed)
step.extract_loop (running)
  ↓ (completed)
step.output (running)
  ↓ (completed)
workflow.complete
```

**Step 状态与事件的映射**：
- `step.running`：触发 step 对应的 actions
- `step.completed`：触发下一个 step 进入
- `step.failed`：进入 `workflow.failed` 或执行补偿步骤
- `step.skipped`：进入下一个 step（用于条件不满足）

**必要的状态字段**：
- `currentStepId`
- `stepStatus`（running/completed/failed/skipped）
- `progress`（用于长步骤：如 scroll/extract）
- `lastEvent`（最近触发状态变化的事件）

**配置层建议**：
```json
"steps": [
  {
    "id": "expand_all",
    "name": "展开所有帖子",
    "enter": { "when": { "step": "match_containers", "status": "completed" } },
    "actions": [ ... ],
    "exit": { "when": { "event": "expand.batch.completed" } }
  }
]
```

**好处**：
- 步骤推进可观测、可复盘
- 事件驱动和配置编排解耦
- 支持中断/恢复、失败重试、回滚补偿

## 微博 Feed 提取工作流示例

### 完整的配置示例

```json
{
  "name": "weibo-feed-extraction",
  "version": "1.0.0",
  "triggers": [
    {
      "event": "workflow.manual.start",
      "actions": [
        { "type": "workflow.start", "workflow": "weibo-feed-extraction" }
      ]
    }
  ],
  "steps": [
    {
      "id": "init",
      "name": "初始化",
      "actions": [
        { "type": "session.ensure", "config": { "profile": "weibo_fresh", "url": "https://weibo.com/" } },
        { "type": "container.match", "config": { "profile": "weibo_fresh", "url": "https://weibo.com/" } },
        { "type": "variable.set", "config": { "variable": "scrollCount", "value": 0 } },
        { "type": "variable.set", "config": { "variable": "extractedCount", "value": 0 } }
      ]
    },
    {
      "id": "expand-all",
      "name": "展开所有帖子",
      "actions": [
        { 
          "type": "container.find-children",
          "config": { 
            "containerId": "weibo_main_page.feed_list",
            "childType": "feed_post"
          }
        },
        { 
          "type": "container.batch-operation",
          "config": {
            "containerId": "weibo_main_page.feed_post.expand_button",
            "operationId": "click",
            "waitAfter": 1000
          }
        }
      ]
    },
    {
      "id": "extraction-loop",
      "name": "数据采集循环",
      "condition": {
        "variable": "extractedCount",
        "operator": "lt",
        "value": 150
      },
      "repeat": {
        "max": 120,
        "until": {
          "condition": {
            "variable": "extractedCount",
            "operator": "gte",
            "value": 150
          }
        }
      },
      "actions": [
        { 
          "type": "container.find-children",
          "config": { 
            containerId": "weibo_main_page.feed_list",
            childType": "feed_post",
            limit: 20
          }
        },
        {
          "type": "container.batch-extract",
          "config": {
            "containerId": "weibo_main_page.feed_post",
            "fields": {
              "author": "header a[href*='weibo.com']",
              "content": "div[class*='detail_wbtext']",
              "timestamp": "time",
              "url": "a[href*='weibo.com'][href*='/status/']",
              "authorUrl": "a[href*='weibo.com/u/']"
            }
          }
        },
        {
          "type": "container.operation",
          "config": {
            "containerId": "weibo_main_page.feed_list",
            "operationId": "summary",
            "config": { direction: "down", "distance: 800, waitAfter: 3000 }
          }
        },
        {
          "type": "variable.increment",
          "config": { variable": "scrollCount" }
        }
      ]
    },
    {
      "id": "output",
      "name": "生成输出",
      "actions": [
        { 
          "type": "format.output",
          "config": { 
            format: "markdown",
            file: "weibo_posts_150.md",
            fields": ["author", "content", "url", "authorUrl", "timestamp"]
          }
        }
      ]
    }
  ],
  "outputs": {
    "format": "markdown",
    "comparable": {
      "file": "weibo_posts_150.json"
    }
  }
}
```

## 扩展性设计

### 1. 站点复用
- Framework 不依赖任何具体业务逻辑
- 可以通过配置支持不同的网站（微博、知乎、B站等）
- 可以通过配置支持不同的采集场景（Feed、评论、用户信息）

### 2. Action 插件化
- 每种 Action 类型是独立的插件
- 新增 Action 只需实现 Action 接口，注册到 Framework
- Actions 可以访问 VariableManager 和 EventSubscriber

### 3. Event 过滤器
- 支持事件类型过滤
- 支持容器 ID 模式匹配
- 支持容器类型过滤（page、list、content、ui-element）
- 支持自定义过滤函数

### 4. 条件判断增强
- 支持多条件组合（AND、OR、NOT）
- 支持变量比较（eq、ne、gt、lt、gte、contains）
- 支持正则匹配

## 实现优先级

### 第一阶段：核心框架
1. 实现 WorkflowEngine（基础工作流引擎）
2. 实现 WorkflowStep（步骤抽象）
3. 实现 WorkflowTrigger（触发器）
4. 实现 ActionExecutor（动作执行器）
5. 实现 VariableManager（变量管理器）

### 第二阶段：事件系统
1. 实现 EventBus（事件总线）
2. 实现 EventDispatcher（事件分发器）
3. 实现 EventSubscriber（事件订阅器）
4. 集成 Container System 的事件发布

### 第三阶段：容器集成
1. 实现 Action: container.match（容器匹配）
2. 实现 Action: container.find-children（查找子容器）
3. 实现 Action: container.batch-operation（批量操作）
4. 实现 Action: container.batch-extract（批量提取）
5. 集成 container.appear 事件响应

### 第四阶段：微博适配
1. 创建 weibo-feed-extraction.json 配置文件
2. 实现微博专用 Actions（如果需要）
3. 完整的端到端测试

## 配置驱动的好处

1. **无代码部署**：修改配置文件即可改变工作流行为
2. **版本控制友好**：配置文件可以提交到 Git 进行版本管理
3. **多环境支持**：可以有不同的配置用于开发、测试、生产
4. **A/B 测试**：可以创建不同的配置进行对比测试
5. **模板复用**：一个工作流模板可以适配多个场景

## 下一步行动

1. ✅ 立即实现 WorkflowEngine 核心框架
2. ✅ 实现 Action 基础接口和常见 Actions
3. ✅ 实现基于配置的工作流执行
4. ✅ 端到端测试微博 Feed 提取工作流
5. ✅ 文档化和示例配置

## 架构演进：远程会话与分布式执行

### 背景
系统当前分为两个主要服务进程：
1. **Unified API (7701)**: 负责 API 网关、Controller、Workflow 引擎、容器匹配逻辑。
2. **Browser Service (7704)**: 负责 Playwright 实例管理、页面操作执行。

### 挑战
Workflow 引擎在 7701 运行，需要操作位于 7704 的 DOM。
- 直接的 `page.evaluate` 调用在 7701 无法执行（没有 Page 对象）。
- 需要跨进程的远程调用机制。

### 解决方案：Remote Session Pattern

#### 1. SessionManager (Unified API 端)
不再直接创建本地 BrowserSession，而是创建 `RemoteBrowserSession`。

```typescript
class RemoteSessionManager implements ISessionManager {
  // 代理到 http://127.0.0.1:7704/command
  async createSession(...) -> RemoteBrowserSession
  async getSession(...) -> RemoteBrowserSession
}
```

#### 2. RemoteBrowserSession
实现与本地 BrowserSession 相同的接口，但通过 HTTP/WS 将指令转发给 7704。

```typescript
class RemoteBrowserSession implements IBrowserSession {
  async evaluate(script, args) {
    return rpc.call('evaluate', { script, args });
  }
  
  async click(selector) {
    return rpc.call('dom_action', { action: 'click', selector });
  }
}
```

#### 3. OperationExecutor 适配
Container Operation Executor (在 7701) 接收到 `RemoteBrowserSession` 后，
其内部对 `page` 的操作将透明地转换为远程 RPC 调用。

### 事件流与状态同步

1. **DOM 变更**：
   - 7704 (Browser) 检测到变更 -> 发送 WS 消息 -> 7701 (Unified)
   
2. **容器匹配**：
   - 7701 收到 DOM Snapshot -> 运行 Matcher -> 生成 Container Tree
   
3. **事件分发**：
   - 7701 EventBus 发出 `container.appear`
   
4. **Workflow 响应**：
   - Workflow Runner 收到事件 -> 调用 `container.operation` (click)
   - Controller (7701) -> RemoteSession -> RPC -> 7704 -> Page.click()

### 优势
- **关注点分离**：Browser Service 专注浏览器自动化；Unified API 专注业务逻辑。
- **稳定性**：浏览器崩溃不影响 Workflow 引擎状态。
- **扩展性**：支持多 Browser Service 实例负载均衡。
