// 精量消息总线
class RendererBus {
  constructor() {
    this.listeners = new Map();
  }

  publish(topic, payload) {
    if (!topic) return false;
    // 由入口将消息转发到 electron IPC 或 websocket
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
  }

  _emit(topic, payload) {
    const set = this.listeners.get(topic);
    if (set) {
      set.forEach(handler => handler(payload));
    }
  }
}

export const bus = new RendererBus();
// 如果已有 window.bus，则桥接（兼容旧测试）
if (!window.bus) {
  Object.defineProperty(window, 'bus', {
    value: bus,
    writable: false,
  });
} else {
  console.warn('[bus] window.bus already exists, keep existing');
}

// 由 electron/main.js 的 bridge 将事件桥接过来
window.desktopAPI?.onMessage?.((payload = {}) => {
  if (!payload?.topic) return;
  bus._emit(payload.topic, payload.payload);
});
