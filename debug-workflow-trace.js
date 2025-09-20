#!/usr/bin/env node

/**
 * Trace the exact execution path in WorkflowEngine
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugWorkflowEngineTrace() {
  console.log('🔍 Tracing WorkflowEngine execution path...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  // Monkey patch the WorkflowEngine methods to add tracing
  const originalSetupRuleListeners = workflowEngine.setupRuleListeners.bind(workflowEngine);
  workflowEngine.setupRuleListeners = function(rule) {
    console.log('🔧 setupRuleListeners called for rule:', rule.id);
    return originalSetupRuleListeners(rule);
  };

  const originalEvaluateRule = workflowEngine.evaluateRule.bind(workflowEngine);
  workflowEngine.evaluateRule = async function(rule, event, data) {
    console.log('🎯 evaluateRule called for rule:', rule.id, 'event:', event);
    console.log('   Rule enabled:', rule.enabled);
    console.log('   Rule has then():', !!rule.then);
    return originalEvaluateRule(rule, event, data);
  };

  const originalLogEvent = workflowEngine.logEvent.bind(workflowEngine);
  workflowEngine.logEvent = async function(event, data) {
    console.log('📝 logEvent called:', event, data);
    return originalLogEvent(event, data);
  };

  // Create test rule
  const testRule = {
    id: 'trace-debug-rule',
    name: 'Trace Debug Rule',
    description: 'Rule with execution tracing',
    when: 'trace:debug:event',
    then: async (data) => {
      console.log('🎉🎉🎉 RULE THEN() FINALLY EXECUTED!', data);
    }
  };

  console.log('1. Adding rule...');
  workflowEngine.addRule(testRule);

  console.log('2. Checking registered handlers...');
  const handlers = eventBus.eventHandlers.get('trace:debug:event');
  console.log('   Handlers registered:', handlers?.length || 0);

  if (handlers && handlers.length > 0) {
    console.log('3. Manually calling the first handler...');
    try {
      await handlers[0]({ test: 'manual call' });
      console.log('   ✅ Manual handler call completed');
    } catch (error) {
      console.log('   ❌ Manual handler call failed:', error.message);
    }
  }

  console.log('4. Emitting event via EventBus...');
  try {
    await eventBus.emit('trace:debug:event', { message: 'automatic test' });
    console.log('   ✅ Event emission completed');
  } catch (error) {
    console.log('   ❌ Event emission failed:', error.message);
  }

  console.log('5. Waiting for async processing...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('6. Final check...');
  console.log('   Rule evaluations:', workflowEngine.getRuleEvaluations().length);

  workflowEngine.destroy();
  eventBus.destroy();
  console.log('\n✅ Trace debug complete');
}

debugWorkflowEngineTrace().catch(console.error);