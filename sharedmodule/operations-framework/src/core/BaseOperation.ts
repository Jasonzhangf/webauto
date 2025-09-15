/**
 * Base Operation class that all micro-operations inherit from
 */

import {
  IBaseOperation,
  OperationConfig,
  OperationResult,
  ValidationResult,
  PerformanceMetrics,
  ExecutionStats,
  OperationContext
} from '../types';

export abstract class BaseOperation implements IBaseOperation {
  public name: string;
  public description: string;
  public version: string;
  public author: string;
  public abstractCategories: string[];
  public supportedContainers: string[];
  public capabilities: string[];
  public performance: PerformanceMetrics;
  public requiredParameters: string[];
  public optionalParameters: OperationConfig;
  public stats: ExecutionStats;
  public config: OperationConfig;

  constructor(config: OperationConfig = {}) {
    this.config = config;
    this.name = 'BaseOperation';
    this.description = 'Base operation class';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    // Abstract categories this operation belongs to
    this.abstractCategories = [];

    // Container types this operation supports
    this.supportedContainers = [];

    // Capabilities of this operation
    this.capabilities = [];

    // Performance characteristics
    this.performance = {
      speed: 'medium',
      accuracy: 'medium',
      successRate: 0.8,
      memoryUsage: 'medium'
    };

    // Required parameters
    this.requiredParameters = [];

    // Optional parameters with defaults
    this.optionalParameters = {};

    // Execution statistics
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0
    };
  }

  /**
   * Execute the operation with given context and parameters
   * @param context - Execution context
   * @param params - Operation parameters
   * @returns Execution result
   */
  abstract execute(context: OperationContext, params?: OperationConfig): Promise<OperationResult>;

  /**
   * Validate parameters before execution
   * @param params - Parameters to validate
   * @returns Validation result
   */
  validateParameters(params: OperationConfig = {}): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required parameters
    for (const param of this.requiredParameters) {
      if (params[param] === undefined || params[param] === null || params[param] === '') {
        errors.push(`Required parameter '${param}' is missing or empty`);
      }
    }

    // Set defaults for optional parameters
    const finalParams = { ...this.optionalParameters, ...params };

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      finalParams
    };
  }

  /**
   * Check if this operation supports a given container type
   * @param containerType - Container type to check
   * @returns True if supported
   */
  supportsContainer(containerType: string): boolean {
    return this.supportedContainers.includes(containerType) ||
           this.supportedContainers.includes('any');
  }

  /**
   * Check if this operation has a specific capability
   * @param capability - Capability to check
   * @returns True if has capability
   */
  hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Log a message
   * @param level - Log level
   * @param message - Log message
   * @param data - Additional data
   */
  log(level: string, message: string, data: any = {}): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      operation: this.name,
      message,
      data
    };

    // Simple console logging - can be enhanced with proper logging system
    switch (level) {
      case 'error':
        console.error(`[${timestamp}] [${this.name}] ERROR: ${message}`, data);
        break;
      case 'warn':
        console.warn(`[${timestamp}] [${this.name}] WARN: ${message}`, data);
        break;
      case 'info':
        console.info(`[${timestamp}] [${this.name}] INFO: ${message}`, data);
        break;
      case 'debug':
        console.debug(`[${timestamp}] [${this.name}] DEBUG: ${message}`, data);
        break;
      default:
        console.log(`[${timestamp}] [${this.name}] ${level.toUpperCase()}: ${message}`, data);
    }
  }

  /**
   * Update execution statistics
   * @param success - Whether execution was successful
   * @param executionTime - Execution time in milliseconds
   */
  updateStats(success: boolean, executionTime: number): void {
    this.stats.totalExecutions++;

    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }

    // Update average execution time
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + executionTime;
    this.stats.averageExecutionTime = totalTime / this.stats.totalExecutions;
  }

  /**
   * Get execution statistics
   * @returns Current execution statistics
   */
  getStats(): ExecutionStats {
    return { ...this.stats };
  }

  /**
   * Reset execution statistics
   */
  resetStats(): void {
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0
    };
  }

  /**
   * Get operation info
   * @returns Operation information
   */
  getInfo(): Record<string, any> {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      author: this.author,
      abstractCategories: this.abstractCategories,
      supportedContainers: this.supportedContainers,
      capabilities: this.capabilities,
      performance: this.performance,
      requiredParameters: this.requiredParameters,
      optionalParameters: Object.keys(this.optionalParameters),
      stats: this.getStats()
    };
  }
}

export default BaseOperation;