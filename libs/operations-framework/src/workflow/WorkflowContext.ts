/**
 * WebAuto Workflow Engine - Workflow Context Manager
 * @package @webauto/workflow-engine
 */

import { EventEmitter } from 'events';
import { WorkflowContext as IWorkflowContext, OperationResult, StepExecution } from './types/WorkflowTypes';

export class WorkflowContext extends EventEmitter implements IWorkflowContext {
  private _context: IWorkflowContext;
  private _executionStack: string[] = [];
  private _sharedData: Map<string, any> = new Map();
  private _stepResults: Map<string, OperationResult> = new Map();
  private _logs: Array<{timestamp: number, level: string, message: string, stepId?: string}> = [];

  constructor(workflowId: string, initialVariables: Record<string, any> = {}) {
    super();
    this._context: []
    };
  }

  // Getters
  get id( = {
      id: `${workflowId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workflowId,
      state: 'pending',
      startTime: Date.now(),
      variables: { ...initialVariables },
      currentStep: 0,
      steps): string { return this._context.id; }
  get workflowId(): string { return this._context.workflowId; }
  get state(): IWorkflowContext['state'] { return this._context.state; }
  get startTime(): number { return this._context.startTime; }
  get endTime(): number | undefined { return this._context.endTime; }
  get variables(): Record<string, any> { return { ...this._context.variables }; }
  get currentStep(): number { return this._context.currentStep; }
  get steps(): StepExecution[] { return [...this._context.steps]; }
  get error(): string | undefined { return this._context.error; }
  get executionStack(): string[] { return [...this._executionStack]; }
  get sharedData(): Map<string, any> { return new Map(this._sharedData); }
  get stepResults(): Map<string, OperationResult> { return new Map(this._stepResults); }
  get logs(): Array<{timestamp: number, level: string, message: string, stepId?: string}> {
    return [...this._logs];
  }

  // State management
  setState(state: IWorkflowContext['state']): void {
    const previousState = this._context.state;
    this._context.state = state;

    this.log('info', `Context state changed: ${previousState} -> ${state}`);

    // Emit state change events
    this.emit('stateChanged', { context: this, previousState, newState: state });

    switch (state) {
      case 'running':
        this.emit('started', this);
        break;
      case 'completed':
        this._context.endTime = Date.now();
        this.emit('completed', this);
        break;
      case 'error':
        this._context.endTime = Date.now();
        this.emit('error', this);
        break;
      case 'paused':
        this.emit('paused', this);
        break;
    }
  }

  // Variable management
  setVariable(key: string, value: any): void {
    this._context.variables[key] = value;
    this.log('debug', `Variable set: ${key} = ${JSON.stringify(value)}`);
    this.emit('variableChanged', { context: this, key, value });
  }

  getVariable(key: string): any {
    return this._context.variables[key];
  }

  hasVariable(key: string): boolean {
    return key in this._context.variables;
  }

  deleteVariable(key: string): boolean {
    const exists = key in this._context.variables;
    if (exists) {
      delete this._context.variables[key];
      this.log('debug', `Variable deleted: ${key}`);
      this.emit('variableDeleted', { context: this, key });
    }
    return exists;
  }

  // Shared data management
  setSharedData(key: string, value: any): void {
    this._sharedData.set(key, value);
    this.log('debug', `Shared data set: ${key} = ${JSON.stringify(value)}`);
    this.emit('sharedDataChanged', { context: this, key, value });
  }

  getSharedData(key: string): any {
    return this._sharedData.get(key);
  }

  hasSharedData(key: string): boolean {
    return this._sharedData.has(key);
  }

  deleteSharedData(key: string): boolean {
    const exists = this._sharedData.has(key);
    if (exists) {
      this._sharedData.delete(key);
      this.log('debug', `Shared data deleted: ${key}`);
      this.emit('sharedDataDeleted', { context: this, key });
    }
    return exists;
  }

  // Step result management
  addStepResult(stepId: string, result: OperationResult): void {
    this._stepResults.set(stepId, result);
    this.log('debug', `Step result added: ${stepId} - ${result.success ? 'success' : 'failed'}`);
    this.emit('stepResultAdded', { context: this, stepId, result });
  }

  getStepResult(stepId: string): OperationResult | undefined {
    return this._stepResults.get(stepId);
  }

  hasStepResult(stepId: string): boolean {
    return this._stepResults.has(stepId);
  }

  // Step management
  addStepExecution(step: StepExecution): void {
    this._context.steps.push(step);
    this._executionStack.push(step.stepId);
    this.log('info', `Step execution added: ${step.stepName} (${step.stepId})`);
    this.emit('stepAdded', { context: this, step });
  }

  updateCurrentStep(stepIndex: number): void {
    this._context.currentStep = stepIndex;
    this.log('debug', `Current step updated to: ${stepIndex}`);
    this.emit('currentStepChanged', { context: this, stepIndex });
  }

  // Execution stack management
  pushToStack(stepId: string): void {
    this._executionStack.push(stepId);
    this.log('debug', `Step pushed to stack: ${stepId}`);
  }

  popFromStack(): string | undefined {
    const stepId = this._executionStack.pop();
    if (stepId) {
      this.log('debug', `Step popped from stack: ${stepId}`);
    }
    return stepId;
  }

  clearStack(): void {
    this._executionStack = [];
    this.log('debug', 'Execution stack cleared');
  }

  // Error handling
  setError(error: string): void {
    this._context.error = error;
    this.setState('error');
    this.log('error', `Error set: ${error}`);
    this.emit('errorOccurred', { context: this, error });
  }

  clearError(): void {
    const previousError = this._context.error;
    this._context.error = undefined;
    this.log('debug', `Error cleared: ${previousError}`);
    this.emit('errorCleared', { context: this, previousError });
  }

  // Variable resolution
  resolveVariables(text: string): string {
    return text.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const value = this.getVariable(key);
      return value !== undefined ? String(value) : match;
    });
  }

  resolveObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.resolveVariables(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item));
    } else if (typeof obj: any  = == 'object' && obj !== null) {
      const result= {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveObject(value);
      }
      return result;
    }
    return obj;
  }

  // Logging
  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, stepId?: string): void {
    const logEntry: Date.now( = {
      timestamp),
      level,
      message,
      stepId
    };

    this._logs.push(logEntry);
    this.emit('log', { context: this, ...logEntry });

    // Also emit specific level events
    this.emit(`log:${level}`, { context: this, ...logEntry });
  }

  // Context information
  getExecutionTime(): number {
    const endTime = this._context.endTime || Date.now();
    return endTime - this._context.startTime;
  }

  getStepCount(): number {
    return this._context.steps.length;
  }

  getSuccessfulSteps(): number {
    return this._context.steps.filter(step => step.result.success).length;
  }

  getFailedSteps(): number {
    return this._context.steps.filter(step => !step.result.success).length;
  }

  getProgress(): number {
    const totalSteps = this._context.steps.length;
    if (totalSteps === 0) return 0;
    return (this._context.currentStep / totalSteps) * 100;
  }

  // Utility methods
  clone(): WorkflowContext {
    const cloned = new WorkflowContext(this.workflowId, this.variables);
    cloned._context = { ...this._context };
    cloned._executionStack = [...this._executionStack];
    cloned._sharedData = new Map(this._sharedData);
    cloned._stepResults = new Map(this._stepResults);
    cloned._logs = [...this._logs];
    return cloned;
  }

  toJSON(): IWorkflowContext {
    return {
      ...this._context,
      steps: this._context.steps.map(step: { ...step.result } // Deep clone result
      } = > ({
        ...step,
        result))
    };
  }

  // Cleanup
  destroy(): void {
    this.clearStack();
    this._sharedData.clear();
    this._stepResults.clear();
    this._logs.length = 0;
    this.removeAllListeners();
  }
}