import { BASIC_EVENTS, PAGE_EVENTS, OPERATION_TYPES, isRootContainer } from './operation-types.js';

export function renderOperationList(operations: any[], isRoot: boolean): string {
  if (!operations.length) {
    return '<div style="font-size:10px;color:#666;padding:8px 0;">暂无 operation，请点击下方 + 添加</div>';
  }

  return operations
    .map((op: any, index: number) => {
      const key = op.id || op.type || `op-${index + 1}`;
      const triggers = Array.isArray(op.triggers) ? op.triggers.join(', ') : 'appear';
      const configPreview = op.config ? JSON.stringify(op.config).slice(0, 40) : '{}';
      const enabled = op.enabled !== false;
      
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;border-bottom:1px solid #2a2a2a;background:${enabled ? '#1a1a1a' : '#151515'};">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="color:${enabled ? '#ffd700' : '#666'};font-size:11px;font-weight:500;">${key}</span>
              <span style="color:#888;font-size:10px;">${op.type || ''}</span>
              <span style="color:#555;font-size:10px;">${triggers}</span>
            </div>
            <div style="color:#666;font-size:9px;margin-top:2px;">${configPreview}</div>
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            <button data-op-index="${index}" data-op-action="test" style="font-size:9px;padding:2px 4px;">测试</button>
            <button data-op-index="${index}" data-op-action="edit" style="font-size:9px;padding:2px 4px;">编辑</button>
            <button data-op-index="${index}" data-op-action="delete" style="font-size:9px;padding:2px 4px;">删除</button>
          </div>
        </div>`;
    })
    .join('');
}

export function renderOperationEditor(op: any, index: number, isRoot: boolean): string {
  const eventOptions = [...BASIC_EVENTS, ...(isRoot ? PAGE_EVENTS : [])];
  const triggers = Array.isArray(op.triggers) ? op.triggers : ['appear'];
  const configValue = op.config ? JSON.stringify(op.config, null, 2) : '{}';

  return `<div id="opEditor-${index}" style="margin-top:8px;padding:8px;background:#1a1a1a;border:1px solid #333;border-radius:4px;">
      <div style="display:flex;gap:8px;margin-bottom:6px;">
        <label style="font-size:10px;color:#999;">类型:</label>
        <select data-op-edit-type="${index}" style="flex:1;font-size:10px;background:#1e1e1e;color:#ccc;border:1px solid #3e3e3e;">
          ${OPERATION_TYPES.map(type => `<option value="${type.value}" ${op.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}
        </select>
      </div>

      <div style="margin-bottom:6px;">
        <label style="font-size:10px;color:#999;">事件触发:</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">
          ${eventOptions.map(event => `<label style="font-size:9px;color:#ccc;display:flex;align-items:center;gap:2px;">
              <input type="checkbox" data-op-trigger="${index}" value="${event}" ${triggers.includes(event) ? 'checked' : ''} />
              ${event}
            </label>`).join('')}
        </div>
        <input type="text" data-op-custom-trigger="${index}" placeholder="自定义事件 (custom:xxx)" style="width:100%;margin-top:4px;font-size:9px;padding:2px 4px;background:#1e1e1e;color:#ccc;border:1px solid #3e3e3e;" />
      </div>

      <div style="margin-bottom:6px;">
        <label style="font-size:10px;color:#999;">配置 (JSON):</label>
        <textarea data-op-config="${index}" style="width:100%;height:60px;margin-top:2px;background:#1e1e1e;color:#ccc;border:1px solid #3e3e3e;font-family:Consolas,monospace;font-size:9px;padding:4px;">${configValue}</textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:6px;">
        <button data-op-index="${index}" data-op-action="save" style="font-size:9px;padding:2px 6px;">保存</button>
        <button data-op-index="${index}" data-op-action="cancel" style="font-size:9px;padding:2px 6px;">取消</button>
      </div>
    </div>`;
}
