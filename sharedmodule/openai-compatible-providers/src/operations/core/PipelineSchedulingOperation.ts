/**
 * Pipeline Scheduling Operation
 * 流水线调度操作子
 */

import { PipelineBaseOperation, PipelineOperationConfig, PipelineOperationContext, PipelineOperationResult } from './PipelineBaseOperation';
import { OperationResult } from '../../../operations-framework/src/core/BaseOperationSimple';

/**
 * Scheduling configuration
 * 调度配置
 */
export interface SchedulingConfig {
  maxConcurrentRequests: number;
  requestTimeout: number;
  loadBalancingStrategy: 'round-robin' | 'random' | 'weighted' | 'least-connections';
  healthCheckInterval: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

/**
 * Pipeline target
 * 流水线目标
 */
export interface PipelineTarget {
  id: string;
  name: string;
  endpoint?: string;
  weight?: number;
  connectionCount?: number;
  isHealthy?: boolean;
  lastHealthCheck?: number;
}

/**
 * Scheduled request
 * 已调度的请求
 */
export interface ScheduledRequest {
  id: string;
  data: any;
  priority: number;
  timeout: number;
  timestamp: number;
  context?: PipelineOperationContext;
}

/**
 * Circuit breaker state
 * 熔断器状态
 */
export interface CircuitBreakerState {
  tripped: boolean;
  tripTime: number;
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

/**
 * Pipeline Scheduling Operation with load balancing and circuit breaker
 * 具有负载均衡和熔断器的流水线调度操作子
 */
export class PipelineSchedulingOperation extends PipelineBaseOperation {
  name = 'pipeline-scheduling';
  description = 'Schedule and execute pipeline requests with load balancing';
  version = '1.0.0';
  abstractCategories = ['scheduling', 'load-balancing', 'circuit-breaker'];
  supportedContainers = ['pipeline', 'scheduler'];
  capabilities = ['load-balancing', 'circuit-breaker', 'health-check', 'request-queueing'];

  // Pipeline management
  private pipelines: Map<string, PipelineTarget> = new Map();
  private requestQueue: ScheduledRequest[] = [];
  private activeRequests: Map<string, Promise<any>> = new Map();

  // Scheduling state
  private currentRoundRobinIndex: number = 0;
  private circuitBreakerState: CircuitBreakerState = {
    tripped: false,
    tripTime: 0,
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0
  };

  // Default configuration
  private config: SchedulingConfig = {
    maxConcurrentRequests: 10,
    requestTimeout: 30000,
    loadBalancingStrategy: 'round-robin',
    healthCheckInterval: 30000,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000
  };

  constructor() {
    super();
    this.requiredParameters = ['data'];
    this.optionalParameters = {
      priority: 0,
      timeout: 30000,
      strategy: 'round-robin'
    };

    // Initialize with default test pipelines
    this.initializeDefaultPipelines();
  }

  /**
   * Initialize default pipelines for testing
   * 初始化默认流水线用于测试
   */
  private initializeDefaultPipelines(): void {
    this.addPipeline({
      id: 'default-pipeline-1',
      name: 'Default Test Pipeline 1',
      endpoint: 'http://localhost:3000',
      weight: 1,
      isHealthy: true,
      lastHealthCheck: Date.now()
    });

    this.addPipeline({
      id: 'default-pipeline-2',
      name: 'Default Test Pipeline 2',
      endpoint: 'http://localhost:3001',
      weight: 2,
      isHealthy: true,
      lastHealthCheck: Date.now()
    });
  }

  /**
   * Execute pipeline scheduling operation
   * 执行流水线调度操作
   */
  protected async executePipelineOperation(
    context: PipelineOperationContext,
    params?: PipelineOperationConfig & Partial<SchedulingConfig>
  ): Promise<OperationResult> {
    try {
      // Update configuration if provided
      if (params) {
        this.updateConfig(params);
      }

      // Check circuit breaker state
      if (this.checkCircuitBreaker()) {
        throw new Error('Circuit breaker is tripped - requests are temporarily blocked');
      }

      // Check concurrent request limit
      if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
        return this.enqueueRequest(context, params?.data, params?.priority || 0, params?.timeout || this.config.requestTimeout);
      }

      // Select pipeline based on load balancing strategy
      const selectedPipeline = this.selectPipeline();
      if (!selectedPipeline) {
        throw new Error('No available pipelines for request execution');
      }

      // Execute request immediately
      return this.executeRequest(context, params?.data, selectedPipeline);

    } catch (error) {
      // Record failure for circuit breaker
      this.recordFailure();

      this.logger.error('Pipeline scheduling operation failed', {
        error: error instanceof Error ? error.message : String(error),
        activeRequests: this.activeRequests.size,
        queueLength: this.requestQueue.length,
        circuitBreakerState: this.circuitBreakerState
      });

      throw error;
    }
  }

  /**
   * Execute a request on the selected pipeline
   * 在选定的流水线上执行请求
   */
  private async executeRequest(
    context: PipelineOperationContext,
    data: any,
    pipeline: PipelineTarget
  ): Promise<PipelineOperationResult> {
    const requestId = context.request?.id || this.generateRequestId();
    const startTime = Date.now();

    try {
      this.logger.info('Executing request on pipeline', {
        requestId,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        startTime
      });

      // Create execution promise
      const executionPromise = this.performRequestExecution(context, data, pipeline);

      // Store active request
      this.activeRequests.set(requestId, executionPromise);

      // Execute with timeout
      const timeout = context.request?.metadata?.timeout || this.config.requestTimeout;
      const result = await this.executeWithTimeout(executionPromise, timeout);

      // Record success
      this.recordSuccess();

      // Update pipeline connection count
      if (pipeline.connectionCount !== undefined) {
        pipeline.connectionCount = Math.max(0, pipeline.connectionCount - 1);
      }

      // Remove from active requests
      this.activeRequests.delete(requestId);

      const executionTime = Date.now() - startTime;

      this.logger.info('Request executed successfully', {
        requestId,
        pipelineId: pipeline.id,
        executionTime,
        result: this.sanitizeResult(result)
      });

      return {
        success: true,
        result: {
          requestId,
          pipelineId: pipeline.id,
          executionTime,
          result
        },
        executionTime,
        metadata: {
          strategy: this.config.loadBalancingStrategy,
          pipelineName: pipeline.name,
          timeout
        }
      };

    } catch (error) {
      // Record failure
      this.recordFailure();

      // Update pipeline connection count
      if (pipeline.connectionCount !== undefined) {
        pipeline.connectionCount = Math.max(0, pipeline.connectionCount - 1);
      }

      // Remove from active requests
      this.activeRequests.delete(requestId);

      const executionTime = Date.now() - startTime;

      this.logger.error('Request execution failed', {
        requestId,
        pipelineId: pipeline.id,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Perform the actual request execution (to be overridden by specific implementations)
   * 执行实际的请求执行（由特定实现重写）
   */
  private async performRequestExecution(
    context: PipelineOperationContext,
    data: any,
    pipeline: PipelineTarget
  ): Promise<any> {
    // This is a placeholder implementation
    // In a real implementation, this would execute the actual pipeline logic
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work

    // Simulate some processing based on the data
    if (data && typeof data === 'object') {
      return {
        processed: true,
        pipeline: pipeline.name,
        timestamp: Date.now(),
        data: data
      };
    }

    return {
      processed: true,
      pipeline: pipeline.name,
      timestamp: Date.now()
    };
  }

  /**
   * Execute with timeout
   * 带超时执行
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Select pipeline based on load balancing strategy
   * 根据负载均衡策略选择流水线
   */
  private selectPipeline(): PipelineTarget | null {
    const healthyPipelines = Array.from(this.pipelines.values())
      .filter(p => p.isHealthy !== false);

    if (healthyPipelines.length === 0) {
      this.logger.warn('No healthy pipelines available');
      return null;
    }

    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        return this.selectPipelineRoundRobin(healthyPipelines);
      case 'random':
        return this.selectPipelineRandom(healthyPipelines);
      case 'weighted':
        return this.selectPipelineWeighted(healthyPipelines);
      case 'least-connections':
        return this.selectPipelineLeastConnections(healthyPipelines);
      default:
        return this.selectPipelineRoundRobin(healthyPipelines);
    }
  }

  /**
   * Round-robin strategy
   * 轮询策略
   */
  private selectPipelineRoundRobin(pipelines: PipelineTarget[]): PipelineTarget {
    const selected = pipelines[this.currentRoundRobinIndex % pipelines.length];
    this.currentRoundRobinIndex++;
    return selected;
  }

  /**
   * Random strategy
   * 随机策略
   */
  private selectPipelineRandom(pipelines: PipelineTarget[]): PipelineTarget {
    const randomIndex = Math.floor(Math.random() * pipelines.length);
    return pipelines[randomIndex];
  }

  /**
   * Weighted strategy
   * 权重策略
   */
  private selectPipelineWeighted(pipelines: PipelineTarget[]): PipelineTarget {
    const totalWeight = pipelines.reduce((sum, p) => sum + (p.weight || 1), 0);
    let random = Math.random() * totalWeight;
    let currentWeight = 0;

    for (const pipeline of pipelines) {
      currentWeight += pipeline.weight || 1;
      if (random <= currentWeight) {
        return pipeline;
      }
    }

    return pipelines[pipelines.length - 1];
  }

  /**
   * Least connections strategy
   * 最少连接策略
   */
  private selectPipelineLeastConnections(pipelines: PipelineTarget[]): PipelineTarget {
    return pipelines.reduce((best, current) => {
      const bestConnections = best.connectionCount || 0;
      const currentConnections = current.connectionCount || 0;
      return currentConnections < bestConnections ? current : best;
    });
  }

  /**
   * Enqueue request for later execution
   * 将请求加入队列等待执行
   */
  private async enqueueRequest(
    context: PipelineOperationContext,
    data: any,
    priority: number,
    timeout: number
  ): Promise<PipelineOperationResult> {
    const requestId = context.request?.id || this.generateRequestId();

    const scheduledRequest: ScheduledRequest = {
      id: requestId,
      data,
      priority,
      timeout,
      timestamp: Date.now(),
      context
    };

    // Add to queue (sorted by priority)
    this.requestQueue.push(scheduledRequest);
    this.requestQueue.sort((a, b) => b.priority - a.priority);

    this.logger.info('Request enqueued', {
      requestId,
      priority,
      queuePosition: this.requestQueue.length,
      estimatedWaitTime: this.estimateWaitTime()
    });

    // Wait for execution
    return new Promise((resolve, reject) => {
      const checkQueue = () => {
        const index = this.requestQueue.findIndex(r => r.id === requestId);
        if (index === -1) {
          // Request was processed
          return;
        }

        // Check if we can execute now
        if (this.activeRequests.size < this.config.maxConcurrentRequests) {
          const request = this.requestQueue.splice(index, 1)[0];
          this.executeRequest(context!, data, this.selectPipeline()!)
            .then(resolve)
            .catch(reject);
        } else {
          // Continue waiting
          setTimeout(checkQueue, 100);
        }
      };

      checkQueue();
    });
  }

  /**
   * Estimate wait time for queued requests
   * 估算队列等待时间
   */
  private estimateWaitTime(): number {
    const queueAhead = this.requestQueue.length;
    const avgProcessingTime = 1000; // Estimated average processing time
    const concurrency = this.config.maxConcurrentRequests;

    return (queueAhead / concurrency) * avgProcessingTime;
  }

  /**
   * Check and manage circuit breaker state
   * 检查和管理熔断器状态
   */
  private checkCircuitBreaker(): boolean {
    if (!this.config.enableCircuitBreaker) {
      return false;
    }

    const now = Date.now();

    // Check if we need to trip the circuit breaker
    if (!this.circuitBreakerState.tripped) {
      if (this.circuitBreakerState.failureCount >= this.config.circuitBreakerThreshold) {
        this.circuitBreakerState.tripped = true;
        this.circuitBreakerState.tripTime = now;
        this.logger.warn('Circuit breaker tripped due to high failure rate');
      }
    }

    // Check if we can recover
    if (this.circuitBreakerState.tripped) {
      if (now - this.circuitBreakerState.tripTime > this.config.circuitBreakerTimeout) {
        this.circuitBreakerState.tripped = false;
        this.circuitBreakerState.failureCount = 0;
        this.circuitBreakerState.successCount = 0;
        this.logger.info('Circuit breaker recovered');
      }
    }

    return this.circuitBreakerState.tripped;
  }

  /**
   * Record successful execution
   * 记录成功执行
   */
  private recordSuccess(): void {
    if (this.circuitBreakerState.tripped) {
      this.circuitBreakerState.successCount++;

      // If we have enough successes, reset the circuit breaker
      if (this.circuitBreakerState.successCount >= 3) {
        this.circuitBreakerState.tripped = false;
        this.circuitBreakerState.failureCount = 0;
        this.circuitBreakerState.successCount = 0;
        this.logger.info('Circuit breaker reset after successful executions');
      }
    }
  }

  /**
   * Record failed execution
   * 记录失败执行
   */
  private recordFailure(): void {
    this.circuitBreakerState.failureCount++;
    this.circuitBreakerState.lastFailureTime = Date.now();
  }

  /**
   * Update configuration
   * 更新配置
   */
  private updateConfig(newConfig: Partial<SchedulingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Scheduling configuration updated', { config: this.config });
  }

  /**
   * Add pipeline target
   * 添加流水线目标
   */
  public addPipeline(pipeline: PipelineTarget): void {
    this.pipelines.set(pipeline.id, pipeline);
    this.logger.info('Pipeline added', { pipelineId: pipeline.id, pipelineName: pipeline.name });
  }

  /**
   * Remove pipeline target
   * 移除流水线目标
   */
  public removePipeline(pipelineId: string): boolean {
    const removed = this.pipelines.delete(pipelineId);
    if (removed) {
      this.logger.info('Pipeline removed', { pipelineId });
    }
    return removed;
  }

  /**
   * Get scheduler metrics
   * 获取调度器指标
   */
  public getSchedulerMetrics() {
    return {
      config: this.config,
      circuitBreaker: this.circuitBreakerState,
      pipelines: Array.from(this.pipelines.values()),
      activeRequests: this.activeRequests.size,
      queueLength: this.requestQueue.length,
      totalPipelines: this.pipelines.size,
      healthyPipelines: Array.from(this.pipelines.values()).filter(p => p.isHealthy !== false).length
    };
  }

  /**
   * Generate request ID
   * 生成请求ID
   */
  private generateRequestId(): string {
    return `sched-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Reset operation state
   * 重置操作子状态
   */
  public reset(): void {
    this.pipelines.clear();
    this.requestQueue.length = 0;
    this.activeRequests.clear();
    this.currentRoundRobinIndex = 0;
    this.circuitBreakerState = {
      tripped: false,
      tripTime: 0,
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0
    };
    this.resetPipelineStats();
    this.logger.info('Pipeline scheduling operation reset');
  }
}