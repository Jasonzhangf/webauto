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
      <div class="env-item" id="env-camo">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Camoufox CLI</span>
      </div>
      <div class="env-item" id="env-unified">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Unified API (7701)</span>
      </div>
      <div class="env-item" id="env-browser">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Browser Service (7704)</span>
      </div>
      <div class="env-item" id="env-firefox">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Camoufox Runtime</span>
      </div>
      <div class="env-item" id="env-geoip">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>GeoIP Database</span>
      </div>
    </div>
    <div style="margin-top: var(--gap);">
      <button id="env-check-btn" class="secondary" style="width: 100%;">检查环境</button>
    </div>
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
  const addAccountBtn = root.querySelector('#add-account-btn') as HTMLButtonElement;
  const newAliasInput = root.querySelector('#new-alias-input') as HTMLInputElement;
  const enterMainBtn = root.querySelector('#enter-main-btn') as HTMLButtonElement;
  const accountListEl = root.querySelector('#account-list') as HTMLDivElement;
  const setupStatusText = root.querySelector('#setup-status-text') as HTMLDivElement;

  // State
  let envReady = false;
  let accounts: UiAccountProfile[] = [];

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
      snapshot?.firefox?.installed &&
      snapshot?.geoip?.installed,
    );

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
    updateEnvItem('env-geoip', snapshot.geoip?.installed, snapshot.geoip?.installed ? '已安装' : '未安装');
    envReady = isEnvReady(snapshot);
  }

  async function autoRepairEnvironment(snapshot: EnvSnapshot) {
    const missingCore = !snapshot.services?.unifiedApi || !snapshot.services?.browserService;
    const missingCamo = !snapshot.camo?.installed;
    const missingRuntime = !snapshot.firefox?.installed;
    const missingGeoIP = !snapshot.geoip?.installed;

    if (!missingCore && !missingCamo && !missingRuntime && !missingGeoIP) return;

    setupStatusText.textContent = '检测到依赖缺失，正在自动修复...';

    if (missingCore && typeof ctx.api?.envRepairCore === 'function') {
      setupStatusText.textContent = '正在拉起核心服务...';
      await ctx.api.envRepairCore().catch(() => null);
    }

    if ((missingCamo || missingRuntime || missingGeoIP) && typeof ctx.api?.cmdRunJson === 'function') {
      setupStatusText.textContent = '正在安装依赖（Camoufox/GeoIP）...';
      const script = ctx.api.pathJoin('apps', 'webauto', 'entry', 'xhs-install.mjs');
      const args = [script];
      if (missingRuntime || missingCamo) args.push('--download-browser');
      if (missingGeoIP) args.push('--download-geoip');
      args.push('--ensure-backend');
      await ctx.api
        .cmdRunJson({
          title: 'setup auto repair',
          cwd: '',
          args,
          timeoutMs: 300000,
        })
        .catch(() => null);
    }
  }

  // Environment Check
  async function checkEnvironment() {
    envCheckBtn.disabled = true;
    envCheckBtn.textContent = '检查/修复中...';

    try {
      const before = await collectEnvironment();
      applyEnvironment(before);

      if (!isEnvReady(before)) {
        await autoRepairEnvironment(before);
      }

      const after = await collectEnvironment();
      applyEnvironment(after);
      updateCompleteStatus();

      if (!envReady) {
        const missing: string[] = [];
        if (!after?.camo?.installed) missing.push('camo');
        if (!after?.services?.unifiedApi) missing.push('unified-api');
        if (!after?.services?.browserService) missing.push('browser-service');
        if (!after?.firefox?.installed) missing.push('camoufox-runtime');
        if (!after?.geoip?.installed) missing.push('geoip');
        setupStatusText.textContent = `自动修复后仍缺失: ${missing.join(', ')}`;
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
    const text = el.querySelector('span:last-child') as HTMLSpanElement;
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
  addAccountBtn.onclick = addAccount;
  enterMainBtn.onclick = () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('config');
    }
  };

  // Initial check
  void checkEnvironment();
  void refreshAccounts();
}
