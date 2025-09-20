#!/usr/bin/env node

/**
 * Debug individual handler execution
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';

async function debugHandlerExecution() {
  console.log('🔍 Debug handler execution...\n');

  const eventBus = new EventBus({ historyLimit: 100 });

  let handlerCalled = false;
  let handlerData = null;

  // Test 1: Direct handler
  console.log('Test 1: Direct handler registration');
  eventBus.on('test:direct', (data) => {
    console.log('🎯 Direct handler called with:', data);
    handlerCalled = true;
    handlerData = data;
  });

  await eventBus.emit('test:direct', { message: 'hello world' });
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`Direct handler called: ${handlerCalled}`);
  console.log(`Direct handler data:`, handlerData);
  console.log('');

  // Test 2: Workflow-style handler (async)
  let workflowHandlerCalled = false;
  console.log('Test 2: Async handler (like workflow)');

  const asyncHandler = async (data) => {
    console.log('🔄 Async handler starting...');
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work
    console.log('🎯 Async handler completed with:', data);
    workflowHandlerCalled = true;
  };

  eventBus.on('test:async', asyncHandler);

  await eventBus.emit('test:async', { message: 'async test' });
  await new Promise(resolve => setTimeout(resolve, 200));

  console.log(`Async handler called: ${workflowHandlerCalled}`);
  console.log('');

  // Test 3: Check event handlers map
  console.log('Test 3: EventBus internal state');
  console.log('Registered handlers:', Array.from(eventBus.eventHandlers.keys()));

  const directHandlers = eventBus.eventHandlers.get('test:direct');
  const asyncHandlers = eventBus.eventHandlers.get('test:async');

  console.log('Direct handlers count:', directHandlers?.length || 0);
  console.log('Async handlers count:', asyncHandlers?.length || 0);

  eventBus.destroy();
  console.log('✅ Handler debug complete');
}

debugHandlerExecution().catch(console.error);