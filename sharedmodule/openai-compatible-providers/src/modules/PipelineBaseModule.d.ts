/**
 * Pipeline Base Module - Base module for pipeline components with enhanced debug capabilities
 * 流水线基础模块 - 具有增强调试功能的流水线组件基础模块
 */
import { BaseModule, DebugConfig, IOTrackingConfig } from 'rcc-basemodule';
import { ErrorHandlingCenter } from 'rcc-errorhandling';
/**
 * Pipeline-specific module configuration
 * 流水线特定模块配置
 */
export interface PipelineModuleConfig {
    id: string;
    name: string;
    version: string;
    description: string;
    type: 'provider' | 'scheduler' | 'tracker' | 'pipeline';
    providerName?: string;
    endpoint?: string;
    supportedModels?: string[];
    defaultModel?: string;
    maxConcurrentRequests?: number;
    requestTimeout?: number;
    enableTwoPhaseDebug?: boolean;
    debugBaseDirectory?: string;
    enableIOTracking?: boolean;
    ioTrackingConfig?: IOTrackingConfig;
}
/**
 * Pipeline Base Module with enhanced debug capabilities
 * 具有增强调试功能的流水线基础模块
 */
export declare class PipelineBaseModule extends BaseModule {
    protected pipelineConfig: PipelineModuleConfig;
    protected errorHandler: ErrorHandlingCenter;
    constructor(config: PipelineModuleConfig);
    /**
     * Get pipeline configuration
     * 获取流水线配置
     */
    getPipelineConfig(): PipelineModuleConfig;
    /**
     * Update pipeline configuration
     * 更新流水线配置
     */
    updatePipelineConfig(newConfig: Partial<PipelineModuleConfig>): void;
    /**
     * Get provider information
     * 获取提供者信息
     */
    getProviderInfo(): {
        name: string;
        endpoint: string | undefined;
        supportedModels: string[];
        defaultModel: string | undefined;
        type: "provider" | "scheduler" | "tracker" | "pipeline";
    };
    /**
     * Track pipeline operation with I/O tracking
     * 跟踪流水线操作并记录I/O
     */
    trackPipelineOperation<T>(operationId: string, operation: () => Promise<T>, inputData?: any, operationType?: string): Promise<T>;
    /**
     * Record pipeline stage
     * 记录流水线阶段
     */
    recordPipelineStage(stageName: string, stageData: any, status?: 'started' | 'completed' | 'failed'): void;
    /**
     * Handle pipeline errors with enhanced error handling
     * 处理流水线错误并提供增强的错误处理
     */
    handlePipelineError(error: Error, context: {
        operation?: string;
        stage?: string;
        requestId?: string;
        additionalData?: Record<string, any>;
    }): void;
    /**
     * Get pipeline metrics
     * 获取流水线指标
     */
    getPipelineMetrics(): {
        debugEnabled: boolean;
        ioTrackingEnabled: boolean;
        debugConfig: DebugConfig;
        ioEntries: import("rcc-basemodule").ModuleIOEntry[];
        ioFiles: string[];
    } | {
        debugEnabled: boolean;
        ioTrackingEnabled: boolean;
        debugConfig: DebugConfig;
        ioEntries?: never;
        ioFiles?: never;
    };
    /**
     * Override destroy method to ensure proper cleanup
     * 重写destroy方法以确保正确的清理
     */
    destroy(): Promise<void>;
}
