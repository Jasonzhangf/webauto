import { Operation } from './operation-types.js';

// CSS Styles for new UI components
export const UI_STYLES = `
  /* Table/List Styles */
  .op-list-wrapper {
    display: flex;
    flex-direction: column;
    background: #1e1e1e;
    border: 1px solid #3e3e3e;
    border-radius: 2px;
  }
  
  .op-row {
    display: flex;
    align-items: center;
    padding: 3px 6px;
    border-bottom: 1px solid #2a2a2a;
    gap: 8px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .op-row:last-child { border-bottom: none; }
  .op-row:hover { background: #2a2d2e; }
  .op-row.active { background: #094771; }
  .op-row.op-disabled { opacity: 0.5; }
  .op-row.dragging { opacity: 0.4; background: #333; }
  
  /* Tags */
  .tag-trigger {
    display: inline-block;
    padding: 0 4px;
    border-radius: 2px;
    font-size: 9px;
    background: #3a2e2b;
    border: 1px solid #5a4b45;
    color: #ce9178;
    margin-right: 2px;
  }
  
  /* Icon Buttons */
  .icon-btn {
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 1px 3px;
    border-radius: 2px;
    font-size: 10px;
  }
  .icon-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
  .test-btn:hover { color: #7ebd7e; }
  .del-btn:hover { color: #f48771; }
  
  /* Editor Styles */
  .op-editor-container {
    background: #181818;
    border-bottom: 1px solid #333;
  }
  .inline-editor {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .editor-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .editor-label {
    width: 40px;
    font-size: 10px;
    color: #888;
    text-align: right;
    flex-shrink: 0;
  }
  .editor-select, .editor-input-sm {
    background: #252526;
    border: 1px solid #444;
    color: #ccc;
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 2px;
  }
  .editor-textarea {
    width: 100%;
    height: 60px;
    background: #252526;
    border: 1px solid #444;
    color: #dcdcaa;
    font-family: monospace;
    font-size: 10px;
    padding: 4px;
    resize: vertical;
  }
  
  /* Chips */
  .editor-chips-wrapper {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
  }
  .editor-chip {
    padding: 1px 6px;
    border: 1px solid #444;
    border-radius: 10px;
    font-size: 9px;
    color: #888;
    cursor: pointer;
    user-select: none;
  }
  .editor-chip.active {
    background: #0e639c;
    color: white;
    border-color: #0e639c;
  }
  
  /* Footer */
  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 2px;
  }
  .btn-save, .btn-cancel {
    padding: 3px 10px;
    border: 1px solid #444;
    border-radius: 2px;
    cursor: pointer;
    font-size: 10px;
  }
  .btn-save { background: #0e639c; color: white; border-color: #0e639c; }
  .btn-cancel { background: #333; color: #ccc; }
  .btn-save:hover { background: #1177bb; }
  .btn-cancel:hover { background: #444; }
  
  /* Shortcuts */
  .shortcut-btn {
    background: #333;
    border: 1px solid #444;
    color: #aaa;
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
    cursor: pointer;
  }
  .shortcut-btn:hover { background: #444; color: #fff; }
`;

// Inject styles once
let stylesInjected = false;
export function injectUIStyles() {
  if (stylesInjected) return;
  const styleEl = document.createElement('style');
  styleEl.textContent = UI_STYLES;
  document.head.appendChild(styleEl);
  stylesInjected = true;
}

export class CapturePanel {
  private element: HTMLElement;
  private state = { isCapturing: false };
  private onStartCapture: ((state: any) => void) | null = null;
  private onStopCapture: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('div'); // Dummy for now
  }
  
  setCallbacks(onStart: any, onStop: any) {
    this.onStartCapture = onStart;
    this.onStopCapture = onStop;
  }
  
  getElement() { return this.element; }
  show() {}
}

export class ContainerTree {
    private element: HTMLElement;
    constructor() { this.element = document.createElement('div'); }
    setContainers(c: any[]) {}
    setOnSelect(cb: any) {}
    getElement() { return this.element; }
}

export class OperationDragHandler {
  private container: HTMLElement;
  private operations: any[];
  private onReorder: (newOps: any[]) => void;
  private draggedIndex: number = -1;

  constructor(el: HTMLElement, ops: any[], cb: (newOps: any[]) => void) {
    this.container = el;
    this.operations = ops;
    this.onReorder = cb;
    this.init();
  }

  private init() {
    const rows = this.container.querySelectorAll('.op-row');
    rows.forEach(row => {
      row.addEventListener('dragstart', this.handleDragStart.bind(this));
      row.addEventListener('dragover', this.handleDragOver.bind(this));
      row.addEventListener('drop', this.handleDrop.bind(this));
      row.addEventListener('dragend', this.handleDragEnd.bind(this));
    });
  }

  private handleDragStart(e: Event) {
    const target = (e.target as HTMLElement).closest('.op-row');
    if (!target) return;
    
    this.draggedIndex = parseInt(target.getAttribute('data-op-index') || '-1', 10);
    target.classList.add('dragging');
    
    if (e instanceof DragEvent && e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(this.draggedIndex));
    }
  }

  private handleDragOver(e: Event) {
    if (e instanceof DragEvent) {
      e.preventDefault(); // Necessary for drop to work
      e.dataTransfer!.dropEffect = 'move';
    }
  }

  private handleDrop(e: Event) {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest('.op-row');
    if (!target) return;

    const targetIndex = parseInt(target.getAttribute('data-op-index') || '-1', 10);
    
    if (this.draggedIndex !== -1 && targetIndex !== -1 && this.draggedIndex !== targetIndex) {
      const newOps = [...this.operations];
      const [movedItem] = newOps.splice(this.draggedIndex, 1);
      newOps.splice(targetIndex, 0, movedItem);
      
      this.onReorder(newOps);
    }
  }

  private handleDragEnd(e: Event) {
    const target = (e.target as HTMLElement).closest('.op-row');
    if (target) {
      target.classList.remove('dragging');
    }
    this.draggedIndex = -1;
  }
}
