import { MessageBusService } from './MessageBusService.js';
import { ContainerVariableManager } from './ContainerVariableManager.js';
import { TriggerConditionEvaluator } from './TriggerConditionEvaluator.js';
import { MessageRpcClient } from './MessageRpcClient.js';
import { ContainerDiscoveryEngine, type ContainerDefinition, type DiscoveredContainer } from './ContainerDiscoveryEngine.ts';
import { ContainerOperationExecutor, type OperationDefinition } from './ContainerOperationExecutor.ts';
import { ContainerStatusTracker } from './ContainerStatusTracker.js';
import {
  MSG_CONTAINER_ROOT_PAGE_LOAD,
  MSG_CONTAINER_ROOT_SCROLL_START,
  MSG_CONTAINER_ROOT_SCROLL_COMPLETE,
  MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE,
  MSG_CONTAINER_ROOT_DISCOVER_COMPLETE,
  MSG_SYSTEM_ERROR,
  CMD_BROWSER_PAGE_SCROLL,
  RES_BROWSER_PAGE_SCROLL
} from './MessageConstants.js';

export interface RootDriverConfig {
  definition: ContainerDefinition;
  operations: OperationDefinition[];
  scrollConfig?: {
    enabled: boolean;
    maxScrolls: number;
    delayMs: number;
    checkEndSelector?: string;
  };
}

/**
 * 根容器驱动器
 * 负责协调发现、执行、滚动循环
 */
export class RootContainerDriver {
  private messageBus: MessageBusService;
  private variableManager: ContainerVariableManager;
  private conditionEvaluator: TriggerConditionEvaluator;
  private rpcClient: MessageRpcClient;
  
  private discoveryEngine: ContainerDiscoveryEngine;
  private operationExecutor: ContainerOperationExecutor;
  private statusTracker: ContainerStatusTracker;
  
  private config: RootDriverConfig;
  private isRunning: boolean = false;
  private scrollCount: number = 0;

  constructor(
    messageBus: MessageBusService,
    config: RootDriverConfig
  ) {
    this.messageBus = messageBus;
    this.config = config;
    
    // 初始化组件
    this.variableManager = new ContainerVariableManager(messageBus);
    this.conditionEvaluator = new TriggerConditionEvaluator(this.variableManager);
    this.discoveryEngine = new ContainerDiscoveryEngine(messageBus, this.variableManager, this.conditionEvaluator);
    this.operationExecutor = new ContainerOperationExecutor(messageBus, this.variableManager);
    this.statusTracker = new ContainerStatusTracker(messageBus);
    this.rpcClient = new MessageRpcClient(messageBus);
    this.rpcClient.init(RES_BROWSER_PAGE_SCROLL);

    this.setupListeners();
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    this.variableManager.setRootContainerId(this.config.definition.id);
    this.statusTracker.setRootContainerId(this.config.definition.id);
    
    // 初始化根变量
    this.variableManager.initContainerVariables(this.config.definition.id, [], {
      scrollCount: 0,
      totalProcessed: 0,
      isComplete: false
    });

    // 触发第一轮发现
    await this.runDiscoveryCycle();
  }

  public stop(): void {
    this.isRunning = false;
  }

  private setupListeners(): void {
    // 监听发现完成
    this.messageBus.subscribe(MSG_CONTAINER_ROOT_DISCOVER_COMPLETE, async (msg: any) => {
      // 可以在这里触发操作执行，或者在 runDiscoveryCycle 中直接调用
    });

    // 监听所有操作完成 -> 触发滚动或结束
    this.messageBus.subscribe(MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE, async (msg: any) => {
      if (!this.isRunning) return;
      
      const { completed, failed } = msg.payload;
      const totalProcessed = this.variableManager.getRootVariable('totalProcessed') as number || 0;
      this.variableManager.setRootVariable('totalProcessed', totalProcessed + completed);

      // 判断是否需要滚动
      if (this.shouldScroll()) {
        await this.performScroll();
      } else {
        this.completeWorkflow();
      }
    });
  }

  private async runDiscoveryCycle(): Promise<void> {
    try {
      this.statusTracker.reset();
      
      const discovered = await this.discoveryEngine.startDiscovery(this.config.definition);
      
      // 过滤出子容器（排除根容器自己）
      const childContainers = discovered.filter(c => c.definitionId !== this.config.definition.id);
      
      const rootContainer = discovered.find(c => c.definitionId === this.config.definition.id);
      if (rootContainer) {
        this.statusTracker.markContainerCompleted(rootContainer.id);
      }
      
      if (childContainers.length > 0) {
        // 执行操作
        await this.operationExecutor.executeBatchOperations(childContainers, this.config.operations, 'parallel');
        
        // 标记完成（这里简化处理，假设并行执行完就完成了，实际上应该等待每个操作的完成消息）
        // 实际项目中，StatusTracker 会追踪每个操作的完成
        for (const c of childContainers) {
          this.statusTracker.markContainerCompleted(c.id);
        }
      } else {
        // 没有发现新容器，直接尝试滚动
        if (this.shouldScroll()) {
          await this.performScroll();
        } else {
          this.completeWorkflow();
        }
      }

    } catch (error) {
      console.error('[RootContainerDriver] Cycle failed:', error);
      await this.messageBus.publish(MSG_SYSTEM_ERROR, { error: String(error) }, { component: 'RootContainerDriver' });
      this.isRunning = false;
    }
  }

  private shouldScroll(): boolean {
    if (!this.config.scrollConfig?.enabled) return false;
    if (this.scrollCount >= (this.config.scrollConfig.maxScrolls || 10)) return false;
    
    // 还可以检查是否到底部等条件
    return true;
  }

  private async performScroll(): Promise<void> {
    this.scrollCount++;
    this.variableManager.setRootVariable('scrollCount', this.scrollCount);
    
    await this.messageBus.publish(MSG_CONTAINER_ROOT_SCROLL_START, {
      count: this.scrollCount
    }, { component: 'RootContainerDriver' });

    // 使用 RPC 调用浏览器滚动
    try {
      await this.rpcClient.call(CMD_BROWSER_PAGE_SCROLL, {
        scrollCount: this.scrollCount,
        delayMs: this.config.scrollConfig?.delayMs
      });
    } catch (error) {
      console.warn('[RootContainerDriver] Scroll RPC failed:', error);
      // 降级处理或终止流程？这里选择继续，但可能需要更好的错误处理
    }

    await this.messageBus.publish(MSG_CONTAINER_ROOT_SCROLL_COMPLETE, {
      count: this.scrollCount
    }, { component: 'RootContainerDriver' });

    // 滚动后重新发现
    await this.runDiscoveryCycle();
  }

  private completeWorkflow(): void {
    this.isRunning = false;
    this.variableManager.setRootVariable('isComplete', true);
    console.log('[RootContainerDriver] Workflow completed');
  }
}
