/**
 * EventBus Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../../libs/operations-framework/src/event-driven/EventBus.js';

describe('EventBus', () => {
  it('should create an EventBus instance', () => {
    const bus = new EventBus();
    assert.ok(bus);
  });

  it('should emit and receive events', async () => {
    const bus = new EventBus();
    let received = false;
    
    bus.on('test:event', () => { received = true; });
    await bus.emit('test:event', {});
    
    assert.equal(received, true);
  });

  it('should pass data to event handlers', async () => {
    const bus = new EventBus();
    let receivedData: any = null;
    
    bus.on('test:event', (data) => { receivedData = data; });
    await bus.emit('test:event', { foo: 'bar' });
    
    assert.deepEqual(receivedData, { foo: 'bar' });
  });

  it('should support wildcard patterns', async () => {
    const bus = new EventBus();
    const results: string[] = [];
    
    bus.on('container:*:discovered', (data: any) => {
      results.push(data.containerId);
    });
    
    await bus.emit('container:test:discovered', { containerId: 'test' });
    await bus.emit('container:foo:discovered', { containerId: 'foo' });
    
    assert.equal(results.length, 2);
    assert.deepEqual(results, ['test', 'foo']);
  });

  it('should support multiple handlers for same event', async () => {
    const bus = new EventBus();
    let count = 0;
    
    bus.on('test:event', () => { count++; });
    bus.on('test:event', () => { count++; });
    await bus.emit('test:event', {});
    
    assert.equal(count, 2);
  });

  it('should remove event handlers with off()', async () => {
    const bus = new EventBus();
    let count = 0;
    
    const handler = () => { count++; };
    bus.on('test:event', handler);
    await bus.emit('test:event', {});
    assert.equal(count, 1);
    
    bus.off('test:event', handler);
    await bus.emit('test:event', {});
    assert.equal(count, 1); // No change
  });

  it('should track event history', async () => {
    const bus = new EventBus({ historyLimit: 100 });
    
    await bus.emit('event1', { data: 1 });
    await bus.emit('event2', { data: 2 });
    
    const history = bus.getEventHistory();
    assert.ok(history.length >= 2);
  });

  it('should get event statistics', async () => {
    const bus = new EventBus();
    
    await bus.emit('test:event', {});
    await bus.emit('test:event', {});
    await bus.emit('other:event', {});
    
    const stats = bus.getEventStats();
    assert.ok(stats['test:event'] >= 2);
    assert.ok(stats['other:event'] >= 1);
  });
});

console.log('✅ EventBus tests completed');
