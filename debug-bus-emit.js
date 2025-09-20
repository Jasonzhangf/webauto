#!/usr/bin/env node

/**
 * Debug EventBus emit process in detail
 */

import { EventBus } from './sharedmodule/operations-framework/dist/event-driven/EventBus.js';

async function debugBusEmit() {
  console.log('🔍 Debug EventBus emit process...\n');

  const eventBus = new EventBus({ historyLimit: 100 });

  let callCount = 0;
  let callOrder = [];

  // Add multiple handlers to trace execution order
  console.log('1. Adding test handlers...');

  // Handler 1: Direct handler
  eventBus.on('test:event', (data) => {
    callCount++;
    callOrder.push('direct-handler');
    console.log(`🎯 Handler 1 (direct) called - count: ${callCount}`);
  });

  // Handler 2: Workflow-style handler
  const workflowHandler = async (data) => {
    callCount++;
    callOrder.push('workflow-handler');
    console.log(`🔄 Handler 2 (workflow) called - count: ${callCount}`);
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 10));
  };
  eventBus.on('test:event', workflowHandler);

  // Handler 3: Wildcard handler
  eventBus.on('*', (data) => {
    callCount++;
    callOrder.push('wildcard-handler');
    console.log(`⭐ Handler 3 (wildcard) called - count: ${callCount}`);
  });

  console.log(`2. Handlers registered: ${eventBus.eventHandlers.get('test:event')?.length || 0} for 'test:event'`);
  console.log(`   Wildcard handlers: ${eventBus.eventHandlers.get('*')?.length || 0} for '*'`);

  // Debug the internal emit process
  console.log('3. Debugging emit process...');

  // Monkey patch the emit method to add debugging
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = async function(event, data = {}, source) {
    console.log(`   📤 Emit called for event: "${event}"`);
    console.log(`   📊 Exact handlers: ${this.eventHandlers.get(event)?.length || 0}`);
    console.log(`   📊 Wildcard handlers: ${this.getWildcardHandlers(event).length}`);

    const result = await originalEmit(event, data, source);
    console.log(`   ✅ Emit completed for "${event}"`);
    return result;
  };

  // Also patch getWildcardHandlers to see what it finds
  const originalGetWildcardHandlers = eventBus.getWildcardHandlers.bind(eventBus);
  eventBus.getWildcardHandlers = function(event) {
    const handlers = originalGetWildcardHandlers(event);
    console.log(`   🔍 getWildcardHandlers("${event}") found: ${handlers.length}`);
    handlers.forEach(h => console.log(`     - pattern: "${h.pattern}"`));
    return handlers;
  };

  console.log('4. Emitting test event...');
  callCount = 0;
  callOrder = [];

  await eventBus.emit('test:event', { message: 'test data' });
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`\n5. Results:`);
  console.log(`   Total handlers called: ${callCount}`);
  console.log(`   Call order: ${callOrder.join(', ')}`);

  // Check event history
  const eventHistory = eventBus.getEventHistory();
  console.log(`   Event history entries: ${eventHistory.length}`);
  const testEvents = eventHistory.filter(e => e.event === 'test:event');
  console.log(`   'test:event' entries: ${testEvents.length}`);

  eventBus.destroy();
  console.log('\n✅ Bus emit debug complete');
}

debugBusEmit().catch(console.error);