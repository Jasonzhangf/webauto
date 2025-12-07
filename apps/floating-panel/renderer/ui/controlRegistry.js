const registry = new Map();

export function registerControl(control) {
  if (!control?.id) return;
  registry.set(control.id, control);
}

export function unregisterControl(control) {
  if (!control?.id) return;
  registry.delete(control.id);
}

export function inspectControls() {
  return Array.from(registry.values()).map((control) => control.inspect());
}

export function getControl(id) {
  return registry.get(id);
}
