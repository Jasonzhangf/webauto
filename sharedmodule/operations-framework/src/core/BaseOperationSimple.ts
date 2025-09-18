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
    viewport?: { width: number; height: number };
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

export abstract class BaseOperation implements IBaseOperation {
  public name!: string;
  public description!: string;
  public version!: string;
  public author?: string;
  public abstractCategories: string[] = [];
  public supportedContainers: string[] = [];
  public capabilities: string[] = [];
  public performance: PerformanceMetrics = {
    speed: 'medium',
    accuracy: 'medium',
    successRate: 0.5,
    memoryUsage: 'medium'
  };
  public requiredParameters: string[] = [];
  public optionalParameters: OperationConfig = {};
  public stats: ExecutionStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0
  };
  public config: OperationConfig = {};

  protected startTime: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  abstract execute(context: OperationContext, params?: OperationConfig): Promise<OperationResult>;

  validateParameters(params: OperationConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查必需参数
    for (const param of this.requiredParameters) {
      if (!(param in params)) {
        errors.push(`Missing required parameter: ${param}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      finalParams: params
    };
  }

  supportsContainer(containerType: string): boolean {
    return this.supportedContainers.includes(containerType);
  }

  hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  getStats(): ExecutionStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0
    };
  }

  getInfo(): Record<string, any> {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      author: this.author,
      categories: this.abstractCategories,
      capabilities: this.capabilities,
      performance: this.performance,
      requiredParameters: this.requiredParameters,
      optionalParameters: this.optionalParameters
    };
  }
}