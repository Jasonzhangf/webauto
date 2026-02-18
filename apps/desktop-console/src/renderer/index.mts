import { renderPreflight } from './tabs/preflight.mts';
import { renderSettings } from './tabs/settings.mts';
import { renderLogs } from './tabs/logs.mts';
import { renderSetupWizard } from './tabs-new/setup-wizard.mts';
import { renderConfigPanel } from './tabs-new/config-panel.mts';
import { renderDashboard } from './tabs-new/dashboard.mts';
import { renderAccountManager } from './tabs-new/account-manager.mts';
import { listAccountProfiles } from './account-source.mts';
import { createEl } from './ui-components.mts';

declare global {
  interface Window {
    api: any;
  }
}

type TabId = 'setup-wizard' | 'config' | 'dashboard' | 'account-manager' | 'preflight' | 'logs' | 'settings';

type TabRender = (root: HTMLElement, ctx: any) => void | (() => void);

const tabs: Array<{ id: TabId; label: string; render: TabRender; hidden?: boolean }> = [
  { id: 'setup-wizard', label: '初始化', render: renderSetupWizard },
  { id: 'config', label: '配置', render: renderConfigPanel },
  { id: 'dashboard', label: '看板', render: renderDashboard },
  { id: 'account-manager', label: '账户管理', render: renderAccountManager },
  { id: 'preflight', label: '旧预处理', render: renderPreflight, hidden: true },
  { id: 'logs', label: '日志', render: renderLogs },
  { id: 'settings', label: '设置', render: renderSettings },
];

const tabsEl = document.getElementById('tabs')!;
const contentEl = document.getElementById('content')!;
const statusEl = document.getElementById('status')!;
let activeTabCleanup: (() => void) | null = null;
const mutableApi: any = { ...(window.api || {}), settings: null };

const ctx: any = {
  api: mutableApi,
  settings: null as any,
  xhsCurrentRun: null as any,
  activeRunId: null as string | null,
  _activeRunIds: new Set<string>(),
  _activeRunsListeners: [] as Array<() => void>,
  _logLines: [] as string[],
  appendLog(line: string) {
    const l = String(line || '').trim();
    if (!l) return;
    this._logLines.push(l);
  },
  clearLog() {
    this._logLines = [];
  },
  onActiveRunsChanged(listener: () => void) {
    this._activeRunsListeners.push(listener);
    return () => {
      this._activeRunsListeners = this._activeRunsListeners.filter((x: () => void) => x !== listener);
    };
  },
  notifyActiveRunsChanged() {
    this._activeRunsListeners.forEach((listener: () => void) => {
      try { listener(); } catch {}
    });
  },
  setStatus(s: string) {
    statusEl.textContent = s;
  },
  async refreshSettings() {
    const latest = await window.api.settingsGet();
    this.settings = latest;
    if (this.api && typeof this.api === 'object') {
      this.api.settings = latest;
    }
    return latest;
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
  await ctx.refreshSettings();
}

function setActiveTab(id: TabId) {
  if (activeTabCleanup) {
    try { activeTabCleanup(); } catch {}
    activeTabCleanup = null;
  }

  tabsEl.textContent = '';
  for (const t of tabs.filter((x) => !x.hidden)) {
    const el = createEl('div', { className: `tab ${t.id === id ? 'active' : ''}` }, [t.label]);
    el.addEventListener('click', () => setActiveTab(t.id));
    tabsEl.appendChild(el);
  }

  contentEl.textContent = '';
  const tab = tabs.find((x) => x.id === id)!;
  const dispose = tab.render(contentEl, ctx);
  if (typeof dispose === 'function') activeTabCleanup = dispose;
}

function installCmdEvents() {
  window.api.onCmdEvent((evt: any) => {
    const runTag = evt?.runId ? `[rid:${evt.runId}] ` : '';
    const runId = String(evt?.runId || '').trim();

    if (evt?.type === 'started') {
      ctx.activeRunId = evt.runId;
      if (runId) {
        ctx._activeRunIds.add(runId);
        ctx.notifyActiveRunsChanged();
      }
      ctx.appendLog(`${runTag}[started] ${evt.title} pid=${evt.pid} runId=${evt.runId}`);
      ctx.setStatus(`running: ${evt.title}`);
      return;
    }

    if (evt?.type === 'stdout') {
      ctx.appendLog(`${runTag}${evt.line}`);
      return;
    }

    if (evt?.type === 'stderr') {
      ctx.appendLog(`${runTag}[stderr] ${evt.line}`);
      return;
    }

    if (evt?.type === 'exit') {
      if (runId) {
        ctx._activeRunIds.delete(runId);
        ctx.notifyActiveRunsChanged();
      }
      ctx.appendLog(`${runTag}[exit] code=${evt.exitCode ?? 'null'} signal=${evt.signal ?? 'null'}`);
      ctx.setStatus(ctx._activeRunIds.size > 0 ? `running: ${ctx._activeRunIds.size} tasks` : 'idle');
    }
  });
}

async function detectStartupTab(): Promise<TabId> {
  try {
    const env = typeof window.api?.envCheckAll === 'function' ? await window.api.envCheckAll() : null;
    const rows = await listAccountProfiles(window.api).catch(() => []);
    const hasAccount = rows.some((row) => row.valid);
    const envReady = Boolean(env?.allReady);
    if (envReady && hasAccount) return 'config';
  } catch {
    // ignore and fallback to setup
  }
  return 'setup-wizard';
}

async function main() {
  startDesktopHeartbeat();
  await loadSettings();
  installCmdEvents();
  const startupTab = await detectStartupTab();
  setActiveTab(startupTab);
  ctx.setStatus('idle');
}

window.addEventListener('beforeunload', () => {
  if (!activeTabCleanup) return;
  try { activeTabCleanup(); } catch {}
  activeTabCleanup = null;
});

void main();
