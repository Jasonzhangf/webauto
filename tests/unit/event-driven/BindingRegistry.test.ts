/**
 * BindingRegistry Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BindingRegistry } from '../../../libs/containers/src/binding/BindingRegistry.js';

describe('BindingRegistry', () => {
  it('should create a BindingRegistry instance', () => {
    const registry = new BindingRegistry();
    assert.ok(registry);
  });

  it('should register and retrieve a rule', () => {
    const registry = new BindingRegistry();
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

  it('should find rules by trigger type', () => {
    const registry = new BindingRegistry();
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

    registry.register(rule1);
    registry.register(rule2);

    const messageRules = registry.findRulesByTrigger('message');
    const eventRules = registry.findRulesByTrigger('event');

    assert.equal(messageRules.length, 1);
    assert.equal(eventRules.length, 1);
  });

  it('should unregister a rule', () => {
    const registry = new BindingRegistry();
    const rule = {
      id: 'remove-me',
      trigger: { type: 'message' as const, pattern: 'X' },
      target: { containerId: 'c' },
      action: { operationType: 'click' }
    };

    registry.register(rule);
    assert.equal(registry.getRules().length, 1);
    
    registry.unregister('remove-me');
    assert.equal(registry.getRules().length, 0);
  });

  it('should find rules by trigger and pattern', () => {
    const registry = new BindingRegistry();
    const rule = {
      id: 'rule',
      trigger: { type: 'event' as const, pattern: 'container:*:discovered' },
      target: { containerId: 'c' },
      action: { operationType: 'highlight' }
    };

    registry.register(rule);
    const rules = registry.findRulesByTrigger('event', 'container:*:discovered');
    
    assert.equal(rules.length, 1);
    assert.equal(rules[0].id, 'rule');
  });
});

console.log('✅ BindingRegistry tests completed');
