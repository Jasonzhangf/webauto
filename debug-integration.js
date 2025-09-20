#!/usr/bin/env node

/**
 * Debug the integration between WorkflowEngine and EventBus
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugIntegration() {
  console.log('🔍 Debugging WorkflowEngine + EventBus integration...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  let workflowHandlerCalled = false;
  let directHandlerCalled = false;

  // Trace EventBus.emit
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = async function(event, data = {}, source) {
    console.log(`\n📤 EventBus.emit("${event}")`);
    console.log(`   Available handlers:`, Array.from(eventBus.eventHandlers.keys()));

    const exactHandlers = eventBus.eventHandlers.get(event) || [];
    console.log(`   Exact handlers for "${event}": ${exactHandlers.length}`);

    if (exactHandlers.length > 0) {
      console.log(`   About to call ${exactHandlers.length} exact handlers...`);
    }

    const result = await originalEmit(event, data, source);
    console.log(`   ✅ EventBus.emit("${event}") completed`);
    return result;
  };

  // Trace WorkflowEngine.evaluateRule
  const originalEvaluateRule = workflowEngine.evaluateRule.bind(workflowEngine);
  workflowEngine.evaluateRule = async function(rule, event, data) {
    console.log(`\n🎯 WorkflowEngine.evaluateRule()`);
    console.log(`   Rule: ${rule.id}, Event: ${event}`);
    console.log(`   Rule enabled: ${rule.enabled}`);
    console.log(`   Rule has then(): ${!!rule.then}`);

    const result = await originalEvaluateRule(rule, event, data);
    console.log(`   ✅ WorkflowEngine.evaluateRule() completed`);
    return result;
  };

  // Create WorkflowEngine rule
  const workflowRule = {
    id: 'integration-test-rule',
    name: 'Integration Test Rule',
    description: 'Test rule for integration debugging',
    when: 'integration:test:event',
    then: async (data) => {
      console.log('\n🎉 WORKFLOW RULE THEN() EXECUTED!', data);
      workflowHandlerCalled = true;
    }
  };

  console.log('1. Adding WorkflowEngine rule...');
  workflowEngine.addRule(workflowRule);

  console.log('2. Adding direct handler for comparison...');
  eventBus.on('integration:test:event', (data) => {
    console.log('\n🔥 DIRECT HANDLER CALLED!', data);
    directHandlerCalled = true;
  });

  console.log('3. Checking registered handlers...');
  const handlers = eventBus.eventHandlers.get('integration:test:event');
  console.log(`   Total handlers for event: ${handlers?.length || 0}`);

  console.log('4. Emitting test event...');
  await eventBus.emit('integration:test:event', {
    message: 'integration test data',
    timestamp: Date.now()
  });

  console.log('\n5. Waiting for async processing...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n6. Final results:');
  console.log(`   Direct handler called: ${directHandlerCalled}`);
  console.log(`   Workflow handler called: ${workflowHandlerCalled}`);
  console.log(`   Rule evaluations: ${workflowEngine.getRuleEvaluations().length}`);

  const evaluations = workflowEngine.getRuleEvaluations();
  evaluations.forEach(evaluation => {
    console.log(`   - Evaluation: ${evaluation.ruleName} (${evaluation.event}) - Condition met: ${evaluation.conditionMet}`);
  });

  // Check if there were any errors
  const eventHistory = eventBus.getEventHistory();
  const errorEvents = eventHistory.filter(e => e.event === 'error');
  if (errorEvents.length > 0) {
    console.log('\n❌ Error events found:');
    errorEvents.forEach(errorEvent => {
      console.log(`   - ${JSON.stringify(errorEvent.data)}`);
    });
  }

  workflowEngine.destroy();
  eventBus.destroy();
  console.log('\n✅ Integration debug complete');
}

debugIntegration().catch(console.error);