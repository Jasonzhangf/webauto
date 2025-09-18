/**
 * Base Operation for Pipeline System
 * 流水线系统基础操作子
 */

import { OperationConfig, OperationResult, OperationContext } from '../../interfaces/IPipelineOperation';
import { PipelineOperationConfig, PipelineOperationContext, PipelineOperationResult } from '../../interfaces/IPipelineOperation';

/**
 * Simple base operation class to avoid import issues
 * 简单基础操作子类，避免导入问题
 */
export abstract class BaseOperation {
  public name!: string;
  public description!: string;
  public version!: string;
  public author?: string;
  public abstractCategories: string[] = [];
  public supportedContainers: string[] = [];
  public capabilities: string[] = [];
  public requiredParameters: string[] = [];
  public optionalParameters: OperationConfig = {};

  validateParameters(params: OperationConfig): any {
    const errors: string[] = [];
    for (const param of this.requiredParameters) {
      if (!(param in params)) {
        errors.push(`Missing required parameter: ${param}`);
      }
    }
    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      finalParams: params
    };
  }
}

/**
 * Pipeline Base Operation with enhanced debugging and tracking
 * 具有增强调试和跟踪功能的流水线基础操作子
 */
export abstract class PipelineBaseOperation extends BaseOperation {
  // Pipeline-specific properties
  protected pipelineId?: string;
  protected requestId?: string;
  protected stage?: string;
  protected operationType?: string;
  protected metadata?: any;

  // Performance tracking
  protected startTime: number = 0;
  protected executionTime: number = 0;
  protected successCount: number = 0;
  protected failureCount: number = 0;

  // Enhanced logging
  protected logger = {
    info: (message: string, data?: any) => console.log(`[${this.name}] ${message}`, data || ''),
    error: (message: string, data?: any) => console.error(`[${this.name}] ${message}`, data || ''),
    warn: (message: string, data?: any) => console.warn(`[${this.name}] ${message}`, data || ''),
    debug: (message: string, data?: any) => console.debug(`[${this.name}] ${message}`, data || '')
  };

  constructor() {
    super();
    this.startTime = Date.now();
  }

  /**
   * Enhanced execute method with pipeline-specific tracking
   * 增强的执行方法，具有流水线特定跟踪功能
   */
  async execute(context: PipelineOperationContext, params?: PipelineOperationConfig): Promise<PipelineOperationResult> {
    const executionStart = Date.now();

    try {
      // Extract pipeline-specific context
      this.extractPipelineContext(context);

      // Log operation start
      this.logger.info('Starting pipeline operation', {
        name: this.name,
        pipelineId: this.pipelineId,
        requestId: this.requestId,
        stage: this.stage,
        params: this.sanitizeParams(params)
      });

      // Execute the specific operation logic
      const result = await this.executePipelineOperation(context, params);

      // Calculate execution time
      this.executionTime = Date.now() - executionStart;

      // Update success metrics
      this.successCount++;

      // Log operation completion
      this.logger.info('Pipeline operation completed successfully', {
        name: this.name,
        pipelineId: this.pipelineId,
        requestId: this.requestId,
        executionTime: this.executionTime,
        result: this.sanitizeResult(result)
      });

      return this.enhanceResult(result);

    } catch (error) {
      // Calculate execution time
      this.executionTime = Date.now() - executionStart;

      // Update failure metrics
      this.failureCount++;

      // Log operation failure
      this.logger.error('Pipeline operation failed', {
        name: this.name,
        pipelineId: this.pipelineId,
        requestId: this.requestId,
        executionTime: this.executionTime,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
      });

      // Return enhanced error result
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        pipelineId: this.pipelineId,
        requestId: this.requestId,
        stage: this.stage,
        executionTime: this.executionTime,
        metadata: {
          operationType: this.operationType,
          errorType: error instanceof Error ? error.name : 'Unknown',
          failureCount: this.failureCount
        }
      };
    }
  }

  /**
   * Abstract method for specific operation logic
   * 抽象方法，用于特定的操作子逻辑
   */
  protected abstract executePipelineOperation(context: PipelineOperationContext, params?: PipelineOperationConfig): Promise<OperationResult>;

  /**
   * Extract pipeline-specific context information
   * 提取流水线特定上下文信息
   */
  private extractPipelineContext(context: PipelineOperationContext): void {
    if (context.pipeline) {
      this.pipelineId = context.pipeline.id;
    }

    if (context.request) {
      this.requestId = context.request.id;
      this.operationType = context.request.operation;
      this.metadata = context.request.metadata;
    }

    if (context.stage) {
      this.stage = context.stage.name;
    }
  }

  /**
   * Enhance result with pipeline-specific information
   * 增强结果，添加流水线特定信息
   */
  private enhanceResult(result: OperationResult): PipelineOperationResult {
    const enhancedResult: PipelineOperationResult = {
      ...result,
      pipelineId: this.pipelineId,
      requestId: this.requestId,
      stage: this.stage,
      executionTime: this.executionTime,
      performance: {
        success: result.success,
        duration: this.executionTime,
        throughput: this.calculateThroughput(),
        errorRate: this.calculateErrorRate()
      },
      metadata: {
        ...result.metadata,
        operationType: this.operationType,
        successCount: this.successCount,
        failureCount: this.failureCount,
        totalExecutions: this.successCount + this.failureCount
      }
    };

    return enhancedResult;
  }

  /**
   * Calculate operation throughput
   * 计算操作子吞吐量
   */
  private calculateThroughput(): number {
    const totalTime = Date.now() - this.startTime;
    const totalExecutions = this.successCount + this.failureCount;
    return totalTime > 0 ? (totalExecutions / totalTime) * 1000 : 0; // operations per second
  }

  /**
   * Calculate error rate
   * 计算错误率
   */
  private calculateErrorRate(): number {
    const totalExecutions = this.successCount + this.failureCount;
    return totalExecutions > 0 ? (this.failureCount / totalExecutions) * 100 : 0; // percentage
  }

  /**
   * Sanitize parameters for logging
   * 清理参数用于日志记录
   */
  private sanitizeParams(params?: PipelineOperationConfig): any {
    if (!params) return undefined;

    // Remove sensitive information like tokens, passwords, etc.
    const sanitized = { ...params };

    // Remove potential sensitive fields
    const sensitiveFields = ['token', 'password', 'secret', 'key', 'auth'];
    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Sanitize result for logging
   * 清理结果用于日志记录
   */
  private sanitizeResult(result: OperationResult): any {
    if (!result.result) return undefined;

    // For large results, just show the type and size
    if (typeof result.result === 'object' && Object.keys(result.result).length > 10) {
      return {
        type: typeof result.result,
        size: Object.keys(result.result).length,
        preview: Object.keys(result.result).slice(0, 5)
      };
    }

    return result.result;
  }

  /**
   * Validate pipeline operation parameters
   * 验证流水线操作子参数
   */
  override validateParameters(params: PipelineOperationConfig): any {
    const baseValidation = super.validateParameters(params);

    if (!baseValidation.isValid) {
      return baseValidation;
    }

    // Pipeline-specific validation
    const warnings: string[] = [];

    if (params.pipelineId && typeof params.pipelineId !== 'string') {
      warnings.push('Pipeline ID should be a string');
    }

    if (params.requestId && typeof params.requestId !== 'string') {
      warnings.push('Request ID should be a string');
    }

    return {
      ...baseValidation,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Get pipeline-specific statistics
   * 获取流水线特定统计信息
   */
  getPipelineStats() {
    return {
      name: this.name,
      executionTime: this.executionTime,
      successCount: this.successCount,
      failureCount: this.failureCount,
      throughput: this.calculateThroughput(),
      errorRate: this.calculateErrorRate(),
      totalExecutions: this.successCount + this.failureCount,
      averageExecutionTime: this.executionTime / Math.max(1, this.successCount + this.failureCount)
    };
  }

  /**
   * Reset operation statistics
   * 重置操作子统计信息
   */
  resetPipelineStats(): void {
    this.successCount = 0;
    this.failureCount = 0;
    this.executionTime = 0;
    this.startTime = Date.now();
  }

  /**
   * Get operation capabilities
   * 获取操作子能力
   */
  getCapabilities() {
    return {
      supportsPipelineTracking: true,
      supportsRequestTracking: true,
      supportsPerformanceMetrics: true,
      supportsErrorHandling: true,
      supportsLogging: true,
      categories: this.abstractCategories,
      capabilities: this.capabilities
    };
  }
}