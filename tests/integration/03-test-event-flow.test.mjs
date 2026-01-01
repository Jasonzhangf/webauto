#!/usr/bin/env node
/**
 * Event Flow Integration Test
 * 
 * Tests event flow through EventBus and BindingRegistry
 */

import assert from 'node:assert/strict';
import { EventBus } from '../../libs/operations-framework/src/event-driven/EventBus.ts';
import { BindingRegistry } from '../../libs/containers/src/binding/BindingRegistry.js';

function log(msg) {
  console.log(`[event-flow-test] ${msg}`);
}

async function test() {
  try {
    log('Step 1: Create EventBus and BindingRegistry');
    const bus = new EventBus({ historyLimit: 100 });
    const registry = new BindingRegistry(bus);
    
    const events = [];
    
    log('Step 2: Register event listeners');
    bus.on('container:*:discovered', (data) => {
      events.push(`discovered:${data.containerId}`);
    });
    
    bus.on('operation:*:execute', (data) => {
      events.push(`execute:${data.operationType} on ${data.containerId}`);
    });
    
    log('Step 3: Register binding rule');
    registry.register({
      id: 'auto-highlight-discovered',
      trigger: { type: 'event', pattern: 'container:*:discovered' },
      target: { selector: (graph) => graph.lastDiscoveredId },
      action: { operationType: 'highlight', config: { color: '#00C853' } }
    });
    
    log('Step 4: Emit container:discovered event');
    await bus.emit('container:test-container:discovered', {
      containerId: 'test-container',
      bbox: { x: 0, y: 0, width: 100, height: 100 }
    });
    
    // Give events time to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    
    log('Step 5: Verify event flow');
    assert.ok(events.includes('discovered:test-container'), 'Should receive discovered event');
    
    log('Step 6: Verify binding rule registered');
    const rules = registry.getRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].id, 'auto-highlight-discovered');
    
    log('Step 7: Check event history');
    const history = bus.getEventHistory();
    assert.ok(history.length > 0, 'Should have event history');
    
    const discoveredEvent = history.find(e => e.event.includes('discovered'));
    assert.ok(discoveredEvent, 'Should have discovered event in history');
    
    log('✅ Event flow test completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Event flow test failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

test();
