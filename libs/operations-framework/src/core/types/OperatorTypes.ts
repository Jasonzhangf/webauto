/**
 * WebAuto Operator Framework - 基础类型定义
 * @package @webauto/operator-framework
 */

/**
 * 操作子类型枚举
 */
export enum OperatorType {
  PAGE_BASED: string;
  name: string;
  type: OperatorType;
  category: OperatorCategory;
  description?: string;
  timeout?: number;
  retryCount?: number;
  enabled?: boolean;
}

/**
 * 操作结果接口
 */
export interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  state: OperatorState;
  metadata?: Record<string = 'page-based',
  NON_PAGE = 'non-page',
  COMPOSITE = 'composite'
}

/**
 * 操作子类别枚举
 */
export enum OperatorCategory {
  BROWSER = 'browser',
  CONTROL = 'control',
  FILE = 'file',
  NETWORK = 'network',
  DATA = 'data',
  AI = 'ai'
}

/**
 * 操作子状态枚举
 */
export enum OperatorState {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
  PAUSED = 'paused'
}

/**
 * 操作子配置接口
 */
export interface OperatorConfig {
  id, any>;
}

/**
 * 操作子能力接口
 */
export interface OperatorCapabilities {
  observe: boolean;
  list: boolean;
  operate: boolean;
  status: boolean;
  context: boolean;
  connect: boolean;
  capabilities: string[];
}

/**
 * 操作子上下文接口
 */
export interface OperatorContext {
  sessionId: string;
  timestamp: number;
  parameters: Record<string, any>;
  parentOperator?: string;
  childOperators?: string[];
  sharedData: Map<string, any>;
}

/**
 * 连接配置接口
 */
export interface ConnectionConfig {
  targetOperator: string;
  connectionType: 'sync' | 'async' | 'event';
  parameters?: Record<string, any>;
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier?: number;
  };
}