/**
 * RuntimeController Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeController } from '../../../libs/containers/src/engine/RuntimeController.js';

describe('RuntimeController', () => {
  const highlightFn = async () => {};
  const waitFn = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  it('should create a RuntimeController instance', () => {
    const controller = new RuntimeController([], {} as any, {
      highlight: highlightFn,
      wait: waitFn,
      eventBus: null
    });
    assert.ok(controller);
  });

  it('should accept container definitions', () => {
    const defs = [
      {
        id: 'test-container',
        name: 'Test Container',
        selectors: [{ css: '.test', variant: 'primary', score: 1.0 }],
        capabilities: ['highlight'],
        operations: [{ type: 'highlight', config: {} }]
      }
    ];
    
    const controller = new RuntimeController(defs, {} as any, {
      highlight: highlightFn,
      wait: waitFn,
      eventBus: null
    });
    
    assert.ok(controller);
  });

  it('should have focus management methods', () => {
    const controller = new RuntimeController([], {} as any, {
      highlight: highlightFn,
      wait: waitFn,
      eventBus: null
    });
    
    assert.ok(typeof controller.currentFocus === 'function');
    assert.ok(typeof controller.currentGraph === 'function');
  });
});

console.log('✅ RuntimeController tests completed');
