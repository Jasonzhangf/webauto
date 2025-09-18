/**
 * Operation-Based Pipeline System Entry Point
 * 基于操作子的流水线系统入口点
 */

// Core operation interfaces
export * from './interfaces/IPipelineOperation';

// Base operation classes
export * from './core/PipelineBaseOperation';
export * from './core/RequestTrackingPipelineOperation';
export * from './core/PipelineSchedulingOperation';
export * from './core/PipelineWorkflowEngine';

// Operation registry and management
import { PipelineOperationRegistry } from './core/PipelineOperationRegistry';
import { PipelineWorkflowEngine } from './core/PipelineWorkflowEngine';
import { RequestTrackingPipelineOperation } from './core/RequestTrackingPipelineOperation';
import { PipelineSchedulingOperation } from './core/PipelineSchedulingOperation';

/**
 * Operation-Based Pipeline System
 * 基于操作子的流水线系统
 */
export class OperationBasedPipelineSystem {
  private workflowEngine: PipelineWorkflowEngine;
  private operationRegistry: PipelineOperationRegistry;

  constructor() {
    this.operationRegistry = new PipelineOperationRegistry();
    this.workflowEngine = new PipelineWorkflowEngine();

    this.initializeOperations();
  }

  /**
   * Initialize core operations
   * 初始化核心操作子
   */
  private initializeOperations(): void {
    // Register built-in operations
    this.operationRegistry.registerOperation(new RequestTrackingPipelineOperation());
    this.operationRegistry.registerOperation(new PipelineSchedulingOperation());
    this.operationRegistry.registerOperation(this.workflowEngine);

    this.logger.info('Operation-based pipeline system initialized', {
      operationsCount: this.operationRegistry.size
    });
  }

  /**
   * Execute a pipeline workflow
   * 执行流水线工作流
   */
  async executeWorkflow(workflow: any, context?: any): Promise<any> {
    return await this.workflowEngine.executeWorkflow(workflow, context);
  }

  /**
   * Track a request through the pipeline
   * 通过流水线跟踪请求
   */
  async trackRequest(provider: string, operation: string, metadata?: any): Promise<any> {
    const trackingOperation = this.operationRegistry.getOperation('request-tracking');
    if (!trackingOperation) {
      throw new Error('Request tracking operation not found');
    }

    const context = {
      request: {
        id: `req-${Date.now()}`,
        provider,
        operation,
        metadata: metadata || {}
      }
    };

    return await trackingOperation.execute(context, {
      provider,
      operation,
      generateRequestId: true,
      includeMetadata: true,
      metadata
    });
  }

  /**
   * Schedule a pipeline request
   * 调度流水线请求
   */
  async scheduleRequest(data: any, options?: any): Promise<any> {
    const schedulingOperation = this.operationRegistry.getOperation('pipeline-scheduling');
    if (!schedulingOperation) {
      throw new Error('Pipeline scheduling operation not found');
    }

    const context = {
      request: {
        id: `sched-${Date.now()}`,
        provider: 'unknown',
        operation: 'schedule',
        metadata: options || {}
      }
    };

    return await schedulingOperation.execute(context, {
      data,
      ...options
    });
  }

  /**
   * Register a custom operation
   * 注册自定义操作子
   */
  registerOperation(operation: any): void {
    this.operationRegistry.registerOperation(operation);
    this.logger.info('Custom operation registered', { operationName: operation.name });
  }

  /**
   * Get system status
   * 获取系统状态
   */
  getSystemStatus(): any {
    return {
      name: 'Operation-Based Pipeline System',
      version: '1.0.0',
      status: this._systemStatus || 'healthy',
      operations: {
        count: this.operationRegistry.size,
        list: this.operationRegistry.listOperations()
      },
      workflowEngine: this.workflowEngine.getEngineMetrics(),
      performance: {
        uptime: Date.now() - this.startTime,
        totalOperations: this.operationRegistry.size,
        capabilities: ['request-tracking', 'pipeline-scheduling', 'workflow-orchestration']
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get comprehensive system metrics
   * 获取综合系统指标
   */
  getSystemMetrics(): any {
    return {
      operations: {
        count: this.operationRegistry.size,
        list: this.operationRegistry.listOperations(),
        statistics: this.getOperationStatistics()
      },
      performance: {
        uptime: Date.now() - this.startTime,
        health: this.getSystemStatus(),
        capabilities: ['request-tracking', 'pipeline-scheduling', 'workflow-orchestration']
      },
      health: {
        overall: 'healthy',
        checks: this.healthCheck()
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get operation statistics
   * 获取操作子统计信息
   */
  getOperationStatistics(): any {
    const stats: any = {};

    for (const operationName of this.operationRegistry.listOperations()) {
      const operation = this.operationRegistry.getOperation(operationName);
      if (operation && typeof operation.getPipelineStats === 'function') {
        stats[operationName] = operation.getPipelineStats();
      }
    }

    return stats;
  }

  /**
   * Health check
   * 健康检查
   */
  async healthCheck(): Promise<any> {
    const healthChecks: any = {};

    for (const operationName of this.operationRegistry.listOperations()) {
      const operation = this.operationRegistry.getOperation(operationName);
      try {
        if (operation && typeof operation.getHealthStatus === 'function') {
          healthChecks[operationName] = operation.getHealthStatus();
        } else {
          healthChecks[operationName] = {
            status: 'healthy',
            message: 'Operation available'
          };
        }
      } catch (error) {
        healthChecks[operationName] = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    const allHealthy = Object.values(healthChecks).every((check: any) => check.status === 'healthy');

    return {
      overall: allHealthy ? 'healthy' : 'unhealthy',
      operations: healthChecks,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * System cleanup
   * 系统清理
   */
  async cleanup(): Promise<void> {
    try {
      this.logger.info('Starting system cleanup');

      // Cleanup request tracking operation
      const trackingOperation = this.operationRegistry.getOperation('request-tracking');
      if (trackingOperation && typeof trackingOperation.cleanupCompletedRequests === 'function') {
        const cleanedCount = trackingOperation.cleanupCompletedRequests();
        this.logger.info('Cleaned up completed requests', { cleanedCount });
      }

      // Cleanup completed workflows
      if (typeof this.workflowEngine.cleanupCompletedWorkflows === 'function') {
        this.workflowEngine.cleanupCompletedWorkflows();
      }

      // Update system status
      this._systemStatus = 'cleaned';

      this.logger.info('System cleanup completed');

    } catch (error) {
      this.logger.error('System cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Reset system state
   * 重置系统状态
   */
  reset(): void {
    this.logger.info('Resetting operation-based pipeline system');

    // Reset all operations
    for (const operationName of this.operationRegistry.listOperations()) {
      const operation = this.operationRegistry.getOperation(operationName);
      if (operation && typeof operation.reset === 'function') {
        operation.reset();
      }
    }

    // Reset workflow engine
    this.workflowEngine.reset();

    this.logger.info('Operation-based pipeline system reset completed');
  }

  // Private properties
  private startTime = Date.now();
  private _systemStatus: 'healthy' | 'cleaned' | 'unhealthy' = 'healthy';

  // Simple logger
  private logger = {
    info: (message: string, data?: any) => console.log(`[PipelineSystem] ${message}`, data || ''),
    error: (message: string, data?: any) => console.error(`[PipelineSystem] ${message}`, data || ''),
    warn: (message: string, data?: any) => console.warn(`[PipelineSystem] ${message}`, data || ''),
    debug: (message: string, data?: any) => console.debug(`[PipelineSystem] ${message}`, data || '')
  };
}