export class BaseControl {
  constructor(id, rootEl) {
    this.id = id || 'control';
    this.rootEl = rootEl || null;
    this._listeners = new Map();
  }

  inspect() {
    return {
      id: this.id,
      hasRoot: Boolean(this.rootEl),
    };
  }

  on(event, handler) {
    if (!event || typeof handler !== 'function') return;
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
  }

  off(event, handler) {
    if (!event || !this._listeners.has(event)) return;
    if (!handler) {
      this._listeners.delete(event);
      return;
    }
    this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers || !handlers.size) return;
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch {
        // ignore listener errors
      }
    });
  }
}
