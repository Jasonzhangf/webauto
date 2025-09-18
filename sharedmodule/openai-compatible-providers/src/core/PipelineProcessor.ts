import { BaseModule } from 'rcc-basemodule';
import { ModuleInfo } from 'rcc-basemodule';
import { v4 as uuidv4 } from 'uuid';

/**
 * 流水线处理接口
 */
export interface IPipelineProcessor {
  /**
   * 处理输入数据，转换为流水线格式
   * @param input - 原始输入数据
   * @param context - 处理上下文
   * @returns 流水线格式的数据
   */
  processInput(input: any, context?: Record<string, any>): Promise<PipelineData>;

  /**
   * 处理输出数据，从流水线格式转换
   * @param output - 流水线格式的输出数据
   * @param context - 处理上下文
   * @returns 标准化的输出数据
   */
  processOutput(output: PipelineData, context?: Record<string, any>): Promise<any>;

  /**
   * 验证流水线数据格式
   * @param data - 待验证的数据
   * @returns 验证结果
   */
  validatePipelineData(data: any): ValidationResult;

  /**
   * 获取支持的流水线格式
   * @returns 支持的格式列表
   */
  getSupportedFormats(): string[];
}

/**
 * 流水线数据结构
 */
export interface PipelineData {
  /**
   * 数据唯一标识符
   */
  id: string;

  /**
   * 数据类型
   */
  type: string;

  /**
   * 数据版本
   */
  version: string;

  /**
   * 时间戳
   */
  timestamp: number;

  /**
   * 源模块信息
   */
  source: {
    moduleId: string;
    moduleName: string;
    operation?: string;
  };

  /**
   * 目标模块信息
   */
  target?: {
    moduleId: string;
    moduleName: string;
  };

  /**
   * 数据负载
   */
  payload: any;

  /**
   * 元数据
   */
  metadata: {
    format: string;
    encoding?: string;
    compression?: string;
    schema?: string;
    [key: string]: any;
  };

  /**
   * 流水线阶段信息
   */
  pipeline: {
    stage: string;
    step: number;
    totalSteps?: number;
    previousStage?: string;
    nextStage?: string;
  };

  /**
   * 处理跟踪信息
   */
  tracking?: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    correlationId?: string;
  };
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /**
   * 是否有效
   */
  isValid: boolean;

  /**
   * 错误信息
   */
  errors: string[];

  /**
   * 警告信息
   */
  warnings: string[];

  /**
   * 验证后的数据
   */
  data?: any;
}

/**
 * 流水线处理器配置
 */
export interface PipelineProcessorConfig {
  /**
   * 默认数据格式
   */
  defaultFormat: string;

  /**
   * 支持的格式列表
   */
  supportedFormats: string[];

  /**
   * 是否启用数据验证
   */
  enableValidation: boolean;

  /**
   * 是否启用数据跟踪
   */
  enableTracking: boolean;

  /**
   * 是否启用性能监控
   */
  enablePerformanceMonitoring: boolean;

  /**
   * 自定义验证器
   */
  validators?: Record<string, (data: any) => ValidationResult>;

  /**
   * 自定义转换器
   */
  transformers?: Record<string, (data: any) => Promise<any>>;

  /**
   * 错误处理策略
   */
  errorHandling: {
    /**
     * 遇到错误时是否继续
     */
    continueOnError: boolean;

    /**
     * 最大重试次数
     */
    maxRetries: number;

    /**
     * 重试延迟（毫秒）
     */
    retryDelay: number;
  };
}

/**
 * 默认流水线处理器实现
 */
export class PipelineProcessor extends BaseModule implements IPipelineProcessor {
  protected config: PipelineProcessorConfig;
  private processingStats: {
    totalProcessed: number;
    successful: number;
    failed: number;
    averageProcessingTime: number;
  };

  constructor(info: ModuleInfo, config?: Partial<PipelineProcessorConfig>) {
    super(info);

    this.config = {
      defaultFormat: 'json',
      supportedFormats: ['json', 'yaml', 'xml', 'csv'],
      enableValidation: true,
      enableTracking: true,
      enablePerformanceMonitoring: true,
      errorHandling: {
        continueOnError: false,
        maxRetries: 3,
        retryDelay: 1000,
      },
      ...config,
    };

    this.processingStats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      averageProcessingTime: 0,
    };

    this.logInfo('PipelineProcessor initialized', { config: this.config }, 'constructor');
  }

  /**
   * 处理输入数据，转换为流水线格式
   */
  public async processInput(input: any, context?: Record<string, any>): Promise<PipelineData> {
    const startTime = Date.now();
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    try {
      this.logInfo('Processing input data', {
        inputType: typeof input,
        traceId,
        spanId,
        context
      }, 'processInput');

      // 基本数据转换
      const pipelineData: PipelineData = {
        id: uuidv4(),
        type: this.getDataType(input),
        version: '1.0.0',
        timestamp: startTime,
        source: {
          moduleId: this.getInfo().id,
          moduleName: this.getInfo().name,
          operation: context?.operation || 'processInput',
        },
        target: context?.target ? {
          moduleId: context.target.moduleId,
          moduleName: context.target.moduleName,
        } : undefined,
        payload: input,
        metadata: {
          format: this.config.defaultFormat,
          ...context?.metadata,
        },
        pipeline: {
          stage: context?.stage || 'input',
          step: context?.step || 1,
          totalSteps: context?.totalSteps,
        },
        tracking: {
          traceId,
          spanId,
          correlationId: context?.correlationId,
        },
      };

      // 数据验证
      if (this.config.enableValidation) {
        const validation = this.validatePipelineData(pipelineData);
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // 自定义转换
      if (this.config.transformers && this.config.defaultFormat in this.config.transformers) {
        pipelineData.payload = await this.config.transformers[this.config.defaultFormat](pipelineData.payload);
      }

      // 更新统计信息
      this.updateStats(true, Date.now() - startTime);

      this.logInfo('Input data processed successfully', {
        dataId: pipelineData.id,
        processingTime: Date.now() - startTime
      }, 'processInput');

      return pipelineData;

    } catch (error) {
      // 更新统计信息
      this.updateStats(false, Date.now() - startTime);

      this.error('Failed to process input data', {
        error: (error as Error).message,
        traceId,
        spanId,
        input
      }, 'processInput');

      throw error;
    }
  }

  /**
   * 处理输出数据，从流水线格式转换
   */
  public async processOutput(output: PipelineData, context?: Record<string, any>): Promise<any> {
    const startTime = Date.now();

    try {
      this.logInfo('Processing output data', {
        dataId: output.id,
        outputType: output.type,
        context
      }, 'processOutput');

      // 数据验证
      if (this.config.enableValidation) {
        const validation = this.validatePipelineData(output);
        if (!validation.isValid) {
          throw new Error(`Output validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // 提取有效负载
      let result = output.payload;

      // 自定义转换
      const format = output.metadata?.format || this.config.defaultFormat;
      if (this.config.transformers && format in this.config.transformers) {
        result = await this.config.transformers[format](result);
      }

      // 添加上下文信息
      const finalResult = {
        data: result,
        metadata: {
          ...output.metadata,
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
          source: output.source,
          pipeline: output.pipeline,
        },
        context,
      };

      // 更新统计信息
      this.updateStats(true, Date.now() - startTime);

      this.logInfo('Output data processed successfully', {
        dataId: output.id,
        processingTime: Date.now() - startTime
      }, 'processOutput');

      return finalResult;

    } catch (error) {
      // 更新统计信息
      this.updateStats(false, Date.now() - startTime);

      this.error('Failed to process output data', {
        error: (error as Error).message,
        output
      }, 'processOutput');

      throw error;
    }
  }

  /**
   * 验证流水线数据格式
   */
  public validatePipelineData(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本字段验证
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Missing or invalid id field');
    }

    if (!data.type || typeof data.type !== 'string') {
      errors.push('Missing or invalid type field');
    }

    if (!data.version || typeof data.version !== 'string') {
      errors.push('Missing or invalid version field');
    }

    if (!data.timestamp || typeof data.timestamp !== 'number') {
      errors.push('Missing or invalid timestamp field');
    }

    if (!data.source || !data.source.moduleId) {
      errors.push('Missing source information');
    }

    if (!data.payload) {
      warnings.push('Empty payload');
    }

    // 元数据验证
    if (!data.metadata || !data.metadata.format) {
      warnings.push('Missing format metadata');
    }

    // 流水线阶段验证
    if (!data.pipeline || !data.pipeline.stage) {
      errors.push('Missing pipeline stage information');
    }

    // 格式支持验证
    if (data.metadata && data.metadata.format) {
      if (!this.config.supportedFormats.includes(data.metadata.format)) {
        errors.push(`Unsupported format: ${data.metadata.format}`);
      }
    }

    // 自定义验证器
    if (this.config.validators) {
      const format = data.metadata?.format || this.config.defaultFormat;
      if (format in this.config.validators) {
        const customValidation = this.config.validators[format](data);
        errors.push(...customValidation.errors);
        warnings.push(...customValidation.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      data,
    };
  }

  /**
   * 获取支持的流水线格式
   */
  public getSupportedFormats(): string[] {
    return [...this.config.supportedFormats];
  }

  /**
   * 获取处理统计信息
   */
  public getProcessingStats() {
    return { ...this.processingStats };
  }

  /**
   * 重置统计信息
   */
  public resetStats(): void {
    this.processingStats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      averageProcessingTime: 0,
    };
    this.logInfo('Processing stats reset', {}, 'resetStats');
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<PipelineProcessorConfig>): void {
    this.config = { ...this.config, ...config };
    this.logInfo('PipelineProcessor configuration updated', { config }, 'updateConfig');
  }

  /**
   * 初始化处理器
   */
  public async initialize(): Promise<void> {
    await super.initialize();
    this.logInfo('PipelineProcessor initialized successfully', {}, 'initialize');
  }

  /**
   * 清理资源
   */
  public async destroy(): Promise<void> {
    this.resetStats();
    await super.destroy();
  }

  // 私有方法

  private generateTraceId(): string {
    return `trace_${uuidv4()}`;
  }

  private generateSpanId(): string {
    return `span_${uuidv4()}`;
  }

  private getDataType(data: any): string {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';
    return typeof data;
  }

  private updateStats(success: boolean, processingTime: number): void {
    this.processingStats.totalProcessed++;

    if (success) {
      this.processingStats.successful++;
    } else {
      this.processingStats.failed++;
    }

    // 更新平均处理时间
    const totalTime = this.processingStats.averageProcessingTime * (this.processingStats.totalProcessed - 1) + processingTime;
    this.processingStats.averageProcessingTime = totalTime / this.processingStats.totalProcessed;
  }

  /**
   * 处理消息（扩展BaseModule的消息处理）
   */
  public async handleMessage(message: any): Promise<any> {
    switch (message.type) {
      case 'getStats':
        return {
          success: true,
          data: this.getProcessingStats(),
        };

      case 'resetStats':
        this.resetStats();
        return {
          success: true,
          message: 'Statistics reset',
        };

      case 'getSupportedFormats':
        return {
          success: true,
          data: this.getSupportedFormats(),
        };

      case 'updateConfig':
        this.updateConfig(message.payload);
        return {
          success: true,
          message: 'Configuration updated',
        };

      default:
        return super.handleMessage(message);
    }
  }
}