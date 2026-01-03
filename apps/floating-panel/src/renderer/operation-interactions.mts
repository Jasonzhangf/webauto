import { renderOperationEditor } from './operation-helpers.js';

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
       
       // Handle editor specific clicks (like chips)
       const chip = target.closest('[data-action="toggle-trigger"]') as HTMLElement;
       if (chip) {
         chip.classList.toggle('active');
       }
       
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
  const customTriggerInput = editor.querySelector(`#edit-custom-trigger-${index}`) as HTMLInputElement;
  const valueInput = editor.querySelector(`#edit-value-${index}`) as HTMLInputElement;

  // Gather active triggers
  const activeChips = editor.querySelectorAll(`.editor-chip.active`);
  const triggers = Array.from(activeChips).map(el => el.getAttribute('data-val')).filter(Boolean) as string[];
  
  if (customTriggerInput && customTriggerInput.value.trim()) {
    triggers.push(customTriggerInput.value.trim());
  }

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

  // Update Op
  const op = operations[index];
  // Type is fixed, not updated from UI
  op.triggers = triggers;
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
