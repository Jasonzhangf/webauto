#!/usr/bin/env node

/**
 * Debug EventBus.emit method execution
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';

async function debugEventBusEmit() {
  console.log('🔍 Debugging EventBus.emit execution...\n');

  const eventBus = new EventBus({ historyLimit: 100 });

  let exactHandlerCalled = false;
  let wildcardHandlerCalled = false;

  // Monkey patch EventBus methods
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = async function(event, data = {}, source) {
    console.log(`📤 emit() called for event: "${event}"`);
    console.log(`   Looking for handlers in eventHandlers map...`);
    console.log(`   Available events:`, Array.from(eventBus.eventHandlers.keys()));

    const exactHandlers = eventBus.eventHandlers.get(event) || [];
    console.log(`   Found ${exactHandlers.length} exact handlers for "${event}"`);

    const wildcardHandlers = eventBus.getWildcardHandlers(event);
    console.log(`   Found ${wildcardHandlers.length} wildcard handlers for "${event}"`);

    const result = await originalEmit(event, data, source);
    console.log(`   ✅ emit() completed for "${event}"`);
    return result;
  };

  const originalGetWildcardHandlers = eventBus.getWildcardHandlers.bind(eventBus);
  eventBus.getWildcardHandlers = function(event) {
    console.log(`   🔍 getWildcardHandlers("${event}") called`);
    const handlers = originalGetWildcardHandlers(event);
    console.log(`   Found ${handlers.length} wildcard handlers`);
    return handlers;
  };

  console.log('1. Registering handlers...');

  // Register exact handler
  eventBus.on('debug:test:event', (data) => {
    console.log('🎯 EXACT HANDLER CALLED with:', data);
    exactHandlerCalled = true;
  });

  // Register wildcard handler
  eventBus.on('*', (data) => {
    console.log('⭐ WILDCARD HANDLER CALLED with:', data);
    wildcardHandlerCalled = true;
  });

  console.log('2. Checking registered handlers...');
  console.log('   Exact handlers:', eventBus.eventHandlers.get('debug:test:event')?.length || 0);
  console.log('   Wildcard handlers:', eventBus.eventHandlers.get('*')?.length || 0);

  console.log('3. Emitting event...');
  await eventBus.emit('debug:test:event', { message: 'test data' });

  console.log('4. Waiting for processing...');
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('5. Results:');
  console.log(`   Exact handler called: ${exactHandlerCalled}`);
  console.log(`   Wildcard handler called: ${wildcardHandlerCalled}`);

  eventBus.destroy();
  console.log('\n✅ EventBus emit debug complete');
}

debugEventBusEmit().catch(console.error);