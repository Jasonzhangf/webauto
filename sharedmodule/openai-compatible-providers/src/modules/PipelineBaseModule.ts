/**
 * Pipeline Base Module - Base module for pipeline components with enhanced debug capabilities
 * 流水线基础模块 - 具有增强调试功能的流水线组件基础模块
 */

import { BaseModule, DebugConfig, IOTrackingConfig, ModuleInfo } from 'rcc-basemodule';
import { ErrorHandlingCenter } from 'rcc-errorhandling';

/**
 * Pipeline-specific module configuration
 * 流水线特定模块配置
 */
export interface PipelineModuleConfig {
  // Base module configuration
  id: string;
  name: string;
  version: string;
  description: string;
  type: 'provider' | 'scheduler' | 'tracker' | 'pipeline';

  // Pipeline-specific settings
  providerName?: string;
  endpoint?: string;
  supportedModels?: string[];
  defaultModel?: string;
  maxConcurrentRequests?: number;
  requestTimeout?: number;

  // Debug configuration
  enableTwoPhaseDebug?: boolean;
  debugBaseDirectory?: string;
  enableIOTracking?: boolean;
  ioTrackingConfig?: IOTrackingConfig;
}

/**
 * Pipeline Base Module with enhanced debug capabilities
 * 具有增强调试功能的流水线基础模块
 */
export class PipelineBaseModule extends BaseModule {
  protected pipelineConfig: PipelineModuleConfig;
  protected errorHandler: ErrorHandlingCenter;

  constructor(config: PipelineModuleConfig) {
    // Create module info for BaseModule
    const moduleInfo: ModuleInfo = {
      id: config.id,
      name: config.name,
      version: config.version,
      description: config.description,
      type: config.type
    };

    super(moduleInfo);

    this.pipelineConfig = config;

    // Initialize error handler
    this.errorHandler = new ErrorHandlingCenter({
      id: `${config.id}-error-handler`,
      name: `${config.name} Error Handler`,
      version: '1.0.0',
      type: 'error-handler',
      description: `Error handler for ${config.name}`
    });

    // Enable two-phase debug if configured
    if (config.enableTwoPhaseDebug) {
      const debugConfig: DebugConfig = {
        enabled: true,
        level: 'debug',
        recordStack: true,
        maxLogEntries: 1000,
        consoleOutput: true,
        trackDataFlow: true,
        enableFileLogging: true,
        maxFileSize: 10485760, // 10MB
        maxLogFiles: 5,
        baseDirectory: config.debugBaseDirectory || '~/.rcc/debug-logs',
        ioTracking: config.ioTrackingConfig || {
          enabled: config.enableIOTracking || false,
          autoRecord: false,
          saveIndividualFiles: true,
          saveSessionFiles: false,
          ioDirectory: `${config.debugBaseDirectory || '~/.rcc/debug-logs'}/io`,
          includeTimestamp: true,
          includeDuration: true,
          maxEntriesPerFile: 100
        }
      };

      this.setDebugConfig(debugConfig);

      if (config.enableIOTracking) {
        this.enableTwoPhaseDebug(
          true,
          config.debugBaseDirectory || '~/.rcc/debug-logs',
          config.ioTrackingConfig
        );
      }
    }

    this.logInfo('Pipeline base module initialized', { config }, 'constructor');
  }

  /**
   * Get pipeline configuration
   * 获取流水线配置
   */
  public getPipelineConfig(): PipelineModuleConfig {
    return { ...this.pipelineConfig };
  }

  /**
   * Update pipeline configuration
   * 更新流水线配置
   */
  public updatePipelineConfig(newConfig: Partial<PipelineModuleConfig>): void {
    const oldConfig = { ...this.pipelineConfig };
    this.pipelineConfig = { ...this.pipelineConfig, ...newConfig };

    this.logInfo('Pipeline configuration updated', {
      oldConfig,
      newConfig: this.pipelineConfig
    }, 'updatePipelineConfig');
  }

  /**
   * Get provider information
   * 获取提供者信息
   */
  public getProviderInfo() {
    return {
      name: this.pipelineConfig.providerName || this.pipelineConfig.name,
      endpoint: this.pipelineConfig.endpoint,
      supportedModels: this.pipelineConfig.supportedModels || [],
      defaultModel: this.pipelineConfig.defaultModel,
      type: this.pipelineConfig.type
    };
  }

  /**
   * Track pipeline operation with I/O tracking
   * 跟踪流水线操作并记录I/O
   */
  public async trackPipelineOperation<T>(
    operationId: string,
    operation: () => Promise<T>,
    inputData?: any,
    operationType: string = 'pipeline-operation'
  ): Promise<T> {
    const startTime = Date.now();

    try {
      // Start I/O tracking if enabled
      if (this.pipelineConfig.enableIOTracking && this.twoPhaseDebugSystem) {
        this.twoPhaseDebugSystem.startOperation(this.info.id, operationId, inputData, operationType);
      }

      // Execute the operation
      const result = await operation();

      // End I/O tracking if enabled
      if (this.pipelineConfig.enableIOTracking && this.twoPhaseDebugSystem) {
        this.twoPhaseDebugSystem.endOperation(this.info.id, operationId, result, true, undefined);
      }

      this.logInfo('Pipeline operation completed successfully', {
        operationId,
        operationType,
        duration: Date.now() - startTime,
        inputData: inputData ? { type: typeof inputData } : undefined,
        outputData: result ? { type: typeof result } : undefined
      }, 'trackPipelineOperation');

      return result;

    } catch (error) {
      // End I/O tracking with error if enabled
      if (this.pipelineConfig.enableIOTracking && this.twoPhaseDebugSystem) {
        this.twoPhaseDebugSystem.endOperation(this.info.id, operationId, undefined, false, error instanceof Error ? error.message : String(error));
      }

      this.debug('error', 'Pipeline operation failed', {
        operationId,
        operationType,
        duration: Date.now() - startTime,
        inputData: inputData ? { type: typeof inputData } : undefined,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
      }, 'trackPipelineOperation');

      throw error;
    }
  }

  /**
   * Record pipeline stage
   * 记录流水线阶段
   */
  public recordPipelineStage(
    stageName: string,
    stageData: any,
    status: 'started' | 'completed' | 'failed' = 'started'
  ): void {
    const timestamp = Date.now();

    this.logInfo(`Pipeline stage ${status}`, {
      stageName,
      stageData: stageData ? { type: typeof stageData } : undefined,
      status,
      timestamp
    }, 'recordPipelineStage');
  }

  /**
   * Handle pipeline errors with enhanced error handling
   * 处理流水线错误并提供增强的错误处理
   */
  public handlePipelineError(
    error: Error,
    context: {
      operation?: string;
      stage?: string;
      requestId?: string;
      additionalData?: Record<string, any>;
    }
  ): void {
    const errorContext = {
      ...context,
      moduleId: this.info.id,
      moduleName: this.info.name,
      timestamp: Date.now(),
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    };

    // Log the error
    this.debug('error', 'Pipeline error occurred', errorContext, 'handlePipelineError');

    // Handle error with error handling center
    this.errorHandler.handleError({
      error: error,
      source: this.info.id,
      severity: 'high',
      timestamp: Date.now()
    });
  }

  /**
   * Get pipeline metrics
   * 获取流水线指标
   */
  public getPipelineMetrics() {
    const twoPhaseDebugSystem = this.getTwoPhaseDebugSystem();
    if (twoPhaseDebugSystem) {
      return {
        debugEnabled: true,
        ioTrackingEnabled: this.pipelineConfig.enableIOTracking || false,
        debugConfig: this.getDebugConfig(),
        ioEntries: twoPhaseDebugSystem.getIOEntries ? twoPhaseDebugSystem.getIOEntries(this.info.id, 100) : [],
        ioFiles: twoPhaseDebugSystem.getIOFiles ? twoPhaseDebugSystem.getIOFiles() : []
      };
    }

    return {
      debugEnabled: false,
      ioTrackingEnabled: false,
      debugConfig: this.getDebugConfig()
    };
  }

  /**
   * Override destroy method to ensure proper cleanup
   * 重写destroy方法以确保正确的清理
   */
  public override async destroy(): Promise<void> {
    try {
      this.logInfo('Destroying pipeline base module', { moduleId: this.info.id }, 'destroy');

      // Perform any additional cleanup specific to pipeline modules
      if (this.errorHandler) {
        // ErrorHandlingCenter cleanup if available
        if (typeof this.errorHandler.destroy === 'function') {
          await this.errorHandler.destroy();
        }
      }

      // Call parent destroy method
      await super.destroy();

    } catch (error) {
      this.debug('error', 'Failed to destroy pipeline base module', {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        moduleId: this.info.id
      }, 'destroy');

      throw error;
    }
  }
}