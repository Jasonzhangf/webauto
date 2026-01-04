interface VariableValue {
  name: string;
  value: any;
  type: string;
  isReadonly?: boolean;
  updatedAt?: number;
}

export class RootVariableViewer {
  private element: HTMLElement;
  private variables: Map<string, VariableValue> = new Map();
  private filter: string = '';
  private isPaused: boolean = false;

  constructor() {
    this.element = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public updateVariable(variable: VariableValue): void {
    if (this.isPaused) return;

    this.variables.set(variable.name, {
      ...variable,
      updatedAt: Date.now()
    });
    this.renderList();
    this.updateStats();
  }

  public updateBatch(variables: VariableValue[]): void {
    if (this.isPaused) return;

    variables.forEach(v => this.variables.set(v.name, { ...v, updatedAt: Date.now() }));
    this.renderList();
    this.updateStats();
  }

  public clearAll(): void {
    this.variables.clear();
    this.renderList();
    this.updateStats();
  }

  private render() {
    this.element.innerHTML = `
      <div class="root-variable-viewer" style="padding: 10px; background: #1e1e1e; border-top: 1px solid #3e3e3e; height: 100%; display: flex; flex-direction: column;">
        <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; color: #ccc; font-size: 11px;">Root Variables</span>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="varFilter" placeholder="Filter..." style="background: #333; border: 1px solid #555; color: #eee; padding: 2px 4px; font-size: 10px; width: 80px; border-radius: 2px;">
            <button id="btnPause" style="background: #333; border: 1px solid #555; color: #eee; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Pause</button>
            <button id="btnClear" style="background: #333; border: 1px solid #555; color: #eee; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Clear</button>
          </div>
        </div>
        
        <div id="stats" style="margin-bottom: 6px; font-size: 10px; color: #888; display: flex; gap: 10px;">
          <span>Total: <span id="statTotal">0</span></span>
          <span>Updated: <span id="statUpdated">0</span></span>
        </div>
        
        <div id="variableList" style="flex: 1; overflow-y: auto; background: #252526; padding: 4px; border: 1px solid #333; font-family: monospace; font-size: 10px;">
          <!-- Variables will be injected here -->
        </div>
      </div>
    `;

    this.bindEvents();
    this.updateStats();
  }

  private renderList(): void {
    const listEl = this.element.querySelector('#variableList');
    if (!listEl) return;

    const vars = Array.from(this.variables.values())
      .filter(v => !this.filter || v.name.toLowerCase().includes(this.filter.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (vars.length === 0) {
      listEl.innerHTML = '<div style="color: #666; font-style: italic; padding: 4px;">No variables defined...</div>';
      return;
    }

    listEl.innerHTML = vars.map(v => {
      const updatedTime = v.updatedAt ? new Date(v.updatedAt).toISOString().split('T')[1].slice(0, 12) : 'N/A';
      const valueStr = this.formatValue(v.value);

      return `
        <div class="variable-item" style="margin-bottom: 4px; padding: 4px; border-radius: 2px; background: #2a2a2a; border-left: 3px solid ${v.isReadonly ? '#666' : '#0e639c'};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: #9cdcfe; font-weight: bold; font-size: 10px;">${v.name}</span>
              <span style="color: #666; font-size: 9px;">(${v.type})</span>
              ${v.isReadonly ? '<span style="color: #888; font-size: 8px;">readonly</span>' : ''}
            </div>
            <span style="color: #666; font-size: 9px;">[${updatedTime}]</span>
          </div>
          <div style="color: #ce9178; font-size: 9px; margin-top: 2px; word-break: break-all;">${valueStr}</div>
        </div>
      `;
    }).join('');
  }

  private formatValue(value: any): string {
    try {
      if (typeof value === 'object') {
        const str = JSON.stringify(value);
        return str.length > 150 ? str.slice(0, 150) + '...' : str;
      }
      return String(value);
    } catch {
      return String(value);
    }
  }

  private updateStats(): void {
    (this.element.querySelector('#statTotal') as HTMLElement).textContent = String(this.variables.size);
    (this.element.querySelector('#statUpdated') as HTMLElement).textContent = String(this.variables.size);
  }

  private bindEvents(): void {
    const btnPause = this.element.querySelector('#btnPause');
    const btnClear = this.element.querySelector('#btnClear');
    const inputFilter = this.element.querySelector('#varFilter') as HTMLInputElement | null;

    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.isPaused = !this.isPaused;
        btnPause.textContent = this.isPaused ? 'Resume' : 'Pause';
        (btnPause as HTMLElement).style.background = this.isPaused ? '#d8a019' : '#333';
        (btnPause as HTMLElement).style.color = this.isPaused ? '#000' : '#eee';
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.clearAll();
      });
    }

    if (inputFilter) {
      inputFilter.addEventListener('input', (e) => {
        this.filter = (e.target as HTMLInputElement).value;
        this.renderList();
      });
    }
  }
}

export const VARIABLE_VIEWER_STYLES = `
.root-variable-viewer {
  font-family: 'Consolas', 'Monaco', monospace;
}
`;
