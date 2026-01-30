#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 容器消息系统集成测试脚本
 * 验证：
 * 1. 根容器消息和变量配置
 * 2. 多容器发现和状态跟踪
 * 3. 消息驱动的滚动逻辑
 */

import { 
  MessageBusService, 
  ContainerVariableManager,
  TriggerConditionEvaluator,
  ContainerDiscoveryEngine,
  ContainerOperationExecutor,
  ContainerStatusTracker,
  ContainerMessageRegistry,
  RootContainerDriver,
  MSG_CONTAINER_ROOT_VAR_SET,
  MSG_CONTAINER_ROOT_VAR_CHANGED,
  MSG_CONTAINER_ROOT_DISCOVER_COMPLETE,
  MSG_CONTAINER_CHILD_DISCOVERED,
  MSG_CONTAINER_ROOT_SCROLL_START
} from '../libs/operations-framework/src/event-driven/index.js';

// Mock DOM for testing
global.document = {
  querySelectorAll: () => [],
  body: { children: [] },
  documentElement: {
    scrollTop: 0,
    scrollHeight: 2000
  }
};

global.window = {
  innerHeight: 800,
  scrollBy: () => {},
  scrollY: 0,
  addEventListener: () => {}
};

async function runTest() {
  console.log('🧪 开始容器消息系统集成测试...\n');

  // 1. 初始化系统
  console.log('1. 初始化核心组件...');
  const messageBus = new MessageBusService({ historyLimit: 100 });
  await messageBus.start();

  const variableManager = new ContainerVariableManager(messageBus);
  const conditionEvaluator = new TriggerConditionEvaluator(variableManager);
  const discoveryEngine = new ContainerDiscoveryEngine(messageBus);
  const operationExecutor = new ContainerOperationExecutor(discoveryEngine, messageBus);
  const rootDriver = new RootContainerDriver('test_root', messageBus);

  // 2. 测试变量管理
  console.log('\n2. 测试变量管理...');
  variableManager.initRootVariables('test_root', {
    scrollCount: 0,
    totalProducts: 0
  });

  const varChangePromise = new Promise(resolve => {
    messageBus.subscribe(MSG_CONTAINER_ROOT_VAR_CHANGED, (msg) => {
      console.log('   ✓ 收到变量变更消息:', msg.payload);
      resolve(msg);
    });
  });

  await messageBus.publish(MSG_CONTAINER_ROOT_VAR_SET, {
    containerId: 'test_root',
    key: 'scrollCount',
    value: 1
  });

  await varChangePromise;
  const currentVal = variableManager.getVariable('test_root', 'scrollCount', 'root');
  if (currentVal === 1) {
    console.log('   ✓ 变量更新成功');
  } else {
    throw new Error('变量更新失败');
  }

  // 3. 测试条件触发
  console.log('\n3. 测试条件触发...');
  const condition = {
    variable: 'scrollCount',
    scope: 'root',
    operator: 'gt',
    value: 0
  };
  
  const result = await conditionEvaluator.evaluate('test_root', { 
    condition: condition,
    message: 'TEST'
  }, { type: 'TEST', payload: {}, id: '1', timestamp: 0, source: { component: 'test' }, meta: { version: '1' } });
  
  if (result) {
    console.log('   ✓ 条件评估正确 (1 > 0)');
  } else {
    throw new Error('条件评估失败');
  }

  // 4. 测试容器发现
  console.log('\n4. 测试容器发现...');
  
  // Mock querySelectorAll to return fake elements
  discoveryEngine['querySelectorAll'] = () => [
    { tagName: 'DIV', attributes: [] },
    { tagName: 'DIV', attributes: [] }
  ];

  const discoverPromise = new Promise(resolve => {
    messageBus.subscribe(MSG_CONTAINER_ROOT_DISCOVER_COMPLETE, (msg) => {
      console.log('   ✓ 发现完成:', msg.payload.discoveredCount);
      resolve(msg);
    });
  });

  await discoveryEngine.discoverContainers('test_root', 'test_item', '.item');
  await discoverPromise;

  // 5. 测试滚动驱动
  console.log('\n5. 测试滚动驱动...');
  
  const scrollPromise = new Promise(resolve => {
    messageBus.subscribe(MSG_CONTAINER_ROOT_SCROLL_START, (msg) => {
      console.log('   ✓ 滚动开始:', msg.payload);
      resolve(msg);
    });
  });

  // Start driver (will trigger discovery -> execute -> scroll)
  // Mock config
  const config = {
    containerDefinitionId: 'test_item',
    operationId: 'extract_data',
    operation: { id: 'op1', type: 'extract', config: {} },
    maxScrolls: 1,
    scrollDistance: 500,
    scrollInterval: 100,
    bottomThreshold: 100,
    noNewContentThreshold: 3
  };

  rootDriver.start(config);
  
  // Wait for scroll to trigger
  await scrollPromise;
  
  // Cleanup
  await rootDriver.stop();
  await messageBus.stop();

  console.log('\n✨ 所有测试通过！');
}

runTest().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
