/**
 * Operation Interfaces for Pipeline System
 * 流水线系统操作子接口
 */

// Define interfaces locally to avoid import issues
export interface OperationConfig {
  [key: string]: any;
}

export interface OperationResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: any;
  data?: any;
}

export interface OperationContext {
  id: string;
  browser?: any;
  page?: any;
  metadata?: {
    startTime: Date;
    userAgent?: string;
    viewport?: { width: number; height: number };
  };
  logger?: {
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
    debug: (message: string, data?: any) => void;
  };
  eventBus?: any;
}

/**
 * Pipeline operation specific interfaces
 * 流水线操作子特定接口
 */
export interface PipelineOperationConfig extends OperationConfig {
  pipelineId?: string;
  requestId?: string;
  stage?: string;
  provider?: string;
  operation?: string;
  metadata?: any;
}

/**
 * Pipeline operation context
 * 流水线操作子上下文
 */
export interface PipelineOperationContext extends OperationContext {
  pipeline?: {
    id: string;
    name: string;
    type: string;
  };
  request?: {
    id: string;
    provider: string;
    operation: string;
    metadata: any;
  };
  stage?: {
    name: string;
    status: 'started' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    data?: any;
  };
}

/**
 * Pipeline operation result
 * 流水线操作子结果
 */
export interface PipelineOperationResult extends OperationResult {
  pipelineId?: string;
  requestId?: string;
  stage?: string;
  executionTime?: number;
  performance?: {
    success: boolean;
    duration: number;
    throughput: number;
    errorRate: number;
  };
}

/**
 * Request tracking operation
 * 请求跟踪操作子
 */
export interface RequestTrackingOperation {
  name: 'request-tracking';
  description: 'Track API requests with unique IDs and pipeline monitoring';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Pipeline scheduling operation
 * 流水线调度操作子
 */
export interface PipelineSchedulingOperation {
  name: 'pipeline-scheduling';
  description: 'Schedule and execute pipeline requests with load balancing';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Provider execution operation
 * 提供者执行操作子
 */
export interface ProviderExecutionOperation {
  name: 'provider-execution';
  description: 'Execute AI provider requests with authentication and error handling';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Stream processing operation
 * 流处理操作子
 */
export interface StreamProcessingOperation {
  name: 'stream-processing';
  description: 'Process streaming AI responses with real-time data handling';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Load balancing operation
 * 负载均衡操作子
 */
export interface LoadBalancingOperation {
  name: 'load-balancing';
  description: 'Determine optimal pipeline selection based on load balancing strategy';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Circuit breaker operation
 * 熔断器操作子
 */
export interface CircuitBreakerOperation {
  name: 'circuit-breaker';
  description: 'Implement circuit breaker pattern for fault tolerance';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Health check operation
 * 健康检查操作子
 */
export interface HealthCheckOperation {
  name: 'health-check';
  description: 'Check pipeline and provider health status';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Metrics collection operation
 * 指标收集操作子
 */
export interface MetricsCollectionOperation {
  name: 'metrics-collection';
  description: 'Collect and aggregate pipeline performance metrics';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Configuration management operation
 * 配置管理操作子
 */
export interface ConfigurationManagementOperation {
  name: 'configuration-management';
  description: 'Manage pipeline configuration and dynamic updates';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * OAuth authentication operation
 * OAuth认证操作子
 */
export interface OAuthAuthenticationOperation {
  name: 'oauth-authentication';
  description: 'Handle OAuth 2.0 authentication flows and token management';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Pipeline workflow operation
 * 流水线工作流操作子
 */
export interface PipelineWorkflowOperation {
  name: 'pipeline-workflow';
  description: 'Execute complex pipeline workflows with multiple stages';
  execute(context: PipelineOperationContext, params: PipelineOperationConfig): Promise<PipelineOperationResult>;
}

/**
 * Operation registry interface
 * 操作子注册表接口
 */
export interface PipelineOperationRegistry {
  registerOperation(operation: any): void;
  getOperation(name: string): any;
  listOperations(): string[];
  getOperationsByCategory(category: string): any[];
  getOperationsByCapability(capability: string): any[];
}

/**
 * Pipeline operation factory interface
 * 流水线操作子工厂接口
 */
export interface PipelineOperationFactory {
  createOperation(type: string, config: PipelineOperationConfig): any;
  createWorkflow(definition: any): any;
  validateOperationConfig(config: PipelineOperationConfig): boolean;
}

/**
 * All pipeline operation types
 * 所有流水线操作子类型
 */
export type PipelineOperationType =
  | RequestTrackingOperation
  | PipelineSchedulingOperation
  | ProviderExecutionOperation
  | StreamProcessingOperation
  | LoadBalancingOperation
  | CircuitBreakerOperation
  | HealthCheckOperation
  | MetricsCollectionOperation
  | ConfigurationManagementOperation
  | OAuthAuthenticationOperation
  | PipelineWorkflowOperation;