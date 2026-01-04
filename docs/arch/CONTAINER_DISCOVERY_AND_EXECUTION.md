# 容器发现与操作执行机制设计

## 核心问题

1. **多容器发现**：页面发现多个符合要求的子容器，如何被发现和管理？
2. **多容器操作**：多个子容器如何执行 operation？
3. **完成状态**：当前页面所有子容器的 operation 执行完毕，如何表示状态？

## 整体架构

```
页面加载
  ↓
根容器初始化（注册变量、订阅消息）
  ↓
MSG_CONTAINER_ROOT_DISCOVER_START
  ↓
[发现引擎] 扫描 DOM，匹配选择器
  ↓
批量发现：[container_0, container_1, container_2, ...]
  ↓
MSG_CONTAINER_CHILD_DISCOVERED (for each)
  ↓
容器实例化 + 操作注册
  ↓
MSG_CONTAINER_ROOT_DISCOVER_COMPLETE
  ↓
根容器状态：WAITING_FOR_OPERATIONS
  ↓
触发器检查：每个子容器的 triggers
  ↓
操作执行（根据策略：serial/parallel）
  ↓
状态跟踪：记录每个操作完成状态
  ↓
所有操作完成？
  ↓ YES
MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE
  ↓
触发下一轮：滚动 + 发现 + 执行
  ↓ NO
继续等待...
```

## 1. 多容器发现机制

### 1.1 容器唯一标识

发现多个同类容器时，每个容器需要有唯一标识：

```typescript
// 容器 ID 格式
<containerDefinitionId>_<index>_<hash>

// 示例
taobao_product_0_a1b2c3d4
taobao_product_1_e5f6g7h8
taobao_product_2_i9j0k1l2
```

### 1.2 发现引擎实现

```typescript
interface DiscoveredContainer {
  containerId: string;           // 唯一标识
  definitionId: string;         // 容器定义 ID
  index: number;                // 索引（从 0 开始）
  domPath: string;              // DOM 路径
  selector: string;              // 匹配的选择器
  variables: Record<string, any>;  // 初始变量
  appearedAt: number;           // 出现时间戳
  state: 'discovered' | 'initializing' | 'ready' | 'processing' | 'completed' | 'error';
  operationResults: Map<string, OperationResult>;  // 操作执行结果
}

class ContainerDiscoveryEngine {
  private discoveredContainers: Map<string, DiscoveredContainer> = new Map();
  private containerRegistry: ContainerDefinitionRegistry;
  private messageBus: MessageBusService;
  
  /**
   * 批量发现容器
   */
  async discoverContainers(
    rootContainerId: string,
    containerDefinitionId: string,
    selector: string
  ): Promise<DiscoveredContainer[]> {
    const elements = document.querySelectorAll(selector);
    const containers: DiscoveredContainer[] = [];
    
    // 遍历所有匹配的元素
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const domPath = this.getDomPath(element);
      const uniqueHash = this.generateHash(domPath);
      const containerId = `${containerDefinitionId}_${i}_${uniqueHash}`;
      
      // 创建容器实例
      const container: DiscoveredContainer = {
        containerId,
        definitionId: containerDefinitionId,
        index: i,
        domPath,
        selector,
        variables: {},  // 初始为空，后续初始化
        appearedAt: Date.now(),
        state: 'discovered',
        operationResults: new Map()
      };
      
      // 注册到全局容器表
      this.discoveredContainers.set(containerId, container);
      containers.push(container);
      
      // 发布发现消息
      await this.messageBus.publish(MSG_CONTAINER_CHILD_DISCOVERED, {
        rootContainerId,
        containerId,
        definitionId: containerDefinitionId,
        index: i,
        domPath,
        selector,
        totalCount: elements.length
      }, {
        component: 'ContainerDiscoveryEngine',
        containerId: rootContainerId
      });
    }
    
    return containers;
  }
  
  /**
   * 获取 DOM 路径
   */
  private getDomPath(element: Element): string {
    const path: string[] = [];
    let current = element;
    
    while (current && current !== document.body) {
      let index = 0;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      
      const tagName = current.tagName.toLowerCase();
      path.unshift(`${tagName}:nth-child(${index + 1})`);
      current = current.parentElement!;
    }
    
    return '/' + path.join('/');
  }
  
  /**
   * 生成唯一哈希
   */
  private generateHash(domPath: string): string {
    // 简单的哈希函数，用于生成短标识
    let hash = 0;
    for (let i = 0; i < domPath.length; i++) {
      const char = domPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
  
  /**
   * 获取所有发现的容器
   */
  getDiscoveredContainers(definitionId?: string): DiscoveredContainer[] {
    const allContainers = Array.from(this.discoveredContainers.values());
    
    if (definitionId) {
      return allContainers.filter(c => c.definitionId === definitionId);
    }
    
    return allContainers;
  }
  
  /**
   * 更新容器状态
   */
  updateContainerState(containerId: string, state: DiscoveredContainer['state']): void {
    const container = this.discoveredContainers.get(containerId);
    if (container) {
      container.state = state;
      
      this.messageBus.publish(MSG_CONTAINER_STATE_CHANGED, {
        containerId,
        fromState: 'unknown',
        toState: state,
        timestamp: Date.now()
      }, {
        component: 'ContainerDiscoveryEngine',
        containerId
      });
    }
  }
}
```

### 1.3 容器初始化

发现后需要初始化容器变量：

```typescript
class ContainerInitializer {
  /**
   * 初始化容器变量
   */
  async initializeContainerVariables(
    container: DiscoveredContainer,
    definition: ContainerDefinition
  ): Promise<void> {
    const { domPath } = container;
    const element = this.findByDomPath(domPath);
    
    if (!element) {
      throw new Error(`容器元素未找到: ${domPath}`);
    }
    
    // 执行初始化脚本
    const initScript = definition.initScript || '';
    if (initScript) {
      const context = {
        element,
        variables: {},
        domPath,
        containerId: container.containerId
      };
      
      // 使用 Function 创建安全的执行环境
      const fn = new Function('context', `
        const { element, variables, domPath, containerId } = context;
        ${initScript}
        return variables;
      `);
      
      container.variables = await fn(context);
    }
    
    // 标记为已初始化
    container.state = 'initializing';
    
    // 发布初始化完成消息
    await this.messageBus.publish(MSG_CONTAINER_INITIALIZED, {
      containerId: container.containerId,
      variables: container.variables
    }, {
      component: 'ContainerInitializer',
      containerId: container.containerId
    });
  }
}
```

## 2. 多容器操作执行机制

### 2.1 操作执行策略

支持三种执行策略：

```typescript
type ExecutionStrategy = 'serial' | 'parallel' | 'batch';

interface ExecutionConfig {
  strategy: ExecutionStrategy;     // 执行策略
  batchSize?: number;              // 批量大小（仅 batch 模式）
  maxConcurrency?: number;         // 最大并发数（仅 parallel 模式）
  continueOnError?: boolean;        // 出错是否继续
  timeout?: number;                // 超时时间（毫秒）
}
```

### 2.2 执行引擎实现

```typescript
class ContainerOperationExecutor {
  private discoveryEngine: ContainerDiscoveryEngine;
  private messageBus: MessageBusService;
  
  /**
   * 批量执行操作
   */
  async executeOperations(
    rootContainerId: string,
    containerDefinitionId: string,
    operationId: string,
    config: ExecutionConfig = { strategy: 'parallel' }
  ): Promise<BatchExecutionResult> {
    const containers = this.discoveryEngine.getDiscoveredContainers(containerDefinitionId);
    
    if (containers.length === 0) {
      return {
        success: true,
        totalCount: 0,
        completedCount: 0,
        failedCount: 0,
        results: []
      };
    }
    
    const startTime = Date.now();
    const results: OperationResult[] = [];
    
    switch (config.strategy) {
      case 'serial':
        await this.executeSerial(containers, operationId, config, results);
        break;
      
      case 'parallel':
        await this.executeParallel(containers, operationId, config, results);
        break;
      
      case 'batch':
        await this.executeBatch(containers, operationId, config, results);
        break;
    }
    
    const completedCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const duration = Date.now() - startTime;
    
    // 发布批量执行完成消息
    await this.messageBus.publish(MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE, {
      rootContainerId,
      containerDefinitionId,
      operationId,
      totalCount: containers.length,
      completedCount,
      failedCount,
      duration,
      strategy: config.strategy
    }, {
      component: 'ContainerOperationExecutor',
      containerId: rootContainerId
    });
    
    return {
      success: failedCount === 0 || config.continueOnError,
      totalCount: containers.length,
      completedCount,
      failedCount,
      duration,
      results
    };
  }
  
  /**
   * 串行执行
   */
  private async executeSerial(
    containers: DiscoveredContainer[],
    operationId: string,
    config: ExecutionConfig,
    results: OperationResult[]
  ): Promise<void> {
    for (const container of containers) {
      const result = await this.executeOperation(container, operationId, config);
      results.push(result);
      
      // 出错且不继续
      if (!result.success && !config.continueOnError) {
        break;
      }
    }
  }
  
  /**
   * 并行执行
   */
  private async executeParallel(
    containers: DiscoveredContainer[],
    operationId: string,
    config: ExecutionConfig,
    results: OperationResult[]
  ): Promise<void> {
    const maxConcurrency = config.maxConcurrency || containers.length;
    const batches = this.createBatches(containers, maxConcurrency);
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(container => this.executeOperation(container, operationId, config))
      );
      results.push(...batchResults);
    }
  }
  
  /**
   * 批量执行
   */
  private async executeBatch(
    containers: DiscoveredContainer[],
    operationId: string,
    config: ExecutionConfig,
    results: OperationResult[]
  ): Promise<void> {
    const batchSize = config.batchSize || 10;
    const batches = this.createBatches(containers, batchSize);
    
    for (const batch of batches) {
      // 批量串行执行
      for (const container of batch) {
        const result = await this.executeOperation(container, operationId, config);
        results.push(result);
      }
    }
  }
  
  /**
   * 执行单个操作
   */
  private async executeOperation(
    container: DiscoveredContainer,
    operationId: string,
    config: ExecutionConfig
  ): Promise<OperationResult> {
    const startTime = Date.now();
    
    try {
      // 更新容器状态
      this.discoveryEngine.updateContainerState(container.containerId, 'processing');
      
      // 执行操作
      const result = await this.runOperation(container, operationId, config);
      const duration = Date.now() - startTime;
      
      // 更新容器状态
      this.discoveryEngine.updateContainerState(container.containerId, 'completed');
      
      // 记录操作结果
      container.operationResults.set(operationId, {
        ...result,
        duration
      });
      
      // 发布操作完成消息
      await this.messageBus.publish(MSG_CONTAINER_OPERATION_COMPLETE, {
        containerId: container.containerId,
        operationId,
        success: result.success,
        duration,
        result: result.data
      }, {
        component: 'ContainerOperationExecutor',
        containerId: container.containerId
      });
      
      return {
        success: true,
        containerId: container.containerId,
        operationId,
        duration,
        result: result.data
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 更新容器状态
      this.discoveryEngine.updateContainerState(container.containerId, 'error');
      
      // 记录失败结果
      container.operationResults.set(operationId, {
        success: false,
        error: errorMessage,
        duration
      });
      
      // 发布操作失败消息
      await this.messageBus.publish(MSG_CONTAINER_OPERATION_FAILED, {
        containerId: container.containerId,
        operationId,
        error: errorMessage,
        duration
      }, {
        component: 'ContainerOperationExecutor',
        containerId: container.containerId
      });
      
      if (!config.continueOnError) {
        throw error;
      }
      
      return {
        success: false,
        containerId: container.containerId,
        operationId,
        error: errorMessage,
        duration
      };
    }
  }
  
  /**
   * 运行实际操作
   */
  private async runOperation(
    container: DiscoveredContainer,
    operationId: string,
    config: ExecutionConfig
  ): Promise<any> {
    // 根据 operationId 执行对应操作
    // 这里是简化实现，实际需要根据操作类型分发
    const operation = this.getOperation(container.definitionId, operationId);
    
    switch (operation.type) {
      case 'extract':
        return this.executeExtract(container, operation);
      case 'click':
        return this.executeClick(container, operation);
      case 'highlight':
        return this.executeHighlight(container, operation);
      default:
        throw new Error(`未知操作类型: ${operation.type}`);
    }
  }
  
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}
```

## 3. 完成状态跟踪机制

### 3.1 状态跟踪器

```typescript
interface ContainerOperationStatus {
  containerId: string;
  operationId: string;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  result?: any;
  error?: string;
}

class ContainerStatusTracker {
  private rootContainerId: string;
  private operationId: string;
  private statuses: Map<string, ContainerOperationStatus> = new Map();
  private totalContainers: number = 0;
  private completedCount: number = 0;
  private failedCount: number = 0;
  private messageBus: MessageBusService;
  
  constructor(rootContainerId: string, operationId: string, messageBus: MessageBusService) {
    this.rootContainerId = rootContainerId;
    this.operationId = operationId;
    this.messageBus = messageBus;
  }
  
  /**
   * 初始化跟踪（已知所有容器）
   */
  initialize(containerIds: string[]): void {
    this.totalContainers = containerIds.length;
    this.completedCount = 0;
    this.failedCount = 0;
    
    for (const containerId of containerIds) {
      this.statuses.set(containerId, {
        containerId,
        operationId: this.operationId,
        state: 'pending'
      });
    }
  }
  
  /**
   * 更新状态为运行中
   */
  setRunning(containerId: string): void {
    const status = this.statuses.get(containerId);
    if (status && status.state === 'pending') {
      status.state = 'running';
      status.startedAt = Date.now();
      
      this.messageBus.publish(MSG_CONTAINER_OPERATION_START, {
        containerId,
        operationId: this.operationId,
        timestamp: status.startedAt
      }, {
        component: 'ContainerStatusTracker',
        containerId: this.rootContainerId
      });
    }
  }
  
  /**
   * 更新状态为完成
   */
  setCompleted(containerId: string, result?: any): void {
    const status = this.statuses.get(containerId);
    if (status && status.state !== 'completed' && status.state !== 'failed') {
      status.state = 'completed';
      status.completedAt = Date.now();
      status.duration = status.completedAt - (status.startedAt || status.completedAt);
      status.result = result;
      this.completedCount++;
      
      this.checkAllComplete();
    }
  }
  
  /**
   * 更新状态为失败
   */
  setFailed(containerId: string, error: string): void {
    const status = this.statuses.get(containerId);
    if (status && status.state !== 'completed' && status.state !== 'failed') {
      status.state = 'failed';
      status.completedAt = Date.now();
      status.duration = status.completedAt - (status.startedAt || status.completedAt);
      status.error = error;
      this.failedCount++;
      
      this.checkAllComplete();
    }
  }
  
  /**
   * 检查是否全部完成
   */
  private async checkAllComplete(): Promise<void> {
    const totalProcessed = this.completedCount + this.failedCount;
    
    if (totalProcessed === this.totalContainers) {
      // 全部完成，发布完成消息
      await this.messageBus.publish(MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE, {
        rootContainerId: this.rootContainerId,
        operationId: this.operationId,
        totalCount: this.totalContainers,
        completedCount: this.completedCount,
        failedCount: this.failedCount,
        successRate: this.completedCount / this.totalContainers,
        timestamp: Date.now()
      }, {
        component: 'ContainerStatusTracker',
        containerId: this.rootContainerId
      });
    }
  }
  
  /**
   * 获取状态统计
   */
  getStats() {
    return {
      totalContainers: this.totalContainers,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      pendingCount: this.totalContainers - this.completedCount - this.failedCount,
      progress: this.totalContainers > 0 
        ? (this.completedCount + this.failedCount) / this.totalContainers 
        : 0
    };
  }
}
```

### 3.2 根容器驱动滚动逻辑

```typescript
class RootContainerDriver {
  private rootContainerId: string;
  private messageBus: MessageBusService;
  private discoveryEngine: ContainerDiscoveryEngine;
  private operationExecutor: ContainerOperationExecutor;
  
  // 根容器变量
  private variables: {
    scrollCount: number;
    totalDiscovered: number;
    totalCompleted: number;
    lastScrollTime: number;
    scrollDirection: 'down' | 'up';
    isScrolling: boolean;
    stopScroll: boolean;
  };
  
  constructor(rootContainerId: string, messageBus: MessageBusService) {
    this.rootContainerId = rootContainerId;
    this.messageBus = messageBus;
    this.variables = {
      scrollCount: 0,
      totalDiscovered: 0,
      totalCompleted: 0,
      lastScrollTime: 0,
      scrollDirection: 'down',
      isScrolling: false,
      stopScroll: false
    };
  }
  
  /**
   * 启动滚动驱动
   */
  async startScrollDriver(config: {
    containerDefinitionId: string;
    operationId: string;
    maxScrolls: number;
    scrollDistance: number;
    scrollInterval: number;
  }): Promise<void> {
    console.log('[RootContainerDriver] 启动滚动驱动');
    
    // 订阅操作完成消息
    this.messageBus.subscribe(MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE, async (message) => {
      if (message.payload.rootContainerId === this.rootContainerId) {
        await this.onAllOperationsComplete(message.payload);
      }
    });
    
    // 订阅页面滚动事件
    this.messageBus.subscribe(MSG_CONTAINER_ROOT_PAGE_SCROLL, async (message) => {
      await this.onPageScroll(message.payload);
    });
    
    // 开始第一轮滚动
    await this.discoverAndExecute(config);
  }
  
  /**
   * 发现并执行操作
   */
  private async discoverAndExecute(config: {
    containerDefinitionId: string;
    operationId: string;
    maxScrolls: number;
    scrollDistance: number;
    scrollInterval: number;
  }): Promise<void> {
    // 检查是否停止
    if (this.variables.stopScroll) {
      console.log('[RootContainerDriver] 滚动已停止');
      await this.publishScrollComplete();
      return;
    }
    
    // 检查最大滚动次数
    if (this.variables.scrollCount >= config.maxScrolls) {
      console.log('[RootContainerDriver] 达到最大滚动次数');
      await this.publishScrollComplete();
      return;
    }
    
    console.log(`[RootContainerDriver] 第 ${this.variables.scrollCount + 1} 轮滚动`);
    
    // 1. 发现容器
    const containers = await this.discoveryEngine.discoverContainers(
      this.rootContainerId,
      config.containerDefinitionId,
      '.product-card'  // 这里应该是从容器定义中读取
    );
    
    this.variables.totalDiscovered += containers.length;
    console.log(`[RootContainerDriver] 发现 ${containers.length} 个容器`);
    
    // 2. 发布发现完成消息
    await this.messageBus.publish(MSG_CONTAINER_ROOT_DISCOVER_COMPLETE, {
      rootContainerId: this.rootContainerId,
      containerDefinitionId: config.containerDefinitionId,
      discoveredCount: containers.length,
      totalDiscovered: this.variables.totalDiscovered
    }, {
      component: 'RootContainerDriver',
      containerId: this.rootContainerId
    });
    
    // 3. 执行操作
    const executionConfig: ExecutionConfig = {
      strategy: 'parallel',
      maxConcurrency: 5,
      continueOnError: true
    };
    
    const result = await this.operationExecutor.executeOperations(
      this.rootContainerId,
      config.containerDefinitionId,
      config.operationId,
      executionConfig
    );
    
    this.variables.totalCompleted += result.completedCount;
    console.log(`[RootContainerDriver] 操作完成: ${result.completedCount}/${result.totalCount}`);
  }
  
  /**
   * 所有操作完成后的处理
   */
  private async onAllOperationsComplete(payload: any): Promise<void> {
    console.log('[RootContainerDriver] 所有操作完成');
    
    // 检查是否需要继续滚动
    const shouldContinue = await this.shouldContinueScroll();
    
    if (shouldContinue) {
      // 等待滚动间隔
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 执行滚动
      await this.scrollToNext();
    } else {
      // 滚动完成
      await this.publishScrollComplete();
    }
  }
  
  /**
   * 判断是否继续滚动
   */
  private async shouldContinueScroll(): Promise<boolean> {
    // 检查是否到达页面底部
    const isAtBottom = await this.isAtPageBottom();
    
    if (isAtBottom) {
      console.log('[RootContainerDriver] 已到达页面底部');
      return false;
    }
    
    // 检查是否有新内容
    const hasNewContent = await this.hasNewContent();
    
    if (!hasNewContent) {
      console.log('[RootContainerDriver] 未发现新内容');
      return false;
    }
    
    return true;
  }
  
  /**
   * 滚动到下一位置
   */
  private async scrollToNext(): Promise<void> {
    this.variables.isScrolling = true;
    this.variables.scrollCount++;
    this.variables.lastScrollTime = Date.now();
    
    await this.messageBus.publish(MSG_CONTAINER_ROOT_SCROLL_START, {
      rootContainerId: this.rootContainerId,
      scrollCount: this.variables.scrollCount,
      direction: this.variables.scrollDirection,
      distance: 500
    }, {
      component: 'RootContainerDriver',
      containerId: this.rootContainerId
    });
    
    // 执行滚动
    window.scrollBy({ top: 500, behavior: 'smooth' });
    
    // 等待滚动完成
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 发布滚动完成消息
    await this.messageBus.publish(MSG_CONTAINER_ROOT_SCROLL_PROGRESS, {
      rootContainerId: this.rootContainerId,
      scrollCount: this.variables.scrollCount,
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight
    }, {
      component: 'RootContainerDriver',
      containerId: this.rootContainerId
    });
    
    this.variables.isScrolling = false;
    
    // 继续下一轮
    // 注意：这里应该通过消息触发下一轮，而不是直接调用
    // 实际实现中，应该在滚动完成后发布一个消息，由消息触发下一轮
  }
  
  /**
   * 发布滚动完成消息
   */
  private async publishScrollComplete(): Promise<void> {
    await this.messageBus.publish(MSG_CONTAINER_ROOT_SCROLL_COMPLETE, {
      rootContainerId: this.rootContainerId,
      totalScrolls: this.variables.scrollCount,
      totalDiscovered: this.variables.totalDiscovered,
      totalCompleted: this.variables.totalCompleted,
      duration: Date.now() - (this.variables.lastScrollTime || Date.now())
    }, {
      component: 'RootContainerDriver',
      containerId: this.rootContainerId
    });
  }
  
  /**
   * 检查是否到达页面底部
   */
  private async isAtPageBottom(): Promise<boolean> {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    
    // 距离底部小于 100px 视为到达底部
    return scrollHeight - scrollTop - clientHeight < 100;
  }
  
  /**
   * 检查是否有新内容
   */
  private async hasNewContent(): Promise<boolean> {
    // 比较当前 DOM 树和之前的状态
    // 这里简化实现，实际需要更复杂的比较
    const currentHeight = document.documentElement.scrollHeight;
    // 简单判断：如果页面高度变化，可能有新内容
    return currentHeight > (this.lastPageHeight || 0);
  }
  
  private lastPageHeight: number = 0;
}
```

## 完整消息流程示例

### 场景：淘宝主页滚动加载商品

```
1. 页面加载完成
   MSG_CONTAINER_ROOT_PAGE_LOAD
   
2. 根容器初始化
   → variables: { productList: [], scrollCount: 0, ... }
   → 订阅: MSG_CONTAINER_ROOT_DISCOVER_START
           MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE
   
3. 开始滚动驱动
   MSG_CONTAINER_ROOT_DISCOVER_START
   ↓
   [DiscoveryEngine.discoverContainers]
   ↓
   发现: product_0, product_1, product_2, ..., product_9 (10个)
   ↓
   对每个 product_i 发布 MSG_CONTAINER_CHILD_DISCOVERED
   ↓
   MSG_CONTAINER_ROOT_DISCOVER_COMPLETE (discoveredCount: 10)
   
4. 执行操作（并行）
   [OperationExecutor.executeOperations]
   ↓
   对每个 product_i:
     → MSG_CONTAINER_OPERATION_START (product_i)
     → 执行 extract 操作
     → MSG_CONTAINER_OPERATION_COMPLETE (product_i)
   ↓
   MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE
      (completedCount: 10, failedCount: 0)
   ↓
   MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE
      (completedCount: 10, failedCount: 0, successRate: 1.0)
   
5. 判断是否继续滚动
   [RootContainerDriver.shouldContinueScroll]
   ↓
   未到底部，有新内容 → 继续滚动
   
6. 执行滚动
   MSG_CONTAINER_ROOT_SCROLL_START
   ↓
   window.scrollBy({ top: 500 })
   ↓
   MSG_CONTAINER_ROOT_SCROLL_PROGRESS
   
7. 回到步骤 3，开始新一轮发现
   ...
   
8. 到达底部
   MSG_CONTAINER_ROOT_SCROLL_BOTTOM
   ↓
   MSG_CONTAINER_ROOT_SCROLL_COMPLETE
```

## 总结

### 关键设计点

1. **多容器发现**：
   - 批量发现所有匹配的 DOM 元素
   - 为每个容器生成唯一 ID（`definitionId_index_hash`）
   - 维护全局容器注册表

2. **多容器操作执行**：
   - 支持串行、并行、批量三种策略
   - 每个容器独立执行，记录操作结果
   - 支持错误处理（继续/停止）

3. **完成状态跟踪**：
   - 实时跟踪每个容器的操作状态
   - 发布批量完成消息
   - 发布全部完成消息（触发下一轮）

4. **滚动驱动逻辑**：
   - 发现 → 执行 → 判断 → 滚动 → 下一轮
   - 通过消息驱动整个流程
   - 支持停止条件（到达底部、最大次数）

### 核心消息

- `MSG_CONTAINER_ROOT_DISCOVER_START` - 开始发现
- `MSG_CONTAINER_CHILD_DISCOVERED` - 子容器被发现
- `MSG_CONTAINER_ROOT_DISCOVER_COMPLETE` - 发现完成
- `MSG_CONTAINER_OPERATION_START` - 操作开始
- `MSG_CONTAINER_OPERATION_COMPLETE` - 操作完成
- `MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE` - 批量完成
- `MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE` - 全部完成
- `MSG_CONTAINER_ROOT_SCROLL_START` - 滚动开始
- `MSG_CONTAINER_ROOT_SCROLL_PROGRESS` - 滚动进度
- `MSG_CONTAINER_ROOT_SCROLL_COMPLETE` - 滚动完成

这个设计提供了一个完整的容器发现、操作执行、状态跟踪机制，能够驱动复杂的滚动加载逻辑。
