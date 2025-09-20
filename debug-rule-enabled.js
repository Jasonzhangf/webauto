#!/usr/bin/env node

/**
 * Debug the rule.enabled property in WorkflowEngine
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugRuleEnabled() {
  console.log('🔍 Debugging rule.enabled property...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  console.log('1. Creating test rule...');
  const testRule = {
    id: 'enabled-test-rule',
    name: 'Enabled Test Rule',
    description: 'Test rule for enabled debugging',
    when: 'enabled:test:event',
    then: async (data) => {
      console.log('🎉 RULE THEN() EXECUTED!', data);
    }
  };

  console.log('2. Adding rule to WorkflowEngine...');
  workflowEngine.addRule(testRule);

  console.log('3. Checking rule state...');
  const storedRule = workflowEngine.rules.get('enabled-test-rule');
  console.log('   Rule found in engine:', !!storedRule);
  if (storedRule) {
    console.log('   Rule.enabled:', storedRule.enabled);
    console.log('   Rule.when:', storedRule.when);
    console.log('   Rule.then exists:', !!storedRule.then);
  }

  // Monkey patch the handler to check rule.enabled at execution time
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = async function(event, data = {}, source) {
    if (event === 'enabled:test:event') {
      console.log('\n📤 About to emit enabled:test:event');

      // Get the handlers
      const handlers = eventBus.eventHandlers.get(event) || [];
      console.log(`   Found ${handlers.length} handlers`);

      // Check the rule state again at execution time
      const currentRule = workflowEngine.rules.get('enabled-test-rule');
      console.log('   Rule.enabled at execution time:', currentRule?.enabled);
      console.log('   Rule object at execution time:', currentRule);
    }

    return originalEmit(event, data, source);
  };

  console.log('4. Emitting test event...');
  await eventBus.emit('enabled:test:event', { message: 'enabled test' });

  console.log('\n5. Waiting for processing...');
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n6. Results:');
  console.log(`   Rule evaluations: ${workflowEngine.getRuleEvaluations().length}`);

  workflowEngine.destroy();
  eventBus.destroy();
  console.log('\n✅ Rule enabled debug complete');
}

debugRuleEnabled().catch(console.error);