import { renderOperationEditor } from './operation-helpers.js';
import { normalizeTrigger, getTriggerMessage, type Trigger, type TriggerCondition, type MessageType, type ConditionOperator } from './operation-types.js';

export interface InteractionCallbacks {
  onUpdate: (operations: any[]) => void;
  onExecute: (op: any, index: number) => void;
  isRoot: boolean;
}

export function setupOperationListDelegation(
  listContainer: HTMLElement,
  operations: any[],
  callbacks: InteractionCallbacks
) {
  // Main click handler
  listContainer.onclick = (e) => {
    const target = e.target as HTMLElement;

    // Check for action buttons first
    const actionBtn = target.closest('[data-op-action]') as HTMLElement;

    if (actionBtn) {
      handleAction(actionBtn, operations, callbacks);
      e.stopPropagation();
      return;
    }

    // Check for trigger edit/delete buttons
    const triggerBtn = target.closest('.btn-edit-trigger, .btn-delete-trigger, .btn-add-trigger') as HTMLElement;
    if (triggerBtn) {
      handleTriggerAction(triggerBtn, operations, callbacks);
      e.stopPropagation();
      return;
    }

    // Check for row click (toggle selection/edit)
    const row = target.closest('.op-row') as HTMLElement;
    if (row) {
      // Toggle active state visualization
      listContainer.querySelectorAll('.op-row').forEach(el => el.classList.remove('active'));
      row.classList.add('active');

      // Auto-expand editor for the clicked row if not clicking buttons
      const indexStr = row.getAttribute('data-op-index');
      if (indexStr) {
        const index = parseInt(indexStr, 10);
        if (operations[index]) { toggleEditor(index, operations[index], callbacks.isRoot); }
      }
    }

    // Check for inline editor interactions (Delegation for dynamic content)
    const editorContainer = target.closest('.inline-editor');
    if (editorContainer) {
       // Stop propagation for clicks inside editor to prevent row toggling issues
       e.stopPropagation();

       const shortcutBtn = target.closest('[data-action="insert-key"]') as HTMLElement;
       if (shortcutBtn) {
         const targetId = shortcutBtn.getAttribute('data-target');
         const val = shortcutBtn.getAttribute('data-val');
         if (targetId && val) {
           const textarea = document.getElementById(targetId) as HTMLInputElement | HTMLTextAreaElement;
           if (textarea) insertAtCursor(textarea, val);
         }
       }
    }
  };
}

function handleTriggerAction(btn: HTMLElement, operations: any[], callbacks: InteractionCallbacks) {
  const opIndexStr = btn.getAttribute('data-op-index');
  const triggerIndexStr = btn.getAttribute('data-trigger-index');
  const opIndex = opIndexStr ? parseInt(opIndexStr, 10) : -1;
  const triggerIndex = triggerIndexStr ? parseInt(triggerIndexStr, 10) : -1;

  if (btn.classList.contains('btn-add-trigger')) {
    // Add new trigger
    showTriggerEditor(opIndex, -1, null, operations, callbacks);
  } else if (btn.classList.contains('btn-edit-trigger') && triggerIndex >= 0) {
    // Edit existing trigger
    const op = operations[opIndex];
    const trigger = op?.triggers?.[triggerIndex];
    if (trigger) {
      showTriggerEditor(opIndex, triggerIndex, trigger, operations, callbacks);
    }
  } else if (btn.classList.contains('btn-delete-trigger') && triggerIndex >= 0) {
    // Delete trigger
    const op = operations[opIndex];
    if (op?.triggers) {
      op.triggers.splice(triggerIndex, 1);
      callbacks.onUpdate([...operations]);
      // Re-render editor
      toggleEditor(opIndex, op, callbacks.isRoot);
    }
  }
}

function showTriggerEditor(
  opIndex: number,
  triggerIndex: number,
  existingTrigger: any,
  operations: any[],
  callbacks: InteractionCallbacks
) {
  const normalized = existingTrigger ? normalizeTrigger(existingTrigger) : { message: 'appear' };
  const isNew = triggerIndex === -1;

  const messageOptions = callbacks.isRoot
    ? [...['appear', 'click', 'input', 'change', 'focused', 'defocused'], 'page:load', 'page:scroll', 'page:navigate', 'MSG_CONTAINER_ROOT_SCROLL_COMPLETE', 'MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE', 'MSG_CONTAINER_ROOT_VAR_CHANGED']
    : ['appear', 'click', 'input', 'change', 'focused', 'defocused'];

  const operatorOptions: ConditionOperator[] = ['==', '!=', '>', '<', '>=', '<=', 'exists', 'not-exists'];

  const html = `
    <div class="trigger-editor-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;" id="trigger-editor-modal">
      <div style="background:#1e1e1e;border:1px solid #444;padding:16px;border-radius:4px;min-width:400px;max-width:600px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:12px;color:#fff;">${isNew ? 'Add Trigger' : 'Edit Trigger'}</div>

        <!-- Message Selection -->
        <div style="margin-bottom:8px;">
          <label style="font-size:10px;color:#aaa;display:block;margin-bottom:4px;">Message:</label>
          <select id="trigger-message-select" style="width:100%;background:#252526;border:1px solid#444;color:#dcdcaa;padding:4px;font-size:10px;">
            ${messageOptions.map(msg => `<option value="${msg}" ${normalized.message === msg ? 'selected' : ''}>${msg}</option>`).join('')}
          </select>
        </div>

        <!-- Condition Toggle -->
        <div style="margin-bottom:8px;">
          <label style="font-size:10px;color:#aaa;display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="trigger-has-condition" ${normalized.condition ? 'checked' : ''}>
            <span>Add Condition</span>
          </label>
        </div>

        <!-- Condition Editor -->
        <div id="trigger-condition-panel" style="display:${normalized.condition ? 'block' : 'none'};margin-bottom:12px;padding:8px;background:#252526;border:1px solid #333;border-radius:2px;">
          <div style="margin-bottom:6px;">
            <label style="font-size:9px;color:#888;display:block;margin-bottom:2px;">Variable:</label>
            <input type="text" id="trigger-var" value="${normalized.condition?.var || ''}" placeholder="e.g. count or root.isReady" style="width:100%;background:#1e1e1e;border:1px solid #444;color:#dcdcaa;padding:3px;font-size:10px;font-family:monospace;">
          </div>
          <div style="margin-bottom:6px;">
            <label style="font-size:9px;color:#888;display:block;margin-bottom:2px;">Operator:</label>
            <select id="trigger-op" style="width:100%;background:#1e1e1e;border:1px solid #444;color:#dcdcaa;padding:3px;font-size:10px;">
              ${operatorOptions.map(op => `<option value="${op}" ${normalized.condition?.op === op ? 'selected' : ''}>${op}</option>`).join('')}
            </select>
          </div>
          <div id="trigger-value-row" style="${normalized.condition?.op === 'exists' || normalized.condition?.op === 'not-exists' ? 'display:none;' : ''}">
            <label style="font-size:9px;color:#888;display:block;margin-bottom:2px;">Value:</label>
            <input type="text" id="trigger-value" value="${normalized.condition?.value !== undefined ? normalized.condition.value : ''}" placeholder="e.g. 10 or true" style="width:100%;background:#1e1e1e;border:1px solid #444;color:#dcdcaa;padding:3px;font-size:10px;font-family:monospace;">
          </div>
        </div>

        <!-- Footer -->
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="trigger-cancel-btn" style="padding:4px 12px;background:#444;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:10px;">Cancel</button>
          <button id="trigger-save-btn" style="padding:4px 12px;background:#0e639c;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:10px;">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  const modal = document.getElementById('trigger-editor-modal');
  const hasConditionCheckbox = document.getElementById('trigger-has-condition') as HTMLInputElement;
  const conditionPanel = document.getElementById('trigger-condition-panel') as HTMLElement;
  const opSelect = document.getElementById('trigger-op') as HTMLSelectElement;
  const valueRow = document.getElementById('trigger-value-row') as HTMLElement;

  hasConditionCheckbox.onchange = () => {
    conditionPanel.style.display = hasConditionCheckbox.checked ? 'block' : 'none';
  };

  opSelect.onchange = () => {
    const op = opSelect.value;
    valueRow.style.display = (op === 'exists' || op === 'not-exists') ? 'none' : 'block';
  };

  document.getElementById('trigger-cancel-btn')!.onclick = () => {
    modal?.remove();
  };

  document.getElementById('trigger-save-btn')!.onclick = () => {
    const messageSelect = document.getElementById('trigger-message-select') as HTMLSelectElement;
    const varInput = document.getElementById('trigger-var') as HTMLInputElement;
    const opInput = document.getElementById('trigger-op') as HTMLSelectElement;
    const valueInput = document.getElementById('trigger-value') as HTMLInputElement;

    const newTrigger: Trigger = {
      message: messageSelect.value as MessageType
    };

    if (hasConditionCheckbox.checked) {
      const varName = varInput.value.trim();
      const operator = opInput.value as ConditionOperator;

      if (!varName) {
        alert('Variable name is required for condition');
        return;
      }

      const condition: TriggerCondition = {
        var: varName,
        op: operator
      };

      if (operator !== 'exists' && operator !== 'not-exists') {
        const rawValue = valueInput.value.trim();
        // Try to parse as number or boolean
        let parsedValue: any = rawValue;
        if (rawValue === 'true') parsedValue = true;
        else if (rawValue === 'false') parsedValue = false;
        else if (!isNaN(Number(rawValue))) parsedValue = Number(rawValue);

        condition.value = parsedValue;
      }

      newTrigger.condition = condition;
    }

    // Update operation
    const op = operations[opIndex];
    if (!op) return;

    if (!op.triggers) op.triggers = [];

    if (isNew) {
      op.triggers.push(newTrigger);
    } else {
      op.triggers[triggerIndex] = newTrigger;
    }

    callbacks.onUpdate([...operations]);
    modal?.remove();

    // Re-render editor
    toggleEditor(opIndex, op, callbacks.isRoot);
  };
}

function handleAction(btn: HTMLElement, operations: any[], callbacks: InteractionCallbacks) {
  const action = btn.getAttribute('data-op-action');
  const indexStr = btn.getAttribute('data-op-index');
  const index = indexStr ? parseInt(indexStr, 10) : -1;
  
  if (index === -1 && action !== 'save' && action !== 'cancel') return;
  const op = index >= 0 ? operations[index] : null;

  switch (action) {
    case 'test':
      if (op) callbacks.onExecute(op, index);
      break;
      
    case 'edit':
      if (op) toggleEditor(index, op, callbacks.isRoot);
      break;
      
    case 'delete':
      if (confirm('Delete this operation?')) {
        const newOps = [...operations];
        newOps.splice(index, 1);
        callbacks.onUpdate(newOps);
      }
      break;
      
    case 'cancel':
      hideEditor(index);
      break;
      
    case 'save':
      saveEditor(index, operations, callbacks);
      break;
  }
}

function toggleEditor(index: number, op: any, isRoot: boolean) {
  // Hide all other editors
  document.querySelectorAll('.op-editor-container').forEach(el => {
    if (el.id !== `op-editor-container-${index}`) {
      (el as HTMLElement).style.display = 'none';
      el.innerHTML = '';
    }
  });

  const container = document.getElementById(`op-editor-container-${index}`);
  if (!container) return;
  
  if (container.style.display === 'block') {
    container.style.display = 'none';
    container.innerHTML = '';
  } else {
    container.innerHTML = renderOperationEditor(op, index, isRoot);
    container.style.display = 'block';
  }
}

function hideEditor(index: number) {
  const container = document.getElementById(`op-editor-container-${index}`);
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function saveEditor(index: number, operations: any[], callbacks: InteractionCallbacks) {
  const editor = document.getElementById(`opEditor-${index}`);
  if (!editor) return;

  const configTextarea = editor.querySelector(`#edit-config-${index}`) as HTMLTextAreaElement;
  const valueInput = editor.querySelector(`#edit-value-${index}`) as HTMLInputElement;

  // Parse Config
  let newConfig: any = {};
  try {
    newConfig = JSON.parse(configTextarea.value);
  } catch (e) {
    alert('Invalid JSON Config');
    return;
  }

  // Sync Value Input if present
  if (valueInput) {
    newConfig['value'] = valueInput.value;
  }

  // Update Op (triggers are managed separately via trigger editor)
  const op = operations[index];
  op.config = newConfig;

  hideEditor(index);
  callbacks.onUpdate([...operations]);
}

function insertAtCursor(myField: HTMLInputElement | HTMLTextAreaElement, myValue: string) {
  if (myField.selectionStart || myField.selectionStart === 0) {
    const startPos = myField.selectionStart || 0;
    const endPos = myField.selectionEnd || 0;
    myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
    myField.selectionStart = startPos + myValue.length;
    myField.selectionEnd = startPos + myValue.length;
  } else {
    myField.value += myValue;
  }
  
  // Trigger input event if needed for listeners (optional)
  myField.dispatchEvent(new Event('input', { bubbles: true }));
}
