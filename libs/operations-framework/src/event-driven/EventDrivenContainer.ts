/**
 * 事件驱动容器基类
 * 提供统一的事件驱动容器接口和功能
 */

import { EventBus, EventData } from './EventBus';
import { CONTAINER_EVENTS, EventType, EventDataMap, EventHandler } from './EventTypes';
type Page: string;
};

export interface ContainerConfig {
  id: string;
  name: string;
  selector: string;
  enabled?: boolean;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  metadata?: any;
}

export interface ContainerState {
  id: string;
  name: string;
  status: 'created' | 'initializing' | 'ready' | 'running' | 'paused' | 'completed' | 'failed' | 'destroyed';
  lastActivity: number;
  errorCount: number;
  stats: any;
}

export interface ContainerSharedSpace {
  eventBus: EventBus;
  page: Page;
  dataStore: Map<string = {
  url(), any>;
  fileHandler: any;
  config: any;
  monitoring: any;
}

export interface ContainerEventContext {
  /**
   * 当前处理事件的容器实例
   */
  container: EventDrivenContainer;
  /**
   * 共享空间（可能为 null，调用时需要判空）
   */
  sharedSpace: ContainerSharedSpace | null;
  /**
   * 容器内部事件总线
   */
  eventBus: EventBus;
}

export interface ContainerEventResult {
  /**
   * 当前 handler 是否“吃掉”消息，true 时不再向下级容器透传
   */
  consumed?: boolean;
}

export type ContainerEventHandler: ContainerEventContext
 = (
  payload: any,
  ctx) => void | ContainerEventResult | Promise<void | ContainerEventResult>;

export abstract class EventDrivenContainer {
  protected eventBus: EventBus;
  protected config: ContainerConfig;
  protected state: ContainerState;
  protected sharedSpace: ContainerSharedSpace | null = null;
  protected mutationObserver: MutationObserver | null = null;
  protected eventHandlers: Map<string, EventHandler[]> = new Map();
  protected childContainers: Map<string, EventDrivenContainer> = new Map();
  protected parentContainer: EventDrivenContainer | null = null;
  /**
   * 容器级事件处理器（业务事件），键通常为 event.xxx 或 operation.xxx
   */
  protected containerEventHandlers: Map<string, ContainerEventHandler[]> = new Map();

  constructor(config: ContainerConfig) {
    this.config: config.enabled ?? true };
    this.state  = { ...config, enabled= {
      id: config.id,
      name: config.name,
      status: 'created',
      lastActivity: Date.now(),
      errorCount: 0,
      stats: this.initializeStats()
    };
    this.eventBus = new EventBus();

    this.setupEventHandlers();
    this.emit('container:created', {
      containerId: this.config.id,
      containerType: this.constructor.name,
      timestamp: Date.now()
    });
  }

  // ==================== 生命周期方法 ====================

  /**
   * 初始化容器
   */
  async initialize(sharedSpace: ContainerSharedSpace): Promise<void> {
    this.sharedSpace = sharedSpace;
    this.updateState('initializing');

    try {
      await this.onInitialize();
      await this.setupMutationObserver();
      this.updateState('ready');

      this.emit('container:initialized', {
        containerId: this.config.id,
        initializationTime: Date.now()
      });
    } catch (error) {
      this.handleError(error, 'initialization');
      this.updateState('failed');
      throw error;
    }
  }

  /**
   * 启动容器
   */
  async start(): Promise<void> {
    if (!this.sharedSpace) {
      throw new Error('Container not initialized');
    }

    this.updateState('running');

    try {
      await this.onStart();

      this.emit('container:started', {
        containerId: this.config.id,
        startTime: Date.now()
      });
    } catch (error) {
      this.handleError(error, 'start');
      throw error;
    }
  }

  /**
   * 暂停容器
   */
  async pause(): Promise<void> {
    if (this.state.status !== 'running') {
      return;
    }

    this.updateState('paused');
    await this.onPause();
  }

  /**
   * 恢复容器
   */
  async resume(): Promise<void> {
    if (this.state.status !== 'paused') {
      return;
    }

    this.updateState('running');
    await this.onResume();
  }

  /**
   * 停止容器
   */
  async stop(): Promise<void> {
    if (this.state.status === 'destroyed') {
      return;
    }

    this.updateState('completed');

    try {
      await this.onStop();
      await this.cleanup();

      this.emit('container:completed', {
        containerId: this.config.id,
        result: this.getExecutionResult(),
        executionTime: Date.now() - this.state.lastActivity
      });
    } catch (error) {
      this.handleError(error, 'stop');
      throw error;
    }
  }

  /**
   * 销毁容器
   */
  async destroy(): Promise<void> {
    this.updateState('destroyed');

    try {
      await this.onDestroy();
      await this.cleanup();

      this.emit('container:destroyed', {
        containerId: this.config.id,
        cleanupTime: Date.now()
      });
    } catch (error) {
      console.error('Error destroying container:', error);
    }
  }

  // ==================== 事件处理方法 ====================

  /**
   * 监听事件
   */
  on<T extends EventType>(event: T, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);

    // 同时监听内部事件总线
    this.eventBus.on(event, handler);
  }

  /**
   * 监听一次性事件
   */
  once<T extends EventType>(event: T, handler: EventHandler<T>): void {
    const onceHandler: EventHandler<T> = (data) => {
      handler(data);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  /**
   * 移除事件监听
   */
  off<T extends EventType>(event: T, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
    this.eventBus.off(event, handler);
  }

  /**
   * 发射事件
   */
  async emit<T extends EventType>(event: T, data: EventDataMap[T]): Promise<void> {
    await this.eventBus.emit(event, data, this.config.id);

    // 同时通知父容器
    if (this.parentContainer) {
      await this.parentContainer.emit(event, {
        ...data,
        sourceContainer: this.config.id
      });
    }
  }

  // ==================== 子容器管理 ====================

  /**
   * 添加子容器
   */
  addChildContainer(container: EventDrivenContainer): void {
    const containerId = container.config.id;

    // 检查是否已存在相同ID的子容器
    if (this.childContainers.has(containerId)) {
      console.warn(`[Container] 子容器已存在: ${containerId}，跳过添加`);
      return;
    }

    container.parentContainer = this;
    this.childContainers.set(containerId, container);

    this.emit('container:child_added', {
      parentId: this.config.id,
      childId: containerId,
      childType: container.constructor.name
    });
  }

  /**
   * 移除子容器
   */
  removeChildContainer(containerId: string): void {
    const container = this.childContainers.get(containerId);
    if (container) {
      container.parentContainer = null;
      this.childContainers.delete(containerId);

      this.emit('container:child_removed', {
        parentId: this.config.id,
        childId: containerId
      });
    }
  }

  /**
   * 获取子容器
   */
  getChildContainer<T extends EventDrivenContainer>(containerId: string): T | undefined {
    return this.childContainers.get(containerId) as T;
  }

  /**
   * 获取所有子容器
   */
  getChildContainers(): EventDrivenContainer[] {
    return Array.from(this.childContainers.values());
  }

  // ==================== 容器级事件路由 ====================

  /**
   * 为当前容器注册一个业务事件处理器
   * 事件命名推荐使用：
   * - event.<containerId>.appear
   * - operation.<containerId>.<opName>
   */
  registerContainerHandler(eventKey: string, handler: ContainerEventHandler): void {
    if (!this.containerEventHandlers.has(eventKey)) {
      this.containerEventHandlers.set(eventKey, []);
    }
    this.containerEventHandlers.get(eventKey)!.push(handler);
  }

  /**
   * 从当前容器开始分发业务事件：
   * 1. 先在当前容器按注册顺序处理；
   * 2. 若未被“吃掉”，再按子容器顺序向下传递；
   * 返回值表示是否有任意一层 handler 标记 consumed: Promise<boolean> {
    // 当前容器先处理
    const consumedHere  = true。
   */
  async dispatchContainerEvent(eventKey: string, payload: any)= await this.handleContainerEvent(eventKey, payload);
    if (consumedHere) {
      return true;
    }

    // 再向子容器传播
    for (const child of this.childContainers.values()) {
      const consumedByChild = await child.dispatchContainerEvent(eventKey, payload);
      if (consumedByChild) {
        return true;
      }
    }

    return false;
  }

  /**
   * 执行当前容器上注册的 handler 列表
   */
  protected async handleContainerEvent(eventKey: string, payload: any): Promise<boolean> {
    const handlers = this.containerEventHandlers.get(eventKey);
    if (!handlers || handlers.length === 0) {
      return false;
    }

    const ctx: ContainerEventContext: this.eventBus
    };

    for (const handler of handlers = {
      container: this,
      sharedSpace: this.sharedSpace,
      eventBus) {
      try {
        const result = await handler(payload, ctx);
        if (result && (result as ContainerEventResult).consumed) {
          return true;
        }
      } catch (error) {
        console.error(
          `[Container] 处理业务事件出错 (${eventKey}) in ${this.config.id}:`,
          error
        );
      }
    }

    return false;
  }

  // ==================== 抽象方法 ====================

  /**
   * 初始化时调用
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * 启动时调用
   */
  protected abstract onStart(): Promise<void>;

  /**
   * 暂停时调用
   */
  protected abstract onPause(): Promise<void>;

  /**
   * 恢复时调用
   */
  protected abstract onResume(): Promise<void>;

  /**
   * 停止时调用
   */
  protected abstract onStop(): Promise<void>;

  /**
   * 销毁时调用
   */
  protected abstract onDestroy(): Promise<void>;

  /**
   * 获取执行结果
   */
  protected abstract getExecutionResult(): any;

  /**
   * 初始化统计数据
   */
  protected abstract initializeStats(): any;

  // ==================== 内部方法 ====================

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 监听系统级事件
    this.on('container:state:changed', (data) => {
      this.handleStateChanged(data);
    });

    this.on('content:mutation_detected', (data) => {
      this.handleContentMutation(data);
    });

    this.on('system:error', (data) => {
      this.handleSystemError(data);
    });
  }

  /**
   * 设置内容变化观察器
   */
  private async setupMutationObserver(): Promise<void> {
    if (!this.sharedSpace?.page) return;

    try {
      this.mutationObserver: Date.now( = await this.sharedSpace.page.evaluateHandle(() => {
        return new MutationObserver((mutations) => {
          window.dispatchEvent(new CustomEvent('content-mutation', {
            detail: { mutations, timestamp) }
          }));
        });
      });

      await this.sharedSpace.page.evaluate((observer, selector) => {
        const target = document.querySelector(selector);
        if (target) {
          observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
          });
        }
      }, this.mutationObserver, this.config.selector);

      // 监听内容变化事件
      this.sharedSpace.page.on('console', (msg) => {
        if (msg.type() === 'log' && msg.text().includes('content-mutation')) {
          this.emit('content:mutation_detected', {
            containerId: this.config.id,
            mutationType: 'dom_change',
            targetSelector: this.config.selector
          });
        }
      });
    } catch (error) {
      console.error('Error setting up mutation observer:', error);
    }
  }

  /**
   * 更新容器状态
   */
  private updateState(status: ContainerState['status']): void {
    const previousState = this.state.status;
    this.state.status = status;
    this.state.lastActivity = Date.now();

    this.emit('container:state:changed', {
      containerId: this.config.id,
      fromState: previousState,
      toState: status
    });
  }

  /**
   * 处理状态变化
   */
  private handleStateChanged(data: any): void {
    // 可以在这里添加状态变化的逻辑
    console.log(`Container ${data.containerId} state changed: ${data.fromState} -> ${data.toState}`);
  }

  /**
   * 处理内容变化
   */
  private handleContentMutation(data: any): void {
    // 可以在这里添加内容变化的逻辑
    this.state.lastActivity = Date.now();
  }

  /**
   * 处理系统错误
   */
  private handleSystemError(data: any): void {
    this.state.errorCount++;
    console.error(`System error in container ${this.config.id}:`, data.error);
  }

  /**
   * 处理错误
   */
  private handleError(error: any, context: string): void {
    this.state.errorCount++;

    this.emit('container:state:error', {
      containerId: this.config.id,
      error: error instanceof Error ? error.message : String(error)
    });

    console.error(`Error in container ${this.config.id} during ${context}:`, error);
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    // 清理变化观察器
    if (this.mutationObserver) {
      await this.mutationObserver.evaluate(observer => observer.disconnect());
      this.mutationObserver = null;
    }

    // 清理子容器
    for (const child of this.childContainers.values()) {
      await child.destroy();
    }
    this.childContainers.clear();

    // 清理事件监听器
    this.eventHandlers.clear();
    this.eventBus.destroy();

    // 清理共享空间引用
    this.sharedSpace = null;
  }

  // ==================== 公共接口 ====================

  /**
   * 获取容器状态
   */
  getState(): ContainerState {
    return { ...this.state };
  }

  /**
   * 获取容器配置
   */
  getConfig(): ContainerConfig {
    return { ...this.config };
  }

  /**
   * 获取容器统计信息
   */
  getStats(): any {
    return { ...this.state.stats };
  }

  /**
   * 检查容器是否就绪
   */
  isReady(): boolean {
    return this.state.status === 'ready';
  }

  /**
   * 检查容器是否正在运行
   */
  isRunning(): boolean {
    return this.state.status === 'running';
  }

  /**
   * 检查容器是否已完成
   */
  isCompleted(): boolean {
    return this.state.status === 'completed';
  }

  /**
   * 检查容器是否失败
   */
  isFailed(): boolean {
    return this.state.status === 'failed';
  }

  /**
   * 获取错误计数
   */
  getErrorCount(): number {
    return this.state.errorCount;
  }

  /**
   * 重置错误计数
   */
  resetErrorCount(): void {
    this.state.errorCount = 0;
  }
}
