#!/usr/bin/env node

/**
 * Debug workflow rule evaluation specifically
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugRuleEvaluation() {
  console.log('🔍 Debug workflow rule evaluation...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  // Create a simple rule that should definitely work
  const testRule = {
    id: 'simple-test-rule',
    name: 'Simple Test Rule',
    description: 'Rule that should always trigger',
    when: 'simple:test:event',
    then: async (data) => {
      console.log('🎯 RULE THEN() EXECUTED!', data);
    }
  };

  // Let's manually trace what should happen:
  console.log('1. Manual trace of what should happen:');
  console.log('   - Rule.addRule() should call setupRuleListeners()');
  console.log('   - setupRuleListeners() should call eventBus.on() for "simple:test:event"');
  console.log('   - When event is emitted, handler should call evaluateRule()');
  console.log('   - evaluateRule() should execute rule.then()');
  console.log('');

  // Add the rule
  console.log('2. Adding rule...');
  workflowEngine.addRule(testRule);

  // Check if handler was registered
  console.log('3. Checking if handler was registered...');
  const handlers = eventBus.eventHandlers.get('simple:test:event');
  console.log(`   Handlers for 'simple:test:event': ${handlers ? handlers.length : 0}`);

  if (handlers && handlers.length > 0) {
    console.log('   ✅ Handler was registered');

    // Manually test the handler
    console.log('4. Testing handler manually...');
    try {
      await handlers[0]({ test: 'manual data' });
      console.log('   ✅ Manual handler execution succeeded');
    } catch (error) {
      console.log('   ❌ Manual handler execution failed:', error.message);
    }
  } else {
    console.log('   ❌ Handler was NOT registered');
  }

  console.log('');
  console.log('5. Testing via event emission...');

  // Add error listener to catch any errors
  eventBus.on('error', (errorData) => {
    console.log('   ❌ ERROR in event bus:', errorData);
  });

  // Add a listener to see if the event gets through
  let eventReceived = false;
  eventBus.on('simple:test:event', (data) => {
    eventReceived = true;
    console.log('   📢 Event received by direct listener:', data);
  });

  console.log('   Emitting event...');
  try {
    await eventBus.emit('simple:test:event', { message: 'automated test' });
    console.log('   ✅ Event emission completed');
  } catch (error) {
    console.log('   ❌ Event emission failed:', error.message);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`   Event received by direct listener: ${eventReceived}`);

  // Check rule evaluations
  const evaluations = workflowEngine.getRuleEvaluations();
  console.log(`   Rule evaluations: ${evaluations.length}`);

  // Check event history to see if there were any issues
  const eventHistory = eventBus.getEventHistory();
  const errorEvents = eventHistory.filter(e => e.event === 'error');
  if (errorEvents.length > 0) {
    console.log('   Error events found:');
    errorEvents.forEach(e => console.log(`     - ${JSON.stringify(e.data)}`));
  }

  workflowEngine.destroy();
  eventBus.destroy();
  console.log('\n✅ Rule evaluation debug complete');
}

debugRuleEvaluation().catch(console.error);