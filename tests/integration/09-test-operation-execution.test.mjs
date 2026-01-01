#!/usr/bin/env node
/**
 * Operation Execution Integration Test
 * 
 * Tests operation execution through OperationExecutor
 */

import assert from 'node:assert/strict';
import { ensureBuiltinOperations } from '../../modules/operations/src/builtin.js';
import { OperationExecutor } from '../../libs/containers/src/engine/OperationExecutor.js';

function log(msg) {
  console.log(`[operation-execution-test] ${msg}`);
}

async function test() {
  try {
    log('Step 1: Initialize builtin operations');
    ensureBuiltinOperations();
    
    log('Step 2: Create OperationExecutor');
    const executor = new OperationExecutor(
      (sessionId) => ({
        evaluate: async (fn, ...args) => fn(...args)
      })
    );
    
    log('Step 3: Test highlight operation');
    const context = await executor.createContext('test-container', { sessionId: 'test' });
    assert.ok(context.page);
    assert.ok(context.page.evaluate);
    assert.ok(context.systemInput);
    assert.ok(context.systemInput.mouseMove);
    assert.ok(context.systemInput.mouseClick);
    log('  ✓ Context created successfully');
    
    log('Step 4: Execute highlight operation');
    const highlightResult = await executor.execute(
      'test-container',
      'highlight',
      { selector: '#test', duration: 100 },
      { sessionId: 'test' }
    );
    log(`  Highlight result: ${JSON.stringify(highlightResult)}`);
    assert.ok(highlightResult);
    
    log('Step 5: Test batch execution');
    const items = [
      {
        containerId: 'container-1',
        operationId: 'highlight',
        config: { selector: '#test1', duration: 100 },
        handle: { sessionId: 'test' }
      },
      {
        containerId: 'container-2',
        operationId: 'highlight',
        config: { selector: '#test2', duration: 100 },
        handle: { sessionId: 'test' }
      }
    ];
    
    const batchResults = await executor.executeBatch(items);
    log(`  Batch execution completed: ${batchResults.length} results`);
    assert.equal(batchResults.length, 2);
    
    log('✅ Operation execution test completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Operation execution test failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

test();
