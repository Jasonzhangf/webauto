/**
 * Pipeline Workflow Engine
 * 流水线工作流引擎
 */

import { PipelineBaseOperation, PipelineOperationConfig, PipelineOperationContext, PipelineOperationResult } from './PipelineBaseOperation';
import { RequestTrackingPipelineOperation } from './RequestTrackingPipelineOperation';
import { PipelineSchedulingOperation } from './PipelineSchedulingOperation';
import { OperationResult } from '../../../operations-framework/src/core/BaseOperationSimple';

/**
 * Workflow step definition
 * 工作流步骤定义
 */
export interface WorkflowStep {
  id: string;
  name: string;
  operation: string;
  parameters?: any;
  dependsOn?: string[];
  timeout?: number;
  retryCount?: number;
  required?: boolean;
}

/**
 * Workflow definition
 * 工作流定义
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  config?: {
    parallelExecution?: boolean;
    maxRetries?: number;
    timeout?: number;
    failFast?: boolean;
  };
}

/**
 * Workflow execution context
 * 工作流执行上下文
 */
export interface WorkflowExecutionContext extends PipelineOperationContext {
  workflow: {
    id: string;
    name: string;
    startTime: number;
    steps: Map<string, WorkflowStep>;
    completedSteps: Set<string>;
    failedSteps: Set<string>;
    stepResults: Map<string, any>;
    stepErrors: Map<string, Error>;
  };
}

/**
 * Workflow execution result
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
  success: boolean;
  workflowId: string;
  executionTime: number;
  steps: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  results: Map<string, any>;
  errors: Map<string, Error>;
  metadata?: any;
}

/**
 * Pipeline Workflow Engine for orchestrating multiple operations
 * 用于编排多个操作子的流水线工作流引擎
 */
export class PipelineWorkflowEngine extends PipelineBaseOperation {
  name = 'pipeline-workflow';
  description = 'Execute complex pipeline workflows with multiple stages';
  version = '1.0.0';
  abstractCategories = ['workflow', 'orchestration', 'pipeline'];
  supportedContainers = ['pipeline', 'workflow'];
  capabilities = ['workflow-orchestration', 'step-execution', 'parallel-processing', 'error-handling'];

  // Operation registry
  private operations: Map<string, PipelineBaseOperation> = new Map();

  // Active workflows
  private activeWorkflows: Map<string, WorkflowExecutionContext> = new Map();
  private completedWorkflows: Map<string, WorkflowExecutionResult> = new Map();

  // Default configuration
  private defaultConfig = {
    parallelExecution: false,
    maxRetries: 3,
    timeout: 300000, // 5 minutes
    failFast: true
  };

  constructor() {
    super();
    this.initializeDefaultOperations();
  }

  /**
   * Initialize default operations
   * 初始化默认操作子
   */
  private initializeDefaultOperations(): void {
    // Register built-in operations
    this.registerOperation(new RequestTrackingPipelineOperation());
    this.registerOperation(new PipelineSchedulingOperation());
  }

  /**
   * Register an operation
   * 注册操作子
   */
  public registerOperation(operation: PipelineBaseOperation): void {
    this.operations.set(operation.name, operation);
    this.logger.info('Operation registered', { operationName: operation.name });
  }

  /**
   * Execute a workflow
   * 执行工作流
   */
  public async executeWorkflow(
    workflow: WorkflowDefinition,
    context?: PipelineOperationContext
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const workflowId = workflow.id;

    try {
      this.logger.info('Starting workflow execution', {
        workflowId: workflow.name,
        stepCount: workflow.steps.length,
        config: workflow.config
      });

      // Create workflow execution context
      const executionContext = this.createWorkflowExecutionContext(workflow, context);

      // Store active workflow
      this.activeWorkflows.set(workflowId, executionContext);

      // Execute workflow steps
      const result = await this.executeWorkflowSteps(workflow, executionContext);

      // Calculate execution time
      const executionTime = Date.now() - startTime;

      // Complete workflow
      this.completeWorkflow(workflowId, result);

      this.logger.info('Workflow execution completed', {
        workflowId,
        executionTime,
        success: result.success,
        steps: result.steps
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error('Workflow execution failed', {
        workflowId,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });

      // Record failed workflow
      const failedResult: WorkflowExecutionResult = {
        success: false,
        workflowId,
        executionTime,
        steps: {
          total: workflow.steps.length,
          completed: 0,
          failed: 0,
          skipped: 0
        },
        results: new Map(),
        errors: new Map([[workflowId, error instanceof Error ? error : new Error(String(error))]])
      };

      this.completedWorkflows.set(workflowId, failedResult);
      this.activeWorkflows.delete(workflowId);

      return failedResult;
    }
  }

  /**
   * Create workflow execution context
   * 创建工作流执行上下文
   */
  private createWorkflowExecutionContext(
    workflow: WorkflowDefinition,
    baseContext?: PipelineOperationContext
  ): WorkflowExecutionContext {
    const steps = new Map<string, WorkflowStep>();
    workflow.steps.forEach(step => {
      steps.set(step.id, step);
    });

    const context: WorkflowExecutionContext = {
      ...baseContext!,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        startTime: Date.now(),
        steps,
        completedSteps: new Set(),
        failedSteps: new Set(),
        stepResults: new Map(),
        stepErrors: new Map()
      }
    };

    return context;
  }

  /**
   * Execute workflow steps
   * 执行工作流步骤
   */
  private async executeWorkflowSteps(
    workflow: WorkflowDefinition,
    context: WorkflowExecutionContext
  ): Promise<WorkflowExecutionResult> {
    const config = { ...this.defaultConfig, ...workflow.config };
    const steps = workflow.steps;

    if (config.parallelExecution) {
      return this.executeStepsParallel(steps, context, config);
    } else {
      return this.executeStepsSequential(steps, context, config);
    }
  }

  /**
   * Execute steps sequentially
   * 顺序执行步骤
   */
  private async executeStepsSequential(
    steps: WorkflowStep[],
    context: WorkflowExecutionContext,
    config: any
  ): Promise<WorkflowExecutionResult> {
    for (const step of steps) {
      // Check if step should be skipped (failed dependencies)
      if (this.shouldSkipStep(step, context)) {
        context.workflow.completedSteps.add(step.id);
        continue;
      }

      try {
        // Execute step with retry logic
        const result = await this.executeStepWithRetry(step, context, config.maxRetries);

        // Store result
        context.workflow.stepResults.set(step.id, result);
        context.workflow.completedSteps.add(step.id);

        this.logger.debug('Step completed', {
          stepId: step.id,
          stepName: step.name,
          success: true
        });

      } catch (error) {
        context.workflow.stepErrors.set(step.id, error instanceof Error ? error : new Error(String(error)));
        context.workflow.failedSteps.add(step.id);

        this.logger.error('Step failed', {
          stepId: step.id,
          stepName: step.name,
          error: error instanceof Error ? error.message : String(error)
        });

        // Handle failure based on failFast setting
        if (config.failFast && step.required !== false) {
          throw error;
        }
      }
    }

    return this.createWorkflowExecutionResult(context);
  }

  /**
   * Execute steps in parallel
   * 并行执行步骤
   */
  private async executeStepsParallel(
    steps: WorkflowStep[],
    context: WorkflowExecutionContext,
    config: any
  ): Promise<WorkflowExecutionResult> {
    const executionPromises = steps.map(async (step) => {
      try {
        // Check if step should be skipped
        if (this.shouldSkipStep(step, context)) {
          context.workflow.completedSteps.add(step.id);
          return;
        }

        // Execute step with retry logic
        const result = await this.executeStepWithRetry(step, context, config.maxRetries);

        // Store result
        context.workflow.stepResults.set(step.id, result);
        context.workflow.completedSteps.add(step.id);

        this.logger.debug('Parallel step completed', {
          stepId: step.id,
          stepName: step.name,
          success: true
        });

      } catch (error) {
        context.workflow.stepErrors.set(step.id, error instanceof Error ? error : new Error(String(error)));
        context.workflow.failedSteps.add(step.id);

        this.logger.error('Parallel step failed', {
          stepId: step.id,
          stepName: step.name,
          error: error instanceof Error ? error.message : String(error)
        });

        // Re-throw if failFast and required
        if (config.failFast && step.required !== false) {
          throw error;
        }
      }
    });

    try {
      await Promise.all(executionPromises);
    } catch (error) {
      // In parallel execution, if failFast is true, we stop here
      this.logger.error('Parallel execution failed', { error: error instanceof Error ? error.message : String(error) });
    }

    return this.createWorkflowExecutionResult(context);
  }

  /**
   * Check if step should be skipped due to failed dependencies
   * 检查是否应跳过步骤（由于依赖失败）
   */
  private shouldSkipStep(step: WorkflowStep, context: WorkflowExecutionContext): boolean {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return false;
    }

    // Check if any dependency failed
    const hasFailedDependency = step.dependsOn.some(depId =>
      context.workflow.failedSteps.has(depId)
    );

    if (hasFailedDependency) {
      this.logger.info('Skipping step due to failed dependencies', {
        stepId: step.id,
        failedDependencies: step.dependsOn.filter(depId =>
          context.workflow.failedSteps.has(depId)
        )
      });
      return true;
    }

    return false;
  }

  /**
   * Execute step with retry logic
   * 带重试逻辑执行步骤
   */
  private async executeStepWithRetry(
    step: WorkflowStep,
    context: WorkflowExecutionContext,
    maxRetries: number
  ): Promise<any> {
    const retryCount = step.retryCount ?? maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        return await this.executeSingleStep(step, context);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retryCount) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          this.logger.warn('Step execution failed, retrying', {
            stepId: step.id,
            attempt: attempt + 1,
            maxRetries: retryCount,
            delay,
            error: lastError.message
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`Step ${step.id} failed after ${retryCount + 1} attempts`);
  }

  /**
   * Execute a single step
   * 执行单个步骤
   */
  private async executeSingleStep(step: WorkflowStep, context: WorkflowExecutionContext): Promise<any> {
    const operation = this.operations.get(step.operation);
    if (!operation) {
      throw new Error(`Operation not found: ${step.operation}`);
    }

    this.logger.debug('Executing step', {
      stepId: step.id,
      stepName: step.name,
      operation: step.operation,
      parameters: step.parameters
    });

    // Create step-specific context
    const stepContext: PipelineOperationContext = {
      ...context,
      request: {
        id: `${context.request?.id || 'unknown'}-${step.id}`,
        provider: context.request?.provider || 'workflow-engine',
        operation: step.operation,
        metadata: {
          ...(context.request?.metadata || {}),
          stepId: step.id,
          stepName: step.name,
          workflowId: context.workflow.id,
          workflowName: context.workflow.name
        }
      }
    };

    // Execute the operation
    const result = await operation.execute(stepContext, step.parameters);

    return result;
  }

  /**
   * Create workflow execution result
   * 创建工作流执行结果
   */
  private createWorkflowExecutionResult(context: WorkflowExecutionContext): WorkflowExecutionResult {
    const totalSteps = context.workflow.steps.size;
    const completedSteps = context.workflow.completedSteps.size;
    const failedSteps = context.workflow.failedSteps.size;
    const skippedSteps = totalSteps - completedSteps - failedSteps;

    const success = failedSteps === 0 || (failedSteps > 0 && context.workflow.failedSteps.size === 0);

    return {
      success,
      workflowId: context.workflow.id,
      executionTime: Date.now() - context.workflow.startTime,
      steps: {
        total: totalSteps,
        completed: completedSteps,
        failed: failedSteps,
        skipped: skippedSteps
      },
      results: new Map(context.workflow.stepResults),
      errors: new Map(context.workflow.stepErrors),
      metadata: {
        workflowName: context.workflow.name,
        stepResults: Array.from(context.workflow.stepResults.entries()),
        stepErrors: Array.from(context.workflow.stepErrors.entries())
      }
    };
  }

  /**
   * Complete workflow execution
   * 完成工作流执行
   */
  private completeWorkflow(workflowId: string, result: WorkflowExecutionResult): void {
    this.completedWorkflows.set(workflowId, result);
    this.activeWorkflows.delete(workflowId);

    // Clean up old completed workflows (prevent memory leaks)
    this.cleanupCompletedWorkflows();
  }

  /**
   * Cleanup old completed workflows
   * 清理旧的已完成工作流
   */
  private cleanupCompletedWorkflows(maxAge: number = 3600000): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [workflowId, result] of this.completedWorkflows.entries()) {
      if (now - result.executionTime > maxAge) {
        this.completedWorkflows.delete(workflowId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Cleaned up completed workflows', { cleanedCount });
    }
  }

  /**
   * Get workflow execution status
   * 获取工作流执行状态
   */
  public getWorkflowStatus(workflowId: string): {
    status: 'running' | 'completed' | 'not-found';
    progress?: number;
    result?: WorkflowExecutionResult;
  } {
    if (this.activeWorkflows.has(workflowId)) {
      const context = this.activeWorkflows.get(workflowId)!;
      const totalSteps = context.workflow.steps.size;
      const completedSteps = context.workflow.completedSteps.size;
      const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

      return {
        status: 'running',
        progress
      };
    }

    if (this.completedWorkflows.has(workflowId)) {
      return {
        status: 'completed',
        result: this.completedWorkflows.get(workflowId)
      };
    }

    return {
      status: 'not-found'
    };
  }

  /**
   * Get engine metrics
   * 获取引擎指标
   */
  public getEngineMetrics() {
    return {
      registeredOperations: Array.from(this.operations.keys()),
      activeWorkflows: this.activeWorkflows.size,
      completedWorkflows: this.completedWorkflows.size,
      totalWorkflowsExecuted: this.successCount + this.failureCount,
      successRate: this.successCount / Math.max(1, this.successCount + this.failureCount) * 100,
      averageExecutionTime: this.executionTime / Math.max(1, this.successCount + this.failureCount)
    };
  }

  /**
   * Execute pipeline operation (workflow-specific execution)
   * 执行流水线操作（工作流特定执行）
   */
  protected async executePipelineOperation(
    context: PipelineOperationContext,
    params?: PipelineOperationConfig & { workflow?: WorkflowDefinition }
  ): Promise<OperationResult> {
    if (!params?.workflow) {
      throw new Error('Workflow definition is required for workflow execution');
    }

    const result = await this.executeWorkflow(params.workflow, context);

    return {
      success: result.success,
      result,
      data: {
        workflowId: result.workflowId,
        executionTime: result.executionTime,
        steps: result.steps
      }
    };
  }

  /**
   * Reset engine state
   * 重置引擎状态
   */
  public reset(): void {
    this.operations.clear();
    this.activeWorkflows.clear();
    this.completedWorkflows.clear();
    this.initializeDefaultOperations();
    this.resetPipelineStats();
    this.logger.info('Pipeline workflow engine reset');
  }
}