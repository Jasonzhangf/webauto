import { MessageRpcClient } from './MessageRpcClient.js';
import { MSG_CONTAINER_OPERATION_START, MSG_CONTAINER_OPERATION_COMPLETE, MSG_CONTAINER_OPERATION_FAILED, MSG_CONTAINER_ROOT_OPERATIONS_BATCH_COMPLETE, CMD_BROWSER_DOM_ACTION, RES_BROWSER_DOM_ACTION } from './MessageConstants.js';
/**
 * 容器操作执行器
 * 负责执行容器上定义的操作
 */
export class ContainerOperationExecutor {
    messageBus;
    variableManager;
    rpcClient;
    constructor(messageBus, variableManager) {
        this.messageBus = messageBus;
        this.variableManager = variableManager;
        this.rpcClient = new MessageRpcClient(messageBus);
        this.rpcClient.init(RES_BROWSER_DOM_ACTION);
    }
    /**
     * 执行单个容器的操作
     */
    async executeContainerOperations(container, operations) {
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
            }
            catch (error) {
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
    async executeBatchOperations(containers, operations, strategy = 'serial', batchSize = 5) {
        if (containers.length === 0)
            return;
        if (strategy === 'serial') {
            for (const container of containers) {
                await this.executeContainerOperations(container, operations);
            }
        }
        else if (strategy === 'parallel') {
            await Promise.all(containers.map(c => this.executeContainerOperations(c, operations)));
        }
        else if (strategy === 'batch') {
            for (let i = 0; i < containers.length; i += batchSize) {
                const batch = containers.slice(i, i + batchSize);
                await Promise.all(batch.map(c => this.executeContainerOperations(c, operations)));
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
    async performOperation(container, op) {
        const elementId = container.element; // 在 RPC 模式下，这是一个 ID 字符串
        if (!elementId) {
            throw new Error(`Container ${container.id} has no element reference`);
        }
        const response = await this.rpcClient.call(CMD_BROWSER_DOM_ACTION, {
            elementId,
            action: op.type,
            params: op.params
        });
        if (!response.success) {
            throw new Error(response.error || 'Browser action failed');
        }
    }
}
