/**
 * WebAuto Operator Framework - 通用操作子基类
 * @package @webauto/operator-framework
 */

import { RCCBaseModule } from 'rcc-basemodule';
import {
  OperatorConfig,
  OperationResult,
  OperatorState,
  OperatorCapabilities,
  OperatorContext,
  ConnectionConfig
} from './types/OperatorTypes';
import { EventEmitter } from 'events';

export abstract class UniversalOperator extends RCCBaseModule {
  protected _config: OperatorConfig;
  protected _state: OperatorState;
  protected _context: OperatorContext;
  protected _capabilities: OperatorCapabilities;
  protected _eventEmitter: EventEmitter;
  protected _childOperators: Map<string, UniversalOperator>;
  protected _connections: Map<string, ConnectionConfig>;
  protected _executionHistory: OperationResult[];

  constructor(config: OperatorConfig) {
    super();
    this._config = config;
    this._state = OperatorState.IDLE;
    this._capabilities = this.initializeCapabilities();
    this._eventEmitter = new EventEmitter();
    this._childOperators = new Map();
    this._connections = new Map();
    this._executionHistory = [];

    this._context = {
      sessionId: this.generateSessionId(),
      timestamp: Date.now(),
      parameters: {},
      sharedData: new Map()
    };

    this.emitEvent('operator_created', {
      operatorId: this._config.id,
      config: this._config
    });
  }

  // 核心抽象方法 - 必须由子类实现
  abstract execute(params: Record<string, any>): Promise<OperationResult>;
  abstract initialize(): Promise<void>;
  abstract cleanup(): Promise<void>;

  // 核心操作方法 - 根据用户需求的核心操作
  public async observe(params: Record<string, any>): Promise<OperationResult> {
    if (!this._capabilities.observe) {
      return this.createErrorResult('Observe capability not supported');
    }
    return this.handleCapabilityNotImplemented('observe');
  }

  public async list(params: Record<string, any>): Promise<OperationResult> {
    if (!this._capabilities.list) {
      return this.createErrorResult('List capability not supported');
    }
    return this.handleCapabilityNotImplemented('list');
  }

  public async capabilities(): Promise<OperationResult> {
    return this.createSuccessResult(this._capabilities);
  }

  public async status(): Promise<OperationResult> {
    return this.createSuccessResult({
      state: this._state,
      config: this._config,
      context: this._context,
      executionHistory: this._executionHistory.slice(-10), // 最近10次执行记录
      childOperators: Array.from(this._childOperators.keys())
    });
  }

  public async context(params: Record<string, any>): Promise<OperationResult> {
    if (!this._capabilities.context) {
      return this.createErrorResult('Context capability not supported');
    }

    if (params.action === 'get') {
      return this.createSuccessResult(this._context);
    } else if (params.action === 'update') {
      this.updateContext(params.data);
      return this.createSuccessResult(this._context);
    }

    return this.createErrorResult('Unknown context action');
  }

  public async connect(config: ConnectionConfig): Promise<OperationResult> {
    if (!this._capabilities.connect) {
      return this.createErrorResult('Connect capability not supported');
    }

    try {
      this._connections.set(config.targetOperator, config);
      await this.establishConnection(config);
      return this.createSuccessResult({ connected: true, target: config.targetOperator });
    } catch (error) {
      return this.createErrorResult(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 生命周期管理
  public async start(): Promise<void> {
    if (this._state !== OperatorState.IDLE) {
      throw new Error(`Operator cannot start from state: ${this._state}`);
    }

    try {
      this._state = OperatorState.RUNNING;
      this.emitEvent('operator_started', {
        operatorId: this._config.id,
        state: this._state
      });
      await this.initialize();
    } catch (error) {
      this._state = OperatorState.ERROR;
      this.emitEvent('operator_error', {
        operatorId: this._config.id,
        error: error.message
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async stop(): Promise<void> {
    if (this._state === OperatorState.RUNNING) {
      this._state = OperatorState.IDLE;
      await this.cleanup();
    }
  }

  public async destroy(): Promise<void> {
    await this.stop();
    await this.cleanup();
    this._eventEmitter.removeAllListeners();
    this.emitEvent('operator_destroyed', {
      operatorId: this._config.id
    });
  }

  // 状态管理
  public getState(): OperatorState {
    return this._state;
  }

  public getConfig(): OperatorConfig {
    return { ...this._config };
  }

  public getContext(): OperatorContext {
    return { ...this._context };
  }

  // 子操作子管理
  public addChildOperator(operator: UniversalOperator): void {
    this._childOperators.set(operator._config.id, operator);
    if (!this._context.childOperators) {
      this._context.childOperators = [];
    }
    this._context.childOperators.push(operator._config.id);
    operator._context.parentOperator = this._config.id;
  }

  public removeChildOperator(operatorId: string): void {
    this._childOperators.delete(operatorId);
    if (this._context.childOperators) {
      this._context.childOperators = this._context.childOperators.filter(id => id !== operatorId);
    }
  }

  public getChildOperator(operatorId: string): UniversalOperator | undefined {
    return this._childOperators.get(operatorId);
  }

  // 事件系统
  public on(event: string, listener: (data: any) => void): void {
    this._eventEmitter.on(event, listener);
  }

  public off(event: string, listener: (data: any) => void): void {
    this._eventEmitter.off(event, listener);
  }

  public once(event: string, listener: (data: any) => void): void {
    this._eventEmitter.once(event, listener);
  }

  // 受保护的方法
  protected emitEvent(type: string, data: any): void {
    const eventData = {
      type,
      timestamp: Date.now(),
      operatorId: this._config.id,
      data,
      source: this._config.name
    };
    this._eventEmitter.emit(type, eventData);
  }

  protected createSuccessResult(data?: any): OperationResult {
    return {
      success: true,
      data,
      executionTime: 0,
      state: this._state,
      metadata: {
        operatorId: this._config.id,
        timestamp: Date.now()
      }
    };
  }

  protected createErrorResult(error: string): OperationResult {
    return {
      success: false,
      error,
      executionTime: 0,
      state: this._state,
      metadata: {
        operatorId: this._config.id,
        timestamp: Date.now()
      }
    };
  }

  protected updateContext(data: Record<string, any>): void {
    this._context.timestamp = Date.now();
    Object.assign(this._context.parameters, data);
    this.emitEvent('context_updated', {
      operatorId: this._config.id,
      context: this._context
    });
  }

  protected addToExecutionHistory(result: OperationResult): void {
    this._executionHistory.push(result);
    if (this._executionHistory.length > 100) {
      this._executionHistory = this._executionHistory.slice(-100);
    }
  }

  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await this.sleep(retryDelay * Math.pow(2, attempt));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Operation failed after retries');
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 私有方法
  private generateSessionId(): string {
    return `${this._config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeCapabilities(): OperatorCapabilities {
    return {
      observe: true,
      list: true,
      operate: true,
      status: true,
      context: true,
      connect: true,
      capabilities: []
    };
  }

  private async establishConnection(config: ConnectionConfig): Promise<void> {
    // 默认连接建立逻辑，子类可以重写
    this.emitEvent('connection_established', {
      operatorId: this._config.id,
      target: config.targetOperator
    });
  }

  private async handleCapabilityNotImplemented(capability: string): Promise<OperationResult> {
    return this.createErrorResult(`Capability ${capability} not implemented`);
  }
}