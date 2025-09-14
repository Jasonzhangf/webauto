# 微博容器操作系统 - 最终架构设计

## 系统架构概览

```
微博容器操作系统 (Weibo Container OS)
├── 核心层 (Core Layer)
│   ├── 状态中心 (SystemStateCenter) - 系统核心服务
│   ├── 容器基类 (BaseContainer) - 继承自RCC BaseModule
│   └── 操作子基类 (BaseOperation) - 操作子基础实现
├── 容器层 (Container Layer)
│   ├── 页面容器 (PageContainer)
│   ├── 用户主页容器 (UserProfileContainer)
│   ├── 微博列表容器 (PostListContainer)
│   ├── 分页容器 (PaginationContainer)
│   └── 详情页容器 (DetailContainer)
├── 操作层 (Operation Layer)
│   ├── 发现操作 (DiscoveryOperations)
│   ├── 内容操作 (ContentOperations)
│   ├── 交互操作 (InteractionOperations)
│   └── 流程操作 (FlowOperations)
├── 状态层 (State Layer)
│   ├── 状态注册中心 (EntityRegistry)
│   ├── 状态同步器 (StateSynchronizer)
│   ├── 变化检测器 (ChangeDetector)
│   └── 条件评估器 (ConditionEvaluator)
└── 执行层 (Execution Layer)
    ├── 执行流引擎 (FlowExecutor)
    ├── 状态驱动执行器 (StateDrivenExecutor)
    └── JSON配置解析器 (FlowConfigParser)
```

## 1. 系统状态中心 (SystemStateCenter)

### 1.1 状态中心核心设计

状态中心作为系统的核心服务，在系统启动时首先初始化，负责管理所有实体的状态：

```typescript
class SystemStateCenter extends BaseModule {
  private static instance: SystemStateCenter;
  
  // 状态存储
  private pageState: IPageState;
  private entityStates: Map<string, IEntityState> = new Map();
  private flowStates: Map<string, IFlowState> = new Map();
  
  // 注册中心
  private entityRegistry: Map<string, IEntityRegistration> = new Map();
  private subscriberRegistry: Map<string, Set<ISubscription>> = new Map();
  
  // 核心服务
  private stateSynchronizer: StateSynchronizer;
  private changeDetector: ChangeDetector;
  private eventBus: EventBus;
  
  constructor(config: any) {
    super({
      id: 'SystemStateCenter',
      name: 'System State Center',
      version: '1.0.0',
      type: 'state-center',
      ...config
    });
    
    this.initialize();
  }
  
  static getInstance(config?: any): SystemStateCenter {
    if (!SystemStateCenter.instance) {
      SystemStateCenter.instance = new SystemStateCenter(config);
    }
    return SystemStateCenter.instance;
  }
  
  // 实体注册接口
  async registerEntity(entity: IEntityRegistration): Promise<void> {
    this.entityRegistry.set(entity.id, entity);
    
    // 创建实体状态
    const entityState: IEntityState = {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      status: 'registered',
      properties: new Map(),
      metrics: new Map(),
      timestamp: Date.now()
    };
    
    this.entityStates.set(entity.id, entityState);
    this.createEntitySubscriptions(entity);
  }
  
  // 状态更新接口
  async updateEntityState(entityId: string, updates: Partial<IEntityState>): Promise<void> {
    const currentState = this.entityStates.get(entityId);
    if (!currentState) throw new Error(`Entity not found: ${entityId}`);
    
    const oldState = { ...currentState };
    const newState = { ...currentState, ...updates, timestamp: Date.now() };
    
    // 检测状态变化
    const changes = this.changeDetector.detectChanges(oldState, newState);
    
    if (changes.hasChanges) {
      this.entityStates.set(entityId, newState);
      await this.stateSynchronizer.recordChange(entityId, oldState, newState, changes);
      await this.triggerSubscriptions(entityId, newState, changes);
    }
  }
  
  // 状态查询接口
  getEntityState(entityId: string): IEntityState | undefined {
    return this.entityStates.get(entityId);
  }
  
  // 状态订阅接口
  async subscribeToEntity(entityId: string, subscription: ISubscription): Promise<string> {
    const subscriptionId = generateSubscriptionId();
    
    if (!this.subscriberRegistry.has(entityId)) {
      this.subscriberRegistry.set(entityId, new Set());
    }
    
    this.subscriberRegistry.get(entityId)!.add({
      ...subscription,
      id: subscriptionId,
      entityId
    });
    
    return subscriptionId;
  }
}
```

### 1.2 实体注册接口

```typescript
interface IEntityRegistration {
  id: string;
  name: string;
  type: 'container' | 'element' | 'flow' | 'page' | 'system';
  
  // 实体元数据
  metadata?: {
    version?: string;
    description?: string;
    tags?: string[];
  };
  
  // 状态模式
  statePattern?: {
    properties: string[];
    metrics: string[];
    events: string[];
  };
  
  // 监控配置
  monitoring?: {
    enabled: boolean;
    interval?: number;
    healthCheck?: boolean;
  };
  
  // 生命周期回调
  lifecycle?: {
    onRegistered?: () => Promise<void>;
    onUnregistered?: () => Promise<void>;
    onStateChange?: (newState: IEntityState, changes: IChangeSet) => Promise<void>;
  };
}

interface IEntityState {
  id: string;
  name: string;
  type: string;
  status: 'registered' | 'initializing' | 'active' | 'inactive' | 'error';
  
  // 实体属性
  properties: Map<string, any>;
  metrics: Map<string, number>;
  
  // 健康状态
  health?: {
    status: 'healthy' | 'warning' | 'error';
    lastCheck: number;
    issues?: string[];
  };
  
  // 时间戳
  timestamp: number;
}
```

## 2. 容器系统设计

### 2.1 容器基类设计

```typescript
abstract class BaseContainer extends BaseModule {
  protected stateCenter: SystemStateCenter;
  protected containerId: string;
  protected children: Map<string, BaseContainer> = new Map();
  protected operations: Map<string, IOperation> = new Map();
  
  constructor(config: any) {
    super({
      id: config.id,
      name: config.name,
      version: '1.0.0',
      type: 'container',
      ...config
    });
    
    this.containerId = this.id;
    this.stateCenter = SystemStateCenter.getInstance();
  }
  
  async initialize(): Promise<void> {
    await super.initialize();
    
    // 注册到状态中心
    await this.registerToStateCenter();
    
    // 初始化子容器
    await this.initializeChildren();
    
    // 注册操作
    await this.registerOperations();
    
    this.logInfo(`${this.name} initialized and registered to state center`);
  }
  
  protected abstract registerToStateCenter(): Promise<void>;
  protected abstract initializeChildren(): Promise<void>;
  protected abstract registerOperations(): Promise<void>;
  
  // 点号访问支持
  get [key: string]: any {
    if (this.children.has(key)) {
      return this.children.get(key);
    }
    return super[key];
  }
  
  // 操作调用
  async executeOperation(operationName: string, params: any = {}): Promise<any> {
    const operation = this.operations.get(operationName);
    if (!operation) {
      throw new Error(`Operation not found: ${operationName}`);
    }
    
    const context = this.createExecutionContext();
    const result = await operation.execute(context, params);
    
    // 更新状态中心
    await this.updateOperationState(operationName, params, result);
    
    return result;
  }
  
  private createExecutionContext(): IExecutionContext {
    return {
      container: this,
      stateCenter: this.stateCenter,
      page: this.page,
      timestamp: Date.now()
    };
  }
  
  private async updateOperationState(operationName: string, params: any, result: any): Promise<void> {
    const currentState = this.stateCenter.getEntityState(this.containerId);
    const operationCount = (currentState?.metrics.get('operationCount') || 0) + 1;
    
    await this.stateCenter.updateEntityState(this.containerId, {
      metrics: new Map([
        ['operationCount', operationCount],
        ['lastOperation', operationName],
        ['lastOperationTime', Date.now()]
      ])
    });
  }
}
```

### 2.2 用户主页容器实现

```typescript
class UserProfileContainer extends BaseContainer {
  private userProfileNode: ContainerNode;
  private postListNode: ContainerNode;
  private paginationNode: ContainerNode;
  
  constructor(config: any) {
    super({
      id: 'UserProfileContainer',
      name: 'User Profile Container',
      ...config
    });
  }
  
  protected async registerToStateCenter(): Promise<void> {
    const registration: IEntityRegistration = {
      id: this.containerId,
      name: this.name,
      type: 'container',
      metadata: {
        version: this.version,
        description: 'User profile container',
        tags: ['user', 'profile', 'container']
      },
      statePattern: {
        properties: ['status', 'discovered', 'elementCount'],
        metrics: ['loadTime', 'operationCount'],
        events: ['user_info_extracted', 'posts_loaded']
      },
      monitoring: {
        enabled: true,
        interval: 5000
      },
      lifecycle: {
        onRegistered: this.onRegistered.bind(this),
        onStateChange: this.onStateChange.bind(this)
      }
    };
    
    await this.stateCenter.registerEntity(registration);
  }
  
  protected async initializeChildren(): Promise<void> {
    // 创建子容器
    this.userProfileNode = new ContainerNode('userProfile', 'User Profile');
    this.postListNode = new ContainerNode('postList', 'Post List');
    this.paginationNode = new ContainerNode('pagination', 'Pagination');
    
    // 建立层级关系
    this.children.set('userProfile', this.userProfileNode);
    this.children.set('postList', this.postListNode);
    this.children.set('pagination', this.paginationNode);
    
    // 注册子容器到状态中心
    await this.registerChildToStateCenter(this.userProfileNode);
    await this.registerChildToStateCenter(this.postListNode);
    await this.registerChildToStateCenter(this.paginationNode);
  }
  
  protected async registerOperations(): Promise<void> {
    // 用户信息提取操作
    this.operations.set('extractUserInfo', new ExtractUserInfoOperation());
    
    // 微博列表操作
    this.operations.set('extractPosts', new ExtractPostsOperation());
    
    // 分页操作
    this.operations.set('nextPage', new NextPageOperation());
    this.operations.set('hasMore', new HasMoreOperation());
  }
  
  private async onRegistered(): Promise<void> {
    await this.stateCenter.updateEntityState(this.containerId, {
      status: 'active',
      properties: new Map([['initialized', true]])
    });
  }
  
  private async onStateChange(newState: IEntityState, changes: IChangeSet): Promise<void> {
    this.logInfo('Container state changed', { changes });
  }
  
  private async registerChildToStateCenter(child: ContainerNode): Promise<void> {
    const registration: IEntityRegistration = {
      id: child.id,
      name: child.name,
      type: 'container',
      metadata: {
        description: `Child container: ${child.name}`
      }
    };
    
    await this.stateCenter.registerEntity(registration);
  }
}
```

## 3. 操作子系统设计

### 3.1 操作子基类

```typescript
abstract class BaseOperation extends BaseModule implements IOperation {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: OperationCategory;
  
  protected stateCenter: SystemStateCenter;
  
  constructor(config: any) {
    super({
      id: config.id,
      name: config.name,
      type: 'operation',
      ...config
    });
    
    this.stateCenter = SystemStateCenter.getInstance();
  }
  
  async execute(context: IExecutionContext, params: any): Promise<OperationResult> {
    const startTime = Date.now();
    
    try {
      await this.onBeforeExecute(context, params);
      
      const result = await this.doExecute(context, params);
      
      await this.onAfterExecute(context, params, result);
      
      return {
        success: true,
        status: OperationStatus.COMPLETED,
        data: result,
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          memory: process.memoryUsage().heapUsed
        }
      };
      
    } catch (error) {
      await this.onError(error, context, params);
      
      return {
        success: false,
        status: OperationStatus.FAILED,
        error: this.normalizeError(error),
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          memory: process.memoryUsage().heapUsed
        }
      };
    }
  }
  
  protected abstract doExecute(context: IExecutionContext, params: any): Promise<any>;
  
  protected async onBeforeExecute(context: IExecutionContext, params: any): Promise<void> {
    this.logInfo(`Executing operation: ${this.name}`, { params });
  }
  
  protected async onAfterExecute(context: IExecutionContext, params: any, result: any): Promise<void> {
    this.logInfo(`Operation completed: ${this.name}`, { result });
    
    // 更新操作统计
    await this.updateOperationMetrics(context.container.id, true);
  }
  
  protected async onError(error: Error, context: IExecutionContext, params: any): Promise<void> {
    this.logError(`Operation failed: ${this.name}`, { error: error.message, params });
    
    // 更新操作统计
    await this.updateOperationMetrics(context.container.id, false);
  }
  
  private async updateOperationMetrics(containerId: string, success: boolean): Promise<void> {
    const currentState = this.stateCenter.getEntityState(containerId);
    const successCount = (currentState?.metrics.get('successCount') || 0) + (success ? 1 : 0);
    const failureCount = (currentState?.metrics.get('failureCount') || 0) + (success ? 0 : 1);
    
    await this.stateCenter.updateEntityState(containerId, {
      metrics: new Map([
        ['successCount', successCount],
        ['failureCount', failureCount]
      ])
    });
  }
  
  private normalizeError(error: Error): OperationError {
    return {
      message: error.message,
      stack: error.stack,
      code: error.name,
      timestamp: Date.now()
    };
  }
}
```

### 3.2 具体操作实现

```typescript
class ExtractUserInfoOperation extends BaseOperation {
  readonly id = 'extract_user_info';
  readonly name = 'Extract User Info';
  readonly description = 'Extract user profile information';
  readonly category = OperationCategory.EXTRACTION;
  
  protected async doExecute(context: IExecutionContext, params: any): Promise<UserProfile> {
    const container = context.container;
    
    // 在容器作用域内查找用户信息元素
    const userInfo = await container.extractUserInfo();
    
    // 更新状态中心
    await this.stateCenter.updateEntityState(container.id, {
      properties: new Map([
        ['userInfo', userInfo],
        ['lastUserInfoUpdate', Date.now()]
      ])
    });
    
    return userInfo;
  }
}

class ExtractPostsOperation extends BaseOperation {
  readonly id = 'extract_posts';
  readonly name = 'Extract Posts';
  readonly description = 'Extract user posts from container';
  readonly category = OperationCategory.EXTRACTION;
  
  protected async doExecute(context: IExecutionContext, params: any): Promise<Post[]> {
    const container = context.container;
    const { limit = 10 } = params;
    
    // 在容器作用域内提取微博
    const posts = await container.extractPosts(limit);
    
    // 更新状态中心
    await this.stateCenter.updateEntityState(container.id, {
      properties: new Map([
        ['posts', posts],
        ['lastPostsUpdate', Date.now()]
      ])
    });
    
    return posts;
  }
}
```

## 4. 执行流系统设计

### 4.1 执行流引擎

```typescript
class FlowExecutor extends BaseModule {
  private stateCenter: SystemStateCenter;
  private conditionEvaluator: StateDrivenConditionEvaluator;
  
  constructor(config: any) {
    super({
      id: 'FlowExecutor',
      name: 'Flow Executor',
      type: 'flow-executor',
      ...config
    });
    
    this.stateCenter = SystemStateCenter.getInstance();
    this.conditionEvaluator = new StateDrivenConditionEvaluator(this.stateCenter);
  }
  
  async executeFlow(flowConfig: FlowConfig): Promise<FlowResult> {
    const flowId = flowConfig.id;
    const startTime = Date.now();
    
    // 初始化流状态
    await this.stateCenter.updateEntityState(flowId, {
      id: flowId,
      name: flowConfig.name,
      type: 'flow',
      status: 'running',
      properties: new Map([
        ['currentStep', 0],
        ['totalSteps', flowConfig.steps.length]
      ]),
      timestamp: Date.now()
    });
    
    try {
      const results = await this.executeSteps(flowConfig.steps, flowId);
      
      // 更新流状态为完成
      await this.stateCenter.updateEntityState(flowId, {
        status: 'completed',
        properties: new Map([['results', results]])
      });
      
      return {
        success: true,
        results,
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime
        }
      };
      
    } catch (error) {
      // 更新流状态为失败
      await this.stateCenter.updateEntityState(flowId, {
        status: 'failed',
        properties: new Map([['error', error.message]])
      });
      
      throw error;
    }
  }
  
  private async executeSteps(steps: FlowStep[], flowId: string): Promise<any[]> {
    const results = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult = await this.executeStep(step, flowId);
      
      // 更新当前步骤
      await this.stateCenter.updateEntityState(flowId, {
        properties: new Map([['currentStep', i + 1]])
      });
      
      results.push(stepResult);
    }
    
    return results;
  }
  
  private async executeStep(step: FlowStep, flowId: string): Promise<any> {
    switch (step.type) {
      case 'operation':
        return await this.executeOperationStep(step, flowId);
      case 'condition':
        return await this.executeConditionStep(step, flowId);
      case 'loop':
        return await this.executeLoopStep(step, flowId);
      case 'parallel':
        return await this.executeParallelStep(step, flowId);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
  
  private async executeOperationStep(step: FlowStep, flowId: string): Promise<any> {
    const { container, operation, params } = step;
    
    // 通过状态中心获取容器
    const containerState = this.stateCenter.getEntityState(container);
    if (!containerState) {
      throw new Error(`Container not found: ${container}`);
    }
    
    // 执行操作（这里需要实际的容器实例）
    // 实际实现中需要通过容器注册表获取容器实例
    const result = await this.executeContainerOperation(container, operation, params);
    
    return result;
  }
  
  private async executeConditionStep(step: FlowStep, flowId: string): Promise<any> {
    const { condition, trueBranch, falseBranch } = step;
    
    const conditionResult = await this.conditionEvaluator.evaluate(condition, {});
    
    if (conditionResult && trueBranch) {
      return await this.executeSteps(trueBranch.steps, flowId);
    } else if (!conditionResult && falseBranch) {
      return await this.executeSteps(falseBranch.steps, flowId);
    }
    
    return { conditionResult };
  }
  
  private async executeLoopStep(step: FlowStep, flowId: string): Promise<any[]> {
    const { loop, steps } = step;
    const results = [];
    
    let iteration = 0;
    let shouldContinue = true;
    
    while (shouldContinue && iteration < (loop.maxIterations || 10)) {
      const iterationResults = await this.executeSteps(steps, flowId);
      results.push(...iterationResults);
      
      // 检查循环条件
      shouldContinue = await this.evaluateLoopCondition(loop, iteration);
      iteration++;
    }
    
    return results;
  }
  
  private async executeParallelStep(step: FlowStep, flowId: string): Promise<any[]> {
    const { steps } = step;
    
    const promises = steps.map(async (parallelStep) => {
      return await this.executeStep(parallelStep, flowId);
    });
    
    return await Promise.all(promises);
  }
  
  private async executeContainerOperation(containerId: string, operation: string, params: any): Promise<any> {
    // 这里需要实现从容器ID获取容器实例并执行操作的逻辑
    // 实际实现中需要维护一个容器注册表
    throw new Error('Not implemented: executeContainerOperation');
  }
  
  private async evaluateLoopCondition(loop: LoopConfig, iteration: number): Promise<boolean> {
    // 根据循环配置评估是否继续循环
    switch (loop.type) {
      case 'fixed':
        return iteration < loop.count;
      case 'while_has_more':
        // 检查容器状态判断是否还有更多内容
        return true; // 简化实现
      case 'until_condition':
        // 评估条件是否满足
        return false; // 简化实现
      default:
        return false;
    }
  }
}
```

## 5. JSON配置示例

```json
{
  "flows": {
    "userProfileFlow": {
      "id": "userProfileFlow",
      "name": "用户主页信息提取流程",
      "steps": [
        {
          "type": "operation",
          "container": "userProfileContainer",
          "operation": "extractUserInfo",
          "params": {}
        },
        {
          "type": "condition",
          "condition": {
            "type": "container_state",
            "containerId": "userProfileContainer",
            "property": "elementCount",
            "operator": "greater_than",
            "value": 0
          },
          "trueBranch": {
            "steps": [
              {
                "type": "operation",
                "container": "userProfileContainer",
                "operation": "extractPosts",
                "params": {"limit": 20}
              }
            ]
          },
          "falseBranch": {
            "steps": [
              {
                "type": "log",
                "message": "用户没有足够的微博内容"
              }
            ]
          }
        },
        {
          "type": "loop",
          "loop": {
            "type": "while_has_more",
            "maxIterations": 5
          },
          "steps": [
            {
              "type": "operation",
              "container": "userProfileContainer.pagination",
              "operation": "nextPage"
            },
            {
              "type": "operation",
              "container": "userProfileContainer",
              "operation": "extractPosts",
              "params": {"limit": 20}
            }
          ]
        }
      ]
    }
  }
}
```

## 6. 系统启动流程

```typescript
class WeiboSystemBootstrapper {
  private stateCenter: SystemStateCenter;
  
  constructor() {
    this.stateCenter = SystemStateCenter.getInstance({
      debug: true,
      enableMetrics: true,
      enableHealthMonitoring: true
    });
  }
  
  async bootstrap(): Promise<void> {
    try {
      this.logInfo('Starting Weibo Container System...');
      
      // 1. 启动状态中心
      await this.stateCenter.initialize();
      
      // 2. 注册核心组件
      await this.registerCoreComponents();
      
      // 3. 初始化容器系统
      await this.initializeContainerSystem();
      
      // 4. 启动监控服务
      await this.startMonitoringServices();
      
      this.logInfo('Weibo Container System started successfully');
      
    } catch (error) {
      this.logError('System bootstrap failed', { error });
      throw error;
    }
  }
  
  private async registerCoreComponents(): Promise<void> {
    // 注册页面管理器
    const pageManager = new PageManager();
    await pageManager.registerToStateCenter();
    
    // 注册错误处理器
    const errorHandler = new ErrorHandler();
    await errorHandler.registerToStateCenter();
    
    // 注册性能监控器
    const performanceMonitor = new PerformanceMonitor();
    await performanceMonitor.registerToStateCenter();
  }
  
  private async initializeContainerSystem(): Promise<void> {
    // 创建主容器系统
    const containerSystem = new WeiboContainerSystem();
    await containerSystem.initialize();
  }
  
  private async startMonitoringServices(): Promise<void> {
    await this.stateCenter.monitorEntity('SystemStateCenter');
  }
}
```

## 7. 使用示例

```typescript
// 系统启动
const bootstrapper = new WeiboSystemBootstrapper();
await bootstrapper.bootstrap();

// 获取容器系统
const containerSystem = new WeiboContainerSystem();
await containerSystem.initialize();

// 点号访问容器
const userProfile = containerSystem.userProfileContainer;

// 执行操作
const userInfo = await userProfile.extractUserInfo({});

// 执行流程
const flowExecutor = new FlowExecutor();
const flowResult = await flowExecutor.executeFlow({
  id: 'userProfileFlow',
  name: '用户主页信息提取流程',
  steps: [
    {
      type: 'operation',
      container: 'userProfileContainer',
      operation: 'extractUserInfo',
      params: {}
    }
  ]
});
```

这个完整的设计整合了状态中心、容器系统、操作子、执行流等所有核心组件，形成了一个完整的微博容器操作系统。