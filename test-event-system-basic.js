#!/usr/bin/env node

/**
 * 事件驱动容器系统基础功能测试
 * 测试事件总线和工作流引擎的基本功能
 */

const { EventBus } = require('./sharedmodule/operations-framework/src/event-driven/EventBus');
const { WorkflowEngine } = require('./sharedmodule/operations-framework/src/event-driven/WorkflowEngine');
const { CONTAINER_EVENTS } = require('./sharedmodule/operations-framework/src/event-driven/EventTypes');

class EventSystemTest {
  constructor() {
    this.eventBus = new EventBus({ historyLimit: 100 });
    this.workflowEngine = new WorkflowEngine(this.eventBus);
    this.testResults = [];
  }

  /**
   * 运行所有测试
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 开始事件驱动容器系统基础功能测试...\n');

    try {
      // 测试1: 事件总线基础功能
      await this.testEventBusBasic();

      // 测试2: 事件历史记录
      await this.testEventHistory();

      // 测试3: 事件中间件
      await this.testEventMiddleware();

      // 测试4: 工作流引擎基础功能
      await this.testWorkflowEngineBasic();

      // 测试5: 工作流规则评估
      await this.testWorkflowRules();

      // 测试6: 工作流实例管理
      await this.testWorkflowInstances();

      // 测试7: 事件驱动交互
      await this.testEventDrivenInteraction();

      this.printTestResults();

    } catch (error) {
      console.error('❌ 测试过程中发生错误:', error);
      process.exit(1);
    }
  }

  /**
   * 测试1: 事件总线基础功能
   */
  async testEventBusBasic(): Promise<void> {
    console.log('📋 测试1: 事件总线基础功能');

    const testResults: any[] = [];

    // 测试事件发布和订阅
    const receivedEvents: any[] = [];
    const handler = (data: any) => {
      receivedEvents.push(data);
    };

    this.eventBus.on('test:event', handler);

    await this.eventBus.emit('test:event', { message: 'Hello World', timestamp: Date.now() });

    testResults.push({
      test: '事件发布和订阅',
      passed: receivedEvents.length === 1 && receivedEvents[0].message === 'Hello World',
      details: receivedEvents.length === 1 ? '事件成功发布和接收' : '事件发布或接收失败'
    });

    // 测试一次性事件监听
    let onceReceived = 0;
    const onceHandler = () => {
      onceReceived++;
    };

    this.eventBus.once('test:once', onceHandler);

    await this.eventBus.emit('test:once', {});
    await this.eventBus.emit('test:once', {});

    testResults.push({
      test: '一次性事件监听',
      passed: onceReceived === 1,
      details: `期望1次，实际${onceReceived}次`
    });

    // 测试事件移除
    this.eventBus.off('test:event', handler);

    await this.eventBus.emit('test:event', { message: 'Should not be received' });

    testResults.push({
      test: '事件监听器移除',
      passed: receivedEvents.length === 1, // 仍然是1，没有增加
      details: '事件监听器成功移除'
    });

    this.logTestResults('事件总线基础功能', testResults);
  }

  /**
   * 测试2: 事件历史记录
   */
  async testEventHistory(): Promise<void> {
    console.log('📋 测试2: 事件历史记录');

    const testResults: any[] = [];

    // 清空历史记录
    this.eventBus.clearHistory();

    // 发布一些测试事件
    await this.eventBus.emit('test:history1', { data: 'event1' });
    await this.eventBus.emit('test:history2', { data: 'event2' });
    await this.eventBus.emit('test:history1', { data: 'event3' });

    const allHistory = this.eventBus.getEventHistory();
    const filteredHistory = this.eventBus.getEventHistory('test:history1');

    testResults.push({
      test: '事件历史记录总数',
      passed: allHistory.length === 3,
      details: `期望3个事件，实际${allHistory.length}个`
    });

    testResults.push({
      test: '事件历史记录过滤',
      passed: filteredHistory.length === 2,
      details: `期望2个事件，实际${filteredHistory.length}个`
    });

    // 测试事件统计
    const stats = this.eventBus.getEventStats();
    testResults.push({
      test: '事件统计',
      passed: stats['test:history1'] === 2 && stats['test:history2'] === 1,
      details: `统计信息正确: ${JSON.stringify(stats)}`
    });

    this.logTestResults('事件历史记录', testResults);
  }

  /**
   * 测试3: 事件中间件
   */
  async testEventMiddleware(): Promise<void> {
    console.log('📋 测试3: 事件中间件');

    const testResults: any[] = [];

    // 注册中间件
    let middlewareCalled = false;
    this.eventBus.use(async (event: string, data: any, next: Function) => {
      middlewareCalled = true;
      data.middlewareProcessed = true;
      await next();
    });

    // 发布事件测试中间件
    const receivedData: any[] = [];
    this.eventBus.on('test:middleware', (data) => {
      receivedData.push(data);
    });

    await this.eventBus.emit('test:middleware', { original: 'data' });

    testResults.push({
      test: '中间件执行',
      passed: middlewareCalled,
      details: '中间件成功执行'
    });

    testResults.push({
      test: '中间件数据修改',
      passed: receivedData.length === 1 && receivedData[0].middlewareProcessed,
      details: '中间件成功修改事件数据'
    });

    this.logTestResults('事件中间件', testResults);
  }

  /**
   * 测试4: 工作流引擎基础功能
   */
  async testWorkflowEngineBasic(): Promise<void> {
    console.log('📋 测试4: 工作流引擎基础功能');

    const testResults: any[] = [];

    // 启动工作流引擎
    this.workflowEngine.start();

    testResults.push({
      test: '工作流引擎启动',
      passed: true, // 如果没有抛出异常就算成功
      details: '工作流引擎成功启动'
    });

    // 添加测试规则
    const testRule = {
      id: 'test-rule-1',
      name: '测试规则',
      description: '用于测试的规则',
      when: 'test:workflow:event' as const,
      then: async (data: any) => {
        console.log('规则执行:', data);
      }
    };

    this.workflowEngine.addRule(testRule);

    testResults.push({
      test: '工作流规则添加',
      passed: true,
      details: '工作流规则成功添加'
    });

    // 测试规则触发
    let ruleTriggered = false;
    const triggeredRule = {
      id: 'test-rule-trigger',
      name: '触发测试规则',
      description: '测试规则触发',
      when: 'test:trigger:event' as const,
      then: async (data: any) => {
        ruleTriggered = true;
      }
    };

    this.workflowEngine.addRule(triggeredRule);
    await this.eventBus.emit('test:trigger:event', { test: true });

    // 等待异步处理
    await new Promise(resolve => setTimeout(resolve, 100));

    testResults.push({
      test: '工作流规则触发',
      passed: ruleTriggered,
      details: '工作流规则成功触发执行'
    });

    // 停止工作流引擎
    this.workflowEngine.stop();

    this.logTestResults('工作流引擎基础功能', testResults);
  }

  /**
   * 测试5: 工作流规则评估
   */
  async testWorkflowRules(): Promise<void> {
    console.log('📋 测试5: 工作流规则评估');

    const testResults: any[] = [];

    // 测试条件规则
    let conditionalRuleExecuted = false;
    const conditionalRule = {
      id: 'test-conditional-rule',
      name: '条件测试规则',
      description: '测试条件评估',
      when: 'test:conditional:event' as const,
      condition: (data: any) => data.shouldExecute === true,
      then: async (data: any) => {
        conditionalRuleExecuted = true;
      }
    };

    this.workflowEngine.addRule(conditionalRule);

    // 测试条件满足的情况
    await this.eventBus.emit('test:conditional:event', { shouldExecute: true });
    await new Promise(resolve => setTimeout(resolve, 50));

    testResults.push({
      test: '条件满足时规则执行',
      passed: conditionalRuleExecuted,
      details: '条件满足时规则成功执行'
    });

    // 重置状态
    conditionalRuleExecuted = false;

    // 测试条件不满足的情况
    await this.eventBus.emit('test:conditional:event', { shouldExecute: false });
    await new Promise(resolve => setTimeout(resolve, 50));

    testResults.push({
      test: '条件不满足时规则不执行',
      passed: !conditionalRuleExecuted,
      details: '条件不满足时规则未执行'
    });

    // 测试规则评估历史
    const evaluations = this.workflowEngine.getRuleEvaluations();
    testResults.push({
      test: '规则评估历史记录',
      passed: evaluations.length >= 2,
      details: `期望至少2条评估记录，实际${evaluations.length}条`
    });

    this.logTestResults('工作流规则评估', testResults);
  }

  /**
   * 测试6: 工作流实例管理
   */
  async testWorkflowInstances(): Promise<void> {
    console.log('📋 测试6: 工作流实例管理');

    const testResults: any[] = [];

    // 创建工作流实例
    const tasks = [
      {
        id: 'task1',
        name: '测试任务1',
        type: 'system' as const,
        target: 'system',
        action: 'log',
        parameters: { message: 'Hello from task1' },
        priority: 1
      },
      {
        id: 'task2',
        name: '测试任务2',
        type: 'system' as const,
        target: 'system',
        action: 'delay',
        parameters: { delay: 100 },
        priority: 2
      }
    ];

    const workflow = this.workflowEngine.createWorkflow('测试工作流', tasks);

    testResults.push({
      test: '工作流实例创建',
      passed: workflow !== undefined && workflow.tasks.length === 2,
      details: '工作流实例成功创建'
    });

    // 启动工作流
    await this.workflowEngine.startWorkflow(workflow.id);

    testResults.push({
      test: '工作流启动',
      passed: workflow.status === 'running',
      details: '工作流成功启动'
    });

    // 等待工作流完成
    await new Promise(resolve => setTimeout(resolve, 500));

    const updatedWorkflow = this.workflowEngine.getWorkflow(workflow.id);
    testResults.push({
      test: '工作流状态更新',
      passed: updatedWorkflow?.status === 'completed',
      details: `工作流状态: ${updatedWorkflow?.status}`
    });

    // 测试工作流查询
    const workflows = this.workflowEngine.getWorkflows({ status: 'completed' });
    testResults.push({
      test: '工作流查询',
      passed: workflows.length > 0,
      details: `找到${workflows.length}个已完成的工作流`
    });

    this.logTestResults('工作流实例管理', testResults);
  }

  /**
   * 测试7: 事件驱动交互
   */
  async testEventDrivenInteraction(): Promise<void> {
    console.log('📋 测试7: 事件驱动交互');

    const testResults: any[] = [];

    // 创建一个完整的事件驱动场景
    let sequence: string[] = [];

    // 设置事件监听器链
    this.eventBus.on('sequence:start', async (data) => {
      sequence.push('start');
      await this.eventBus.emit('sequence:middle', { ...data, step: 'middle' });
    });

    this.eventBus.on('sequence:middle', async (data) => {
      sequence.push('middle');
      await this.eventBus.emit('sequence:end', { ...data, step: 'end' });
    });

    this.eventBus.on('sequence:end', (data) => {
      sequence.push('end');
    });

    // 设置工作流规则
    const workflowRule = {
      id: 'sequence-rule',
      name: '序列规则',
      description: '测试事件序列',
      when: ['sequence:middle', 'sequence:end'] as const,
      then: async (data) => {
        // 不做任何事，只是验证规则能被触发
      }
    };

    this.workflowEngine.addRule(workflowRule);

    // 启动序列
    await this.eventBus.emit('sequence:start', { initiator: 'test' });

    // 等待异步处理完成
    await new Promise(resolve => setTimeout(resolve, 200));

    testResults.push({
      test: '事件序列执行',
      passed: sequence.join(',') === 'start,middle,end',
      details: `事件序列: ${sequence.join(',')}`
    });

    // 验证工作流规则被触发
    const evaluations = this.workflowEngine.getRuleEvaluations();
    const ruleTriggered = evaluations.filter(e => e.ruleId === 'sequence-rule').length >= 2;

    testResults.push({
      test: '工作流规则在事件序列中触发',
      passed: ruleTriggered,
      details: `规则被触发${evaluations.filter(e => e.ruleId === 'sequence-rule').length}次`
    });

    this.logTestResults('事件驱动交互', testResults);
  }

  /**
   * 记录测试结果
   */
  private logTestResults(testName: string, results: any[]): void {
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

  /**
   * 打印测试结果汇总
   */
  private printTestResults(): void {
    console.log('🎯 测试结果汇总');
    console.log('=' .repeat(50));

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
      console.log('🎉 所有测试通过！事件驱动容器系统基础功能正常！');
    } else {
      console.log('⚠️  部分测试失败，请检查上述详细信息。');
    }

    console.log('');

    // 清理资源
    this.cleanup();
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.eventBus.destroy();
    this.workflowEngine.destroy();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const test = new EventSystemTest();
  test.runAllTests().catch(console.error);
}

export { EventSystemTest };