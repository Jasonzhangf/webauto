import { renderOperationList as renderListHelper } from './operation-helpers.js';

export interface OperationRenderOptions {
  containerId: string;
  operations: any[];
  primarySelector: string | null;
  domPath: string | null;
  hasRawOperations: boolean;
  isRoot?: boolean;
}

export function renderOperationsList(options: OperationRenderOptions): { html: string; hasSuggested: boolean } {
  const { containerId, operations, primarySelector, domPath, hasRawOperations, isRoot } = options;

  // No default operations - user must explicitly add
  const opsToRender: any[] = operations.map((op: any) => ({ ...op }));
  const html = renderListHelper(opsToRender, !!isRoot);

  return {
    html,
    hasSuggested: false,
  };
}

export function renderAddOperationPanel(primarySelector: string | null, domPath: string | null, isRoot: boolean = false): string {
  // Define available types based on context
  const commonTypes = [
    { value: 'click', label: 'click' },
    { value: 'fill', label: 'fill' },
    { value: 'highlight', label: 'highlight' },
    { value: 'extract', label: 'extract' }
  ];
  
  const rootTypes = [
    { value: 'scroll', label: 'scroll' },
    { value: 'navigate', label: 'navigate' },
    { value: 'screenshot', label: 'screenshot' }
  ];

  const types = isRoot ? [...rootTypes, ...commonTypes] : commonTypes;
  const optionsHtml = types.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  
  const commonTriggers = ['appear', 'click', 'input', 'change', 'focused', 'defocused'];
  const rootTriggers = [
    'page:load',
    'page:scroll',
    'page:navigate',
    'MSG_CONTAINER_ROOT_SCROLL_COMPLETE',
    'MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE'
  ];

  const triggers = isRoot ? [...rootTriggers, ...commonTriggers] : commonTriggers;
  const triggerOptionsHtml = triggers.map(t => `<option value="${t}">${t}</option>`).join('');

  return `
    <div class="quick-add-bar" style="display:flex;gap:6px;align-items:center;padding:8px;background:#252526;border-top:1px solid #3e3e3e;margin-top:auto;">
      <span style="font-size:10px;color:#aaa;font-weight:600;">ADD OP:</span>
      
      <select id="opTriggerSelect" class="qa-select" style="background:#1e1e1e;border:1px solid #444;color:#ccc;font-size:10px;height:22px;border-radius:2px;outline:none;">
        ${triggerOptionsHtml}
      </select>
      
      <span style="color:#555;font-size:10px;">➜</span>
      
      <select id="opTypeSelect" class="qa-select" style="flex:1;background:#1e1e1e;border:1px solid #444;color:#ccc;font-size:10px;height:22px;border-radius:2px;outline:none;">
        ${optionsHtml}
      </select>
      
      <button id="btnAddOp" class="qa-btn" style="background:#0e639c;color:#fff;border:none;padding:0 10px;height:22px;border-radius:2px;cursor:pointer;font-weight:bold;">+</button>
    </div>
  `;
}
