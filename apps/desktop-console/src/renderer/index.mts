import { renderPreflight } from './tabs/preflight.mts';
import { renderSettings } from './tabs/settings.mts';
import { renderLogs } from './tabs/logs.mts';
import { renderSetupWizard } from './tabs-new/setup-wizard.mts';
import { renderConfigPanel } from './tabs-new/config-panel.mts';
import { renderDashboard } from './tabs-new/dashboard.mts';
import { renderAccountManager } from './tabs-new/account-manager.mts';
import { renderSchedulerPanel } from './tabs-new/scheduler.mts';
import { createEl } from './ui-components.mts';

declare global {
  interface Window {
    api: any;
  }
}

type TabId = 'setup-wizard' | 'config' | 'dashboard' | 'scheduler' | 'account-manager' | 'preflight' | 'logs' | 'settings';

type TabRender = (root: HTMLElement, ctx: any) => void | (() => void);

const tabs: Array<{ id: TabId; label: string; render: TabRender; hidden?: boolean }> = [
  { id: 'setup-wizard', label: '初始化', render: renderSetupWizard },
  { id: 'config', label: '配置', render: renderConfigPanel },
  { id: 'dashboard', label: '看板', render: renderDashboard },
  { id: 'scheduler', label: '定时任务', render: renderSchedulerPanel },
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

// Tab Icons mapping for visual enhancement
const tabIcons: Record<TabId, string> = {
  'setup-wizard': '⚡',
  'config': '⚙️',
  'dashboard': '📊',
  'scheduler': '⏰',
  'account-manager': '👤',
  'preflight': '🔧',
  'logs': '📝',
  'settings': '🔨',
};

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

function focusTabButton(tabId: TabId) {
  const button = tabsEl.querySelector(`[data-tab-id="${tabId}"]`) as HTMLButtonElement | null;
  button?.focus();
}

function setActiveTab(id: TabId) {
  if (activeTabCleanup) {
    try { activeTabCleanup(); } catch {}
    activeTabCleanup = null;
  }

  const visibleTabs = tabs.filter((x) => !x.hidden);
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.textContent = '';
  for (let index = 0; index < visibleTabs.length; index += 1) {
    const t = visibleTabs[index];
    const isActive = t.id === id;
    const icon = tabIcons[t.id] || '';
    const el = createEl('button', { className: `tab ${isActive ? 'active' : ''}`, type: 'button' }, [
      createEl('span', { className: 'tab-icon' }, [icon]),
      t.label
    ]) as HTMLButtonElement;
    el.dataset.tabId = t.id;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(isActive));
    el.tabIndex = isActive ? 0 : -1;
    el.addEventListener('click', () => setActiveTab(t.id));
    el.addEventListener('keydown', (evt) => {
      const key = evt.key;
      if (key === 'Enter' || key === ' ') {
        evt.preventDefault();
        setActiveTab(t.id);
        return;
      }
      let nextIndex = -1;
      if (key === 'ArrowRight') nextIndex = (index + 1) % visibleTabs.length;
      else if (key === 'ArrowLeft') nextIndex = (index - 1 + visibleTabs.length) % visibleTabs.length;
      else if (key === 'Home') nextIndex = 0;
      else if (key === 'End') nextIndex = visibleTabs.length - 1;
      if (nextIndex >= 0) {
        evt.preventDefault();
        const nextTab = visibleTabs[nextIndex];
        if (!nextTab) return;
        setActiveTab(nextTab.id);
        requestAnimationFrame(() => focusTabButton(nextTab.id));
      }
    });
    tabsEl.appendChild(el);
  }

  contentEl.textContent = '';
  const reducedMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  if (!reducedMotion) {
    contentEl.classList.remove('animate-fade-in');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => contentEl.classList.add('animate-fade-in'));
    } else {
      contentEl.classList.add('animate-fade-in');
    }
  }
  
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
    const envReady = Boolean(env?.allReady);
    if (envReady) return 'config';
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
