/**
 * 基础原子操作类
 * 所有原子操作都必须继承此类
 */

/**
 * 基础原子操作抽象类
 */
class BaseAtomicOperation {
  constructor(config = {}) {
    this.config = {
      name: config.name || 'unnamed-operation',
      type: config.type || 'base',
      timeout: config.timeout || 10000,
      retryCount: config.retryCount || 3,
      retryDelay: config.retryDelay || 1000,
      description: config.description || 'Base atomic operation',
      ...config
    };

    this.stats = {
      executions: 0,
      successes: 0,
      failures: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0
    };
  }

  /**
   * 执行原子操作
   * 必须由子类实现
   */
  async execute(context, params = {}) {
    throw new Error('execute 方法必须由子类实现');
  }

  /**
   * 验证参数
   */
  validateParams(params) {
    return { valid: true, errors: [] };
  }

  /**
   * 验证上下文
   */
  validateContext(context) {
    if (!context.page) {
      throw new Error('缺少必需的上下文: page');
    }
    return true;
  }

  /**
   * 执行前准备
   */
  async beforeExecute(context, params) {
    // 可以由子类覆盖
  }

  /**
   * 执行后处理
   */
  async afterExecute(context, params, result) {
    // 可以由子类覆盖
  }

  /**
   * 错误处理
   */
  async handleError(error, context, params) {
    // 可以由子类覆盖
    throw error;
  }

  /**
   * 重试逻辑
   */
  async retry(error, context, params, attempt) {
    if (attempt < this.config.retryCount) {
      console.log(`🔄 重试原子操作 (${attempt + 1}/${this.config.retryCount}): ${this.config.name}`);
      await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      return true;
    }
    return false;
  }

  /**
   * 带重试的执行
   */
  async executeWithRetry(context, params = {}) {
    let lastError;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        return await this.executeSingle(context, params, attempt);
      } catch (error) {
        lastError = error;

        if (await this.retry(error, context, params, attempt)) {
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  /**
   * 单次执行
   */
  async executeSingle(context, params, attempt = 0) {
    const startTime = Date.now();
    this.stats.executions++;

    try {
      // 验证上下文
      this.validateContext(context);

      // 验证参数
      const validation = this.validateParams(params);
      if (!validation.valid) {
        throw new Error(`参数验证失败: ${validation.errors.join(', ')}`);
      }

      // 执行前准备
      await this.beforeExecute(context, params);

      // 执行操作
      const result = await this.execute(context, params);

      // 执行后处理
      await this.afterExecute(context, params, result);

      // 更新统计信息
      const executionTime = Date.now() - startTime;
      this.updateStatistics(true, executionTime);

      return {
        success: true,
        result,
        executionTime,
        attempt: attempt + 1,
        operation: this.config.name
      };

    } catch (error) {
      // 更新统计信息
      const executionTime = Date.now() - startTime;
      this.updateStatistics(false, executionTime);

      // 错误处理
      await this.handleError(error, context, params);

      return {
        success: false,
        error: error.message,
        executionTime,
        attempt: attempt + 1,
        operation: this.config.name
      };
    }
  }

  /**
   * 更新统计信息
   */
  updateStatistics(success, executionTime) {
    if (success) {
      this.stats.successes++;
    } else {
      this.stats.failures++;
    }

    this.stats.totalExecutionTime += executionTime;
    this.stats.averageExecutionTime =
      this.stats.totalExecutionTime / this.stats.executions;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.executions > 0 ?
        (this.stats.successes / this.stats.executions * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 获取操作信息
   */
  getInfo() {
    return {
      name: this.config.name,
      type: this.config.type,
      description: this.config.description,
      timeout: this.config.timeout,
      retryCount: this.config.retryCount,
      stats: this.getStats()
    };
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 可以由子类覆盖
  }
}

module.exports = BaseAtomicOperation;