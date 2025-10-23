# WebAuto 项目架构设计文档

## 📋 项目概述

WebAuto 是一个基于分层架构的综合性 Web 自动化平台，通过 **操作子 → 工作流 → 任务** 的三层架构，提供从简单原子操作到复杂业务逻辑的完整解决方案。

## 🏗️ 整体架构设计

### 架构分层图（含锚点协议）

```
┌─────────────────────────────────────────────────────────────┐
│                    用户编排层 (Task Layer)                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   自定义任务     │  │   模板任务     │  │   预定义任务     │  │
│  │  Custom Task    │  │ Template Task  │  │  Preset Task    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    工作流组合层 (Workflow Layer)              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   链接捕获       │  │   批量下载       │  │   内容总结       │  │
│  │ Link Capture    │  │ Batch Download  │  │ Content Summary │  │
│  │    工作流       │  │    工作流       │  │    工作流       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    操作子执行层 (Operation Layer)            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   浏览器操作     │  │   文件操作       │  │   AI模型操作     │  │
│  │Browser Operation│  │ File Operation  │  │  AI Operation   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │   通信操作       │  │   数据处理       │                       │
│  │Comm Operation   │  │ Data Operation  │                       │
│  └─────────────────┘  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    基础设施层 (Infrastructure Layer)           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   浏览器管理     │  │   任务调度       │  │   事件系统       │  │
│  │ Browser Manager │  │Task Scheduler   │  │  Event System   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 核心设计理念

1. **分层解耦**：每层都有明确的职责边界，支持独立开发和测试
2. **组合复用**：上层通过组合下层组件实现复杂功能
3. **渐进复杂度**：用户可以根据需求选择不同层次的抽象
4. **配置驱动**：通过 JSON 配置文件控制行为，支持动态调整

## 📦 模块架构

### 1. 操作子库 (Operation Library)

操作子库包含六大类别的原子操作，每个操作子都是可独立执行的最小功能单元。

#### 浏览器操作子 (Browser Operations)

**职责**: 处理浏览器相关的所有操作，包括页面导航、元素操作、内容提取等

**核心能力**:
- 页面加载和导航
- DOM元素操作和交互
- 内容提取和分析
- 浏览器会话管理
- 反检测和指纹管理

**包含的操作子**:
```
browser/
├── navigation/
│   ├── PageNavigationOperation     # 页面导航
│   ├── TabManagementOperation      # 标签页管理
│   └── HistoryManagementOperation  # 历史记录管理
├── interaction/
│   ├── ElementClickOperation       # 元素点击
│   ├── FormFillOperation          # 表单填写
│   ├── ScrollOperation            # 页面滚动
│   └── ScreenshotOperation       # 截图操作
├── content/
│   ├── ContentExtractionOperation # 内容提取
│   ├── LinkExtractionOperation    # 链接提取
│   ├── ImageExtractionOperation   # 图片提取
│   └── VideoExtractionOperation   # 视频提取
├── analysis/
│   ├── PageStructureOperation     # 页面结构分析
│   ├── ElementAnalysisOperation   # 元素分析
│   └── ContentAnalysisOperation  # 内容分析
└── session/
    ├── SessionManagementOperation # 会话管理
    ├── CookieManagementOperation  # Cookie管理
    └── AntiDetectionOperation     # 反检测操作
```

### 2. 文件操作子 (File Operations)

**职责**: 处理文件系统相关的所有操作，包括文件读写、格式转换、存储管理等

**核心能力**:
- 文件读写操作
- 目录结构管理
- 数据格式转换
- 存储和备份
- 压缩和解压

**包含的操作子**:
```
file/
├── basic/
│   ├── FileReadOperation          # 文件读取
│   ├── FileWriteOperation         # 文件写入
│   ├── FileDeleteOperation        # 文件删除
│   └── FileCopyOperation         # 文件复制
├── directory/
│   ├── DirectoryCreateOperation   # 目录创建
│   ├── DirectoryListOperation     # 目录列表
│   ├── DirectoryDeleteOperation  # 目录删除
│   └── DirectoryMoveOperation    # 目录移动
├── format/
│   ├── JSONOperation             # JSON格式处理
│   ├── CSVOperation              # CSV格式处理
│   ├── XMLOperation              # XML格式处理
│   └── MarkdownOperation         # Markdown格式处理
├── compression/
│   ├── ZipOperation              # ZIP压缩
│   ├── GzipOperation             # Gzip压缩
│   └── TarOperation              # Tar压缩
└── storage/
    ├── LocalStorageOperation      # 本地存储
    ├── CloudStorageOperation      # 云存储
    └── BackupOperation           # 备份操作
```

### 3. AI模型操作子 (AI Model Operations)

**职责**: 处理AI模型相关的所有操作，包括模型调用、推理处理、结果分析等

**核心能力**:
- 模型调用和管理
- 文本推理和处理
- 图像分析和识别
- 结果验证和优化
- 多模态处理

**包含的操作子**:
```
ai/
├── inference/
│   ├── TextInferenceOperation    # 文本推理
│   ├── ImageInferenceOperation   # 图像推理
│   ├── MultiModalOperation       # 多模态推理
│   └── BatchInferenceOperation   # 批量推理
├── processing/
│   ├── TextProcessingOperation   # 文本处理
│   ├── ImageProcessingOperation  # 图像处理
│   ├── AudioProcessingOperation  # 音频处理
│   └── VideoProcessingOperation  # 视频处理
├── analysis/
│   ├── ContentAnalysisOperation  # 内容分析
│   ├── SentimentAnalysisOperation # 情感分析
│   ├── EntityRecognitionOperation # 实体识别
│   └── QualityAnalysisOperation  # 质量分析
├── optimization/
│   ├── PromptOptimizationOperation # 提示词优化
│   ├── ModelSelectionOperation    # 模型选择
│   └── ResultOptimizationOperation # 结果优化
└── management/
    ├── ModelManagementOperation  # 模型管理
    ├── CacheManagementOperation  # 缓存管理
    └── ResourceManagementOperation # 资源管理
```

### 4. 通信系统操作子 (Communication Operations)

**职责**: 处理通信相关的所有操作，包括网络请求、API调用、消息传递等

**核心能力**:
- HTTP请求处理
- API客户端管理
- 消息队列操作
- 实时通信
- 协议转换

**包含的操作子**:
```
communication/
├── http/
│   ├── HttpRequestOperation      # HTTP请求
│   ├── HttpResponseOperation     # HTTP响应
│   ├── APIClientOperation        # API客户端
│   └── WebhookOperation          # Webhook处理
├── messaging/
│   ├── MessageQueueOperation    # 消息队列
│   ├── PubSubOperation          # 发布订阅
│   ├── StreamingOperation       # 流式传输
│   └── BroadcastOperation       # 广播操作
├── protocol/
│   ├── RestAPIOperation         # REST API
│   ├── GraphQLOperation         # GraphQL
│   ├── WebSocketOperation       # WebSocket
│   └── MCIPOperation            # MCP协议
├── auth/
│   ├── AuthenticationOperation  # 身份验证
│   ├── AuthorizationOperation   # 授权管理
│   ├── TokenManagementOperation # 令牌管理
│   └── SecurityOperation        # 安全操作
└── monitoring/
    ├── HealthCheckOperation     # 健康检查
    ├── MetricsOperation         # 指标收集
    ├── LoggingOperation         # 日志操作
    └── AlertOperation           # 告警操作
```

## 架构优势

### 1. 清晰的职责分离
- 每个类别专注于特定的操作对象
- 减少类之间的耦合
- 提高代码的可维护性

### 2. 易于扩展
- 新增操作子时明确归属类别
- 支持插件化架构
- 便于第三方扩展

### 3. 更好的测试性
- 按类别进行单元测试
- 模拟依赖更加清晰
- 集成测试更有针对性

### 4. 配置驱动
- 每个类别可以有自己的配置文件
- 支持动态加载和配置
- 便于环境切换

## 工作流编排

### 操作子编排模式
```
Workflow Engine
├── Preflows（登录/环境）
├── Anchor Flow（入站锚点：Start→AttachSession→AnchorPointNode→End）
├── Browser Operations → Page Navigation → Content Extraction
├── File Operations → Data Storage → Format Conversion  
├── AI Operations → Content Analysis → Result Processing
└── Communication Operations → API Calls → Data Transmission
```

### 数据流向
```
Input → Preflows → Anchor(Top) → Workflow Nodes → Stage Anchor(s) →
Results → Save/Relay → Output

## 锚点协议（Anchor Protocol）

### 为什么需要
复杂站点（例如 1688）存在风控与跳页延迟，若直接执行节点易误触。锚点协议通过“页面级定位元素”作为入站门槛，确保“在对的页面/容器上继续”。

### 如何使用
- 顶层锚点：在工作流 JSON 顶层声明 `anchor`（host/urlPattern/frame/selectors/textIncludes/requireVisible 等），Runner 会自动在主流前执行锚点检查小流；
- 阶段锚点：在关键步骤显式加入 `AnchorPointNode`；
- 失败处理：未命中锚点直接停止主流，保留页面供人工解除风控后复跑。

### 与接力的关系
锚点协议为每一次接力提供“入口约束”，结合 `AttachSessionNode` 和 CookieManager，保证同一会话内的上下文连贯与安全。
```

### 2. 工作流框架 (Workflow Framework)

工作流框架负责将多个操作子组合成完整的业务逻辑，支持依赖管理、错误处理和条件执行。

#### 工作流定义格式

```json
{
  "workflowId": "weibo-batch-download-workflow",
  "name": "微博批量下载工作流",
  "description": "从微博个人主页批量下载帖子、图片和评论",
  "version": "1.0.0",
  "category": "weibo",
  "tags": ["download", "batch", "media"],

  "input": {
    "required": ["profileUrl"],
    "optional": ["maxPosts", "mediaQuality", "includeComments"],
    "defaults": {
      "maxPosts": 50,
      "mediaQuality": "original",
      "includeComments": true
    }
  },

  "operations": [
    {
      "id": "initialize-browser",
      "name": "初始化浏览器",
      "operation": "NavigateOperation",
      "config": {
        "url": "${profileUrl}",
        "waitForSelector": ".WB_cardwrap",
        "timeout": 30000
      },
      "output": ["page"],
      "onError": "retry"
    },
    {
      "id": "extract-posts",
      "name": "提取帖子列表",
      "operation": "ExtractContentOperation",
      "dependsOn": ["initialize-browser"],
      "config": {
        "selector": ".Feed_body_3R0rO",
        "multiple": true,
        "extract": ["content", "time", "stats"]
      },
      "output": ["posts"]
    },
    {
      "id": "download-media",
      "name": "下载媒体文件",
      "operation": "DownloadMediaOperation",
      "dependsOn": ["extract-posts"],
      "config": {
        "quality": "${mediaQuality}",
        "concurrency": 5,
        "timeout": 60000
      },
      "parallel": true
    }
  ],

  "errorHandling": {
    "strategy": "continue-on-error",
    "maxRetries": 3,
    "retryDelay": 5000
  }
}
```

#### 工作流执行引擎

```javascript
class WorkflowEngine {
  constructor() {
    this.operations = new Map();
    this.dependencyGraph = new Map();
  }

  async executeWorkflow(workflowConfig, input = {}) {
    const executionId = this.generateExecutionId();
    const context = new ExecutionContext(executionId, input);

    try {
      // 构建依赖图
      await this.buildDependencyGraph(workflowConfig.operations);

      // 按依赖顺序执行
      const sortedOperations = this.topologicalSort(workflowConfig.operations);

      for (const operationConfig of sortedOperations) {
        await this.executeOperation(operationConfig, context);
      }

      return {
        success: true,
        executionId,
        results: context.getResults()
      };

    } catch (error) {
      await this.handleError(error, context, workflowConfig.errorHandling);
      throw error;
    }
  }
}
```

### 3. 任务编排系统 (Task Orchestration)

任务编排系统是最高层的抽象，允许用户组合多个工作流完成复杂的业务目标。

#### 任务定义格式

```json
{
  "taskId": "weibo-complete-monitoring-task",
  "name": "微博完整监控任务",
  "description": "持续监控微博用户并自动下载新内容",
  "template": "weibo-monitoring-template",

  "schedule": {
    "type": "cron",
    "expression": "0 */2 * * *",  // 每2小时执行
    "timezone": "Asia/Shanghai",
    "enabled": true
  },

  "workflows": [
    {
      "id": "monitoring",
      "name": "内容监控",
      "workflow": "weibo-content-monitoring-workflow",
      "config": {
        "targetUrl": "https://weibo.com/1671109627",
        "changeThreshold": 0.1
      },
      "execution": {
        "timeout": 300000,
        "priority": "high"
      }
    },
    {
      "id": "download",
      "name": "批量下载",
      "workflow": "weibo-batch-download-workflow",
      "dependsOn": ["monitoring"],
      "condition": {
        "type": "content-change",
        "threshold": 0.05
      },
      "inputFrom": "monitoring.output"
    },
    {
      "id": "notification",
      "name": "结果通知",
      "workflow": "weibo-notification-workflow",
      "dependsOn": ["download"],
      "inputFrom": "download.output",
      "config": {
        "channels": ["email", "webhook"]
      }
    }
  ],

  "errorHandling": {
    "strategy": "continue-on-error",
    "maxRetries": 3,
    "notificationOnFailure": true
  }
}
```

#### 任务编排器

```javascript
class TaskOrchestrator {
  constructor(config) {
    this.scheduler = new TaskScheduler();
    this.workflowEngine = new WorkflowEngine();
    this.resourceManager = new ResourceManager();
    this.tasks = new Map();
    this.templates = new Map();
  }

  async executeTask(taskId, input = {}) {
    const task = this.tasks.get(taskId);
    const executionId = this.generateExecutionId();
    const execution = new TaskExecution(executionId, task, input);

    try {
      // 按依赖顺序执行工作流
      const workflowResults = await this.executeTaskWorkflows(task, execution);

      execution.complete('success', workflowResults);
      return workflowResults;

    } catch (error) {
      execution.complete('failed', { error: error.message });
      throw error;
    }
  }
}
```

## 🛠️ 实现路线图

### Phase 1: 核心框架开发 (4-6周)
- [ ] 实现操作子基础框架
- [ ] 实现工作流引擎
- [ ] 实现基础操作子 (浏览器、文件、数据处理)
- [ ] 实现简单任务编排器
- [ ] 基础测试和文档

### Phase 2: 高级功能开发 (3-4周)
- [ ] 实现任务调度系统 (Cron、间隔、事件)
- [ ] 实现任务模板系统
- [ ] 实现事件驱动架构
- [ ] 实现资源管理和监控
- [ ] 高级工作流功能 (条件执行、并行处理)

### Phase 3: 业务场景实现 (2-3周)
- [ ] 实现微博相关的具体操作子
- [ ] 实现微博工作流模板
- [ ] 实现完整的监控和下载任务
- [ ] 实现AI总结和通知功能

### Phase 4: 优化和增强 (2-3周)
- [ ] 性能优化和内存管理
- [ ] 错误处理和容错机制
- [ ] 用户界面和管理工具
- [ ] 部署和运维支持

### Phase 5: 生态扩展 (2-3周)
- [ ] 更多操作子类型
- [ ] 更多工作流模板
- [ ] 第三方集成扩展
- [ ] 社区文档和示例

## 📁 项目目录结构

```
webauto/
├── README.md                           # 项目概述
├── ARCHITECTURE_DESIGN.md              # 架构设计文档
├── package.json                        # 根包配置
├── tsconfig.json                       # TypeScript 配置
│
├── sharedmodule/                       # 共享模块目录
│   ├── operations-framework/           # 操作子框架
│   │   ├── src/
│   │   │   ├── core/                   # 核心类
│   │   │   │   ├── BaseOperation.ts    # 操作子基类
│   │   │   │   ├── OperationContext.ts # 操作上下文
│   │   │   │   └── OperationRegistry.ts # 操作子注册器
│   │   │   ├── operations/             # 内置操作子
│   │   │   │   ├── browser/            # 浏览器操作子
│   │   │   │   ├── data/               # 数据处理操作子
│   │   │   │   ├── file/               # 文件操作子
│   │   │   │   └── network/            # 网络操作子
│   │   │   └── utils/                  # 工具函数
│   │   ├── config/                     # 配置文件
│   │   └── tests/                      # 测试文件
│   │
│   ├── workflow-framework/             # 工作流框架
│   │   ├── src/
│   │   │   ├── core/                   # 核心类
│   │   │   │   ├── WorkflowEngine.ts   # 工作流引擎
│   │   │   │   ├── WorkflowDefinition.ts # 工作流定义
│   │   │   │   └── DependencyManager.ts # 依赖管理器
│   │   │   ├── workflows/                 # 预定义工作流
│   │   │   │   ├── weibo/                  # 微博相关工作流
│   │   │   │   └── general/                # 通用工作流
│   │   │   └── tests/                      # 工作流测试
│   │
│   ├── task-orchestrator/              # 任务编排器
│   │   ├── src/
│   │   │   ├── core/                   # 核心类
│   │   │   │   ├── TaskOrchestrator.ts  # 任务编排器
│   │   │   │   ├── TaskScheduler.ts    # 任务调度器
│   │   │   │   └── TaskTemplate.ts     # 任务模板
│   │   │   ├── templates/              # 任务模板
│   │   │   └── tests/                  # 任务测试
│   │
│   └── common/                         # 公共模块
│       ├── src/
│       │   ├── logger/                 # 日志系统
│       │   ├── config/                 # 配置管理
│       │   ├── types/                  # 类型定义
│       │   └── constants/              # 常量定义
│
├── examples/                           # 示例代码
│   ├── basic-operations/               # 基础操作子示例
│   ├── simple-workflows/               # 简单工作流示例
│   └── task-templates/                 # 任务模板示例
│
└── docs/                              # 文档目录
    ├── user-guide/                     # 用户指南
    ├── developer-guide/                # 开发者指南
    └── api-reference/                  # API 参考
```

## 🎯 成功指标

### 技术指标
- **性能**: 单个工作流执行时间 < 5分钟
- **可靠性**: 系统可用性 > 99.5%
- **扩展性**: 支持 100+ 并发任务
- **内存使用**: 单任务内存占用 < 500MB

### 用户体验指标
- **易用性**: 新用户 30 分钟内完成第一个任务
- **灵活性**: 支持用户自定义工作流和任务
- **可观察性**: 完整的执行日志和监控
- **文档完整性**: 95% 的功能有详细文档

## 配置示例

### 操作子配置文件结构
```json
{
  "categories": {
    "browser": {
      "enabled": true,
      "operations": {
        "navigation": {
          "timeout": 30000,
          "retryAttempts": 3
        },
        "interaction": {
          "defaultDelay": 1000,
          "antiDetection": true
        }
      }
    },
    "file": {
      "enabled": true,
      "storagePath": "./data",
      "backupEnabled": true
    },
    "ai": {
      "enabled": true,
      "defaultModel": "gpt-4",
      "cacheEnabled": true
    },
    "communication": {
      "enabled": true,
      "apiTimeout": 10000,
      "retryAttempts": 3
    }
  }
}
```

### 工作流配置示例
```json
{
  "workflow": {
    "name": "微博内容抓取",
    "steps": [
      {
        "category": "browser",
        "operation": "navigation",
        "action": "navigate",
        "params": {
          "url": "https://weibo.com/example"
        }
      },
      {
        "category": "browser", 
        "operation": "content",
        "action": "extract",
        "params": {
          "contentType": "posts"
        }
      },
      {
        "category": "ai",
        "operation": "analysis",
        "action": "analyze",
        "params": {
          "analysisType": "sentiment"
        }
      },
      {
        "category": "file",
        "operation": "storage",
        "action": "save",
        "params": {
          "format": "json",
          "path": "./results/"
        }
      }
    ]
  }
}
```
