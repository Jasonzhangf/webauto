/**
 * 简化版BaseOperation实现，用于快速通过编译测试
 */
export interface OperationConfig {
    [key: string]: any;
}
export interface OperationResult {
    success: boolean;
    result?: any;
    error?: string;
    metadata?: any;
    data?: any;
}
export interface ValidationResult {
    isValid: boolean;
    errors?: string[];
    warnings?: string[];
    finalParams?: OperationConfig;
}
export interface PerformanceMetrics {
    speed: 'fast' | 'medium' | 'slow';
    accuracy: 'low' | 'medium' | 'high';
    successRate: number;
    memoryUsage: 'low' | 'medium' | 'high';
}
export interface ExecutionStats {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
}
export interface OperationContext {
    id: string;
    browser?: any;
    page?: any;
    metadata?: {
        startTime: Date;
        userAgent?: string;
        viewport?: {
            width: number;
            height: number;
        };
    };
    logger?: {
        info: (message: string, data?: any) => void;
        warn: (message: string, data?: any) => void;
        error: (message: string, data?: any) => void;
        debug: (message: string, data?: any) => void;
    };
    eventBus?: any;
}
export interface IBaseOperation {
    name: string;
    description: string;
    version: string;
    author?: string;
    abstractCategories?: string[];
    supportedContainers?: string[];
    capabilities?: string[];
    performance?: PerformanceMetrics;
    requiredParameters?: string[];
    optionalParameters?: OperationConfig;
    stats?: ExecutionStats;
    config?: OperationConfig;
    execute(context: OperationContext, params?: OperationConfig): Promise<OperationResult>;
    validateParameters?(params: OperationConfig): ValidationResult;
    supportsContainer?(containerType: string): boolean;
    hasCapability?(capability: string): boolean;
    getStats?(): ExecutionStats;
    resetStats?(): void;
    getInfo?(): Record<string, any>;
}
export declare abstract class BaseOperation implements IBaseOperation {
    name: string;
    description: string;
    version: string;
    author?: string;
    abstractCategories: string[];
    supportedContainers: string[];
    capabilities: string[];
    performance: PerformanceMetrics;
    requiredParameters: string[];
    optionalParameters: OperationConfig;
    stats: ExecutionStats;
    config: OperationConfig;
    protected startTime: number;
    constructor();
    abstract execute(context: OperationContext, params?: OperationConfig): Promise<OperationResult>;
    validateParameters(params: OperationConfig): ValidationResult;
    supportsContainer(containerType: string): boolean;
    hasCapability(capability: string): boolean;
    getStats(): ExecutionStats;
    resetStats(): void;
    getInfo(): Record<string, any>;
}
