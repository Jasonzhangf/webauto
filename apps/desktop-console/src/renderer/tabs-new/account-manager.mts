import { createEl } from '../ui-components.mts';
import { listAccountProfiles, type UiAccountProfile } from '../account-source.mts';

const PLATFORM_ICON: Record<string, string> = {
  xiaohongshu: '📕',
  xhs: '📕',
  weibo: '🧣',
};

const PLATFORM_LABEL: Record<string, string> = {
  xiaohongshu: '小红书',
  xhs: '小红书',
  weibo: '微博',
};

function normalizePlatform(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'xiaohongshu';
  if (normalized === 'xhs') return 'xiaohongshu';
  return normalized;
}

function getPlatformInfo(platform: string | null | undefined) {
  const key = normalizePlatform(platform);
  return {
    key,
    icon: PLATFORM_ICON[key] || '🌐',
    label: PLATFORM_LABEL[key] || key,
    loginUrl: key === 'weibo' ? 'https://weibo.com' : 'https://www.xiaohongshu.com',
  };
}

function formatTs(value: number | null | undefined): string {
  if (!Number.isFinite(value) || Number(value) <= 0) return '未检查';
  try {
    return new Date(Number(value)).toLocaleString('zh-CN');
  } catch {
    return '未检查';
  }
}

function toTimestamp(value: string | null | undefined): number | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatProfileTag(profileId: string): string {
  const id = String(profileId || '').trim();
  const m = id.match(/^profile-(\d+)$/i);
  if (!m) return id;
  const seq = Number(m[1]);
  if (!Number.isFinite(seq)) return id;
  return `P${String(seq).padStart(3, '0')}`;
}

export function renderAccountManager(root: HTMLElement, ctx: any) {
  root.innerHTML = '';
  const autoSyncTimers = new Map<string, ReturnType<typeof setInterval>>();

  // Bento Grid Layout
  const bentoGrid = createEl('div', { className: 'bento-grid bento-sidebar' });

  // Left: Environment Status
  const envCard = createEl('div', { className: 'bento-cell' });
  envCard.innerHTML = `
    <div class="bento-title"><span style="color: var(--success);">●</span> 环境状态</div>
    <div class="env-status-grid">
      <div class="env-item" id="env-camo">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Camo CLI (@web-auto/camo)</span>
      </div>
      <div class="env-item" id="env-unified">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Unified API</span>
      </div>
      <div class="env-item" id="env-browser">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Camo Runtime Service (7704)</span>
      </div>
      <div class="env-item" id="env-firefox">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>浏览器内核（Camoufox Firefox）</span>
      </div>
    </div>
    <div class="btn-group" style="margin-top: var(--gap);">
      <button id="recheck-env-btn" class="secondary" style="flex: 1;">重新检查</button>
      <button id="env-cleanup-btn" class="secondary" style="flex: 1;">一键清理</button>
    </div>
  `;
  bentoGrid.appendChild(envCard);

  // Right: Account List
  const accountCard = createEl('div', { className: 'bento-cell' });
  accountCard.innerHTML = `
    <div class="bento-title">
      账户列表
    </div>
    <div class="row" style="margin: 8px 0; gap: 8px; align-items: center;">
      <input id="new-account-alias-input" placeholder="别名可选（登录后自动识别）" style="flex: 1; min-width: 180px;" />
      <button id="add-account-btn" class="secondary" style="flex: 0 0 auto;">添加账户</button>
    </div>
    <div id="account-list" class="account-list" style="margin-bottom: var(--gap);"></div>
    <div style="margin-top: var(--gap);">
      <div class="btn-group">
        <button id="check-all-btn" class="secondary" style="flex: 1;">检查所有</button>
        <button id="refresh-expired-btn" class="secondary" style="flex: 1;">刷新失效</button>
      </div>
    </div>
  `;
  bentoGrid.appendChild(accountCard);
  root.appendChild(bentoGrid);

  // Elements
  const recheckEnvBtn = root.querySelector('#recheck-env-btn') as HTMLButtonElement;
  const envCleanupBtn = root.querySelector('#env-cleanup-btn') as HTMLButtonElement;
  const addAccountBtn = root.querySelector('#add-account-btn') as HTMLButtonElement;
  const newAccountAliasInput = root.querySelector('#new-account-alias-input') as HTMLInputElement;
  const checkAllBtn = root.querySelector('#check-all-btn') as HTMLButtonElement;
  const refreshExpiredBtn = root.querySelector('#refresh-expired-btn') as HTMLButtonElement;
  const accountListEl = root.querySelector('#account-list') as HTMLDivElement;

  // State
  type Account = UiAccountProfile & {
    statusView: 'valid' | 'expired' | 'pending' | 'checking';
    lastCheckAt?: number | null;
  };
  let accounts: Account[] = [];
  let envCheckInFlight = false;
  let accountCheckInFlight = false;
  let busUnsubscribe: (() => void) | null = null;

  // Check environment
  async function checkEnvironment() {
    try {
      if (typeof ctx.api?.envCheckAll !== 'function') {
        throw new Error('envCheckAll unavailable');
      }
      const unified = await ctx.api.envCheckAll();
      if (!unified || typeof unified !== 'object') {
        throw new Error('invalid envCheckAll response');
      }
      const browserReady = Boolean(unified.browserReady);
      updateEnvItem('env-camo', Boolean(unified.camo?.installed));
      updateEnvItem('env-unified', Boolean(unified.services?.unifiedApi));
      updateEnvItem('env-browser', Boolean(unified.services?.camoRuntime));
      updateEnvItem('env-firefox', browserReady);
    } catch (err) {
      console.error('Environment check failed:', err);
    }
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

  // Environment cleanup
  async function cleanupEnvironment() {
    try {
      console.log('[account-manager] Starting environment cleanup...');
      const result = await ctx.api.envCleanup();
      console.log('[account-manager] Cleanup result:', result);
      alert('环境清理完成！\\n' + JSON.stringify(result, null, 2));
      // Re-check environment after cleanup
      await checkEnvironment();
    } catch (err) {
      console.error('Environment cleanup failed:', err);
      alert('环境清理失败：' + (err as Error).message);
    }
  }

  function updateEnvItem(id: string, ok: boolean) {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    const icon = el.querySelector('.icon') as HTMLSpanElement;
    icon.textContent = ok ? '✓' : '✗';
    icon.style.color = ok ? 'var(--success)' : 'var(--danger)';
  }

  // Load accounts
  async function loadAccounts() {
    try {
      const rows = await listAccountProfiles(ctx.api);
      accounts = rows.map((row) => ({
        ...row,
        platform: normalizePlatform(row.platform),
        statusView: row.valid ? 'valid' : (row.status === 'pending' ? 'pending' : 'expired'),
        lastCheckAt: toTimestamp(row.updatedAt),
      })).sort((a, b) => {
        const p = String(a.profileId || '').localeCompare(String(b.profileId || ''));
        if (p !== 0) return p;
        return String(a.platform || '').localeCompare(String(b.platform || ''));
      });

      renderAccountList();
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }

  async function tickAccounts() {
    if (accountCheckInFlight) return;
    accountCheckInFlight = true;
    try {
      await loadAccounts();
      const pending = accounts.filter((acc) => acc.statusView === 'pending');
      for (const acc of pending) {
        await checkAccountStatus(acc.profileId, { pendingWhileLogin: true });
      }
    } finally {
      accountCheckInFlight = false;
    }
  }

  // Render account list
  function renderAccountList() {
    accountListEl.innerHTML = '';

    if (accounts.length === 0) {
      accountListEl.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-4);">暂无账户</div>';
      return;
    }

    accounts.forEach((acc) => {
      const platform = getPlatformInfo(acc.platform);
      const row = createEl('div', {
        className: 'account-item',
        style: 'display: flex; gap: var(--gap-sm); padding: var(--gap-sm); align-items: center; border-bottom: 1px solid var(--border);'
      });

      const nameDiv = createEl('div', { style: 'min-width: 0; flex: 1;' }, [
        createEl('div', { className: 'account-name', style: 'display: flex; gap: 6px; align-items: center;' }, [
          createEl('span', { style: 'font-size: 13px;' }, [platform.icon]),
          createEl('span', {}, [acc.alias || acc.name || formatProfileTag(acc.profileId)]),
          createEl('span', { style: 'font-size: 11px; color: var(--text-3);' }, [platform.label]),
        ]),
        createEl('div', { className: 'account-alias', style: 'font-size: 11px; color: var(--text-3);' }, [
          `profile: ${formatProfileTag(acc.profileId)} (${acc.profileId}) · 上次检查: ${formatTs(acc.lastCheckAt)}`
        ])
      ]);

      const statusBadge = createEl('span', {
        className: `status-badge ${acc.statusView === 'valid' ? 'status-valid' : acc.statusView === 'expired' ? 'status-expired' : 'status-pending'}`,
        style: 'min-width: 76px; text-align: center;'
      }, [
        acc.statusView === 'valid'
          ? '✓ 有效'
          : acc.statusView === 'expired'
            ? '✗ 失效'
            : acc.statusView === 'checking'
              ? '⏳ 检查中'
              : '⏳ 待登录'
      ]);

      const actionsDiv = createEl('div', {
        className: 'btn-group',
        style: 'display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; flex: 0 0 auto;'
      });
      const checkBtn = createEl('button', { className: 'secondary', style: 'padding: 6px 8px; font-size: 10px;' }, ['检查']) as HTMLButtonElement;
      const openBtn = createEl('button', { className: 'secondary', style: 'padding: 6px 8px; font-size: 10px;' }, ['打开']) as HTMLButtonElement;
      const fixBtn = createEl('button', { className: 'secondary', style: 'padding: 6px 8px; font-size: 10px;' }, ['修复']) as HTMLButtonElement;
      const detailBtn = createEl('button', {
        className: 'secondary',
        style: 'padding: 6px 8px; font-size: 10px;'
      }, ['详情']) as HTMLButtonElement;
      const deleteBtn = createEl('button', {
        className: 'danger',
        style: 'padding: 6px 8px; font-size: 10px;'
      }, ['删除']) as HTMLButtonElement;
      actionsDiv.appendChild(checkBtn);
      actionsDiv.appendChild(openBtn);
      actionsDiv.appendChild(fixBtn);
      actionsDiv.appendChild(detailBtn);
      actionsDiv.appendChild(deleteBtn);

      row.appendChild(nameDiv);
      row.appendChild(statusBadge);
      row.appendChild(actionsDiv);

      // Check account status
      checkBtn.onclick = () => {
        void checkAccountStatus(acc.profileId, { resolveAlias: true });
      };
      openBtn.onclick = () => {
        void openAccountLogin(acc, { reason: 'manual_open' });
      };
      fixBtn.onclick = () => {
        void fixAccount(acc);
      };

      // Show details
      detailBtn.onclick = () => {
        alert(`账户详情:\n\n平台: ${platform.label}\nProfile ID: ${acc.profileId}\n账号ID: ${acc.accountId || '未识别'}\n别名: ${acc.alias || '未设置'}\n状态: ${acc.status}\n原因: ${acc.reason || '-'}\n最后检查: ${formatTs(acc.lastCheckAt)}\n登录入口: ${platform.loginUrl}`);
      };

      // Delete account
      deleteBtn.onclick = async () => {
        if (confirm(`确定删除账户 "${acc.alias || acc.profileId}" 吗？此操作不可恢复。`)) {
          try {
            if (acc.accountRecordId) {
              await ctx.api.cmdRunJson({
                title: `account delete ${acc.accountRecordId}`,
                cwd: '',
                args: [
                  ctx.api.pathJoin('apps', 'webauto', 'entry', 'account.mjs'),
                  'delete',
                  acc.accountRecordId,
                  '--delete-profile',
                  '--delete-fingerprint',
                  '--json',
                ],
              });
            } else {
              await ctx.api.profileDelete({ profileId: acc.profileId, deleteFingerprint: true });
            }
            await loadAccounts();
          } catch (err: any) {
            alert('删除失败: ' + (err?.message || String(err)));
          }
        }
      };

      accountListEl.appendChild(row);
    });
  }

  // Check single account status
  async function checkAccountStatus(
    profileId: string,
    options: { pendingWhileLogin?: boolean; resolveAlias?: boolean } = {},
  ) {
    const account = accounts.find(a => a.profileId === profileId);
    if (!account) return false;

    account.statusView = 'checking';
    renderAccountList();

    try {
      const result = await ctx.api.cmdRunJson({
        title: `account sync ${profileId}`,
        cwd: '',
        args: [
          ctx.api.pathJoin('apps', 'webauto', 'entry', 'account.mjs'),
          'sync',
          profileId,
          '--platform',
          normalizePlatform(account.platform || 'xiaohongshu'),
          ...(options.pendingWhileLogin ? ['--pending-while-login'] : []),
          ...(options.resolveAlias ? ['--resolve-alias'] : []),
          '--json',
        ],
      });
      const profile = result?.json?.profile;
      if (profile && String(profile.profileId || '').trim() === profileId) {
        account.accountId = String(profile.accountId || '').trim() || null;
        const detectedAlias = String(profile.alias || '').trim();
        account.alias = detectedAlias || account.alias;
        account.platform = normalizePlatform(String(profile.platform || account.platform || '').trim());
        account.status = String(profile.status || '').trim() || account.status;
        account.valid = profile.valid === true && Boolean(account.accountId);
        account.reason = String(profile.reason || '').trim() || null;
        if (detectedAlias) {
          const aliases = { ...(ctx.api?.settings?.profileAliases || {}), [profileId]: detectedAlias };
          await ctx.api.settingsSet({ profileAliases: aliases }).catch(() => null);
          if (typeof ctx.refreshSettings === 'function') {
            await ctx.refreshSettings().catch(() => null);
          }
        }
      }
      account.statusView = account.valid
        ? 'valid'
        : (account.status === 'pending' ? 'pending' : 'expired');
      account.lastCheckAt = Date.now();
    } catch (err) {
      account.statusView = options.pendingWhileLogin ? 'pending' : 'expired';
      account.lastCheckAt = Date.now();
    }

    renderAccountList();
    return Boolean(account.valid);
  }

  async function openAccountLogin(account: Account, options: { reason?: string } = {}) {
    if (!String(account.profileId || '').trim()) return false;
    const platform = getPlatformInfo(account.platform);
    const idleTimeout = String(ctx.api?.settings?.idleTimeout || '30m').trim() || '30m';
    const timeoutSec = Math.max(0, Number(ctx.api?.settings?.timeouts?.loginTimeoutSec || 0));
    account.status = 'pending';
    account.statusView = 'pending';
    account.reason = String(options.reason || 'manual_relogin');
    account.lastCheckAt = Date.now();
    renderAccountList();
    await ctx.api.cmdSpawn({
      title: `登录 ${account.alias || account.profileId}`,
      cwd: '',
      args: [
        ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
        'login-profile',
        account.profileId,
        '--url',
        platform.loginUrl,
        '--idle-timeout',
        idleTimeout,
        '--wait-sync',
        'false',
        ...(timeoutSec > 0 ? ['--timeout-sec', String(timeoutSec)] : []),
        '--keep-session',
      ],
      groupKey: 'profilepool',
    });
    startAutoSyncProfile(account.profileId);
    return true;
  }

  async function fixAccount(account: Account) {
    const ok = await checkAccountStatus(account.profileId, { resolveAlias: true });
    if (ok) return;
    await openAccountLogin(account, { reason: 'fix_relogin' });
  }

  // Add new account
  async function addAccount() {
    const alias = newAccountAliasInput.value.trim();

    try {
      // Explicitly create profile first; account add no longer allows implicit profile creation.
      const profileOut = await ctx.api.cmdRunJson({
        title: 'profile add',
        cwd: '',
        args: [
          ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
          'add',
          'profile',
          '--json',
        ],
      });
      const createdProfileId = String(profileOut?.json?.profileId || '').trim();
      if (!profileOut?.ok || !createdProfileId) {
        alert('创建 profile 失败: ' + (profileOut?.error || '未知错误'));
        return;
      }

      // Create account record on created profile.
      const out = await ctx.api.cmdRunJson({
        title: 'account add',
        cwd: '',
        args: [
          ctx.api.pathJoin('apps', 'webauto', 'entry', 'account.mjs'),
          'add',
          '--platform',
          'xiaohongshu',
          '--profile',
          createdProfileId,
          '--status',
          'pending',
          ...(alias ? ['--alias', alias] : []),
          '--json',
        ],
      });

      const profileId = String(out?.json?.account?.profileId || createdProfileId).trim();
      if (!out?.ok || !profileId) {
        alert('创建账号失败: ' + (out?.error || '未知错误'));
        return;
      }

      // Save alias
      if (alias) {
        const aliases = { ...ctx.api.settings?.profileAliases, [profileId]: alias };
        await ctx.api.settingsSet({ profileAliases: aliases });
        if (typeof ctx.refreshSettings === 'function') {
          await ctx.refreshSettings();
        }
      }

      // Open login window
      const idleTimeout = String(ctx.api?.settings?.idleTimeout || '30m').trim() || '30m';
      const timeoutSec = Math.max(0, Number(ctx.api.settings?.timeouts?.loginTimeoutSec || 0));
      await ctx.api.cmdSpawn({
        title: `登录 ${alias || profileId}`,
        cwd: '',
        args: [
          ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
          'login-profile',
          profileId,
          '--idle-timeout',
          idleTimeout,
          '--wait-sync',
          'false',
          ...(timeoutSec > 0 ? ['--timeout-sec', String(timeoutSec)] : []),
          '--keep-session'
        ],
        groupKey: 'profilepool'
      });

      await loadAccounts();
      newAccountAliasInput.value = '';
      startAutoSyncProfile(profileId);

    } catch (err: any) {
      alert('添加账号失败: ' + (err?.message || String(err)));
    }
  }

  function startAutoSyncProfile(profileId: string) {
    const id = String(profileId || '').trim();
    if (!id) return;
    const existing = autoSyncTimers.get(id);
    if (existing) clearInterval(existing);
    const timeoutSec = Math.max(0, Number(ctx.api?.settings?.timeouts?.loginTimeoutSec || 0));
    const intervalMs = 2_000;
    const maxAttempts = timeoutSec > 0 ? Math.ceil((timeoutSec * 1000) / intervalMs) : Number.POSITIVE_INFINITY;
    let attempts = 0;
    void checkAccountStatus(id, { pendingWhileLogin: true }).then((ok) => {
      if (ok) {
        const timer = autoSyncTimers.get(id);
        if (timer) clearInterval(timer);
        autoSyncTimers.delete(id);
        void checkAccountStatus(id, { resolveAlias: true }).catch(() => null);
      }
    });
    const timer = setInterval(() => {
      attempts += 1;
      void checkAccountStatus(id, { pendingWhileLogin: true }).then((ok) => {
        if (ok || attempts >= maxAttempts) {
          const current = autoSyncTimers.get(id);
          if (current) clearInterval(current);
          autoSyncTimers.delete(id);
        }
      });
    }, intervalMs);
    autoSyncTimers.set(id, timer);
  }

  // Check all accounts
  async function checkAllAccounts() {
    checkAllBtn.disabled = true;
    checkAllBtn.textContent = '检查中...';

    for (const acc of accounts) {
      await checkAccountStatus(acc.profileId, { resolveAlias: true });
    }

    checkAllBtn.disabled = false;
    checkAllBtn.textContent = '检查所有';
  }

  // Refresh expired accounts
  async function refreshExpiredAccounts() {
    const expired = accounts.filter((a) => !a.valid && a.status !== 'pending');

    if (expired.length === 0) {
      alert('没有失效的账户需要刷新');
      return;
    }

    refreshExpiredBtn.disabled = true;
    refreshExpiredBtn.textContent = '刷新中...';

    for (const acc of expired) {
      try {
        await openAccountLogin(acc, { reason: 'refresh_expired' });
      } catch (err) {
        console.error(`Failed to refresh ${acc.profileId}:`, err);
      }
    }

    refreshExpiredBtn.disabled = false;
    refreshExpiredBtn.textContent = '刷新失效';
  }

  async function cleanupEnvironment() {
    if (!envCleanupBtn) return;
    envCleanupBtn.disabled = true;
    const previous = envCleanupBtn.textContent;
    envCleanupBtn.textContent = '清理中...';
    try {
      const result = typeof ctx.api?.envCleanup === 'function'
        ? await ctx.api.envCleanup()
        : await ctx.api.invoke?.('env:cleanup');
      if (!result?.ok) {
        alert(`环境清理失败: ${result?.error || '未知错误'}`);
      }
      await tickEnvironment();
      await tickAccounts();
    } catch (err: any) {
      alert(`环境清理失败: ${err?.message || String(err)}`);
    } finally {
      envCleanupBtn.disabled = false;
      envCleanupBtn.textContent = previous || '一键清理';
    }
  }

  // Event handlers
  recheckEnvBtn.onclick = checkEnvironment;
  if (envCleanupBtn) envCleanupBtn.onclick = () => { void cleanupEnvironment(); };
  addAccountBtn.onclick = addAccount;
  newAccountAliasInput.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void addAccount();
    }
  };
  checkAllBtn.onclick = checkAllAccounts;
  refreshExpiredBtn.onclick = refreshExpiredAccounts;

  // Initial load
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

  return () => {
    for (const timer of autoSyncTimers.values()) clearInterval(timer);
    autoSyncTimers.clear();
    if (typeof busUnsubscribe === 'function') busUnsubscribe();
  };
}
