# 容器-工作流集成架构设计

## 🎯 设计概述

本文档描述了如何将自刷新容器系统与现有的节点工作流架构进行集成，创建一个统一的内容捕获系统。该集成架构充分利用了容器的动态特性，同时保持了工作流的模块化和可配置性。

## 🏗️ 架构层次设计

### 层次结构
```
应用层 (Application Layer)
    ↓
工作流编排层 (Workflow Orchestration Layer)
    ↓
容器执行层 (Container Execution Layer)
    ↓
浏览器操作层 (Browser Operation Layer)
    ↓
页面交互层 (Page Interaction Layer)
```

### 核心组件

#### 1. **ContainerWorkflowEngine** - 容器工作流引擎
- **作用**: 统一管理容器和工作流的执行
- **特点**: 支持容器嵌套、并行执行、状态管理

#### 2. **ContainerBasedNode** - 基于容器的节点
- **作用**: 将容器能力封装为工作流节点
- **特点**: 继承BaseNode，内部管理容器生命周期

#### 3. **WorkflowContainerAdapter** - 工作流容器适配器
- **作用**: 在工作流和容器之间提供适配层
- **特点**: 数据转换、错误处理、状态同步

## 🔄 集成架构设计

### 容器工作流引擎架构

```typescript
class ContainerWorkflowEngine {
  private workflowConfig: WorkflowConfig;
  private containerRegistry: Map<string, BaseSelfRefreshingContainer>;
  private executionContext: ExecutionContext;
  private sharedSpace: ContainerSharedSpace;

  async execute(inputData: any): Promise<WorkflowResult> {
    // 1. 初始化共享空间
    this.sharedSpace = this.createSharedSpace();

    // 2. 创建根容器
    const rootContainer = this.createRootContainer();

    // 3. 执行工作流
    const result = await this.executeWorkflow(rootContainer);

    // 4. 清理资源
    await this.cleanup();

    return result;
  }
}
```

### 基于容器的节点设计

```typescript
class ContainerBasedNode extends BaseNode {
  private containerConfig: ContainerConfig;
  private container: BaseSelfRefreshingContainer;
  private containerType: string;

  async execute(inputData: any): Promise<NodeResult> {
    // 1. 创建容器
    this.container = this.createContainer();

    // 2. 初始化容器
    await this.container.initialize(this.page, this.sharedSpace);

    // 3. 等待容器完成
    await this.waitForContainerCompletion();

    // 4. 提取结果
    const result = await this.extractContainerResult();

    // 5. 清理容器
    await this.container.cleanup();

    return result;
  }
}
```

## 🎯 具体实现方案

### 1. 微博帖子捕获工作流

#### 工作流配置
```json
{
  "name": "weibo-post-capture-workflow",
  "version": "2.0.0",
  "description": "基于容器的微博帖子捕获工作流",
  "nodes": [
    {
      "id": "post-analysis-container",
      "type": "ContainerBasedNode",
      "name": "帖子分析容器",
      "containerType": "WeiboPostContainer",
      "config": {
        "selector": ".Feed_body, .article-container",
        "maxPosts": 1,
        "enableAutoRefresh": true,
        "taskCompletionCriteria": {
          "type": "count",
          "targetCount": 1
        }
      }
    },
    {
      "id": "comment-extraction-container",
      "type": "ContainerBasedNode",
      "name": "评论提取容器",
      "containerType": "WeiboCommentContainer",
      "config": {
        "selector": ".Feed_body_comments, .Comment_container",
        "maxComments": 500,
        "enableAutoScroll": true,
        "autoExecuteLoadMore": true,
        "enableAutoRefresh": true
      },
      "dependencies": ["post-analysis-container"]
    },
    {
      "id": "media-capture-container",
      "type": "ContainerBasedNode",
      "name": "媒体捕获容器",
      "containerType": "WeiboMediaContainer",
      "config": {
        "selector": ".Feed_body_media, .media-container",
        "enableAutoRefresh": true,
        "maxMediaFiles": 50
      },
      "dependencies": ["post-analysis-container"]
    },
    {
      "id": "data-integration-node",
      "type": "DataIntegrationNode",
      "name": "数据整合节点",
      "config": {
        "mergeStrategy": "deep-merge",
        "validationRules": ["required-fields", "data-format"]
      },
      "dependencies": [
        "comment-extraction-container",
        "media-capture-container"
      ]
    },
    {
      "id": "structured-save-node",
      "type": "StructuredDataSaverNode",
      "name": "结构化保存节点",
      "config": {
        "outputFormats": ["json", "csv"],
        "outputDirectory": "./captured-posts",
        "includeReport": true
      },
      "dependencies": ["data-integration-node"]
    }
  ]
}
```

### 2. 容器类型注册

```typescript
class ContainerRegistry {
  private containerTypes: Map<string, typeof BaseSelfRefreshingContainer> = new Map();

  constructor() {
    // 注册内置容器类型
    this.registerContainer('WeiboPostContainer', WeiboPostContainer);
    this.registerContainer('WeiboCommentContainer', WeiboCommentContainer);
    this.registerContainer('WeiboMediaContainer', WeiboMediaContainer);
    this.registerContainer('WeiboReplyContainer', WeiboReplyContainer);

    // 支持动态注册
    this.registerContainer('CustomContainer', CustomContainer);
  }

  registerContainer(type: string, containerClass: typeof BaseSelfRefreshingContainer) {
    this.containerTypes.set(type, containerClass);
  }

  createContainer(type: string, config: ContainerConfig): BaseSelfRefreshingContainer {
    const ContainerClass = this.containerTypes.get(type);
    if (!ContainerClass) {
      throw new Error(`未知的容器类型: ${type}`);
    }
    return new ContainerClass(config);
  }
}
```

### 3. 共享空间管理

```typescript
class SharedSpaceManager {
  createSharedSpace(page: any, config: any): ContainerSharedSpace {
    return {
      fileHandler: this.createFileHandler(config),
      dataStore: this.createDataStore(),
      pageOperator: this.createPageOperator(page),
      config: this.createConfig(config)
    };
  }

  private createFileHandler(config: any) {
    return {
      saveFile: async (data: any, path: string) => {
        const fullPath = `${config.outputDir}/${path}`;
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeJSON(fullPath, data);
      },
      readFile: async (path: string) => {
        return await fs.readJSON(path);
      },
      deleteFile: async (path: string) => {
        await fs.remove(path);
      }
    };
  }

  private createDataStore() {
    const store = new Map();
    return {
      setData: (key: string, value: any) => store.set(key, value),
      getData: (key: string) => store.get(key),
      hasData: (key: string) => store.has(key)
    };
  }

  private createPageOperator(page: any) {
    return {
      click: async (selector: string) => {
        await page.click(selector);
      },
      type: async (selector: string, text: string) => {
        await page.type(selector, text);
      },
      scroll: async (options: any) => {
        await page.evaluate((opts) => {
          window.scrollTo(opts.x || 0, opts.y || document.body.scrollHeight);
        }, options);
      },
      waitFor: async (selector: string, timeout?: number) => {
        await page.waitForSelector(selector, { timeout });
      }
    };
  }
}
```

## 🎮 执行流程

### 1. 初始化阶段
```typescript
async function initializeWorkflow() {
  // 1. 创建工作流引擎
  const engine = new ContainerWorkflowEngine({
    configPath: './workflow-config.json'
  });

  // 2. 注册容器类型
  engine.registerContainer('WeiboPostContainer', WeiboPostContainer);
  engine.registerContainer('WeiboCommentContainer', WeiboCommentContainer);

  // 3. 创建共享空间
  const sharedSpace = sharedSpaceManager.createSharedSpace(page, config);

  // 4. 初始化浏览器
  const browser = await playwright.launch();
  const page = await browser.newPage();

  return { engine, sharedSpace, browser, page };
}
```

### 2. 执行阶段
```typescript
async function executeWorkflow() {
  const { engine, sharedSpace, browser, page } = await initializeWorkflow();

  try {
    // 导航到目标页面
    await page.goto(inputData.postUrl);

    // 执行工作流
    const result = await engine.execute({
      page,
      sharedSpace,
      inputData: {
        postUrl: inputData.postUrl,
        options: {
          enableMediaDownload: true,
          enableCommentExtraction: true,
          maxComments: 500
        }
      }
    });

    return result;

  } finally {
    // 清理资源
    await browser.close();
  }
}
```

### 3. 容器生命周期管理
```typescript
class ContainerLifecycleManager {
  async executeContainerNode(node: ContainerBasedNode, context: ExecutionContext) {
    // 1. 创建容器
    const container = containerRegistry.createContainer(
      node.containerType,
      node.containerConfig
    );

    // 2. 初始化容器
    await container.initialize(context.page, context.sharedSpace);

    // 3. 监听容器事件
    this.setupContainerEventListeners(container);

    // 4. 等待任务完成
    await this.waitForContainerCompletion(container);

    // 5. 提取结果
    const result = await this.extractContainerResult(container);

    // 6. 清理容器
    await container.cleanup();

    return result;
  }
}
```

## 📊 数据流设计

### 数据流向
```
页面内容 → 容器提取 → 数据整合 → 结构化保存
    ↓           ↓          ↓          ↓
容器管理 → 工作流编排 → 数据处理 → 文件输出
```

### 数据格式
```typescript
interface ContainerWorkflowResult {
  version: string;
  workflowType: 'container-based';
  executionTime: number;
  containers: {
    [containerId: string]: {
      type: string;
      config: ContainerConfig;
      result: any;
      stats: any;
      executionTime: number;
    };
  };
  integratedData: {
    post: any;
    comments: any[];
    media: any[];
    metadata: any;
  };
  output: {
    files: string[];
    report: string;
    summary: any;
  };
}
```

## 🛡️ 错误处理机制

### 容器级别错误处理
```typescript
class ContainerErrorHandler {
  async handleContainerError(error: Error, container: BaseSelfRefreshingContainer) {
    // 1. 记录错误
    this.logError(error, container);

    // 2. 尝试恢复
    const recovered = await this.attemptRecovery(container);

    // 3. 如果恢复失败，传递错误
    if (!recovered) {
      throw new ContainerExecutionError(error, container.config.id);
    }
  }

  private async attemptRecovery(container: BaseSelfRefreshingContainer): Promise<boolean> {
    try {
      // 1. 重新初始化容器
      await container.cleanup();
      await container.initialize(this.page, this.sharedSpace);

      // 2. 检查容器状态
      const state = container.getState();
      return state.status === 'running';

    } catch (error) {
      return false;
    }
  }
}
```

### 工作流级别错误处理
```typescript
class WorkflowErrorHandler {
  async handleWorkflowError(error: Error, failedNode: string, context: ExecutionContext) {
    // 1. 保存当前状态
    await this.saveCheckpoint(context);

    // 2. 根据错误类型决定恢复策略
    const strategy = this.determineRecoveryStrategy(error);

    // 3. 执行恢复
    const recovered = await this.executeRecovery(strategy, context);

    // 4. 返回恢复结果
    return {
      recovered,
      errorDetails: this.formatErrorDetails(error),
      suggestedAction: this.getSuggestedAction(strategy)
    };
  }
}
```

## 🚀 性能优化

### 1. 并发执行优化
```typescript
class ConcurrentExecutionManager {
  async executeContainersInParallel(containers: BaseSelfRefreshingContainer[]) {
    // 1. 创建执行池
    const pool = new WorkerPool(this.config.maxConcurrency);

    // 2. 分发任务
    const promises = containers.map(container =>
      pool.execute(() => this.executeContainer(container))
    );

    // 3. 等待完成
    const results = await Promise.allSettled(promises);

    // 4. 处理结果
    return this.processResults(results);
  }
}
```

### 2. 内存管理优化
```typescript
class MemoryManager {
  private memoryThreshold: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.memoryThreshold = 500 * 1024 * 1024; // 500MB
    this.startMemoryMonitoring();
  }

  private startMemoryMonitoring() {
    this.cleanupInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed > this.memoryThreshold) {
        this.performCleanup();
      }
    }, 30000); // 每30秒检查一次
  }

  private performCleanup() {
    // 1. 清理完成的容器
    this.cleanupCompletedContainers();

    // 2. 清理临时数据
    this.cleanupTemporaryData();

    // 3. 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
  }
}
```

## 📈 监控和日志

### 执行监控
```typescript
class WorkflowMonitor {
  private metrics: Map<string, any> = new Map();

  startMonitoring(workflowId: string) {
    this.metrics.set(workflowId, {
      startTime: Date.now(),
      containers: new Map(),
      events: []
    });
  }

  recordContainerEvent(workflowId: string, containerId: string, event: string, data: any) {
    const workflowMetrics = this.metrics.get(workflowId);
    if (workflowMetrics) {
      workflowMetrics.events.push({
        timestamp: Date.now(),
        containerId,
        event,
        data
      });
    }
  }

  getWorkflowStats(workflowId: string) {
    const metrics = this.metrics.get(workflowId);
    if (!metrics) return null;

    return {
      executionTime: Date.now() - metrics.startTime,
      containerCount: metrics.containers.size,
      eventCount: metrics.events.length,
      performance: this.calculatePerformance(metrics.events)
    };
  }
}
```

## 🎯 部署和扩展

### 配置管理
```typescript
class WorkflowConfigManager {
  async loadWorkflow(configPath: string): Promise<WorkflowConfig> {
    const config = await fs.readJSON(configPath);

    // 验证配置
    this.validateConfig(config);

    // 解析环境变量
    this.resolveEnvironmentVariables(config);

    return config;
  }

  private validateConfig(config: WorkflowConfig) {
    // 验证节点配置
    config.nodes.forEach(node => {
      if (node.type === 'ContainerBasedNode') {
        this.validateContainerNode(node);
      }
    });
  }
}
```

## 📝 总结

这个容器-工作流集成架构设计提供了一个完整的解决方案，将自刷新容器的动态特性与工作流的模块化设计相结合。主要优势包括：

1. **统一架构**: 容器和工作流的无缝集成
2. **高度可配置**: 支持多种容器类型和执行模式
3. **动态适应**: 容器自动适应页面变化
4. **错误恢复**: 完善的错误处理和恢复机制
5. **性能优化**: 并发执行和内存管理优化
6. **监控完善**: 详细的执行监控和日志记录

该架构为后续的批量处理、任务调度等高级功能奠定了坚实的基础。