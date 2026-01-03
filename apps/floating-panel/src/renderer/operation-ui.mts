import { renderOperationList as renderListHelper } from './operation-helpers.js';

export interface OperationRenderOptions {
  containerId: string;
  operations: any[];
  primarySelector: string | null;
  domPath: string | null;
  hasRawOperations: boolean;
  isRoot?: boolean;
}

export function buildDefaultOperations(containerId: string, primarySelector: string | null, domPath: string | null, isRoot: boolean = false): any[] {
  const baseConfig: Record<string, any> = {};
  if (primarySelector) {
    baseConfig.selector = primarySelector;
  } else if (typeof domPath === 'string' && domPath.trim()) {
    baseConfig.dom_path = domPath.trim();
  }
  
  const ops = [];

  // Default operations for focused/defocused
  ops.push({
    id: `${containerId}.focused`,
    type: 'highlight',
    triggers: ['focused'],
    enabled: true,
    config: {
      ...baseConfig,
      style: '2px solid #007acc', // Blue for focused
      duration: 0
    }
  });

  ops.push({
    id: `${containerId}.defocused`,
    type: 'highlight',
    triggers: ['defocused'],
    enabled: true,
    config: {
      ...baseConfig,
      style: 'none', // Remove highlight
      duration: 0
    }
  });

  return ops;
}

export function renderOperationsList(options: OperationRenderOptions): { html: string; hasSuggested: boolean } {
  const { containerId, operations, primarySelector, domPath, hasRawOperations, isRoot } = options;

  // If no operations, suggest defaults
  const synthesizedOperations: any[] = !hasRawOperations 
    ? buildDefaultOperations(containerId, primarySelector, domPath, !!isRoot) 
    : [];
    
  const hasSuggestedOperations = !hasRawOperations && synthesizedOperations.length > 0;
  const opsToRender: any[] = (hasRawOperations ? operations : synthesizedOperations).map((op: any) => ({ ...op }));

  const html = renderListHelper(opsToRender, !!isRoot);

  return {
    html,
    hasSuggested: hasSuggestedOperations,
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
  
  const commonTriggers = ['appear', 'click', 'focused', 'defocused'];
  const triggerOptionsHtml = commonTriggers.map(t => `<option value="${t}">${t}</option>`).join('');

  return `
    <div class="quick-add-bar" style="display:flex;gap:4px;align-items:center;padding:4px;background:#252526;border-top:1px solid #3e3e3e;margin-top:auto;">
      <span style="font-size:10px;color:#666;">Add:</span>
      
      <select id="opTriggerSelect" class="qa-select" style="background:#1e1e1e;border:1px solid #444;color:#ccc;font-size:10px;height:20px;width:70px;">
        ${triggerOptionsHtml}
      </select>
      
      <span style="color:#555;font-size:10px;">➜</span>
      
      <select id="opTypeSelect" class="qa-select" style="flex:1;background:#1e1e1e;border:1px solid #444;color:#ccc;font-size:10px;height:20px;">
        ${optionsHtml}
      </select>
      
      <button id="btnAddOp" class="qa-btn" style="background:#0e639c;color:#fff;border:none;padding:0 8px;height:20px;border-radius:2px;cursor:pointer;">+</button>
    </div>
  `;
}
