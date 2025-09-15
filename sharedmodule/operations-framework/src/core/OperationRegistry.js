/**
 * Operation Registry for managing micro-operations
 */

export class OperationRegistry {
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
   * @param {BaseOperation} operation - Operation instance to register
   */
  register(operation) {
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
      this.abstractCategoryMap.get(category).add(operation.name);
    }
    
    // Update container type mappings
    for (const container of operation.supportedContainers) {
      if (!this.containerMap.has(container)) {
        this.containerMap.set(container, new Set());
      }
      this.containerMap.get(container).add(operation.name);
    }
    
    // Update capability mappings
    for (const capability of operation.capabilities) {
      if (!this.capabilityMap.has(capability)) {
        this.capabilityMap.set(capability, new Set());
      }
      this.capabilityMap.get(capability).add(operation.name);
    }
    
    // Update statistics
    this.updateStatistics();
    
    console.log(`Registered operation: ${operation.name}`);
  }
  
  /**
   * Unregister an operation
   * @param {string} operationName - Name of operation to unregister
   */
  unregister(operationName) {
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
   * @param {string} operationName - Name of operation to get
   * @returns {BaseOperation|undefined} Operation instance
   */
  getOperation(operationName) {
    return this.operations.get(operationName);
  }
  
  /**
   * Get all operations
   * @returns {Array<BaseOperation>} All registered operations
   */
  getAllOperations() {
    return Array.from(this.operations.values());
  }
  
  /**
   * Get operations by abstract category
   * @param {string} category - Abstract category
   * @returns {Array<BaseOperation>} Operations in category
   */
  getOperationsByCategory(category) {
    const operationNames = this.abstractCategoryMap.get(category);
    if (!operationNames) {
      return [];
    }
    
    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter(op => op !== undefined);
  }
  
  /**
   * Get operations by container type
   * @param {string} containerType - Container type
   * @returns {Array<BaseOperation>} Operations that support container
   */
  getOperationsByContainer(containerType) {
    const operationNames = this.containerMap.get(containerType);
    if (!operationNames) {
      return [];
    }
    
    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter(op => op !== undefined);
  }
  
  /**
   * Get operations by capability
   * @param {string} capability - Capability
   * @returns {Array<BaseOperation>} Operations with capability
   */
  getOperationsByCapability(capability) {
    const operationNames = this.capabilityMap.get(capability);
    if (!operationNames) {
      return [];
    }
    
    return Array.from(operationNames)
      .map(name => this.operations.get(name))
      .filter(op => op !== undefined);
  }
  
  /**
   * Find operations matching multiple criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array<BaseOperation>} Matching operations
   */
  findOperations(criteria = {}) {
    let candidates = this.getAllOperations();
    
    // Filter by abstract categories
    if (criteria.abstractCategories && criteria.abstractCategories.length > 0) {
      candidates = candidates.filter(op => 
        criteria.abstractCategories.some(cat => op.abstractCategories.includes(cat))
      );
    }
    
    // Filter by container types
    if (criteria.containerTypes && criteria.containerTypes.length > 0) {
      candidates = candidates.filter(op => 
        criteria.containerTypes.some(container => op.supportedContainers.includes(container))
      );
    }
    
    // Filter by capabilities
    if (criteria.capabilities && criteria.capabilities.length > 0) {
      candidates = candidates.filter(op => 
        criteria.capabilities.every(cap => op.capabilities.includes(cap))
      );
    }
    
    // Filter by performance requirements
    if (criteria.performance) {
      candidates = candidates.filter(op => {
        const perf = criteria.performance;
        
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
   * @param {string} abstractCategory - Abstract category to match
   * @param {Object} context - Matching context
   * @param {string} forceOperation - Force specific operation
   * @returns {Array<Object>} Matched operations with scores
   */
  matchOperations(abstractCategory, context = {}, forceOperation = null) {
    // If forceOperation is specified, return only that operation
    if (forceOperation) {
      const operation = this.getOperation(forceOperation);
      if (operation && operation.abstractCategories.includes(abstractCategory)) {
        const score = operation.calculateMatchScore(context);
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
      const score = operation.calculateMatchScore(context);
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
   * @param {string} abstractCategory - Abstract category to match
   * @param {Object} context - Matching context
   * @param {string} forceOperation - Force specific operation
   * @returns {Object|null} Best match or null if no match
   */
  getBestMatch(abstractCategory, context = {}, forceOperation = null) {
    const matches = this.matchOperations(abstractCategory, context, forceOperation);
    return matches.length > 0 ? matches[0] : null;
  }
  
  /**
   * Update registry statistics
   */
  updateStatistics() {
    this.stats = {
      totalOperations: this.operations.size,
      totalCategories: this.abstractCategoryMap.size,
      totalContainers: this.containerMap.size,
      totalCapabilities: this.capabilityMap.size
    };
  }
  
  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStatistics() {
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
      detailedStats.operations[name] = operation.getMetadata();
    }
    
    return detailedStats;
  }
  
  /**
   * Clear all registered operations
   */
  clear() {
    this.operations.clear();
    this.abstractCategoryMap.clear();
    this.containerMap.clear();
    this.capabilityMap.clear();
    this.updateStatistics();
    console.log('Cleared all registered operations');
  }
  
  /**
   * Export registry configuration
   * @returns {Object} Exportable configuration
   */
  exportConfig() {
    return {
      operations: Array.from(this.operations.values()).map(op => op.getMetadata()),
      statistics: this.getStatistics()
    };
  }
  
  /**
   * Import registry configuration (metadata only)
   * @param {Object} config - Configuration to import
   */
  importConfig(config) {
    // This would typically be used with a factory to recreate operations
    console.log('Registry configuration import not implemented - requires operation factory');
  }
}

// Global registry instance
export const globalRegistry = new OperationRegistry();