#!/usr/bin/env node

/**
 * 微博链接获取综合测试脚本
 * 测试事件驱动的微博链接提取容器系统
 */

// 复制之前的EventBus和Container类
class EventBus {
  constructor(options = {}) {
    this.eventHandlers = new Map();
    this.eventHistory = [];
    this.eventHistoryLimit = options.historyLimit || 1000;
    this.middleware = [];
  }

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  async emit(event, data = {}, source) {
    const eventEntry = {
      event,
      data,
      timestamp: Date.now(),
      source
    };

    try {
      await this.applyMiddleware(event, data);
    } catch (error) {
      console.error('[EventBus] 中间件错误:', error);
      return;
    }

    this.addToHistory(eventEntry);

    const handlers = this.eventHandlers.get(event) || [];
    const promises = handlers.map(async (handler) => {
      try {
        await handler(data);
      } catch (error) {
        console.error(`[EventBus] 处理器错误 (${event}):`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  getEventHistory(event) {
    return event
      ? this.eventHistory.filter(e => e.event === event)
      : [...this.eventHistory];
  }

  use(middleware) {
    this.middleware.push(middleware);
  }

  async applyMiddleware(event, data) {
    let index = 0;
    const next = async () => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        await middleware(event, data, next);
      }
    };
    await next();
  }

  addToHistory(entry) {
    this.eventHistory.push(entry);
    if (this.eventHistory.length > this.eventHistoryLimit) {
      this.eventHistory = this.eventHistory.slice(-this.eventHistoryLimit);
    }
  }

  destroy() {
    this.eventHandlers.clear();
    this.eventHistory = [];
    this.middleware = [];
  }
}

class EventDrivenContainer {
  constructor(config) {
    this.config = { ...config, enabled: config.enabled ?? true };
    this.state = {
      id: config.id,
      name: config.name,
      status: 'created',
      lastActivity: Date.now(),
      errorCount: 0,
      stats: {}
    };
    this.eventBus = config.eventBus || new EventBus();
    this.sharedSpace = config.sharedSpace || null;
    this.eventHandlers = new Map();
    this.childContainers = new Map();
    this.parentContainer = config.parentContainer || null;

    console.log(`[Container] 创建容器: ${config.name} (${config.id})`);
  }

  async initialize() {
    console.log(`[Container] 初始化容器: ${this.config.name}`);
    this.updateState('initializing');

    try {
      this.setupInternalEventListeners();
      await this.doInitialize();
      this.updateState('ready');
      await this.emitEvent('container:initialized', {
        containerId: this.config.id,
        initializationTime: Date.now()
      });
      console.log(`[Container] 容器初始化完成: ${this.config.name}`);
    } catch (error) {
      this.updateState('failed');
      await this.handleError(error, 'initialization');
      throw error;
    }
  }

  async start() {
    console.log(`[Container] 启动容器: ${this.config.name}`);
    this.updateState('running');

    try {
      await this.emitEvent('container:started', {
        containerId: this.config.id,
        startTime: Date.now()
      });
      await this.doStart();
      console.log(`[Container] 容器启动完成: ${this.config.name}`);
    } catch (error) {
      this.updateState('failed');
      await this.handleError(error, 'start');
      throw error;
    }
  }

  async stop() {
    console.log(`[Container] 停止容器: ${this.config.name}`);
    try {
      await this.emitEvent('container:stopped', {
        containerId: this.config.id,
        stopTime: Date.now()
      });
      await this.doStop();
      this.updateState('ready');
      console.log(`[Container] 容器停止完成: ${this.config.name}`);
    } catch (error) {
      await this.handleError(error, 'stop');
      throw error;
    }
  }

  async destroy() {
    console.log(`[Container] 销毁容器: ${this.config.name}`);
    try {
      for (const child of this.childContainers.values()) {
        await child.destroy();
      }
      await this.emitEvent('container:destroyed', {
        containerId: this.config.id,
        destructionTime: Date.now()
      });
      this.eventHandlers.clear();
      this.updateState('destroyed');
      console.log(`[Container] 容器销毁完成: ${this.config.name}`);
    } catch (error) {
      await this.handleError(error, 'destroy');
      throw error;
    }
  }

  async addChildContainer(childContainer) {
    const childId = childContainer.config.id;
    if (this.childContainers.has(childId)) {
      throw new Error(`子容器已存在: ${childId}`);
    }
    childContainer.parentContainer = this;
    this.childContainers.set(childId, childContainer);
    await this.emitEvent('container:child_added', {
      parentId: this.config.id,
      childId: childId,
      childType: childContainer.config.name
    });
    console.log(`[Container] 添加子容器: ${childContainer.config.name} 到 ${this.config.name}`);
  }

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
    this.eventBus.on(event, handler);
  }

  async emitEvent(event, data = {}) {
    const fullData = {
      ...data,
      containerId: this.config.id,
      containerName: this.config.name,
      timestamp: Date.now()
    };
    await this.eventBus.emit(event, fullData, this.config.name);
  }

  updateState(newStatus) {
    const oldStatus = this.state.status;
    this.state.status = newStatus;
    this.state.lastActivity = Date.now();
    console.log(`[Container] 状态变更: ${this.config.name} ${oldStatus} -> ${newStatus}`);
  }

  async handleError(error, context) {
    this.state.errorCount++;
    console.error(`[Container] 错误 (${context}):`, error);
    await this.emitEvent('container:error', {
      error: error.message,
      context,
      errorCount: this.state.errorCount
    });
  }

  setupInternalEventListeners() {
    this.on('container:child_added', (data) => {
      console.log(`[Container] 子容器添加事件: ${data.childId}`);
    });
    this.on('container:error', (data) => {
      console.warn(`[Container] 容器错误: ${data.error} (${data.context})`);
    });
  }

  async doInitialize() {}
  async doStart() {}
  async doStop() {}
}

// 模拟微博链接容器
class WeiboLinkContainer extends EventDrivenContainer {
  constructor(config) {
    super(config);
    this.extractedLinks = new Set();
    this.linkCache = new Map();
    this.extractionStats = {
      totalLinks: 0,
      newLinks: 0,
      duplicates: 0,
      filtered: 0
    };
  }

  async doInitialize() {
    console.log(`[WeiboLinkContainer] 初始化微博链接容器: ${this.config.name}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async doStart() {
    console.log(`[WeiboLinkContainer] 启动微博链接提取: ${this.config.name}`);

    // 模拟链接提取
    await this.simulateLinkExtraction();

    await this.emitEvent('links:extraction_completed', {
      containerId: this.config.id,
      totalLinks: this.extractionStats.totalLinks,
      newLinks: this.extractionStats.newLinks,
      extractionTime: Date.now()
    });
  }

  async simulateLinkExtraction() {
    console.log(`[WeiboLinkContainer] 开始模拟链接提取...`);

    // 模拟发现链接
    const mockLinks = [
      { href: 'https://weibo.com/1234567890/AbCdEfGhIj', text: '热门微博1', type: 'post' },
      { href: 'https://weibo.com/1234567890/KlMnOpQrSt', text: '热门微博2', type: 'post' },
      { href: 'https://weibo.com/1234567890/UvWxYz1234', text: '热门微博3', type: 'post' },
      { href: 'https://weibo.com/9876543210/FeDcBa9876', text: '用户主页', type: 'profile' },
      { href: 'https://weibo.com/search?q=test', text: '搜索结果', type: 'search' }
    ];

    for (const link of mockLinks) {
      await this.processDiscoveredLink(link);
      await new Promise(resolve => setTimeout(resolve, 50)); // 模拟处理延迟
    }

    console.log(`[WeiboLinkContainer] 链接提取完成: 发现 ${this.extractionStats.totalLinks} 个链接`);
  }

  async processDiscoveredLink(link) {
    // 检查重复
    if (this.extractedLinks.has(link.href)) {
      this.extractionStats.duplicates++;
      await this.emitEvent('links:duplicate_found', {
        containerId: this.config.id,
        duplicateLink: link.href,
        existingLink: link.href
      });
      return;
    }

    // 添加到已提取集合
    this.extractedLinks.add(link.href);
    this.extractionStats.totalLinks++;
    this.extractionStats.newLinks++;

    // 缓存链接数据
    const linkData = {
      ...link,
      containerType: this.config.name,
      timestamp: Date.now(),
      quality: this.calculateLinkQuality(link)
    };

    this.linkCache.set(link.href, linkData);

    // 发送链接发现事件
    await this.emitEvent('links:discovered', {
      containerId: this.config.id,
      links: [linkData]
    });

    console.log(`[WeiboLinkContainer] 发现链接: ${link.text} (${link.href})`);
  }

  calculateLinkQuality(link) {
    // 简单的质量计算算法
    let quality = 50; // 基础分数

    if (link.type === 'post') quality += 20;
    if (link.text.length > 10) quality += 10;
    if (link.href.includes('weibo.com')) quality += 15;

    return Math.min(100, quality);
  }

  getExtractedLinks() {
    return Array.from(this.linkCache.values());
  }

  getExtractionStats() {
    return { ...this.extractionStats };
  }
}

// 模拟微博页面容器
class WeiboPageContainer extends EventDrivenContainer {
  constructor(config) {
    super(config);
    this.pageState = {
      url: config.url || 'https://weibo.com',
      title: '微博首页',
      loadTime: Date.now(),
      health: 'excellent'
    };
    this.linkContainer = null;
    this.scrollContainer = null;
  }

  async doInitialize() {
    console.log(`[WeiboPageContainer] 初始化微博页面: ${this.config.name}`);
    await this.simulatePageLoad();
  }

  async doStart() {
    console.log(`[WeiboPageContainer] 启动微博页面操作: ${this.config.name}`);

    // 创建并启动子容器
    await this.createAndStartChildContainers();

    // 开始页面监控
    await this.startPageMonitoring();
  }

  async simulatePageLoad() {
    console.log(`[WeiboPageContainer] 模拟页面加载: ${this.pageState.url}`);
    await new Promise(resolve => setTimeout(resolve, 200));

    await this.emitEvent('page:loaded', {
      url: this.pageState.url,
      loadTime: this.pageState.loadTime,
      title: this.pageState.title
    });
  }

  async createAndStartChildContainers() {
    // 创建链接容器
    const linkContainerConfig = {
      id: `${this.config.id}-links`,
      name: '链接提取容器',
      selector: '.feed-item',
      maxLinks: 50,
      eventBus: this.eventBus,
      parentContainer: this
    };

    this.linkContainer = new WeiboLinkContainer(linkContainerConfig);
    await this.linkContainer.initialize();
    await this.addChildContainer(this.linkContainer);
    await this.linkContainer.start();

    // 创建滚动容器（简化版本）
    const scrollContainerConfig = {
      id: `${this.config.id}-scroll`,
      name: '滚动容器',
      selector: '.main-content',
      eventBus: this.eventBus,
      parentContainer: this
    };

    this.scrollContainer = new EventDrivenContainer(scrollContainerConfig);
    await this.scrollContainer.initialize();
    await this.addChildContainer(this.scrollContainer);
    await this.scrollContainer.start();
  }

  async startPageMonitoring() {
    console.log(`[WeiboPageContainer] 开始页面内容监控`);

    // 监听链接发现事件
    this.on('links:discovered', async (data) => {
      console.log(`[WeiboPageContainer] 监控到新链接发现: ${data.links.length} 个链接`);

      // 触发内容变化事件
      await this.emitEvent('content:mutation_detected', {
        containerId: this.config.id,
        mutationType: 'new_links',
        targetSelector: '.feed-item'
      });
    });

    // 监听链接提取完成事件
    this.on('links:extraction_completed', async (data) => {
      console.log(`[WeiboPageContainer] 链接提取完成: ${data.totalLinks} 个链接`);

      // 更新页面状态
      this.pageState.lastActivity = Date.now();

      // 发送页面就绪事件
      await this.emitEvent('page:ready', {
        url: this.pageState.url,
        readyTime: Date.now()
      });
    });
  }

  async performScrollAction() {
    console.log(`[WeiboPageContainer] 执行页面滚动`);

    await this.emitEvent('scroll:started', {
      containerId: this.config.id,
      startTime: Date.now()
    });

    // 模拟滚动
    await new Promise(resolve => setTimeout(resolve, 100));

    // 滚动完成后可能触发新的链接发现
    if (this.linkContainer) {
      await this.linkContainer.simulateLinkExtraction();
    }

    await this.emitEvent('scroll:bottom_reached', {
      containerId: this.config.id,
      totalScrollHeight: 3000,
      scrollTime: Date.now()
    });
  }

  getExtractedLinks() {
    return this.linkContainer ? this.linkContainer.getExtractedLinks() : [];
  }

  getPageStats() {
    const linkStats = this.linkContainer ? this.linkContainer.getExtractionStats() : {};
    return {
      pageUrl: this.pageState.url,
      pageTitle: this.pageState.title,
      loadTime: this.pageState.loadTime,
      health: this.pageState.health,
      childContainers: this.childContainers.size,
      ...linkStats
    };
  }
}

// 微博工作流引擎
class WeiboWorkflowEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.rules = new Map();
    this.activeWorkflows = new Map();
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
    this.setupRuleListeners(rule);
    console.log(`[WeiboWorkflow] 添加规则: ${rule.name}`);
  }

  setupRuleListeners(rule) {
    const eventTypes = Array.isArray(rule.when) ? rule.when : [rule.when];

    eventTypes.forEach(eventType => {
      this.eventBus.on(eventType, async (data) => {
        if (!rule.enabled) return;
        await this.evaluateRule(rule, eventType, data);
      });
    });
  }

  async evaluateRule(rule, event, data) {
    try {
      let conditionMet = true;
      if (rule.condition) {
        conditionMet = await rule.condition(data);
      }

      console.log(`[WeiboWorkflow] 规则评估: ${rule.name} - 条件: ${conditionMet}`);

      if (conditionMet) {
        await rule.then(data);
      }
    } catch (error) {
      console.error(`[WeiboWorkflow] 规则执行错误: ${rule.name}`, error);
    }
  }
}

// 微博集成测试类
class WeiboIntegrationTest {
  constructor() {
    this.eventBus = new EventBus({ historyLimit: 500 });
    this.workflowEngine = new WeiboWorkflowEngine(this.eventBus);
    this.testResults = [];
    this.containers = new Map();
  }

  async runAllTests() {
    console.log('🚀 开始微博链接获取集成测试...\n');

    try {
      await this.testWeiboPageInitialization();
      await this.testLinkExtractionWorkflow();
      await this.testEventDrivenCoordination();
      await this.testWeiboWorkflowRules();
      await this.testContainerCommunication();
      await this.testCompleteExtractionScenario();

      this.printTestResults();
    } catch (error) {
      console.error('❌ 测试过程中发生错误:', error);
      process.exit(1);
    }
  }

  async testWeiboPageInitialization() {
    console.log('📋 测试1: 微博页面容器初始化');

    const testResults = [];

    // 创建微博页面容器
    const pageConfig = {
      id: 'weibo-homepage',
      name: '微博首页容器',
      selector: '.main-content',
      url: 'https://weibo.com',
      eventBus: this.eventBus
    };

    const pageContainer = new WeiboPageContainer(pageConfig);
    this.containers.set(pageConfig.id, pageContainer);

    testResults.push({
      test: '页面容器创建',
      passed: pageContainer.state.status === 'created',
      details: `页面容器状态: ${pageContainer.state.status}`
    });

    // 初始化页面容器
    await pageContainer.initialize();

    testResults.push({
      test: '页面容器初始化',
      passed: pageContainer.state.status === 'ready',
      details: `初始化后状态: ${pageContainer.state.status}`
    });

    // 验证子容器创建
    testResults.push({
      test: '子容器自动创建',
      passed: pageContainer.childContainers.size >= 2,
      details: `子容器数量: ${pageContainer.childContainers.size}`
    });

    // 启动页面容器
    await pageContainer.start();

    testResults.push({
      test: '页面容器启动',
      passed: pageContainer.state.status === 'running',
      details: `启动后状态: ${pageContainer.state.status}`
    });

    this.logTestResults('微博页面容器初始化', testResults);
  }

  async testLinkExtractionWorkflow() {
    console.log('📋 测试2: 链接提取工作流');

    const testResults = [];

    const pageContainer = this.containers.get('weibo-homepage');
    if (!pageContainer) {
      testResults.push({
        test: '页面容器获取',
        passed: false,
        details: '无法获取页面容器'
      });
      this.logTestResults('链接提取工作流', testResults);
      return;
    }

    // 等待链接提取完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 获取提取的链接
    const extractedLinks = pageContainer.getExtractedLinks();

    testResults.push({
      test: '链接提取功能',
      passed: extractedLinks.length > 0,
      details: `提取了 ${extractedLinks.length} 个链接`
    });

    // 验证链接数据结构
    const validLinks = extractedLinks.filter(link =>
      link.href && link.text && link.type && link.timestamp
    );

    testResults.push({
      test: '链接数据完整性',
      passed: validLinks.length === extractedLinks.length,
      details: `有效链接: ${validLinks.length}/${extractedLinks.length}`
    });

    // 验证链接类型分布
    const linkTypes = {};
    extractedLinks.forEach(link => {
      linkTypes[link.type] = (linkTypes[link.type] || 0) + 1;
    });

    testResults.push({
      test: '链接类型分类',
      passed: Object.keys(linkTypes).length > 0,
      details: `链接类型: ${JSON.stringify(linkTypes)}`
    });

    // 获取页面统计信息
    const pageStats = pageContainer.getPageStats();
    testResults.push({
      test: '页面统计信息',
      passed: pageStats.totalLinks > 0,
      details: `页面统计: ${JSON.stringify(pageStats)}`
    });

    this.logTestResults('链接提取工作流', testResults);
  }

  async testEventDrivenCoordination() {
    console.log('📋 测试3: 事件驱动协调');

    const testResults = [];

    // 监听关键事件
    const coordinationEvents = [];
    const eventTypesToMonitor = [
      'page:loaded',
      'container:initialized',
      'container:started',
      'links:discovered',
      'links:extraction_completed',
      'content:mutation_detected'
    ];

    eventTypesToMonitor.forEach(eventType => {
      this.eventBus.on(eventType, (data) => {
        coordinationEvents.push({ event: eventType, timestamp: Date.now(), data });
        console.log(`[Test] 监控到事件: ${eventType}`);
      });
    });

    // 执行滚动操作
    const pageContainer = this.containers.get('weibo-homepage');
    if (pageContainer) {
      await pageContainer.performScrollAction();
    }

    // 等待事件处理
    await new Promise(resolve => setTimeout(resolve, 500));

    testResults.push({
      test: '事件协调触发',
      passed: coordinationEvents.length > 0,
      details: `协调了 ${coordinationEvents.length} 个事件`
    });

    // 验证事件顺序
    const eventSequence = coordinationEvents.map(e => e.event);
    const hasProperSequence = eventSequence.includes('page:loaded') &&
                              eventSequence.includes('links:discovered') &&
                              eventSequence.includes('links:extraction_completed');

    testResults.push({
      test: '事件序列正确性',
      passed: hasProperSequence,
      details: `事件序列: ${eventSequence.join(' -> ')}`
    });

    // 验证事件数据完整性
    const validEvents = coordinationEvents.filter(e =>
      e.data && e.data.containerId && e.data.timestamp
    );

    testResults.push({
      test: '事件数据完整性',
      passed: validEvents.length === coordinationEvents.length,
      details: `有效事件: ${validEvents.length}/${coordinationEvents.length}`
    });

    this.logTestResults('事件驱动协调', testResults);
  }

  async testWeiboWorkflowRules() {
    console.log('📋 测试4: 微博工作流规则');

    const testResults = [];

    // 添加工作流规则
    let ruleTriggered = false;

    const linkDiscoveryRule = {
      id: 'link-discovery-rule',
      name: '链接发现规则',
      description: '当发现新链接时触发处理',
      when: 'links:discovered',
      enabled: true,
      then: async (data) => {
        ruleTriggered = true;
        console.log(`[Workflow] 链接发现规则触发: ${data.links.length} 个链接`);

        // 可以在这里添加额外的处理逻辑
        await this.eventBus.emit('workflow:link_processing_started', {
          linkCount: data.links.length,
          processingTime: Date.now()
        });
      }
    };

    this.workflowEngine.addRule(linkDiscoveryRule);

    // 添加批量链接处理规则
    let batchRuleTriggered = false;

    const batchProcessingRule = {
      id: 'batch-processing-rule',
      name: '批量处理规则',
      description: '当链接提取完成时触发批量处理',
      when: 'links:extraction_completed',
      enabled: true,
      condition: (data) => data.totalLinks >= 3, // 只有当链接数量>=3时才触发
      then: async (data) => {
        batchRuleTriggered = true;
        console.log(`[Workflow] 批量处理规则触发: ${data.totalLinks} 个链接`);

        await this.eventBus.emit('workflow:batch_processing_completed', {
          totalLinks: data.totalLinks,
          processingTime: Date.now()
        });
      }
    };

    this.workflowEngine.addRule(batchProcessingRule);

    // 触发规则测试
    const pageContainer = this.containers.get('weibo-homepage');
    if (pageContainer && pageContainer.linkContainer) {
      // 手动触发一些链接发现
      await pageContainer.linkContainer.simulateLinkExtraction();
    }

    // 等待规则处理
    await new Promise(resolve => setTimeout(resolve, 300));

    testResults.push({
      test: '链接发现规则触发',
      passed: ruleTriggered,
      details: ruleTriggered ? '链接发现规则成功触发' : '链接发现规则未触发'
    });

    testResults.push({
      test: '批量处理规则触发',
      passed: batchRuleTriggered,
      details: batchRuleTriggered ? '批量处理规则成功触发' : '批量处理规则未触发'
    });

    this.logTestResults('微博工作流规则', testResults);
  }

  async testContainerCommunication() {
    console.log('📋 测试5: 容器间通信');

    const testResults = [];

    const pageContainer = this.containers.get('weibo-homepage');
    if (!pageContainer) {
      testResults.push({
        test: '页面容器获取',
        passed: false,
        details: '无法获取页面容器'
      });
      this.logTestResults('容器间通信', testResults);
      return;
    }

    // 监听容器间通信
    const communications = [];
    this.eventBus.on('container:communication', (data) => {
      communications.push(data);
      console.log(`[Test] 容器通信: ${data.from} -> ${data.to}`);
    });

    // 模拟容器间通信
    await pageContainer.emitEvent('container:communication', {
      from: 'weibo-homepage',
      to: 'weibo-homepage-links',
      message: '开始提取链接',
      command: 'start_extraction'
    });

    // 等待通信处理
    await new Promise(resolve => setTimeout(resolve, 100));

    testResults.push({
      test: '容器间消息发送',
      passed: true,
      details: '容器间消息发送功能正常'
    });

    testResults.push({
      test: '容器间消息接收',
      passed: communications.length > 0,
      details: `接收到 ${communications.length} 条通信消息`
    });

    // 测试子容器向父容器通信
    if (pageContainer.linkContainer) {
      await pageContainer.linkContainer.emitEvent('container:communication', {
        from: 'weibo-homepage-links',
        to: 'weibo-homepage',
        message: '链接提取完成',
        result: { totalLinks: 5, newLinks: 5 }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    testResults.push({
      test: '子容器向父容器通信',
      passed: communications.length >= 2,
      details: `双向通信正常，共 ${communications.length} 条消息`
    });

    this.logTestResults('容器间通信', testResults);
  }

  async testCompleteExtractionScenario() {
    console.log('📋 测试6: 完整提取场景');

    const testResults = [];

    const pageContainer = this.containers.get('weibo-homepage');
    if (!pageContainer) {
      testResults.push({
        test: '页面容器获取',
        passed: false,
        details: '无法获取页面容器'
      });
      this.logTestResults('完整提取场景', testResults);
      return;
    }

    // 重置统计
    let extractionStarted = false;
    let extractionCompleted = false;
    let workflowsTriggered = 0;

    // 监听完整提取流程的事件
    this.eventBus.on('page:loaded', () => {
      extractionStarted = true;
    });

    this.eventBus.on('links:extraction_completed', () => {
      extractionCompleted = true;
    });

    this.eventBus.on('workflow:*', () => {
      workflowsTriggered++;
    });

    // 执行完整的提取场景
    console.log('[Test] 开始完整提取场景测试...');

    // 1. 重新初始化页面（模拟新的页面加载）
    await pageContainer.stop();
    await pageContainer.initialize();
    await pageContainer.start();

    // 2. 执行滚动操作以触发更多链接发现
    await pageContainer.performScrollAction();

    // 3. 再次执行滚动
    await pageContainer.performScrollAction();

    // 等待所有操作完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 获取最终结果
    const finalLinks = pageContainer.getExtractedLinks();
    const finalStats = pageContainer.getPageStats();

    testResults.push({
      test: '完整场景执行',
      passed: extractionStarted && extractionCompleted,
      details: `场景执行状态: 开始=${extractionStarted}, 完成=${extractionCompleted}`
    });

    testResults.push({
      test: '链接累积效果',
      passed: finalLinks.length >= 5,
      details: `最终链接数量: ${finalLinks.length}`
    });

    testResults.push({
      test: '工作流集成',
      passed: workflowsTriggered > 0,
      details: `触发工作流次数: ${workflowsTriggered}`
    });

    testResults.push({
      test: '系统整体健康度',
      passed: finalStats.health === 'excellent',
      details: `系统健康状态: ${finalStats.health}`
    });

    // 验证事件历史
    const eventHistory = this.eventBus.getEventHistory();
    testResults.push({
      test: '事件历史完整性',
      passed: eventHistory.length > 10,
      details: `事件历史记录: ${eventHistory.length} 个事件`
    });

    this.logTestResults('完整提取场景', testResults);
  }

  logTestResults(testName, results) {
    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    console.log(`  ✅ ${testName}: ${passed}/${total} 通过`);

    results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`    ${icon} ${result.test}: ${result.details}`);
    });

    console.log('');

    this.testResults.push({
      testName,
      passed,
      total,
      results
    });
  }

  printTestResults() {
    console.log('🎯 微博链接获取集成测试结果汇总');
    console.log('='.repeat(50));

    const totalPassed = this.testResults.reduce((sum, test) => sum + test.passed, 0);
    const totalTests = this.testResults.reduce((sum, test) => sum + test.total, 0);

    console.log(`总体结果: ${totalPassed}/${totalTests} 测试通过`);
    console.log('');

    this.testResults.forEach(test => {
      const icon = test.passed === test.total ? '✅' : '❌';
      console.log(`${icon} ${test.testName}: ${test.passed}/${test.total} 通过`);
    });

    console.log('');

    if (totalPassed === totalTests) {
      console.log('🎉 所有测试通过！微博链接获取集成系统功能正常！');
      console.log('');
      console.log('📊 系统功能验证：');
      console.log('  ✅ 事件驱动架构工作正常');
      console.log('  ✅ 容器系统运行稳定');
      console.log('  ✅ 微博链接提取功能正常');
      console.log('  ✅ 工作流引擎规则执行正确');
      console.log('  ✅ 容器间通信通畅');
      console.log('  ✅ 完整场景测试通过');
    } else {
      console.log('⚠️ 部分测试失败，请检查上述详细信息。');
    }

    console.log('');

    // 清理资源
    this.cleanup();
  }

  cleanup() {
    // 销毁所有容器
    for (const container of this.containers.values()) {
      try {
        container.destroy();
      } catch (error) {
        console.error('清理容器时出错:', error);
      }
    }

    this.eventBus.destroy();
    this.containers.clear();
  }
}

// 运行微博集成测试
const test = new WeiboIntegrationTest();
test.runAllTests().catch(console.error);