/**
 * Request Tracking Pipeline Operation
 * 请求跟踪流水线操作子
 */

import { PipelineBaseOperation, PipelineOperationConfig, PipelineOperationContext, PipelineOperationResult } from './PipelineBaseOperation';
import { OperationResult } from '../../../operations-framework/src/core/BaseOperationSimple';

/**
 * Request tracking parameters
 * 请求跟踪参数
 */
export interface RequestTrackingParams {
  provider: string;
  operation: string;
  generateRequestId?: boolean;
  includeMetadata?: boolean;
  sessionId?: string;
  metadata?: any;
}

/**
 * Request context implementation
 * 请求上下文实现
 */
export interface RequestContextImpl {
  requestId: string;
  pipelineId: string;
  provider: string;
  operation: string;
  sessionId: string;
  startTime: number;
  metadata: any;
  stages: Array<{
    name: string;
    status: 'started' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    data?: any;
  }>;
}

/**
 * Request Tracking Operation for pipeline monitoring
 * 用于流水线监控的请求跟踪操作子
 */
export class RequestTrackingPipelineOperation extends PipelineBaseOperation {
  name = 'request-tracking';
  description = 'Track API requests with unique IDs and pipeline monitoring';
  version = '1.0.0';
  abstractCategories = ['request-tracking', 'debug-logging', 'pipeline-monitoring'];
  supportedContainers = ['pipeline', 'provider', 'scheduler'];
  capabilities = ['request-id-generation', 'pipeline-monitoring', 'stage-tracking', 'performance-metrics'];

  // Request tracking storage
  private requestContexts: Map<string, RequestContextImpl> = new Map();
  private activeRequests: Set<string> = new Set();
  private requestCounter: number = 0;

  constructor() {
    super();
    this.requiredParameters = ['provider', 'operation'];
    this.optionalParameters = {
      generateRequestId: true,
      includeMetadata: true,
      sessionId: 'default',
      metadata: {}
    };
  }

  /**
   * Execute request tracking operation
   * 执行请求跟踪操作
   */
  protected async executePipelineOperation(
    context: PipelineOperationContext,
    params?: PipelineOperationConfig & RequestTrackingParams
  ): Promise<OperationResult> {
    try {
      // Validate parameters
      const validation = this.validateRequestTrackingParams(params);
      if (!validation.isValid) {
        throw new Error(`Invalid parameters: ${validation.errors?.join(', ')}`);
      }

      // Generate or use provided request ID
      const requestId = params.generateRequestId !== false
        ? this.generateRequestId(params.provider, params.operation)
        : context.request?.id || this.generateRequestId(params.provider, params.operation);

      const pipelineId = this.generatePipelineId();
      const sessionId = params.sessionId || 'default';
      const startTime = Date.now();

      // Create request context
      const requestContext: RequestContextImpl = {
        requestId,
        pipelineId,
        provider: params.provider,
        operation: params.operation,
        sessionId,
        startTime,
        metadata: params.includeMetadata !== false ? (params.metadata || {}) : {},
        stages: []
      };

      // Store request context
      this.requestContexts.set(requestId, requestContext);
      this.activeRequests.add(requestId);

      // Add initial stage
      this.addStageToRequest(requestId, 'request-tracking', 'started', startTime);

      // Store request context in operation context for later stages
      if (!context.request) {
        context.request = {
          id: requestId,
          provider: params.provider,
          operation: params.operation,
          metadata: params.metadata || {}
        };
      }

      // Update pipeline context
      if (!context.pipeline) {
        context.pipeline = {
          id: pipelineId,
          name: `${params.provider}-pipeline`,
          type: 'request-tracking'
        };
      }

      this.logger.info('Request tracking initialized', {
        requestId,
        pipelineId,
        provider: params.provider,
        operation: params.operation,
        sessionId
      });

      // Complete initial stage
      this.addStageToRequest(requestId, 'request-tracking', 'completed', Date.now());

      return {
        success: true,
        result: {
          requestId,
          pipelineId,
          sessionId,
          context: requestContext,
          trackingTime: Date.now() - startTime,
          activeRequests: this.activeRequests.size
        },
        data: {
          requestId,
          provider: params.provider,
          operation: params.operation,
          timestamp: startTime
        }
      };

    } catch (error) {
      this.logger.error('Request tracking operation failed', {
        error: error instanceof Error ? error.message : String(error),
        params: this.sanitizeParams(params)
      });

      throw error;
    }
  }

  /**
   * Validate request tracking parameters
   * 验证请求跟踪参数
   */
  private validateRequestTrackingParams(params?: RequestTrackingParams): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!params?.provider) {
      errors.push('Provider is required');
    }

    if (!params?.operation) {
      errors.push('Operation is required');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Generate unique request ID
   * 生成唯一请求ID
   */
  private generateRequestId(provider: string, operation: string): string {
    const timestamp = Date.now();
    const counter = ++this.requestCounter;
    const random = Math.random().toString(36).substring(2, 9);
    return `${provider}-${operation}-${timestamp}-${counter}-${random}`;
  }

  /**
   * Generate pipeline ID
   * 生成流水线ID
   */
  private generatePipelineId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 12);
    return `pipeline-${timestamp}-${random}`;
  }

  /**
   * Add stage to request context
   * 向请求上下文添加阶段
   */
  private addStageToRequest(
    requestId: string,
    stageName: string,
    status: 'started' | 'completed' | 'failed',
    timestamp: number,
    data?: any
  ): void {
    const requestContext = this.requestContexts.get(requestId);
    if (!requestContext) {
      this.logger.warn('Request context not found for stage addition', { requestId, stageName });
      return;
    }

    const existingStage = requestContext.stages.find(s => s.name === stageName);
    if (existingStage) {
      // Update existing stage
      existingStage.status = status;
      existingStage.endTime = timestamp;
      if (data !== undefined) {
        existingStage.data = data;
      }
    } else {
      // Add new stage
      requestContext.stages.push({
        name: stageName,
        status,
        startTime: timestamp,
        data
      });
    }

    this.logger.debug('Stage added to request', {
      requestId,
      stageName,
      status,
      timestamp,
      totalStages: requestContext.stages.length
    });
  }

  /**
   * Get request context by ID
   * 根据ID获取请求上下文
   */
  public getRequestContext(requestId: string): RequestContextImpl | undefined {
    return this.requestContexts.get(requestId);
  }

  /**
   * Complete request tracking
   * 完成请求跟踪
   */
  public completeRequest(requestId: string): RequestContextImpl | undefined {
    const requestContext = this.requestContexts.get(requestId);
    if (!requestContext) {
      this.logger.warn('Request context not found for completion', { requestId });
      return undefined;
    }

    // Remove from active requests
    this.activeRequests.delete(requestId);

    // Add completion stage
    this.addStageToRequest(requestId, 'request-completed', 'completed', Date.now());

    // Calculate total duration
    const totalDuration = Date.now() - requestContext.startTime;

    this.logger.info('Request tracking completed', {
      requestId,
      totalDuration,
      stages: requestContext.stages.length,
      success: requestContext.stages.every(s => s.status === 'completed')
    });

    return requestContext;
  }

  /**
   * Get active requests count
   * 获取活跃请求数量
   */
  public getActiveRequestsCount(): number {
    return this.activeRequests.size;
  }

  /**
   * Get request statistics
   * 获取请求统计信息
   */
  public getRequestStatistics() {
    const totalRequests = this.requestContexts.size;
    const activeRequests = this.activeRequests.size;
    const completedRequests = totalRequests - activeRequests;

    // Calculate average stages per request
    let totalStages = 0;
    let successfulStages = 0;
    let failedStages = 0;

    for (const context of this.requestContexts.values()) {
      totalStages += context.stages.length;
      successfulStages += context.stages.filter(s => s.status === 'completed').length;
      failedStages += context.stages.filter(s => s.status === 'failed').length;
    }

    return {
      totalRequests,
      activeRequests,
      completedRequests,
      averageStagesPerRequest: totalRequests > 0 ? totalStages / totalRequests : 0,
      stageSuccessRate: totalStages > 0 ? (successfulStages / totalStages) * 100 : 0,
      stageFailureRate: totalStages > 0 ? (failedStages / totalStages) * 100 : 0
    };
  }

  /**
   * Cleanup completed requests (prevent memory leaks)
   * 清理已完成的请求（防止内存泄漏）
   */
  public cleanupCompletedRequests(maxAge: number = 3600000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [requestId, context] of this.requestContexts.entries()) {
      if (!this.activeRequests.has(requestId) && (now - context.startTime) > maxAge) {
        this.requestContexts.delete(requestId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up completed requests', { cleanedCount, remainingRequests: this.requestContexts.size });
    }

    return cleanedCount;
  }

  /**
   * Reset operation state
   * 重置操作子状态
   */
  public reset(): void {
    this.requestContexts.clear();
    this.activeRequests.clear();
    this.requestCounter = 0;
    this.resetPipelineStats();
    this.logger.info('Request tracking operation reset');
  }

  /**
   * Get operation health status
   * 获取操作子健康状态
   */
  public getHealthStatus() {
    const stats = this.getPipelineStats();
    const requestStats = this.getRequestStatistics();

    return {
      name: this.name,
      status: 'healthy',
      stats,
      requestStats,
      memoryUsage: {
        activeContexts: this.requestContexts.size,
        activeRequests: this.activeRequests.size
      },
      capabilities: this.getCapabilities()
    };
  }
}