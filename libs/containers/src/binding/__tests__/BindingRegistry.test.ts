import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { BindingRegistry } from '../BindingRegistry.js';

describe('BindingRegistry', () => {
  let registry: BindingRegistry;

  before(() => {
    registry = new BindingRegistry();
  });

  it('should register and retrieve a rule', () => {
    const rule = {
      id: 'test-rule-1',
      trigger: { type: 'message' as const, pattern: 'ACTION_TEST' },
      target: { containerId: 'container-123' },
      action: { operationType: 'click', config: { selector: '#btn' } }
    };

    registry.register(rule);
    const rules = registry.getRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].id, 'test-rule-1');
  });

  it('should find rules by trigger', () => {
    const registry2 = new BindingRegistry();
    const rule1 = {
      id: 'rule-1',
      trigger: { type: 'message' as const, pattern: 'ACTION_A' },
      target: { containerId: 'c1' },
      action: { operationType: 'scroll' }
    };

    const rule2 = {
      id: 'rule-2',
      trigger: { type: 'event' as const, pattern: 'container:*:discovered' },
      target: { containerId: 'c2' },
      action: { operationType: 'highlight' }
    };

    registry2.register(rule1);
    registry2.register(rule2);

    const messageRules = registry2.findRulesByTrigger('message');
    const eventRules = registry2.findRulesByTrigger('event');

    assert.equal(messageRules.length, 1);
    assert.equal(eventRules.length, 1);
  });

  it('should unregister a rule', () => {
    const registry3 = new BindingRegistry();
    const rule = {
      id: 'remove-me',
      trigger: { type: 'message' as const, pattern: 'X' },
      target: { containerId: 'c' },
      action: { operationType: 'click' }
    };

    registry3.register(rule);
    assert.equal(registry3.getRules().length, 1);
    
    registry3.unregister('remove-me');
    assert.equal(registry3.getRules().length, 0);
  });

  it('should handle messages and execute rules', async () => {
    let executed = false;
    
    const mockEventBus = {
      on: (event: string, handler: any) => {},
      emit: async (event: string, data: any) => {
        if (event.includes('execute')) {
          executed = true;
        }
      }
    };

    const regWithBus = new BindingRegistry(mockEventBus);

    regWithBus.register({
      id: 'msg-handler',
      trigger: { type: 'message' as const, pattern: 'ACTION_NEXT' },
      target: { containerId: 'target-container' },
      action: { operationType: 'scroll', config: { direction: 'down' } }
    });

    const results = await regWithBus.handleMessage('ACTION_NEXT', {}, { graph: {} });
    
    assert.equal(results.length, 1);
    assert.equal(results[0].success, true);
    assert.equal(results[0].targetContainerId, 'target-container');
  });
});
