import { renderPreflight } from './tabs/preflight.mts';
import { renderRun } from './tabs/run.mts';
import { renderRuntime } from './tabs/runtime.mts';
import { renderResults } from './tabs/results.mts';
import { renderSettings } from './tabs/settings.mts';
import { createEl } from './ui-components.mts';

declare global {
  interface Window {
    api: any;
  }
}

type TabId = 'preflight' | 'run' | 'runtime' | 'results' | 'settings';

const tabs: Array<{ id: TabId; label: string; render: (root: HTMLElement, ctx: any) => void }> = [
  { id: 'preflight', label: '预处理', render: renderPreflight },
  { id: 'run', label: '调用', render: renderRun },
  { id: 'runtime', label: 'Runtime', render: renderRuntime },
  { id: 'results', label: '结果', render: renderResults },
  { id: 'settings', label: '设置', render: renderSettings },
];

const tabsEl = document.getElementById('tabs')!;
const contentEl = document.getElementById('content')!;
const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;

const ctx: any = {
  settings: null as any,
  activeRunId: null as string | null,
  appendLog(line: string) {
    const div = createEl('div', { className: 'muted' }, [line]);
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  },
  clearLog() {
    logEl.textContent = '';
  },
  setStatus(s: string) {
    statusEl.textContent = s;
  },
};

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
  await loadSettings();
  installCmdEvents();
  setActiveTab('preflight');
  ctx.setStatus('idle');
}

void main();
