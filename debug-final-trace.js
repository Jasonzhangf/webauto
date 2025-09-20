#!/usr/bin/env node

/**
 * Final trace to find the exact issue in WorkflowEngine handler execution
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugFinalTrace() {
  console.log('🔍 Final trace of WorkflowEngine handler execution...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  // Monkey patch WorkflowEngine.setupRuleListeners to trace handler creation
  const originalSetupRuleListeners = workflowEngine.setupRuleListeners.bind(workflowEngine);
  workflowEngine.setupRuleListeners = function(rule) {
    console.log('\n🔧 setupRuleListeners called for rule:', rule.id);

    // Get the original eventBus.on method
    const originalEventBusOn = eventBus.on.bind(eventBus);

    // Temporarily replace eventBus.on to intercept the handler
    eventBus.on = function(event, handler) {
      console.log(`   📋 eventBus.on("${event}") called with handler:`);
      console.log(`   📋 Handler type: ${typeof handler}`);
      console.log(`   📋 Handler async: ${handler.constructor.name === 'AsyncFunction'}`);

      // Create a traced version of the handler
      const tracedHandler = async (data) => {
        console.log(`\n🎯 TRACED HANDLER CALLED for event "${event}"`);
        console.log(`   📊 Rule.enabled: ${rule.enabled}`);
        console.log(`   📊 Rule ID: ${rule.id}`);
        console.log(`   📊 Data received:`, JSON.stringify(data).substring(0, 100));

        try {
          // Check the condition that might be causing early return
          if (!rule.enabled) {
            console.log(`   ❌ RULE NOT ENABLED - returning early`);
            return;
          }

          console.log(`   ✅ Rule enabled - calling evaluateRule...`);

          // Call the original handler
          const result = await handler(data);
          console.log(`   ✅ Original handler completed`);
          return result;
        } catch (error) {
          console.log(`   ❌ Handler execution failed:`, error.message);
          console.log(`   📊 Error stack:`, error.stack);
          throw error;
        }
      };

      // Call the original eventBus.on with our traced handler
      return originalEventBusOn(event, tracedHandler);
    };

    // Call the original setupRuleListeners
    const result = originalSetupRuleListeners(rule);

    // Restore the original eventBus.on
    eventBus.on = originalEventBusOn;

    return result;
  };

  // Also monkey patch evaluateRule to trace it
  const originalEvaluateRule = workflowEngine.evaluateRule.bind(workflowEngine);
  workflowEngine.evaluateRule = async function(rule, event, data) {
    console.log(`\n🎯 evaluateRule() called:`);
    console.log(`   📊 Rule: ${rule.id}`);
    console.log(`   📊 Event: ${event}`);
    console.log(`   📊 Data:`, JSON.stringify(data).substring(0, 50));

    const result = await originalEvaluateRule(rule, event, data);
    console.log(`   ✅ evaluateRule() completed`);
    return result;
  };

  console.log('1. Adding rule...');
  const testRule = {
    id: 'final-trace-rule',
    name: 'Final Trace Rule',
    description: 'Rule for final tracing',
    when: 'final:trace:event',
    then: async (data) => {
      console.log('\n🎉🎉🎉 RULE THEN() FINALLY EXECUTED!', data);
    }
  };
  workflowEngine.addRule(testRule);

  console.log('2. Emitting event...');
  await eventBus.emit('final:trace:event', { message: 'final trace test' });

  console.log('\n3. Waiting for processing...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n4. Results:');
  console.log(`   Rule evaluations: ${workflowEngine.getRuleEvaluations().length}`);

  workflowEngine.destroy();
  eventBus.destroy();
  console.log('\n✅ Final trace complete');
}

debugFinalTrace().catch(console.error);