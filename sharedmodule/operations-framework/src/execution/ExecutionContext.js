/**
 * 操作子执行状态管理器
 * 解决浏览器实例、页面和操作实例在编排过程中的传递问题
 */

import { EventEmitter } from 'events';

export class ExecutionContext extends EventEmitter {
  constructor(initialState = {}) {
    super();
    this.state = {
      // 浏览器相关状态
      browser: {
        instance: null,
        type: null, // 'playwright', 'puppeteer', 'selenium'
        config: {},
        context: null,
        pages: new Map(),
        activePages: new Set()
      },
      
      // 当前页面状态
      currentPage: {
        instance: null,
        url: null,
        title: null,
        viewport: null,
        cookies: [],
        localStorage: {},
        sessionStorage: {},
        elements: new Map()
      },
      
      // 操作实例状态
      operations: {
        active: new Map(),
        completed: new Map(),
        failed: new Map(),
        instances: new Map()
      },
      
      // 共享资源池
      resources: {
        cookies: new Map(),
        storage: new Map(),
        cache: new Map(),
        sessions: new Map()
      },
      
      // 执行上下文
      execution: {
        id: this.generateExecutionId(),
        startTime: Date.now(),
        parentExecutionId: null,
        workflowId: null,
        stepId: null,
        metadata: {}
      },
      
      // 用户数据
      userData: {},
      
      // 系统配置
      config: {
        reuseBrowser: true,
        reusePage: true,
        parallelExecution: false,
        cleanupOnComplete: true,
        debugMode: false
      },
      
      ...initialState
    };
    
    this.locks = new Map(); // 资源锁
    this.eventLog = []; // 事件日志
    this.performanceMetrics = {
      totalExecutionTime: 0,
      operationTimes: new Map(),
      resourceUsage: new Map()
    };
  }

  /**
   * 生成执行ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 设置浏览器实例
   */
  async setBrowser(browserInstance, options = {}) {
    const { type = 'playwright', config = {}, reuse = true } = options;
    
    try {
      // 清理现有浏览器实例
      if (this.state.browser.instance && !reuse) {
        await this.cleanupBrowser();
      }
      
      this.state.browser.instance = browserInstance;
      this.state.browser.type = type;
      this.state.browser.config = config;
      
      this.emit('browser:set', {
        instance: browserInstance,
        type,
        config,
        timestamp: Date.now()
      });
      
      this.logEvent('browser-set', { type, reuse });
      
      return browserInstance;
      
    } catch (error) {
      this.emit('error', { type: 'browser-set', error: error.message });
      throw error;
    }
  }

  /**
   * 获取浏览器实例
   */
  getBrowser() {
    if (!this.state.browser.instance) {
      throw new Error('Browser instance not found in execution context');
    }
    return this.state.browser.instance;
  }

  /**
   * 创建新页面
   */
  async createPage(options = {}) {
    const { url = null, reuseExisting = true, config = {} } = options;
    
    try {
      const browser = this.getBrowser();
      let page;
      
      // 尝试复用现有页面
      if (reuseExisting && this.state.browser.activePages.size > 0) {
        const existingPage = Array.from(this.state.browser.activePages)[0];
        page = this.state.browser.pages.get(existingPage);
        
        if (page && !page.isClosed()) {
          if (url) {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
          }
          await this.setCurrentPage(page);
          return page;
        }
      }
      
      // 创建新页面
      if (browser.newPage) {
        page = await browser.newPage();
      } else if (browser.pages) {
        const pages = await browser.pages();
        page = pages[pages.length - 1] || await browser.newPage();
      } else {
        throw new Error('Browser does not support page creation');
      }
      
      // 配置页面
      if (config.viewport) {
        await page.setViewportSize(config.viewport);
      }
      
      // 导航到指定URL
      if (url) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      }
      
      // 注册页面
      const pageId = this.generatePageId();
      this.state.browser.pages.set(pageId, page);
      this.state.browser.activePages.add(pageId);
      
      // 设置当前页面
      await this.setCurrentPage(page);
      
      this.emit('page:created', {
        pageId,
        page,
        url,
        timestamp: Date.now()
      });
      
      this.logEvent('page-created', { pageId, url });
      
      return page;
      
    } catch (error) {
      this.emit('error', { type: 'page-creation', error: error.message });
      throw error;
    }
  }

  /**
   * 设置当前页面
   */
  async setCurrentPage(page) {
    try {
      // 清理当前页面状态
      if (this.state.currentPage.instance && this.state.currentPage.instance !== page) {
        await this.releaseCurrentPage();
      }
      
      this.state.currentPage.instance = page;
      this.state.currentPage.url = page.url();
      this.state.currentPage.title = await page.title();
      this.state.currentPage.viewport = page.viewportSize();
      
      // 获取页面cookies
      try {
        const cookies = await page.cookies();
        this.state.currentPage.cookies = cookies;
      } catch (error) {
        // 某些情况下可能无法获取cookies
        this.state.currentPage.cookies = [];
      }
      
      // 清理元素缓存
      this.state.currentPage.elements.clear();
      
      this.emit('page:set', {
        page,
        url: this.state.currentPage.url,
        timestamp: Date.now()
      });
      
      this.logEvent('page-set', { url: this.state.currentPage.url });
      
      return page;
      
    } catch (error) {
      this.emit('error', { type: 'page-set', error: error.message });
      throw error;
    }
  }

  /**
   * 获取当前页面
   */
  getCurrentPage() {
    if (!this.state.currentPage.instance) {
      throw new Error('No current page found in execution context');
    }
    
    if (this.state.currentPage.instance.isClosed && this.state.currentPage.instance.isClosed()) {
      throw new Error('Current page is closed');
    }
    
    return this.state.currentPage.instance;
  }

  /**
   * 注册操作实例
   */
  registerOperation(operationId, operationInstance, metadata = {}) {
    this.state.operations.instances.set(operationId, operationInstance);
    this.state.operations.active.set(operationId, {
      instance: operationInstance,
      startTime: Date.now(),
      metadata
    });
    
    this.emit('operation:registered', {
      operationId,
      metadata,
      timestamp: Date.now()
    });
    
    this.logEvent('operation-registered', { operationId });
    
    return operationId;
  }

  /**
   * 获取操作实例
   */
  getOperation(operationId) {
    const operation = this.state.operations.instances.get(operationId);
    if (!operation) {
      throw new Error(`Operation instance not found: ${operationId}`);
    }
    return operation;
  }

  /**
   * 完成操作
   */
  completeOperation(operationId, result = {}) {
    const activeOp = this.state.operations.active.get(operationId);
    if (activeOp) {
      const completionTime = Date.now();
      const executionTime = completionTime - activeOp.startTime;
      
      this.state.operations.completed.set(operationId, {
        ...activeOp,
        result,
        completionTime,
        executionTime
      });
      
      this.state.operations.active.delete(operationId);
      
      // 更新性能指标
      this.performanceMetrics.operationTimes.set(operationId, executionTime);
      
      this.emit('operation:completed', {
        operationId,
        result,
        executionTime,
        timestamp: Date.now()
      });
      
      this.logEvent('operation-completed', { operationId, executionTime });
    }
  }

  /**
   * 操作失败
   */
  failOperation(operationId, error = {}) {
    const activeOp = this.state.operations.active.get(operationId);
    if (activeOp) {
      const failureTime = Date.now();
      const executionTime = failureTime - activeOp.startTime;
      
      this.state.operations.failed.set(operationId, {
        ...activeOp,
        error,
        failureTime,
        executionTime
      });
      
      this.state.operations.active.delete(operationId);
      
      this.emit('operation:failed', {
        operationId,
        error,
        executionTime,
        timestamp: Date.now()
      });
      
      this.logEvent('operation-failed', { operationId, error: error.message });
    }
  }

  /**
   * 缓存元素
   */
  cacheElement(elementId, element, selector = null, metadata = {}) {
    this.state.currentPage.elements.set(elementId, {
      element,
      selector,
      metadata,
      cachedAt: Date.now()
    });
    
    this.emit('element:cached', {
      elementId,
      selector,
      timestamp: Date.now()
    });
  }

  /**
   * 获取缓存的元素
   */
  getCachedElement(elementId) {
    const cached = this.state.currentPage.elements.get(elementId);
    if (cached && cached.element) {
      // 检查元素是否仍然有效
      try {
        if (cached.element.isConnected && !cached.element.isHidden()) {
          return cached.element;
        } else {
          // 元素已失效，清理缓存
          this.state.currentPage.elements.delete(elementId);
        }
      } catch (error) {
        // 元素检查失败，清理缓存
        this.state.currentPage.elements.delete(elementId);
      }
    }
    return null;
  }

  /**
   * 共享资源
   */
  shareResource(resourceId, resource, options = {}) {
    const { ttl = null, overwrite = true } = options;
    
    if (overwrite || !this.state.resources.cache.has(resourceId)) {
      this.state.resources.cache.set(resourceId, {
        resource,
        createdAt: Date.now(),
        ttl,
        accessCount: 0
      });
    }
    
    this.emit('resource:shared', {
      resourceId,
      timestamp: Date.now()
    });
  }

  /**
   * 获取共享资源
   */
  getSharedResource(resourceId) {
    const cached = this.state.resources.cache.get(resourceId);
    if (cached) {
      // 检查TTL
      if (cached.ttl && Date.now() - cached.createdAt > cached.ttl) {
        this.state.resources.cache.delete(resourceId);
        return null;
      }
      
      cached.accessCount++;
      return cached.resource;
    }
    return null;
  }

  /**
   * 获取资源锁
   */
  async acquireLock(resourceId, timeout = 30000) {
    if (this.locks.has(resourceId)) {
      const lock = this.locks.get(resourceId);
      
      if (timeout > 0) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Lock acquisition timeout for resource: ${resourceId}`));
          }, timeout);
          
          lock.waiting.push({ resolve, timer });
        });
      } else {
        throw new Error(`Resource locked: ${resourceId}`);
      }
    }
    
    const lock = {
      acquiredAt: Date.now(),
      ownerId: this.state.execution.id,
      waiting: []
    };
    
    this.locks.set(resourceId, lock);
    
    this.emit('lock:acquired', {
      resourceId,
      timestamp: Date.now()
    });
    
    return () => this.releaseLock(resourceId);
  }

  /**
   * 释放资源锁
   */
  releaseLock(resourceId) {
    const lock = this.locks.get(resourceId);
    if (lock && lock.ownerId === this.state.execution.id) {
      this.locks.delete(resourceId);
      
      // 通知等待的请求
      lock.waiting.forEach(({ resolve, timer }) => {
        clearTimeout(timer);
        resolve();
      });
      
      this.emit('lock:released', {
        resourceId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 更新状态
   */
  updateState(keyPath, value) {
    const keys = keyPath.split('.');
    let current = this.state;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    const oldValue = current[keys[keys.length - 1]];
    current[keys[keys.length - 1]] = value;
    
    this.emit('state:updated', {
      keyPath,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    });
    
    this.logEvent('state-updated', { keyPath });
  }

  /**
   * 获取状态
   */
  getState(keyPath = null) {
    if (!keyPath) {
      return JSON.parse(JSON.stringify(this.state)); // 深拷贝
    }
    
    const keys = keyPath.split('.');
    let current = this.state;
    
    for (const key of keys) {
      if (!(key in current)) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * 设置变量
   */
  setVariable(name, value) {
    if (!this.state.userData) {
      this.state.userData = {};
    }
    
    const oldValue = this.state.userData[name];
    this.state.userData[name] = value;
    
    this.emit('variable:set', {
      name,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    });
    
    this.logEvent('variable-set', { name });
    
    return value;
  }

  /**
   * 获取变量
   */
  getVariable(name) {
    if (!this.state.userData) {
      return undefined;
    }
    return this.state.userData[name];
  }

  /**
   * 获取所有变量
   */
  getVariables() {
    return this.state.userData ? { ...this.state.userData } : {};
  }

  /**
   * 生成页面ID
   */
  generatePageId() {
    return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 释放当前页面
   */
  async releaseCurrentPage() {
    if (this.state.currentPage.instance) {
      // 保存页面状态
      try {
        const page = this.state.currentPage.instance;
        
        // 保存当前URL和标题
        this.state.currentPage.url = page.url();
        this.state.currentPage.title = await page.title();
        
        // 清理元素缓存
        this.state.currentPage.elements.clear();
        
      } catch (error) {
        // 页面可能已关闭，忽略错误
      }
    }
  }

  /**
   * 清理浏览器实例
   */
  async cleanupBrowser() {
    const { browser } = this.state;
    
    if (browser.instance) {
      try {
        // 关闭所有页面
        for (const [pageId, page] of browser.pages) {
          if (!page.isClosed()) {
            await page.close();
          }
        }
        
        // 关闭浏览器
        if (browser.instance.close) {
          await browser.instance.close();
        } else if (browser.instance.disconnect) {
          await browser.instance.disconnect();
        }
        
        // 清理状态
        browser.instance = null;
        browser.pages.clear();
        browser.activePages.clear();
        
        this.emit('browser:cleanup', { timestamp: Date.now() });
        
      } catch (error) {
        this.emit('error', { type: 'browser-cleanup', error: error.message });
      }
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      // 完成所有活跃操作
      for (const [operationId] of this.state.operations.active) {
        this.failOperation(operationId, { message: 'Context cleanup' });
      }
      
      // 清理浏览器
      if (this.state.config.cleanupOnComplete) {
        await this.cleanupBrowser();
      }
      
      // 清理资源缓存
      this.state.resources.cache.clear();
      
      // 清理锁
      this.locks.clear();
      
      // 更新总执行时间
      this.performanceMetrics.totalExecutionTime = Date.now() - this.state.execution.startTime;
      
      this.emit('cleanup:completed', {
        executionId: this.state.execution.id,
        timestamp: Date.now()
      });
      
    } catch (error) {
      this.emit('error', { type: 'cleanup', error: error.message });
    }
  }

  /**
   * 记录事件
   */
  logEvent(eventType, data = {}) {
    this.eventLog.push({
      eventType,
      data,
      timestamp: Date.now(),
      executionId: this.state.execution.id
    });
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport() {
    return {
      executionId: this.state.execution.id,
      totalExecutionTime: this.performanceMetrics.totalExecutionTime,
      operationTimes: Object.fromEntries(this.performanceMetrics.operationTimes),
      activeOperations: this.state.operations.active.size,
      completedOperations: this.state.operations.completed.size,
      failedOperations: this.state.operations.failed.size,
      resourceUsage: Object.fromEntries(this.performanceMetrics.resourceUsage),
      eventLogCount: this.eventLog.length,
      timestamp: Date.now()
    };
  }

  /**
   * 获取状态快照
   */
  getSnapshot() {
    return {
      state: JSON.parse(JSON.stringify(this.state)),
      locks: Object.fromEntries(this.locks),
      performanceMetrics: this.getPerformanceReport(),
      eventLog: this.eventLog.slice(-100) // 最近100个事件
    };
  }

  /**
   * 从快照恢复
   */
  restoreSnapshot(snapshot) {
    this.state = snapshot.state;
    this.locks = new Map(Object.entries(snapshot.locks));
    this.performanceMetrics = snapshot.performanceMetrics;
    this.eventLog = snapshot.eventLog;
    
    this.emit('restored', { timestamp: Date.now() });
  }

  /**
   * 创建子上下文
   */
  createChildContext(options = {}) {
    const childContext = new ExecutionContext({
      ...this.state,
      execution: {
        id: this.generateExecutionId(),
        startTime: Date.now(),
        parentExecutionId: this.state.execution.id,
        ...options.execution
      },
      config: {
        ...this.state.config,
        ...options.config
      }
    });
    
    // 继承浏览器实例（如果配置允许）
    if (this.state.config.reuseBrowser && this.state.browser.instance) {
      childContext.state.browser.instance = this.state.browser.instance;
      childContext.state.browser.type = this.state.browser.type;
      childContext.state.browser.config = this.state.browser.config;
    }
    
    this.emit('child:created', {
      childExecutionId: childContext.state.execution.id,
      timestamp: Date.now()
    });
    
    return childContext;
  }

  /**
   * 获取执行上下文摘要
   */
  getSummary() {
    return {
      executionId: this.state.execution.id,
      startTime: this.state.execution.startTime,
      uptime: Date.now() - this.state.execution.startTime,
      browser: this.state.browser.instance ? {
        id: this.state.browser.id,
        launched: this.state.browser.launched,
        pages: this.state.browser.pages.length
      } : null,
      currentPage: this.state.currentPage.instance ? {
        url: this.state.currentPage.url,
        title: this.state.currentPage.title,
        elements: this.state.currentPage.elements.size
      } : null,
      operations: {
        active: this.state.operations.active.size,
        completed: this.state.operations.completed.size,
        failed: this.state.operations.failed.size
      },
      resources: {
        cached: this.state.resources.cache.size,
        locks: this.locks.size
      },
      performance: {
        totalExecutionTime: this.performanceMetrics.totalExecutionTime,
        operationCount: this.performanceMetrics.operationCount,
        averageExecutionTime: this.performanceMetrics.averageExecutionTime,
        cacheHits: this.performanceMetrics.cacheHits,
        resourceConflicts: this.performanceMetrics.resourceConflicts
      }
    };
  }
}

/**
 * 执行上下文管理器
 * 管理多个执行上下文的生命周期
 */
export class ExecutionContextManager {
  constructor() {
    this.contexts = new Map();
    this.globalResources = new Map();
    this.defaultConfig = {
      reuseBrowser: true,
      reusePage: true,
      parallelExecution: false,
      cleanupOnComplete: true,
      debugMode: false
    };
  }

  /**
   * 创建执行上下文
   */
  createContext(initialState = {}) {
    const context = new ExecutionContext({
      config: { ...this.defaultConfig },
      ...initialState
    });
    
    this.contexts.set(context.state.execution.id, context);
    
    // 监听上下文事件
    context.on('cleanup:completed', () => {
      this.contexts.delete(context.state.execution.id);
    });
    
    return context;
  }

  /**
   * 获取执行上下文
   */
  getContext(executionId) {
    return this.contexts.get(executionId);
  }

  /**
   * 获取所有活跃上下文
   */
  getActiveContexts() {
    return Array.from(this.contexts.values());
  }

  /**
   * 清理所有上下文
   */
  async cleanupAll() {
    const cleanupPromises = Array.from(this.contexts.values()).map(context => 
      context.cleanup()
    );
    
    await Promise.allSettled(cleanupPromises);
    
    this.contexts.clear();
    this.globalResources.clear();
  }

  /**
   * 设置全局资源
   */
  setGlobalResource(resourceId, resource) {
    this.globalResources.set(resourceId, {
      resource,
      createdAt: Date.now()
    });
  }

  /**
   * 获取全局资源
   */
  getGlobalResource(resourceId) {
    const cached = this.globalResources.get(resourceId);
    return cached ? cached.resource : null;
  }
}

export default ExecutionContext;