// Simple message-driven test driver for UI modules.
// This is intentionally minimal and side-effect free for product code.

export function createUiTestDriver({ bus, logger = console } = {}) {
  if (!bus || typeof bus.publish !== 'function' || typeof bus.subscribe !== 'function') {
    throw new Error('createUiTestDriver requires a bus with publish/subscribe');
  }

  const events = [];
  const unsubscribers = [];

  const record = (topic, payload) => {
    events.push({ topic, payload, ts: Date.now() });
  };

  const subscribe = (topic) => {
    const off = bus.subscribe(topic, (payload) => {
      record(topic, payload);
    });
    if (typeof off === 'function') {
      unsubscribers.push(off);
    }
  };

  // Observe core UI topics – enough to cover DOM/containers basic flows.
  [
    'ui.state.snapshot',
    'ui.state.event',
    'dom:highlight_request',
    'dom:highlight_feedback',
    'dom:highlight_cleared',
    'dom:highlight_error',
    'containers:snapshot_updated',
  ].forEach(subscribe);

  function dispose() {
    while (unsubscribers.length) {
      try {
        unsubscribers.pop()?.();
      } catch (err) {
        logger?.warn?.('[ui-test-driver] unsubscribe failed', err);
      }
    }
  }

  return {
    events,
    publish(topic, payload) {
      record(topic, payload);
      return bus.publish(topic, payload);
    },
    getEvents() {
      return events.slice();
    },
    clearEvents() {
      events.length = 0;
    },
    dispose,
  };
}

