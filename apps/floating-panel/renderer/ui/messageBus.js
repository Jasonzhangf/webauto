class RendererBus {
  constructor() {
    this.listeners = new Map();
  }

  publish(topic, payload) {
    if (!topic) return false;
    if (window.desktopAPI?.publishMessage) {
      window.desktopAPI.publishMessage(topic, payload);
      return true;
    }
    return false;
  }

  subscribe(topic, handler) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic).add(handler);
    return () => {
      this.listeners.get(topic)?.delete(handler);
    };
  }

  _emit(topic, payload) {
    this.listeners.get(topic)?.forEach((handler) => handler(payload));
  }
}

export const bus = new RendererBus();

window.desktopAPI?.onMessage?.((payload = {}) => {
  if (!payload?.topic) return;
  bus._emit(payload.topic, payload.payload);
});

if (!window.bus) {
  Object.defineProperty(window, 'bus', {
    value: bus,
    writable: false,
  });
}
