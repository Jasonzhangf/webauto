/**
 * 操作子匹配器
 * 管理操作子匹配规则和多维度匹配条件
 */

import { OperationRegistry, globalRegistry } from '../core/OperationRegistry.js';

/**
 * 匹配规则定义
 */
export class MatchRule {
  constructor(definition) {
    this.name = definition.name;
    this.description = definition.description || '';
    this.priority = definition.priority || 0;
    this.conditions = definition.conditions || [];
    this.weights = definition.weights || {};
    this.enabled = definition.enabled ?? true;
    this.metadata = {
      ...definition.metadata,
      createdAt: Date.now()
    };
  }

  /**
   * 评估操作子是否匹配规则
   */
  evaluate(operationInfo, context) {
    const results = [];
    
    for (const condition of this.conditions) {
      try {
        const result = this.evaluateCondition(condition, operationInfo, context);
        results.push({
          condition,
          satisfied: result,
          score: this.calculateConditionScore(condition, result),
          error: null
        });
      } catch (error) {
        results.push({
          condition,
          satisfied: false,
          score: 0,
          error: error.message
        });
      }
    }
    
    // 计算总体匹配分数
    const totalScore = this.calculateTotalScore(results);
    
    return {
      rule: this.name,
      satisfied: results.every(r => r.satisfied),
      score: totalScore,
      details: results,
      priority: this.priority
    };
  }

  /**
   * 评估单个条件
   */
  evaluateCondition(condition, operationInfo, context) {
    const { type, field, operator, value, pattern } = condition;
    
    switch (type) {
      case 'category':
        return this.evaluateCategoryCondition(condition, operationInfo);
        
      case 'capability':
        return this.evaluateCapabilityCondition(condition, operationInfo);
        
      case 'container':
        return this.evaluateContainerCondition(condition, operationInfo, context);
        
      case 'metadata':
        return this.evaluateMetadataCondition(condition, operationInfo);
        
      case 'performance':
        return this.evaluatePerformanceCondition(condition, operationInfo);
        
      case 'custom':
        return this.evaluateCustomCondition(condition, operationInfo, context);
        
      default:
        throw new Error(`Unknown condition type: ${type}`);
    }
  }

  /**
   * 评估分类条件
   */
  evaluateCategoryCondition(condition, operationInfo) {
    const { field, operator, value } = condition;
    const actualValue = operationInfo[field] || operationInfo.category;
    
    return this.compareValues(actualValue, operator, value);
  }

  /**
   * 评估能力条件
   */
  evaluateCapabilityCondition(condition, operationInfo) {
    const { field, operator, value } = condition;
    const capabilities = operationInfo.capabilities || [];
    
    switch (operator) {
      case 'has':
        return capabilities.includes(value);
      case 'has-all':
        return Array.isArray(value) && value.every(cap => capabilities.includes(cap));
      case 'has-any':
        return Array.isArray(value) && value.some(cap => capabilities.includes(cap));
      case 'count':
        return this.compareValues(capabilities.length, field, value);
      default:
        return this.compareValues(capabilities, operator, value);
    }
  }

  /**
   * 评估容器条件
   */
  evaluateContainerCondition(condition, operationInfo, context) {
    const { field, operator, value } = condition;
    const container = context.container;
    
    if (!container) {
      return false;
    }
    
    const supportedContainers = operationInfo.supportedContainers || [];
    const preferredContainers = operationInfo.preferredContainers || [];
    
    switch (field) {
      case 'type':
        return this.compareValues(container.type, operator, value);
      case 'supported':
        return supportedContainers.includes(container.type);
      case 'preferred':
        return preferredContainers.includes(container.type);
      case 'properties':
        return this.evaluateContainerProperties(condition, container);
      default:
        return false;
    }
  }

  /**
   * 评估容器属性条件
   */
  evaluateContainerProperties(condition, container) {
    const { operator, value } = condition;
    const properties = container.properties || {};
    
    // 简单的属性匹配
    for (const [key, expectedValue] of Object.entries(value)) {
      const actualValue = properties[key];
      if (!this.compareValues(actualValue, operator, expectedValue)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 评估元数据条件
   */
  evaluateMetadataCondition(condition, operationInfo) {
    const { field, operator, value } = condition;
    const metadata = operationInfo.metadata || {};
    
    const actualValue = metadata[field];
    return this.compareValues(actualValue, operator, value);
  }

  /**
   * 评估性能条件
   */
  evaluatePerformanceCondition(condition, operationInfo) {
    const { field, operator, value } = condition;
    const performance = operationInfo.performance || {};
    
    const actualValue = performance[field];
    return this.compareValues(actualValue, operator, value);
  }

  /**
   * 评估自定义条件
   */
  evaluateCustomCondition(condition, operationInfo, context) {
    const { function: func, params = {} } = condition;
    
    if (typeof func !== 'function') {
      throw new Error('Custom condition must provide a function');
    }
    
    return func(operationInfo, context, params);
  }

  /**
   * 比较值
   */
  compareValues(actual, operator, expected) {
    if (actual === undefined || actual === null) {
      return false;
    }
    
    switch (operator) {
      case '==':
        return actual == expected;
      case '===':
        return actual === expected;
      case '!=':
        return actual != expected;
      case '!==':
        return actual !== expected;
      case '>':
        return actual > expected;
      case '>=':
        return actual >= expected;
      case '<':
        return actual < expected;
      case '<=':
        return actual <= expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'contains':
        return Array.isArray(actual) && actual.includes(expected);
      case 'matches':
        return new RegExp(expected).test(String(actual));
      case 'includes':
        return String(actual).includes(String(expected));
      case 'starts-with':
        return String(actual).startsWith(String(expected));
      case 'ends-with':
        return String(actual).endsWith(String(expected));
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * 计算条件分数
   */
  calculateConditionScore(condition, satisfied) {
    if (!satisfied) {
      return 0;
    }
    
    // 基于条件权重计算分数
    const weight = condition.weight || 1.0;
    const baseScore = condition.baseScore || 1.0;
    
    return weight * baseScore;
  }

  /**
   * 计算总分
   */
  calculateTotalScore(results) {
    if (results.length === 0) {
      return 0;
    }
    
    const totalWeight = results.reduce((sum, r) => sum + (r.condition.weight || 1.0), 0);
    const weightedScore = results.reduce((sum, r) => sum + r.score, 0);
    
    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }
}

/**
 * 操作子匹配器
 */
export class OperationMatcher {
  constructor(config = {}) {
    this.config = {
      enableCaching: config.enableCaching ?? true,
      cacheTimeout: config.cacheTimeout || 300000, // 5分钟
      maxCandidates: config.maxCandidates || 10,
      scoringMode: config.scoringMode || 'weighted',
      ...config
    };
    
    this.rules = new Map();
    this.cache = new Map();
    this.operationRegistry = config.operationRegistry || globalRegistry;
    
    this.logger = {
      info: (message, data = {}) => console.log(`[OperationMatcher] INFO: ${message}`, data),
      warn: (message, data = {}) => console.warn(`[OperationMatcher] WARN: ${message}`, data),
      error: (message, data = {}) => console.error(`[OperationMatcher] ERROR: ${message}`, data),
      debug: (message, data = {}) => console.debug(`[OperationMatcher] DEBUG: ${message}`, data)
    };
    
    // 初始化默认规则
    this.initializeDefaultRules();
  }

  /**
   * 初始化默认匹配规则
   */
  initializeDefaultRules() {
    // 分类匹配规则
    this.addRule(new MatchRule({
      name: 'category-exact-match',
      description: 'Exact category match',
      priority: 100,
      conditions: [
        {
          type: 'category',
          field: 'category',
          operator: '===',
          value: '{{category}}',
          weight: 1.0,
          baseScore: 1.0
        }
      ]
    }));
    
    // 能力匹配规则
    this.addRule(new MatchRule({
      name: 'capability-coverage',
      description: 'Required capabilities coverage',
      priority: 80,
      conditions: [
        {
          type: 'capability',
          operator: 'has-all',
          value: '{{capabilities}}',
          weight: 1.0,
          baseScore: 1.0
        }
      ]
    }));
    
    // 容器匹配规则
    this.addRule(new MatchRule({
      name: 'container-support',
      description: 'Container type support',
      priority: 60,
      conditions: [
        {
          type: 'container',
          field: 'supported',
          operator: '===',
          value: true,
          weight: 1.0,
          baseScore: 0.8
        }
      ]
    }));
    
    // 性能匹配规则
    this.addRule(new MatchRule({
      name: 'performance-requirements',
      description: 'Performance requirements',
      priority: 40,
      conditions: [
        {
          type: 'performance',
          field: 'successRate',
          operator: '>=',
          value: 0.8,
          weight: 0.8,
          baseScore: 0.6
        }
      ]
    }));
  }

  /**
   * 添加匹配规则
   */
  addRule(rule) {
    this.rules.set(rule.name, rule);
    this.logger.info('Match rule added', { name: rule.name, priority: rule.priority });
    
    // 清除缓存
    this.clearCache();
    
    return rule;
  }

  /**
   * 移除匹配规则
   */
  removeRule(ruleName) {
    const removed = this.rules.delete(ruleName);
    if (removed) {
      this.logger.info('Match rule removed', { name: ruleName });
      this.clearCache();
    }
    return removed;
  }

  /**
   * 查找匹配的操作子
   */
  async findMatches(criteria) {
    const cacheKey = this.generateCacheKey(criteria);
    
    // 检查缓存
    if (this.config.enableCaching && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
        this.logger.debug('Using cached matches', { criteria });
        return cached.matches;
      }
    }
    
    // 获取所有操作子
    const operations = this.operationRegistry.getAll();
    
    // 评估每个操作子
    const matches = [];
    for (const operation of operations) {
      const evaluation = await this.evaluateOperation(operation, criteria);
      
      if (evaluation.score > 0) {
        matches.push({
          operation: operation,
          score: evaluation.score,
          details: evaluation.details,
          matchedRules: evaluation.matchedRules
        });
      }
    }
    
    // 排序匹配结果
    matches.sort((a, b) => b.score - a.score);
    
    // 限制候选数量
    const limitedMatches = matches.slice(0, this.config.maxCandidates);
    
    // 缓存结果
    if (this.config.enableCaching) {
      this.cache.set(cacheKey, {
        matches: limitedMatches,
        timestamp: Date.now()
      });
    }
    
    this.logger.info('Matches found', { 
      criteria, 
      totalFound: matches.length, 
      returned: limitedMatches.length 
    });
    
    return limitedMatches;
  }

  /**
   * 评估操作子
   */
  async evaluateOperation(operationInfo, criteria) {
    const context = this.buildEvaluationContext(criteria);
    const ruleResults = [];
    
    // 评估所有规则
    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }
      
      try {
        const result = rule.evaluate(operationInfo, context);
        ruleResults.push(result);
      } catch (error) {
        this.logger.warn('Rule evaluation failed', { 
          rule: rule.name, 
          operation: operationInfo.name, 
          error: error.message 
        });
      }
    }
    
    // 计算总分
    const totalScore = this.calculateOperationScore(ruleResults);
    
    // 过滤匹配的规则
    const matchedRules = ruleResults.filter(r => r.satisfied);
    
    return {
      score: totalScore,
      details: {
        ruleResults,
        context,
        evaluationTime: Date.now()
      },
      matchedRules
    };
  }

  /**
   * 构建评估上下文
   */
  buildEvaluationContext(criteria) {
    const context = {
      ...criteria,
      evaluationTime: Date.now()
    };
    
    // 处理模板变量
    this.processTemplateVariables(context);
    
    return context;
  }

  /**
   * 处理模板变量
   */
  processTemplateVariables(context) {
    const templates = {
      'category': context.category,
      'capabilities': context.capabilities || [],
      'containerType': context.container?.type,
      'timestamp': Date.now()
    };
    
    // 递归处理对象中的模板变量
    const processObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(processObject);
      }
      
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.includes('{{')) {
          // 替换模板变量
          result[key] = this.replaceTemplateVariables(value, templates);
        } else {
          result[key] = processObject(value);
        }
      }
      
      return result;
    };
    
    // 处理规则中的模板变量
    for (const rule of this.rules.values()) {
      rule.conditions = processObject(rule.conditions);
    }
  }

  /**
   * 替换模板变量
   */
  replaceTemplateVariables(text, templates) {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      return templates[key] !== undefined ? String(templates[key]) : match;
    });
  }

  /**
   * 计算操作子总分
   */
  calculateOperationScore(ruleResults) {
    if (ruleResults.length === 0) {
      return 0;
    }
    
    switch (this.config.scoringMode) {
      case 'weighted':
        return this.calculateWeightedScore(ruleResults);
      case 'priority':
        return this.calculatePriorityScore(ruleResults);
      case 'average':
        return this.calculateAverageScore(ruleResults);
      case 'max':
        return this.calculateMaxScore(ruleResults);
      default:
        return this.calculateWeightedScore(ruleResults);
    }
  }

  /**
   * 计算加权分数
   */
  calculateWeightedScore(ruleResults) {
    let totalWeight = 0;
    let weightedScore = 0;
    
    for (const result of ruleResults) {
      if (result.satisfied) {
        const weight = result.priority / 100; // 标准化权重
        weightedScore += result.score * weight;
        totalWeight += weight;
      }
    }
    
    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  /**
   * 计算优先级分数
   */
  calculatePriorityScore(ruleResults) {
    let maxPriorityScore = 0;
    
    for (const result of ruleResults) {
      if (result.satisfied) {
        const priorityScore = result.priority * result.score;
        maxPriorityScore = Math.max(maxPriorityScore, priorityScore);
      }
    }
    
    return maxPriorityScore / 100; // 标准化
  }

  /**
   * 计算平均分数
   */
  calculateAverageScore(ruleResults) {
    const satisfiedResults = ruleResults.filter(r => r.satisfied);
    
    if (satisfiedResults.length === 0) {
      return 0;
    }
    
    const totalScore = satisfiedResults.reduce((sum, r) => sum + r.score, 0);
    return totalScore / satisfiedResults.length;
  }

  /**
   * 计算最高分数
   */
  calculateMaxScore(ruleResults) {
    const satisfiedResults = ruleResults.filter(r => r.satisfied);
    
    if (satisfiedResults.length === 0) {
      return 0;
    }
    
    return Math.max(...satisfiedResults.map(r => r.score));
  }

  /**
   * 生成缓存键
   */
  generateCacheKey(criteria) {
    const keyData = {
      category: criteria.category,
      capabilities: criteria.capabilities,
      containerType: criteria.container?.type,
      timestamp: Math.floor(Date.now() / this.config.cacheTimeout) * this.config.cacheTimeout
    };
    
    return JSON.stringify(keyData);
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
    this.logger.debug('Cache cleared');
  }

  /**
   * 获取匹配统计信息
   */
  getStatistics() {
    const ruleStats = Array.from(this.rules.values()).map(rule => ({
      name: rule.name,
      priority: rule.priority,
      enabled: rule.enabled,
      conditionCount: rule.conditions.length
    }));
    
    return {
      totalRules: this.rules.size,
      enabledRules: ruleStats.filter(r => r.enabled).length,
      cacheSize: this.cache.size,
      cacheTimeout: this.config.cacheTimeout,
      maxCandidates: this.config.maxCandidates,
      scoringMode: this.config.scoringMode,
      rules: ruleStats
    };
  }

  /**
   * 导出规则配置
   */
  exportRules() {
    return Array.from(this.rules.values()).map(rule => ({
      name: rule.name,
      description: rule.description,
      priority: rule.priority,
      conditions: rule.conditions,
      weights: rule.weights,
      enabled: rule.enabled,
      metadata: rule.metadata
    }));
  }

  /**
   * 导入规则配置
   */
  importRules(rulesConfig) {
    this.rules.clear();
    this.clearCache();
    
    for (const ruleConfig of rulesConfig) {
      const rule = new MatchRule(ruleConfig);
      this.addRule(rule);
    }
    
    this.logger.info('Rules imported', { count: rulesConfig.length });
  }

  /**
   * 验证规则配置
   */
  validateRule(ruleConfig) {
    const errors = [];
    
    if (!ruleConfig.name) {
      errors.push('Rule name is required');
    }
    
    if (!ruleConfig.conditions || !Array.isArray(ruleConfig.conditions)) {
      errors.push('Rule conditions must be an array');
    }
    
    for (let i = 0; i < (ruleConfig.conditions || []).length; i++) {
      const condition = ruleConfig.conditions[i];
      const conditionErrors = this.validateCondition(condition);
      errors.push(...conditionErrors.map(e => `Condition ${i}: ${e}`));
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证条件配置
   */
  validateCondition(condition) {
    const errors = [];
    
    if (!condition.type) {
      errors.push('Condition type is required');
    }
    
    const validTypes = ['category', 'capability', 'container', 'metadata', 'performance', 'custom'];
    if (condition.type && !validTypes.includes(condition.type)) {
      errors.push(`Invalid condition type: ${condition.type}`);
    }
    
    if (!condition.operator) {
      errors.push('Condition operator is required');
    }
    
    const validOperators = ['==', '===', '!=', '!==', '>', '>=', '<', '<=', 'in', 'contains', 'matches', 'includes', 'starts-with', 'ends-with', 'has', 'has-all', 'has-any', 'count'];
    if (condition.operator && !validOperators.includes(condition.operator)) {
      errors.push(`Invalid operator: ${condition.operator}`);
    }
    
    if (condition.value === undefined && condition.operator !== 'count') {
      errors.push('Condition value is required');
    }
    
    return errors;
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.rules.clear();
    this.clearCache();
    this.logger.info('OperationMatcher cleaned up');
  }
}

export default OperationMatcher;