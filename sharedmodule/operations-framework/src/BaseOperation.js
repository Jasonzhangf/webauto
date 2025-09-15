/**
 * WebAuto 操作子基类
 * 所有操作子的基础抽象类
 */

export class BaseOperation {
  constructor(config = {}) {
    this.config = config;
    this.name = this.constructor.name;
    this.category = this.constructor.category || 'base';
    this.version = this.constructor.version || '1.0.0';
    this.description = this.constructor.description || '';
    this.logger = this.createLogger();
  }

  /**
   * 创建日志记录器
   */
  createLogger() {
    return {
      info: (message, data = {}) => console.log(`[${this.name}] INFO: ${message}`, data),
      warn: (message, data = {}) => console.warn(`[${this.name}] WARN: ${message}`, data),
      error: (message, data = {}) => console.error(`[${this.name}] ERROR: ${message}`, data),
      debug: (message, data = {}) => console.debug(`[${this.name}] DEBUG: ${message}`, data)
    };
  }

  /**
   * 执行操作子
   * @param {Object} context - 执行上下文
   * @param {Object} params - 操作参数
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context, params = {}) {
    throw new Error('execute() method must be implemented by subclass');
  }

  /**
   * 验证操作参数
   * @param {Object} params - 操作参数
   * @returns {Object} 验证结果 {valid: boolean, errors: string[]}
   */
  validate(params) {
    return { valid: true, errors: [] };
  }

  /**
   * 获取操作子元数据
   */
  getMetadata() {
    return {
      name: this.name,
      category: this.category,
      version: this.version,
      description: this.description,
      config: this.config,
      supportedActions: this.getSupportedActions()
    };
  }

  /**
   * 获取支持的操作
   */
  getSupportedActions() {
    return [];
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 子类可以重写此方法来清理资源
  }
}

/**
 * 操作子执行上下文
 */
export class OperationContext {
  constructor(initialState = {}) {
    this.state = initialState;
    this.history = [];
    this.startTime = Date.now();
    this.metadata = {
      executionId: this.generateExecutionId(),
      startTime: this.startTime,
      parentExecutionId: null
    };
  }

  /**
   * 生成执行ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 更新状态
   */
  updateState(key, value) {
    const previousValue = this.state[key];
    this.state[key] = value;
    
    this.history.push({
      timestamp: Date.now(),
      type: 'state_update',
      key,
      previousValue,
      newValue: value
    });
  }

  /**
   * 记录操作历史
   */
  record(operation, params, result) {
    this.history.push({
      timestamp: Date.now(),
      operation,
      params,
      result,
      duration: Date.now() - this.startTime
    });
  }

  /**
   * 获取执行摘要
   */
  getSummary() {
    return {
      executionId: this.metadata.executionId,
      duration: Date.now() - this.startTime,
      operationCount: this.history.length,
      finalState: this.state,
      hasErrors: this.history.some(h => h.result && h.result.error)
    };
  }
}

/**
 * 操作子执行结果
 */
export class OperationResult {
  constructor(success, data = null, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.timestamp = Date.now();
    this.metadata = {
      executionTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  /**
   * 创建成功结果
   */
  static success(data) {
    return new OperationResult(true, data);
  }

  /**
   * 创建失败结果
   */
  static failure(error, data = null) {
    return new OperationResult(false, data, error);
  }

  /**
   * 设置执行元数据
   */
  setMetadata(metadata) {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }
}

/**
 * 操作子接口定义
 */
// IOperation 接口在JavaScript中通过基类方法实现

/**
 * 可配置操作子接口
 */
// IConfigurableOperation 接口在JavaScript中通过基类方法实现

/**
 * 可观察操作子接口
 */
// IObservableOperation 接口在JavaScript中通过EventEmitter实现

export default BaseOperation;