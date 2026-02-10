import { renderPreflight } from './tabs/preflight.mts';
import { renderRun } from './tabs/run.mts';
import { renderRuntime } from './tabs/runtime.mts';
import { renderResults } from './tabs/results.mts';
import { renderSettings } from './tabs/settings.mts';
import { renderXiaohongshuTab } from './tabs/xiaohongshu.mjs';
import { createEl } from './ui-components.mts';

declare global {
  interface Window {
    api: any;
  }
}

type TabId = 'preflight' | 'run' | 'runtime' | 'results' | 'settings' | 'xiaohongshu';

const tabs: Array<{ id: TabId; label: string; render: (root: HTMLElement, ctx: any) => void }> = [
  { id: 'preflight', label: '预处理', render: renderPreflight },
  { id: 'run', label: '调用', render: renderRun },
  { id: 'runtime', label: 'Runtime', render: renderRuntime },
  { id: 'results', label: '结果', render: renderResults },
  { id: 'xiaohongshu', label: '小红书', render: renderXiaohongshuTab },
  { id: 'settings', label: '设置', render: renderSettings },
];

const tabsEl = document.getElementById('tabs')!;
const contentEl = document.getElementById('content')!;
const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;
const mainEl = document.getElementById('main') as HTMLElement | null;
const logToggleEl = document.getElementById('log-toggle') as HTMLButtonElement | null;
const logClearEl = document.getElementById('log-clear') as HTMLButtonElement | null;
const logRatioWrapEl = document.getElementById('log-ratio-wrap') as HTMLElement | null;
const logRatioEl = document.getElementById('log-ratio') as HTMLInputElement | null;
const logRatioValueEl = document.getElementById('log-ratio-value') as HTMLElement | null;

let logExpanded = true;
let logRatio = 42;

try {
  const saved = Number(window.localStorage.getItem('webauto.logRatio') || '');
  if (Number.isFinite(saved) && saved >= 15 && saved <= 60) {
    logRatio = Math.floor(saved);
  }
} catch {
  // ignore localStorage failures
}

function applyMainLayout() {
  if (!mainEl) return;
  if (!logExpanded) {
    mainEl.style.gridTemplateRows = '1fr 0px';
    return;
  }

  const totalHeight = Math.max(320, mainEl.clientHeight || (window.innerHeight - 44));
  const minLog = 120;
  const maxLog = Math.max(minLog, totalHeight - 220);
  const byRatio = Math.round(totalHeight * (logRatio / 100));
  const logHeight = Math.min(maxLog, Math.max(minLog, byRatio));
  mainEl.style.gridTemplateRows = `1fr ${logHeight}px`;
}

function setLogRatio(next: number) {
  const clamped = Math.max(15, Math.min(60, Math.floor(next)));
  logRatio = clamped;
  if (logRatioEl) logRatioEl.value = String(clamped);
  if (logRatioValueEl) logRatioValueEl.textContent = `${clamped}%`;
  try {
    window.localStorage.setItem('webauto.logRatio', String(clamped));
  } catch {
    // ignore localStorage failures
  }
  applyMainLayout();
}

function setLogExpanded(next: boolean) {
  logExpanded = next;
  document.body.classList.toggle('log-expanded', next);
  if (logToggleEl) {
    logToggleEl.textContent = next ? '日志：收起' : '日志：展开';
  }
  if (logRatioEl) logRatioEl.disabled = !next;
  if (logRatioWrapEl) logRatioWrapEl.style.opacity = next ? '1' : '0.55';
  applyMainLayout();
}

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
  runScript(scriptPath: string, args: string[]) {
    window.api.runScript(scriptPath, args);
  },
};

if (logToggleEl) {
  logToggleEl.addEventListener('click', () => setLogExpanded(!logExpanded));
}
if (logClearEl) {
  logClearEl.addEventListener('click', () => ctx.clearLog());
}
if (logRatioEl) {
  logRatioEl.addEventListener('input', () => setLogRatio(Number(logRatioEl.value || '28')));
}
window.addEventListener('resize', () => applyMainLayout());

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
      setLogExpanded(true);
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
  setLogRatio(logRatio);
  setLogExpanded(true);
  startDesktopHeartbeat();
  await loadSettings();
  installCmdEvents();
  setActiveTab('preflight');
  ctx.setStatus('idle');
}

void main();
