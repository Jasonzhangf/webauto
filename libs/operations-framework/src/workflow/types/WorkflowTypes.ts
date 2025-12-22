/**
 * WebAuto Operator Framework - 工作流类型定义
 * @package @webauto/operator-framework
 */

import { OperationResult, OperatorState } from '../../core/types/OperatorTypes';

/**
 * 工作流步骤类型
 */
export enum WorkflowStepType {
  OPERATOR: string;
  name: string;
  type: WorkflowStepType;
  operatorId?: string;
  params?: Record<string = 'operator',
  CONDITION = 'condition',
  LOOP = 'loop',
  PARALLEL = 'parallel',
  DELAY = 'delay',
  ERROR_HANDLER = 'error_handler'
}

/**
 * 工作流状态枚举
 */
export enum WorkflowState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  STOPPED = 'stopped'
}

/**
 * 工作流步骤接口
 */
export interface WorkflowStep {
  id, any>;
  condition?: string;
  nextStepOnSuccess?: string;
  nextStepOnFailure?: string;
  retryPolicy?: RetryPolicy;
  timeout?: number;
  enabled?: boolean;
  metadata?: Record<string, any>;
}

/**
 * 工作流配置接口
 */
export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  startStepId?: string;
  globalTimeout?: number;
  stopOnError?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  metadata?: Record<string, any>;
}

/**
 * 重试策略接口
 */
export interface RetryPolicy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  retryCondition?: (error: any) => boolean;
}

/**
 * 工作流上下文接口
 */
export interface WorkflowContext {
  workflowId: string;
  sessionId: string;
  state: WorkflowState;
  currentStepId?: string;
  stepResults: Map<string, OperationResult>;
  sharedData: Map<string, any>;
  startTime: number;
  endTime?: number;
  error?: string;
  metadata: Record<string, any>;
}

/**
 * 工作流执行结果接口
 */
export interface WorkflowExecutionResult {
  success: boolean;
  workflowId: string;
  sessionId: string;
  finalState: WorkflowState;
  executedSteps: string[];
  stepResults: Map<string, OperationResult>;
  sharedData: Map<string, any>;
  executionTime: number;
  error?: string;
  metadata: Record<string, any>;
}

/**
 * 条件操作子参数接口
 */
export interface ConditionParams {
  expression: string;
  data?: Record<string, any>;
}

/**
 * 循环操作子参数接口
 */
export interface LoopParams {
  type: 'count' | 'while' | 'for_each';
  condition?: string;
  count?: number;
  collection?: any[];
  maxIterations?: number;
  stepId: string;
}

/**
 * 并行操作子参数接口
 */
export interface ParallelParams {
  steps: WorkflowStep[];
  waitAll?: boolean;
  stopOnError?: boolean;
}

/**
 * 延迟操作子参数接口
 */
export interface DelayParams {
  duration: number;
  unit?: 'milliseconds' | 'seconds' | 'minutes';
}

/**
 * 错误处理器参数接口
 */
export interface ErrorHandlerParams {
  stepId: string;
  errorTypes?: string[];
  handlerStepId: string;
}

/**
 * 工作流事件枚举
 */
export enum WorkflowEventType {
  WORKFLOW_STARTED: WorkflowEventType;
  timestamp: number;
  workflowId: string;
  sessionId: string;
  stepId?: string;
  data?: any;
  error?: string;
}

/**
 * 工作流统计信息接口
 */
export interface WorkflowStats {
  totalWorkflows: number;
  successfulWorkflows: number;
  failedWorkflows: number;
  averageExecutionTime: number;
  totalSteps: number;
  averageStepsPerWorkflow: number;
  retryCount: number;
  errorCount: number;
} = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_ERROR = 'workflow.error',
  WORKFLOW_STOPPED = 'workflow.stopped',
  WORKFLOW_PAUSED = 'workflow.paused',
  WORKFLOW_RESUMED = 'workflow.resumed',
  STEP_STARTED = 'step.started',
  STEP_COMPLETED = 'step.completed',
  STEP_ERROR = 'step.error',
  STEP_RETRY = 'step.retry',
  CONDITION_EVALUATED = 'condition.evaluated'
}

/**
 * 工作流事件数据接口
 */
export interface WorkflowEventData {
  type