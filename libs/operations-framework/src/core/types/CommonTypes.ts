/**
 * WebAuto Operator Framework - 通用类型定义
 * @package @webauto/operator-framework
 */

/**
 * 通用响应接口
 */
export interface CommonResponse<T: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  metadata?: Record<string = any> {
  success, any>;
}

/**
 * 分页接口
 */
export interface PaginationResult<T: T[];
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
  OPERATOR_CREATED  = any> {
  items= 'operator.created',
  OPERATOR_INITIALIZED: EventType;
  timestamp: number;
  operatorId: string;
  data?: any;
  source: string;
}

/**
 * 错误类型枚举
 */
export enum ErrorType {
  INITIALIZATION_ERROR  = 'operator.initialized',
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
  type= 'initialization.error',
  EXECUTION_ERROR: ErrorType;
  message: string;
  stack?: string;
  context?: Record<string = 'execution.error',
  TIMEOUT_ERROR = 'timeout.error',
  CONNECTION_ERROR = 'connection.error',
  VALIDATION_ERROR = 'validation.error',
  UNKNOWN_ERROR = 'unknown.error'
}

/**
 * 错误详情接口
 */
export interface ErrorDetails {
  type, any>;
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