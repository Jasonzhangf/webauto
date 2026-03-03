import { renderPreflight } from './tabs/preflight.mts';
import { renderSettings } from './tabs/settings.mts';
import { renderLogs } from './tabs/logs.mts';
import { renderSetupWizard } from './tabs-new/setup-wizard.mts';
import { renderTasksPanel } from './tabs-new/tasks.mts';
import { renderDashboard } from './tabs-new/dashboard.mts';
import { renderAccountManager } from './tabs-new/account-manager.mts';
import { renderSchedulerPanel } from './tabs-new/scheduler.mts';
import { renderTestCenter } from './tabs-new/test-center/index.mts';
import { createEl } from './ui-components.mts';

declare global {
  interface Window {
    api: any;
  }
}

type TabId = 'setup-wizard' | 'tasks' | 'dashboard' | 'scheduler' | 'account-manager' | 'preflight' | 'logs' | 'settings' | 'test-center';

type TabRender = (root: HTMLElement, ctx: any) => void | (() => void);

export const TABS_CONFIG: Array<{ id: TabId; label: string; hidden?: boolean }> = [
  { id: 'setup-wizard', label: '初始化' },
  { id: 'tasks', label: '任务' },
  { id: 'dashboard', label: '看板' },
  { id: 'scheduler', label: '定时任务' },
  { id: 'account-manager', label: '账户管理' },
  { id: 'preflight', label: '旧预处理', hidden: true },
  { id: 'logs', label: '日志' },
  { id: 'settings', label: '设置' },
  { id: 'test-center', label: '测试中心' },
];

const tabs: Array<{ id: TabId; label: string; render: TabRender; hidden?: boolean }> = TABS_CONFIG.map((cfg) => {
  const renderMap: Record<TabId, TabRender> = {
    'setup-wizard': renderSetupWizard,
    'tasks': renderTasksPanel,
    'dashboard': renderDashboard,
    'scheduler': renderSchedulerPanel,
    'account-manager': renderAccountManager,
    'preflight': renderPreflight,
    'logs': renderLogs,
    'settings': renderSettings,
    'test-center': renderTestCenter,
  };
  return { ...cfg, render: renderMap[cfg.id] };
});



const tabsEl = document.getElementById('tabs')!;
const contentEl = document.getElementById('content')!;
const statusEl = document.getElementById('status')!;
const appTitleEl = document.getElementById('app-title');
const appVersionEl = document.getElementById('app-version');
let activeTabCleanup: (() => void) | null = null;
const mutableApi: any = { ...(window.api || {}), settings: null };

// Tab Icons mapping for visual enhancement
const tabIcons: Record<TabId, string> = {
  'setup-wizard': '⚡',
  'tasks': '📝',
  'dashboard': '📊',
  'scheduler': '⏰',
  'account-manager': '👤',
  'preflight': '🔧',
  'logs': '📝',
  'settings': '🔨',
  'test-center': '🧪',
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

function formatBusLogLine(evt: any): string {
  const payload = evt && typeof evt === 'object' ? evt : {};
  const type = String(payload?.type || payload?.event || 'bus').trim() || 'bus';
  const directMessage = [
    payload?.message,
    payload?.text,
    payload?.title,
    payload?.detail,
    payload?.reason,
    payload?.error,
  ].find((item) => String(item || '').trim().length > 0);
  const nestedMessage = [
    payload?.payload?.message,
    payload?.payload?.text,
    payload?.payload?.title,
    payload?.payload?.detail,
  ].find((item) => String(item || '').trim().length > 0);
  if (String(directMessage || nestedMessage || '').trim()) {
    return `[bus:${type}] ${String(directMessage || nestedMessage).trim()}`;
  }
  if (type === 'env:unified' && typeof payload?.ok === 'boolean') {
    return `[bus:${type}] ${payload.ok ? 'connected' : 'disconnected'}`;
  }
  try {
    return `[bus:${type}] ${JSON.stringify(payload)}`;
  } catch {
    return `[bus:${type}] [unserializable]`;
  }
}

function installRendererConsoleLogBridge() {
  const guardKey = '__webauto_renderer_console_bridge_installed__';
  if ((window as any)[guardKey]) return;
  (window as any)[guardKey] = true;
  const methods: Array<'log' | 'info' | 'warn' | 'error'> = ['log', 'info', 'warn', 'error'];

  const formatArg = (arg: unknown): string => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  };

  methods.forEach((method) => {
    const original = console[method].bind(console);
    console[method] = (...args: any[]) => {
      original(...args);
      try {
        const text = args.map((item) => formatArg(item)).join(' ').trim();
        if (text) ctx.appendLog(`[console.${method}] ${text}`);
      } catch {
        // ignore console bridge errors
      }
    };
  });
}

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

async function applyVersionBadge() {
  try {
    if (typeof window.api?.appGetVersion !== 'function') return;
    const info = await window.api.appGetVersion();
    const webauto = String(info?.webauto || '').trim();
    const desktop = String(info?.desktop || '').trim();
    const badge = String(info?.badge || '').trim();
    if (appTitleEl && webauto) {
      appTitleEl.textContent = `WebAuto Console v${webauto}`;
    }
    if (appVersionEl) {
      appVersionEl.textContent = badge || (desktop && desktop !== webauto
        ? `webauto v${webauto} · console v${desktop}`
        : (webauto ? `v${webauto}` : 'v-'));
    }
  } catch {
    // ignore version display errors
  }
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
  if (typeof window.api?.onBusEvent === 'function') {
    window.api.onBusEvent((evt: any) => {
      ctx.appendLog(formatBusLogLine(evt));
    });
  }
}

async function detectStartupTab(): Promise<TabId> {
  try {
    const env = typeof window.api?.envCheckAll === 'function' ? await window.api.envCheckAll() : null;
    const envReady = Boolean(env?.allReady);
    if (envReady) return 'tasks';
  } catch {
    // ignore and fallback to setup
  }
  return 'setup-wizard';
}

async function main() {
  installRendererConsoleLogBridge();
  startDesktopHeartbeat();
  await applyVersionBadge();
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
