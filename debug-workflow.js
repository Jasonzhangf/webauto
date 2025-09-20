#!/usr/bin/env node

/**
 * Debug workflow engine rule triggering
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugWorkflowEngine() {
  console.log('🔍 Debug workflow engine rule triggering...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  // Add debug logging
  eventBus.on('*', (data, event) => {
    console.log(`📢 Event received: ${event}`, data);
  });

  let ruleTriggered = false;

  const testRule = {
    id: 'debug-rule',
    name: 'Debug Rule',
    description: 'Debug rule triggering',
    when: 'debug:test:event',
    then: async (data) => {
      console.log('🎯 RULE TRIGGERED!', data);
      ruleTriggered = true;
    }
  };

  console.log('1. Adding rule to workflow engine...');
  workflowEngine.addRule(testRule);

  console.log('2. Starting workflow engine...');
  workflowEngine.start();

  console.log('3. Checking event bus handlers before emitting...');
  // Check what handlers are registered
  console.log('EventBus handlers:', Array.from(eventBus.eventHandlers.keys()));

  console.log('4. Emitting test event...');
  await eventBus.emit('debug:test:event', { message: 'test data' });

  console.log('5. Waiting for async processing...');
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('6. Checking if rule was triggered...');
  console.log(`Rule triggered: ${ruleTriggered}`);

  // Check rule evaluations
  const evaluations = workflowEngine.getRuleEvaluations();
  console.log(`Rule evaluations: ${evaluations.length}`);
  evaluations.forEach(evaluation => {
    console.log(`  - ${evaluation.ruleName}: ${evaluation.conditionMet ? 'MET' : 'NOT MET'} (${evaluation.event})`);
  });

  // Check event history
  const eventHistory = eventBus.getEventHistory();
  console.log(`Event history: ${eventHistory.length} events`);
  eventHistory.slice(-5).forEach(entry => {
    console.log(`  - ${entry.event}:`, JSON.stringify(entry.data).substring(0, 50));
  });

  workflowEngine.destroy();
  eventBus.destroy();

  console.log('\n✅ Debug complete');
}

debugWorkflowEngine().catch(console.error);