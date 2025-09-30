/**
 * WebAuto Operator Framework - 非页面操作子基类
 * @package @webauto/operator-framework
 */
import { UniversalOperator } from './UniversalOperator';
import { OperatorState } from './types/OperatorTypes';
export class NonPageOperator extends UniversalOperator {
    constructor(config) {
        super({
            ...config,
            type: 'non-page'
        });
        this._nonPageConfig = config;
        this._isInitialized = false;
        this._currentOperations = new Map();
    }
    // 生命周期方法
    async initialize() {
        if (this._isInitialized) {
            return;
        }
        try {
            await this.onInitialize();
            this._isInitialized = true;
            this.log('NonPageOperator initialized successfully');
        }
        catch (error) {
            throw new Error(`NonPageOperator initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async cleanup() {
        try {
            // 等待所有当前操作完成
            await Promise.all(this._currentOperations.values());
            this._currentOperations.clear();
            await this.onCleanup();
            this._isInitialized = false;
            this.log('NonPageOperator cleaned up successfully');
        }
        catch (error) {
            this.log(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 核心方法实现
    async execute(params) {
        if (!this._isInitialized && this._nonPageConfig.requireInitialization !== false) {
            return this.createErrorResult('Operator not initialized');
        }
        if (!this.validateParams(params)) {
            return this.createErrorResult('Invalid parameters');
        }
        const operationId = this.generateOperationId();
        const startTime = Date.now();
        try {
            const operationPromise = this.executeWithOperationTracking(operationId, params);
            this._currentOperations.set(operationId, operationPromise);
            const result = await operationPromise;
            result.executionTime = Date.now() - startTime;
            this.addToExecutionHistory(result);
            return result;
        }
        catch (error) {
            const errorResult = this.createErrorResult(`Non-page operation failed: ${error instanceof Error ? error.message : String(error)}`);
            errorResult.executionTime = Date.now() - startTime;
            this.addToExecutionHistory(errorResult);
            return errorResult;
        }
        finally {
            this._currentOperations.delete(operationId);
        }
    }
    // 异步操作支持
    async executeAsync(params) {
        if (!this._nonPageConfig.asyncSupported) {
            throw new Error('Async operations not supported');
        }
        const operationId = this.generateOperationId();
        const operationPromise = this.executeWithOperationTracking(operationId, params);
        this._currentOperations.set(operationId, operationPromise);
        // 不等待完成，直接返回操作ID
        operationPromise.finally(() => {
            this._currentOperations.delete(operationId);
        });
        return operationId;
    }
    async getAsyncResult(operationId) {
        const operation = this._currentOperations.get(operationId);
        if (!operation) {
            return this.createErrorResult('Operation not found or already completed');
        }
        return operation;
    }
    // 批量操作支持
    async executeBatch(operations) {
        if (!this._nonPageConfig.maxConcurrency) {
            return this.createErrorResult('Batch operations not configured');
        }
        const maxConcurrency = this._nonPageConfig.maxConcurrency;
        const results = [];
        const chunks = this.chunkArray(operations, maxConcurrency);
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(async (op) => {
                try {
                    const result = await this.execute(op.params);
                    return { id: op.id, ...result };
                }
                catch (error) {
                    return {
                        id: op.id,
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        executionTime: 0,
                        state: OperatorState.ERROR
                    };
                }
            });
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
        }
        return this.createSuccessResult({
            total: operations.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        });
    }
    // 操作状态查询
    getActiveOperations() {
        return Array.from(this._currentOperations.keys());
    }
    isOperationActive(operationId) {
        return this._currentOperations.has(operationId);
    }
    // 配置获取
    isAsyncSupported() {
        return this._nonPageConfig.asyncSupported || false;
    }
    getMaxConcurrency() {
        return this._nonPageConfig.maxConcurrency || 1;
    }
    isInitialized() {
        return this._isInitialized;
    }
    // 受保护的抽象方法（可选实现）
    async onInitialize() {
        // 子类可以重写此方法进行自定义初始化
    }
    async onCleanup() {
        // 子类可以重写此方法进行自定义清理
    }
    // 受保护的工具方法
    async executeWithOperationTracking(operationId, params) {
        try {
            return await this.executeNonPageOperation(params);
        }
        catch (error) {
            this.log(`Operation ${operationId} failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    generateOperationId() {
        return `${this._config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    log(message) {
        console.log(`[${this._config.name}] ${message}`);
    }
}
//# sourceMappingURL=NonPageOperator.js.map