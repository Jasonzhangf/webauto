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

  // 表头
  const headerHtml = `
    <div class="op-header-row" style="display:flex;gap:4px;padding:2px 6px;background:#222;color:#666;font-size:9px;font-weight:600;border-bottom:1px solid #333;">
      <div style="width:70px;">TRIGGER</div>
      <div style="width:60px;">ACTION</div>
      <div style="flex:1;">CONFIG</div>
      <div style="width:40px;text-align:right;">OP</div>
    </div>
  `;

  // 列表内容
  const rowsHtml = operations.map((op: any, index: number) => {
    const triggers = Array.isArray(op.triggers) ? op.triggers : ['appear'];
    const triggerHtml = triggers.map(t => `<span class="tag-trigger">${t}</span>`).join('');
    
    // Config 摘要
    let configSummary = '{}';
    if (op.config) {
      if (op.type === 'highlight') {
        configSummary = op.config.style || op.config.color || 'default';
      } else if (op.type === 'fill') {
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
    
    return `
      <div class="op-row ${enabledClass}" id="op-row-${index}" data-op-index="${index}" onclick="document.dispatchEvent(new CustomEvent('op-row-click', {detail: {index: ${index}}}))">
        <!-- Trigger Column -->
        <div class="col-trigger" style="width:70px;overflow:hidden;white-space:nowrap;">
          ${triggerHtml}
        </div>
        
        <!-- Type Column -->
        <div class="col-type" style="width:60px;color:#4ec9b0;font-weight:500;">
          ${op.type}
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
  }).join('');

  return `<div class="op-list-wrapper">${headerHtml}${rowsHtml}</div>`;
}

/**
 * 渲染行内编辑器
 */
export function renderOperationEditor(op: any, index: number, isRoot: boolean): string {
  if (!op) return "";
  const eventOptions = [...BASIC_EVENTS, ...(isRoot ? PAGE_EVENTS : [])];
  const triggers = Array.isArray(op.triggers) ? op.triggers : ['appear'];
  const configValue = op.config ? JSON.stringify(op.config, null, 2) : '{}';
  const isFill = op.type === 'fill';

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
          <input class="editor-input-sm" id="edit-custom-trigger-${index}" placeholder="+ custom" style="width:60px;">
        </div>
      </div>

      <!-- Row 2: Config JSON -->
      <div class="editor-row" style="align-items:flex-start;">
        <span class="editor-label">Config</span>
        <div style="flex:1;">
          <textarea class="editor-textarea" id="edit-config-${index}" spellcheck="false">${configValue}</textarea>
          ${isFill ? renderFillShortcuts(index) : ''}
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="editor-footer">
        <button class="btn-cancel" data-op-action="cancel" data-op-index="${index}">Cancel</button>
        <button class="btn-save" data-op-action="save" data-op-index="${index}">Save</button>
      </div>

    </div>
  `;
}

function renderFillShortcuts(index: number) {
  return `
    <div style="margin-top:2px;display:flex;gap:4px;">
      <span style="font-size:9px;color:#666;">Insert:</span>
      <button class="shortcut-btn" data-action="insert-key" data-target="edit-config-${index}" data-val="{Enter}">Enter</button>
      <button class="shortcut-btn" data-action="insert-key" data-target="edit-config-${index}" data-val="{Tab}">Tab</button>
      <button class="shortcut-btn" data-action="insert-key" data-target="edit-config-${index}" data-val="{Esc}">Esc</button>
    </div>
  `;
}
