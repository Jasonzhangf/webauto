import { PageOperation, OperationSuggestion } from '../types';

// 操作引擎接口
export interface IOperationEngine {
  execute(operationName: string, params: Record<string, unknown>): Promise<unknown>;
  executeBatch(operations: OperationRequest[]): Promise<ExecutionResult[]>;
  registerOperation(name: string, operation: PageOperation): void;
  unregisterOperation(name: string): boolean;
  getOperation(name: string): PageOperation | undefined;
  listOperations(): string[];
  getExecutionHistory(): ExecutionRecord[];
  clearHistory(): void;
  replay(historyId: string): Promise<void>;
}

// 智能操作建议器接口
export interface IOperationSuggester {
  suggestOperations(pageContext: PageContext): Promise<OperationSuggestion[]>;
  learnFromExecution(record: ExecutionRecord): Promise<void>;
  updateConfidence(operationName: string, success: boolean): Promise<void>;
  getOptimalSequence(goal: string, context: PageContext): Promise<OperationSuggestion[]>;
}

// 错误恢复处理器接口
export interface IErrorHandler {
  handleOperationError(operation: string, error: Error, params: Record<string, unknown>): Promise<RecoveryResult>;
  registerRecoveryStrategy(operationType: string, strategy: RecoveryStrategy): void;
  getRecoveryStrategies(operationType: string): RecoveryStrategy[];
  canRecover(error: Error): boolean;
}

// 操作请求和结果
export interface OperationRequest {
  id: string;
  operation: string;
  params: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
  retries?: number;
}

export interface ExecutionResult {
  id: string;
  operation: string;
  success: boolean;
  result?: unknown;
  error?: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  retries: number;
  recoveryAttempts?: number;
}

export interface ExecutionRecord {
  id: string;
  operation: string;
  params: Record<string, unknown>;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'recovered';
  result?: unknown;
  error?: string;
  retries: number;
  recoveryMethod?: string;
}

export interface RecoveryResult {
  success: boolean;
  result?: unknown;
  recoveryMethod: string;
  attempts: number;
  error?: string;
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  applicableErrors: string[];
  priority: number;
  execute: (error: Error, params: Record<string, unknown>) => Promise<RecoveryResult>;
  canHandle: (error: Error) => boolean;
}

// 页面上下文
export interface PageContext {
  url: string;
  title: string;
  type: 'article' | 'product' | 'form' | 'navigation' | 'search' | 'social' | 'unknown';
  elements: ObservedElement[];
  currentFocus?: string;
  lastAction?: string;
  navigationHistory: string[];
  formFields?: FormField[];
}

export interface FormField {
  selector: string;
  type: 'text' | 'email' | 'password' | 'select' | 'checkbox' | 'radio' | 'textarea';
  label?: string;
  required: boolean;
  value?: string;
  options?: string[];
}

// 操作配置
export interface OperationConfig {
  enableSmartRecovery: boolean;
  maxRetries: number;
  timeout: number;
  retryDelay: number;
  enableBatchExecution: boolean;
  batchSize: number;
  enableLearning: boolean;
  learningRate: number;
}

// 观察元素扩展
export interface ObservedElement {
  id: string;
  selector: string;
  description: string;
  method: string;
  arguments: string[];
  confidence: number;
  metadata?: Record<string, unknown>;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visibility?: 'visible' | 'hidden' | 'partially-visible';
  interactability?: 'interactive' | 'non-interactive' | 'disabled';
}

// 专用的页面操作类型
export interface NavigationOperation extends PageOperation {
  parameters: Array<{
    name: 'url' | 'waitUntil' | 'timeout' | 'referer';
    type: string;
    description: string;
    required: boolean;
    defaultValue?: unknown;
  }>;
}

export interface InteractionOperation extends PageOperation {
  parameters: Array<{
    name: 'selector' | 'timeout' | 'force' | 'position';
    type: string;
    description: string;
    required: boolean;
    defaultValue?: unknown;
  }>;
}

export interface InputOperation extends PageOperation {
  parameters: Array<{
    name: 'selector' | 'text' | 'delay' | 'clear';
    type: string;
    description: string;
    required: boolean;
    defaultValue?: unknown;
  }>;
}

export interface ExtractionOperation extends PageOperation {
  parameters: Array<{
    name: 'selector' | 'attribute' | 'format' | 'limit';
    type: string;
    description: string;
    required: boolean;
    defaultValue?: unknown;
  }>;
}

// 操作事件
export interface OperationEvent {
  type: 'start' | 'progress' | 'success' | 'error' | 'retry' | 'recovery';
  operationId: string;
  operationName: string;
  timestamp: Date;
  data?: any;
  error?: Error;
}

// 操作统计
export interface OperationStatistics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageExecutionTime: number;
  successRate: number;
  mostUsedOperations: Array<{
    operation: string;
    count: number;
  }>;
  errorRates: Array<{
    operation: string;
    errorRate: number;
    commonErrors: string[];
  }>;
}