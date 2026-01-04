interface MonitorMessage {
  type: string;
  payload: any;
  timestamp: number;
}

export class MessageMonitorPanel {
  private containerId: string;
  private messages: MonitorMessage[] = [];
  private maxMessages: number = 50;
  private isPaused: boolean = false;
  private element: HTMLElement;
  private filter: string = '';

  constructor(options: {
    containerId: string;
  }) {
    this.containerId = options.containerId;
    this.element = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public addMessage(msg: MonitorMessage) {
    if (this.isPaused) return;

    // Apply filter
    if (this.filter && !msg.type.toLowerCase().includes(this.filter.toLowerCase())) {
      return;
    }

    this.messages.unshift(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages.pop();
    }
    this.updateList();
  }

  private render() {
    this.element.innerHTML = `
      <div class="message-monitor-panel" style="padding: 10px; background: #1e1e1e; border-top: 1px solid #3e3e3e; height: 100%; display: flex; flex-direction: column;">
        <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; color: #ccc; font-size: 11px;">Message Monitor</span>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="msgFilter" placeholder="Filter..." style="background: #333; border: 1px solid #555; color: #eee; padding: 2px 4px; font-size: 10px; width: 80px; border-radius: 2px;">
            <button id="btnPause" style="background: #333; border: 1px solid #555; color: #eee; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Pause</button>
            <button id="btnClear" style="background: #333; border: 1px solid #555; color: #eee; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Clear</button>
          </div>
        </div>
        
        <div id="monitorList" style="flex: 1; overflow-y: auto; background: #252526; padding: 4px; border: 1px solid #333; font-family: monospace; font-size: 10px;">
          <!-- Messages will be injected here -->
        </div>
      </div>
    `;

    this.bindEvents();
    this.updateList();
  }

  private updateList() {
    const listEl = this.element.querySelector('#monitorList');
    if (!listEl) return;

    if (this.messages.length === 0) {
      listEl.innerHTML = '<div style="color: #666; font-style: italic; padding: 4px;">Waiting for messages...</div>';
      return;
    }

    listEl.innerHTML = this.messages.map(msg => {
      const time = new Date(msg.timestamp).toISOString().split('T')[1].slice(0, 12);
      let typeColor = '#dcdcaa'; // Default yellow-ish
      
      if (msg.type.includes('ERROR')) typeColor = '#f44336';
      else if (msg.type.includes('SUCCESS') || msg.type.includes('COMPLETE')) typeColor = '#4caf50';
      else if (msg.type.includes('START') || msg.type.includes('BEGIN')) typeColor = '#2196f3';
      
      return `
        <div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #333;">
          <div style="display: flex; gap: 8px;">
            <span style="color: #666;">[${time}]</span>
            <span style="color: ${typeColor}; font-weight: bold;" title="${msg.type}">${msg.type}</span>
          </div>
          <div style="color: #9cdcfe; margin-left: 58px; white-space: pre-wrap; word-break: break-all;">${this.formatPayload(msg.payload)}</div>
        </div>
      `;
    }).join('');
  }

  private formatPayload(payload: any): string {
    try {
      if (typeof payload === 'object') {
        const str = JSON.stringify(payload);
        return str.length > 100 ? str.slice(0, 100) + '...' : str;
      }
      return String(payload);
    } catch {
      return String(payload);
    }
  }

  private bindEvents() {
    const btnPause = this.element.querySelector('#btnPause');
    const btnClear = this.element.querySelector('#btnClear');
    const inputFilter = this.element.querySelector('#msgFilter');

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
        this.messages = [];
        this.updateList();
      });
    }

    if (inputFilter) {
      inputFilter.addEventListener('input', (e) => {
        this.filter = (e.target as HTMLInputElement).value;
        // Note: Filtering currently only applies to incoming messages
        // Real implementation might re-filter existing history
      });
    }
  }
}

export const MONITOR_STYLES = `
.message-monitor-panel {
  font-family: 'Consolas', 'Monaco', monospace;
}
.message-monitor-panel input:focus {
  outline: 1px solid #007acc;
}
.message-monitor-panel button:hover {
  background: #444 !important;
}
.message-monitor-panel button:active {
  background: #555 !important;
}
#monitorList::-webkit-scrollbar {
  width: 8px;
  background: #1e1e1e;
}
#monitorList::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}
#monitorList::-webkit-scrollbar-thumb:hover {
  background: #4f4f4f;
}
`;
