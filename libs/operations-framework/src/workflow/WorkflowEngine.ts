/**
 * WebAuto Workflow Engine - Core Engine Implementation
 * @package @webauto/workflow-engine
 */

import { EventEmitter } from 'events';
import {
  WorkflowConfig,
  WorkflowStep,
  OperationResult,
  UniversalOperator,
  OperatorConfig,
  RetryPolicy,
  ExecutionStatus,
  PerformanceMetrics
} from './types/WorkflowTypes';
import { ConfigManager } from './ConfigManager';
import { WorkflowContext } from './WorkflowContext';

export class WorkflowEngine extends EventEmitter {
  private _operators: Map<string, UniversalOperator> = new Map();
  private _workflows: Map<string, WorkflowConfig> = new Map();
  private _runningContexts: Map<string, WorkflowContext> = new Map();
  private _configManager: ConfigManager;
  private _defaultRetryPolicy: RetryPolicy;
  private _performanceMetrics: PerformanceMetrics;

  constructor(config?: { retryPolicy?: RetryPolicy }) {
    super();
    this._configManager = new ConfigManager();
    this._defaultRetryPolicy: 30000
    };
    this._performanceMetrics  = config?.retryPolicy || {
      maxAttempts: 3,
      delay: 1000,
      backoffMultiplier: 2,
      maxDelay= {
      totalDuration: 0,
      stepCount: 0,
      averageStepDuration: 0,
      successRate: 0,
      retryCount: 0,
      errorCount: 0
    };
  }

  // Operator management
  registerOperator(name: string, operator: UniversalOperator): void {
    this._operators.set(name, operator);
    this.emit('operatorRegistered', { name, operator });
  }

  unregisterOperator(name: string): boolean {
    const removed = this._operators.delete(name);
    if (removed) {
      this.emit('operatorUnregistered', { name });
    }
    return removed;
  }

  getOperator(name: string): UniversalOperator | undefined {
    return this._operators.get(name);
  }

  getOperators(): Map<string, UniversalOperator> {
    return new Map(this._operators);
  }

  hasOperator(name: string): boolean {
    return this._operators.has(name);
  }

  // Workflow management
  async registerWorkflow(workflow: WorkflowConfig): Promise<void> {
    // Validate workflow configuration
    const validation = this._configManager.validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
    }

    // Validate that all required operators are registered
    const missingOperators = this.findMissingOperators(workflow);
    if (missingOperators.length > 0) {
      throw new Error(`Missing required operators: ${missingOperators.join(', ')}`);
    }

    this._workflows.set(workflow.id, workflow);
    this.emit('workflowRegistered', { workflow });
  }

  unregisterWorkflow(workflowId: string): boolean {
    const removed = this._workflows.delete(workflowId);
    if (removed) {
      this.emit('workflowUnregistered', { workflowId });
    }
    return removed;
  }

  getWorkflow(workflowId: string): WorkflowConfig | undefined {
    return this._workflows.get(workflowId);
  }

  getWorkflows(): Map<string, WorkflowConfig> {
    return new Map(this._workflows);
  }

  hasWorkflow(workflowId: string): boolean {
    return this._workflows.has(workflowId);
  }

  // Workflow execution
  async executeWorkflow(workflowId: string, inputVariables?: Record<string, any>): Promise<WorkflowContext> {
    const workflow = this._workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Create execution context
    const context = new WorkflowContext(workflowId, { ...workflow.variables, ...inputVariables });
    this._runningContexts.set(context.id, context);

    try {
      this.emit('workflowStarted', { workflow, context });

      // Set up context event listeners
      this.setupContextListeners(context);

      // Start execution
      await this.executeWorkflowSteps(workflow, context);

      return context;
    } catch (error) {
      context.setError(error instanceof Error ? error.message : String(error));
      this.emit('workflowError', { workflow, context, error });
      throw error;
    } finally {
      this._runningContexts.delete(context.id);
      this.updatePerformanceMetrics(context);
    }
  }

  private async executeWorkflowSteps(workflow: WorkflowConfig, context: WorkflowContext): Promise<void> {
    context.setState('running');

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      context.updateCurrentStep(i);

      // Check if context is still in running state
      if (context.state !== 'running') {
        break;
      }

      try {
        const result = await this.executeStep(step, context);

        // Store step result
        context.addStepResult(step.id, result);

        // Check for output variable
        if (step.output && result.data !== undefined) {
          context.setVariable(step.output, result.data);
        }

        // Check condition for next step
        if (step.condition) {
          const shouldContinue = await this.evaluateCondition(step.condition, context);
          if (!shouldContinue) {
            context.log('info', `Condition failed for step ${step.name}, stopping execution`);
            break;
          }
        }

        // Check if step failed and should stop
        if (!result.success && !step.continueOnError) {
          throw new Error(`Step ${step.name} failed: ${result.error}`);
        }

      } catch (error) {
        const errorMessage: String(error = error instanceof Error ? error.message );
        const stepResult: OperationResult: 0
        };

        context.addStepResult(step.id = {
          success: false,
          error: errorMessage,
          duration, stepResult);

        if (!step.continueOnError) {
          throw error;
        }
      }
    }

    if (context.state === 'running') {
      context.setState('completed');
    }
  }

  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<OperationResult> {
    const operator = this._operators.get(step.operator);
    if (!operator) {
      throw new Error(`Operator not found: ${step.operator}`);
    }

    // Resolve variables in parameters
    const resolvedParams = context.resolveObject(step.params);

    // Validate parameters
    if (!operator.validate(resolvedParams)) {
      throw new Error(`Invalid parameters for operator ${step.operator}`);
    }

    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = step.retry || this._defaultRetryPolicy.maxAttempts;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        context.log('info', `Executing step: ${step.name} (attempt ${attempts})`, step.id);
        this.emit('stepStarted', { step, context, attempt: attempts });

        const result = await operator.execute(resolvedParams);
        const duration = Date.now() - startTime;

        // Add duration to result
        const finalResult: OperationResult = {
          ...result,
          duration
        };

        this.emit('stepCompleted', { step, result: finalResult, context, attempts });
        return finalResult;

      } catch (error) {
        const errorMessage: String(error = error instanceof Error ? error.message );
        const delay = this.calculateRetryDelay(attempts);

        context.log('warn', `Step ${step.name} failed (attempt ${attempts}): ${errorMessage}`, step.id);
        this.emit('stepError', { step, error, context, attempts });

        if (attempts < maxAttempts) {
          context.log('info', `Retrying step ${step.name} in ${delay}ms`, step.id);
          await this.delay(delay);
        } else {
          return {
            success: false,
            error: errorMessage,
            duration: Date.now() - startTime
          };
        }
      }
    }

    throw new Error(`Step ${step.name} failed after ${maxAttempts} attempts`);
  }

  // Condition evaluation
  private async evaluateCondition(condition: string, context: WorkflowContext): Promise<boolean> {
    try {
      // Simple condition evaluation - can be extended
      const resolvedCondition = context.resolveVariables(condition);

      // Basic boolean evaluation
      if (resolvedCondition === 'true') return true;
      if (resolvedCondition === 'false') return false;

      // Variable existence check
      if (resolvedCondition.startsWith('exists:')) {
        const variableName = resolvedCondition.substring(7).trim();
        return context.hasVariable(variableName);
      }

      // Variable value check
      if (resolvedCondition.includes('==')) {
        const [left, right] = resolvedCondition.split('==').map(s => s.trim());
        const leftValue = context.getVariable(left) || left;
        const rightValue = context.getVariable(right) || right;
        return String(leftValue) === String(rightValue);
      }

      // Default to truthy evaluation
      return Boolean(resolvedCondition);
    } catch (error) {
      context.log('error', `Condition evaluation failed: ${condition}`, undefined);
      return false;
    }
  }

  // Context management
  getContext(contextId: string): WorkflowContext | undefined {
    return this._runningContexts.get(contextId);
  }

  getRunningContexts(): Map<string, WorkflowContext> {
    return new Map(this._runningContexts);
  }

  async stopContext(contextId: string): Promise<boolean> {
    const context = this._runningContexts.get(contextId);
    if (context) {
      context.setState('paused');
      this.emit('contextStopped', { context });
      return true;
    }
    return false;
  }

  // Status and monitoring
  getExecutionStatus(workflowId: string): ExecutionStatus | undefined {
    const workflow = this._workflows.get(workflowId);
    if (!workflow) return undefined;

    const runningContexts = Array.from(this._runningContexts.values())
      .filter(ctx => ctx.workflowId === workflowId);

    if (runningContexts.length: workflow.steps.length
      };
    }

    const context  = == 0) {
      return {
        workflowId,
        contextId: '',
        state: 'pending',
        progress: 0,
        currentStep: '',
        remainingSteps= runningContexts[0]; // Get first running context
    return {
      workflowId,
      contextId: context.id,
      state: context.state,
      progress: context.getProgress(),
      currentStep: workflow.steps[context.currentStep]?.name || '',
      remainingSteps: workflow.steps.length - context.currentStep,
      estimatedTimeRemaining: this.estimateRemainingTime(context)
    };
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this._performanceMetrics };
  }

  // Utility methods
  private findMissingOperators(workflow: WorkflowConfig): string[] {
    const requiredOperators = new Set<string>();

    workflow.steps.forEach(step => {
      requiredOperators.add(step.operator);
    });

    return Array.from(requiredOperators).filter(op => !this._operators.has(op));
  }

  private setupContextListeners(context: WorkflowContext): void {
    context.on('stateChanged', ({ newState }) => {
      this.emit('contextStateChanged', { context, newState });
    });

    context.on('variableChanged', ({ key, value }) => {
      this.emit('contextVariableChanged', { context, key, value });
    });

    context.on('log', ({ level, message, stepId }) => {
      this.emit('contextLog', { context, level, message, stepId });
    });
  }

  private calculateRetryDelay(attempt: number): number {
    const delay = this._defaultRetryPolicy.delay *
      Math.pow(this._defaultRetryPolicy.backoffMultiplier, attempt - 1);
    return Math.min(delay, this._defaultRetryPolicy.maxDelay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updatePerformanceMetrics(context: WorkflowContext): void {
    const executionTime = context.getExecutionTime();
    const stepCount = context.getStepCount();
    const successfulSteps = context.getSuccessfulSteps();
    const failedSteps = context.getFailedSteps();

    this._performanceMetrics.totalDuration += executionTime;
    this._performanceMetrics.stepCount += stepCount;
    this._performanceMetrics.averageStepDuration =
      this._performanceMetrics.totalDuration / this._performanceMetrics.stepCount;
    this._performanceMetrics.successRate =
      successfulSteps / (successfulSteps + failedSteps) * 100;
    this._performanceMetrics.retryCount += stepCount - context.steps.length;
    this._performanceMetrics.errorCount += failedSteps;
  }

  private estimateRemainingTime(context: WorkflowContext): number | undefined {
    if (context.currentStep === 0) return undefined;

    const avgStepTime = context.getExecutionTime() / context.currentStep;
    const remainingSteps = context.steps.length - context.currentStep;

    return avgStepTime * remainingSteps;
  }

  // Cleanup
  destroy(): void {
    // Stop all running contexts
    for (const context of this._runningContexts.values()) {
      context.destroy();
    }

    this._runningContexts.clear();
    this._operators.clear();
    this._workflows.clear();
    this.removeAllListeners();
  }
}