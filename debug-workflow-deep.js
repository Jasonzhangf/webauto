#!/usr/bin/env node

/**
 * Debug the exact issue with WorkflowEngine rule evaluation
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugWorkflowEngineDeep() {
  console.log('🔍 Deep debugging WorkflowEngine rule evaluation...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  let ruleThenCalled = false;
  let evaluationLogged = false;

  // Create a simple rule with detailed logging
  const testRule = {
    id: 'deep-debug-rule',
    name: 'Deep Debug Rule',
    description: 'Rule with extensive debugging',
    when: 'deep:debug:event',
    then: async (data) => {
      console.log('🎯🎯🎯 RULE THEN() EXECUTED!', data);
      ruleThenCalled = true;
    }
  };

  console.log('1. Adding rule to workflow engine...');
  workflowEngine.addRule(testRule);

  console.log('2. Checking internal state...');
  console.log('   Rules in engine:', workflowEngine.rules.size);
  console.log('   Rule enabled:', workflowEngine.rules.get('deep-debug-rule')?.enabled);

  console.log('3. Checking EventBus handlers...');
  const handlers = eventBus.eventHandlers.get('deep:debug:event');
  console.log('   Handlers for event:', handlers?.length || 0);

  // Add comprehensive logging to the EventBus
  let emitCount = 0;
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = async function(event, data = {}, source) {
    emitCount++;
    console.log(`   📤 EventBus.emit() called #${emitCount} for event: "${event}"`);
    console.log(`   📊 Data:`, JSON.stringify(data).substring(0, 100));

    const result = await originalEmit(event, data, source);
    console.log(`   ✅ EventBus.emit() #${emitCount} completed`);
    return result;
  };

  // Add logging to see all events
  eventBus.on('*', (data, eventName) => {
    console.log(`   🌟 Wildcard event received: "${eventName}"`, JSON.stringify(data).substring(0, 50));
  });

  console.log('4. Adding error listener...');
  eventBus.on('error', (errorData) => {
    console.log('   ❌ ERROR EVENT:', errorData);
  });

  console.log('5. Emitting test event...');
  try {
    await eventBus.emit('deep:debug:event', {
      message: 'deep debug test',
      timestamp: Date.now()
    });
    console.log('   ✅ Event emission completed');
  } catch (error) {
    console.log('   ❌ Event emission failed:', error.message);
  }

  console.log('6. Waiting for processing...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('7. Final results:');
  console.log(`   Rule then() called: ${ruleThenCalled}`);
  console.log(`   Rule evaluations: ${workflowEngine.getRuleEvaluations().length}`);

  const evaluations = workflowEngine.getRuleEvaluations();
  evaluations.forEach(evaluation => {
    console.log(`   - Evaluation: ${evaluation.ruleName} for event "${evaluation.event}" - Condition met: ${evaluation.conditionMet}`);
  });

  console.log('8. Checking event history...');
  const eventHistory = eventBus.getEventHistory();
  console.log(`   Total events: ${eventHistory.length}`);
  eventHistory.slice(-10).forEach(entry => {
    console.log(`   - ${entry.event}: ${JSON.stringify(entry.data).substring(0, 50)}`);
  });

  workflowEngine.destroy();
  eventBus.destroy();
  console.log('\n✅ Deep debug complete');
}

debugWorkflowEngineDeep().catch(console.error);