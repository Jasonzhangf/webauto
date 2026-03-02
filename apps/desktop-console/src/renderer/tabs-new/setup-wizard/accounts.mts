import { listAccountProfiles, type UiAccountProfile } from '../../account-source.mts';
import { formatProfileTag } from './helpers.mts';

export type SetupAccountsState = {
  accounts: UiAccountProfile[];
  accountCheckInFlight: boolean;
  autoSyncTimers: Map<string, ReturnType<typeof setInterval>>;
};

export type SetupAccountsUi = {
  accountListEl: HTMLDivElement;
  addAccountBtn: HTMLButtonElement;
  newAliasInput: HTMLInputElement;
};

export function createAccountManager(
  ctx: any,
  ui: SetupAccountsUi,
  state: SetupAccountsState,
  callbacks: {
    onAccountsUpdated: () => void;
  },
) {
  async function tickAccounts() {
    if (state.accountCheckInFlight) return;
    state.accountCheckInFlight = true;
    try {
      await refreshAccounts();
      const pending = state.accounts.filter((acc) => acc.status === 'pending');
      for (const acc of pending) {
        await syncProfileAccount(acc.profileId);
      }
    } finally {
      state.accountCheckInFlight = false;
    }
  }

  async function refreshAccounts() {
    try {
      state.accounts = await listAccountProfiles(ctx.api);
      renderAccountList();
      callbacks.onAccountsUpdated();
    } catch (err) {
      console.error('Failed to refresh accounts:', err);
    }
  }

  function renderAccountList() {
    ui.accountListEl.innerHTML = '';
    if (state.accounts.length === 0) {
      ui.accountListEl.innerHTML = '<div style="padding:12px; text-align:center; color:#8b93a6;">暂无账户，请点击下方按钮添加</div>';
      return;
    }

    state.accounts.forEach(acc => {
      const statusLabel = acc.valid
        ? '✓ 有效'
        : (acc.status === 'pending' ? '⏳ 待登录' : '✗ 失效');
      const statusClass = acc.valid
        ? 'status-valid'
        : (acc.status === 'pending' ? 'status-pending' : 'status-expired');
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '8px 12px';
      row.style.borderBottom = '1px solid var(--border)';

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.style.fontWeight = '600';
      title.style.marginBottom = '2px';
      title.textContent = acc.alias || acc.name || formatProfileTag(acc.profileId);
      const subtitle = document.createElement('div');
      subtitle.className = 'muted';
      subtitle.style.fontSize = '11px';
      subtitle.textContent = `${formatProfileTag(acc.profileId)} (${acc.profileId}) · ${String(acc.platform || 'xiaohongshu')}`;
      left.appendChild(title);
      left.appendChild(subtitle);

      const badge = document.createElement('span');
      badge.className = `status-badge ${statusClass}`;
      badge.textContent = statusLabel;

      row.appendChild(left);
      row.appendChild(badge);
      ui.accountListEl.appendChild(row);
    });
  }

  async function addAccount() {
    const alias = ui.newAliasInput.value.trim();

    ui.addAccountBtn.disabled = true;
    ui.addAccountBtn.textContent = '创建中...';

    try {
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

      if (alias) {
        await upsertAliasFromProfile({ profileId, alias }).catch(() => null);
      }

      const idleTimeout = 'off';
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
        groupKey: 'profilepool',
        timeoutMs: 0,
      });

      ui.newAliasInput.value = '';
      startAutoSyncProfile(profileId);
      await refreshAccounts();
    } catch (err: any) {
      alert('添加账号失败: ' + (err?.message || String(err)));
    } finally {
      ui.addAccountBtn.disabled = false;
      ui.addAccountBtn.textContent = '添加账户';
    }
  }

  function getSettingsAlias(profileId: string): string {
    const aliases = ctx.api?.settings?.profileAliases || {};
    return String(aliases?.[profileId] || '').trim();
  }

  async function upsertAliasFromProfile(profile: any) {
    const profileId = String(profile?.profileId || '').trim();
    if (!profileId) return;
    const alias = String(profile?.alias || '').trim();
    if (!alias) return;
    const aliases = { ...(ctx.api?.settings?.profileAliases || {}), [profileId]: alias };
    const updated = await ctx.api.settingsSet({ profileAliases: aliases }).catch(() => null);
    if (updated) {
      ctx.api.settings = updated;
    }
  }

  async function syncProfileAccount(profileId: string) {
    if (!profileId) return;
    try {
      const result = await ctx.api.cmdRunJson({
        title: `account sync ${profileId}`,
        cwd: '',
        args: [
          ctx.api.pathJoin('apps', 'webauto', 'entry', 'account.mjs'),
          'sync',
          profileId,
          '--platform',
          'xiaohongshu',
          '--resolve-alias',
          '--json',
        ],
      });
      const profile = result?.json?.profile;
      if (profile) {
        await upsertAliasFromProfile(profile).catch(() => null);
      }
    } catch (err) {
      console.error('sync profile failed:', err);
    }
    await refreshAccounts();
  }

  function startAutoSyncProfile(profileId: string) {
    const id = String(profileId || '').trim();
    if (!id) return;
    const existing = state.autoSyncTimers.get(id);
    if (existing) clearInterval(existing);
    const timeoutSec = Math.max(0, Number(ctx.api?.settings?.timeouts?.loginTimeoutSec || 0));
    const intervalMs = 2_000;
    const maxAttempts = timeoutSec > 0 ? Math.ceil((timeoutSec * 1000) / intervalMs) : Number.POSITIVE_INFINITY;
    let attempts = 0;
    void syncProfileAccount(id).then(() => {
      const timer = state.autoSyncTimers.get(id);
      if (timer) clearInterval(timer);
      state.autoSyncTimers.delete(id);
    });
    const timer = setInterval(() => {
      attempts += 1;
      void syncProfileAccount(id).then(() => {
        if (attempts >= maxAttempts) {
          const current = state.autoSyncTimers.get(id);
          if (current) clearInterval(current);
          state.autoSyncTimers.delete(id);
        }
      });
    }, intervalMs);
    state.autoSyncTimers.set(id, timer);
  }

  function stopAll() {
    for (const timer of state.autoSyncTimers.values()) clearInterval(timer);
    state.autoSyncTimers.clear();
  }

  return {
    tickAccounts,
    refreshAccounts,
    renderAccountList,
    addAccount,
    syncProfileAccount,
    startAutoSyncProfile,
    stopAll,
    getSettingsAlias,
  };
}
