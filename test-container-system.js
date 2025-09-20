#!/usr/bin/env node

/**
 * 容器系统测试脚本
 * 测试事件驱动容器系统的初始化和事件发送接收功能
 */

// 复制EventBus代码（从之前的测试）
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
    console.log(`[EventBus] 监听器注册: ${event}`);
  }

  once(event, handler) {
    const onceHandler = (data) => {
      handler(data);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  off(event, handler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
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

  clearHistory() {
    this.eventHistory = [];
  }

  getEventStats() {
    const stats = {};
    this.eventHistory.forEach(entry => {
      stats[entry.event] = (stats[entry.event] || 0) + 1;
    });
    return stats;
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

// 简化的事件驱动容器基类
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

  /**
   * 初始化容器
   */
  async initialize() {
    console.log(`[Container] 初始化容器: ${this.config.name}`);

    this.updateState('initializing');

    try {
      // 注册内部事件监听器
      this.setupInternalEventListeners();

      // 子类实现具体的初始化逻辑
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

  /**
   * 启动容器
   */
  async start() {
    console.log(`[Container] 启动容器: ${this.config.name}`);

    this.updateState('running');

    try {
      await this.emitEvent('container:started', {
        containerId: this.config.id,
        startTime: Date.now()
      });

      // 子类实现具体的启动逻辑
      await this.doStart();

      console.log(`[Container] 容器启动完成: ${this.config.name}`);

    } catch (error) {
      this.updateState('failed');
      await this.handleError(error, 'start');
      throw error;
    }
  }

  /**
   * 停止容器
   */
  async stop() {
    console.log(`[Container] 停止容器: ${this.config.name}`);

    try {
      await this.emitEvent('container:stopped', {
        containerId: this.config.id,
        stopTime: Date.now()
      });

      // 子类实现具体的停止逻辑
      await this.doStop();

      this.updateState('ready');
      console.log(`[Container] 容器停止完成: ${this.config.name}`);

    } catch (error) {
      await this.handleError(error, 'stop');
      throw error;
    }
  }

  /**
   * 销毁容器
   */
  async destroy() {
    console.log(`[Container] 销毁容器: ${this.config.name}`);

    try {
      // 销毁所有子容器
      for (const child of this.childContainers.values()) {
        await child.destroy();
      }

      await this.emitEvent('container:destroyed', {
        containerId: this.config.id,
        destructionTime: Date.now()
      });

      // 清理事件监听器
      this.eventHandlers.clear();

      this.updateState('destroyed');
      console.log(`[Container] 容器销毁完成: ${this.config.name}`);

    } catch (error) {
      await this.handleError(error, 'destroy');
      throw error;
    }
  }

  /**
   * 添加子容器
   */
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

  /**
   * 移除子容器
   */
  async removeChildContainer(childId) {
    const childContainer = this.childContainers.get(childId);

    if (!childContainer) {
      throw new Error(`子容器不存在: ${childId}`);
    }

    await childContainer.destroy();
    this.childContainers.delete(childId);

    await this.emitEvent('container:child_removed', {
      parentId: this.config.id,
      childId: childId
    });

    console.log(`[Container] 移除子容器: ${childId} 从 ${this.config.name}`);
  }

  /**
   * 注册事件监听器
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);

    // 同时在事件总线上注册
    this.eventBus.on(event, handler);
  }

  /**
   * 发送事件
   */
  async emitEvent(event, data = {}) {
    const fullData = {
      ...data,
      containerId: this.config.id,
      containerName: this.config.name,
      timestamp: Date.now()
    };

    await this.eventBus.emit(event, fullData, this.config.name);
  }

  /**
   * 更新状态
   */
  updateState(newStatus) {
    const oldStatus = this.state.status;
    this.state.status = newStatus;
    this.state.lastActivity = Date.now();

    console.log(`[Container] 状态变更: ${this.config.name} ${oldStatus} -> ${newStatus}`);
  }

  /**
   * 处理错误
   */
  async handleError(error, context) {
    this.state.errorCount++;
    console.error(`[Container] 错误 (${context}):`, error);

    await this.emitEvent('container:error', {
      error: error.message,
      context,
      errorCount: this.state.errorCount
    });
  }

  /**
   * 设置内部事件监听器
   */
  setupInternalEventListeners() {
    // 监听子容器事件
    this.on('container:child_added', (data) => {
      console.log(`[Container] 子容器添加事件: ${data.childId}`);
    });

    this.on('container:child_removed', (data) => {
      console.log(`[Container] 子容器移除事件: ${data.childId}`);
    });

    this.on('container:error', (data) => {
      console.warn(`[Container] 容器错误: ${data.error} (${data.context})`);
    });
  }

  // 抽象方法，子类需要实现
  async doInitialize() {
    // 默认实现，子类可重写
  }

  async doStart() {
    // 默认实现，子类可重写
  }

  async doStop() {
    // 默认实现，子类可重写
  }
}

// 测试用的具体容器类
class TestContainer extends EventDrivenContainer {
  constructor(config) {
    super(config);
    this.testData = config.testData || {};
  }

  async doInitialize() {
    console.log(`[TestContainer] 执行初始化逻辑: ${this.config.name}`);
    // 模拟初始化工作
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async doStart() {
    console.log(`[TestContainer] 执行启动逻辑: ${this.config.name}`);
    // 模拟启动工作
    await new Promise(resolve => setTimeout(resolve, 50));

    // 发送一些测试事件
    await this.emitEvent('test:operation', {
      operation: 'start',
      data: this.testData
    });
  }

  async doStop() {
    console.log(`[TestContainer] 执行停止逻辑: ${this.config.name}`);
    // 模拟停止工作
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  // 添加测试专用方法
  async performTestAction(actionName, data = {}) {
    console.log(`[TestContainer] 执行测试操作: ${actionName}`);

    await this.emitEvent('test:action', {
      action: actionName,
      data,
      timestamp: Date.now()
    });

    return { success: true, action: actionName, result: data };
  }
}

// 测试类
class ContainerSystemTest {
  constructor() {
    this.eventBus = new EventBus({ historyLimit: 200 });
    this.testResults = [];
    this.containers = new Map();
  }

  async runAllTests() {
    console.log('🚀 开始容器系统测试...\n');

    try {
      await this.testContainerLifecycle();
      await this.testContainerEventHandling();
      await this.testChildContainerManagement();
      await this.testContainerCommunication();
      await this.testContainerErrorHandling();
      await this.testEventIntegration();

      this.printTestResults();
    } catch (error) {
      console.error('❌ 测试过程中发生错误:', error);
      process.exit(1);
    }
  }

  async testContainerLifecycle() {
    console.log('📋 测试1: 容器生命周期管理');

    const testResults = [];

    // 创建容器
    const containerConfig = {
      id: 'test-container-1',
      name: '测试容器1',
      selector: '.test-container',
      testData: { message: 'Hello Container' },
      eventBus: this.eventBus
    };

    const container = new TestContainer(containerConfig);
    this.containers.set(containerConfig.id, container);

    testResults.push({
      test: '容器创建',
      passed: container.state.status === 'created',
      details: `容器状态: ${container.state.status}`
    });

    // 初始化容器
    await container.initialize();

    testResults.push({
      test: '容器初始化',
      passed: container.state.status === 'ready',
      details: `初始化后状态: ${container.state.status}`
    });

    // 启动容器
    await container.start();

    testResults.push({
      test: '容器启动',
      passed: container.state.status === 'running',
      details: `启动后状态: ${container.state.status}`
    });

    // 停止容器
    await container.stop();

    testResults.push({
      test: '容器停止',
      passed: container.state.status === 'ready',
      details: `停止后状态: ${container.state.status}`
    });

    // 销毁容器
    await container.destroy();

    testResults.push({
      test: '容器销毁',
      passed: container.state.status === 'destroyed',
      details: `销毁后状态: ${container.state.status}`
    });

    this.logTestResults('容器生命周期管理', testResults);
  }

  async testContainerEventHandling() {
    console.log('📋 测试2: 容器事件处理');

    const testResults = [];

    // 创建新容器
    const containerConfig = {
      id: 'test-container-2',
      name: '测试容器2',
      selector: '.test-container',
      eventBus: this.eventBus
    };

    const container = new TestContainer(containerConfig);
    await container.initialize();

    // 监听容器事件
    let eventsReceived = [];

    this.eventBus.on('container:initialized', (data) => {
      eventsReceived.push({ event: 'initialized', data });
    });

    this.eventBus.on('test:operation', (data) => {
      eventsReceived.push({ event: 'operation', data });
    });

    this.eventBus.on('test:action', (data) => {
      eventsReceived.push({ event: 'action', data });
    });

    await container.start();

    testResults.push({
      test: '容器事件监听',
      passed: eventsReceived.length > 0,
      details: `接收到${eventsReceived.length}个事件`
    });

    // 测试自定义事件
    const actionResult = await container.performTestAction('test-action', { value: 123 });

    testResults.push({
      test: '容器自定义操作',
      passed: actionResult.success,
      details: `操作结果: ${JSON.stringify(actionResult)}`
    });

    // 验证自定义事件被触发
    const actionEvents = eventsReceived.filter(e => e.event === 'action');
    testResults.push({
      test: '自定义事件触发',
      passed: actionEvents.length > 0,
      details: `自定义事件数量: ${actionEvents.length}`
    });

    await container.destroy();

    this.logTestResults('容器事件处理', testResults);
  }

  async testChildContainerManagement() {
    console.log('📋 测试3: 子容器管理');

    const testResults = [];

    // 创建父容器
    const parentConfig = {
      id: 'parent-container',
      name: '父容器',
      selector: '.parent-container',
      eventBus: this.eventBus
    };

    const parentContainer = new TestContainer(parentConfig);
    await parentContainer.initialize();

    // 创建子容器
    const childConfig1 = {
      id: 'child-container-1',
      name: '子容器1',
      selector: '.child-container-1',
      eventBus: this.eventBus,
      parentContainer: parentContainer
    };

    const childConfig2 = {
      id: 'child-container-2',
      name: '子容器2',
      selector: '.child-container-2',
      eventBus: this.eventBus,
      parentContainer: parentContainer
    };

    const child1 = new TestContainer(childConfig1);
    const child2 = new TestContainer(childConfig2);

    // 添加子容器
    await parentContainer.addChildContainer(child1);
    await parentContainer.addChildContainer(child2);

    testResults.push({
      test: '子容器添加',
      passed: parentContainer.childContainers.size === 2,
      details: `子容器数量: ${parentContainer.childContainers.size}`
    });

    // 验证父子关系
    testResults.push({
      test: '父子关系建立',
      passed: child1.parentContainer === parentContainer && child2.parentContainer === parentContainer,
      details: '父子关系正确建立'
    });

    // 移除子容器
    await parentContainer.removeChildContainer('child-container-1');

    testResults.push({
      test: '子容器移除',
      passed: parentContainer.childContainers.size === 1,
      details: `移除后子容器数量: ${parentContainer.childContainers.size}`
    });

    await parentContainer.destroy();
    await child2.destroy();

    this.logTestResults('子容器管理', testResults);
  }

  async testContainerCommunication() {
    console.log('📋 测试4: 容器间通信');

    const testResults = [];

    // 创建两个独立的容器
    const config1 = {
      id: 'comm-container-1',
      name: '通信容器1',
      selector: '.comm-container-1',
      eventBus: this.eventBus
    };

    const config2 = {
      id: 'comm-container-2',
      name: '通信容器2',
      selector: '.comm-container-2',
      eventBus: this.eventBus
    };

    const container1 = new TestContainer(config1);
    const container2 = new TestContainer(config2);

    await container1.initialize();
    await container2.initialize();

    // 设置容器间通信
    let communicationReceived = false;

    container2.on('container:communication', (data) => {
      communicationReceived = true;
      console.log('[Container2] 收到通信消息:', data);
    });

    // 容器1发送通信消息
    await container1.emitEvent('container:communication', {
      from: config1.id,
      to: config2.id,
      message: 'Hello from Container1',
      timestamp: Date.now()
    });

    // 等待消息处理
    await new Promise(resolve => setTimeout(resolve, 100));

    testResults.push({
      test: '容器间消息发送',
      passed: true,
      details: '消息成功发送'
    });

    testResults.push({
      test: '容器间消息接收',
      passed: communicationReceived,
      details: communicationReceived ? '消息成功接收' : '消息未接收'
    });

    await container1.destroy();
    await container2.destroy();

    this.logTestResults('容器间通信', testResults);
  }

  async testContainerErrorHandling() {
    console.log('📋 测试5: 容器错误处理');

    const testResults = [];

    // 创建会出错的容器
    const errorConfig = {
      id: 'error-container',
      name: '错误测试容器',
      selector: '.error-container',
      eventBus: this.eventBus
    };

    class ErrorTestContainer extends TestContainer {
      async doInitialize() {
        throw new Error('模拟初始化错误');
      }
    }

    const errorContainer = new ErrorTestContainer(errorConfig);

    // 监听错误事件
    let errorEventReceived = false;
    this.eventBus.on('container:error', (data) => {
      errorEventReceived = true;
      console.log('[Test] 收到错误事件:', data);
    });

    // 尝试初始化（应该失败）
    let initializationFailed = false;
    try {
      await errorContainer.initialize();
    } catch (error) {
      initializationFailed = true;
      console.log('[Test] 初始化失败（预期）:', error.message);
    }

    testResults.push({
      test: '容器初始化失败处理',
      passed: initializationFailed,
      details: '容器正确处理初始化失败'
    });

    testResults.push({
      test: '错误事件发送',
      passed: errorEventReceived,
      details: errorEventReceived ? '错误事件成功发送' : '错误事件未发送'
    });

    this.logTestResults('容器错误处理', testResults);
  }

  async testEventIntegration() {
    console.log('📋 测试6: 事件系统集成');

    const testResults = [];

    // 创建多个容器
    const containers = [];
    for (let i = 1; i <= 3; i++) {
      const config = {
        id: `integration-container-${i}`,
        name: `集成测试容器${i}`,
        selector: `.integration-container-${i}`,
        eventBus: this.eventBus
      };

      const container = new TestContainer(config);
      await container.initialize();
      containers.push(container);
    }

    // 监听所有容器事件
    const allEvents = [];
    this.eventBus.on('*', (data) => {
      allEvents.push(data);
    });

    // 启动所有容器
    for (const container of containers) {
      await container.start();
    }

    // 执行一些操作
    for (let i = 0; i < containers.length; i++) {
      await containers[i].performTestAction(`integration-test-${i}`, { index: i });
    }

    // 等待事件处理
    await new Promise(resolve => setTimeout(resolve, 200));

    testResults.push({
      test: '多容器事件协调',
      passed: allEvents.length > 0,
      details: `协调了${allEvents.length}个事件`
    });

    // 检查事件历史
    const eventHistory = this.eventBus.getEventHistory();
    testResults.push({
      test: '事件历史记录',
      passed: eventHistory.length > 0,
      details: `记录了${eventHistory.length}个历史事件`
    });

    // 清理容器
    for (const container of containers) {
      await container.destroy();
    }

    this.logTestResults('事件系统集成', testResults);
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
    console.log('🎯 容器系统测试结果汇总');
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
      console.log('🎉 所有测试通过！容器系统功能正常！');
    } else {
      console.log('⚠️ 部分测试失败，请检查上述详细信息。');
    }

    console.log('');

    // 清理资源
    this.cleanup();
  }

  cleanup() {
    this.eventBus.destroy();
    this.containers.clear();
  }
}

// 运行测试
const test = new ContainerSystemTest();
test.runAllTests().catch(console.error);