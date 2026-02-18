import { createEl } from '../ui-components.mts';
import { listAccountProfiles, type UiAccountProfile } from '../account-source.mts';

export function renderSetupWizard(root: HTMLElement, ctx: any) {
  root.innerHTML = '';

  // Header
  const header = createEl('div', { style: 'margin-bottom:20px;' }, [
    createEl('h2', { style: 'margin:0 0 8px 0; font-size:20px; color:#dbeafe;' }, ['环境与账户初始化']),
    createEl('div', { className: 'muted', style: 'font-size:13px;' }, ['首次使用必须完成环境检查与账户登录，之后可在"账户管理"Tab中维护'])
  ]);
  root.appendChild(header);

  // Bento Grid Layout
  const bentoGrid = createEl('div', { className: 'bento-grid bento-sidebar' });

  // Left: Environment Check
  const envCard = createEl('div', { className: 'bento-cell' });
  envCard.innerHTML = `
    <div class="bento-title"><span style="color: var(--warning);">●</span> 环境检查</div>
    <div class="env-status-grid">
      <div class="env-item" id="env-camo" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">Camoufox CLI</span>
        </span>
        <button id="repair-camo-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-unified" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">Unified API (7701)</span>
        </span>
        <button id="repair-core-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-browser" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">Browser Service (7704)</span>
        </span>
        <button id="repair-core2-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-firefox" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">Camoufox Runtime</span>
        </span>
        <button id="repair-runtime-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-geoip" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">GeoIP Database（可选）</span>
        </span>
        <button id="repair-geoip-btn" class="secondary" style="display:none; flex:0 0 auto;">可选安装</button>
      </div>
    </div>
    <div style="margin-top: var(--gap);">
      <button id="env-check-btn" class="secondary" style="width: 100%;">检查环境</button>
      <button id="env-repair-all-btn" style="width: 100%; margin-top: 8px; display: none;">一键修复缺失项</button>
    </div>
    <div id="env-repair-history" class="muted" style="margin-top: 10px; font-size: 12px;"></div>
  `;
  bentoGrid.appendChild(envCard);

  // Right: Account Setup
  const accountCard = createEl('div', { className: 'bento-cell' });
  accountCard.innerHTML = `
    <div class="bento-title">账户设置</div>
    <div class="account-list" id="account-list" style="margin-bottom: var(--gap); max-height: 200px; overflow: auto;">
      <div style="padding:12px; text-align:center; color:#8b93a6;">暂无账户，请点击下方按钮添加</div>
    </div>
    <div class="row">
      <div>
        <label>新账户别名</label>
        <input id="new-alias-input" placeholder="例如: 美食探店账号" style="width: 200px;" />
      </div>
      <button id="add-account-btn" style="flex: 0 0 auto; min-width: 120px;">添加账户</button>
    </div>
  `;
  bentoGrid.appendChild(accountCard);
  root.appendChild(bentoGrid);

  // Bottom: Status Card
  const statusRow = createEl('div', { className: 'bento-grid', style: 'margin-top: var(--gap);' });
  const statusCard = createEl('div', { className: 'bento-cell highlight' });
  statusCard.id = 'setup-status-card';
  statusCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 14px; font-weight: 600; color: var(--text-1); margin-bottom: 4px;">
          请完成上述步骤
        </div>
        <div style="font-size: 12px; color: var(--text-3);" id="setup-status-text">
          环境检查和账户登录后才能开始使用
        </div>
      </div>
      <button id="enter-main-btn" class="secondary" disabled style="padding: 12px 32px; font-size: 14px;">进入主界面</button>
    </div>
  `;
  statusRow.appendChild(statusCard);
  root.appendChild(statusRow);

  // Elements
  const envCheckBtn = root.querySelector('#env-check-btn') as HTMLButtonElement;
  const envRepairAllBtn = root.querySelector('#env-repair-all-btn') as HTMLButtonElement;
  const repairCamoBtn = root.querySelector('#repair-camo-btn') as HTMLButtonElement;
  const repairCoreBtn = root.querySelector('#repair-core-btn') as HTMLButtonElement;
  const repairCore2Btn = root.querySelector('#repair-core2-btn') as HTMLButtonElement;
  const repairRuntimeBtn = root.querySelector('#repair-runtime-btn') as HTMLButtonElement;
  const repairGeoipBtn = root.querySelector('#repair-geoip-btn') as HTMLButtonElement;
  const addAccountBtn = root.querySelector('#add-account-btn') as HTMLButtonElement;
  const newAliasInput = root.querySelector('#new-alias-input') as HTMLInputElement;
  const enterMainBtn = root.querySelector('#enter-main-btn') as HTMLButtonElement;
  const accountListEl = root.querySelector('#account-list') as HTMLDivElement;
  const setupStatusText = root.querySelector('#setup-status-text') as HTMLDivElement;
  const envRepairHistoryEl = root.querySelector('#env-repair-history') as HTMLDivElement;

  // State
  let envReady = false;
  let accounts: UiAccountProfile[] = [];
  let repairHistory: Array<{ ts: string; action: string; ok: boolean; detail?: string }> =
    Array.isArray(ctx.api?.settings?.envRepairHistory) ? [...ctx.api.settings.envRepairHistory] : [];

  type EnvSnapshot = {
    camo: any;
    services: any;
    firefox: any;
    geoip: any;
  };

  const isEnvReady = (snapshot: EnvSnapshot) =>
    Boolean(
      snapshot?.camo?.installed &&
      snapshot?.services?.unifiedApi &&
      snapshot?.services?.browserService &&
      snapshot?.firefox?.installed,
    );

  const getMissing = (snapshot: EnvSnapshot) => ({
    core: !snapshot?.services?.unifiedApi || !snapshot?.services?.browserService,
    camo: !snapshot?.camo?.installed,
    runtime: !snapshot?.firefox?.installed,
    geoip: !snapshot?.geoip?.installed,
  });

  async function collectEnvironment(): Promise<EnvSnapshot> {
    const [camo, services, firefox, geoip] = await Promise.all([
      ctx.api.envCheckCamo(),
      ctx.api.envCheckServices(),
      ctx.api.envCheckFirefox(),
      ctx.api.envCheckGeoIP(),
    ]);
    return { camo, services, firefox, geoip };
  }

  function applyEnvironment(snapshot: EnvSnapshot) {
    updateEnvItem('env-camo', snapshot.camo?.installed, snapshot.camo?.version || (snapshot.camo?.installed ? '已安装' : '未安装'));
    updateEnvItem('env-unified', snapshot.services?.unifiedApi, '7701');
    updateEnvItem('env-browser', snapshot.services?.browserService, '7704');
    updateEnvItem('env-firefox', snapshot.firefox?.installed, snapshot.firefox?.path ? '已安装' : '未安装');
    updateEnvItem('env-geoip', snapshot.geoip?.installed, snapshot.geoip?.installed ? '已安装（可选）' : '未安装（可选）');
    envReady = isEnvReady(snapshot);
    syncRepairButtons(snapshot);
  }

  function renderRepairHistory() {
    if (!envRepairHistoryEl) return;
    if (!repairHistory.length) {
      envRepairHistoryEl.textContent = '修复记录：暂无';
      return;
    }
    const lines = repairHistory
      .slice(-5)
      .map((item) => {
        const stamp = item.ts.replace('T', ' ').replace('Z', '');
        const status = item.ok ? '成功' : '失败';
        const detail = item.detail ? ` · ${item.detail}` : '';
        return `${stamp} ${item.action}：${status}${detail}`;
      });
    envRepairHistoryEl.textContent = `修复记录：${lines.join(' | ')}`;
  }

  async function pushRepairHistory(entry: { ts: string; action: string; ok: boolean; detail?: string }) {
    repairHistory = [...repairHistory, entry].slice(-30);
    if (typeof ctx.api?.settingsSet === 'function') {
      const updated = await ctx.api.settingsSet({ envRepairHistory: repairHistory }).catch(() => null);
      if (updated) {
        ctx.api.settings = updated;
        repairHistory = Array.isArray(updated.envRepairHistory) ? [...updated.envRepairHistory] : repairHistory;
      }
    }
    renderRepairHistory();
  }

  async function repairCoreServices(): Promise<{ ok: boolean; detail?: string }> {
    if (typeof ctx.api?.envRepairDeps === 'function') {
      setupStatusText.textContent = '正在拉起核心服务...';
      const res = await ctx.api.envRepairDeps({ core: true }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
      const ok = res?.ok !== false;
      const detail = res?.error || (ok ? '' : '核心服务启动失败');
      return { ok, detail };
    }
    if (typeof ctx.api?.envRepairCore === 'function') {
      setupStatusText.textContent = '正在拉起核心服务...';
      const res = await ctx.api.envRepairCore().catch(() => null);
      const ok = res?.ok !== false;
      const detail = ok ? '' : '核心服务启动失败';
      return { ok, detail };
    }
    return { ok: false, detail: '不支持修复核心服务' };
  }

  async function repairInstall({ browser, geoip }: { browser?: boolean; geoip?: boolean }): Promise<{ ok: boolean; detail?: string }> {
    if (typeof ctx.api?.envRepairDeps === 'function') {
      setupStatusText.textContent = geoip && browser ? '正在安装依赖（Camoufox/GeoIP）...' : geoip ? '正在安装 GeoIP（可选）...' : '正在安装 Camoufox...';
      const res = await ctx.api.envRepairDeps({ browser: Boolean(browser), geoip: Boolean(geoip) }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
      const ok = res?.ok !== false;
      const detail = res?.error || (ok ? '' : '依赖安装失败');
      return { ok, detail };
    }
    if (typeof ctx.api?.cmdRunJson === 'function') {
      setupStatusText.textContent = geoip && browser ? '正在安装依赖（Camoufox/GeoIP）...' : geoip ? '正在安装 GeoIP（可选）...' : '正在安装 Camoufox...';
      const script = ctx.api.pathJoin('apps', 'webauto', 'entry', 'xhs-install.mjs');
      const args = [script];
      if (browser) args.push('--download-browser');
      if (geoip) args.push('--download-geoip');
      args.push('--ensure-backend');
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
    const missing = getMissing(snapshot);
    let ok = true;
    let detail = '';
    if (missing.core) {
      const res = await repairCoreServices();
      if (!res.ok) ok = false;
      if (res.detail) detail = res.detail;
    }
    if (missing.camo || missing.runtime) {
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

  function syncRepairButtons(snapshot: EnvSnapshot) {
    const missing = getMissing(snapshot);
    repairCoreBtn.style.display = missing.core ? '' : 'none';
    repairCore2Btn.style.display = missing.core ? '' : 'none';
    repairCamoBtn.style.display = missing.camo ? '' : 'none';
    repairRuntimeBtn.style.display = missing.runtime ? '' : 'none';
    repairGeoipBtn.style.display = missing.geoip ? '' : 'none';
    const hasRequiredMissing = missing.core || missing.camo || missing.runtime;
    envRepairAllBtn.style.display = hasRequiredMissing ? '' : 'none';
    envRepairAllBtn.disabled = !hasRequiredMissing;
  }

  async function runRepair(label: string, action: () => Promise<any>) {
    envCheckBtn.disabled = true;
    envRepairAllBtn.disabled = true;
    repairCamoBtn.disabled = true;
    repairCoreBtn.disabled = true;
    repairCore2Btn.disabled = true;
    repairRuntimeBtn.disabled = true;
    repairGeoipBtn.disabled = true;
    setupStatusText.textContent = `${label}中...`;
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
        updateCompleteStatus();
        if (!detail) {
          if (label.includes('Camoufox') || label.includes('Runtime')) {
            ok = Boolean(latest.firefox?.installed);
          } else if (label.includes('Camoufox CLI') || label.includes('CLI') || label.includes('camo')) {
            ok = Boolean(latest.camo?.installed);
          } else if (label.includes('核心')) {
            ok = Boolean(latest.services?.unifiedApi && latest.services?.browserService);
          } else {
            ok = isEnvReady(latest);
          }
        }
      }
      setupStatusText.textContent = `${label}${ok ? '成功' : '失败'}${detail ? `：${detail}` : ''}`;
      await pushRepairHistory({
        ts: new Date().toISOString(),
        action: label,
        ok,
        detail: detail || undefined,
      });
      envCheckBtn.disabled = false;
    }
  }

  // Environment Check
  async function checkEnvironment() {
    envCheckBtn.disabled = true;
    envCheckBtn.textContent = '检查中...';

    try {
      const snapshot = await collectEnvironment();
      applyEnvironment(snapshot);
      updateCompleteStatus();

      if (!envReady) {
        const missing: string[] = [];
        if (!snapshot?.camo?.installed) missing.push('camo');
        if (!snapshot?.services?.unifiedApi) missing.push('unified-api');
        if (!snapshot?.services?.browserService) missing.push('browser-service');
        if (!snapshot?.firefox?.installed) missing.push('camoufox-runtime');
        setupStatusText.textContent = `存在待修复项: ${missing.join(', ')}`;
      } else if (!snapshot?.geoip?.installed) {
        setupStatusText.textContent = '环境就绪（GeoIP 可选，未安装不影响使用）';
      }
    } catch (err) {
      console.error('Environment check failed:', err);
      setupStatusText.textContent = '环境检查失败，请查看日志并重试';
    }

    envCheckBtn.disabled = false;
    envCheckBtn.textContent = '重新检查';
  }

  function updateEnvItem(id: string, ok: boolean, detail: string) {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    const icon = el.querySelector('.icon') as HTMLSpanElement;
    const text = el.querySelector('.env-label') as HTMLSpanElement;
    const baseLabel = (el as HTMLElement).dataset.label || text.textContent || '';
    (el as HTMLElement).dataset.label = baseLabel;
    icon.textContent = ok ? '✓' : '✗';
    icon.style.color = ok ? 'var(--success)' : 'var(--danger)';
    text.textContent = detail ? `${baseLabel} · ${detail}` : baseLabel;
  }

  // Account Management
  async function refreshAccounts() {
    try {
      accounts = await listAccountProfiles(ctx.api);

      renderAccountList();
      updateCompleteStatus();
    } catch (err) {
      console.error('Failed to refresh accounts:', err);
    }
  }

  function renderAccountList() {
    accountListEl.innerHTML = '';
    if (accounts.length === 0) {
      accountListEl.innerHTML = '<div style="padding:12px; text-align:center; color:#8b93a6;">暂无账户，请点击下方按钮添加</div>';
      return;
    }

    accounts.forEach(acc => {
      const statusLabel = acc.valid
        ? '✓ 有效'
        : (acc.status === 'pending' ? '⏳ 待登录' : '✗ 失效');
      const statusClass = acc.valid
        ? 'status-valid'
        : (acc.status === 'pending' ? 'status-pending' : 'status-expired');
      const row = createEl('div', {
        style: 'display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border);'
      }, [
        createEl('div', {}, [
          createEl('div', { style: 'font-weight:600; margin-bottom:2px;' }, [acc.alias || acc.name || acc.profileId]),
          createEl('div', { className: 'muted', style: 'font-size:11px;' }, [acc.profileId])
        ]),
        createEl('span', {
          className: `status-badge ${statusClass}`
        }, [statusLabel])
      ]);
      accountListEl.appendChild(row);
    });
  }

  async function addAccount() {
    const alias = newAliasInput.value.trim();
    if (!alias) {
      alert('请输入账户别名');
      return;
    }

    addAccountBtn.disabled = true;
    addAccountBtn.textContent = '创建中...';

    try {
      // Create profile
      const batchKey = 'xiaohongshu';
      const out = await ctx.api.cmdRunJson({
        title: 'profilepool add',
        cwd: '',
        args: [ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'), 'add', batchKey, '--json']
      });

      if (!out?.ok || !out?.json?.profileId) {
        alert('创建账号失败: ' + (out?.error || '未知错误'));
        return;
      }

      const profileId = out.json.profileId;

      // Save alias
      const aliases = { ...ctx.api.settings?.profileAliases, [profileId]: alias };
      await ctx.api.settingsSet({ profileAliases: aliases });
      if (typeof ctx.refreshSettings === 'function') {
        await ctx.refreshSettings();
      }

      // Open login window
      const timeoutSec = ctx.api.settings?.timeouts?.loginTimeoutSec || 900;
      const loginArgs = [
        ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
        'login-profile',
        profileId,
        '--timeout-sec',
        String(timeoutSec),
        '--keep-session'
      ];

      await ctx.api.cmdSpawn({
        title: `登录 ${alias}`,
        cwd: '',
        args: loginArgs,
        groupKey: 'profilepool'
      });

      newAliasInput.value = '';
      await refreshAccounts();

    } catch (err: any) {
      alert('添加账号失败: ' + (err?.message || String(err)));
    } finally {
      addAccountBtn.disabled = false;
      addAccountBtn.textContent = '添加账户';
    }
  }

  function updateCompleteStatus() {
    const hasValidAccount = accounts.some((a) => a.valid);
    const canProceed = envReady && hasValidAccount;

    enterMainBtn.disabled = !canProceed;

    if (canProceed) {
      setupStatusText.textContent = `环境就绪，${accounts.length} 个账户配置完成`;
      enterMainBtn.className = '';
    } else {
      const missing = [];
      if (!envReady) missing.push('环境检查');
      if (!hasValidAccount) missing.push('至少一个账户');
      setupStatusText.textContent = `尚未完成: ${missing.join('、')}`;
    }
  }

  // Event Listeners
  envCheckBtn.onclick = checkEnvironment;
  envRepairAllBtn.onclick = () => void runRepair('一键修复缺失项', async () => {
    const snapshot = await collectEnvironment();
    return await repairMissing(snapshot);
  });
  repairCoreBtn.onclick = () => void runRepair('修复核心服务', repairCoreServices);
  repairCore2Btn.onclick = () => void runRepair('修复核心服务', repairCoreServices);
  repairCamoBtn.onclick = () => void runRepair('修复 Camoufox CLI/Runtime', () => repairInstall({ browser: true }));
  repairRuntimeBtn.onclick = () => void runRepair('修复 Camoufox Runtime', () => repairInstall({ browser: true }));
  repairGeoipBtn.onclick = () => void runRepair('安装 GeoIP', () => repairInstall({ geoip: true }));
  addAccountBtn.onclick = addAccount;
  enterMainBtn.onclick = () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('config');
    }
  };

  // Initial check
  void checkEnvironment();
  void refreshAccounts();
  renderRepairHistory();
}
