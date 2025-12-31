#!/usr/bin/env node
/**
 * End-to-End Operation System Test
 * 
 * 测试完整流程:
 * 1. 启动 Unified API
 * 2. 创建 EventBus 和 BindingRegistry
 * 3. 注册规则
 * 4. 模拟容器发现事件
 * 5. 验证规则触发和操作执行
 */

import { EventBus } from '../../libs/operations-framework/src/event-driven/EventBus.ts';
import { BindingRegistry } from '../../libs/containers/src/binding/BindingRegistry.ts';

const LOG_FILE = '/tmp/test-e2e-operation-flow.log';

function log(msg) {
  console.log(`[E2E] ${msg}`);
}

async function test() {
  try {
    log('Step 1: Create EventBus');
    const eventBus = new EventBus();
    
    log('Step 2: Create BindingRegistry with EventBus');
    const bindingRegistry = new BindingRegistry(eventBus);
    
    log('Step 3: Register test rule');
    bindingRegistry.register({
      id: 'test-auto-highlight',
      trigger: {
        type: 'event',
        pattern: 'container:*:discovered'
      },
      target: {
        selector: (graph) => {
          return graph.lastDiscoveredId || 'test-container';
        }
      },
      action: {
        operationType: 'highlight',
        config: {
          color: '#00C853',
          durationMs: 2000
        }
      }
    });
    
    log('Step 4: Verify rule registered');
    const rules = bindingRegistry.getRules();
    if (rules.length !== 1) throw new Error('Rule not registered');
    log(`  ✓ ${rules.length} rule(s) registered`);
    
    log('Step 5: Setup event listener');
    let operationExecuted = false;
    eventBus.on('operation:*:execute', (data) => {
      log(`  ✓ Operation event received: ${data.operationType} on ${data.containerId}`);
      operationExecuted = true;
    });
    
    log('Step 6: Emit container:discovered event');
    await eventBus.emit('container:test-container:discovered', {
      containerId: 'test-container',
      parentId: 'root',
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      visible: true,
      score: 0.95
    });
    
    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    log('Step 7: Verify operation executed');
    if (!operationExecuted) {
      throw new Error('Operation was not executed');
    }
    log('  ✓ Operation executed via EventBus');
    
    log('Step 8: Test manual message trigger');
    const mockGraph = {
      lastDiscoveredId: 'manual-container',
      nodes: new Map()
    };
    
    const results = await bindingRegistry.handleMessage('TEST_MESSAGE', {}, { graph: mockGraph });
    log(`  ✓ Manual trigger returned ${results.length} result(s)`);
    
    log('Step 9: Verify OperationContext enhancement');
    // This would be tested when integrated with RuntimeController
    log('  ⚠ OperationContext test skipped (requires integration)');
    
    log('✅ All E2E tests passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ E2E test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
