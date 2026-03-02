import type { DashboardLayout } from './layout.mts';
import type { DashboardState } from './types.mts';
import { createEl } from '../../ui-components.mts';

export function createLogWriter(ui: DashboardLayout, state: DashboardState) {
  function addLog(line: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const logLine = createEl('div', { className: 'log-line' });
    logLine.innerHTML = `<span class="log-time">[${ts}]</span> <span class="log-${type}">${line}</span>`;
    ui.logsContainer.appendChild(logLine);

    while (ui.logsContainer.children.length > state.maxLogs) {
      ui.logsContainer.removeChild(ui.logsContainer.firstChild!);
    }

    if (state.logsExpanded) {
      ui.logsContainer.scrollTop = ui.logsContainer.scrollHeight;
    }
  }

  return { addLog };
}
