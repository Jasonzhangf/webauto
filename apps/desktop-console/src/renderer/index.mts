import { renderPreflight } from './tabs/preflight.mts';
import { renderDebug } from './tabs/debug.mts';
import { renderSettings } from './tabs/settings.mts';
import { renderLogs } from './tabs/logs.mts';
import { renderXiaohongshuTab } from './tabs/xiaohongshu.mts';
import { createEl } from './ui-components.mts';

declare global {
  interface Window {
    api: any;
  }
}

type TabId = 'xiaohongshu' | 'preflight' | 'debug' | 'settings' | 'logs';

const tabs: Array<{ id: TabId; label: string; render: (root: HTMLElement, ctx: any) => void }> = [
  { id: 'xiaohongshu', label: '小红书', render: renderXiaohongshuTab },
  { id: 'preflight', label: '预处理', render: renderPreflight },
  { id: 'debug', label: '调试', render: renderDebug },
  { id: 'settings', label: '设置', render: renderSettings },
  { id: 'logs', label: '日志', render: renderLogs },
];

const tabsEl = document.getElementById('tabs')!;
const contentEl = document.getElementById('content')!;
const statusEl = document.getElementById('status')!;
const mainEl = document.getElementById('main') as HTMLElement | null;

const ctx: any = {
  settings: null as any,
  activeRunId: null as string | null,
  _logLines: [] as string[],
  appendLog(line: string) {
    const l = String(line || '').trim();
    if (!l) return;
    this._logLines.push(l);
    // Logs tab 会接管渲染；这里不再直接写 DOM
  },
  clearLog() {
    this._logLines = [];
  },
  setStatus(s: string) {
    statusEl.textContent = s;
  },
  runScript(scriptPath: string, args: string[]) {
    window.api.runScript(scriptPath, args);
  },
  setActiveTab(id: TabId) {
    setActiveTab(id);
  },
};

function startDesktopHeartbeat() {
  const sendHeartbeat = async () => {
    try {
      if (typeof window.api?.desktopHeartbeat === 'function') {
        await window.api.desktopHeartbeat();
      }
    } catch {
      // ignore heartbeat errors
    }
  };

  void sendHeartbeat();
  const timer = setInterval(() => {
    void sendHeartbeat();
  }, 10_000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
}

async function loadSettings() {
  ctx.settings = await window.api.settingsGet();
}

function setActiveTab(id: TabId) {
  tabsEl.textContent = '';
  for (const t of tabs) {
    const el = createEl('div', { className: `tab ${t.id === id ? 'active' : ''}` }, [t.label]);
    el.addEventListener('click', () => setActiveTab(t.id));
    tabsEl.appendChild(el);
  }
  contentEl.textContent = '';
  const tab = tabs.find((x) => x.id === id)!;
  tab.render(contentEl, ctx);
}

function installCmdEvents() {
  window.api.onCmdEvent((evt: any) => {
    if (evt?.type === 'started') {
      ctx.activeRunId = evt.runId;
      ctx.appendLog(`[started] ${evt.title} pid=${evt.pid} runId=${evt.runId}`);
      ctx.setStatus(`running: ${evt.title}`);
    } else if (evt?.type === 'stdout') {
      ctx.appendLog(evt.line);
    } else if (evt?.type === 'stderr') {
      ctx.appendLog(`[stderr] ${evt.line}`);
    } else if (evt?.type === 'exit') {
      ctx.appendLog(`[exit] code=${evt.exitCode ?? 'null'} signal=${evt.signal ?? 'null'}`);
      ctx.setStatus('idle');
    }
  });
}

async function main() {
  startDesktopHeartbeat();
  await loadSettings();
  installCmdEvents();
  setActiveTab('xiaohongshu');
  ctx.setStatus('idle');
}

void main();
