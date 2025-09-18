/**
 * Pipeline Scheduler - Handles scheduling for one virtual model
 * 流水线调度器 - 处理单个虚拟模型的调度
 */

import { Pipeline } from './Pipeline';
import { PipelineTracker } from './PipelineTracker';
import { IRequestContext } from '../interfaces/IRequestContext';

// Define operation type locally
type OperationType = 'chat' | 'streamChat' | 'healthCheck';

export interface SchedulerConfig {
  maxConcurrentRequests: number;
  requestTimeout: number;
  healthCheckInterval: number;
  retryStrategy: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  loadBalancingStrategy: 'round-robin' | 'weighted' | 'least-connections' | 'random';
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

export interface SchedulerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  currentConcurrentRequests: number;
  averageResponseTime: number;
  errorRate: number;
  uptime: number;
  lastHealthCheck: number;
  circuitBreakerTripped: boolean;
  circuitBreakerTripCount: number;
  queueLength: number;
  averageQueueTime: number;
}

export interface SchedulerHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    pipelineHealth: boolean;
    errorRate: boolean;
    responseTime: boolean;
    circuitBreaker: boolean;
    concurrency: boolean;
  };
  details: {
    healthyPipelines: number;
    totalPipelines: number;
    currentErrorRate: number;
    averageResponseTime: number;
    circuitBreakerTripped: boolean;
    currentConcurrency: number;
    maxConcurrency: number;
  };
}

export interface RequestPriority {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  timestamp: number;
}

export interface ScheduledRequest {
  id: string;
  request: any;
  operation: OperationType;
  priority: RequestPriority;
  timestamp: number;
  timeout?: number;
  metadata?: Record<string, any>;
}

export interface SchedulerOptions {
  timeout?: number;
  retries?: number;
  priority?: RequestPriority['level'];
  healthCheck?: boolean;
  circuitBreaker?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Pipeline Scheduler - Manages request scheduling for a single virtual model
 * 流水线调度器 - 管理单个虚拟模型的请求调度
 */
export class PipelineScheduler {
  private virtualModelId: string;
  private config: SchedulerConfig;
  private pipelines: Map<string, Pipeline> = new Map();
  private pipelineTracker: PipelineTracker;
  private currentPipelineIndex: number = 0;
  private metrics: SchedulerMetrics;
  private requestQueue: ScheduledRequest[] = [];
  private activeRequests: Map<string, Promise<any>> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private circuitBreakerState = {
    tripped: false,
    tripTime: 0,
    failureCount: 0,
    lastFailureTime: 0
  };

  constructor(
    virtualModelId: string,
    config: SchedulerConfig,
    pipelineTracker: PipelineTracker
  ) {
    this.virtualModelId = virtualModelId;
    this.config = config;
    this.pipelineTracker = pipelineTracker;

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      currentConcurrentRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      uptime: Date.now(),
      lastHealthCheck: Date.now(),
      circuitBreakerTripped: false,
      circuitBreakerTripCount: 0,
      queueLength: 0,
      averageQueueTime: 0
    };

    // Start health checks
    this.startHealthChecks();
    this.startRequestProcessing();
  }

  /**
   * Add pipeline to scheduler
   * 向调度器添加流水线
   */
  addPipeline(pipeline: Pipeline): void {
    if (pipeline.getConfig().virtualModelId !== this.virtualModelId) {
      throw new Error(`Pipeline virtual model ID mismatch. Expected: ${this.virtualModelId}, Got: ${pipeline.getConfig().virtualModelId}`);
    }

    this.pipelines.set(pipeline.getConfig().id, pipeline);
    this.updateHealthCheck();
  }

  /**
   * Remove pipeline from scheduler
   * 从调度器移除流水线
   */
  removePipeline(pipelineId: string): boolean {
    const removed = this.pipelines.delete(pipelineId);
    if (removed) {
      this.updateHealthCheck();
    }
    return removed;
  }

  /**
   * Execute request through scheduler
   * 通过调度器执行请求
   */
  async execute(
    request: any,
    operation: OperationType,
    options?: SchedulerOptions
  ): Promise<any> {
    const requestId = `sched_${this.virtualModelId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Check circuit breaker
      if (this.config.enableCircuitBreaker && this.isCircuitBreakerTripped()) {
        throw new Error('Circuit breaker is tripped - requests temporarily blocked');
      }

      // Check concurrency limit
      if (this.metrics.currentConcurrentRequests >= this.config.maxConcurrentRequests) {
        // Queue the request
        return this.queueRequest(request, operation, options);
      }

      // Create scheduled request
      const scheduledRequest: ScheduledRequest = {
        id: requestId,
        request,
        operation,
        priority: {
          level: options?.priority || 'medium',
          score: this.calculatePriorityScore(options?.priority || 'medium'),
          timestamp: Date.now()
        },
        timestamp: startTime,
        timeout: options?.timeout || this.config.requestTimeout,
        metadata: options?.metadata
      };

      // Execute with retry logic
      const result = await this.executeWithRetry(scheduledRequest, options);

      // Update metrics
      this.metrics.successfulRequests++;
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;
      this.updateAverageResponseTime(Date.now() - startTime);

      // Reset circuit breaker on success
      if (this.config.enableCircuitBreaker) {
        this.resetCircuitBreaker();
      }

      return result;

    } catch (error: any) {
      // Update error metrics
      this.metrics.failedRequests++;
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;

      // Update circuit breaker
      if (this.config.enableCircuitBreaker) {
        this.updateCircuitBreaker(error);
      }

      throw error;
    } finally {
      this.metrics.totalRequests++;
    }
  }

  /**
   * Execute streaming request through scheduler
   * 通过调度器执行流式请求
   */
  async *executeStreaming(
    request: any,
    operation: OperationType,
    options?: SchedulerOptions
  ): AsyncGenerator<any, void, unknown> {
    const requestId = `stream_${this.virtualModelId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Check circuit breaker
      if (this.config.enableCircuitBreaker && this.isCircuitBreakerTripped()) {
        throw new Error('Circuit breaker is tripped - streaming requests temporarily blocked');
      }

      // Select pipeline
      const pipeline = this.selectPipeline();
      if (!pipeline) {
        throw new Error('No available pipelines for streaming execution');
      }

      // Create request context if tracker is available
      let requestContext: IRequestContext | undefined;
      if (this.pipelineTracker) {
        requestContext = this.pipelineTracker.createRequestContext(
          this.virtualModelId,
          operation,
          {
            schedulerId: this.virtualModelId,
            streaming: true,
            ...options?.metadata
          }
        );
      }

      // Execute streaming request
      const stream = pipeline.executeStreaming(request, operation, {
        timeout: options?.timeout || this.config.requestTimeout,
        requestContext,
        metadata: options?.metadata
      });

      // Update concurrent requests
      this.metrics.currentConcurrentRequests++;
      this.activeRequests.set(requestId, Promise.resolve());

      try {
        for await (const chunk of stream) {
          yield chunk;
        }
      } finally {
        // Cleanup
        this.metrics.currentConcurrentRequests--;
        this.activeRequests.delete(requestId);
      }

    } catch (error: any) {
      // Update error metrics
      this.metrics.failedRequests++;
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;

      // Update circuit breaker
      if (this.config.enableCircuitBreaker) {
        this.updateCircuitBreaker(error);
      }

      throw error;
    } finally {
      this.metrics.totalRequests++;
    }
  }

  /**
   * Execute with retry logic
   * 带重试逻辑执行
   */
  private async executeWithRetry(
    scheduledRequest: ScheduledRequest,
    options?: SchedulerOptions
  ): Promise<any> {
    const maxRetries = options?.retries ?? this.config.retryStrategy.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Select pipeline
        const pipeline = this.selectPipeline();
        if (!pipeline) {
          throw new Error('No available pipelines for request execution');
        }

        // Create request context if tracker is available
        let requestContext: IRequestContext | undefined;
        if (this.pipelineTracker) {
          requestContext = this.pipelineTracker.createRequestContext(
            this.virtualModelId,
            scheduledRequest.operation,
            {
              schedulerId: this.virtualModelId,
              attempt: attempt + 1,
              priority: scheduledRequest.priority.level,
              ...scheduledRequest.metadata
            }
          );
        }

        // Update concurrent requests
        this.metrics.currentConcurrentRequests++;
        this.activeRequests.set(scheduledRequest.id, Promise.resolve());

        try {
          // Execute request
          const result = await pipeline.execute(
            scheduledRequest.request,
            scheduledRequest.operation,
            {
              timeout: scheduledRequest.timeout,
              requestContext,
              metadata: scheduledRequest.metadata
            }
          );

          return result;
        } finally {
          // Cleanup
          this.metrics.currentConcurrentRequests--;
          this.activeRequests.delete(scheduledRequest.id);
        }

      } catch (error: any) {
        lastError = error;

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Unknown error in retry logic');
  }

  /**
   * Queue request for later processing
   * 将请求排队等待后续处理
   */
  private async queueRequest(
    request: any,
    operation: OperationType,
    options?: SchedulerOptions
  ): Promise<any> {
    const queuedRequest: ScheduledRequest = {
      id: `queue_${this.virtualModelId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      request,
      operation,
      priority: {
        level: options?.priority || 'medium',
        score: this.calculatePriorityScore(options?.priority || 'medium'),
        timestamp: Date.now()
      },
      timestamp: Date.now(),
      timeout: options?.timeout || this.config.requestTimeout,
      metadata: options?.metadata
    };

    // Add to queue
    this.requestQueue.push(queuedRequest);
    this.metrics.queueLength = this.requestQueue.length;

    // Wait for request to be processed
    return new Promise((resolve, reject) => {
      const checkQueue = () => {
        const index = this.requestQueue.findIndex(req => req.id === queuedRequest.id);
        if (index === -1) {
          // Request was processed
          resolve(queuedRequest);
        } else {
          // Still in queue, check again
          setTimeout(checkQueue, 100);
        }
      };
      checkQueue();
    });
  }

  /**
   * Start request processing from queue
   * 开始从队列处理请求
   */
  private startRequestProcessing(): void {
    setInterval(() => {
      this.processQueue();
    }, 100); // Process queue every 100ms
  }

  /**
   * Process queued requests
   * 处理排队请求
   */
  private async processQueue(): Promise<void> {
    if (this.requestQueue.length === 0) {
      return;
    }

    if (this.metrics.currentConcurrentRequests >= this.config.maxConcurrentRequests) {
      return; // Still at concurrency limit
    }

    // Sort by priority (highest first)
    this.requestQueue.sort((a, b) => b.priority.score - a.priority.score);

    // Process as many as we can
    const availableSlots = this.config.maxConcurrentRequests - this.metrics.currentConcurrentRequests;
    const toProcess = this.requestQueue.splice(0, availableSlots);

    // Update queue metrics
    this.metrics.queueLength = this.requestQueue.length;

    // Process requests
    for (const request of toProcess) {
      try {
        await this.executeWithRetry(request);
      } catch (error) {
        console.error(`Failed to process queued request ${request.id}:`, error);
      }
    }
  }

  /**
   * Select pipeline using configured strategy
   * 使用配置策略选择流水线
   */
  private selectPipeline(): Pipeline | null {
    const healthyPipelines = Array.from(this.pipelines.values()).filter(p => p.isHealthy());
    if (healthyPipelines.length === 0) {
      return null;
    }

    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        return this.selectRoundRobin(healthyPipelines);
      case 'weighted':
        return this.selectWeighted(healthyPipelines);
      case 'least-connections':
        return this.selectLeastConnections(healthyPipelines);
      case 'random':
        return this.selectRandom(healthyPipelines);
      default:
        return this.selectRoundRobin(healthyPipelines);
    }
  }

  /**
   * Round-robin pipeline selection
   * 轮询流水线选择
   */
  private selectRoundRobin(pipelines: Pipeline[]): Pipeline {
    const pipeline = pipelines[this.currentPipelineIndex % pipelines.length];
    this.currentPipelineIndex = (this.currentPipelineIndex + 1) % pipelines.length;
    return pipeline;
  }

  /**
   * Weighted pipeline selection
   * 加权流水线选择
   */
  private selectWeighted(pipelines: Pipeline[]): Pipeline {
    const totalWeight = pipelines.reduce((sum, p) => {
      const metrics = p.getMetrics();
      return sum + (metrics.successfulRequests / Math.max(metrics.totalRequests, 1));
    }, 0);

    let random = Math.random() * totalWeight;

    for (const pipeline of pipelines) {
      const metrics = pipeline.getMetrics();
      const weight = metrics.successfulRequests / Math.max(metrics.totalRequests, 1);
      random -= weight;
      if (random <= 0) {
        return pipeline;
      }
    }

    return pipelines[0]; // Fallback
  }

  /**
   * Least connections pipeline selection
   * 最少连接流水线选择
   */
  private selectLeastConnections(pipelines: Pipeline[]): Pipeline {
    return pipelines.reduce((least, current) => {
      const leastMetrics = least.getMetrics();
      const currentMetrics = current.getMetrics();
      return currentMetrics.currentTargets < leastMetrics.currentTargets ? current : least;
    });
  }

  /**
   * Random pipeline selection
   * 随机流水线选择
   */
  private selectRandom(pipelines: Pipeline[]): Pipeline {
    return pipelines[Math.floor(Math.random() * pipelines.length)];
  }

  /**
   * Calculate retry delay with exponential backoff
   * 计算带指数退避的重试延迟
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      this.config.retryStrategy.baseDelay * Math.pow(this.config.retryStrategy.backoffMultiplier, attempt),
      this.config.retryStrategy.maxDelay
    );
    return delay + Math.random() * delay * 0.1; // Add jitter
  }

  /**
   * Calculate priority score
   * 计算优先级分数
   */
  private calculatePriorityScore(priority: RequestPriority['level']): number {
    switch (priority) {
      case 'critical': return 100;
      case 'high': return 75;
      case 'medium': return 50;
      case 'low': return 25;
      default: return 50;
    }
  }

  /**
   * Circuit breaker operations
   * 熔断器操作
   */
  private isCircuitBreakerTripped(): boolean {
    if (!this.config.enableCircuitBreaker) {
      return false;
    }

    const now = Date.now();
    const timeSinceTrip = now - this.circuitBreakerState.tripTime;

    // Auto-reset after timeout
    if (this.circuitBreakerState.tripped && timeSinceTrip > this.config.circuitBreakerTimeout) {
      this.resetCircuitBreaker();
      return false;
    }

    return this.circuitBreakerState.tripped;
  }

  private updateCircuitBreaker(error: Error): void {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    this.circuitBreakerState.failureCount++;
    this.circuitBreakerState.lastFailureTime = Date.now();

    if (this.circuitBreakerState.failureCount >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerState.tripped = true;
      this.circuitBreakerState.tripTime = Date.now();
      this.metrics.circuitBreakerTripped = true;
      this.metrics.circuitBreakerTripCount++;
    }
  }

  private resetCircuitBreaker(): void {
    this.circuitBreakerState = {
      tripped: false,
      tripTime: 0,
      failureCount: 0,
      lastFailureTime: 0
    };
    this.metrics.circuitBreakerTripped = false;
  }

  /**
   * Health check operations
   * 健康检查操作
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckInterval
    );
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check pipeline health
      for (const pipeline of this.pipelines.values()) {
        if (!pipeline.isHealthy()) {
          console.warn(`Pipeline ${pipeline.getConfig().id} is unhealthy`);
        }
      }

      this.updateHealthCheck();
      this.metrics.lastHealthCheck = Date.now();
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  private updateHealthCheck(): void {
    const healthyPipelines = Array.from(this.pipelines.values()).filter(p => p.isHealthy());
    const isHealthy = healthyPipelines.length > 0;

    // Update health status based on various factors
    const status: SchedulerHealth['status'] = isHealthy ?
      (this.metrics.errorRate < 0.1 ? 'healthy' : 'degraded') : 'unhealthy';

    // Update health metrics
    this.metrics.circuitBreakerTripped = this.circuitBreakerState.tripped;
  }

  /**
   * Update average response time
   * 更新平均响应时间
   */
  private updateAverageResponseTime(newDuration: number): void {
    const totalDuration = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1);
    this.metrics.averageResponseTime = (totalDuration + newDuration) / this.metrics.totalRequests;
  }

  /**
   * Utility functions
   * 实用函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get scheduler metrics
   * 获取调度器指标
   */
  getMetrics(): SchedulerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get scheduler health
   * 获取调度器健康状态
   */
  getHealth(): SchedulerHealth {
    const healthyPipelines = Array.from(this.pipelines.values()).filter(p => p.isHealthy());
    const totalPipelines = this.pipelines.size;

    return {
      status: healthyPipelines.length > 0 ?
        (this.metrics.errorRate < 0.1 ? 'healthy' : 'degraded') : 'unhealthy',
      checks: {
        pipelineHealth: healthyPipelines.length > 0,
        errorRate: this.metrics.errorRate < 0.1,
        responseTime: this.metrics.averageResponseTime < 10000,
        circuitBreaker: !this.circuitBreakerState.tripped,
        concurrency: this.metrics.currentConcurrentRequests < this.config.maxConcurrentRequests
      },
      details: {
        healthyPipelines: healthyPipelines.length,
        totalPipelines,
        currentErrorRate: this.metrics.errorRate,
        averageResponseTime: this.metrics.averageResponseTime,
        circuitBreakerTripped: this.circuitBreakerState.tripped,
        currentConcurrency: this.metrics.currentConcurrentRequests,
        maxConcurrency: this.config.maxConcurrentRequests
      }
    };
  }

  /**
   * Get scheduler configuration
   * 获取调度器配置
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Get all pipelines
   * 获取所有流水线
   */
  getPipelines(): Pipeline[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Get virtual model ID
   * 获取虚拟模型ID
   */
  getVirtualModelId(): string {
    return this.virtualModelId;
  }

  /**
   * Destroy scheduler and cleanup resources
   * 销毁调度器并清理资源
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Destroy all pipelines
    for (const pipeline of this.pipelines.values()) {
      pipeline.destroy();
    }

    this.pipelines.clear();
    this.requestQueue.length = 0;
    this.activeRequests.clear();
  }
}