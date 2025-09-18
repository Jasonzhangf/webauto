/**
 * Operation Registry for managing micro-operations
 */

import { IBaseOperation, PerformanceMetrics, OperationConfig } from '../types/operationTypes';

/**
 * 操作注册表 - 管理所有微操作的注册和查找
 */
export class OperationRegistry {
  private operations: Map<string, IBaseOperation>;
  private abstractCategoryMap: Map<string, Set<string>>;
  private containerMap: Map<string, Set<string>>;
  private capabilityMap: Map<string, Set<string>>;
  private stats: {
    totalOperations: number;
    totalCategories: number;
    totalContainers: number;
    totalCapabilities: number;
  };

  constructor() {
    this.operations = new Map();
    this.abstractCategoryMap = new Map();
    this.containerMap = new Map();
    this.capabilityMap = new Map();
    this.stats = {
      totalOperations: 0,
      totalCategories: 0,
      totalContainers: 0,
      totalCapabilities: 0
    };
  }

  /**
   * Register an operation
   * @param operation - Operation instance to register
   */
  register(operation: IBaseOperation): void {
    if (!operation || !operation.name) {
      throw new Error('Operation must have a name');
    }

    if (this.operations.has(operation.name)) {
      throw new Error(`Operation '${operation.name}' is already registered`);
    }

    // Register the operation
    this.operations.set(operation.name, operation);

    // Update abstract category mappings
    for (const category of operation.abstractCategories) {
      if (!this.abstractCategoryMap.has(category)) {
        this.abstractCategoryMap.set(category, new Set());
      }
      this.abstractCategoryMap.get(category)!.add(operation.name);
    }

    // Update container type mappings
    for (const container of operation.supportedContainers) {
      if (!this.containerMap.has(container)) {
        this.containerMap.set(container, new Set());
      }
      this.containerMap.get(container)!.add(operation.name);
    }

    // Update capability mappings
    for (const capability of operation.capabilities) {
      if (!this.capabilityMap.has(capability)) {
        this.capabilityMap.set(capability, new Set());
      }
      this.capabilityMap.get(capability)!.add(operation.name);
    }

    // Update statistics
    this.updateStatistics();

    console.log(`Registered operation: ${operation.name}`);
  }

  /**
   * Unregister an operation
   * @param operationName - Name of operation to unregister
   */
  unregister(operationName: string): void {
    const operation = this.operations.get(operationName);
    if (!operation) {
      return;
    }

    // Remove from operations map
    this.operations.delete(operationName);

    // Remove from abstract category mappings
    for (const category of operation.abstractCategories) {
      const operations = this.abstractCategoryMap.get(category);
      if (operations) {
        operations.delete(operationName);
        if (operations.size === 0) {
          this.abstractCategoryMap.delete(category);
        }
      }
    }

    // Remove from container mappings
    for (const container of operation.supportedContainers) {
      const operations = this.containerMap.get(container);
      if (operations) {
        operations.delete(operationName);
        if (operations.size === 0) {
          this.containerMap.delete(container);
        }
      }
    }

    // Remove from capability mappings
    for (const capability of operation.capabilities) {
      const operations = this.capabilityMap.get(capability);
      if (operations) {
        operations.delete(operationName);
        if (operations.size === 0) {
          this.capabilityMap.delete(capability);
        }
      }
    }

    // Update statistics
    this.updateStatistics();

    console.log(`Unregistered operation: ${operationName}`);
  }

  /**
   * Get operation by name
   * @param operationName - Name of operation to get
   * @returns Operation instance or undefined
   */
  getOperation(operationName: string): IBaseOperation | undefined {
    return this.operations.get(operationName);
  }

  /**
   * Get all operations
   * @returns All registered operations
   */
  getAllOperations(): IBaseOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get operations by abstract category
   * @param category - Abstract category
   * @returns Operations in category
   */
  getOperationsByCategory(category: string): IBaseOperation[] {
    const operationNames = this.abstractCategoryMap.get(category);
    if (!operationNames) {
      return [];
    }

    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter((op): op is IBaseOperation => op !== undefined);
  }

  /**
   * Get operations by container type
   * @param containerType - Container type
   * @returns Operations that support container
   */
  getOperationsByContainer(containerType: string): IBaseOperation[] {
    const operationNames = this.containerMap.get(containerType);
    if (!operationNames) {
      return [];
    }

    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter((op): op is IBaseOperation => op !== undefined);
  }

  /**
   * Get operations by capability
   * @param capability - Capability
   * @returns Operations with capability
   */
  getOperationsByCapability(capability: string): IBaseOperation[] {
    const operationNames = this.capabilityMap.get(capability);
    if (!operationNames) {
      return [];
    }

    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter((op): op is IBaseOperation => op !== undefined);
  }

  /**
   * Find operations matching multiple criteria
   * @param criteria - Search criteria
   * @returns Matching operations
   */
  findOperations(criteria: {
    abstractCategories?: string[];
    containerTypes?: string[];
    capabilities?: string[];
    performance?: Partial<PerformanceMetrics>;
  } = {}): IBaseOperation[] {
    let candidates = this.getAllOperations();

    // Filter by abstract categories
    if (criteria.abstractCategories && criteria.abstractCategories.length > 0) {
      candidates = candidates.filter(op =>
        criteria.abstractCategories!.some(cat => op.abstractCategories.includes(cat))
      );
    }

    // Filter by container types
    if (criteria.containerTypes && criteria.containerTypes.length > 0) {
      candidates = candidates.filter(op =>
        criteria.containerTypes!.some(container => op.supportedContainers.includes(container))
      );
    }

    // Filter by capabilities
    if (criteria.capabilities && criteria.capabilities.length > 0) {
      candidates = candidates.filter(op =>
        criteria.capabilities!.every(cap => op.capabilities.includes(cap))
      );
    }

    // Filter by performance requirements
    if (criteria.performance) {
      candidates = candidates.filter(op => {
        const perf = criteria.performance!;

        if (perf.speed && op.performance.speed !== perf.speed) {
          return false;
        }

        if (perf.accuracy && op.performance.accuracy !== perf.accuracy) {
          return false;
        }

        if (perf.successRate !== undefined && op.performance.successRate < perf.successRate) {
          return false;
        }

        if (perf.memoryUsage && op.performance.memoryUsage !== perf.memoryUsage) {
          return false;
        }

        return true;
      });
    }

    return candidates;
  }

  /**
   * Match operations for a given abstract step and context
   * @param abstractCategory - Abstract category to match
   * @param context - Matching context
   * @param forceOperation - Force specific operation
   * @returns Matched operations with scores
   */
  matchOperations(
    abstractCategory: string,
    context: OperationConfig = {},
    forceOperation: string | null = null
  ): Array<{
    operation: IBaseOperation;
    operationName: string;
    score: number;
    reason: string;
  }> {
    // If forceOperation is specified, return only that operation
    if (forceOperation) {
      const operation = this.getOperation(forceOperation);
      if (operation && operation.abstractCategories.includes(abstractCategory)) {
        const score = this.calculateMatchScore(operation, context);
        return [{
          operation,
          operationName: operation.name,
          score,
          reason: 'Forced operation match'
        }];
      } else {
        return [];
      }
    }

    // Get operations for the abstract category
    const operations = this.getOperationsByCategory(abstractCategory);

    // Calculate match scores
    const matches = operations.map(operation => {
      const score = this.calculateMatchScore(operation, context);
      return {
        operation,
        operationName: operation.name,
        score,
        reason: 'Calculated match score'
      };
    });

    // Sort by score (highest first)
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Get the best match for a given abstract step and context
   * @param abstractCategory - Abstract category to match
   * @param context - Matching context
   * @param forceOperation - Force specific operation
   * @returns Best match or null if no match
   */
  getBestMatch(
    abstractCategory: string,
    context: OperationConfig = {},
    forceOperation: string | null = null
  ): {
    operation: IBaseOperation;
    operationName: string;
    score: number;
    reason: string;
  } | null {
    const matches = this.matchOperations(abstractCategory, context, forceOperation);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Create operation instance with configuration
   * @param operationName - Name of operation to create
   * @param config - Operation configuration
   * @returns Configured operation instance
   */
  createInstance(operationName: string, config: OperationConfig = {}): IBaseOperation {
    const OperationClass = this.getOperation(operationName);
    if (!OperationClass) {
      throw new Error(`Operation '${operationName}' not found in registry`);
    }

    // Create a new instance of the operation with the provided configuration
    const instance = new (OperationClass.constructor as any)(config);
    return instance;
  }

  /**
   * Calculate match score for an operation based on context
   * @param operation - Operation to score
   * @param context - Matching context
   * @returns Match score (0-100)
   */
  private calculateMatchScore(operation: IBaseOperation, context: OperationConfig): number {
    let score = 50; // Base score

    // Boost score based on performance characteristics
    if (operation.performance.successRate > 0.9) {
      score += 20;
    } else if (operation.performance.successRate > 0.8) {
      score += 10;
    } else if (operation.performance.successRate > 0.7) {
      score += 5;
    }

    // Boost score based on speed
    if (operation.performance.speed === 'fast') {
      score += 15;
    } else if (operation.performance.speed === 'medium') {
      score += 5;
    }

    // Boost score based on accuracy
    if (operation.performance.accuracy === 'high') {
      score += 15;
    } else if (operation.performance.accuracy === 'medium') {
      score += 5;
    }

    // Penalize high memory usage
    if (operation.performance.memoryUsage === 'high') {
      score -= 10;
    }

    // Context-based scoring (simplified)
    if (context.preferredSpeed && context.preferredSpeed === operation.performance.speed) {
      score += 10;
    }

    if (context.preferredAccuracy && context.preferredAccuracy === operation.performance.accuracy) {
      score += 10;
    }

    // Ensure score is within bounds
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Update registry statistics
   */
  private updateStatistics(): void {
    this.stats = {
      totalOperations: this.operations.size,
      totalCategories: this.abstractCategoryMap.size,
      totalContainers: this.containerMap.size,
      totalCapabilities: this.capabilityMap.size
    };
  }

  /**
   * Get registry statistics
   * @returns Registry statistics
   */
  getStatistics(): {
    totalOperations: number;
    totalCategories: number;
    totalContainers: number;
    totalCapabilities: number;
    abstractCategories: Record<string, {
      operationCount: number;
      operations: string[];
    }>;
    containerTypes: Record<string, {
      operationCount: number;
      operations: string[];
    }>;
    capabilities: Record<string, {
      operationCount: number;
      operations: string[];
    }>;
    operations: Record<string, any>;
  } {
    const detailedStats = {
      ...this.stats,
      abstractCategories: {},
      containerTypes: {},
      capabilities: {},
      operations: {}
    };

    // Detailed abstract category stats
    for (const [category, operations] of this.abstractCategoryMap) {
      detailedStats.abstractCategories[category] = {
        operationCount: operations.size,
        operations: Array.from(operations)
      };
    }

    // Detailed container type stats
    for (const [container, operations] of this.containerMap) {
      detailedStats.containerTypes[container] = {
        operationCount: operations.size,
        operations: Array.from(operations)
      };
    }

    // Detailed capability stats
    for (const [capability, operations] of this.capabilityMap) {
      detailedStats.capabilities[capability] = {
        operationCount: operations.size,
        operations: Array.from(operations)
      };
    }

    // Detailed operation stats
    for (const [name, operation] of this.operations) {
      detailedStats.operations[name] = operation.getInfo();
    }

    return detailedStats;
  }

  /**
   * Clear all registered operations
   */
  clear(): void {
    this.operations.clear();
    this.abstractCategoryMap.clear();
    this.containerMap.clear();
    this.capabilityMap.clear();
    this.updateStatistics();
    console.log('Cleared all registered operations');
  }

  /**
   * Export registry configuration
   * @returns Exportable configuration
   */
  exportConfig(): {
    operations: any[];
    statistics: any;
  } {
    return {
      operations: Array.from(this.operations.values()).map(op => op.getInfo()),
      statistics: this.getStatistics()
    };
  }

  /**
   * Import registry configuration (metadata only)
   * @param config - Configuration to import
   */
  importConfig(config: {
    operations: any[];
    statistics: any;
  }): void {
    // This would typically be used with a factory to recreate operations
    console.log('Registry configuration import not implemented - requires operation factory');
  }

  /**
   * Check if operation is registered
   * @param operationName - Name of operation to check
   * @returns True if operation is registered
   */
  hasOperation(operationName: string): boolean {
    return this.operations.has(operationName);
  }

  /**
   * Get operation categories
   * @returns All registered abstract categories
   */
  getCategories(): string[] {
    return Array.from(this.abstractCategoryMap.keys());
  }

  /**
   * Get supported container types
   * @returns All supported container types
   */
  getContainerTypes(): string[] {
    return Array.from(this.containerMap.keys());
  }

  /**
   * Get available capabilities
   * @returns All available capabilities
   */
  getCapabilities(): string[] {
    return Array.from(this.capabilityMap.keys());
  }
}

// Global registry instance
export const globalRegistry = new OperationRegistry();

export default OperationRegistry;