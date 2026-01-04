interface OperationStatus {
  id: string;
  containerId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  error?: string;
  progress?: number;
}

export class OperationStatusPanel {
  private element: HTMLElement;
  private statuses: Map<string, OperationStatus> = new Map();
  private isPaused: boolean = false;
  private autoScroll: boolean = true;

  constructor() {
    this.element = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public updateStatus(status: OperationStatus): void {
    if (this.isPaused) return;

    this.statuses.set(status.id, status);
    this.renderStatusList();
    this.updateStats();
  }

  public clearAll(): void {
    this.statuses.clear();
    this.renderStatusList();
    this.updateStats();
  }

  private render() {
    this.element.innerHTML = `
      <div class="operation-status-panel" style="padding: 10px; background: #1e1e1e; border-top: 1px solid #3e3e3e; height: 100%; display: flex; flex-direction: column;">
        <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; color: #ccc; font-size: 11px;">Operation Status</span>
          <div style="display: flex; gap: 6px;">
            <button id="btnPause" style="background: #333; border: 1px solid #555; color: #eee; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Pause</button>
            <button id="btnClear" style="background: #333; border: 1px solid #555; color: #eee; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Clear</button>
            <button id="btnAutoScroll" style="background: #0e639c; border: 1px solid #555; color: #eee; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Auto-scroll</button>
          </div>
        </div>
        
        <div id="stats" style="margin-bottom: 6px; font-size: 10px; color: #888; display: flex; gap: 10px;">
          <span>Total: <span id="statTotal">0</span></span>
          <span>Pending: <span id="statPending">0</span></span>
          <span>Running: <span id="statRunning">0</span></span>
          <span>Completed: <span id="statCompleted">0</span></span>
          <span>Failed: <span id="statFailed">0</span></span>
        </div>
        
        <div id="statusList" style="flex: 1; overflow-y: auto; background: #252526; padding: 4px; border: 1px solid #333; font-family: monospace; font-size: 10px;">
          <!-- Status items will be injected here -->
        </div>
      </div>
    `;

    this.bindEvents();
    this.updateStats();
  }

  private renderStatusList(): void {
    const listEl = this.element.querySelector('#statusList');
    if (!listEl) return;

    const statusArray = Array.from(this.statuses.values()).sort((a, b) => {
      // Sort by start time, with running/pending first
      const aTime = a.startTime || Date.now();
      const bTime = b.startTime || Date.now();
      
      if (a.status === 'running' || a.status === 'pending') return -1;
      if (b.status === 'running' || b.status === 'pending') return 1;
      return bTime - aTime; // Newest first for completed/failed
    });

    if (statusArray.length === 0) {
      listEl.innerHTML = '<div style="color: #666; font-style: italic; padding: 4px;">No operations running...</div>';
      return;
    }

    listEl.innerHTML = statusArray.map(status => {
      const startTime = status.startTime ? new Date(status.startTime).toISOString().split('T')[1].slice(0, 12) : 'N/A';
      const duration = status.startTime && status.endTime ? 
        `${((status.endTime - status.startTime) / 1000).toFixed(2)}s` : 
        status.startTime ? `${((Date.now() - status.startTime) / 1000).toFixed(2)}s` : 'N/A';
      
      let statusColor = '#888'; // Default
      if (status.status === 'running') statusColor = '#2196f3';
      else if (status.status === 'completed') statusColor = '#4caf50';
      else if (status.status === 'failed') statusColor = '#f44336';
      else if (status.status === 'pending') statusColor = '#ff9800';

      return `
        <div class="status-item" style="margin-bottom: 4px; padding: 4px; border-radius: 2px; background: #2a2a2a; border-left: 3px solid ${statusColor};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: #dcdcaa; font-weight: bold; font-size: 10px;">${status.type}</span>
              <span style="color: #9cdcfe; font-size: 9px;">${status.containerId}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: ${statusColor}; font-size: 9px; text-transform: uppercase;">${status.status}</span>
              <span style="color: #666; font-size: 9px;">[${startTime}]</span>
              <span style="color: #666; font-size: 9px;">${duration}</span>
            </div>
          </div>
          ${status.progress ? `
            <div style="margin-top: 3px;">
              <div style="height: 3px; background: #333; border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: ${status.progress}%; background: #0e639c;"></div>
              </div>
              <div style="font-size: 8px; color: #666; text-align: right;">${Math.round(status.progress)}%</div>
            </div>
          ` : ''}
          ${status.error ? `
            <div style="margin-top: 2px; color: #f44336; font-size: 9px; word-break: break-all;">Error: ${status.error}</div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Auto-scroll to bottom if enabled
    if (this.autoScroll) {
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  private updateStats(): void {
    const stats: Record<string, number> = {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0
    };

    for (const status of this.statuses.values()) {
      stats.total++;
      stats[status.status]++;
    }

    (this.element.querySelector('#statTotal') as HTMLElement).textContent = String(stats.total);
    (this.element.querySelector('#statPending') as HTMLElement).textContent = String(stats.pending);
    (this.element.querySelector('#statRunning') as HTMLElement).textContent = String(stats.running);
    (this.element.querySelector('#statCompleted') as HTMLElement).textContent = String(stats.completed);
    (this.element.querySelector('#statFailed') as HTMLElement).textContent = String(stats.failed);
  }

  private bindEvents(): void {
    const btnPause = this.element.querySelector('#btnPause');
    const btnClear = this.element.querySelector('#btnClear');
    const btnAutoScroll = this.element.querySelector('#btnAutoScroll');

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

    if (btnAutoScroll) {
      btnAutoScroll.addEventListener('click', () => {
        this.autoScroll = !this.autoScroll;
        btnAutoScroll.textContent = this.autoScroll ? 'Auto-scroll' : 'Manual-scroll';
        (btnAutoScroll as HTMLElement).style.background = this.autoScroll ? '#0e639c' : '#333';
      });
    }
  }
}

export const STATUS_PANEL_STYLES = `
.operation-status-panel {
  font-family: 'Consolas', 'Monaco', monospace;
}
`;
