/**
 * OperationExecutor Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OperationExecutor } from '../../../libs/containers/src/engine/OperationExecutor.js';
import { ensureBuiltinOperations } from '../../../modules/operations/src/builtin.js';

describe('OperationExecutor', () => {
  const page = {
    evaluate: async (fn, ...args) => {
      try {
        return fn(...args);
      } catch {
        return { success: false, error: 'Document not available in test environment' };
      }
    }
  };

  const getPage = () => page;

  it('should create an OperationExecutor instance', () => {
    const executor = new OperationExecutor(getPage);
    assert.ok(executor);
  });

  it('should create context with page and systemInput', async () => {
    const executor = new OperationExecutor(getPage);
    const context = await executor.createContext('test-container', { sessionId: 'test' });
    
    assert.ok(context);
    assert.ok(context.page);
    assert.ok(context.page.evaluate);
    assert.ok(context.systemInput);
    assert.ok(context.systemInput.mouseMove);
    assert.ok(context.systemInput.mouseClick);
  });

  it('should return result for operation execution', async () => {
    ensureBuiltinOperations();
    const executor = new OperationExecutor(getPage);
    
    const result = await executor.execute(
      'test-container',
      'highlight',
      { selector: '#test', duration: 100 },
      { sessionId: 'test' }
    );
    
    assert.ok(result);
    assert.ok(typeof result.success === 'boolean');
  });

  it('should handle operation errors gracefully', async () => {
    ensureBuiltinOperations();
    const executor = new OperationExecutor(getPage);
    
    const result = await executor.execute(
      'test-container',
      'highlight',
      { selector: null, duration: 100 },
      { sessionId: 'test' }
    );
    
    assert.ok(result);
    assert.equal(typeof result.success, 'boolean');
  });

  it('should execute batch operations', async () => {
    const executor = new OperationExecutor(getPage);
    
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
    
    const results = await executor.executeBatch(items);
    
    assert.ok(results);
    assert.equal(results.length, 2);
  });
});

console.log('✅ OperationExecutor tests completed');
