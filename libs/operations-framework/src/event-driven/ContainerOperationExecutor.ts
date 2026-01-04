import { MessageBusService } from './MessageBusService.ts';
import { ContainerVariableManager } from './ContainerVariableManager.ts';
import { MessageRpcClient } from './MessageRpcClient.ts';
import type { DiscoveredContainer } from './ContainerDiscoveryEngine.ts';
import {
  MSG_CONTAINER_OPERATION_START,
  MSG_CONTAINER_OPERATION_COMPLETE,
  MSG_CONTAINER_OPERATION_FAILED,
  MSG_CONTAINER_FOCUSED,
  MSG_CONTAINER_DEFOCUSED,
  MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE,
  CMD_BROWSER_DOM_ACTION,
  RES_BROWSER_DOM_ACTION
} from './MessageConstants.ts';

/**
 * 操作定义
 */
export interface OperationDefinition {
  id: string;
  type: string; // click, input, scroll, etc.
  params?: Record<string, any>;
  target?: string; // 目标子容器定义ID，空表示当前容器
}

/**
 * 执行策略
 */
export type ExecutionStrategy = 'serial' | 'parallel' | 'batch';

/**
 * 容器操作执行器
 * 负责执行容器上定义的操作
 */
export class ContainerOperationExecutor {
  private messageBus: MessageBusService;
  private variableManager: ContainerVariableManager;
  private rpcClient: MessageRpcClient;
  
  constructor(
    messageBus: MessageBusService,
    variableManager: ContainerVariableManager
  ) {
    this.messageBus = messageBus;
    this.variableManager = variableManager;
    this.rpcClient = new MessageRpcClient(messageBus);
    this.rpcClient.init(RES_BROWSER_DOM_ACTION);
  }

  /**
   * 执行单个容器的操作
   */
  public async executeContainerOperations(
    container: DiscoveredContainer,
    operations: OperationDefinition[]
  ): Promise<boolean> {
    const containerId = container.id;
    
    for (const op of operations) {
      try {
        await this.messageBus.publish(MSG_CONTAINER_OPERATION_START, {
          containerId,
          operationId: op.id,
          type: op.type
        }, { component: 'ContainerOperationExecutor' });

        // 执行具体操作
        await this.performOperation(container, op);

        await this.messageBus.publish(MSG_CONTAINER_OPERATION_COMPLETE, {
          containerId,
          operationId: op.id,
          type: op.type
        }, { component: 'ContainerOperationExecutor' });

      } catch (error) {
        console.error(`[ContainerOperationExecutor] Operation failed: ${op.id} on ${containerId}`, error);
        
        await this.messageBus.publish(MSG_CONTAINER_OPERATION_FAILED, {
          containerId,
          operationId: op.id,
          type: op.type,
          error: error instanceof Error ? error.message : String(error)
        }, { component: 'ContainerOperationExecutor' });
        
        return false;
      }
    }
    
    return true;
  }

  /**
   * 批量执行多个容器的操作
   */
  public async executeBatchOperations(
    containers: DiscoveredContainer[],
    operations: OperationDefinition[],
    strategy: ExecutionStrategy = 'serial',
    batchSize: number = 5
  ): Promise<void> {
    if (containers.length === 0) return;

    if (strategy === 'serial') {
      for (const container of containers) {
        await this.executeContainerOperations(container, operations);
      }
    } else if (strategy === 'parallel') {
      await Promise.all(
        containers.map(c => this.executeContainerOperations(c, operations))
      );
    } else if (strategy === 'batch') {
      for (let i = 0; i < containers.length; i += batchSize) {
        const batch = containers.slice(i, i + batchSize);
        await Promise.all(
          batch.map(c => this.executeContainerOperations(c, operations))
        );
        
        // 批次间可能需要等待或检查状态
        await this.messageBus.publish(MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE, {
          batchIndex: i / batchSize,
          processedCount: i + batch.length,
          totalCount: containers.length
        }, { component: 'ContainerOperationExecutor' });
      }
    }
  }

  /**
   * 执行底层操作 (RPC 实现)
   */
  private async performOperation(container: DiscoveredContainer, op: OperationDefinition): Promise<void> {
    const elementId = container.element; // 在 RPC 模式下，这是一个 ID 字符串

    if (!elementId) {
      throw new Error(`Container ${container.id} has no element reference`);
    }

    // Focus
    await this.messageBus.publish(MSG_CONTAINER_FOCUSED, {
      containerId: container.id,
      operationId: op.id
    }, { component: 'ContainerOperationExecutor' });

    try {
      const response = await this.rpcClient.call(CMD_BROWSER_DOM_ACTION, {
        elementId,
        action: op.type,
        params: op.params
      });

      if (!response.success) {
        throw new Error(response.error || 'Browser action failed');
      }
      
      // Handle extract specifically
      if (op.type === 'extract' && response.data) {
         // Store extracted data? For now just log or put in message
      }

    } finally {
      // Defocus
      await this.messageBus.publish(MSG_CONTAINER_DEFOCUSED, {
        containerId: container.id,
        operationId: op.id
      }, { component: 'ContainerOperationExecutor' });
    }
  }
}
