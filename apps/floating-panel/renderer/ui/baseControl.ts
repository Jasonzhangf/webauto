export class BaseControl {
  id: string;
  rootEl: HTMLElement;
  private _listeners: Record<string, Set<(...args: any[]) => void>> = {};

  constructor(id: string, rootEl: HTMLElement) {
    this.id = id;
    this.rootEl = rootEl;
  }

  on(event: string, handler: (...args: any[]) => void) {
    if (!this._listeners[event]) this._listeners[event] = new Set();
    this._listeners[event].add(handler);
  }

  emit(event: string, ...args: any[]) {
    this._listeners[event]?.forEach(h => h(...args));
  }

  off(event: string, handler: (...args: any[]) => void) {
    this._listeners[event]?.delete(handler);
  }
}
