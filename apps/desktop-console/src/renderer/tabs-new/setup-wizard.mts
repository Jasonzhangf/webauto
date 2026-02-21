import { createEl } from '../ui-components.mts';
import { listAccountProfiles, type UiAccountProfile } from '../account-source.mts';

export function renderSetupWizard(root: HTMLElement, ctx: any) {
  root.innerHTML = '';
  const autoSyncTimers = new Map<string, ReturnType<typeof setInterval>>();

  // Header
  const header = createEl('div', { style: 'margin-bottom:20px;' }, [
    createEl('h2', { style: 'margin:0 0 8px 0; font-size:20px; color:#dbeafe;' }, ['环境与账户初始化']),
    createEl('div', { className: 'muted', style: 'font-size:13px;' }, ['建议先完成环境检查；账号可先不登录，后续自动识别账户名并回填 alias'])
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
          <span class="env-label">Camo CLI (@web-auto/camo)</span>
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
          <span class="env-label">Camo Runtime Service (7704，可选)</span>
        </span>
        <button id="repair-core2-btn" class="secondary" style="display:none; flex:0 0 auto;">一键修复</button>
      </div>
      <div class="env-item" id="env-firefox" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="icon" style="color: var(--text-4);">○</span>
          <span class="env-label">浏览器内核（Camoufox Firefox）</span>
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
      <button id="env-reinstall-all-btn" class="secondary" style="width: 100%; margin-top: 8px;">一键卸载重装资源</button>
    </div>
    <div id="env-repair-history" class="muted" style="margin-top: 10px; font-size: 12px;"></div>
  `;
  bentoGrid.appendChild(envCard);

  // Right: Account Setup
  const accountCard = createEl('div', { className: 'bento-cell' });
  accountCard.innerHTML = `
    <div class="bento-title">账户设置</div>
    <div class="account-list" id="account-list" style="margin-bottom: var(--gap);">
      <div style="padding:12px; text-align:center; color:#8b93a6;">暂无账户，请点击下方按钮添加</div>
    </div>
    <div class="row">
      <div>
        <label>新账户别名（可选）</label>
        <input id="new-alias-input" placeholder="可留空，登录后自动识别" style="width: 200px;" />
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
          完成环境检查后即可进入主界面；账号可稍后登录
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
  const envReinstallAllBtn = root.querySelector('#env-reinstall-all-btn') as HTMLButtonElement;
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
  let envCheckInFlight = false;
  let accountCheckInFlight = false;
  let busUnsubscribe: (() => void) | null = null;

  type EnvSnapshot = {
    camo: any;
    services: any;
    firefox: any;
    geoip: any;
    allReady?: boolean;
    browserReady?: boolean;
    missing?: {
      core: boolean;
      runtimeService: boolean;
      camo: boolean;
      runtime: boolean;
      geoip: boolean;
    };
  };

  const getMissing = (snapshot: EnvSnapshot) =>
    snapshot?.missing || {
      core: true,
      runtimeService: true,
      camo: true,
      runtime: true,
      geoip: true,
    };

  const isEnvReady = (snapshot: EnvSnapshot) => Boolean(snapshot?.allReady);

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
      const detail = res?.error
        || res?.core?.error
        || res?.core?.services?.error
        || (ok ? '' : '核心服务启动失败');
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

  async function repairInstall(
    { browser, geoip, reinstall, uninstall }: { browser?: boolean; geoip?: boolean; reinstall?: boolean; uninstall?: boolean },
  ): Promise<{ ok: boolean; detail?: string }> {
    if (typeof ctx.api?.envRepairDeps === 'function') {
      setupStatusText.textContent = reinstall
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
      const detail = res?.error
        || res?.install?.error
        || res?.install?.stderr
        || res?.install?.stdout
        || res?.install?.json?.error
        || (ok ? '' : '依赖安装失败');
      return { ok, detail };
    }
    if (typeof ctx.api?.cmdRunJson === 'function') {
      setupStatusText.textContent = reinstall
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

  function syncRepairButtons(snapshot: EnvSnapshot) {
    const missing = getMissing(snapshot);
    repairCoreBtn.style.display = missing.core ? '' : 'none';
    repairCore2Btn.style.display = missing.runtimeService ? '' : 'none';
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
    envReinstallAllBtn.disabled = true;
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
      setupStatusText.textContent = `${label}${ok ? '成功' : '失败'}${detail ? `：${detail}` : ''}`;
      await pushRepairHistory({
        ts: new Date().toISOString(),
        action: label,
        ok,
        detail: detail || undefined,
      });
      envCheckBtn.disabled = false;
      envReinstallAllBtn.disabled = false;
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
        const missingFlags = getMissing(snapshot);
        const missing: string[] = [];
        if (missingFlags.camo) missing.push('camo-cli');
        if (missingFlags.core) missing.push('unified-api');
        if (missingFlags.runtime) missing.push('browser-kernel');
        setupStatusText.textContent = `存在待修复项: ${missing.join(', ')}`;
        if (missingFlags.runtimeService) {
          setupStatusText.textContent += '（camo-runtime 未就绪，当前为可选）';
        }
      } else if (!snapshot?.geoip?.installed) {
        setupStatusText.textContent = '环境就绪（GeoIP 可选，未安装不影响使用）';
      } else if (!snapshot?.services?.camoRuntime) {
        setupStatusText.textContent = '环境就绪（camo-runtime 未就绪，当前不阻塞）';
      }
    } catch (err) {
      console.error('Environment check failed:', err);
      setupStatusText.textContent = '环境检查失败，请查看日志并重试';
    }

    envCheckBtn.disabled = false;
    envCheckBtn.textContent = '重新检查';
  }

  async function tickEnvironment() {
    if (envCheckInFlight) return;
    envCheckInFlight = true;
    try {
      await checkEnvironment();
    } finally {
      envCheckInFlight = false;
    }
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
    const safeDetail = String(detail || '').trim();
    const shouldAppend = safeDetail && !String(baseLabel || '').includes(safeDetail);
    text.textContent = shouldAppend ? `${baseLabel} · ${safeDetail}` : baseLabel;
  }

  // Account Management
  async function tickAccounts() {
    if (accountCheckInFlight) return;
    accountCheckInFlight = true;
    try {
      await refreshAccounts();
      const pending = accounts.filter((acc) => acc.status === 'pending');
      for (const acc of pending) {
        await syncProfileAccount(acc.profileId);
      }
    } finally {
      accountCheckInFlight = false;
    }
  }

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

    addAccountBtn.disabled = true;
    addAccountBtn.textContent = '创建中...';

    try {
      // Create account record + profile + fingerprint first (status=pending).
      const out = await ctx.api.cmdRunJson({
        title: 'account add',
        cwd: '',
        args: [
          ctx.api.pathJoin('apps', 'webauto', 'entry', 'account.mjs'),
          'add',
          '--platform',
          'xiaohongshu',
          '--status',
          'pending',
          ...(alias ? ['--alias', alias] : []),
          '--json',
        ],
      });

      const profileId = String(out?.json?.account?.profileId || '').trim();
      if (!out?.ok || !profileId) {
        alert('创建账号失败: ' + (out?.error || '未知错误'));
        return;
      }

      // Save alias when user provided one. Alias is optional; auto sync will backfill later.
      if (alias) {
        const aliases = { ...ctx.api.settings?.profileAliases, [profileId]: alias };
        await ctx.api.settingsSet({ profileAliases: aliases });
        if (typeof ctx.refreshSettings === 'function') {
          await ctx.refreshSettings();
        }
      }

      // Show pending state immediately.
      await refreshAccounts();
      setupStatusText.textContent = `账号 ${profileId} 已创建，等待登录...`;

      // Open login window
      const timeoutSec = ctx.api.settings?.timeouts?.loginTimeoutSec || 900;
      const loginArgs = [
        ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
        'login-profile',
        profileId,
        '--wait-sync',
        'false',
        '--timeout-sec',
        String(timeoutSec),
        '--keep-session'
      ];

      await ctx.api.cmdSpawn({
        title: `登录 ${alias || profileId}`,
        cwd: '',
        args: loginArgs,
        groupKey: 'profilepool'
      });

      newAliasInput.value = '';
      startAutoSyncProfile(profileId);

    } catch (err: any) {
      alert('添加账号失败: ' + (err?.message || String(err)));
    } finally {
      addAccountBtn.disabled = false;
      addAccountBtn.textContent = '添加账户';
    }
  }

  function updateCompleteStatus() {
    const hasValidAccount = accounts.some((a) => a.valid);
    const canProceed = envReady;

    enterMainBtn.disabled = !canProceed;

    if (canProceed) {
      setupStatusText.textContent = hasValidAccount
        ? `环境就绪，${accounts.length} 个账户配置完成`
        : '环境就绪，可先进入主界面后登录账号（alias 将在登录后自动识别）';
      enterMainBtn.className = '';
    } else {
      const missing = [];
      if (!envReady) missing.push('环境检查');
      if (!hasValidAccount) missing.push('账户登录（可稍后）');
      setupStatusText.textContent = `尚未完成: ${missing.join('、')}`;
    }
  }

  function getSettingsAlias(profileId: string): string {
    return String(ctx.api?.settings?.profileAliases?.[profileId] || '').trim();
  }

  async function upsertAliasFromProfile(profile: any) {
    const profileId = String(profile?.profileId || '').trim();
    const alias = String(profile?.alias || '').trim();
    if (!profileId || !alias) return;
    if (getSettingsAlias(profileId) === alias) return;
    const aliases = { ...(ctx.api?.settings?.profileAliases || {}), [profileId]: alias };
    await ctx.api.settingsSet({ profileAliases: aliases }).catch(() => null);
    if (typeof ctx.refreshSettings === 'function') {
      await ctx.refreshSettings().catch(() => null);
    }
  }

  async function syncProfileAccount(profileId: string) {
    const id = String(profileId || '').trim();
    if (!id) return false;
    const result = await ctx.api.cmdRunJson({
      title: `account sync ${id}`,
      cwd: '',
      args: [
        ctx.api.pathJoin('apps', 'webauto', 'entry', 'account.mjs'),
        'sync',
        id,
        '--pending-while-login',
        '--resolve-alias',
        '--json',
      ],
      timeoutMs: 20_000,
    }).catch(() => null);
    const profile = result?.json?.profile;
    if (!profile || String(profile.profileId || '').trim() !== id) return false;
    await upsertAliasFromProfile(profile);
    await refreshAccounts();
    const hasAccountId = Boolean(String(profile.accountId || '').trim());
    if (hasAccountId) {
      setupStatusText.textContent = `账号 ${id} 已识别，alias=${String(profile.alias || '').trim() || '未命名'}`;
      return true;
    }
    if (String(profile.status || '').trim() === 'pending') {
      setupStatusText.textContent = `账号 ${id} 待登录，等待检测登录完成...`;
    }
    return false;
  }

  function startAutoSyncProfile(profileId: string) {
    const id = String(profileId || '').trim();
    if (!id) return;
    const existing = autoSyncTimers.get(id);
    if (existing) clearInterval(existing);
    const timeoutSec = Math.max(30, Number(ctx.api?.settings?.timeouts?.loginTimeoutSec || 900));
    const intervalMs = 2_000;
    const maxAttempts = Math.ceil((timeoutSec * 1000) / intervalMs);
    let attempts = 0;
    void syncProfileAccount(id);
    const timer = setInterval(() => {
      attempts += 1;
      void syncProfileAccount(id).then((done) => {
        if (done || attempts >= maxAttempts) {
          const current = autoSyncTimers.get(id);
          if (current) clearInterval(current);
          autoSyncTimers.delete(id);
          if (!done) {
            setupStatusText.textContent = `账号 ${id} 登录检测超时，请确认已在浏览器完成登录`;
          }
        }
      });
    }, intervalMs);
    autoSyncTimers.set(id, timer);
  }

  // Event Listeners
  envCheckBtn.onclick = checkEnvironment;
  envRepairAllBtn.onclick = () => void runRepair('一键修复缺失项', async () => {
    const snapshot = await collectEnvironment();
    return await repairMissing(snapshot);
  });
  envReinstallAllBtn.onclick = () => void runRepair('一键卸载重装资源', () =>
    (async () => {
      const core = await repairCoreServices();
      if (!core.ok) return core;
      return repairInstall({ browser: true, geoip: true, reinstall: true });
    })());
  repairCoreBtn.onclick = () => void runRepair('修复核心服务', repairCoreServices);
  repairCore2Btn.onclick = () => void runRepair('修复核心服务', repairCoreServices);
  repairCamoBtn.onclick = () => void runRepair('修复 Camo CLI', repairCoreServices);
  repairRuntimeBtn.onclick = () => void runRepair('修复浏览器内核', () => repairInstall({ browser: true }));
  repairGeoipBtn.onclick = () => void runRepair('安装 GeoIP', () => repairInstall({ geoip: true }));
  addAccountBtn.onclick = addAccount;
  enterMainBtn.onclick = () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('tasks');
    }
  };

  // Initial check
  void tickEnvironment();
  void tickAccounts();
  if (typeof ctx.api?.onBusEvent === 'function') {
    busUnsubscribe = ctx.api.onBusEvent((evt: any) => {
      const type = String(evt?.type || evt?.event || '').trim().toLowerCase();
      if (!type) return;
      if (type.startsWith('account:')) {
        void tickAccounts();
      }
      if (type.startsWith('env:')) {
        void tickEnvironment();
      }
    });
  }
  renderRepairHistory();

  return () => {
    for (const timer of autoSyncTimers.values()) clearInterval(timer);
    autoSyncTimers.clear();
    if (typeof busUnsubscribe === 'function') busUnsubscribe();
  };
}
