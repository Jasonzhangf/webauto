/**
 * 抽象步骤匹配器
 * 实现抽象步骤与具体操作子的动态匹配
 */

import { OperationMatcher } from './OperationMatcher.js';
import { AbstractStepRegistry } from './AbstractStepRegistry.js';
import { OperationRegistry, globalRegistry } from '../core/OperationRegistry.js';
import { OperationContext, OperationResult } from '../BaseOperation.js';

/**
 * 抽象步骤定义
 */
export class AbstractStep {
  constructor(id, definition) {
    this.id = id;
    this.name = definition.name || id;
    this.description = definition.description || '';
    this.category = definition.category || 'general';
    this.parameters = definition.parameters || {};
    this.preconditions = definition.preconditions || [];
    this.postconditions = definition.postconditions || [];
    this.expectedInput = definition.expectedInput || {};
    this.expectedOutput = definition.expectedOutput || {};
    this.metadata = {
      ...definition.metadata,
      createdAt: Date.now(),
      version: definition.version || '1.0.0'
    };
  }

  /**
   * 验证步骤参数
   */
  validateParams(params = {}) {
    const errors = [];
    
    // 检查必需参数
    for (const [paramName, paramDef] of Object.entries(this.parameters)) {
      if (paramDef.required && params[paramName] === undefined) {
        errors.push(`Missing required parameter: ${paramName}`);
      }
      
      // 验证参数类型
      if (params[paramName] !== undefined) {
        const actualType = typeof params[paramName];
        const expectedType = paramDef.type;
        
        if (expectedType && actualType !== expectedType) {
          errors.push(`Parameter '${paramName}' should be ${expectedType}, got ${actualType}`);
        }
        
        // 验证枚举值
        if (paramDef.enum && !paramDef.enum.includes(params[paramName])) {
          errors.push(`Parameter '${paramName}' must be one of: ${paramDef.enum.join(', ')}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 检查前置条件
   */
  checkPreconditions(context) {
    const results = [];
    
    for (const condition of this.preconditions) {
      try {
        const result = this.evaluateCondition(condition, context);
        results.push({
          condition,
          satisfied: result,
          error: null
        });
      } catch (error) {
        results.push({
          condition,
          satisfied: false,
          error: error.message
        });
      }
    }
    
    return {
      allSatisfied: results.every(r => r.satisfied),
      results
    };
  }

  /**
   * 评估条件
   */
  evaluateCondition(condition, context) {
    if (typeof condition === 'function') {
      return condition(context);
    }
    
    if (typeof condition === 'string') {
      // 简单的条件表达式评估
      return this.evaluateExpression(condition, context);
    }
    
    if (typeof condition === 'object') {
      // 对象形式条件
      const { type, field, operator, value } = condition;
      
      switch (type) {
        case 'context':
          const contextValue = this.getContextValue(field, context);
          return this.compareValues(contextValue, operator, value);
          
        case 'state':
          const stateValue = context.state?.[field];
          return this.compareValues(stateValue, operator, value);
          
        default:
          throw new Error(`Unknown condition type: ${type}`);
      }
    }
    
    return Boolean(condition);
  }

  /**
   * 获取上下文值
   */
  getContextValue(path, context) {
    const parts = path.split('.');
    let value = context;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * 比较值
   */
  compareValues(actual, operator, expected) {
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
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * 评估表达式
   */
  evaluateExpression(expression, context) {
    // 简单的表达式评估（实际项目中可能需要更复杂的解析器）
    try {
      // 这里实现一个简单的模板替换
      let evaluated = expression;
      
      // 替换上下文变量
      evaluated = evaluated.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const value = this.getContextValue(path, context);
        return value !== undefined ? String(value) : match;
      });
      
      // 替换状态变量
      evaluated = evaluated.replace(/\{\{state\.([^}]+)\}\}/g, (match, key) => {
        const value = context.state?.[key];
        return value !== undefined ? String(value) : match;
      });
      
      // 评估布尔表达式
      if (evaluated.toLowerCase() === 'true') return true;
      if (evaluated.toLowerCase() === 'false') return false;
      
      // 评估数值比较
      const numMatch = evaluated.match(/^(\d+)\s*([><=!]+)\s*(\d+)$/);
      if (numMatch) {
        const [, left, op, right] = numMatch;
        return this.compareValues(Number(left), op, Number(right));
      }
      
      return Boolean(evaluated);
    } catch (error) {
      throw new Error(`Failed to evaluate expression '${expression}': ${error.message}`);
    }
  }
}

/**
 * 抽象步骤匹配器
 */
export class AbstractStepMatcher {
  constructor(config = {}) {
    this.config = {
      enableScoring: config.enableScoring ?? true,
      scoringWeights: config.scoringWeights || {
        containerMatch: 0.4,
        capabilityMatch: 0.3,
        contextMatch: 0.2,
        performanceMatch: 0.1
      },
      fallbackStrategy: config.fallbackStrategy || 'best-effort',
      strictMatching: config.strictMatching ?? false,
      ...config
    };
    
    this.stepRegistry = new AbstractStepRegistry();
    this.operationMatcher = new OperationMatcher(this.config);
    this.operationRegistry = config.operationRegistry || globalRegistry;
    
    this.logger = {
      info: (message, data = {}) => console.log(`[AbstractStepMatcher] INFO: ${message}`, data),
      warn: (message, data = {}) => console.warn(`[AbstractStepMatcher] WARN: ${message}`, data),
      error: (message, data = {}) => console.error(`[AbstractStepMatcher] ERROR: ${message}`, data),
      debug: (message, data = {}) => console.debug(`[AbstractStepMatcher] DEBUG: ${message}`, data)
    };
  }

  /**
   * 注册抽象步骤
   */
  registerAbstractStep(id, definition) {
    const step = new AbstractStep(id, definition);
    this.stepRegistry.register(step);
    this.logger.info('Abstract step registered', { id, name: step.name, category: step.category });
    return step;
  }

  /**
   * 匹配操作子
   */
  async matchOperation(stepId, context = {}) {
    const { 
      container = null, 
      forceOperation = null, 
      params = {}, 
      priority = 'balanced' 
    } = context;
    
    // 获取抽象步骤定义
    const step = this.stepRegistry.get(stepId);
    if (!step) {
      throw new Error(`Abstract step '${stepId}' not found`);
    }
    
    this.logger.info('Matching operation for abstract step', { 
      stepId, 
      forceOperation, 
      containerType: container?.type 
    });
    
    // 如果强制指定操作子，直接返回
    if (forceOperation) {
      return this.handleForcedOperation(forceOperation, step, context);
    }
    
    // 验证步骤参数
    const validation = step.validateParams(params);
    if (!validation.valid) {
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }
    
    // 检查前置条件
    const preconditions = step.checkPreconditions(context);
    if (!preconditions.allSatisfied) {
      const unsatisfied = preconditions.results.filter(r => !r.satisfied);
      throw new Error(`Preconditions not satisfied: ${unsatisfied.map(r => r.condition).join(', ')}`);
    }
    
    // 获取候选操作子
    const candidates = await this.getCandidateOperations(step, context);
    
    if (candidates.length === 0) {
      throw new Error(`No suitable operations found for abstract step '${stepId}'`);
    }
    
    // 评分和排序
    if (this.config.enableScoring) {
      const scoredCandidates = await this.scoreCandidates(candidates, step, context);
      const bestMatch = scoredCandidates[0];
      
      this.logger.info('Operation matched', { 
        stepId, 
        operation: bestMatch.operationName,
        score: bestMatch.score,
        details: bestMatch.details
      });
      
      return bestMatch;
    }
    
    // 简单模式：返回第一个候选
    return {
      stepId,
      operationName: candidates[0].name,
      operationInfo: candidates[0],
      score: 1.0,
      details: { reason: 'first-candidate' }
    };
  }

  /**
   * 处理强制指定的操作子
   */
  async handleForcedOperation(forceOperation, step, context) {
    try {
      const operationInfo = this.operationRegistry.get(forceOperation);
      
      this.logger.info('Using forced operation', { 
        stepId: step.id, 
        operation: forceOperation 
      });
      
      return {
        stepId,
        operationName: forceOperation,
        operationInfo,
        score: 1.0,
        details: { reason: 'forced-operation' }
      };
    } catch (error) {
      throw new Error(`Forced operation '${forceOperation}' not found: ${error.message}`);
    }
  }

  /**
   * 获取候选操作子
   */
  async getCandidateOperations(step, context) {
    const { container } = context;
    
    // 构建匹配条件
    const matchCriteria = {
      category: step.category,
      capabilities: this.extractRequiredCapabilities(step),
      containerType: container?.type,
      inputSchema: step.expectedInput,
      outputSchema: step.expectedOutput,
      context: context
    };
    
    // 使用操作子匹配器查找候选
    const candidates = await this.operationMatcher.findMatches(matchCriteria);
    
    this.logger.debug('Candidate operations found', { 
      stepId: step.id, 
      count: candidates.length 
    });
    
    return candidates;
  }

  /**
   * 提取所需能力
   */
  extractRequiredCapabilities(step) {
    const capabilities = [];
    
    // 从步骤参数推断所需能力
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
    
    return [...new Set(capabilities)]; // 去重
  }

  /**
   * 评分候选操作子
   */
  async scoreCandidates(candidates, step, context) {
    const { container } = context;
    const weights = this.config.scoringWeights;
    
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const score = await this.calculateMatchScore(candidate, step, context);
        
        return {
          stepId: step.id,
          operationName: candidate.name,
          operationInfo: candidate,
          score: score.total,
          details: {
            containerMatch: score.containerMatch,
            capabilityMatch: score.capabilityMatch,
            contextMatch: score.contextMatch,
            performanceMatch: score.performanceMatch,
            breakdown: score.breakdown
          }
        };
      })
    );
    
    // 按分数排序
    return scoredCandidates.sort((a, b) => b.score - a.score);
  }

  /**
   * 计算匹配分数
   */
  async calculateMatchScore(operationInfo, step, context) {
    const weights = this.config.scoringWeights;
    
    // 容器匹配分数
    const containerMatch = this.calculateContainerMatch(operationInfo, context.container);
    
    // 能力匹配分数
    const capabilityMatch = this.calculateCapabilityMatch(operationInfo, step);
    
    // 上下文匹配分数
    const contextMatch = this.calculateContextMatch(operationInfo, context);
    
    // 性能匹配分数
    const performanceMatch = this.calculatePerformanceMatch(operationInfo, context);
    
    // 计算总分
    const total = (
      containerMatch * weights.containerMatch +
      capabilityMatch * weights.capabilityMatch +
      contextMatch * weights.contextMatch +
      performanceMatch * weights.performanceMatch
    );
    
    return {
      total,
      containerMatch,
      capabilityMatch,
      contextMatch,
      performanceMatch,
      breakdown: {
        weights,
        individualScores: {
          containerMatch,
          capabilityMatch,
          contextMatch,
          performanceMatch
        }
      }
    };
  }

  /**
   * 计算容器匹配分数
   */
  calculateContainerMatch(operationInfo, container) {
    if (!container) {
      return 0.5; // 中性分数
    }
    
    const supportedContainers = operationInfo.supportedContainers || [];
    const preferredContainers = operationInfo.preferredContainers || [];
    
    // 检查是否在首选容器列表中
    if (preferredContainers.includes(container.type)) {
      return 1.0;
    }
    
    // 检查是否在支持容器列表中
    if (supportedContainers.includes(container.type)) {
      return 0.8;
    }
    
    // 检查容器类型匹配模式
    const containerType = container.type;
    const operationName = operationInfo.name.toLowerCase();
    
    if (
      containerType.includes('search') && operationName.includes('search') ||
      containerType.includes('list') && operationName.includes('list') ||
      containerType.includes('detail') && operationName.includes('detail') ||
      containerType.includes('form') && operationName.includes('form')
    ) {
      return 0.6;
    }
    
    return 0.3; // 低匹配度
  }

  /**
   * 计算能力匹配分数
   */
  calculateCapabilityMatch(operationInfo, step) {
    const requiredCapabilities = this.extractRequiredCapabilities(step);
    const operationCapabilities = operationInfo.capabilities || [];
    
    if (requiredCapabilities.length === 0) {
      return 1.0; // 无特殊能力要求
    }
    
    // 计算能力覆盖度
    const coveredCapabilities = requiredCapabilities.filter(cap => 
      operationCapabilities.includes(cap)
    );
    
    const coverage = coveredCapabilities.length / requiredCapabilities.length;
    
    // 奖励额外能力
    const extraCapabilities = operationCapabilities.filter(cap => 
      !requiredCapabilities.includes(cap)
    ).length;
    
    const bonus = Math.min(extraCapabilities * 0.1, 0.2); // 最多20%奖励
    
    return Math.min(coverage + bonus, 1.0);
  }

  /**
   * 计算上下文匹配分数
   */
  calculateContextMatch(operationInfo, context) {
    let score = 0.5; // 基础分数
    
    // 检查操作子的输入要求
    const inputRequirements = operationInfo.inputRequirements || {};
    const contextData = context.data || {};
    
    // 简单的输入匹配检查
    const requiredInputs = Object.keys(inputRequirements).filter(key => 
      inputRequirements[key].required
    );
    
    if (requiredInputs.length > 0) {
      const availableInputs = requiredInputs.filter(input => 
        contextData[input] !== undefined
      );
      score += (availableInputs.length / requiredInputs.length) * 0.3;
    }
    
    // 检查操作子的限制条件
    const restrictions = operationInfo.restrictions || {};
    if (restrictions.maxDataSize && context.dataSize) {
      if (context.dataSize <= restrictions.maxDataSize) {
        score += 0.2;
      } else {
        score -= 0.3; // 超出大小限制
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算性能匹配分数
   */
  calculatePerformanceMatch(operationInfo, context) {
    let score = 0.5; // 基础分数
    
    // 考虑操作子的性能特性
    const performance = operationInfo.performance || {};
    
    // 根据上下文的性能要求调整分数
    if (context.requirements) {
      if (context.requirements.speed === 'high' && performance.speed === 'fast') {
        score += 0.3;
      }
      if (context.requirements.accuracy === 'high' && performance.accuracy === 'high') {
        score += 0.3;
      }
      if (context.requirements.memory === 'low' && performance.memoryUsage === 'low') {
        score += 0.2;
      }
    }
    
    // 考虑操作子的成功率和错误率
    if (performance.successRate) {
      score += (performance.successRate - 0.5) * 0.4; // 基于成功率调整
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 执行抽象步骤
   */
  async executeStep(stepId, context = {}) {
    const { params = {}, executionContext = null } = context;
    
    try {
      // 匹配操作子
      const match = await this.matchOperation(stepId, context);
      
      // 创建操作子实例
      const operation = this.operationRegistry.createInstance(
        match.operationName,
        match.operationInfo.config || {}
      );
      
      // 准备执行上下文
      const execContext = executionContext || new OperationContext(context.state || {});
      
      // 执行操作子
      const result = await operation.execute(execContext, params);
      
      this.logger.info('Abstract step executed', { 
        stepId, 
        operation: match.operationName,
        success: result.success 
      });
      
      return {
        stepId,
        operation: match.operationName,
        match,
        result,
        context: execContext
      };
      
    } catch (error) {
      this.logger.error('Failed to execute abstract step', { 
        stepId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 批量执行抽象步骤
   */
  async executeSteps(stepIds, context = {}) {
    const results = [];
    let currentContext = context;
    
    for (const stepId of stepIds) {
      try {
        const result = await this.executeStep(stepId, currentContext);
        results.push(result);
        
        // 更新上下文
        if (result.context) {
          currentContext = {
            ...currentContext,
            state: result.context.state,
            context: result.context
          };
        }
        
      } catch (error) {
        this.logger.error('Failed to execute step in sequence', { 
          stepId, 
          error: error.message 
        });
        
        // 根据配置决定是否继续执行
        if (this.config.fallbackStrategy === 'stop-on-error') {
          throw error;
        }
        
        results.push({
          stepId,
          error: error.message,
          success: false
        });
      }
    }
    
    return results;
  }

  /**
   * 获取匹配统计信息
   */
  getStatistics() {
    return {
      abstractSteps: this.stepRegistry.getStatistics(),
      operationMatcher: this.operationMatcher.getStatistics(),
      config: this.config
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stepRegistry.cleanup();
    this.operationMatcher.cleanup();
    this.logger.info('AbstractStepMatcher cleaned up');
  }
}

export default AbstractStepMatcher;