import { BASIC_EVENTS, PAGE_EVENTS, OPERATION_TYPES, isRootContainer, formatTrigger, getTriggerMessage } from './operation-types.js';

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

  // Group operations by primary trigger message
  const groups: Record<string, any[]> = {};
  operations.forEach((op, index) => {
    // Skip operations without triggers
    if (!op.triggers || op.triggers.length === 0) {
      console.warn(`Operation at index ${index} has no triggers, skipping`, op);
      return;
    }

    const triggerMsg = getTriggerMessage(op.triggers[0]);
    if (!groups[triggerMsg]) groups[triggerMsg] = [];
    groups[triggerMsg].push({ op, index });
  });

  const sortedTriggers = Object.keys(groups).sort();

  let listHtml = '';

  sortedTriggers.forEach(triggerMsg => {
    // Group Header
    listHtml += `
      <div class="op-group-header" style="background:#252526;padding:4px 8px;font-size:10px;font-weight:600;color:#aaa;border-bottom:1px solid #333;display:flex;align-items:center;">
        <span style="text-transform:uppercase;">${triggerMsg}</span>
        <span style="margin-left:auto;font-size:9px;color:#666;">${groups[triggerMsg].length} ops</span>
      </div>
      <div class="op-group-container" data-trigger="${triggerMsg}">
    `;

    groups[triggerMsg].forEach(({ op, index }) => {
      const triggers = Array.isArray(op.triggers) ? op.triggers : [];

      // Show secondary triggers if any
      const otherTriggers = triggers.slice(1);
      const triggerHtml = otherTriggers.length > 0
        ? otherTriggers.map(t => `<span class="tag-trigger">${formatTrigger(t)}</span>`).join('')
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
  const triggers = Array.isArray(op.triggers) ? op.triggers : [];
  const configValue = op.config ? JSON.stringify(op.config, null, 2) : '{}';
  const isInput = op.type === 'fill' || op.type === 'input';

  // Fixed type display
  const typeLabel = OPERATION_TYPES.find(t => t.value === op.type)?.label || op.type;

  // Render triggers with condition support
  const triggersHtml = renderTriggersList(triggers, index);

  return `
    <div class="inline-editor" id="opEditor-${index}">

      <!-- Row 1: Type & Triggers -->
      <div class="editor-row">
        <span class="editor-label">Type</span>
        <span style="font-size:10px;color:#dcdcaa;padding:2px 4px;background:#333;border-radius:2px;min-width:60px;">
          ${typeLabel}
        </span>
      </div>

      <!-- Row 2: Triggers List with Conditions -->
      <div class="editor-row" style="align-items:flex-start;">
        <span class="editor-label">Triggers</span>
        <div style="flex:1;">
          <div id="triggers-list-${index}" class="triggers-list">
            ${triggersHtml}
          </div>
          <button class="btn-add-trigger" data-op-index="${index}" style="margin-top:4px;font-size:9px;padding:2px 6px;background:#0e639c;color:#fff;border:none;border-radius:2px;cursor:pointer;">+ Add Trigger</button>
        </div>
      </div>

      <!-- Row 3: Value Input (for Input/Fill) -->
      ${isInput ? renderValueInput(index, op.config?.value || '') : ''}

      <!-- Row 4: Config JSON & Virtual Keys -->
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

/**
 * 渲染 triggers 列表，支持条件编辑
 */
function renderTriggersList(triggers: any[], opIndex: number): string {
  if (!triggers.length) {
    return '<div style="color:#666;font-size:9px;">No triggers</div>';
  }

  return triggers.map((trigger, triggerIndex) => {
    const formatted = formatTrigger(trigger);
    const isObject = typeof trigger === 'object' && trigger.message;
    const message = isObject ? trigger.message : trigger;
    const condition = isObject ? trigger.condition : null;

    return `
      <div class="trigger-item" data-trigger-index="${triggerIndex}" style="display:flex;align-items:center;gap:4px;margin-bottom:4px;padding:4px;background:#1e1e1e;border:1px solid #333;border-radius:2px;">
        <span style="flex:1;font-size:10px;color:#dcdcaa;">${formatted}</span>
        <button class="btn-edit-trigger" data-op-index="${opIndex}" data-trigger-index="${triggerIndex}" style="font-size:9px;padding:1px 4px;background:#444;color:#fff;border:none;border-radius:2px;cursor:pointer;">Edit</button>
        <button class="btn-delete-trigger" data-op-index="${opIndex}" data-trigger-index="${triggerIndex}" style="font-size:9px;padding:1px 4px;background:#c41e3a;color:#fff;border:none;border-radius:2px;cursor:pointer;">×</button>
      </div>
    `;
  }).join('');
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
