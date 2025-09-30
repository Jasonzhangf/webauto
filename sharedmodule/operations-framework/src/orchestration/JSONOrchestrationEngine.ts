import { EventBus } from '../events/EventBus';
import { BaseAtomicOperation } from '../core/BaseAtomicOperation';
import { ContainerDiscoveryOperation } from '../atomic-operations/ContainerDiscoveryOperation';
import { EventDrivenScrollOperation } from '../atomic-operations/EventDrivenScrollOperation';

/**
 * JSON编排引擎
 * 解析和执行JSON配置的原子操作工作流
 */
export class JSONOrchestrationEngine {
  private eventBus: EventBus;
  private operationRegistry: Map<string, typeof BaseAtomicOperation>;
  private activeOperations: Map<string, BaseAtomicOperation>;
  private workflowState: any;
  private executionHistory: any[];
  private context: any;

  constructor(config = {}) {
    this.eventBus = new EventBus();
    this.operationRegistry = new Map();
    this.activeOperations = new Map();
    this.executionHistory = [];
    this.workflowState = {
      status: 'initialized',
      currentStage: null,
      startTime: null,
      endTime: null,
      variables: {},
      errors: []
    };

    this.initializeOperationRegistry();
    this.setupEventListeners();
  }

  /**
   * 初始化操作注册表
   */
  private initializeOperationRegistry() {
    // 注册内置原子操作
    this.operationRegistry.set('ContainerDiscoveryOperation', ContainerDiscoveryOperation);
    this.operationRegistry.set('EventDrivenScrollOperation', EventDrivenScrollOperation);

    // TODO: 注册更多原子操作类型
    // this.operationRegistry.set('BrowserInitOperation', BrowserInitOperation);
    // this.operationRegistry.set('CookieLoadOperation', CookieLoadOperation);
    // this.operationRegistry.set('NavigationOperation', NavigationOperation);
    // this.operationRegistry.set('LinkExtractionOperation', LinkExtractionOperation);
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    this.eventBus.on('operation-started', this.handleOperationStarted.bind(this));
    this.eventBus.on('operation-completed', this.handleOperationCompleted.bind(this));
    this.eventBus.on('operation-failed', this.handleOperationFailed.bind(this));
    this.eventBus.on('workflow-stage-completed', this.handleStageCompleted.bind(this));
    this.eventBus.on('workflow-completed', this.handleWorkflowCompleted.bind(this));
    this.eventBus.on('workflow-failed', this.handleWorkflowFailed.bind(this));
  }

  /**
   * 加载JSON编排配置
   */
  async loadOrchestration(orchestrationPath: string): Promise<any> {
    try {
      // 这里应该从文件系统加载JSON配置
      // 为了演示，我们直接使用配置对象
      const orchestrationConfig = {
        name: "Weibo Post Link Capture JSON Orchestration",
        atomicOperations: [],
        workflow: {
          stages: []
        }
      };

      this.validateOrchestrationConfig(orchestrationConfig);
      return orchestrationConfig;

    } catch (error) {
      throw new Error(`加载编排配置失败: ${error.message}`);
    }
  }

  /**
   * 验证编排配置
   */
  private validateOrchestrationConfig(config: any) {
    if (!config.name) {
      throw new Error('编排配置缺少名称');
    }

    if (!config.atomicOperations || !Array.isArray(config.atomicOperations)) {
      throw new Error('编排配置缺少原子操作定义');
    }

    if (!config.workflow || !config.workflow.stages) {
      throw new Error('编排配置缺少工作流定义');
    }

    // 验证每个原子操作
    config.atomicOperations.forEach((op: any) => {
      if (!op.id || !op.type) {
        throw new Error(`原子操作缺少必需字段: id 或 type`);
      }
    });

    // 验证工作流阶段
    config.workflow.stages.forEach((stage: any) => {
      if (!stage.id || !stage.operations) {
        throw new Error(`工作流阶段缺少必需字段: id 或 operations`);
      }
    });
  }

  /**
   * 执行编排
   */
  async execute(orchestrationConfig: any, context: any = {}) {
    console.log(`🚀 开始执行编排: ${orchestrationConfig.name}`);

    this.context = context;
    this.workflowState = {
      status: 'running',
      currentStage: null,
      startTime: Date.now(),
      endTime: null,
      variables: {},
      errors: []
    };

    try {
      // 执行工作流阶段
      for (const stage of orchestrationConfig.workflow.stages) {
        await this.executeStage(stage, orchestrationConfig.atomicOperations);
      }

      // 工作流完成
      this.workflowState.status = 'completed';
      this.workflowState.endTime = Date.now();
      await this.eventBus.emit('workflow-completed', this.workflowState);

      return {
        success: true,
        workflowState: this.workflowState,
        executionHistory: this.executionHistory,
        results: this.workflowState.variables
      };

    } catch (error) {
      // 工作流失败
      this.workflowState.status = 'failed';
      this.workflowState.endTime = Date.now();
      this.workflowState.errors.push(error.message);
      await this.eventBus.emit('workflow-failed', this.workflowState);

      return {
        success: false,
        error: error.message,
        workflowState: this.workflowState,
        executionHistory: this.executionHistory
      };
    }
  }

  /**
   * 执行工作流阶段
   */
  private async executeStage(stage: any, atomicOperations: any[]) {
    console.log(`📋 执行阶段: ${stage.name}`);

    this.workflowState.currentStage = stage.id;
    const stageStartTime = Date.now();

    try {
      const stageResults: any[] = [];

      // 执行阶段中的原子操作
      for (const operationId of stage.operations) {
        const operationConfig = atomicOperations.find(op => op.id === operationId);
        if (!operationConfig) {
          throw new Error(`未找到原子操作: ${operationId}`);
        }

        const result = await this.executeAtomicOperation(operationConfig);
        stageResults.push(result);
      }

      // 阶段完成
      const stageEndTime = Date.now();
      await this.eventBus.emit('workflow-stage-completed', {
        stageId: stage.id,
        stageName: stage.name,
        executionTime: stageEndTime - stageStartTime,
        results: stageResults
      });

      // 保存阶段结果到工作流状态
      this.workflowState.variables[stage.id] = stageResults;

    } catch (error) {
      console.error(`❌ 阶段执行失败: ${stage.name}`, error.message);
      throw error;
    }
  }

  /**
   * 执行原子操作
   */
  private async executeAtomicOperation(operationConfig: any) {
    const OperationClass = this.operationRegistry.get(operationConfig.type);
    if (!OperationClass) {
      throw new Error(`未知的原子操作类型: ${operationConfig.type}`);
    }

    console.log(`⚡ 执行原子操作: ${operationConfig.name}`);

    const operation = new OperationClass(operationConfig.config);
    const operationId = operationConfig.id;

    // 记录操作开始
    this.activeOperations.set(operationId, operation);
    await this.eventBus.emit('operation-started', {
      operationId,
      operationName: operationConfig.name,
      config: operationConfig.config
    });

    const startTime = Date.now();

    try {
      // 执行原子操作
      const result = await operation.executeWithRetry(this.context, operationConfig.config);

      const executionTime = Date.now() - startTime;
      const executionRecord = {
        operationId,
        operationName: operationConfig.name,
        startTime,
        executionTime,
        result,
        success: true
      };

      this.executionHistory.push(executionRecord);

      // 记录操作完成
      await this.eventBus.emit('operation-completed', executionRecord);
      this.activeOperations.delete(operationId);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const executionRecord = {
        operationId,
        operationName: operationConfig.name,
        startTime,
        executionTime,
        error: error.message,
        success: false
      };

      this.executionHistory.push(executionRecord);

      // 记录操作失败
      await this.eventBus.emit('operation-failed', executionRecord);
      this.activeOperations.delete(operationId);

      throw error;
    }
  }

  /**
   * 处理操作开始事件
   */
  private async handleOperationStarted(data: any) {
    console.log(`🔵 操作开始: ${data.operationName}`);
  }

  /**
   * 处理操作完成事件
   */
  private async handleOperationCompleted(data: any) {
    console.log(`🟢 操作完成: ${data.operationName} (${data.executionTime}ms)`);
  }

  /**
   * 处理操作失败事件
   */
  private async handleOperationFailed(data: any) {
    console.error(`🔴 操作失败: ${data.operationName} - ${data.error}`);
  }

  /**
   * 处理阶段完成事件
   */
  private async handleStageCompleted(data: any) {
    console.log(`✅ 阶段完成: ${data.stageName} (${data.executionTime}ms)`);
  }

  /**
   * 处理工作流完成事件
   */
  private async handleWorkflowCompleted(workflowState: any) {
    const totalTime = workflowState.endTime - workflowState.startTime;
    console.log(`🎉 工作流完成! 总耗时: ${totalTime}ms`);
    console.log(`📊 执行统计:`);
    console.log(`  - 总操作数: ${this.executionHistory.length}`);
    console.log(`  - 成功操作: ${this.executionHistory.filter(r => r.success).length}`);
    console.log(`  - 失败操作: ${this.executionHistory.filter(r => !r.success).length}`);
  }

  /**
   * 处理工作流失败事件
   */
  private async handleWorkflowFailed(workflowState: any) {
    const totalTime = workflowState.endTime - workflowState.startTime;
    console.error(`💥 工作流失败! 总耗时: ${totalTime}ms`);
    console.error(`❌ 错误信息: ${workflowState.errors.join(', ')}`);
  }

  /**
   * 获取工作流状态
   */
  getWorkflowState() {
    return { ...this.workflowState };
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory() {
    return [...this.executionHistory];
  }

  /**
   * 获取活动操作
   */
  getActiveOperations() {
    return new Map(this.activeOperations);
  }

  /**
   * 暂停工作流
   */
  async pause() {
    if (this.workflowState.status === 'running') {
      this.workflowState.status = 'paused';
      console.log('⏸️ 工作流已暂停');
    }
  }

  /**
   * 恢复工作流
   */
  async resume() {
    if (this.workflowState.status === 'paused') {
      this.workflowState.status = 'running';
      console.log('▶️ 工作流已恢复');
    }
  }

  /**
   * 停止工作流
   */
  async stop() {
    this.workflowState.status = 'stopped';
    this.workflowState.endTime = Date.now();

    // 停止所有活动操作
    for (const [operationId, operation] of this.activeOperations) {
      try {
        if (typeof (operation as any).cleanup === 'function') {
          await (operation as any).cleanup();
        }
      } catch (error) {
        console.warn(`清理操作 ${operationId} 时出错:`, error);
      }
    }

    this.activeOperations.clear();
    console.log('⏹️ 工作流已停止');
  }

  /**
   * 注册自定义原子操作
   */
  registerOperation(type: string, operationClass: typeof BaseAtomicOperation) {
    this.operationRegistry.set(type, operationClass);
    console.log(`已注册原子操作: ${type}`);
  }

  /**
   * 获取操作注册表
   */
  getOperationRegistry() {
    return new Map(this.operationRegistry);
  }
}