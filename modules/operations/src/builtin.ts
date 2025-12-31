import { registerOperation } from './registry.js';
import { highlightOperation } from './operations/highlight.js';
import { scrollOperation } from './operations/scroll.js';
import { mouseMoveOperation, mouseClickOperation } from './system/mouse.js';

let initialized = false;

export function ensureBuiltinOperations() {
  if (initialized) return;
  registerOperation(highlightOperation);
  registerOperation(scrollOperation);
  registerOperation(mouseMoveOperation);
  registerOperation(mouseClickOperation);
  initialized = true;
}
