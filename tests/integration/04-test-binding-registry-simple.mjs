#!/usr/bin/env node
/**
 * Simple Integration Test for BindingRegistry
 * Does not depend on external services
 */

async function testBindingRegistry() {
  console.log('[TEST] Starting BindingRegistry integration test...');
  
  // Mock EventBus
  const mockEventBus = {
    on: (event, handler) => {},
    emit: async (event, data) => {
      console.log(`[EventBus] ${event}`, JSON.stringify(data).substring(0, 50) + '...');
    }
  };
  
  // Import BindingRegistry using dynamic import
  const bindingModule = await import('../../libs/containers/src/binding/BindingRegistry.js');
  const { BindingRegistry } = bindingModule;
  
  const registry = new BindingRegistry(mockEventBus);
  
  // Test 1: Register rule
  console.log('[TEST] Registering rule...');
  registry.register({
    id: 'auto-next-page',
    trigger: { type: 'message', pattern: 'ACTION_NEXT_PAGE' },
    target: { containerId: 'product-list' },
    action: { operationType: 'click', config: { selector: '.next' } }
  });
  
  const rules = registry.getRules();
  if (rules.length !== 1) throw new Error('Rule registration failed');
  console.log('[TEST] Rule registered successfully');
  
  // Test 2: Handle message
  console.log('[TEST] Handling message...');
  const results = await registry.handleMessage('ACTION_NEXT_PAGE', {}, { graph: {} });
  if (results.length !== 1) throw new Error('Message handling failed');
  console.log('[TEST] Message handled successfully');
  
  console.log('[TEST] ✅ All BindingRegistry integration tests passed!');
  process.exit(0);
}

testBindingRegistry().catch(err => {
  console.error('[TEST] ❌ Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
