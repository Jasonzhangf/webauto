/**
 * Pipeline Operation Registry
 * 流水线操作子注册表
 */

import { PipelineBaseOperation } from './PipelineBaseOperation';
import { IPipelineOperation, PipelineOperationRegistry as IPipelineOperationRegistry } from '../interfaces/IPipelineOperation';

/**
 * Registry for managing pipeline operations
 * 用于管理流水线操作子的注册表
 */
export class PipelineOperationRegistry implements IPipelineOperationRegistry {
  private operations: Map<string, PipelineBaseOperation> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private capabilities: Map<string, Set<string>> = new Map();

  constructor() {
    this.logger.info('Pipeline operation registry initialized');
  }

  /**
   * Register an operation
   * 注册操作子
   */
  registerOperation(operation: PipelineBaseOperation): void {
    if (!operation.name) {
      throw new Error('Operation must have a name');
    }

    if (this.operations.has(operation.name)) {
      this.logger.warn('Operation already registered, overwriting', { operationName: operation.name });
    }

    this.operations.set(operation.name, operation);

    // Register categories
    if (operation.abstractCategories && operation.abstractCategories.length > 0) {
      for (const category of operation.abstractCategories) {
        if (!this.categories.has(category)) {
          this.categories.set(category, new Set());
        }
        this.categories.get(category)!.add(operation.name);
      }
    }

    // Register capabilities
    if (operation.capabilities && operation.capabilities.length > 0) {
      for (const capability of operation.capabilities) {
        if (!this.capabilities.has(capability)) {
          this.capabilities.set(capability, new Set());
        }
        this.capabilities.get(capability)!.add(operation.name);
      }
    }

    this.logger.info('Operation registered successfully', {
      operationName: operation.name,
      categories: operation.abstractCategories,
      capabilities: operation.capabilities
    });
  }

  /**
   * Get an operation by name
   * 根据名称获取操作子
   */
  getOperation(name: string): PipelineBaseOperation | undefined {
    return this.operations.get(name);
  }

  /**
   * Check if an operation exists
   * 检查操作子是否存在
   */
  hasOperation(name: string): boolean {
    return this.operations.has(name);
  }

  /**
   * List all registered operations
   * 列出所有已注册的操作子
   */
  listOperations(): string[] {
    return Array.from(this.operations.keys());
  }

  /**
   * Get operations by category
   * 根据类别获取操作子
   */
  getOperationsByCategory(category: string): PipelineBaseOperation[] {
    const operationNames = this.categories.get(category);
    if (!operationNames) {
      return [];
    }

    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter(Boolean) as PipelineBaseOperation[];
  }

  /**
   * Get operations by capability
   * 根据能力获取操作子
   */
  getOperationsByCapability(capability: string): PipelineBaseOperation[] {
    const operationNames = this.capabilities.get(capability);
    if (!operationNames) {
      return [];
    }

    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter(Boolean) as PipelineBaseOperation[];
  }

  /**
   * Get all categories
   * 获取所有类别
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all capabilities
   * 获取所有能力
   */
  getCapabilities(): string[] {
    return Array.from(this.capabilities.keys());
  }

  /**
   * Get operations by multiple categories
   * 根据多个类别获取操作子
   */
  getOperationsByCategories(categories: string[]): PipelineBaseOperation[] {
    const matchingOperations = new Set<string>();

    for (const category of categories) {
      const operationNames = this.categories.get(category);
      if (operationNames) {
        operationNames.forEach(name => matchingOperations.add(name));
      }
    }

    return Array.from(matchingOperations)
      .map(name => this.operations.get(name))
      .filter(Boolean) as PipelineBaseOperation[];
  }

  /**
   * Get operations by multiple capabilities
   * 根据多个能力获取操作子
   */
  getOperationsByCapabilities(capabilities: string[]): PipelineBaseOperation[] {
    const matchingOperations = new Set<string>();

    for (const capability of capabilities) {
      const operationNames = this.capabilities.get(capability);
      if (operationNames) {
        operationNames.forEach(name => matchingOperations.add(name));
      }
    }

    return Array.from(matchingOperations)
      .map(name => this.operations.get(name))
      .filter(Boolean) as PipelineBaseOperation[];
  }

  /**
   * Unregister an operation
   * 注销操作子
   */
  unregisterOperation(name: string): boolean {
    const operation = this.operations.get(name);
    if (!operation) {
      return false;
    }

    // Remove from operations map
    this.operations.delete(name);

    // Remove from categories
    if (operation.abstractCategories) {
      for (const category of operation.abstractCategories) {
        const categoryOperations = this.categories.get(category);
        if (categoryOperations) {
          categoryOperations.delete(name);
          if (categoryOperations.size === 0) {
            this.categories.delete(category);
          }
        }
      }
    }

    // Remove from capabilities
    if (operation.capabilities) {
      for (const capability of operation.capabilities) {
        const capabilityOperations = this.capabilities.get(capability);
        if (capabilityOperations) {
          capabilityOperations.delete(name);
          if (capabilityOperations.size === 0) {
            this.capabilities.delete(capability);
          }
        }
      }
    }

    this.logger.info('Operation unregistered', { operationName: name });
    return true;
  }

  /**
   * Clear all operations
   * 清除所有操作子
   */
  clear(): void {
    this.operations.clear();
    this.categories.clear();
    this.capabilities.clear();
    this.logger.info('All operations cleared from registry');
  }

  /**
   * Get registry statistics
   * 获取注册表统计信息
   */
  getRegistryStats(): {
    totalOperations: number;
    totalCategories: number;
    totalCapabilities: number;
    categoryStats: Record<string, number>;
    capabilityStats: Record<string, number>;
  } {
    const categoryStats: Record<string, number> = {};
    const capabilityStats: Record<string, number> = {};

    for (const [category, operations] of this.categories.entries()) {
      categoryStats[category] = operations.size;
    }

    for (const [capability, operations] of this.capabilities.entries()) {
      capabilityStats[capability] = operations.size;
    }

    return {
      totalOperations: this.operations.size,
      totalCategories: this.categories.size,
      totalCapabilities: this.capabilities.size,
      categoryStats,
      capabilityStats
    };
  }

  /**
   * Validate operation registration
   * 验证操作子注册
   */
  validateOperation(operation: PipelineBaseOperation): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!operation.name) {
      errors.push('Operation name is required');
    }

    if (!operation.description) {
      warnings.push('Operation description is recommended');
    }

    if (!operation.version) {
      warnings.push('Operation version is recommended');
    }

    // Validate operation structure
    if (typeof operation.execute !== 'function') {
      errors.push('Operation must have an execute method');
    }

    if (typeof operation.validateParameters !== 'function') {
      warnings.push('Operation should have a validateParameters method');
    }

    // Check for name conflicts
    if (this.operations.has(operation.name)) {
      warnings.push(`Operation name '${operation.name}' conflicts with existing operation`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get operation info
   * 获取操作子信息
   */
  getOperationInfo(name: string): {
    name: string;
    description: string;
    version: string;
    categories: string[];
    capabilities: string[];
    isRegistered: boolean;
  } | null {
    const operation = this.operations.get(name);
    if (!operation) {
      return null;
    }

    return {
      name: operation.name,
      description: operation.description,
      version: operation.version,
      categories: operation.abstractCategories || [],
      capabilities: operation.capabilities || [],
      isRegistered: true
    };
  }

  /**
   * Search operations by name pattern
   * 根据名称模式搜索操作子
   */
  searchOperations(pattern: string): PipelineBaseOperation[] {
    const regex = new RegExp(pattern, 'i');
    return Array.from(this.operations.values())
      .filter(operation => regex.test(operation.name));
  }

  /**
   * Get operation dependencies
   * 获取操作子依赖关系
   */
  getOperationDependencies(name: string): {
    dependsOn: string[];
    dependedBy: string[];
  } {
    // This is a simple implementation - in a real system, you might have more complex dependency tracking
    const dependsOn: string[] = [];
    const dependedBy: string[] = [];

    // For now, return empty arrays as dependencies are not explicitly tracked
    return {
      dependsOn,
      dependedBy
    };
  }

  // Get registry size
  get size(): number {
    return this.operations.size;
  }

  // Simple logger
  private logger = {
    info: (message: string, data?: any) => console.log(`[OperationRegistry] ${message}`, data || ''),
    warn: (message: string, data?: any) => console.warn(`[OperationRegistry] ${message}`, data || ''),
    error: (message: string, data?: any) => console.error(`[OperationRegistry] ${message}`, data || '')
  };
}