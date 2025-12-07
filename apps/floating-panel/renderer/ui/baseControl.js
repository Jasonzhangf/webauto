import { bus } from './messageBus.js';

const listeners = new WeakMap();

export class BaseControl {
  constructor(id, element) {
    this.id = id;
    this.element = element || null;
    this.state = {};
    listeners.set(this, new Map());
  }

  on(event, handler) {
    const map = listeners.get(this);
    if (!map.has(event)) {
      map.set(event, new Set());
    }
    map.get(event).add(handler);
    return () => {
      map.get(event)?.delete(handler);
    };
  }

  emit(event, payload) {
    const map = listeners.get(this);
    map.get(event)?.forEach((handler) => handler(payload));
  }

  render() {}

  update(nextState) {
    this.state = { ...this.state, ...nextState };
    const snapshot = this.inspect();
    this.emit('dev:update', snapshot);
    bus?.publish('ui.control.devReport', snapshot);
  }

  inspect() {
    return {
      id: this.id,
      state: this.state,
      bounds: this.element ? this.element.getBoundingClientRect() : null,
    };
  }

  destroy() {
    listeners.get(this)?.clear();
  }
}
