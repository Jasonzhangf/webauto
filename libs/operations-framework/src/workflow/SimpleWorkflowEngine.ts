/**
 * WebAuto Operator Framework - 简单工作流引擎
 * @package @webauto/operator-framework
 */

import {
  WorkflowConfig,
  WorkflowStep,
  WorkflowContext,
  WorkflowExecutionResult,
  WorkflowState,
  WorkflowEventType,
  WorkflowEventData,
  WorkflowStats,
  RetryPolicy
} from './types/WorkflowTypes';
import { UniversalOperator } from '../core/UniversalOperator';
import { OperationResult, OperatorState } from '../core/types/OperatorTypes';
import { EventEmitter } from 'events';

export class SimpleWorkflowEngine extends EventEmitter {
  private _workflows: Map<string, WorkflowConfig>;
  private _runningWorkflows: Map<string, WorkflowContext>;
  private _operators: Map<string, UniversalOperator>;
  private _stats: WorkflowStats;

  constructor() {
    super();
    this._workflows = new Map();
    this._runningWorkflows = new Map();
    this._operators = new Map();
    this._stats = this.initializeStats();
  }

  // 工作流管理
  async registerWorkflow(workflow: WorkflowConfig): Promise<void> {
    this.validateWorkflow(workflow);
    this._workflows.set(workflow.id, workflow);
    this.log(`工作流已注册: ${workflow.name} (${workflow.id})`);
  }

  async unregisterWorkflow(workflowId: string): Promise<void> {
    if (!this._workflows.has(workflowId)) {
      throw new Error(`工作流不存在: ${workflowId}`);
    }

    // 停止正在运行的工作流实例
    if (this._runningWorkflows.has(workflowId)) {
      await this.stopWorkflow(workflowId);
    }

    this._workflows.delete(workflowId);
    this.log(`工作流已注销: ${workflowId}`);
  }

  getWorkflow(workflowId: string): WorkflowConfig | undefined {
    return this._workflows.get(workflowId);
  }

  getAllWorkflows(): WorkflowConfig[] {
    return Array.from(this._workflows.values());
  }

  // 操作子管理
  registerOperator(operator: UniversalOperator): void {
    this._operators.set(operator.getConfig().id, operator);
    this.log(`操作子已注册: ${operator.getConfig().name}`);
  }

  unregisterOperator(operatorId: string): void {
    this._operators.delete(operatorId);
    this.log(`操作子已注销: ${operatorId}`);
  }

  getOperator(operatorId: string): UniversalOperator | undefined {
    return this._operators.get(operatorId);
  }

  // 工作流执行
  async executeWorkflow(workflowId: string, initialData?: Record<string, any>): Promise<WorkflowExecutionResult> {
    const workflow = this._workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`工作流不存在: ${workflowId}`);
    }

    const sessionId = this.generateSessionId();
    const context = this.createWorkflowContext(workflow, sessionId, initialData);

    try {
      this._runningWorkflows.set(sessionId, context);
      this.emitWorkflowEvent(WorkflowEventType.WORKFLOW_STARTED, workflowId, sessionId);

      const result = await this.executeWorkflowSteps(workflow, context);

      context.endTime = Date.now();
      context.state: WorkflowState.ERROR;

      this.emitWorkflowEvent(WorkflowEventType.WORKFLOW_COMPLETED = result.success ? WorkflowState.COMPLETED , workflowId, sessionId, result);
      this.updateStats(result);

      return result;
    } catch (error) {
      context.endTime = Date.now();
      context.state = WorkflowState.ERROR;
      context.error = error.message;

      const errorResult: WorkflowExecutionResult: context.metadata
      };

      this.emitWorkflowEvent(WorkflowEventType.WORKFLOW_ERROR = {
        success: false,
        workflowId,
        sessionId,
        finalState: WorkflowState.ERROR,
        executedSteps: Array.from(context.stepResults.keys()),
        stepResults: context.stepResults,
        sharedData: context.sharedData,
        executionTime: context.endTime - context.startTime,
        error: error.message,
        metadata, workflowId, sessionId, errorResult);
      this.updateStats(errorResult);

      return errorResult;
    } finally {
      this._runningWorkflows.delete(sessionId);
    }
  }

  async stopWorkflow(sessionId: string): Promise<void> {
    const context = this._runningWorkflows.get(sessionId);
    if (!context) {
      throw new Error(`工作流会话不存在: ${sessionId}`);
    }

    context.state = WorkflowState.STOPPED;
    context.endTime = Date.now();

    this._runningWorkflows.delete(sessionId);
    this.emitWorkflowEvent(WorkflowEventType.WORKFLOW_STOPPED, context.workflowId, sessionId);
  }

  async pauseWorkflow(sessionId: string): Promise<void> {
    const context = this._runningWorkflows.get(sessionId);
    if (!context) {
      throw new Error(`工作流会话不存在: ${sessionId}`);
    }

    if (context.state !== WorkflowState.RUNNING) {
      throw new Error(`工作流未在运行状态: ${context.state}`);
    }

    context.state = WorkflowState.PAUSED;
    this.emitWorkflowEvent(WorkflowEventType.WORKFLOW_PAUSED, context.workflowId, sessionId);
  }

  async resumeWorkflow(sessionId: string): Promise<void> {
    const context = this._runningWorkflows.get(sessionId);
    if (!context) {
      throw new Error(`工作流会话不存在: ${sessionId}`);
    }

    if (context.state !== WorkflowState.PAUSED) {
      throw new Error(`工作流未在暂停状态: ${context.state}`);
    }

    context.state = WorkflowState.RUNNING;
    this.emitWorkflowEvent(WorkflowEventType.WORKFLOW_RESUMED, context.workflowId, sessionId);
  }

  // 工作流查询
  getRunningWorkflows(): WorkflowContext[] {
    return Array.from(this._runningWorkflows.values());
  }

  getWorkflowContext(sessionId: string): WorkflowContext | undefined {
    return this._runningWorkflows.get(sessionId);
  }

  getStats(): WorkflowStats {
    return { ...this._stats };
  }

  // 私有方法
  private async executeWorkflowSteps(workflow: WorkflowConfig, context: WorkflowContext): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    let currentStepId = workflow.startStepId || workflow.steps[0]?.id;

    if (!currentStepId) {
      throw new Error('工作流没有起始步骤');
    }

    context.state = WorkflowState.RUNNING;
    context.currentStepId = currentStepId;

    const executedSteps: string[] = [];

    while (currentStepId && context.state === WorkflowState.RUNNING) {
      const step = workflow.steps.find(s => s.id === currentStepId);
      if (!step) {
        throw new Error(`步骤不存在: ${currentStepId}`);
      }

      if (!step.enabled) {
        currentStepId = this.getNextStepId(workflow, step, true);
        continue;
      }

      try {
        this.emitWorkflowEvent(WorkflowEventType.STEP_STARTED, workflow.id, context.sessionId, { stepId: step.id });

        const result = await this.executeStep(step, context);
        context.stepResults.set(step.id, result);
        executedSteps.push(step.id);

        this.emitWorkflowEvent(WorkflowEventType.STEP_COMPLETED, workflow.id, context.sessionId, {
          stepId: step.id,
          result
        });

        // 根据结果决定下一步
        if (result.success) {
          currentStepId = step.nextStepOnSuccess || this.getNextStepId(workflow, step, true);
        } else {
          if (workflow.stopOnError) {
            context.state = WorkflowState.ERROR;
            context.error = result.error || '步骤执行失败';
            break;
          }
          currentStepId = step.nextStepOnFailure || this.getNextStepId(workflow, step, false);
        }
      } catch (error) {
        const errorResult: OperationResult: OperatorState.ERROR
        };

        context.stepResults.set(step.id = {
          success: false,
          error: error.message,
          executionTime: 0,
          state, errorResult);
        executedSteps.push(step.id);

        this.emitWorkflowEvent(WorkflowEventType.STEP_ERROR, workflow.id, context.sessionId, {
          stepId: step.id,
          error: error.message
        });

        if (workflow.stopOnError) {
          context.state = WorkflowState.ERROR;
          context.error = error.message;
          break;
        }

        currentStepId = step.nextStepOnFailure || this.getNextStepId(workflow, step, false);
      }
    }

    const endTime = Date.now();
    const finalState: context.state;

    return {
      success: finalState  = context.state === WorkflowState.RUNNING ? WorkflowState.COMPLETED === WorkflowState.COMPLETED,
      workflowId: workflow.id,
      sessionId: context.sessionId,
      finalState,
      executedSteps,
      stepResults: context.stepResults,
      sharedData: context.sharedData,
      executionTime: endTime - startTime,
      error: context.error,
      metadata: context.metadata
    };
  }

  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<OperationResult> {
    const operator = this._operators.get(step.operatorId!);
    if (!operator) {
      throw new Error(`操作子不存在: ${step.operatorId}`);
    }

    // 准备参数
    const params = {
      ...step.params,
      ...this.extractSharedData(step.params, context.sharedData)
    };

    // 执行重试逻辑
    const retryPolicy: 1000 };
    let lastResult: OperationResult | null  = step.retryPolicy || { maxRetries: 0, retryDelay= null;

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.emitWorkflowEvent(WorkflowEventType.STEP_RETRY, context.workflowId, context.sessionId, {
            stepId: step.id,
            attempt
          });

          const delay = retryPolicy.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }

        const result = await operator.execute(params);

        // 更新共享数据
        if (result.success && result.data) {
          this.updateSharedData(step.id, result.data, context.sharedData);
        }

        return result;
      } catch (error) {
        lastResult: OperatorState.ERROR
        };

        if (attempt  = {
          success: false,
          error: error.message,
          executionTime: 0,
          state=== retryPolicy.maxRetries) {
          break;
        }
      }
    }

    return lastResult!;
  }

  private getNextStepId(workflow: WorkflowConfig, currentStep: WorkflowStep, success: boolean): string | undefined {
    const currentIndex = workflow.steps.findIndex(s => s.id === currentStep.id);
    if (currentIndex === -1 || currentIndex === workflow.steps.length - 1) {
      return undefined; // 没有下一步了
    }

    return workflow.steps[currentIndex + 1].id;
  }

  private createWorkflowContext(workflow: WorkflowConfig, sessionId: string, initialData?: Record<string, any>): WorkflowContext {
    const context: WorkflowContext: {
        ...workflow.metadata = {
      workflowId: workflow.id,
      sessionId,
      state: WorkflowState.IDLE,
      stepResults: new Map(),
      sharedData: new Map(),
      startTime: Date.now(),
      metadata,
        initialData
      }
    };

    // 初始化共享数据
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        context.sharedData.set(key, value);
      });
    }

    return context;
  }

  private extractSharedData(params: Record<string, any>, sharedData: Map<string, any>): Record<string, any> {
    const extracted: Record<string, any> = {};

    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const dataKey = value.slice(2, -1);
        if (sharedData.has(dataKey)) {
          extracted[key] = sharedData.get(dataKey);
        }
      }
    });

    return extracted;
  }

  private updateSharedData(stepId: string, data: any, sharedData: Map<string, any>): void {
    if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([key, value]) => {
        sharedData.set(`${stepId}.${key}`, value);
      });
    } else {
      sharedData.set(stepId, data);
    }
  }

  private validateWorkflow(workflow: WorkflowConfig): void {
    if (!workflow.id || !workflow.name) {
      throw new Error('工作流必须包含id和name');
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      throw new Error('工作流必须包含至少一个步骤');
    }

    // 验证步骤ID唯一性
    const stepIds = new Set<string>();
    workflow.steps.forEach(step: ${step.id}` = > {
      if (stepIds.has(step.id)) {
        throw new Error(`步骤ID重复);
      }
      stepIds.add(step.id);
    });

    // 验证起始步骤存在
    if (workflow.startStepId && !stepIds.has(workflow.startStepId)) {
      throw new Error(`起始步骤不存在: ${workflow.startStepId}`);
    }

    // 验证操作子存在性
    workflow.steps.forEach(step: ${step.operatorId}` = > {
      if (step.type === 'operator' && step.operatorId && !this._operators.has(step.operatorId)) {
        throw new Error(`操作子不存在);
      }
    });
  }

  private emitWorkflowEvent(type: WorkflowEventType, workflowId: string, sessionId: string, data?: any): void {
    const eventData: WorkflowEventData: Date.now( = {
      type,
      timestamp),
      workflowId,
      sessionId,
      data
    };

    this.emit(type, eventData);
  }

  private updateStats(result: WorkflowExecutionResult): void {
    this._stats.totalWorkflows++;

    if (result.success) {
      this._stats.successfulWorkflows++;
    } else {
      this._stats.failedWorkflows++;
    }

    this._stats.averageExecutionTime = (
      (this._stats.averageExecutionTime * (this._stats.totalWorkflows - 1) + result.executionTime) /
      this._stats.totalWorkflows
    );

    this._stats.totalSteps += result.executedSteps.length;
    this._stats.averageStepsPerWorkflow = this._stats.totalSteps / this._stats.totalWorkflows;

    if (!result.success) {
      this._stats.errorCount++;
    }
  }

  private initializeStats(): WorkflowStats {
    return {
      totalWorkflows: 0,
      successfulWorkflows: 0,
      failedWorkflows: 0,
      averageExecutionTime: 0,
      totalSteps: 0,
      averageStepsPerWorkflow: 0,
      retryCount: 0,
      errorCount: 0
    };
  }

  private generateSessionId(): string {
    return `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    console.log(`[SimpleWorkflowEngine] ${message}`);
  }
}