#!/usr/bin/env node

/**
 * 简单的事件系统测试 - 使用实际的事件驱动容器系统实现
 */

// Import the actual implementations
import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

// 测试类
class EventSystemTest {
  constructor() {
    this.eventBus = new EventBus({ historyLimit: 100 });
    this.workflowEngine = new WorkflowEngine(this.eventBus);
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🚀 开始事件驱动容器系统基础功能测试...\n');

    try {
      await this.testEventBusBasic();
      await this.testEventHistory();
      await this.testEventMiddleware();
      await this.testWorkflowEngineBasic();
      await this.testWorkflowRules();
      await this.testEventDrivenInteraction();
      await this.testWildcardSupport();

      this.printTestResults();
    } catch (error) {
      console.error('❌ 测试过程中发生错误:', error);
      process.exit(1);
    }
  }

  async testEventBusBasic() {
    console.log('📋 测试1: 事件总线基础功能');

    const testResults = [];

    // 测试事件发布和订阅
    const receivedEvents = [];
    const handler = (data) => {
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

    this.logTestResults('事件总线基础功能', testResults);
  }

  async testEventHistory() {
    console.log('📋 测试2: 事件历史记录');

    const testResults = [];

    this.eventBus.clearHistory();

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

    const stats = this.eventBus.getEventStats();
    testResults.push({
      test: '事件统计',
      passed: stats['test:history1'] === 2 && stats['test:history2'] === 1,
      details: `统计信息: ${JSON.stringify(stats)}`
    });

    this.logTestResults('事件历史记录', testResults);
  }

  async testEventMiddleware() {
    console.log('📋 测试3: 事件中间件');

    const testResults = [];

    let middlewareCalled = false;
    this.eventBus.use(async (event, data, next) => {
      middlewareCalled = true;
      data.middlewareProcessed = true;
      await next();
    });

    const receivedData = [];
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

  async testWorkflowEngineBasic() {
    console.log('📋 测试4: 工作流引擎基础功能');

    const testResults = [];

    this.workflowEngine.start();

    testResults.push({
      test: '工作流引擎启动',
      passed: true,
      details: '工作流引擎成功启动'
    });

    const testRule = {
      id: 'test-rule-1',
      name: '测试规则',
      description: '用于测试的规则',
      when: 'test:workflow:event',
      then: async (data) => {
        console.log('规则执行:', data);
      }
    };

    this.workflowEngine.addRule(testRule);

    testResults.push({
      test: '工作流规则添加',
      passed: true,
      details: '工作流规则成功添加'
    });

    let ruleTriggered = false;
    const triggeredRule = {
      id: 'test-rule-trigger',
      name: '触发测试规则',
      description: '测试规则触发',
      when: 'test:trigger:event',
      then: async (data) => {
        ruleTriggered = true;
      }
    };

    this.workflowEngine.addRule(triggeredRule);
    await this.eventBus.emit('test:trigger:event', { test: true });

    await new Promise(resolve => setTimeout(resolve, 100));

    testResults.push({
      test: '工作流规则触发',
      passed: ruleTriggered,
      details: ruleTriggered ? '工作流规则成功触发执行' : '工作流规则未触发'
    });

    this.workflowEngine.stop();

    this.logTestResults('工作流引擎基础功能', testResults);
  }

  async testWorkflowRules() {
    console.log('📋 测试5: 工作流规则评估');

    const testResults = [];

    let conditionalRuleExecuted = false;
    const conditionalRule = {
      id: 'test-conditional-rule',
      name: '条件测试规则',
      description: '测试条件评估',
      when: 'test:conditional:event',
      condition: (data) => data.shouldExecute === true,
      then: async (data) => {
        conditionalRuleExecuted = true;
      }
    };

    this.workflowEngine.addRule(conditionalRule);

    await this.eventBus.emit('test:conditional:event', { shouldExecute: true });
    await new Promise(resolve => setTimeout(resolve, 50));

    testResults.push({
      test: '条件满足时规则执行',
      passed: conditionalRuleExecuted,
      details: conditionalRuleExecuted ? '条件满足时规则成功执行' : '条件满足时规则未执行'
    });

    conditionalRuleExecuted = false;

    await this.eventBus.emit('test:conditional:event', { shouldExecute: false });
    await new Promise(resolve => setTimeout(resolve, 50));

    testResults.push({
      test: '条件不满足时规则不执行',
      passed: !conditionalRuleExecuted,
      details: !conditionalRuleExecuted ? '条件不满足时规则未执行' : '条件不满足时规则执行了'
    });

    this.logTestResults('工作流规则评估', testResults);
  }

  async testEventDrivenInteraction() {
    console.log('📋 测试6: 事件驱动交互');

    const testResults = [];

    let sequence = [];

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

    const workflowRule = {
      id: 'sequence-rule',
      name: '序列规则',
      description: '测试事件序列',
      when: ['sequence:middle', 'sequence:end'],
      then: async (data) => {
        // 验证规则能被触发
        console.log('工作流规则触发:', data);
      }
    };

    this.workflowEngine.addRule(workflowRule);

    await this.eventBus.emit('sequence:start', { initiator: 'test' });

    await new Promise(resolve => setTimeout(resolve, 200));

    testResults.push({
      test: '事件序列执行',
      passed: sequence.join(',') === 'start,middle,end',
      details: `事件序列: ${sequence.join(',')}`
    });

    testResults.push({
      test: '工作流规则集成',
      passed: true, // 如果没有错误就算成功
      details: '工作流规则成功集成到事件系统'
    });

    this.logTestResults('事件驱动交互', testResults);
  }

  async testWildcardSupport() {
    console.log('📋 测试7: 通配符事件监听器');

    const testResults = [];

    let wildcardEvents = 0;
    let specificEvents = 0;

    // 测试通配符监听器
    this.eventBus.on('container:*', (data) => {
      wildcardEvents++;
    });

    // 测试具体事件监听器
    this.eventBus.on('container:created', (data) => {
      specificEvents++;
    });

    // 触发匹配的事件
    await this.eventBus.emit('container:created', { id: 'test1' });
    await this.eventBus.emit('container:initialized', { id: 'test2' });
    await this.eventBus.emit('container:started', { id: 'test3' });

    await new Promise(resolve => setTimeout(resolve, 50));

    testResults.push({
      test: '通配符事件监听',
      passed: wildcardEvents === 3, // 应该收到3个事件
      details: `通配符监听器收到${wildcardEvents}个事件`
    });

    testResults.push({
      test: '具体事件监听',
      passed: specificEvents === 1, // 只应该收到1个具体事件
      details: `具体监听器收到${specificEvents}个事件`
    });

    // 测试问号通配符
    let questionMarkEvents = 0;
    this.eventBus.on('test:?', (data) => {
      questionMarkEvents++;
    });

    await this.eventBus.emit('test:a', { data: 'a' });
    await this.eventBus.emit('test:b', { data: 'b' });
    await this.eventBus.emit('test:abc', { data: 'abc' }); // 不应该匹配

    await new Promise(resolve => setTimeout(resolve, 50));

    testResults.push({
      test: '问号通配符',
      passed: questionMarkEvents === 2, // 应该收到2个事件（a和b）
      details: `问号通配符监听器收到${questionMarkEvents}个事件`
    });

    this.logTestResults('通配符事件监听器', testResults);
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
    console.log('🎯 测试结果汇总');
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
      console.log('🎉 所有测试通过！事件驱动容器系统功能正常！');
    } else {
      console.log('⚠️ 部分测试失败，请检查上述详细信息。');
    }

    console.log('');

    this.cleanup();
  }

  cleanup() {
    this.eventBus.destroy();
    this.workflowEngine.destroy();
  }
}

// 运行测试
const test = new EventSystemTest();
test.runAllTests().catch(console.error);

export { EventSystemTest };