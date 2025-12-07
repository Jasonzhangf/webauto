import { inspectControls, getControl } from './controlRegistry.js';

const devUI = {
  inspectAll() {
    return inspectControls();
  },
  inspect(id) {
    return getControl(id)?.inspect() || null;
  },
  onControlUpdate(id, handler) {
    const control = getControl(id);
    if (!control || typeof control.on !== 'function') return () => {};
    return control.on('dev:update', handler);
  },
};

if (!window.devUI) {
  Object.defineProperty(window, 'devUI', {
    value: devUI,
    writable: false,
    enumerable: false,
  });
} else {
  Object.assign(window.devUI, devUI);
}
