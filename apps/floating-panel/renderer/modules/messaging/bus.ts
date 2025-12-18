// 精量消息总线
type BusHandler = (payload?: any) => void;

class RendererBus {
  listeners: Map<string, Set<BusHandler>> = new Map();

  publish(topic: string, payload?: any) {
    if (!topic) return false;
    // 由入口将消息转发到 electron IPC 或 websocket
    if ((window as any).desktopAPI?.publishMessage) {
      (window as any).desktopAPI.publishMessage(topic, payload);
      return true;
    }
    return false;
  }

  subscribe(topic: string, handler: BusHandler) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic).add(handler);
  }

  _emit(topic: string, payload?: any) {
    const set = this.listeners.get(topic);
    if (set) {
      set.forEach(handler => handler(payload));
    }
  }
}

export function createBus() {
  const instance = new RendererBus();
  return instance;
}
