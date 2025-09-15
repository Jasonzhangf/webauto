/**
 * 抽象步骤注册表
 * 管理抽象步骤定义和步骤依赖关系
 */

/**
 * 抽象步骤依赖关系
 */
export class StepDependency {
  constructor(fromStepId, toStepId, type = 'requires', config = {}) {
    this.fromStepId = fromStepId;
    this.toStepId = toStepId;
    this.type = type; // 'requires', 'optional', 'excludes'
    this.condition = config.condition || null;
    this.metadata = {
      ...config.metadata,
      createdAt: Date.now()
    };
  }

  /**
   * 评估依赖条件
   */
  evaluate(context) {
    if (!this.condition) {
      return true;
    }
    
    if (typeof this.condition === 'function') {
      return this.condition(context);
    }
    
    if (typeof this.condition === 'string') {
      return this.evaluateExpression(this.condition, context);
    }
    
    return Boolean(this.condition);
  }

  /**
   * 评估表达式
   */
  evaluateExpression(expression, context) {
    try {
      const state = context.state || {};
      return new Function('state', `return ${expression}`)(state);
    } catch (error) {
      return false;
    }
  }
}

/**
 * 抽象步骤组合
 */
export class StepComposition {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.description = config.description || '';
    this.steps = config.steps || [];
    this.executionMode = config.executionMode || 'sequence'; // 'sequence', 'parallel', 'conditional'
    this.dependencies = config.dependencies || [];
    this.parameters = config.parameters || {};
    this.metadata = {
      ...config.metadata,
      createdAt: Date.now(),
      version: config.version || '1.0.0'
    };
  }

  /**
   * 添加步骤
   */
  addStep(stepId, config = {}) {
    this.steps.push({
      id: stepId,
      config,
      addedAt: Date.now()
    });
    return this;
  }

  /**
   * 移除步骤
   */
  removeStep(stepId) {
    const index = this.steps.findIndex(s => s.id === stepId);
    if (index >= 0) {
      this.steps.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 添加依赖关系
   */
  addDependency(fromStepId, toStepId, type = 'requires', config = {}) {
    const dependency = new StepDependency(fromStepId, toStepId, type, config);
    this.dependencies.push(dependency);
    return this;
  }

  /**
   * 验证组合
   */
  validate(stepRegistry) {
    const errors = [];
    
    // 验证步骤存在性
    for (const step of this.steps) {
      if (!stepRegistry.has(step.id)) {
        errors.push(`Step '${step.id}' not found in registry`);
      }
    }
    
    // 验证依赖关系
    for (const dependency of this.dependencies) {
      if (!stepRegistry.has(dependency.fromStepId)) {
        errors.push(`Dependency source step '${dependency.fromStepId}' not found`);
      }
      if (!stepRegistry.has(dependency.toStepId)) {
        errors.push(`Dependency target step '${dependency.toStepId}' not found`);
      }
    }
    
    // 验证执行模式
    const validModes = ['sequence', 'parallel', 'conditional'];
    if (!validModes.includes(this.executionMode)) {
      errors.push(`Invalid execution mode: ${this.executionMode}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取执行顺序
   */
  getExecutionOrder(stepRegistry) {
    if (this.executionMode === 'parallel') {
      return this.steps.map(s => s.id);
    }
    
    if (this.executionMode === 'sequence') {
      return this.resolveDependencies(stepRegistry);
    }
    
    // 条件模式：返回所有可能步骤
    return this.steps.map(s => s.id);
  }

  /**
   * 解析依赖关系
   */
  resolveDependencies(stepRegistry) {
    const steps = new Set(this.steps.map(s => s.id));
    const dependencies = this.dependencies.filter(d => 
      steps.has(d.fromStepId) && steps.has(d.toStepId)
    );
    
    // 拓扑排序
    const visited = new Set();
    const visiting = new Set();
    const result = [];
    
    const visit = (stepId) => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected involving step '${stepId}'`);
      }
      
      if (visited.has(stepId)) {
        return;
      }
      
      visiting.add(stepId);
      
      // 访问依赖的步骤
      const deps = dependencies
        .filter(d => d.toStepId === stepId && d.type === 'requires')
        .map(d => d.fromStepId);
      
      for (const dep of deps) {
        visit(dep);
      }
      
      visiting.delete(stepId);
      visited.add(stepId);
      result.push(stepId);
    };
    
    for (const stepId of steps) {
      if (!visited.has(stepId)) {
        visit(stepId);
      }
    }
    
    return result;
  }
}

/**
 * 抽象步骤注册表
 */
export class AbstractStepRegistry {
  constructor(config = {}) {
    this.steps = new Map();
    this.compositions = new Map();
    this.categories = new Map();
    this.dependencies = new Map();
    this.aliases = new Map();
    
    this.config = {
      enableValidation: config.enableValidation ?? true,
      enableAutoCategorization: config.enableAutoCategorization ?? true,
      circularDependencyCheck: config.circularDependencyCheck ?? true,
      ...config
    };
    
    this.logger = {
      info: (message, data = {}) => console.log(`[AbstractStepRegistry] INFO: ${message}`, data),
      warn: (message, data = {}) => console.warn(`[AbstractStepRegistry] WARN: ${message}`, data),
      error: (message, data = {}) => console.error(`[AbstractStepRegistry] ERROR: ${message}`, data),
      debug: (message, data = {}) => console.debug(`[AbstractStepRegistry] DEBUG: ${message}`, data)
    };
  }

  /**
   * 注册抽象步骤
   */
  register(step) {
    if (this.config.enableValidation) {
      const validation = this.validateStep(step);
      if (!validation.valid) {
        throw new Error(`Step validation failed: ${validation.errors.join(', ')}`);
      }
    }
    
    this.steps.set(step.id, step);
    
    // 注册到分类
    this.registerToCategory(step);
    
    // 注册别名
    if (step.name !== step.id) {
      this.aliases.set(step.name, step.id);
    }
    
    this.logger.info('Abstract step registered', { 
      id: step.id, 
      name: step.name, 
      category: step.category 
    });
    
    return step;
  }

  /**
   * 注册抽象步骤定义
   */
  async registerDefinition(id, definition) {
    // 动态导入AbstractStep类
    const { AbstractStep } = await import('./AbstractStepMatcher.js');
    const step = new AbstractStep(id, definition);
    return this.register(step);
  }

  /**
   * 注销抽象步骤
   */
  unregister(stepId) {
    const step = this.steps.get(stepId);
    if (!step) {
      this.logger.warn('Step not found for unregistration', { stepId });
      return false;
    }
    
    // 从主映射中删除
    this.steps.delete(stepId);
    
    // 从分类中删除
    const categorySteps = this.categories.get(step.category);
    if (categorySteps) {
      categorySteps.delete(stepId);
      if (categorySteps.size === 0) {
        this.categories.delete(step.category);
      }
    }
    
    // 删除别名
    this.aliases.delete(step.name);
    
    // 删除相关依赖
    this.removeStepDependencies(stepId);
    
    this.logger.info('Abstract step unregistered', { stepId });
    return true;
  }

  /**
   * 获取抽象步骤
   */
  get(stepId) {
    // 检查别名
    const actualId = this.aliases.get(stepId) || stepId;
    return this.steps.get(actualId);
  }

  /**
   * 检查步骤是否存在
   */
  has(stepId) {
    const actualId = this.aliases.get(stepId) || stepId;
    return this.steps.has(actualId);
  }

  /**
   * 获取所有步骤
   */
  getAll() {
    return Array.from(this.steps.values());
  }

  /**
   * 按分类获取步骤
   */
  getByCategory(category) {
    const categorySteps = this.categories.get(category);
    return categorySteps ? Array.from(categorySteps.values()) : [];
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * 注册步骤组合
   */
  registerComposition(composition) {
    if (this.config.enableValidation) {
      const validation = composition.validate(this);
      if (!validation.valid) {
        throw new Error(`Composition validation failed: ${validation.errors.join(', ')}`);
      }
    }
    
    this.compositions.set(composition.id, composition);
    
    this.logger.info('Step composition registered', { 
      id: composition.id, 
      name: composition.name,
      stepCount: composition.steps.length 
    });
    
    return composition;
  }

  /**
   * 获取步骤组合
   */
  getComposition(compositionId) {
    return this.compositions.get(compositionId);
  }

  /**
   * 获取所有组合
   */
  getAllCompositions() {
    return Array.from(this.compositions.values());
  }

  /**
   * 添加步骤依赖
   */
  addDependency(fromStepId, toStepId, type = 'requires', config = {}) {
    const dependency = new StepDependency(fromStepId, toStepId, type, config);
    
    if (!this.dependencies.has(fromStepId)) {
      this.dependencies.set(fromStepId, []);
    }
    
    this.dependencies.get(fromStepId).push(dependency);
    
    // 检查循环依赖
    if (this.config.circularDependencyCheck) {
      this.checkCircularDependency(fromStepId, toStepId);
    }
    
    this.logger.debug('Step dependency added', { 
      fromStepId, 
      toStepId, 
      type 
    });
    
    return dependency;
  }

  /**
   * 移除步骤依赖
   */
  removeDependency(fromStepId, toStepId) {
    const dependencies = this.dependencies.get(fromStepId);
    if (dependencies) {
      const index = dependencies.findIndex(d => d.toStepId === toStepId);
      if (index >= 0) {
        dependencies.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * 移除步骤的所有依赖
   */
  removeStepDependencies(stepId) {
    // 移除以该步骤为源的依赖
    this.dependencies.delete(stepId);
    
    // 移除以该步骤为目标的依赖
    for (const [fromId, dependencies] of this.dependencies.entries()) {
      const filtered = dependencies.filter(d => d.toStepId !== stepId);
      this.dependencies.set(fromId, filtered);
    }
  }

  /**
   * 获取步骤依赖
   */
  getDependencies(stepId) {
    return this.dependencies.get(stepId) || [];
  }

  /**
   * 获取反向依赖
   */
  getReverseDependencies(stepId) {
    const reverseDeps = [];
    
    for (const [fromId, dependencies] of this.dependencies.entries()) {
      for (const dependency of dependencies) {
        if (dependency.toStepId === stepId) {
          reverseDeps.push({ fromId, dependency });
        }
      }
    }
    
    return reverseDeps;
  }

  /**
   * 解析执行顺序
   */
  resolveExecutionOrder(stepIds) {
    const steps = new Set(stepIds);
    const dependencies = [];
    
    // 收集相关依赖
    for (const stepId of stepIds) {
      const stepDeps = this.getDependencies(stepId);
      for (const dep of stepDeps) {
        if (steps.has(dep.toStepId)) {
          dependencies.push(dep);
        }
      }
    }
    
    // 拓扑排序
    const visited = new Set();
    const visiting = new Set();
    const result = [];
    
    const visit = (stepId) => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected involving step '${stepId}'`);
      }
      
      if (visited.has(stepId)) {
        return;
      }
      
      visiting.add(stepId);
      
      // 访问依赖的步骤
      const deps = dependencies
        .filter(d => d.toStepId === stepId && d.type === 'requires')
        .map(d => d.fromStepId)
        .filter(id => steps.has(id));
      
      for (const dep of deps) {
        visit(dep);
      }
      
      visiting.delete(stepId);
      visited.add(stepId);
      result.push(stepId);
    };
    
    for (const stepId of stepIds) {
      if (!visited.has(stepId)) {
        visit(stepId);
      }
    }
    
    return result;
  }

  /**
   * 检查循环依赖
   */
  checkCircularDependency(fromStepId, toStepId) {
    const visited = new Set();
    const visiting = new Set();
    
    const hasCycle = (stepId) => {
      if (visiting.has(stepId)) {
        return true;
      }
      
      if (visited.has(stepId)) {
        return false;
      }
      
      visiting.add(stepId);
      visited.add(stepId);
      
      const dependencies = this.getDependencies(stepId);
      for (const dependency of dependencies) {
        if (hasCycle(dependency.toStepId)) {
          return true;
        }
      }
      
      visiting.delete(stepId);
      return false;
    };
    
    // 添加临时依赖进行检查
    const tempDependencies = this.getDependencies(fromStepId);
    const tempDep = new StepDependency(fromStepId, toStepId, 'requires');
    tempDependencies.push(tempDep);
    
    try {
      if (hasCycle(fromStepId)) {
        throw new Error(`Adding dependency from '${fromStepId}' to '${toStepId}' would create a circular dependency`);
      }
    } finally {
      // 移除临时依赖
      tempDependencies.pop();
    }
  }

  /**
   * 搜索步骤
   */
  search(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    for (const step of this.steps.values()) {
      if (
        step.id.toLowerCase().includes(lowerQuery) ||
        step.name.toLowerCase().includes(lowerQuery) ||
        step.description.toLowerCase().includes(lowerQuery) ||
        step.category.toLowerCase().includes(lowerQuery)
      ) {
        results.push(step);
      }
    }
    
    return results;
  }

  /**
   * 按能力搜索步骤
   */
  searchByCapability(capability) {
    const results = [];
    
    for (const step of this.steps.values()) {
      // 从步骤参数推断能力
      const stepCapabilities = this.extractStepCapabilities(step);
      if (stepCapabilities.includes(capability)) {
        results.push(step);
      }
    }
    
    return results;
  }

  /**
   * 提取步骤能力
   */
  extractStepCapabilities(step) {
    const capabilities = [];
    
    // 从参数推断
    for (const [paramName, paramDef] of Object.entries(step.parameters)) {
      if (paramDef.type === 'file') {
        capabilities.push('file-handling');
      }
      if (paramDef.type === 'url') {
        capabilities.push('network-access');
      }
      if (paramName.includes('search')) {
        capabilities.push('search');
      }
      if (paramName.includes('extract')) {
        capabilities.push('data-extraction');
      }
      if (paramName.includes('format')) {
        capabilities.push('formatting');
      }
    }
    
    // 从分类推断
    const categoryCapabilities = {
      'search': ['search', 'query'],
      'extraction': ['data-extraction', 'parsing'],
      'processing': ['data-processing', 'transformation'],
      'validation': ['validation', 'verification'],
      'navigation': ['browser-control', 'navigation'],
      'analysis': ['analysis', 'insight-generation']
    };
    
    if (categoryCapabilities[step.category]) {
      capabilities.push(...categoryCapabilities[step.category]);
    }
    
    return [...new Set(capabilities)];
  }

  /**
   * 验证步骤
   */
  validateStep(step) {
    const errors = [];
    
    // 检查必需字段
    if (!step.id) {
      errors.push('Step ID is required');
    }
    
    if (!step.name) {
      errors.push('Step name is required');
    }
    
    if (!step.category) {
      errors.push('Step category is required');
    }
    
    // 验证参数定义
    for (const [paramName, paramDef] of Object.entries(step.parameters)) {
      if (!paramDef.type) {
        errors.push(`Parameter '${paramName}' must have a type`);
      }
      
      if (paramDef.required && !paramDef.description) {
        errors.push(`Required parameter '${paramName}' should have a description`);
      }
      
      if (paramDef.enum && !Array.isArray(paramDef.enum)) {
        errors.push(`Parameter '${paramName}' enum must be an array`);
      }
    }
    
    // 验证前置条件
    for (let i = 0; i < step.preconditions.length; i++) {
      const condition = step.preconditions[i];
      const conditionErrors = this.validateCondition(condition);
      errors.push(...conditionErrors.map(e => `Precondition ${i}: ${e}`));
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证条件
   */
  validateCondition(condition) {
    const errors = [];
    
    if (typeof condition === 'function') {
      return errors; // 函数条件总是有效的
    }
    
    if (typeof condition === 'string') {
      // 简单的语法检查
      try {
        new Function('state', `return ${condition}`);
      } catch (error) {
        errors.push(`Invalid condition expression: ${error.message}`);
      }
      return errors;
    }
    
    if (typeof condition === 'object') {
      if (!condition.type) {
        errors.push('Condition type is required');
      }
      
      if (!condition.operator) {
        errors.push('Condition operator is required');
      }
      
      const validTypes = ['context', 'state'];
      if (condition.type && !validTypes.includes(condition.type)) {
        errors.push(`Invalid condition type: ${condition.type}`);
      }
      
      const validOperators = ['==', '===', '!=', '!==', '>', '>=', '<', '<=', 'in', 'contains', 'matches'];
      if (condition.operator && !validOperators.includes(condition.operator)) {
        errors.push(`Invalid operator: ${condition.operator}`);
      }
    } else {
      errors.push('Condition must be a function, string, or object');
    }
    
    return errors;
  }

  /**
   * 注册到分类
   */
  registerToCategory(step) {
    if (!this.categories.has(step.category)) {
      this.categories.set(step.category, new Map());
    }
    
    this.categories.get(step.category).set(step.id, step);
  }

  /**
   * 自动分类
   */
  autoCategorize(step) {
    if (!this.config.enableAutoCategorization) {
      return step.category;
    }
    
    // 从步骤名称推断分类
    const name = step.name.toLowerCase();
    const categoryPatterns = {
      'search': /search|find|query/i,
      'extraction': /extract|scrape|crawl|harvest/i,
      'processing': /process|transform|convert|format/i,
      'validation': /validate|verify|check|test/i,
      'navigation': /navigate|browse|open|load/i,
      'analysis': /analyze|analysis|insight|summary/i,
      'storage': /save|store|archive|backup/i,
      'communication': /send|notify|message|report/i
    };
    
    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(name)) {
        return category;
      }
    }
    
    return step.category || 'general';
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    const categoryStats = {};
    for (const [category, steps] of this.categories.entries()) {
      categoryStats[category] = {
        stepCount: steps.size,
        steps: Array.from(steps.keys())
      };
    }
    
    const dependencyStats = {
      totalDependencies: 0,
      dependencyTypes: {}
    };
    
    for (const dependencies of this.dependencies.values()) {
      dependencyStats.totalDependencies += dependencies.length;
      
      for (const dependency of dependencies) {
        dependencyStats.dependencyTypes[dependency.type] = 
          (dependencyStats.dependencyTypes[dependency.type] || 0) + 1;
      }
    }
    
    return {
      totalSteps: this.steps.size,
      totalCompositions: this.compositions.size,
      totalCategories: this.categories.size,
      totalAliases: this.aliases.size,
      categories: categoryStats,
      dependencies: dependencyStats,
      config: this.config
    };
  }

  /**
   * 导出注册表配置
   */
  export() {
    return {
      steps: Array.from(this.steps.values()).map(step => ({
        id: step.id,
        name: step.name,
        description: step.description,
        category: step.category,
        parameters: step.parameters,
        preconditions: step.preconditions,
        postconditions: step.postconditions,
        expectedInput: step.expectedInput,
        expectedOutput: step.expectedOutput,
        metadata: step.metadata
      })),
      compositions: Array.from(this.compositions.values()).map(comp => ({
        id: comp.id,
        name: comp.name,
        description: comp.description,
        steps: comp.steps,
        executionMode: comp.executionMode,
        dependencies: comp.dependencies.map(d => ({
          fromStepId: d.fromStepId,
          toStepId: d.toStepId,
          type: d.type,
          condition: d.condition
        })),
        parameters: comp.parameters,
        metadata: comp.metadata
      })),
      aliases: Object.fromEntries(this.aliases.entries())
    };
  }

  /**
   * 导入注册表配置
   */
  async import(config) {
    this.steps.clear();
    this.compositions.clear();
    this.categories.clear();
    this.dependencies.clear();
    this.aliases.clear();
    
    // 导入步骤
    const { AbstractStep } = await import('./AbstractStepMatcher.js');
    for (const stepConfig of config.steps) {
      const step = new AbstractStep(stepConfig.id, stepConfig);
      this.register(step);
    }
    
    // 导入组合
    for (const compConfig of config.compositions) {
      const composition = new StepComposition(compConfig.id, compConfig);
      this.registerComposition(composition);
    }
    
    // 导入别名
    for (const [alias, stepId] of Object.entries(config.aliases)) {
      this.aliases.set(alias, stepId);
    }
    
    this.logger.info('Registry imported', { 
      steps: config.steps.length,
      compositions: config.compositions.length 
    });
  }

  /**
   * 清理注册表
   */
  cleanup() {
    this.steps.clear();
    this.compositions.clear();
    this.categories.clear();
    this.dependencies.clear();
    this.aliases.clear();
    this.logger.info('AbstractStepRegistry cleaned up');
  }
}

export default AbstractStepRegistry;