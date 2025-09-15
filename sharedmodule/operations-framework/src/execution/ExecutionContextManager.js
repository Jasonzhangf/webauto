/**
 * ExecutionContext管理器
 * 负责管理多个ExecutionContext的生命周期和资源分配
 */

import ExecutionContext from './ExecutionContext.js';

export class ExecutionContextManager {
  constructor(config = {}) {
    this.config = config;
    this.logger = config.logger || console;
    this.contexts = new Map();
    this.activeContexts = new Set();
    this.resourcePool = new Map();
    this.maxContexts = config.maxContexts || 10;
    this.defaultTimeout = config.defaultTimeout || 300000; // 5 minutes
    this.cleanupInterval = config.cleanupInterval || 60000; // 1 minute
    this.lastCleanup = Date.now();
    
    // 启动清理定时器
    this.startCleanupTimer();
  }

  /**
   * 创建新的ExecutionContext
   */
  async createContext(workflowId, inputParams = {}, config = {}) {
    const contextId = this.generateContextId(workflowId);
    
    // 检查是否超过最大上下文数量
    if (this.activeContexts.size >= this.maxContexts) {
      await this.cleanupInactiveContexts();
      
      if (this.activeContexts.size >= this.maxContexts) {
        throw new Error(`Maximum number of contexts (${this.maxContexts}) reached`);
      }
    }
    
    // 创建新的上下文
    const context = new ExecutionContext({
      contextId,
      workflowId,
      inputParams,
      config: { ...this.config, ...config },
      logger: this.logger,
      resourcePool: this.resourcePool
    });
    
    this.contexts.set(contextId, context);
    this.activeContexts.add(contextId);
    
    this.logger.info('ExecutionContext created', { contextId, workflowId });
    
    return context;
  }

  /**
   * 获取指定的ExecutionContext
   */
  getContext(contextId) {
    const context = this.contexts.get(contextId);
    
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }
    
    return context;
  }

  /**
   * 获取所有活动的上下文
   */
  getActiveContexts() {
    return Array.from(this.activeContexts).map(contextId => 
      this.contexts.get(contextId)
    ).filter(context => context && context.isActive());
  }

  /**
   * 获取所有上下文的状态
   */
  getAllContextsStatus() {
    const status = [];
    
    for (const [contextId, context] of this.contexts) {
      status.push({
        contextId,
        workflowId: context.workflowId,
        status: context.getStatus(),
        isActive: context.isActive(),
        startTime: context.startTime,
        endTime: context.endTime,
        duration: context.getDuration(),
        resourcesUsed: context.getResourcesUsed(),
        stepCount: context.getStepCount()
      });
    }
    
    return status;
  }

  /**
   * 释放指定的ExecutionContext
   */
  async releaseContext(contextId) {
    const context = this.contexts.get(contextId);
    
    if (!context) {
      this.logger.warn('Context not found for release', { contextId });
      return false;
    }
    
    try {
      // 清理上下文资源
      await context.cleanup();
      
      // 从活动上下文中移除
      this.activeContexts.delete(contextId);
      
      this.logger.info('ExecutionContext released', { contextId });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to release ExecutionContext', { 
        contextId, 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * 清理所有不活动的上下文
   */
  async cleanupInactiveContexts() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const contextId of this.activeContexts) {
      const context = this.contexts.get(contextId);
      
      if (context && !context.isActive()) {
        const inactiveTime = now - (context.endTime || context.startTime);
        
        // 如果上下文不活动超过5分钟，则清理
        if (inactiveTime > 300000) {
          await this.releaseContext(contextId);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.info('Cleaned up inactive contexts', { 
        count: cleanedCount,
        remainingActiveContexts: this.activeContexts.size
      });
    }
    
    return cleanedCount;
  }

  /**
   * 清理所有上下文
   */
  async cleanupAllContexts() {
    const cleanupPromises = Array.from(this.activeContexts).map(contextId => 
      this.releaseContext(contextId)
    );
    
    const results = await Promise.allSettled(cleanupPromises);
    const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;
    
    this.logger.info('All contexts cleaned up', { 
      totalContexts: this.activeContexts.size,
      successfullyCleaned: successCount
    });
    
    return successCount;
  }

  /**
   * 获取资源池统计信息
   */
  getResourcePoolStats() {
    const stats = {
      totalResources: 0,
      activeResources: 0,
      resourceTypes: {},
      utilization: {}
    };
    
    for (const [resourceType, resources] of this.resourcePool) {
      stats.resourceTypes[resourceType] = resources.size;
      stats.totalResources += resources.size;
      
      const activeCount = Array.from(resources).filter(resource => 
        resource && resource.isActive && resource.isActive()
      ).length;
      
      stats.activeResources += activeCount;
      stats.utilization[resourceType] = resources.size > 0 ? 
        (activeCount / resources.size) * 100 : 0;
    }
    
    return stats;
  }

  /**
   * 获取系统健康状态
   */
  getSystemHealth() {
    const activeContexts = this.getActiveContexts();
    const resourceStats = this.getResourcePoolStats();
    
    return {
      status: 'healthy',
      activeContexts: activeContexts.length,
      totalContexts: this.contexts.size,
      maxContexts: this.maxContexts,
      contextUtilization: (activeContexts.length / this.maxContexts) * 100,
      resourceUtilization: resourceStats.utilization,
      lastCleanup: this.lastCleanup,
      uptime: process.uptime()
    };
  }

  /**
   * 获取系统状态 (兼容性方法)
   */
  getStatus() {
    return this.getSystemHealth();
  }

  /**
   * 生成上下文ID
   */
  generateContextId(workflowId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    return `${workflowId}-${timestamp}-${random}`;
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    setInterval(async () => {
      try {
        await this.cleanupInactiveContexts();
        this.lastCleanup = Date.now();
      } catch (error) {
        this.logger.error('Error during context cleanup', { 
          error: error.message 
        });
      }
    }, this.cleanupInterval);
  }

  /**
   * 析构函数 - 清理所有资源
   */
  async destroy() {
    this.logger.info('Destroying ExecutionContextManager');
    
    try {
      await this.cleanupAllContexts();
      this.contexts.clear();
      this.activeContexts.clear();
      this.resourcePool.clear();
      
      this.logger.info('ExecutionContextManager destroyed successfully');
    } catch (error) {
      this.logger.error('Error destroying ExecutionContextManager', { 
        error: error.message 
      });
    }
  }
}

export default ExecutionContextManager;