/**
 * Virtual Model Scheduler Manager - Manages all scheduler instances
 * 虚拟模型调度器管理器 - 管理所有调度器实例
 */

import { PipelineScheduler, SchedulerConfig } from './PipelineScheduler';
import { PipelineFactory, PipelineFactoryConfig, VirtualModelPipelineConfig } from './PipelineFactory';
import { PipelineTracker } from './PipelineTracker';
import { BaseProvider } from './BaseProvider';
import { VirtualModelConfig } from '../types/virtual-model';
import { IRequestContext } from '../interfaces/IRequestContext';
// Define operation type locally
type OperationType = 'chat' | 'streamChat' | 'healthCheck';

export interface ManagerConfig {
  maxSchedulers: number;
  defaultSchedulerConfig: SchedulerConfig;
  pipelineFactoryConfig: PipelineFactoryConfig;
  enableAutoScaling: boolean;
  scalingThresholds: {
    minRequestsPerMinute: number;
    maxRequestsPerMinute: number;
    scaleUpCooldown: number;
    scaleDownCooldown: number;
  };
  healthCheckInterval: number;
  metricsRetentionPeriod: number;
  enableMetricsExport: boolean;
}

export interface ManagerMetrics {
  totalSchedulers: number;
  activeSchedulers: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  overallErrorRate: number;
  uptime: number;
  lastHealthCheck: number;
  virtualModelMetrics: Map<string, {
    requests: number;
    errors: number;
    averageResponseTime: number;
    lastUsed: number;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  }>;
  systemLoad: {
    cpuUsage?: number;
    memoryUsage?: number;
    activeConnections: number;
    queueLength: number;
  };
}

export interface ManagerHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  overallHealth: number; // 0-100 score
  schedulerHealth: Map<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    health: number;
    details: any;
  }>;
  systemHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: {
      schedulerAvailability: boolean;
      errorRates: boolean;
      responseTimes: boolean;
      systemResources: boolean;
    };
    details: any;
  };
}

export interface VirtualModelMapping {
  virtualModelId: string;
  schedulerId: string;
  config: VirtualModelConfig;
  providers: Map<string, BaseProvider>;
  createdAt: number;
  lastUsed: number;
  enabled: boolean;
}

export interface SchedulingOptions {
  timeout?: number;
  retries?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  healthCheck?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Virtual Model Scheduler Manager - Central management for all virtual model schedulers
 * 虚拟模型调度器管理器 - 所有虚拟模型调度器的中央管理
 */
export class VirtualModelSchedulerManager {
  private config: ManagerConfig;
  private schedulers: Map<string, PipelineScheduler> = new Map();
  private pipelineFactory: PipelineFactory;
  private pipelineTracker: PipelineTracker;
  private virtualModelMappings: Map<string, VirtualModelMapping> = new Map();
  private metrics: ManagerMetrics;
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsCleanupInterval?: NodeJS.Timeout;
  private scalingCooldowns: Map<string, number> = new Map();

  constructor(config: ManagerConfig, pipelineTracker: PipelineTracker) {
    this.config = config;
    this.pipelineTracker = pipelineTracker;
    this.pipelineFactory = new PipelineFactory(config.pipelineFactoryConfig, pipelineTracker);

    // Initialize metrics
    this.metrics = {
      totalSchedulers: 0,
      activeSchedulers: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      overallErrorRate: 0,
      uptime: Date.now(),
      lastHealthCheck: Date.now(),
      virtualModelMetrics: new Map(),
      systemLoad: {
        activeConnections: 0,
        queueLength: 0
      }
    };

    // Start health checks and cleanup
    this.startHealthChecks();
    this.startMetricsCleanup();
  }

  /**
   * Register virtual model with scheduler
   * 注册虚拟模型到调度器
   */
  async registerVirtualModel(
    virtualModelConfig: VirtualModelConfig,
    providers: Map<string, BaseProvider>,
    options?: SchedulingOptions
  ): Promise<string> {
    const schedulerId = `scheduler_${virtualModelConfig.id}_${Date.now()}`;

    try {
      // Check if virtual model already exists
      if (this.virtualModelMappings.has(virtualModelConfig.id)) {
        throw new Error(`Virtual model ${virtualModelConfig.id} is already registered`);
      }

      // Check scheduler limit
      if (this.schedulers.size >= this.config.maxSchedulers) {
        throw new Error(`Maximum number of schedulers (${this.config.maxSchedulers}) reached`);
      }

      // Create virtual model pipeline config
      const vmPipelineConfig: VirtualModelPipelineConfig = {
        virtualModel: virtualModelConfig,
        providers,
        metadata: options?.metadata
      };

      // Create pipeline
      const pipeline = this.pipelineFactory.createPipelineFromVirtualModel(vmPipelineConfig);
      if (!pipeline) {
        throw new Error(`Failed to create pipeline for virtual model ${virtualModelConfig.id}`);
      }

      // Create scheduler
      const scheduler = new PipelineScheduler(
        virtualModelConfig.id,
        this.config.defaultSchedulerConfig,
        this.pipelineTracker
      );

      // Add pipeline to scheduler
      scheduler.addPipeline(pipeline);

      // Register scheduler
      this.schedulers.set(schedulerId, scheduler);

      // Create virtual model mapping
      const mapping: VirtualModelMapping = {
        virtualModelId: virtualModelConfig.id,
        schedulerId,
        config: virtualModelConfig,
        providers: new Map(providers),
        createdAt: Date.now(),
        lastUsed: Date.now(),
        enabled: true
      };

      this.virtualModelMappings.set(virtualModelConfig.id, mapping);

      // Update metrics
      this.metrics.totalSchedulers = this.schedulers.size;
      this.metrics.activeSchedulers = Array.from(this.schedulers.values()).filter(s => s.getHealth().status !== 'unhealthy').length;

      // Initialize virtual model metrics
      this.metrics.virtualModelMetrics.set(virtualModelConfig.id, {
        requests: 0,
        errors: 0,
        averageResponseTime: 0,
        lastUsed: Date.now(),
        healthStatus: 'healthy'
      });

      console.log(`Virtual model ${virtualModelConfig.id} registered successfully with scheduler ${schedulerId}`);
      return schedulerId;

    } catch (error) {
      // Cleanup on failure
      if (this.schedulers.has(schedulerId)) {
        const scheduler = this.schedulers.get(schedulerId);
        scheduler?.destroy();
        this.schedulers.delete(schedulerId);
      }
      this.virtualModelMappings.delete(virtualModelConfig.id);
      this.metrics.virtualModelMetrics.delete(virtualModelConfig.id);

      throw error;
    }
  }

  /**
   * Unregister virtual model
   * 注销虚拟模型
   */
  async unregisterVirtualModel(virtualModelId: string): Promise<boolean> {
    const mapping = this.virtualModelMappings.get(virtualModelId);
    if (!mapping) {
      return false;
    }

    try {
      // Destroy scheduler
      const scheduler = this.schedulers.get(mapping.schedulerId);
      if (scheduler) {
        scheduler.destroy();
        this.schedulers.delete(mapping.schedulerId);
      }

      // Remove mapping
      this.virtualModelMappings.delete(virtualModelId);
      this.metrics.virtualModelMetrics.delete(virtualModelId);

      // Update metrics
      this.metrics.totalSchedulers = this.schedulers.size;
      this.metrics.activeSchedulers = Array.from(this.schedulers.values()).filter(s => s.getHealth().status !== 'unhealthy').length;

      console.log(`Virtual model ${virtualModelId} unregistered successfully`);
      return true;

    } catch (error) {
      console.error(`Failed to unregister virtual model ${virtualModelId}:`, error);
      return false;
    }
  }

  /**
   * Execute request through virtual model scheduler
   * 通过虚拟模型调度器执行请求
   */
  async execute(
    virtualModelId: string,
    request: any,
    operation: OperationType,
    options?: SchedulingOptions
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Get scheduler for virtual model
      const scheduler = this.getSchedulerForVirtualModel(virtualModelId);
      if (!scheduler) {
        throw new Error(`No scheduler found for virtual model ${virtualModelId}`);
      }

      // Update usage metrics
      const mapping = this.virtualModelMappings.get(virtualModelId);
      if (mapping) {
        mapping.lastUsed = Date.now();
      }

      // Execute request
      const result = await scheduler.execute(request, operation, options);

      // Update success metrics
      this.metrics.successfulRequests++;
      this.updateVirtualModelMetrics(virtualModelId, true, Date.now() - startTime);
      this.updateOverallMetrics(true, Date.now() - startTime);

      return result;

    } catch (error: any) {
      // Update error metrics
      this.metrics.failedRequests++;
      this.updateVirtualModelMetrics(virtualModelId, false, Date.now() - startTime);
      this.updateOverallMetrics(false, Date.now() - startTime);

      throw error;
    } finally {
      this.metrics.totalRequests++;
    }
  }

  /**
   * Execute streaming request through virtual model scheduler
   * 通过虚拟模型调度器执行流式请求
   */
  async *executeStreaming(
    virtualModelId: string,
    request: any,
    operation: OperationType,
    options?: SchedulingOptions
  ): AsyncGenerator<any, void, unknown> {
    const startTime = Date.now();

    try {
      // Get scheduler for virtual model
      const scheduler = this.getSchedulerForVirtualModel(virtualModelId);
      if (!scheduler) {
        throw new Error(`No scheduler found for virtual model ${virtualModelId}`);
      }

      // Update usage metrics
      const mapping = this.virtualModelMappings.get(virtualModelId);
      if (mapping) {
        mapping.lastUsed = Date.now();
      }

      // Execute streaming request
      const stream = scheduler.executeStreaming(request, operation, options);

      for await (const chunk of stream) {
        yield chunk;
      }

      // Update success metrics
      this.metrics.successfulRequests++;
      this.updateVirtualModelMetrics(virtualModelId, true, Date.now() - startTime);
      this.updateOverallMetrics(true, Date.now() - startTime);

    } catch (error: any) {
      // Update error metrics
      this.metrics.failedRequests++;
      this.updateVirtualModelMetrics(virtualModelId, false, Date.now() - startTime);
      this.updateOverallMetrics(false, Date.now() - startTime);

      throw error;
    } finally {
      this.metrics.totalRequests++;
    }
  }

  /**
   * Get scheduler for virtual model
   * 获取虚拟模型的调度器
   */
  private getSchedulerForVirtualModel(virtualModelId: string): PipelineScheduler | null {
    const mapping = this.virtualModelMappings.get(virtualModelId);
    if (!mapping || !mapping.enabled) {
      return null;
    }

    const scheduler = this.schedulers.get(mapping.schedulerId);
    if (!scheduler || scheduler.getHealth().status === 'unhealthy') {
      return null;
    }

    return scheduler;
  }

  /**
   * Update virtual model metrics
   * 更新虚拟模型指标
   */
  private updateVirtualModelMetrics(virtualModelId: string, success: boolean, duration: number): void {
    const vmMetrics = this.metrics.virtualModelMetrics.get(virtualModelId);
    if (!vmMetrics) {
      return;
    }

    vmMetrics.requests++;
    if (!success) {
      vmMetrics.errors++;
    }

    // Update average response time
    const totalDuration = vmMetrics.averageResponseTime * (vmMetrics.requests - 1);
    vmMetrics.averageResponseTime = (totalDuration + duration) / vmMetrics.requests;
    vmMetrics.lastUsed = Date.now();

    // Update health status
    const errorRate = vmMetrics.errors / vmMetrics.requests;
    vmMetrics.healthStatus = errorRate < 0.1 ? 'healthy' : (errorRate < 0.3 ? 'degraded' : 'unhealthy');
  }

  /**
   * Update overall metrics
   * 更新总体指标
   */
  private updateOverallMetrics(success: boolean, duration: number): void {
    // Update average response time
    const totalDuration = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1);
    this.metrics.averageResponseTime = (totalDuration + duration) / this.metrics.totalRequests;

    // Update error rate
    this.metrics.overallErrorRate = this.metrics.failedRequests / this.metrics.totalRequests;
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
      // Check all schedulers
      for (const [schedulerId, scheduler] of this.schedulers.entries()) {
        const health = scheduler.getHealth();

        // Remove unhealthy schedulers that have been unhealthy for too long
        if (health.status === 'unhealthy') {
          const mapping = Array.from(this.virtualModelMappings.values())
            .find(m => m.schedulerId === schedulerId);

          if (mapping && Date.now() - mapping.lastUsed > 300000) { // 5 minutes
            console.warn(`Removing unhealthy scheduler ${schedulerId} for virtual model ${mapping.virtualModelId}`);
            await this.unregisterVirtualModel(mapping.virtualModelId);
          }
        }
      }

      // Update active scheduler count
      this.metrics.activeSchedulers = Array.from(this.schedulers.values())
        .filter(s => s.getHealth().status !== 'unhealthy').length;

      // Update system load metrics
      this.updateSystemLoadMetrics();

      this.metrics.lastHealthCheck = Date.now();

      // Auto-scaling check
      if (this.config.enableAutoScaling) {
        this.checkAutoScaling();
      }

    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  /**
   * Update system load metrics
   * 更新系统负载指标
   */
  private updateSystemLoadMetrics(): void {
    let totalConnections = 0;
    let totalQueueLength = 0;

    for (const scheduler of this.schedulers.values()) {
      const metrics = scheduler.getMetrics();
      totalConnections += metrics.currentConcurrentRequests;
      totalQueueLength += metrics.queueLength;
    }

    this.metrics.systemLoad.activeConnections = totalConnections;
    this.metrics.systemLoad.queueLength = totalQueueLength;
  }

  /**
   * Auto-scaling logic
   * 自动扩缩容逻辑
   */
  private checkAutoScaling(): void {
    const now = Date.now();

    // Check scaling cooldowns
    for (const [vmId, cooldownTime] of this.scalingCooldowns.entries()) {
      if (now > cooldownTime) {
        this.scalingCooldowns.delete(vmId);
      }
    }

    // Analyze each virtual model's load
    for (const [vmId, vmMetrics] of this.metrics.virtualModelMetrics.entries()) {
      if (this.scalingCooldowns.has(vmId)) {
        continue; // Skip if in cooldown
      }

      const requestsPerMinute = vmMetrics.requests / ((now - vmMetrics.lastUsed) / 60000);

      // Scale up logic
      if (requestsPerMinute > this.config.scalingThresholds.maxRequestsPerMinute) {
        this.scaleUpVirtualModel(vmId);
        this.scalingCooldowns.set(vmId, now + this.config.scalingThresholds.scaleUpCooldown);
      }

      // Scale down logic
      else if (requestsPerMinute < this.config.scalingThresholds.minRequestsPerMinute) {
        this.scaleDownVirtualModel(vmId);
        this.scalingCooldowns.set(vmId, now + this.config.scalingThresholds.scaleDownCooldown);
      }
    }
  }

  private scaleUpVirtualModel(virtualModelId: string): void {
    // Implementation for scaling up (e.g., adding more pipeline instances)
    console.log(`Scaling up virtual model ${virtualModelId}`);
    // This would involve creating additional pipeline instances
  }

  private scaleDownVirtualModel(virtualModelId: string): void {
    // Implementation for scaling down (e.g., removing unused pipeline instances)
    console.log(`Scaling down virtual model ${virtualModelId}`);
    // This would involve removing pipeline instances
  }

  /**
   * Metrics cleanup
   * 指标清理
   */
  private startMetricsCleanup(): void {
    this.metricsCleanupInterval = setInterval(
      () => this.cleanupOldMetrics(),
      3600000 // Clean up every hour
    );
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.config.metricsRetentionPeriod;

    // Clean up old virtual model metrics
    for (const [vmId, vmMetrics] of this.metrics.virtualModelMetrics.entries()) {
      if (vmMetrics.lastUsed < cutoffTime) {
        this.metrics.virtualModelMetrics.delete(vmId);
      }
    }
  }

  /**
   * Public API methods
   * 公共API方法
   */
  getManagerMetrics(): ManagerMetrics {
    return {
      ...this.metrics,
      virtualModelMetrics: new Map(this.metrics.virtualModelMetrics)
    };
  }

  getManagerHealth(): ManagerHealth {
    const schedulerHealth = new Map();
    let totalHealthScore = 0;
    let healthySchedulers = 0;

    for (const [schedulerId, scheduler] of this.schedulers.entries()) {
      const health = scheduler.getHealth();
      schedulerHealth.set(schedulerId, {
        status: health.status,
        health: health.status === 'healthy' ? 100 : (health.status === 'degraded' ? 50 : 0),
        details: health.details
      });

      if (health.status === 'healthy') {
        healthySchedulers++;
        totalHealthScore += 100;
      } else if (health.status === 'degraded') {
        totalHealthScore += 50;
      }
    }

    const overallHealth = this.schedulers.size > 0 ? totalHealthScore / this.schedulers.size : 0;

    return {
      status: overallHealth >= 80 ? 'healthy' : (overallHealth >= 50 ? 'degraded' : 'unhealthy'),
      overallHealth,
      schedulerHealth,
      systemHealth: {
        status: this.metrics.overallErrorRate < 0.05 ? 'healthy' :
                (this.metrics.overallErrorRate < 0.15 ? 'degraded' : 'unhealthy'),
        checks: {
          schedulerAvailability: healthySchedulers > 0,
          errorRates: this.metrics.overallErrorRate < 0.1,
          responseTimes: this.metrics.averageResponseTime < 10000,
          systemResources: this.metrics.systemLoad.activeConnections < 1000
        },
        details: {
          errorRate: this.metrics.overallErrorRate,
          averageResponseTime: this.metrics.averageResponseTime,
          activeConnections: this.metrics.systemLoad.activeConnections,
          healthySchedulers
        }
      }
    };
  }

  getVirtualModelMappings(): VirtualModelMapping[] {
    return Array.from(this.virtualModelMappings.values());
  }

  getScheduler(schedulerId: string): PipelineScheduler | undefined {
    return this.schedulers.get(schedulerId);
  }

  getVirtualModelScheduler(virtualModelId: string): PipelineScheduler | null {
    return this.getSchedulerForVirtualModel(virtualModelId);
  }

  enableVirtualModel(virtualModelId: string): boolean {
    const mapping = this.virtualModelMappings.get(virtualModelId);
    if (mapping) {
      mapping.enabled = true;
      return true;
    }
    return false;
  }

  disableVirtualModel(virtualModelId: string): boolean {
    const mapping = this.virtualModelMappings.get(virtualModelId);
    if (mapping) {
      mapping.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Destroy manager and cleanup resources
   * 销毁管理器并清理资源
   */
  destroy(): void {
    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.metricsCleanupInterval) {
      clearInterval(this.metricsCleanupInterval);
    }

    // Destroy all schedulers
    for (const scheduler of this.schedulers.values()) {
      scheduler.destroy();
    }

    // Clear collections
    this.schedulers.clear();
    this.virtualModelMappings.clear();
    this.metrics.virtualModelMetrics.clear();
    this.scalingCooldowns.clear();
  }
}