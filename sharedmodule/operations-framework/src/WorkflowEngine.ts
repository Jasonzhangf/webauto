/**
 * Workflow编排引擎
 * 基于操作子的工作流编排和执行系统
 */

import {
  OperationContext,
  OperationResult,
  OperationConfig,
  Workflow,
  WorkflowStep,
  WorkflowTemplate,
  WorkflowInstance,
  WorkflowEngineConfig,
  WorkflowEngineMetrics,
  ExecutionContext,
  ExecutionContextState,
  IBaseOperation
} from './types';

/**
 * Workflow编排引擎 - 基于操作子的工作流编排和执行系统
 */
export class WorkflowEngine {
  public config: WorkflowEngineConfig;
  public logger: {
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
    debug: (message: string, data?: any) => void;
  };
  public metrics: WorkflowEngineMetrics;
  public activeWorkflows: Map<string, WorkflowInstance>;
  public workflowTemplates: Map<string, WorkflowTemplate>;

  constructor(config: WorkflowEngineConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency || 3,
      defaultTimeout: config.defaultTimeout || 30000,
      enableLogging: config.enableLogging ?? true,
      enableMetrics: config.enableMetrics ?? true,
      errorHandling: config.errorHandling || 'stop',
      ...config
    };

    this.logger = this.createLogger();
    this.metrics = {
      workflowsStarted: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
      operationsExecuted: 0,
      averageExecutionTime: 0,
      executionTimes: []
    };
    this.activeWorkflows = new Map();
    this.workflowTemplates = new Map();
  }

  /**
   * 创建日志记录器
   */
  private createLogger() {
    return {
      info: (message: string, data: any = {}) => this.config.enableLogging && console.log(`[WorkflowEngine] INFO: ${message}`, data),
      warn: (message: string, data: any = {}) => this.config.enableLogging && console.warn(`[WorkflowEngine] WARN: ${message}`, data),
      error: (message: string, data: any = {}) => this.config.enableLogging && console.error(`[WorkflowEngine] ERROR: ${message}`, data),
      debug: (message: string, data: any = {}) => this.config.enableLogging && console.debug(`[WorkflowEngine] DEBUG: ${message}`, data)
    };
  }

  /**
   * 注册工作流模板
   */
  registerTemplate(name: string, workflow: Workflow): void {
    this.workflowTemplates.set(name, {
      name,
      workflow,
      registeredAt: Date.now()
    });
    this.logger.info('Workflow template registered', { name });
  }

  /**
   * 获取工作流模板
   */
  getTemplate(name: string): Workflow {
    const template = this.workflowTemplates.get(name);
    if (!template) {
      throw new Error(`Workflow template '${name}' not found`);
    }
    return template.workflow;
  }

  /**
   * 创建工作流执行实例
   */
  createWorkflow(workflow: Workflow, initialState: OperationConfig = {}): WorkflowInstance {
    const workflowId = this.generateWorkflowId();

    // 创建执行上下文 - 解决浏览器实例、页面和操作实例传递问题
    const executionContext = new ExecutionContext({
      execution: {
        workflowId,
        initialState
      },
      config: {
        reuseBrowser: true,
        reusePage: true,
        parallelExecution: this.config.maxConcurrency > 1,
        cleanupOnComplete: true,
        debugMode: this.config.enableLogging
      }
    });

    const workflowInstance: WorkflowInstance = {
      id: workflowId,
      workflow,
      executionContext, // 使用新的执行上下文
      status: 'created',
      startTime: null,
      endTime: null,
      error: null,
      results: [],
      currentStep: 0
    };

    this.activeWorkflows.set(workflowId, workflowInstance);
    this.logger.info('Workflow instance created', {
      workflowId,
      name: workflow.name,
      executionId: executionContext.state.execution.id
    });

    return workflowInstance;
  }

  /**
   * 执行工作流
   */
  async execute(workflow: Workflow | WorkflowStep[], context: OperationConfig = {}): Promise<{
    success: boolean;
    workflowId: string;
    result?: any;
    error?: string;
    context: ExecutionContextState;
    summary: any;
    metadata: {
      startTime: number | null;
      endTime: number | null;
      duration: number;
      stepsExecuted: number;
    };
  }> {
    const startTime = Date.now();
    this.metrics.workflowsStarted++;

    // 创建工作流实例
    const workflowInstance = Array.isArray(workflow)
      ? this.createWorkflow({ name: 'adhoc', steps: workflow }, context)
      : this.createWorkflow(workflow, context);

    workflowInstance.status = 'running';
    workflowInstance.startTime = startTime;

    this.logger.info('Workflow execution started', {
      workflowId: workflowInstance.id,
      name: workflowInstance.workflow.name
    });

    try {
      // 执行工作流步骤
      const result = await this.executeSteps(workflowInstance);

      workflowInstance.status = 'completed';
      workflowInstance.endTime = Date.now();
      this.metrics.workflowsCompleted++;

      this.logger.info('Workflow execution completed', {
        workflowId: workflowInstance.id,
        duration: workflowInstance.endTime - workflowInstance.startTime
      });

      // 更新指标
      this.updateMetrics(workflowInstance);

      return {
        success: true,
        workflowId: workflowInstance.id,
        result,
        context: workflowInstance.executionContext.state,
        summary: workflowInstance.executionContext.getSummary(),
        metadata: {
          startTime: workflowInstance.startTime,
          endTime: workflowInstance.endTime,
          duration: (workflowInstance.endTime || 0) - (workflowInstance.startTime || 0),
          stepsExecuted: workflowInstance.results.length
        }
      };
    } catch (error: any) {
      workflowInstance.status = 'failed';
      workflowInstance.error = error;
      workflowInstance.endTime = Date.now();
      this.metrics.workflowsFailed++;

      this.logger.error('Workflow execution failed', {
        workflowId: workflowInstance.id,
        error: error.message
      });

      return {
        success: false,
        workflowId: workflowInstance.id,
        error: error.message,
        context: workflowInstance.executionContext.state,
        summary: workflowInstance.executionContext.getSummary(),
        metadata: {
          startTime: workflowInstance.startTime,
          endTime: workflowInstance.endTime,
          duration: (workflowInstance.endTime || 0) - (workflowInstance.startTime || 0),
          stepsExecuted: workflowInstance.results.length
        }
      };
    } finally {
      // 从活动工作流中移除
      this.activeWorkflows.delete(workflowInstance.id);
    }
  }

  /**
   * 执行工作流步骤
   */
  private async executeSteps(workflowInstance: WorkflowInstance): Promise<any[]> {
    const { workflow, executionContext: context } = workflowInstance;
    const steps = workflow.steps || [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      workflowInstance.currentStep = i;

      try {
        this.logger.debug('Executing workflow step', {
          workflowId: workflowInstance.id,
          stepIndex: i,
          stepName: step.name || `step_${i}`
        });

        const stepResult = await this.executeStep(workflowInstance, step, i);
        workflowInstance.results.push(stepResult);

        // 将步骤结果添加到上下文
        context.updateState(`step_${i}_result`, stepResult);
        context.updateState('last_step_result', stepResult);

        // 如果有条件分支，检查是否应该继续
        if (step.condition && !this.evaluateCondition(step.condition, context.state)) {
          this.logger.info('Workflow step condition not met, stopping execution', {
            workflowId: workflowInstance.id,
            stepIndex: i
          });
          break;
        }

      } catch (error: any) {
        this.logger.error('Workflow step execution failed', {
          workflowId: workflowInstance.id,
          stepIndex: i,
          error: error.message
        });

        // 根据错误处理策略决定是否继续
        if (this.config.errorHandling === 'stop') {
          throw error;
        } else if (this.config.errorHandling === 'continue') {
          workflowInstance.results.push({
            success: false,
            error: error.message,
            stepIndex: i
          });
        } else if (this.config.errorHandling === 'retry') {
          const retryResult = await this.retryStep(workflowInstance, step, i, error);
          workflowInstance.results.push(retryResult);
          if (!retryResult.success) {
            throw error;
          }
        }
      }
    }

    return workflowInstance.results;
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(workflowInstance: WorkflowInstance, step: WorkflowStep, stepIndex: number): Promise<{
    success: boolean;
    stepIndex: number;
    stepName: string;
    operation: string;
    result: any;
    duration: number;
    timestamp: number;
    executionContextId: string;
  }> {
    const stepStartTime = Date.now();
    const executionContext = workflowInstance.executionContext;

    try {
      // 解析操作子引用
      const operationInfo = this.parseOperationReference(step.operation);

      // 动态导入全局注册表以避免循环依赖
      const { globalRegistry } = await import('./OperationRegistry');
      const operationInstance = globalRegistry.createInstance(operationInfo.name, operationInfo.config);

      // 注册操作实例到执行上下文
      const operationId = executionContext.registerOperation(
        `step_${stepIndex}_${operationInfo.name}`,
        operationInstance,
        { stepIndex, stepName: step.name }
      );

      // 准备步骤参数，包含执行上下文引用
      const stepParams = {
        ...this.prepareStepParameters(step, executionContext.state),
        executionContext, // 传递执行上下文给操作子
        operationId,
        stepIndex
      };

      // 设置超时
      const timeout = step.timeout || this.config.defaultTimeout;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Step ${stepIndex} timeout after ${timeout}ms`)), timeout);
      });

      // 执行操作子 - 现在操作子可以访问执行上下文中的浏览器实例、页面等
      const operationPromise = operationInstance.execute(executionContext, stepParams);

      const result = await Promise.race([operationPromise, timeoutPromise]);

      const stepEndTime = Date.now();
      this.metrics.operationsExecuted++;

      // 完成操作注册
      executionContext.completeOperation(operationId, result);

      return {
        success: true,
        stepIndex,
        stepName: step.name || `step_${stepIndex}`,
        operation: operationInfo.name,
        result,
        duration: stepEndTime - stepStartTime,
        timestamp: stepEndTime,
        executionContextId: executionContext.state.execution.id
      };

    } catch (error: any) {
      const stepEndTime = Date.now();

      // 标记操作失败
      if (workflowInstance.executionContext.state.operations.active.has(`step_${stepIndex}`)) {
        workflowInstance.executionContext.failOperation(`step_${stepIndex}`, error);
      }

      this.logger.error('Step execution failed', {
        workflowId: workflowInstance.id,
        stepIndex,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * 解析操作子引用
   */
  private parseOperationReference(operationRef: string | { name?: string; operation?: string; config?: OperationConfig; params?: OperationConfig }): {
    name: string;
    config: OperationConfig;
  } {
    if (typeof operationRef === 'string') {
      return { name: operationRef, config: {} };
    } else if (typeof operationRef === 'object') {
      return {
        name: operationRef.name || operationRef.operation || '',
        config: operationRef.config || operationRef.params || {}
      };
    } else {
      throw new Error(`Invalid operation reference: ${JSON.stringify(operationRef)}`);
    }
  }

  /**
   * 准备步骤参数
   */
  private prepareStepParameters(step: WorkflowStep, context: ExecutionContextState): OperationConfig {
    const params: OperationConfig = { ...step.params };

    // 支持参数模板，从上下文中获取值
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const contextPath = value.slice(2, -1);
        params[key] = this.getContextValue(context.state, contextPath);
      }
    }

    return params;
  }

  /**
   * 从上下文中获取值
   */
  private getContextValue(context: any, path: string): any {
    const parts = path.split('.');
    let current = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: string | Function | any, context: any): boolean {
    try {
      // 简单的条件评估
      if (typeof condition === 'string') {
        // 支持简单的条件表达式
        const conditionValue = this.getContextValue(context, condition);
        return !!conditionValue;
      } else if (typeof condition === 'function') {
        return condition(context);
      } else if (typeof condition === 'object') {
        // 支持对象条件 { path: 'value', operator: 'equals', value: expected }
        const { path, operator = 'equals', value } = condition;
        const contextValue = this.getContextValue(context, path);

        switch (operator) {
          case 'equals': return contextValue === value;
          case 'not_equals': return contextValue !== value;
          case 'greater_than': return contextValue > value;
          case 'less_than': return contextValue < value;
          case 'exists': return contextValue !== undefined;
          case 'not_exists': return contextValue === undefined;
          default: return false;
        }
      }

      return false;
    } catch (error: any) {
      this.logger.warn('Condition evaluation failed', { condition, error: error.message });
      return false;
    }
  }

  /**
   * 重试步骤
   */
  private async retryStep(workflowInstance: WorkflowInstance, step: WorkflowStep, stepIndex: number, error: any): Promise<{
    success: boolean;
    stepIndex: number;
    error?: string;
    attempts?: number;
  }> {
    const maxRetries = step.maxRetries || 3;
    const retryDelay = step.retryDelay || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.info(`Retrying workflow step (attempt ${attempt}/${maxRetries})`, {
        workflowId: workflowInstance.id,
        stepIndex
      });

      try {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return await this.executeStep(workflowInstance, step, stepIndex);
      } catch (retryError: any) {
        if (attempt === maxRetries) {
          this.logger.error('Step retry attempts exhausted', {
            workflowId: workflowInstance.id,
            stepIndex,
            attempts: maxRetries
          });
          return {
            success: false,
            stepIndex,
            error: retryError.message,
            attempts: maxRetries
          };
        }
      }
    }

    // This should never be reached due to the loop logic
    return {
      success: false,
      stepIndex,
      error: 'Retry logic failed',
      attempts: maxRetries
    };
  }

  /**
   * 并发执行多个工作流
   */
  async executeWorkflows(workflows: (Workflow | WorkflowStep[])[], maxConcurrency: number | null = null): Promise<any[]> {
    const concurrency = maxConcurrency || this.config.maxConcurrency;
    const results: any[] = [];

    for (let i = 0; i < workflows.length; i += concurrency) {
      const batch = workflows.slice(i, i + concurrency);
      const batchPromises = batch.map(workflow =>
        this.execute(workflow).catch((error: any) => ({
          success: false,
          error: error.message,
          workflow: typeof workflow === 'object' && 'name' in workflow ? workflow.name : 'unknown'
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 批次间延迟
      if (i + concurrency < workflows.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * 获取活动工作流状态
   */
  getActiveWorkflows(): Array<{
    id: string;
    name: string;
    status: string;
    startTime: number | null;
    currentStep: number;
    progress: number;
  }> {
    return Array.from(this.activeWorkflows.values()).map(workflow => ({
      id: workflow.id,
      name: workflow.workflow.name,
      status: workflow.status,
      startTime: workflow.startTime,
      currentStep: workflow.currentStep,
      progress: workflow.results.length / (workflow.workflow.steps?.length || 1)
    }));
  }

  /**
   * 获取引擎指标
   */
  getMetrics(): WorkflowEngineMetrics {
    return {
      ...this.metrics,
      averageExecutionTime: this.calculateAverageExecutionTime(),
      activeWorkflows: this.activeWorkflows.size,
      registeredTemplates: this.workflowTemplates.size,
      timestamp: Date.now()
    };
  }

  /**
   * 计算平均执行时间
   */
  private calculateAverageExecutionTime(): number {
    if (this.metrics.executionTimes.length === 0) {
      return 0;
    }
    const sum = this.metrics.executionTimes.reduce((a, b) => a + b, 0);
    return sum / this.metrics.executionTimes.length;
  }

  /**
   * 更新指标
   */
  private updateMetrics(workflowInstance: WorkflowInstance): void {
    if (this.config.enableMetrics) {
      const executionTime = (workflowInstance.endTime || 0) - (workflowInstance.startTime || 0);
      this.metrics.executionTimes.push(executionTime);

      // 保持最近100次执行记录
      if (this.metrics.executionTimes.length > 100) {
        this.metrics.executionTimes = this.metrics.executionTimes.slice(-100);
      }
    }
  }

  /**
   * 生成工作流ID
   */
  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 停止工作流
   */
  stopWorkflow(workflowId: string): boolean {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.status = 'stopped';
      this.activeWorkflows.delete(workflowId);
      this.logger.info('Workflow stopped', { workflowId });
      return true;
    }
    return false;
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 停止所有活动工作流
    for (const [workflowId] of this.activeWorkflows) {
      this.stopWorkflow(workflowId);
    }

    // 清理模板
    this.workflowTemplates.clear();

    // 重置指标
    this.metrics = {
      workflowsStarted: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
      operationsExecuted: 0,
      averageExecutionTime: 0,
      executionTimes: []
    };

    this.logger.info('Workflow engine cleaned up');
  }
}

export default WorkflowEngine;