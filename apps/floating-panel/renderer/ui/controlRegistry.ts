const registryKey = '__webauto_controls__';

function getRegistry() {
  const host = globalThis;
  if (!host[registryKey]) {
    host[registryKey] = new Map();
  }
  return host[registryKey];
}

export function registerControl(control) {
  if (!control || !control.id) return;
  getRegistry().set(control.id, control);
}

export function unregisterControl(control) {
  if (!control || !control.id) return;
  getRegistry().delete(control.id);
}

export function getControl(id) {
  if (!id) return null;
  return getRegistry().get(id) || null;
}

