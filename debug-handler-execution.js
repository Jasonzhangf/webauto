#!/usr/bin/env node

/**
 * Debug the exact execution of workflow handlers
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';
import { WorkflowEngine } from './sharedmodule/operations-framework/dist/event-driven/WorkflowEngine.js';

async function debugHandlerExecution() {
  console.log('🔍 Debugging workflow handler execution...\n');

  const eventBus = new EventBus({ historyLimit: 100 });
  const workflowEngine = new WorkflowEngine(eventBus);

  let workflowHandlerExecution = null;
  let directHandlerExecution = null;

  // Monkey patch EventBus to intercept handler execution
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = async function(event, data = {}, source) {
    console.log(`\n📤 EventBus.emit("${event}")`);

    // Get the handlers before calling them
    const exactHandlers = eventBus.eventHandlers.get(event) || [];
    console.log(`   Found ${exactHandlers.length} exact handlers`);

    // Monkey patch each handler to add tracing
    const tracedHandlers = exactHandlers.map((originalHandler, index) => {
      return async (tracedData) => {
        try {
          console.log(`   🎯 Executing handler ${index + 1}/${exactHandlers.length}...`);

          if (index === 0) {
            // This should be the WorkflowEngine handler
            workflowHandlerExecution = { called: true, error: null };
            console.log(`   📋 This appears to be the WorkflowEngine handler`);
          } else {
            // This should be the direct handler
            directHandlerExecution = { called: true, error: null };
            console.log(`   📋 This appears to be the direct handler`);
          }

          const result = await originalHandler(tracedData);
          console.log(`   ✅ Handler ${index + 1} completed successfully`);
          return result;
        } catch (error) {
          console.log(`   ❌ Handler ${index + 1} failed:`, error.message);
          console.log(`   📊 Error stack:`, error.stack);

          if (index === 0) {
            workflowHandlerExecution = { called: true, error: error.message };
          } else {
            directHandlerExecution = { called: true, error: error.message };
          }
          throw error;
        }
      };
    });

    // Temporarily replace the handlers with traced versions
    const originalHandlers = eventBus.eventHandlers.get(event);
    if (originalHandlers) {
      eventBus.eventHandlers.set(event, tracedHandlers);
    }

    try {
      const result = await originalEmit(event, data, source);
      console.log(`   ✅ EventBus.emit completed`);
      return result;
    } finally {
      // Restore original handlers
      if (originalHandlers) {
        eventBus.eventHandlers.set(event, originalHandlers);
      }
    }
  };

  // Add comprehensive error logging
  eventBus.on('error', (errorData) => {
    console.log('\n🚨 ERROR EVENT:', errorData);
  });

  console.log('1. Adding WorkflowEngine rule...');
  const workflowRule = {
    id: 'handler-execution-rule',
    name: 'Handler Execution Rule',
    description: 'Test rule for handler execution debugging',
    when: 'handler:test:event',
    then: async (data) => {
      console.log('\n🎉 WORKFLOW RULE THEN() EXECUTED!', data);
    }
  };
  workflowEngine.addRule(workflowRule);

  console.log('2. Adding direct handler...');
  eventBus.on('handler:test:event', (data) => {
    console.log('\n🔥 DIRECT HANDLER EXECUTED!', data);
  });

  console.log('3. Checking handlers before emission...');
  const handlers = eventBus.eventHandlers.get('handler:test:event');
  console.log(`   Total handlers: ${handlers?.length || 0}`);

  console.log('4. Emitting test event...');
  await eventBus.emit('handler:test:event', {
    message: 'handler execution test',
    timestamp: Date.now()
  });

  console.log('\n5. Waiting for processing...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n6. Execution results:');
  console.log(`   Workflow handler execution:`, workflowHandlerExecution);
  console.log(`   Direct handler execution:`, directHandlerExecution);
  console.log(`   Rule evaluations: ${workflowEngine.getRuleEvaluations().length}`);

  workflowEngine.destroy();
  eventBus.destroy();
  console.log('\n✅ Handler execution debug complete');
}

debugHandlerExecution().catch(console.error);