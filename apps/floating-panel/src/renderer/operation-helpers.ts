import { BASIC_EVENTS, PAGE_EVENTS, OPERATION_TYPES, isRootContainer } from './operation-types.js';

/**
 * 渲染 Operation 列表 (表格样式)
 */
export function renderOperationList(operations: any[], isRoot: boolean): string {
  if (!operations.length) {
    return `
      <div class="op-empty-state" style="padding:20px;text-align:center;color:#666;font-size:10px;">
        No operations configured
      </div>
    `;
  }

  // Group operations by primary trigger
  const groups: Record<string, any[]> = {};
  operations.forEach((op, index) => {
    const trigger = (op.triggers && op.triggers.length > 0) ? op.triggers[0] : 'unknown';
    if (!groups[trigger]) groups[trigger] = [];
    groups[trigger].push({ op, index });
  });

  const sortedTriggers = Object.keys(groups).sort();

  let listHtml = '';

  sortedTriggers.forEach(trigger => {
    // Group Header
    listHtml += `
      <div class="op-group-header" style="background:#252526;padding:4px 8px;font-size:10px;font-weight:600;color:#aaa;border-bottom:1px solid #333;display:flex;align-items:center;">
        <span style="text-transform:uppercase;">${trigger}</span>
        <span style="margin-left:auto;font-size:9px;color:#666;">${groups[trigger].length} ops</span>
      </div>
      <div class="op-group-container" data-trigger="${trigger}">
    `;

    groups[trigger].forEach(({ op, index }) => {
      const triggers = Array.isArray(op.triggers) ? op.triggers : ['appear'];
      // Only show secondary triggers if any
      const otherTriggers = triggers.slice(1);
      const triggerHtml = otherTriggers.length > 0 
        ? otherTriggers.map(t => `<span class="tag-trigger">${t}</span>`).join('')
        : '';
    
      // Config 摘要
      let configSummary = '{}';
      if (op.config) {
        if (op.type === 'highlight') {
          configSummary = op.config.style || op.config.color || 'default';
        } else if (op.type === 'fill' || op.type === 'input') {
          configSummary = `"${op.config.value || ''}"`;
        } else if (op.type === 'click') {
          configSummary = op.config.selector ? `-> ${op.config.selector}` : '-';
        } else {
          // 简略显示 JSON
          const keys = Object.keys(op.config).filter(k => k !== 'selector' && k !== 'dom_path');
          if (keys.length > 0) {
            configSummary = keys.map(k => `${k}:${op.config[k]}`).join(', ');
          } else {
            configSummary = '-';
          }
        }
      }

      const enabledClass = op.enabled !== false ? '' : 'op-disabled';
    
      listHtml += `
      <div class="op-row ${enabledClass}" id="op-row-${index}" draggable="true" data-op-index="${index}" onclick="document.dispatchEvent(new CustomEvent('op-row-click', {detail: {index: ${index}}}))">
        <!-- Drag Handle -->
        <div class="col-drag" style="width:20px;color:#555;cursor:grab;display:flex;align-items:center;justify-content:center;">
          ⋮⋮
        </div>

        <!-- Type Column -->
        <div class="col-type" style="width:80px;color:#4ec9b0;font-weight:500;">
          ${op.type}
          ${triggerHtml}
        </div>
        
        <!-- Config Column -->
        <div class="col-config" style="flex:1;color:#888;font-family:monospace;font-size:10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
          ${configSummary}
        </div>
        
        <!-- Actions -->
        <div class="col-actions" style="width:40px;display:flex;justify-content:flex-end;gap:2px;">
          <button class="icon-btn test-btn" data-op-action="test" data-op-index="${index}" title="Test">▶</button>
          <button class="icon-btn edit-btn" data-op-action="edit" data-op-index="${index}" title="Edit">✎</button>
          <button class="icon-btn del-btn" data-op-action="delete" data-op-index="${index}" title="Delete">×</button>
        </div>
      </div>
      
      <!-- Editor Container (Hidden by default) -->
      <div id="op-editor-container-${index}" class="op-editor-container" style="display:none;"></div>
      `;
    });

    listHtml += `</div>`; // End group container
  });

  return `<div class="op-list-wrapper">${listHtml}</div>`;
}

/**
 * 渲染行内编辑器
 */
export function renderOperationEditor(op: any, index: number, isRoot: boolean): string {
  if (!op) return "";
  const eventOptions = [...BASIC_EVENTS, ...(isRoot ? PAGE_EVENTS : [])];
  const triggers = Array.isArray(op.triggers) ? op.triggers : ['appear'];
  const configValue = op.config ? JSON.stringify(op.config, null, 2) : '{}';
  const isInput = op.type === 'fill' || op.type === 'input';

  // Trigger 选择器 HTML
  const triggerChips = eventOptions.map(evt => {
    const active = triggers.includes(evt) ? 'active' : '';
    return `<span class="editor-chip ${active}" data-action="toggle-trigger" data-val="${evt}">${evt}</span>`;
  }).join('');

  return `
    <div class="inline-editor" id="opEditor-${index}">
      
      <!-- Row 1: Type & Triggers -->
      <div class="editor-row">
        <span class="editor-label">Type</span>
        <select class="editor-select" id="edit-type-${index}" style="width:100px;">
          ${OPERATION_TYPES.map(t => `<option value="${t.value}" ${op.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
        
        <span class="editor-label" style="margin-left:8px;">Triggers</span>
        <div class="editor-chips-wrapper">
          ${triggerChips} 
          <!-- We only allow editing the primary trigger via grouping implicitly, but here we can add secondaries -->
        </div>
      </div>

      <!-- Row 2: Value Input (for Input/Fill) -->
      ${isInput ? renderValueInput(index, op.config?.value || '') : ''}

      <!-- Row 3: Config JSON & Virtual Keys -->
      <div class="editor-row" style="align-items:flex-start;">
        <span class="editor-label">Config</span>
        <div style="flex:1;">
          <textarea class="editor-textarea" id="edit-config-${index}" spellcheck="false" style="${isInput ? 'display:none;' : ''}">${configValue}</textarea>
          ${isInput ? '<div style="font-size:9px;color:#666;margin-top:2px;">Raw config hidden. Use Value field above.</div>' : ''}
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="editor-footer">
        <button class="btn-cancel" style="font-size:9px;" onclick="document.getElementById('edit-config-${index}').style.display = document.getElementById('edit-config-${index}').style.display === 'none' ? 'block' : 'none'">Toggle JSON</button>
        <div style="flex:1"></div>
        <button class="btn-cancel" data-op-action="cancel" data-op-index="${index}">Cancel</button>
        <button class="btn-save" data-op-action="save" data-op-index="${index}">Save</button>
      </div>

    </div>
  `;
}

function renderValueInput(index: number, value: string) {
  return `
    <div class="editor-row">
      <span class="editor-label">Value</span>
      <div style="flex:1;">
        <input type="text" class="editor-input-sm" id="edit-value-${index}" value="${value}" style="width:100%;font-family:monospace;">
        ${renderInputControls(index)}
      </div>
    </div>
  `;
}

function renderInputControls(index: number) {
  // 虚拟按键列表
  const keys = ['Enter', 'Tab', 'Esc', 'Backspace', 'ArrowDown', 'ArrowUp'];
  
  return `
    <div style="margin-top:4px;">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
        <span style="font-size:9px;color:#aaa;">Special Keys:</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:2px;">
        ${keys.map(k => `<button class="shortcut-btn" data-action="insert-key" data-target="edit-value-${index}" data-val="{${k}}">${k}</button>`).join('')}
      </div>
    </div>
  `;
}
