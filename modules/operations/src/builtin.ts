import { registerOperation } from './registry.js';
import { highlightOperation } from './operations/highlight.js';
import { scrollOperation } from './operations/scroll.js';
import { mouseMoveOperation, mouseClickOperation } from './system/mouse.js';
import { extractOperation } from './operations/extract.js';
import { clickOperation } from './operations/click.js';
import { typeOperation } from './operations/type.js';
import { findChildOperation } from './operations/find-child.js';
import { navigateOperation } from './operations/navigate.js';

let initialized = false;

export function ensureBuiltinOperations() {
  if (initialized) return;
  registerOperation(highlightOperation);
  registerOperation(scrollOperation);
  registerOperation(mouseMoveOperation);
  registerOperation(mouseClickOperation);
  registerOperation(extractOperation);
  registerOperation(clickOperation);
  registerOperation(typeOperation);
  registerOperation(findChildOperation);
  registerOperation(navigateOperation);
  initialized = true;
}
