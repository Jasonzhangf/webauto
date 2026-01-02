/**
 * UI Components for Interactive Capture Mode
 */

export interface CaptureState {
  isCapturing: boolean;
  selectedProfile: string;
  targetUrl: string;
}

export class CapturePanel {
  private element: HTMLElement;
  private state: CaptureState = {
    isCapturing: false,
    selectedProfile: 'weibo_fresh',
    targetUrl: 'https://weibo.com'
  };
  
  private onStartCapture: ((state: CaptureState) => void) | null = null;
  private onStopCapture: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'capture-panel';
    this.element.style.cssText = `
      padding: 10px;
      border-bottom: 1px solid #3e3e3e;
      background: #252526;
      display: none;
      flex-direction: column;
      gap: 8px;
    `;
    
    this.render();
  }

  setCallbacks(onStart: (state: CaptureState) => void, onStop: () => void) {
    this.onStartCapture = onStart;
    this.onStopCapture = onStop;
  }

  show() {
    this.element.style.display = 'flex';
  }

  hide() {
    this.element.style.display = 'none';
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render() {
    this.element.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: center;">
        <label style="font-size: 11px; width: 50px;">Profile:</label>
        <select id="profile-select" style="flex: 1; padding: 4px; background: #3c3c3c; border: 1px solid #555; color: #ccc; border-radius: 2px;">
          <option value="weibo_fresh">weibo_fresh</option>
          <option value="default">default</option>
        </select>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <label style="font-size: 11px; width: 50px;">URL:</label>
        <input id="url-input" type="text" value="${this.state.targetUrl}" style="flex: 1; padding: 4px; background: #3c3c3c; border: 1px solid #555; color: #ccc; border-radius: 2px;">
      </div>
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button id="btn-toggle-capture" style="flex: 1; padding: 6px; background: #0e639c; border: none; color: white;">启动捕获模式</button>
      </div>
    `;

    const profileSelect = this.element.querySelector('#profile-select') as HTMLSelectElement;
    const urlInput = this.element.querySelector('#url-input') as HTMLInputElement;
    const toggleBtn = this.element.querySelector('#btn-toggle-capture') as HTMLButtonElement;

    profileSelect.addEventListener('change', (e) => {
      this.state.selectedProfile = (e.target as HTMLSelectElement).value;
    });

    urlInput.addEventListener('input', (e) => {
      this.state.targetUrl = (e.target as HTMLInputElement).value;
    });

    toggleBtn.addEventListener('click', () => {
      if (this.state.isCapturing) {
        this.stopCapture();
      } else {
        this.startCapture();
      }
    });
  }

  private startCapture() {
    this.state.isCapturing = true;
    const btn = this.element.querySelector('#btn-toggle-capture') as HTMLButtonElement;
    btn.textContent = '停止捕获模式';
    btn.style.background = '#c42b1c';
    
    if (this.onStartCapture) {
      this.onStartCapture(this.state);
    }
  }

  private stopCapture() {
    this.state.isCapturing = false;
    const btn = this.element.querySelector('#btn-toggle-capture') as HTMLButtonElement;
    btn.textContent = '启动捕获模式';
    btn.style.background = '#0e639c';
    
    if (this.onStopCapture) {
      this.onStopCapture();
    }
  }
}

export class ContainerTree {
  private element: HTMLElement;
  private containers: any[] = [];
  private onSelect: ((id: string) => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'container-tree';
    this.element.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      font-family: system-ui;
    `;
  }

  setContainers(containers: any[]) {
    this.containers = containers;
    this.render();
  }

  setOnSelect(callback: (id: string) => void) {
    this.onSelect = callback;
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render() {
    this.element.innerHTML = '';
    
    // Simple list rendering for now, tree structure to be implemented
    this.containers.forEach(container => {
      const node = document.createElement('div');
      node.style.cssText = `
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 2px;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      node.className = 'container-node';
      node.dataset.id = container.id;
      
      node.innerHTML = `
        <span style="font-size: 10px; color: #888;">${container.metadata.tagName}</span>
        <span style="font-size: 11px; color: #ccc;">${container.name || container.id}</span>
      `;
      
      node.addEventListener('click', () => {
        this.element.querySelectorAll('.container-node').forEach(el => {
          (el as HTMLElement).style.background = 'transparent';
        });
        node.style.background = '#37373d';
        
        if (this.onSelect) {
          this.onSelect(container.id);
        }
      });
      
      this.element.appendChild(node);
    });
  }
}
