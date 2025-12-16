// 引导与启动：扁平初始化，不持有 UI 状态
import { bus } from './messaging/bus.js';
import { createHighlightService } from './services/highlight-service.js';
import { createHighlightActions } from './actions/highlight-actions.js';
import { collectUiElements } from './state/ui-elements.js';

console.log('[floating] booting flat modules');

const ui = collectUiElements(document);

const highlight = createHighlightService({ bus, logger: console });
const actions = createHighlightActions({ bus, ui });

if (typeof highlight?.init === 'function') highlight.init();
if (typeof actions?.init === 'function') actions.init();

window.__floatingDebug = { bus, highlight, actions, ui };
