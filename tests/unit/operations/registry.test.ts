/**
 * Operation Registry Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerOperation, getOperation, listOperations } from '../../../modules/operations/src/registry.js';

describe('OperationRegistry', () => {
  it('should register and retrieve an operation', () => {
    const testOp = {
      id: 'test-op',
      description: 'Test operation',
      run: async (ctx: any, config: any) => ({ success: true, data: 'test' })
    };
    
    registerOperation(testOp);
    const op = getOperation('test-op');
    
    assert.ok(op);
    assert.equal(op.id, 'test-op');
    assert.equal(op.description, 'Test operation');
  });

  it('should return undefined for non-existent operation', () => {
    const op = getOperation('non-existent');
    assert.equal(op, undefined);
  });

  it('should list all registered operations', () => {
    // Clear any existing operations and register a test operation
    // Note: In a real scenario, we'd need a way to clear the registry
    const ops = listOperations();
    assert.ok(ops.length >= 1); // At least our test-op should be there
  });

  it('should run operation with context and config', async () => {
    const testOp = {
      id: 'run-test',
      description: 'Run test operation',
      run: async (ctx: any, config: any) => {
        return {
          success: true,
          contextReceived: !!ctx,
          configReceived: config,
          pageAvailable: !!ctx?.page,
          systemInputAvailable: !!ctx?.systemInput
        };
      }
    };
    
    registerOperation(testOp);
    
    const context = {
      page: { evaluate: async (fn: any) => fn() },
      systemInput: {
        mouseMove: async (x: number, y: number) => ({ x, y }),
        mouseClick: async (x: number, y: number) => ({ x, y })
      }
    };
    
    const result = await testOp.run(context, { test: 'config' });
    
    assert.ok(result.success);
    assert.ok(result.contextReceived);
    assert.ok(result.configReceived);
    assert.ok(result.pageAvailable);
    assert.ok(result.systemInputAvailable);
    assert.deepEqual(result.configReceived, { test: 'config' });
  });
});

console.log('✅ OperationRegistry tests completed');
