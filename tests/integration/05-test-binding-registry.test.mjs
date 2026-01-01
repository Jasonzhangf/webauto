#!/usr/bin/env node
/**
 * BindingRegistry Integration Test
 * 
 * Tests BindingRegistry with EventBus integration
 */

import assert from 'node:assert/strict';
import { EventBus } from '../../libs/operations-framework/src/event-driven/EventBus.ts';
import { BindingRegistry } from '../../libs/containers/src/binding/BindingRegistry.js';

function log(msg) {
  console.log(`[binding-registry-test] ${msg}`);
}

async function test() {
  try {
    log('Step 1: Create EventBus and BindingRegistry');
    const bus = new EventBus({ historyLimit: 100 });
    const registry = new BindingRegistry(bus);
    
    log('Step 2: Register binding rule');
    registry.register({
      id: 'auto-highlight',
      trigger: { type: 'event', pattern: 'container:*:discovered' },
      target: { containerId: null },
      action: { 
        operationType: 'highlight', 
        config: { color: '#00C853', durationMs: 1500 } 
      }
    });
    
    log('Step 3: Verify rules registered');
    const rules = registry.getRules();
    assert.equal(rules.length, 1);
    
    log('Step 4: Emit container discovery events');
    await bus.emit('container:weibo_main_page:discovered', {
      containerId: 'weibo_main_page',
      bbox: { x: 0, y: 0, width: 1000, height: 800 }
    });
    
    await bus.emit('container:weibo_main_page.feed_list:discovered', {
      containerId: 'weibo_main_page.feed_list',
      bbox: { x: 10, y: 100, width: 980, height: 600 }
    });
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    log('Step 5: Verify events were emitted');
    const history = bus.getEventHistory();
    const discoveredEvents = history.filter(e => e.event.includes('discovered'));
    assert.ok(discoveredEvents.length >= 2, 'Should have discovered events');
    
    log('Step 6: Test rule removal');
    registry.unregister('auto-highlight');
    const remainingRules = registry.getRules();
    assert.equal(remainingRules.length, 0);
    
    log('✅ BindingRegistry integration test completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ BindingRegistry test failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

test();
