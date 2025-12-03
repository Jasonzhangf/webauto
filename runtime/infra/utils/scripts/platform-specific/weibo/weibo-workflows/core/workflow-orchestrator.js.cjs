/**
 * 工作流编排器
 * 统一管理和执行各种工作流
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * 工作流编排器
 * 负责工作流的注册、发现、执行和管理
 */
class WorkflowOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxConcurrentWorkflows: options.maxConcurrentWorkflows || 3,
      defaultTimeout: options.defaultTimeout || 300000,
      retryDelay: options.retryDelay || 2000,
      autoSaveReports: options.autoSaveReports !== false,
      reportsDirectory: options.reportsDirectory || './reports',
      ...options
    };

    // 工作流注册表
    this.workflows = new Map();
    this.workflowInstances = new Map();
    this.runningWorkflows = new Map();

    // 统计信息
    this.stats = {
      totalWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0
    };

    // 初始化
    this.initialize();
  }

  /**
   * 初始化编排器
   */
  async initialize() {
    try {
      console.log('🚀 初始化工作流编排器...');

      // 创建必要的目录
      await this.createDirectories();

      // 自动发现工作流
      await this.discoverWorkflows();

      console.log('✅ 工作流编排器初始化完成');
      this.emit('initialized');

    } catch (error) {
      console.error('❌ 工作流编排器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建必要的目录
   */
  async createDirectories() {
    const directories = [
      this.options.reportsDirectory,
      path.join(this.options.reportsDirectory, 'workflows'),
      path.join(this.options.reportsDirectory, 'batch'),
      path.join(this.options.reportsDirectory, 'composite')
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 自动发现工作流
   */
  async discoverWorkflows() {
    try {
      const workflowsDir = path.join(__dirname, '..', 'workflows');
      const files = await fs.readdir(workflowsDir);

      for (const file of files) {
        if (file.endsWith('.js') && !file.includes('composite')) {
          try {
            const workflowPath = path.join(workflowsDir, file);
            const workflowModule = require(workflowPath);

            // 注册工作流
            if (workflowModule.WorkflowClass) {
              this.registerWorkflow(
                workflowModule.WorkflowClass.name.toLowerCase().replace('workflow', ''),
                workflowModule.WorkflowClass,
                workflowModule.config || {}
              );
            }
          } catch (error) {
            console.warn(`⚠️ 工作流发现失败: ${file}`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ 工作流发现过程出错:', error.message);
    }
  }

  /**
   * 注册工作流
   */
  registerWorkflow(name, workflowClass, config = {}) {
    if (this.workflows.has(name)) {
      console.warn(`⚠️ 工作流已存在，将被覆盖: ${name}`);
    }

    this.workflows.set(name, {
      class: workflowClass,
      config: config,
      metadata: {
        registeredAt: new Date().toISOString(),
        version: config.version || '1.0.0',
        description: config.description || `Workflow: ${name}`
      }
    });

    this.stats.totalWorkflows++;
    console.log(`✅ 工作流已注册: ${name}`);
    this.emit('workflowRegistered', { name, workflowClass, config });
  }

  /**
   * 获取工作流列表
   */
  getWorkflowList() {
    return Array.from(this.workflows.keys()).map(name => ({
      name,
      ...this.workflows.get(name).metadata
    }));
  }

  /**
   * 获取工作流信息
   */
  getWorkflowInfo(name) {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`工作流未找到: ${name}`);
    }

    return {
      name,
      class: workflow.class.name,
      config: workflow.config,
      metadata: workflow.metadata
    };
  }

  /**
   * 创建工作流实例
   */
  async createWorkflowInstance(name, context = {}) {
    const workflowDef = this.workflows.get(name);
    if (!workflowDef) {
      throw new Error(`工作流未找到: ${name}`);
    }

    try {
      console.log(`🔧 创建工作流实例: ${name}`);

      const workflow = new workflowDef.class({
        ...workflowDef.config,
        ...context.config
      });

      // 初始化工作流
      await workflow.initialize(context);

      // 保存实例
      const instanceId = `${name}-${Date.now()}`;
      this.workflowInstances.set(instanceId, {
        name,
        instance: workflow,
        createdAt: new Date().toISOString()
      });

      console.log(`✅ 工作流实例创建成功: ${name} (${instanceId})`);
      return { workflow, instanceId };

    } catch (error) {
      console.error(`❌ 工作流实例创建失败: ${name}`, error);
      throw error;
    }
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(name, options = {}) {
    const startTime = Date.now();

    try {
      console.log(`🔧 开始执行工作流: ${name}`);

      // 检查并发限制
      if (this.runningWorkflows.size >= this.options.maxConcurrentWorkflows) {
        throw new Error('达到最大并发工作流限制');
      }

      // 创建工作流实例
      const { workflow, instanceId } = await this.createWorkflowInstance(name, options.context || {});

      // 记录运行中的工作流
      this.runningWorkflows.set(instanceId, {
        name,
        workflow,
        startTime,
        options
      });

      // 设置超时
      const timeout = options.timeout || this.options.defaultTimeout;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('工作流执行超时')), timeout);
      });

      // 执行工作流
      const executionPromise = workflow.execute(options);

      // 等待执行完成或超时
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // 保存报告
      if (this.options.autoSaveReports) {
        await this.saveWorkflowReport(workflow, name);
      }

      // 清理实例
      await this.cleanupWorkflowInstance(instanceId);

      // 更新统计信息
      this.updateStatistics(true, Date.now() - startTime);

      console.log(`✅ 工作流执行完成: ${name}`);
      this.emit('workflowCompleted', { name, result, executionTime: Date.now() - startTime });

      return result;

    } catch (error) {
      // 更新统计信息
      this.updateStatistics(false, Date.now() - startTime);

      console.error(`❌ 工作流执行失败: ${name}`, error);
      this.emit('workflowFailed', { name, error, executionTime: Date.now() - startTime });

      throw error;
    }
  }

  /**
   * 批量执行工作流
   */
  async executeBatch(workflowConfigs, options = {}) {
    const batchId = `batch-${Date.now()}`;
    const results = [];

    try {
      console.log(`🔄 开始批量执行工作流: ${batchId}`);

      const batchOptions = {
        delayBetweenWorkflows: options.delayBetweenWorkflows || 1000,
        continueOnError: options.continueOnError || false,
        ...options
      };

      for (let i = 0; i < workflowConfigs.length; i++) {
        const config = workflowConfigs[i];

        try {
          console.log(`📋 执行工作流 ${i + 1}/${workflowConfigs.length}: ${config.name}`);

          const result = await this.executeWorkflow(config.name, {
            ...batchOptions,
            ...config.options
          });

          results.push({
            workflowName: config.name,
            success: true,
            result,
            executionTime: result.executionTime || 0,
            timestamp: new Date().toISOString()
          });

          // 工作流间隔
          if (i < workflowConfigs.length - 1 && batchOptions.delayBetweenWorkflows > 0) {
            await new Promise(resolve => setTimeout(resolve, batchOptions.delayBetweenWorkflows));
          }

        } catch (error) {
          console.error(`❌ 工作流执行失败: ${config.name}`, error);

          results.push({
            workflowName: config.name,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });

          if (!batchOptions.continueOnError) {
            break;
          }
        }
      }

      // 保存批量报告
      await this.saveBatchReport(batchId, results);

      console.log(`✅ 批量执行完成: ${batchId}`);
      this.emit('batchCompleted', { batchId, results });

      return results;

    } catch (error) {
      console.error(`❌ 批量执行失败: ${batchId}`, error);
      this.emit('batchFailed', { batchId, error });
      throw error;
    }
  }

  /**
   * 创建复合工作流
   */
  async createCompositeWorkflow(name, workflowDefinitions) {
    const compositeWorkflow = {
      name,
      workflows: workflowDefinitions,
      createdAt: new Date().toISOString()
    };

    // 注册复合工作流
    this.workflows.set(`composite-${name}`, {
      class: CompositeWorkflow,
      config: compositeWorkflow,
      metadata: {
        registeredAt: new Date().toISOString(),
        type: 'composite',
        workflows: workflowDefinitions.map(w => w.name || w)
      }
    });

    console.log(`✅ 复合工作流已创建: ${name}`);
    return compositeWorkflow;
  }

  /**
   * 执行复合工作流
   */
  async executeCompositeWorkflow(name, options = {}) {
    const workflowDef = this.workflows.get(`composite-${name}`);
    if (!workflowDef) {
      throw new Error(`复合工作流未找到: ${name}`);
    }

    const compositeWorkflow = workflowDef.config;
    const results = [];

    try {
      console.log(`🔧 开始执行复合工作流: ${name}`);

      for (const workflowDef of compositeWorkflow.workflows) {
        const workflowName = typeof workflowDef === 'string' ? workflowDef : workflowDef.name;
        const workflowOptions = typeof workflowDef === 'object' ? workflowDef.options || {} : {};

        try {
          const result = await this.executeWorkflow(workflowName, {
            ...options,
            ...workflowOptions
          });

          results.push({
            workflowName,
            success: true,
            result
          });

        } catch (error) {
          results.push({
            workflowName,
            success: false,
            error: error.message
          });

          if (options.stopOnError !== false) {
            throw error;
          }
        }
      }

      console.log(`✅ 复合工作流执行完成: ${name}`);
      return results;

    } catch (error) {
      console.error(`❌ 复合工作流执行失败: ${name}`, error);
      throw error;
    }
  }

  /**
   * 清理工作流实例
   */
  async cleanupWorkflowInstance(instanceId) {
    const instanceInfo = this.workflowInstances.get(instanceId);
    if (instanceInfo) {
      try {
        await instanceInfo.instance.cleanup();
        this.workflowInstances.delete(instanceId);
        this.runningWorkflows.delete(instanceId);
      } catch (error) {
        console.warn(`⚠️ 工作流实例清理失败: ${instanceId}`, error.message);
      }
    }
  }

  /**
   * 保存工作流报告
   */
  async saveWorkflowReport(workflow, name) {
    try {
      const reportPath = await workflow.saveReport();
      console.log(`📊 工作流报告已保存: ${reportPath}`);
    } catch (error) {
      console.warn(`⚠️ 工作流报告保存失败: ${name}`, error.message);
    }
  }

  /**
   * 保存批量报告
   */
  async saveBatchReport(batchId, results) {
    try {
      const report = {
        batchId,
        timestamp: new Date().toISOString(),
        summary: {
          totalWorkflows: results.length,
          successfulWorkflows: results.filter(r => r.success).length,
          failedWorkflows: results.filter(r => !r.success).length,
          successRate: `${(results.filter(r => r.success).length / results.length * 100).toFixed(2)}%`
        },
        results
      };

      const reportPath = path.join(this.options.reportsDirectory, 'batch', `${batchId}.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

      console.log(`📊 批量报告已保存: ${reportPath}`);

    } catch (error) {
      console.warn(`⚠️ 批量报告保存失败: ${batchId}`, error.message);
    }
  }

  /**
   * 更新统计信息
   */
  updateStatistics(success, executionTime) {
    if (success) {
      this.stats.completedWorkflows++;
    } else {
      this.stats.failedWorkflows++;
    }

    this.stats.totalExecutionTime += executionTime;
    this.stats.averageExecutionTime =
      (this.stats.totalExecutionTime / (this.stats.completedWorkflows + this.stats.failedWorkflows));
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.totalWorkflows > 0 ?
        (this.stats.completedWorkflows / this.stats.totalWorkflows * 100).toFixed(2) + '%' : '0%',
      runningWorkflows: this.runningWorkflows.size,
      registeredWorkflows: this.workflows.size
    };
  }

  /**
   * 获取运行中的工作流
   */
  getRunningWorkflows() {
    return Array.from(this.runningWorkflows.entries()).map(([id, info]) => ({
      id,
      name: info.name,
      startTime: info.startTime,
      executionTime: Date.now() - info.startTime
    }));
  }

  /**
   * 停止工作流
   */
  async stopWorkflow(instanceId) {
    const instanceInfo = this.runningWorkflows.get(instanceId);
    if (instanceInfo) {
      try {
        await instanceInfo.instance.cleanup();
        this.runningWorkflows.delete(instanceId);
        console.log(`🛑 工作流已停止: ${instanceId}`);
      } catch (error) {
        console.error(`❌ 停止工作流失败: ${instanceId}`, error);
        throw error;
      }
    } else {
      throw new Error(`运行中的工作流未找到: ${instanceId}`);
    }
  }

  /**
   * 停止所有工作流
   */
  async stopAllWorkflows() {
    const runningIds = Array.from(this.runningWorkflows.keys());

    for (const id of runningIds) {
      try {
        await this.stopWorkflow(id);
      } catch (error) {
        console.error(`❌ 停止工作流失败: ${id}`, error);
      }
    }
  }

  /**
   * 销毁编排器
   */
  async destroy() {
    try {
      console.log('🧹 销毁工作流编排器...');

      // 停止所有工作流
      await this.stopAllWorkflows();

      // 清理所有实例
      for (const [id, _] of this.workflowInstances) {
        await this.cleanupWorkflowInstance(id);
      }

      // 清理注册表
      this.workflows.clear();
      this.workflowInstances.clear();
      this.runningWorkflows.clear();

      console.log('✅ 工作流编排器已销毁');

    } catch (error) {
      console.error('❌ 销毁工作流编排器失败:', error);
      throw error;
    }
  }
}

/**
 * 复合工作流类
 */
class CompositeWorkflow {
  constructor(config) {
    this.config = config;
    this.workflows = config.workflows || [];
  }

  async initialize(context) {
    // 复合工作流的初始化逻辑
  }

  async execute(options) {
    // 复合工作流的执行逻辑
    const results = [];

    for (const workflowDef of this.workflows) {
      // 这里需要调用 orchestrator 来执行具体的工作流
      // 实际实现会在 orchestrateCompositeWorkflow 中处理
      results.push({ workflow: workflowDef, status: 'pending' });
    }

    return results;
  }

  async cleanup() {
    // 复合工作流的清理逻辑
  }
}

module.exports = WorkflowOrchestrator;