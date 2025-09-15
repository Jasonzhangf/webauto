/**
 * 嵌套执行编排器
 * 执行抽象步骤序列，支持嵌套执行和动态上下文管理
 */

import { AbstractStepMatcher } from '../abstraction/AbstractStepMatcher.js';
import { AbstractStepRegistry } from '../abstraction/AbstractStepRegistry.js';
import { OperationContext, OperationResult } from '../BaseOperation.js';
import { OperationRegistry } from '../OperationRegistry.js';
import EventEmitter from 'events';

/**
 * 执行节点定义
 */
export class ExecutionNode {
  constructor(id, type, config = {}) {
    this.id = id;
    this.type = type; // 'step', 'sequence', 'parallel', 'conditional'
    this.config = config;
    this.children = [];
    this.parent = null;
    this.metadata = {
      createdAt: Date.now(),
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0
    };
  }

  /**
   * 添加子节点
   */
  addChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  /**
   * 移除子节点
   */
  removeChild(childId) {
    const index = this.children.findIndex(child => child.id === childId);
    if (index >= 0) {
      const removed = this.children.splice(index, 1)[0];
      removed.parent = null;
      return removed;
    }
    return null;
  }

  /**
   * 获取执行路径
   */
  getPath() {
    const path = [this.id];
    let current = this.parent;
    
    while (current) {
      path.unshift(current.id);
      current = current.parent;
    }
    
    return path.join('.');
  }

  /**
   * 更新执行统计
   */
  updateStats(success, executionTime) {
    this.metadata.executionCount++;
    
    if (success) {
      this.metadata.successCount++;
    } else {
      this.metadata.failureCount++;
    }
    
    // 更新平均执行时间
    const totalTime = this.metadata.averageExecutionTime * (this.metadata.executionCount - 1);
    this.metadata.averageExecutionTime = (totalTime + executionTime) / this.metadata.executionCount;
  }

  /**
   * 获取执行统计
   */
  getStats() {
    return {
      ...this.metadata,
      successRate: this.metadata.executionCount > 0 ? 
        this.metadata.successCount / this.metadata.executionCount : 0
    };
  }
}

/**
 * 执行计划定义
 */
export class ExecutionPlan {
  constructor(id, name, config = {}) {
    this.id = id;
    this.name = name;
    this.description = config.description || '';
    this.rootNode = null;
    this.config = {
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 300000, // 5分钟
      parallelLimit: config.parallelLimit || 3,
      rollbackOnError: config.rollbackOnError ?? true,
      ...config
    };
    this.metadata = {
      createdAt: Date.now(),
      lastExecutedAt: null,
      executionCount: 0,
      version: config.version || '1.0.0'
    };
  }

  /**
   * 设置根节点
   */
  setRootNode(node) {
    this.rootNode = node;
    return this;
  }

  /**
   * 查找节点
   */
  findNode(nodeId) {
    if (!this.rootNode) {
      return null;
    }
    
    return this.searchNode(this.rootNode, nodeId);
  }

  /**
   * 递归搜索节点
   */
  searchNode(node, nodeId) {
    if (node.id === nodeId) {
      return node;
    }
    
    for (const child of node.children) {
      const found = this.searchNode(child, nodeId);
      if (found) {
        return found;
      }
    }
    
    return null;
  }

  /**
   * 获取所有节点
   */
  getAllNodes() {
    if (!this.rootNode) {
      return [];
    }
    
    const nodes = [];
    this.collectNodes(this.rootNode, nodes);
    return nodes;
  }

  /**
   * 收集节点
   */
  collectNodes(node, nodes) {
    nodes.push(node);
    
    for (const child of node.children) {
      this.collectNodes(child, nodes);
    }
  }

  /**
   * 验证执行计划
   */
  validate() {
    const errors = [];
    
    if (!this.rootNode) {
      errors.push('Root node is required');
      return { valid: false, errors };
    }
    
    this.validateNode(this.rootNode, errors);
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证节点
   */
  validateNode(node, errors, path = '') {
    const currentPath = path ? `${path}.${node.id}` : node.id;
    
    // 验证节点类型
    const validTypes = ['step', 'sequence', 'parallel', 'conditional'];
    if (!validTypes.includes(node.type)) {
      errors.push(`Invalid node type '${node.type}' at ${currentPath}`);
    }
    
    // 验证步骤节点
    if (node.type === 'step' && !node.config.stepId) {
      errors.push(`Step node requires stepId at ${currentPath}`);
    }
    
    // 验证条件节点
    if (node.type === 'conditional' && !node.config.condition) {
      errors.push(`Conditional node requires condition at ${currentPath}`);
    }
    
    // 递归验证子节点
    for (const child of node.children) {
      this.validateNode(child, errors, currentPath);
    }
  }
}

/**
 * 执行上下文管理器
 */
export class ExecutionContextManager {
  constructor() {
    this.contexts = new Map();
    this.globalContext = new OperationContext();
    this.logger = {
      info: (message, data = {}) => console.log(`[ExecutionContextManager] INFO: ${message}`, data),
      warn: (message, data = {}) => console.warn(`[ExecutionContextManager] WARN: ${message}`, data),
      error: (message, data = {}) => console.error(`[ExecutionContextManager] ERROR: ${message}`, data),
      debug: (message, data = {}) => console.debug(`[ExecutionContextManager] DEBUG: ${message}`, data)
    };
  }

  /**
   * 创建执行上下文
   */
  createContext(parentId = null, initialState = {}) {
    const id = this.generateContextId();
    const parentContext = parentId ? this.contexts.get(parentId) : this.globalContext;
    
    const context = new OperationContext({
      ...parentContext?.state,
      ...initialState,
      parentId,
      createdAt: Date.now()
    });
    
    // 设置父级执行ID
    if (parentContext) {
      context.metadata.parentExecutionId = parentContext.metadata.executionId;
    }
    
    this.contexts.set(id, context);
    
    this.logger.debug('Context created', { 
      id, 
      parentId, 
      parentExecutionId: context.metadata.parentExecutionId 
    });
    
    return { id, context };
  }

  /**
   * 获取执行上下文
   */
  getContext(id) {
    return this.contexts.get(id);
  }

  /**
   * 更新上下文
   */
  updateContext(id, updates) {
    const context = this.contexts.get(id);
    if (!context) {
      throw new Error(`Context '${id}' not found`);
    }
    
    for (const [key, value] of Object.entries(updates)) {
      context.updateState(key, value);
    }
    
    return context;
  }

  /**
   * 合并上下文
   */
  mergeContexts(contextIds, targetId = null) {
    const contexts = contextIds.map(id => this.contexts.get(id)).filter(Boolean);
    
    if (contexts.length === 0) {
      throw new Error('No valid contexts to merge');
    }
    
    const mergedState = {};
    for (const context of contexts) {
      Object.assign(mergedState, context.state);
    }
    
    if (targetId) {
      return this.updateContext(targetId, mergedState);
    } else {
      const { id, context } = this.createContext(null, mergedState);
      return context;
    }
  }

  /**
   * 清理上下文
   */
  cleanupContext(id) {
    const context = this.contexts.get(id);
    if (context) {
      this.contexts.delete(id);
      this.logger.debug('Context cleaned up', { id });
    }
  }

  /**
   * 生成上下文ID
   */
  generateContextId() {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    return {
      totalContexts: this.contexts.size,
      globalContext: {
        executionId: this.globalContext.metadata.executionId,
        startTime: this.globalContext.metadata.startTime,
        stateKeys: Object.keys(this.globalContext.state)
      }
    };
  }

  /**
   * 清理所有上下文
   */
  cleanup() {
    this.contexts.clear();
    this.globalContext = new OperationContext();
    this.logger.info('All contexts cleaned up');
  }
}

/**
 * 嵌套执行编排器
 */
export class NestedOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enableLogging: config.enableLogging ?? true,
      enableMetrics: config.enableMetrics ?? true,
      defaultTimeout: config.defaultTimeout || 300000,
      maxConcurrentExecutions: config.maxConcurrentExecutions || 5,
      autoCleanup: config.autoCleanup ?? true,
      ...config
    };
    
    this.stepMatcher = new AbstractStepMatcher(config);
    this.contextManager = new ExecutionContextManager();
    this.executionPlans = new Map();
    this.activeExecutions = new Map();
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0
    };
    
    this.logger = {
      info: (message, data = {}) => {
        if (this.config.enableLogging) {
          console.log(`[NestedOrchestrator] INFO: ${message}`, data);
        }
        this.emit('log', { level: 'info', message, data });
      },
      warn: (message, data = {}) => {
        if (this.config.enableLogging) {
          console.warn(`[NestedOrchestrator] WARN: ${message}`, data);
        }
        this.emit('log', { level: 'warn', message, data });
      },
      error: (message, data = {}) => {
        if (this.config.enableLogging) {
          console.error(`[NestedOrchestrator] ERROR: ${message}`, data);
        }
        this.emit('log', { level: 'error', message, data });
      },
      debug: (message, data = {}) => {
        if (this.config.enableLogging) {
          console.debug(`[NestedOrchestrator] DEBUG: ${message}`, data);
        }
        this.emit('log', { level: 'debug', message, data });
      }
    };
    
    // 设置事件监听器
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    this.on('executionStarted', (execution) => {
      this.activeExecutions.set(execution.id, execution);
      this.emit('activeExecution', { type: 'started', execution });
    });
    
    this.on('executionCompleted', (execution) => {
      this.activeExecutions.delete(execution.id);
      this.updateMetrics(execution);
      this.emit('activeExecution', { type: 'completed', execution });
    });
    
    this.on('executionFailed', (execution) => {
      this.activeExecutions.delete(execution.id);
      this.updateMetrics(execution);
      this.emit('activeExecution', { type: 'failed', execution });
    });
  }

  /**
   * 注册执行计划
   */
  registerExecutionPlan(plan) {
    const validation = plan.validate();
    if (!validation.valid) {
      throw new Error(`Invalid execution plan: ${validation.errors.join(', ')}`);
    }
    
    this.executionPlans.set(plan.id, plan);
    this.logger.info('Execution plan registered', { 
      id: plan.id, 
      name: plan.name,
      nodeCount: plan.getAllNodes().length 
    });
    
    return plan;
  }

  /**
   * 创建执行计划
   */
  createExecutionPlan(id, name, definition, config = {}) {
    const plan = new ExecutionPlan(id, name, config);
    const rootNode = this.buildExecutionTree(definition);
    plan.setRootNode(rootNode);
    
    return this.registerExecutionPlan(plan);
  }

  /**
   * 构建执行树
   */
  buildExecutionTree(definition) {
    const node = new ExecutionNode(definition.id, definition.type, definition.config);
    
    if (definition.children) {
      for (const childDef of definition.children) {
        const child = this.buildExecutionTree(childDef);
        node.addChild(child);
      }
    }
    
    return node;
  }

  /**
   * 执行抽象步骤
   */
  async executeStep(stepId, context = {}) {
    const { 
      params = {}, 
      parentId = null, 
      executionId = null,
      timeout = this.config.defaultTimeout 
    } = context;
    
    const execId = executionId || this.generateExecutionId();
    
    try {
      this.emit('executionStarted', { 
        id: execId, 
        type: 'step', 
        stepId, 
        startTime: Date.now() 
      });
      
      // 创建执行上下文
      const { id: contextId, context: execContext } = this.contextManager.createContext(
        parentId, 
        context.initialState || {}
      );
      
      // 执行步骤
      const result = await this.stepMatcher.executeStep(stepId, {
        params,
        executionContext: execContext,
        ...context
      });
      
      // 更新节点统计
      if (context.node) {
        context.node.updateStats(result.result.success, Date.now() - context.startTime);
      }
      
      const execution = {
        id: execId,
        type: 'step',
        stepId,
        result,
        context: execContext,
        duration: Date.now() - (context.startTime || Date.now()),
        completedAt: Date.now()
      };
      
      this.emit('executionCompleted', execution);
      
      // 清理上下文
      if (this.config.autoCleanup) {
        this.contextManager.cleanupContext(contextId);
      }
      
      return execution;
      
    } catch (error) {
      const execution = {
        id: execId,
        type: 'step',
        stepId,
        error: error.message,
        duration: Date.now() - (context.startTime || Date.now()),
        completedAt: Date.now()
      };
      
      this.emit('executionFailed', execution);
      throw error;
    }
  }

  /**
   * 执行节点
   */
  async executeNode(node, context = {}) {
    const { 
      parentId = null,
      executionId = null,
      timeout = this.config.defaultTimeout
    } = context;
    
    const execId = executionId || this.generateExecutionId();
    const startTime = Date.now();
    
    this.logger.info('Executing node', { 
      nodeId: node.id, 
      type: node.type,
      path: node.getPath() 
    });
    
    try {
      this.emit('nodeExecutionStarted', { 
        id: execId, 
        node, 
        startTime 
      });
      
      let result;
      
      switch (node.type) {
        case 'step':
          result = await this.executeStepNode(node, { ...context, startTime, executionId: execId });
          break;
          
        case 'sequence':
          result = await this.executeSequenceNode(node, { ...context, startTime, executionId: execId });
          break;
          
        case 'parallel':
          result = await this.executeParallelNode(node, { ...context, startTime, executionId: execId });
          break;
          
        case 'conditional':
          result = await this.executeConditionalNode(node, { ...context, startTime, executionId: execId });
          break;
          
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }
      
      const execution = {
        id: execId,
        node,
        result,
        duration: Date.now() - startTime,
        completedAt: Date.now()
      };
      
      this.emit('nodeExecutionCompleted', execution);
      
      return execution;
      
    } catch (error) {
      const execution = {
        id: execId,
        node,
        error: error.message,
        duration: Date.now() - startTime,
        completedAt: Date.now()
      };
      
      this.emit('nodeExecutionFailed', execution);
      throw error;
    }
  }

  /**
   * 执行步骤节点
   */
  async executeStepNode(node, context) {
    const { stepId, params = {}, retries = 0 } = node.config;
    
    return this.executeStep(stepId, {
      ...context,
      params,
      node: context.node || node
    });
  }

  /**
   * 执行序列节点
   */
  async executeSequenceNode(node, context) {
    const results = [];
    let currentContext = context;
    
    for (const child of node.children) {
      try {
        const childContext = {
          ...currentContext,
          parentId: currentContext.executionId
        };
        
        const result = await this.executeNode(child, childContext);
        results.push(result);
        
        // 更新上下文
        if (result.result?.context) {
          currentContext = {
            ...currentContext,
            initialState: result.result.context.state
          };
        }
        
      } catch (error) {
        if (node.config.stopOnError) {
          throw error;
        }
        
        results.push({
          node: child,
          error: error.message,
          success: false
        });
      }
    }
    
    return {
      type: 'sequence',
      results,
      successCount: results.filter(r => !r.error).length,
      failureCount: results.filter(r => r.error).length
    };
  }

  /**
   * 执行并行节点
   */
  async executeParallelNode(node, context) {
    const { limit = node.config.parallelLimit || this.config.maxConcurrentExecutions } = node.config;
    const children = [...node.children];
    const results = [];
    
    // 分批执行
    for (let i = 0; i < children.length; i += limit) {
      const batch = children.slice(i, i + limit);
      const batchResults = await Promise.allSettled(
        batch.map(child => this.executeNode(child, {
          ...context,
          parentId: context.executionId
        }))
      );
      
      for (const batchResult of batchResults) {
        if (batchResult.status === 'fulfilled') {
          results.push(batchResult.value);
        } else {
          results.push({
            error: batchResult.reason.message,
            success: false
          });
        }
      }
    }
    
    return {
      type: 'parallel',
      results,
      successCount: results.filter(r => !r.error).length,
      failureCount: results.filter(r => r.error).length
    };
  }

  /**
   * 执行条件节点
   */
  async executeConditionalNode(node, context) {
    const { condition, trueBranch, falseBranch } = node.config;
    
    // 评估条件
    const conditionResult = this.evaluateCondition(condition, context);
    
    if (conditionResult) {
      if (trueBranch) {
        return this.executeNode(trueBranch, {
          ...context,
          parentId: context.executionId
        });
      }
    } else {
      if (falseBranch) {
        return this.executeNode(falseBranch, {
          ...context,
          parentId: context.executionId
        });
      }
    }
    
    return {
      type: 'conditional',
      conditionResult,
      executed: false
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
      // 简单的条件表达式
      return this.evaluateExpression(condition, context);
    }
    
    if (typeof condition === 'object') {
      const { type, field, operator, value } = condition;
      const contextValue = this.getContextValue(field, context);
      
      switch (operator) {
        case '==':
          return contextValue == value;
        case '===':
          return contextValue === value;
        case '!=':
          return contextValue != value;
        case '!==':
          return contextValue !== value;
        case '>':
          return contextValue > value;
        case '>=':
          return contextValue >= value;
        case '<':
          return contextValue < value;
        case '<=':
          return contextValue <= value;
        case 'in':
          return Array.isArray(value) && value.includes(contextValue);
        case 'contains':
          return Array.isArray(contextValue) && contextValue.includes(value);
        default:
          return false;
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
   * 评估表达式
   */
  evaluateExpression(expression, context) {
    // 简单的表达式评估
    try {
      const state = context.initialState || context.state || {};
      return new Function('state', `return ${expression}`)(state);
    } catch (error) {
      this.logger.warn('Failed to evaluate expression', { 
        expression, 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * 执行计划
   */
  async executePlan(planId, context = {}) {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      throw new Error(`Execution plan '${planId}' not found`);
    }
    
    const executionId = this.generateExecutionId();
    const startTime = Date.now();
    
    try {
      this.emit('planExecutionStarted', { 
        id: executionId, 
        plan, 
        startTime 
      });
      
      // 更新计划元数据
      plan.metadata.lastExecutedAt = startTime;
      plan.metadata.executionCount++;
      
      // 执行根节点
      const result = await this.executeNode(plan.rootNode, {
        ...context,
        executionId
      });
      
      const execution = {
        id: executionId,
        plan,
        result,
        duration: Date.now() - startTime,
        completedAt: Date.now()
      };
      
      this.emit('planExecutionCompleted', execution);
      
      return execution;
      
    } catch (error) {
      const execution = {
        id: executionId,
        plan,
        error: error.message,
        duration: Date.now() - startTime,
        completedAt: Date.now()
      };
      
      this.emit('planExecutionFailed', execution);
      throw error;
    }
  }

  /**
   * 批量执行步骤
   */
  async executeSteps(stepIds, context = {}) {
    const sequenceNode = new ExecutionNode(
      this.generateExecutionId(),
      'sequence',
      { stopOnError: context.stopOnError ?? false }
    );
    
    // 为每个步骤创建子节点
    for (const stepId of stepIds) {
      const stepNode = new ExecutionNode(
        `step_${stepId}`,
        'step',
        { stepId }
      );
      sequenceNode.addChild(stepNode);
    }
    
    // 创建临时计划
    const tempPlan = new ExecutionPlan(
      this.generateExecutionId(),
      'Batch Execution',
      { timeout: context.timeout || this.config.defaultTimeout }
    );
    tempPlan.setRootNode(sequenceNode);
    
    // 执行计划
    const execution = await this.executePlan(tempPlan.id, context);
    
    // 清理临时计划
    this.executionPlans.delete(tempPlan.id);
    
    return execution;
  }

  /**
   * 生成执行ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 更新指标
   */
  updateMetrics(execution) {
    if (!this.config.enableMetrics) {
      return;
    }
    
    this.metrics.totalExecutions++;
    
    if (execution.error) {
      this.metrics.failedExecutions++;
    } else {
      this.metrics.successfulExecutions++;
    }
    
    // 更新平均执行时间
    const totalTime = this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1);
    this.metrics.averageExecutionTime = (totalTime + execution.duration) / this.metrics.totalExecutions;
  }

  /**
   * 获取活动执行
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * 停止执行
   */
  async stopExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution '${executionId}' not found`);
    }
    
    // 这里可以实现停止逻辑
    this.logger.info('Stopping execution', { executionId });
    
    this.emit('executionStopped', execution);
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    return {
      metrics: this.metrics,
      executionPlans: this.executionPlans.size,
      activeExecutions: this.activeExecutions.size,
      stepMatcher: this.stepMatcher.getStatistics(),
      contextManager: this.contextManager.getStatistics(),
      config: this.config
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.executionPlans.clear();
    this.activeExecutions.clear();
    this.stepMatcher.cleanup();
    this.contextManager.cleanup();
    this.removeAllListeners();
    this.logger.info('NestedOrchestrator cleaned up');
  }
}

export default NestedOrchestrator;