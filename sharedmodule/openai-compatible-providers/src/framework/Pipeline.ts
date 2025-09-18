/**
 * Pipeline Class - Represents a single pipeline with multiple targets
 * 流水线类 - 表示包含多个目标的单一流水线
 */

import { BaseProvider } from './BaseProvider';
import { PipelineTracker } from './PipelineTracker';
import { IRequestContext } from '../interfaces/IRequestContext';
import { IPipelineStage } from '../interfaces/IPipelineStage';
// Define operation type locally
type OperationType = 'chat' | 'streamChat' | 'healthCheck';

export interface PipelineTarget {
  id: string;
  provider: BaseProvider;
  weight: number;
  enabled: boolean;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: number;
  requestCount: number;
  errorCount: number;
  metadata?: Record<string, any>;
}

export interface PipelineConfig {
  id: string;
  name: string;
  virtualModelId: string;
  description?: string;
  targets: PipelineTarget[];
  loadBalancingStrategy: 'round-robin' | 'weighted' | 'least-connections' | 'random';
  healthCheckInterval: number;
  maxRetries: number;
  timeout: number;
  metadata?: Record<string, any>;
}

export interface PipelineMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  currentTargets: number;
  healthyTargets: number;
  unhealthyTargets: number;
  errorRate: number;
  uptime: number;
  lastUsed: number;
}

export interface PipelineExecutionOptions {
  timeout?: number;
  retries?: number;
  requestContext?: IRequestContext;
  healthCheck?: boolean;
  metadata?: Record<string, any>;
}

export interface PipelineExecutionResult {
  pipelineId: string;
  targetId: string;
  success: boolean;
  response?: any;
  error?: string;
  duration: number;
  timestamp: number;
  targetMetrics: {
    requestCount: number;
    errorCount: number;
    healthStatus: string;
  };
  stages?: IPipelineStage[];
}

/**
 * Pipeline Class - Manages multiple targets with load balancing
 * 流水线类 - 管理多个目标并进行负载均衡
 */
export class Pipeline {
  private config: PipelineConfig;
  private targets: Map<string, PipelineTarget> = new Map();
  private currentTargetIndex: number = 0;
  private metrics: PipelineMetrics;
  private healthCheckInterval?: NodeJS.Timeout;
  private pipelineTracker: PipelineTracker;

  constructor(config: PipelineConfig, pipelineTracker: PipelineTracker) {
    this.config = config;
    this.pipelineTracker = pipelineTracker;

    // Initialize targets
    config.targets.forEach(target => {
      this.targets.set(target.id, { ...target });
    });

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      currentTargets: this.targets.size,
      healthyTargets: this.getHealthyTargets().length,
      unhealthyTargets: this.getUnhealthyTargets().length,
      errorRate: 0,
      uptime: Date.now(),
      lastUsed: 0
    };

    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Execute a request through the pipeline
   * 通过流水线执行请求
   */
  async execute(
    request: any,
    operation: OperationType,
    options?: PipelineExecutionOptions
  ): Promise<PipelineExecutionResult> {
    const startTime = Date.now();

    try {
      // Select target based on load balancing strategy
      const target = this.selectTarget();
      if (!target) {
        throw new Error('No available targets for pipeline execution');
      }

      // Create request context if provided
      let requestContext: IRequestContext | undefined;
      if (options?.requestContext) {
        requestContext = options.requestContext;
      } else if (this.pipelineTracker) {
        requestContext = this.pipelineTracker.createRequestContext(
          target.provider.getProviderInfo().name,
          operation,
          {
            pipelineId: this.config.id,
            targetId: target.id,
            virtualModelId: this.config.virtualModelId,
            ...options?.metadata
          }
        );
      }

      // Add pipeline stage
      if (requestContext) {
        this.pipelineTracker.addStage(requestContext.getRequestId(), 'pipeline_execution');
      }

      // Update metrics
      this.metrics.totalRequests++;
      this.metrics.lastUsed = Date.now();
      target.requestCount++;

      // Execute request with timeout
      const timeout = options?.timeout || this.config.timeout;
      const result = await this.executeWithTimeout(
        target.provider.chat(request),
        timeout
      );

      // Update target metrics
      target.healthStatus = 'healthy';
      target.lastHealthCheck = Date.now();

      // Update pipeline metrics
      this.metrics.successfulRequests++;
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;

      // Complete pipeline stage
      if (requestContext) {
        this.pipelineTracker.completeStage(
          requestContext.getRequestId(),
          'pipeline_execution',
          { result, targetId: target.id }
        );
      }

      const duration = Date.now() - startTime;
      this.updateAverageResponseTime(duration);

      return {
        pipelineId: this.config.id,
        targetId: target.id,
        success: true,
        response: result,
        duration,
        timestamp: startTime,
        targetMetrics: {
          requestCount: target.requestCount,
          errorCount: target.errorCount,
          healthStatus: target.healthStatus
        },
        stages: requestContext?.getStages().map(stage => this.pipelineTracker?.getStageFactory().createStageFromObject(stage))
      };

    } catch (error: any) {
      // Update error metrics
      this.metrics.failedRequests++;
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;

      // Update target error count
      const target = this.selectTarget();
      if (target) {
        target.errorCount++;
        target.healthStatus = 'unhealthy';
      }

      // Fail pipeline stage
      if (options?.requestContext) {
        this.pipelineTracker.failStage(
          options.requestContext.getRequestId(),
          'pipeline_execution',
          error.message
        );
      }

      const duration = Date.now() - startTime;

      return {
        pipelineId: this.config.id,
        targetId: target?.id || 'unknown',
        success: false,
        error: error.message,
        duration,
        timestamp: startTime,
        targetMetrics: {
          requestCount: target?.requestCount || 0,
          errorCount: target?.errorCount || 0,
          healthStatus: target?.healthStatus || 'unknown'
        },
        stages: options?.requestContext?.getStages().map(stage => this.pipelineTracker?.getStageFactory().createStageFromObject(stage))
      };
    }
  }

  /**
   * Execute streaming request through the pipeline
   * 通过流水线执行流式请求
   */
  async *executeStreaming(
    request: any,
    operation: OperationType,
    options?: PipelineExecutionOptions
  ): AsyncGenerator<PipelineExecutionResult, void, unknown> {
    const target = this.selectTarget();
    if (!target) {
      throw new Error('No available targets for streaming execution');
    }

    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      // Create request context if provided
      let requestContext: IRequestContext | undefined;
      if (options?.requestContext) {
        requestContext = options.requestContext;
      } else if (this.pipelineTracker) {
        requestContext = this.pipelineTracker.createRequestContext(
          target.provider.getProviderInfo().name,
          operation,
          {
            pipelineId: this.config.id,
            targetId: target.id,
            virtualModelId: this.config.virtualModelId,
            ...options?.metadata
          }
        );
      }

      // Add pipeline stage
      if (requestContext) {
        this.pipelineTracker.addStage(requestContext.getRequestId(), 'pipeline_streaming');
      }

      // Update metrics
      this.metrics.totalRequests++;
      this.metrics.lastUsed = Date.now();
      target.requestCount++;

      // Execute streaming request
      const stream = target.provider.streamChat(request);

      for await (const chunk of stream) {
        const duration = Date.now() - startTime;

        yield {
          pipelineId: this.config.id,
          targetId: target.id,
          success: true,
          response: chunk,
          duration,
          timestamp: startTime,
          targetMetrics: {
            requestCount: target.requestCount,
            errorCount: target.errorCount,
            healthStatus: target.healthStatus
          }
        };
      }

      // Update target metrics
      target.healthStatus = 'healthy';
      target.lastHealthCheck = Date.now();
      this.metrics.successfulRequests++;
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;

      // Complete pipeline stage
      if (requestContext) {
        this.pipelineTracker.completeStage(
          requestContext.getRequestId(),
          'pipeline_streaming',
          { streaming: true, targetId: target.id }
        );
      }

    } catch (err: any) {
      success = false;
      error = err.message;

      // Update error metrics
      this.metrics.failedRequests++;
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;
      target.errorCount++;
      target.healthStatus = 'unhealthy';

      yield {
        pipelineId: this.config.id,
        targetId: target.id,
        success: false,
        error,
        duration: Date.now() - startTime,
        timestamp: startTime,
        targetMetrics: {
          requestCount: target.requestCount,
          errorCount: target.errorCount,
          healthStatus: target.healthStatus
        }
      };
    }
  }

  /**
   * Select target based on load balancing strategy
   * 根据负载均衡策略选择目标
   */
  private selectTarget(): PipelineTarget | null {
    const healthyTargets = this.getHealthyTargets();
    if (healthyTargets.length === 0) {
      return null;
    }

    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        return this.selectRoundRobin(healthyTargets);
      case 'weighted':
        return this.selectWeighted(healthyTargets);
      case 'least-connections':
        return this.selectLeastConnections(healthyTargets);
      case 'random':
        return this.selectRandom(healthyTargets);
      default:
        return this.selectRoundRobin(healthyTargets);
    }
  }

  /**
   * Round-robin target selection
   * 轮询目标选择
   */
  private selectRoundRobin(targets: PipelineTarget[]): PipelineTarget {
    const target = targets[this.currentTargetIndex % targets.length];
    this.currentTargetIndex = (this.currentTargetIndex + 1) % targets.length;
    return target;
  }

  /**
   * Weighted target selection
   * 加权目标选择
   */
  private selectWeighted(targets: PipelineTarget[]): PipelineTarget {
    const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0);
    let random = Math.random() * totalWeight;

    for (const target of targets) {
      random -= target.weight;
      if (random <= 0) {
        return target;
      }
    }

    return targets[0]; // Fallback
  }

  /**
   * Least connections target selection
   * 最少连接目标选择
   */
  private selectLeastConnections(targets: PipelineTarget[]): PipelineTarget {
    return targets.reduce((least, current) =>
      current.requestCount < least.requestCount ? current : least
    );
  }

  /**
   * Random target selection
   * 随机目标选择
   */
  private selectRandom(targets: PipelineTarget[]): PipelineTarget {
    return targets[Math.floor(Math.random() * targets.length)];
  }

  /**
   * Execute with timeout
   * 带超时执行
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Pipeline execution timeout')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Start health checks
   * 启动健康检查
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckInterval
    );
  }

  /**
   * Perform health checks on all targets
   * 对所有目标执行健康检查
   */
  private async performHealthChecks(): Promise<void> {
    for (const target of this.targets.values()) {
      try {
        const healthResult = await target.provider.healthCheck();
        target.healthStatus = healthResult.status === 'healthy' ? 'healthy' : 'unhealthy';
        target.lastHealthCheck = Date.now();
      } catch (error) {
        target.healthStatus = 'unhealthy';
        target.lastHealthCheck = Date.now();
      }
    }

    // Update metrics
    this.metrics.healthyTargets = this.getHealthyTargets().length;
    this.metrics.unhealthyTargets = this.getUnhealthyTargets().length;
  }

  /**
   * Get healthy targets
   * 获取健康目标
   */
  private getHealthyTargets(): PipelineTarget[] {
    return Array.from(this.targets.values()).filter(target =>
      target.enabled && target.healthStatus === 'healthy'
    );
  }

  /**
   * Get unhealthy targets
   * 获取不健康目标
   */
  private getUnhealthyTargets(): PipelineTarget[] {
    return Array.from(this.targets.values()).filter(target =>
      target.enabled && target.healthStatus === 'unhealthy'
    );
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
   * Add target to pipeline
   * 向流水线添加目标
   */
  addTarget(target: PipelineTarget): void {
    this.targets.set(target.id, { ...target });
    this.metrics.currentTargets = this.targets.size;
    this.metrics.healthyTargets = this.getHealthyTargets().length;
    this.metrics.unhealthyTargets = this.getUnhealthyTargets().length;
  }

  /**
   * Remove target from pipeline
   * 从流水线移除目标
   */
  removeTarget(targetId: string): boolean {
    const removed = this.targets.delete(targetId);
    if (removed) {
      this.metrics.currentTargets = this.targets.size;
      this.metrics.healthyTargets = this.getHealthyTargets().length;
      this.metrics.unhealthyTargets = this.getUnhealthyTargets().length;
    }
    return removed;
  }

  /**
   * Update target
   * 更新目标
   */
  updateTarget(targetId: string, updates: Partial<PipelineTarget>): boolean {
    const target = this.targets.get(targetId);
    if (target) {
      Object.assign(target, updates);
      return true;
    }
    return false;
  }

  /**
   * Get pipeline metrics
   * 获取流水线指标
   */
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  /**
   * Get pipeline config
   * 获取流水线配置
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  /**
   * Get all targets
   * 获取所有目标
   */
  getTargets(): PipelineTarget[] {
    return Array.from(this.targets.values());
  }

  /**
   * Check if pipeline is healthy
   * 检查流水线是否健康
   */
  isHealthy(): boolean {
    return this.metrics.healthyTargets > 0;
  }

  /**
   * Get target by ID
   * 根据ID获取目标
   */
  getTarget(targetId: string): PipelineTarget | undefined {
    return this.targets.get(targetId);
  }

  /**
   * Enable/disable target
   * 启用/禁用目标
   */
  setTargetEnabled(targetId: string, enabled: boolean): boolean {
    const target = this.targets.get(targetId);
    if (target) {
      target.enabled = enabled;
      this.metrics.healthyTargets = this.getHealthyTargets().length;
      this.metrics.unhealthyTargets = this.getUnhealthyTargets().length;
      return true;
    }
    return false;
  }

  /**
   * Destroy pipeline and cleanup resources
   * 销毁流水线并清理资源
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.targets.clear();
  }
}