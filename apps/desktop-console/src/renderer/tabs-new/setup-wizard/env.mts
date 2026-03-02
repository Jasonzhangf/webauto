import type { EnvSnapshot } from './helpers.mts';
import type { SetupWizardLayout } from './layout.mts';

export type EnvState = {
  envReady: boolean;
  envCheckInFlight: boolean;
  repairHistory: Array<{ ts: string; action: string; ok: boolean; detail?: string }>;
};

export type EnvDeps = {
  ctx: any;
  ui: SetupWizardLayout;
  state: EnvState;
  callbacks: {
    onEnvUpdated: (snapshot: EnvSnapshot) => void;
    onAccountsUpdated?: () => void;
  };
};

export function createEnvironmentManager(deps: EnvDeps) {
  const { ctx, ui, state, callbacks } = deps;

  async function collectEnvironment(): Promise<EnvSnapshot> {
    if (typeof ctx.api?.envCheckAll !== 'function') {
      throw new Error('envCheckAll unavailable');
    }
    const snapshot = await ctx.api.envCheckAll();
    if (snapshot && typeof snapshot === 'object' && snapshot.camo && snapshot.services) {
      return snapshot as EnvSnapshot;
    }
    throw new Error('invalid envCheckAll response');
  }

  function applyEnvironment(snapshot: EnvSnapshot) {
    const browserReady = Boolean(snapshot.browserReady);
    const browserDetail = snapshot.firefox?.installed
      ? '已安装'
      : snapshot.services?.camoRuntime
        ? '由 Runtime 服务提供'
        : '未安装';
    updateEnvItem('env-camo', snapshot.camo?.installed, snapshot.camo?.version || (snapshot.camo?.installed ? '已安装' : '未安装'));
    updateEnvItem('env-unified', snapshot.services?.unifiedApi, '7701');
    updateEnvItem('env-browser', snapshot.services?.camoRuntime, '7704');
    updateEnvItem('env-firefox', browserReady, snapshot.firefox?.path || browserDetail);
    updateEnvItem('env-geoip', snapshot.geoip?.installed, snapshot.geoip?.installed ? '已安装（可选）' : '未安装（可选）');
    state.envReady = Boolean(snapshot?.allReady);
    void syncRepairButtons(snapshot);
    callbacks.onEnvUpdated(snapshot);
  }

  function updateEnvItem(id: string, ok: boolean, detail: string) {
    const el = ui.accountListEl.ownerDocument.querySelector(`#${id}`) as HTMLElement | null;
    if (!el) return;
    const icon = el.querySelector('.icon') as HTMLSpanElement;
    const text = el.querySelector('.env-label') as HTMLSpanElement;
    const baseLabel = el.dataset.label || text.textContent || '';
    el.dataset.label = baseLabel;
    icon.textContent = ok ? '✓' : '✗';
    icon.style.color = ok ? 'var(--success)' : 'var(--danger)';
    const safeDetail = String(detail || '').trim();
    const shouldAppend = safeDetail && !String(baseLabel || '').includes(safeDetail);
    text.textContent = shouldAppend ? `${baseLabel} · ${safeDetail}` : baseLabel;
  }

  function renderRepairHistory() {
    if (!ui.envRepairHistoryEl) return;
    if (!state.repairHistory.length) {
      ui.envRepairHistoryEl.textContent = '修复记录：暂无';
      return;
    }
    const lines = state.repairHistory
      .slice(-5)
      .map((item) => {
        const stamp = item.ts.replace('T', ' ').replace('Z', '');
        const status = item.ok ? '成功' : '失败';
        const detail = item.detail ? ` · ${item.detail}` : '';
        return `${stamp} ${item.action}：${status}${detail}`;
      });
    ui.envRepairHistoryEl.textContent = `修复记录：${lines.join(' | ')}`;
  }

  async function pushRepairHistory(entry: { ts: string; action: string; ok: boolean; detail?: string }) {
    state.repairHistory = [...state.repairHistory, entry].slice(-30);
    if (typeof ctx.api?.settingsSet === 'function') {
      const updated = await ctx.api.settingsSet({ envRepairHistory: state.repairHistory }).catch(() => null);
      if (updated) {
        ctx.api.settings = updated;
        state.repairHistory = Array.isArray(updated.envRepairHistory) ? [...updated.envRepairHistory] : state.repairHistory;
      }
    }
    renderRepairHistory();
  }

  async function repairCoreServices(): Promise<{ ok: boolean; detail?: string }> {
    if (typeof ctx.api?.envRepairDeps === 'function') {
      ui.setupStatusText.textContent = '正在拉起核心服务...';
      const res = await ctx.api.envRepairDeps({ core: true }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
      const ok = res?.ok !== false;
      const detail = res?.error || res?.core?.error || res?.core?.services?.error || (ok ? '' : '核心服务启动失败');
      return { ok, detail };
    }
    if (typeof ctx.api?.envRepairCore === 'function') {
      ui.setupStatusText.textContent = '正在拉起核心服务...';
      const res = await ctx.api.envRepairCore().catch(() => null);
      const ok = res?.ok !== false;
      const detail = ok ? '' : '核心服务启动失败';
      return { ok, detail };
    }
    return { ok: false, detail: '不支持修复核心服务' };
  }

  async function repairInstall(
    { browser, geoip, reinstall, uninstall }: { browser?: boolean; geoip?: boolean; reinstall?: boolean; uninstall?: boolean },
  ): Promise<{ ok: boolean; detail?: string }> {
    if (typeof ctx.api?.envRepairDeps === 'function') {
      ui.setupStatusText.textContent = reinstall
        ? '正在卸载并重装资源（浏览器内核/GeoIP）...'
        : geoip && browser
          ? '正在安装依赖（浏览器内核/GeoIP）...'
          : geoip
            ? '正在安装 GeoIP（可选）...'
            : '正在安装浏览器内核（Camoufox）...';
      const res = await ctx.api.envRepairDeps({
        browser: Boolean(browser),
        geoip: Boolean(geoip),
        reinstall: Boolean(reinstall),
        uninstall: Boolean(uninstall),
      }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
      const ok = res?.ok !== false;
      const detail = res?.error || res?.install?.error || res?.install?.stderr || res?.install?.stdout || res?.install?.json?.error || (ok ? '' : '依赖安装失败');
      return { ok, detail };
    }
    if (typeof ctx.api?.cmdRunJson === 'function') {
      ui.setupStatusText.textContent = reinstall
        ? '正在卸载并重装资源（浏览器内核/GeoIP）...'
        : geoip && browser
          ? '正在安装依赖（浏览器内核/GeoIP）...'
          : geoip
            ? '正在安装 GeoIP（可选）...'
            : '正在安装浏览器内核（Camoufox）...';
      const script = ctx.api.pathJoin('apps', 'webauto', 'entry', 'xhs-install.mjs');
      const args = [script];
      if (reinstall) args.push('--reinstall');
      else if (uninstall) args.push('--uninstall');
      if (browser) args.push('--download-browser');
      if (geoip) args.push('--download-geoip');
      const res = await ctx.api
        .cmdRunJson({
          title: 'setup auto repair',
          cwd: '',
          args,
          timeoutMs: 300000,
        })
        .catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
      const ok = res?.ok !== false;
      const detail = res?.error || (ok ? '' : '依赖安装失败');
      return { ok, detail };
    }
    return { ok: false, detail: '不支持安装依赖' };
  }

  async function repairMissing(snapshot: EnvSnapshot): Promise<{ ok: boolean; detail?: string }> {
    const { getMissing } = await import('./helpers.mts');
    const missing = getMissing(snapshot);
    let ok = true;
    let detail = '';
    if (missing.core) {
      const res = await repairCoreServices();
      if (!res.ok) ok = false;
      if (res.detail) detail = res.detail;
    }
    if (missing.camo && !missing.core) {
      const res = await repairCoreServices();
      if (!res.ok) ok = false;
      if (res.detail) detail = res.detail;
    }
    if (missing.runtime) {
      const res = await repairInstall({ browser: true });
      if (!res.ok) ok = false;
      if (res.detail) detail = res.detail;
    }
    if (missing.geoip) {
      const res = await repairInstall({ geoip: true });
      if (!res.ok) ok = false;
      if (res.detail) detail = res.detail;
    }
    return { ok, detail };
  }

  async function syncRepairButtons(snapshot: EnvSnapshot) {
    const { getMissing } = await import('./helpers.mts');
    const missing = getMissing(snapshot);
    ui.repairCoreBtn.style.display = missing.core ? '' : 'none';
    ui.repairCore2Btn.style.display = missing.runtimeService ? '' : 'none';
    ui.repairCamoBtn.style.display = missing.camo ? '' : 'none';
    ui.repairRuntimeBtn.style.display = missing.runtime ? '' : 'none';
    ui.repairGeoipBtn.style.display = missing.geoip ? '' : 'none';
    const hasRequiredMissing = missing.core || missing.camo || missing.runtime;
    ui.envRepairAllBtn.style.display = hasRequiredMissing ? '' : 'none';
    ui.envRepairAllBtn.disabled = !hasRequiredMissing;
  }

  async function runRepair(label: string, action: () => Promise<any>) {
    ui.envCheckBtn.disabled = true;
    ui.envRepairAllBtn.disabled = true;
    ui.envReinstallAllBtn.disabled = true;
    ui.repairCamoBtn.disabled = true;
    ui.repairCoreBtn.disabled = true;
    ui.repairCore2Btn.disabled = true;
    ui.repairRuntimeBtn.disabled = true;
    ui.repairGeoipBtn.disabled = true;
    ui.setupStatusText.textContent = `${label}中...`;
    let ok = false;
    let detail = '';
    try {
      const result = await action();
      ok = result?.ok !== false;
      if (result?.detail) detail = String(result.detail || '');
    } finally {
      const latest = await collectEnvironment().catch(() => null);
      if (latest) {
        applyEnvironment(latest);
        if (callbacks.onAccountsUpdated) callbacks.onAccountsUpdated();
        if (!detail) {
          if (label.includes('浏览器内核') || label.includes('Camoufox') || label.includes('Runtime')) {
            ok = Boolean(latest.browserReady);
          } else if (label.includes('CLI') || label.includes('camo')) {
            ok = Boolean(latest.camo?.installed);
          } else if (label.includes('核心')) {
            ok = Boolean(latest.services?.unifiedApi && latest.services?.camoRuntime);
          } else {
            ok = Boolean(latest.allReady);
          }
        }
      }
      ui.setupStatusText.textContent = `${label}${ok ? '成功' : '失败'}${detail ? `：${detail}` : ''}`;
      await pushRepairHistory({
        ts: new Date().toISOString(),
        action: label,
        ok,
        detail: detail || undefined,
      });
      ui.envCheckBtn.disabled = false;
      ui.envReinstallAllBtn.disabled = false;
    }
  }

  async function checkEnvironment() {
    ui.envCheckBtn.disabled = true;
    ui.envCheckBtn.textContent = '检查中...';

    try {
      const snapshot = await collectEnvironment();
      applyEnvironment(snapshot);
      if (callbacks.onAccountsUpdated) callbacks.onAccountsUpdated();

      if (!state.envReady) {
        const { getMissing } = await import('./helpers.mts');
        const missingFlags = getMissing(snapshot);
        const missing: string[] = [];
        if (missingFlags.camo) missing.push('camo-cli');
        if (missingFlags.core) missing.push('unified-api');
        if (missingFlags.runtime) missing.push('browser-kernel');
        ui.setupStatusText.textContent = `存在待修复项：${missing.join(', ')}`;
      } else if (!snapshot?.geoip?.installed) {
        ui.setupStatusText.textContent = '环境就绪（GeoIP 可选，未安装不影响使用）';
      }
    } catch (err) {
      console.error('Environment check failed:', err);
      ui.setupStatusText.textContent = '环境检查失败，请查看日志并重试';
    }

    ui.envCheckBtn.disabled = false;
    ui.envCheckBtn.textContent = '重新检查';
  }

  async function tickEnvironment() {
    if (state.envCheckInFlight) return;
    state.envCheckInFlight = true;
    try {
      await checkEnvironment();
    } finally {
      state.envCheckInFlight = false;
    }
  }

  return {
    collectEnvironment,
    applyEnvironment,
    renderRepairHistory,
    pushRepairHistory,
    repairCoreServices,
    repairInstall,
    repairMissing,
    syncRepairButtons,
    runRepair,
    checkEnvironment,
    tickEnvironment,
  };
}
