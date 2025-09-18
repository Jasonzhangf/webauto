/**
 * WebAuto Operator Framework - 通用类型定义
 * @package @webauto/operator-framework
 */

/**
 * 通用响应接口
 */
export interface CommonResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * 分页接口
 */
export interface PaginationResult<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * 搜索过滤器接口
 */
export interface SearchFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith';
  value: any;
}

/**
 * 排序配置接口
 */
export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * 查询配置接口
 */
export interface QueryConfig {
  filters?: SearchFilter[];
  sort?: SortConfig[];
  pagination?: {
    page: number;
    pageSize: number;
  };
}

/**
 * 事件类型枚举
 */
export enum EventType {
  OPERATOR_CREATED = 'operator.created',
  OPERATOR_INITIALIZED = 'operator.initialized',
  OPERATOR_STARTED = 'operator.started',
  OPERATOR_COMPLETED = 'operator.completed',
  OPERATOR_ERROR = 'operator.error',
  OPERATOR_DESTROYED = 'operator.destroyed',
  CONNECTION_ESTABLISHED = 'connection.established',
  CONNECTION_CLOSED = 'connection.closed',
  CONTEXT_UPDATED = 'context.updated',
  STATE_CHANGED = 'state.changed'
}

/**
 * 事件数据接口
 */
export interface EventData {
  type: EventType;
  timestamp: number;
  operatorId: string;
  data?: any;
  source: string;
}

/**
 * 错误类型枚举
 */
export enum ErrorType {
  INITIALIZATION_ERROR = 'initialization.error',
  EXECUTION_ERROR = 'execution.error',
  TIMEOUT_ERROR = 'timeout.error',
  CONNECTION_ERROR = 'connection.error',
  VALIDATION_ERROR = 'validation.error',
  UNKNOWN_ERROR = 'unknown.error'
}

/**
 * 错误详情接口
 */
export interface ErrorDetails {
  type: ErrorType;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  timestamp: number;
}

/**
 * 超时配置接口
 */
export interface TimeoutConfig {
  default: number;
  navigation?: number;
  operation?: number;
  connection?: number;
}

/**
 * 重试配置接口
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier?: number;
  maxDelay?: number;
}