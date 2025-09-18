/**
 * 基础工作流抽象类
 * 所有具体工作流都必须继承此类
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * 基础工作流类
 * 提供统一的工作流接口和基础功能
 */
class BaseWorkflow extends EventEmitter {
  constructor(config = {}) {
    super();

    // 基础配置
    this.config = {
      name: config.name || 'unnamed-workflow',
      version: config.version || '1.0.0',
      description: config.description || 'Base workflow',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      ...config
    };

    // 工作流状态
    this.state = {
      initialized: false,
      executing: false,
      completed: false,
      failed: false,
      currentStep: 0,
      totalSteps: 0,
      startTime: null,
      endTime: null,
      results: null,
      errors: []
    };

    // 原子操作集合
    this.atomicOperations = new Map();

    // 统计信息
    this.stats = {
      operationsExecuted: 0,
      operationsSuccessful: 0,
      operationsFailed: 0,
      totalExecutionTime: 0,
      averageOperationTime: 0
    };

    // 上下文信息
    this.context = {
      page: null,
      browser: null,
      testData: new Map(),
      sharedData: new Map()
    };
  }

  /**
   * 初始化工作流
   * 必须由子类实现
   */
  async initialize(context = {}) {
    if (this.state.initialized) {
      throw new Error('工作流已经初始化');
    }

    try {
      console.log(`🚀 初始化工作流: ${this.config.name}`);

      // 设置上下文
      this.context = { ...this.context, ...context };

      // 验证必需的上下文
      this.validateContext();

      // 注册原子操作
      await this.registerAtomicOperations();

      // 验证工作流配置
      this.validateConfiguration();

      this.state.initialized = true;
      this.state.startTime = Date.now();

      console.log(`✅ 工作流初始化完成: ${this.config.name}`);
      this.emit('initialized', this.state);

      return true;

    } catch (error) {
      console.error(`❌ 工作流初始化失败: ${this.config.name}`, error);
      this.state.errors.push(error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 执行工作流
   * 必须由子类实现
   */
  async execute(options = {}) {
    if (!this.state.initialized) {
      throw new Error('工作流未初始化，请先调用 initialize()');
    }

    if (this.state.executing) {
      throw new Error('工作流正在执行中');
    }

    try {
      console.log(`🔧 开始执行工作流: ${this.config.name}`);

      this.state.executing = true;
      this.state.startTime = Date.now();

      // 执行前准备
      await this.beforeExecute(options);

      // 执行工作流逻辑（由子类实现）
      const results = await this.executeWorkflow(options);

      // 执行后处理
      await this.afterExecute(results);

      this.state.completed = true;
      this.state.endTime = Date.now();
      this.state.results = results;
      this.state.executing = false;

      // 更新统计信息
      this.updateStatistics();

      console.log(`✅ 工作流执行完成: ${this.config.name}`);
      this.emit('completed', { state: this.state, results });

      return results;

    } catch (error) {
      console.error(`❌ 工作流执行失败: ${this.config.name}`, error);

      this.state.failed = true;
      this.state.endTime = Date.now();
      this.state.errors.push(error);
      this.state.executing = false;

      this.emit('failed', { state: this.state, error });
      throw error;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      console.log(`🧹 清理工作流资源: ${this.config.name}`);

      // 清理原子操作
      for (const [name, operation] of this.atomicOperations) {
        if (typeof operation.cleanup === 'function') {
          await operation.cleanup();
        }
      }

      // 清理测试数据
      this.context.testData.clear();
      this.context.sharedData.clear();

      // 重置状态
      this.state.initialized = false;
      this.state.executing = false;

      console.log(`✅ 工作流资源清理完成: ${this.config.name}`);
      this.emit('cleanup', this.state);

    } catch (error) {
      console.error(`❌ 工作流资源清理失败: ${this.config.name}`, error);
      this.emit('error', error);
    }
  }

  /**
   * 验证上下文
   */
  validateContext() {
    if (!this.context.page) {
      throw new Error('缺少必需的上下文: page');
    }
  }

  /**
   * 验证配置
   */
  validateConfiguration() {
    const required = ['name', 'version'];
    const missing = required.filter(field => !this.config[field]);

    if (missing.length > 0) {
      throw new Error(`工作流配置缺少必需字段: ${missing.join(', ')}`);
    }
  }

  /**
   * 注册原子操作
   * 必须由子类实现
   */
  async registerAtomicOperations() {
    throw new Error('registerAtomicOperations 方法必须由子类实现');
  }

  /**
   * 执行工作流逻辑
   * 必须由子类实现
   */
  async executeWorkflow(options = {}) {
    throw new Error('executeWorkflow 方法必须由子类实现');
  }

  /**
   * 执行前准备
   */
  async beforeExecute(options = {}) {
    // 可以由子类覆盖
    console.log(`📋 工作流执行前准备: ${this.config.name}`);
  }

  /**
   * 执行后处理
   */
  async afterExecute(results = {}) {
    // 可以由子类覆盖
    console.log(`📋 工作流执行后处理: ${this.config.name}`);
  }

  /**
   * 执行原子操作
   */
  async executeAtomicOperation(operationName, params = {}) {
    const operation = this.atomicOperations.get(operationName);
    if (!operation) {
      throw new Error(`原子操作未找到: ${operationName}`);
    }

    const startTime = Date.now();
    this.stats.operationsExecuted++;

    try {
      console.log(`  执行原子操作: ${operationName}`);

      const result = await operation.execute(this.context, params);

      const executionTime = Date.now() - startTime;
      this.stats.operationsSuccessful++;
      this.stats.totalExecutionTime += executionTime;

      console.log(`  ✅ 原子操作完成: ${operationName} (耗时: ${executionTime}ms)`);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.stats.operationsFailed++;
      this.stats.totalExecutionTime += executionTime;

      console.error(`  ❌ 原子操作失败: ${operationName} - ${error.message}`);

      // 尝试重试
      if (params.retry !== false && this.config.maxRetries > 0) {
        console.log(`  🔄 重试原子操作: ${operationName}`);
        return await this.retryAtomicOperation(operationName, params, this.config.maxRetries);
      }

      throw error;
    }
  }

  /**
   * 重试原子操作
   */
  async retryAtomicOperation(operationName, params, maxRetries) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        return await this.executeAtomicOperation(operationName, { ...params, retry: true });
      } catch (error) {
        lastError = error;
        console.warn(`  ⚠️ 重试失败 (${attempt}/${maxRetries}): ${operationName}`);
      }
    }

    throw lastError;
  }

  /**
   * 注册原子操作
   */
  registerAtomicOperation(name, operation) {
    this.atomicOperations.set(name, operation);
    console.log(`  📝 注册原子操作: ${name}`);
  }

  /**
   * 批量注册原子操作
   */
  registerAtomicOperations(operations) {
    for (const [name, operation] of Object.entries(operations)) {
      this.registerAtomicOperation(name, operation);
    }
  }

  /**
   * 设置共享数据
   */
  setSharedData(key, value) {
    this.context.sharedData.set(key, value);
  }

  /**
   * 获取共享数据
   */
  getSharedData(key, defaultValue = null) {
    return this.context.sharedData.get(key) || defaultValue;
  }

  /**
   * 设置测试数据
   */
  setTestData(key, value) {
    this.context.testData.set(key, value);
  }

  /**
   * 获取测试数据
   */
  getTestData(key, defaultValue = null) {
    return this.context.testData.get(key) || defaultValue;
  }

  /**
   * 更新统计信息
   */
  updateStatistics() {
    if (this.stats.operationsExecuted > 0) {
      this.stats.averageOperationTime =
        this.stats.totalExecutionTime / this.stats.operationsExecuted;
    }
  }

  /**
   * 获取执行状态
   */
  getExecutionStatus() {
    return {
      name: this.config.name,
      state: this.state,
      stats: this.stats,
      successRate: this.stats.operationsExecuted > 0 ?
        (this.stats.operationsSuccessful / this.stats.operationsExecuted * 100).toFixed(2) + '%' : '0%',
      totalExecutionTime: this.state.endTime ?
        this.state.endTime - this.state.startTime : 0
    };
  }

  /**
   * 获取工作流信息
   */
  getInfo() {
    return {
      name: this.config.name,
      version: this.config.version,
      description: this.config.description,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      atomicOperationsCount: this.atomicOperations.size,
      status: this.getExecutionStatus()
    };
  }

  /**
   * 生成执行报告
   */
  generateReport() {
    return {
      workflow: {
        name: this.config.name,
        version: this.config.version,
        description: this.config.description
      },
      execution: {
        startTime: this.state.startTime ? new Date(this.state.startTime).toISOString() : null,
        endTime: this.state.endTime ? new Date(this.state.endTime).toISOString() : null,
        duration: this.state.endTime && this.state.startTime ?
          this.state.endTime - this.state.startTime : 0,
        completed: this.state.completed,
        failed: this.state.failed,
        steps: {
          current: this.state.currentStep,
          total: this.state.totalSteps
        }
      },
      statistics: this.stats,
      errors: this.state.errors.map(error => ({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })),
      results: this.state.results
    };
  }

  /**
   * 保存报告到文件
   */
  async saveReport(filename = null) {
    try {
      const report = this.generateReport();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `${this.config.name}-report-${timestamp}.json`;
      const outputFile = filename || defaultFilename;

      const reportDir = path.join(__dirname, '..', 'reports');
      await fs.mkdir(reportDir, { recursive: true });

      const filePath = path.join(reportDir, outputFile);
      await fs.writeFile(filePath, JSON.stringify(report, null, 2));

      console.log(`📊 执行报告已保存: ${filePath}`);
      return filePath;

    } catch (error) {
      console.error('❌ 保存报告失败:', error);
      throw error;
    }
  }
}

module.exports = BaseWorkflow;