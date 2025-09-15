/**
 * Base Operation class that all micro-operations inherit from
 */

export class BaseOperation {
  constructor(config = {}) {
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
      speed: 'medium',    // fast/medium/slow
      accuracy: 'medium', // high/medium/low
      successRate: 0.8,   // 0.0 - 1.0
      memoryUsage: 'medium' // low/medium/high
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
   * @param {Object} context - Execution context
   * @param {Object} params - Operation parameters
   * @returns {Promise<Object>} Execution result
   */
  async execute(context, params = {}) {
    throw new Error('execute method must be implemented by subclass');
  }
  
  /**
   * Validate parameters before execution
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validation result
   */
  validateParameters(params = {}) {
    const errors = [];
    const warnings = [];
    
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
   * @param {string} containerType - Container type to check
   * @returns {boolean} True if supported
   */
  supportsContainer(containerType) {
    return this.supportedContainers.includes(containerType) || 
           this.supportedContainers.includes('any');
  }
  
  /**
   * Check if this operation has a specific capability
   * @param {string} capability - Capability to check
   * @returns {boolean} True if has capability
   */
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }
  
  /**
   * Get operation metadata
   * @returns {Object} Operation metadata
   */
  getMetadata() {
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
      optionalParameters: this.optionalParameters,
      stats: this.stats
    };
  }
  
  /**
   * Update execution statistics
   * @param {boolean} success - Whether execution was successful
   * @param {number} executionTime - Execution time in milliseconds
   */
  updateStats(success, executionTime) {
    this.stats.totalExecutions++;
    
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    
    // Update average execution time
    this.stats.averageExecutionTime = 
      (this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + executionTime) / 
      this.stats.totalExecutions;
  }
  
  /**
   * Calculate match score for a given context
   * @param {Object} context - Matching context
   * @returns {number} Match score (0-1)
   */
  calculateMatchScore(context = {}) {
    let score = 0;
    let maxScore = 0;
    
    // Container match (40% weight)
    if (context.container && context.container.type) {
      maxScore += 0.4;
      if (this.supportsContainer(context.container.type)) {
        score += 0.4;
        // Bonus for preferred container
        if (this.preferredContainers && this.preferredContainers.includes(context.container.type)) {
          score += 0.1;
        }
      }
    }
    
    // Capability match (30% weight)
    if (context.requiredCapabilities) {
      const capabilityWeight = 0.3 / context.requiredCapabilities.length;
      for (const capability of context.requiredCapabilities) {
        maxScore += capabilityWeight;
        if (this.hasCapability(capability)) {
          score += capabilityWeight;
        }
      }
    }
    
    // Performance match (20% weight)
    if (context.performanceRequirements) {
      maxScore += 0.2;
      let performanceScore = 0;
      
      if (context.performanceRequirements.speed) {
        if (this.performance.speed === context.performanceRequirements.speed) {
          performanceScore += 0.05;
        }
      }
      
      if (context.performanceRequirements.accuracy) {
        if (this.performance.accuracy === context.performanceRequirements.accuracy) {
          performanceScore += 0.05;
        }
      }
      
      if (context.performanceRequirements.successRate !== undefined) {
        if (this.performance.successRate >= context.performanceRequirements.successRate) {
          performanceScore += 0.05;
        }
      }
      
      if (context.performanceRequirements.memoryUsage) {
        if (this.performance.memoryUsage === context.performanceRequirements.memoryUsage) {
          performanceScore += 0.05;
        }
      }
      
      score += performanceScore;
    }
    
    // Context match (10% weight)
    if (context.additionalContext) {
      maxScore += 0.1;
      // This can be customized by subclasses
      score += this.calculateContextMatchScore(context.additionalContext) * 0.1;
    }
    
    return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  }
  
  /**
   * Calculate context match score (can be overridden by subclasses)
   * @param {Object} context - Additional context
   * @returns {number} Context match score (0-1)
   */
  calculateContextMatchScore(context) {
    return 0.5; // Default neutral score
  }
  
  /**
   * Log operation execution
   * @param {string} level - Log level (info, warn, error)
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      operation: this.name,
      message,
      data
    };
    
    console.log(`[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}`, data);
  }
}