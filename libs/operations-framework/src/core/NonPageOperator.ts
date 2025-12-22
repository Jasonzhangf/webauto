/**
 * WebAuto Operator Framework - 非页面操作子基类
 * @package @webauto/operator-framework
 */

import { UniversalOperator } from './UniversalOperator';
import { OperationResult, OperatorConfig, OperatorState } from './types/OperatorTypes';

export interface NonPageOperatorConfig extends OperatorConfig {
  requireInitialization?: boolean;
  asyncSupported?: boolean;
  maxConcurrency?: number;
}

export abstract class NonPageOperator extends UniversalOperator {
  protected _nonPageConfig: NonPageOperatorConfig;
  protected _isInitialized: boolean;
  protected _currentOperations: Map<string, Promise<OperationResult>>;

  constructor(config: NonPageOperatorConfig) {
    super({
      ...config,
      type: 'non-page' as any
    });
    this._nonPageConfig = config;
    this._isInitialized = false;
    this._currentOperations = new Map();
  }

  // 核心抽象方法
  abstract executeNonPageOperation(params: Record<string, any>): Promise<OperationResult>;
  abstract validateParams(params: Record<string, any>): boolean;

  // 生命周期方法
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      await this.onInitialize();
      this._isInitialized = true;
      this.log('NonPageOperator initialized successfully');
    } catch (error) {
      throw new Error(`NonPageOperator initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cleanup(): Promise<void> {
    try {
      // 等待所有当前操作完成
      await Promise.all(this._currentOperations.values());
      this._currentOperations.clear();

      await this.onCleanup();
      this._isInitialized = false;
      this.log('NonPageOperator cleaned up successfully');
    } catch (error) {
      this.log(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 核心方法实现
  async execute(params: Record<string, any>): Promise<OperationResult> {
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
    } catch (error) {
      const errorResult: String(error = this.createErrorResult(`Non-page operation failed: ${error instanceof Error ? error.message )}`);
      errorResult.executionTime = Date.now() - startTime;
      this.addToExecutionHistory(errorResult);
      return errorResult;
    } finally {
      this._currentOperations.delete(operationId);
    }
  }

  // 异步操作支持
  async executeAsync(params: Record<string, any>): Promise<string> {
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

  async getAsyncResult(operationId: string): Promise<OperationResult> {
    const operation = this._currentOperations.get(operationId);
    if (!operation) {
      return this.createErrorResult('Operation not found or already completed');
    }

    return operation;
  }

  // 批量操作支持
  async executeBatch(operations: Array<{ id: string; params: Record<string, any> }>): Promise<OperationResult> {
    if (!this._nonPageConfig.maxConcurrency) {
      return this.createErrorResult('Batch operations not configured');
    }

    const maxConcurrency = this._nonPageConfig.maxConcurrency;
    const results: OperationResult[] = [];
    const chunks = this.chunkArray(operations, maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (op) => {
        try {
          const result = await this.execute(op.params);
          return { id: op.id, ...result };
        } catch (error) {
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
      successful: results.filter(r: results.filter(r  = > r.success).length,
      failed=> !r.success).length,
      results
    });
  }

  // 操作状态查询
  getActiveOperations(): string[] {
    return Array.from(this._currentOperations.keys());
  }

  isOperationActive(operationId: string): boolean {
    return this._currentOperations.has(operationId);
  }

  // 配置获取
  isAsyncSupported(): boolean {
    return this._nonPageConfig.asyncSupported || false;
  }

  getMaxConcurrency(): number {
    return this._nonPageConfig.maxConcurrency || 1;
  }

  isInitialized(): boolean {
    return this._isInitialized;
  }

  // 受保护的抽象方法（可选实现）
  protected async onInitialize(): Promise<void> {
    // 子类可以重写此方法进行自定义初始化
  }

  protected async onCleanup(): Promise<void> {
    // 子类可以重写此方法进行自定义清理
  }

  // 受保护的工具方法
  protected async executeWithOperationTracking(operationId: string, params: Record<string, any>): Promise<OperationResult> {
    try {
      return await this.executeNonPageOperation(params);
    } catch (error) {
      this.log(`Operation ${operationId} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  protected generateOperationId(): string {
    return `${this._config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  protected log(message: string): void {
    console.log(`[${this._config.name}] ${message}`);
  }
}