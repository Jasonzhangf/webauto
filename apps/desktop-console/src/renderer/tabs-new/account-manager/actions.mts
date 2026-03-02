import { listAccountProfiles, type UiAccountProfile } from '../../account-source.mts';
import { normalizePlatform, toTimestamp, getPlatformInfo } from './helpers.mts';
import type { Account } from './list.mts';

type AccountManagerContext = {
  api: any;
  refreshSettings?: () => Promise<void> | void;
};

type AccountsState = {
  accounts: Account[];
};

type AccountsDeps = {
  ctx: AccountManagerContext;
  state: AccountsState;
  render: () => void;
};

export function createAccountActions(deps: AccountsDeps) {
  const { ctx, state, render } = deps;

  async function checkAccountStatus(
    profileId: string,
    options: { pendingWhileLogin?: boolean; resolveAlias?: boolean } = {},
  ) {
    const account = state.accounts.find(a => a.profileId === profileId);
    if (!account) return false;

    account.statusView = 'checking';
    render();

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

    render();
    return Boolean(account.valid);
  }

  async function openAccountLogin(account: Account, options: { reason?: string } = {}) {
    if (!String(account.profileId || '').trim()) return false;
    const platform = getPlatformInfo(account.platform);
    const idleTimeout = 'off';
    const timeoutSec = Math.max(0, Number(ctx.api?.settings?.timeouts?.loginTimeoutSec || 0));
    account.status = 'pending';
    account.statusView = 'pending';
    account.reason = String(options.reason || 'manual_relogin');
    account.lastCheckAt = Date.now();
    render();
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
      timeoutMs: 0,
    });
    return true;
  }

  async function openBrowserOnly(account: Account) {
    if (!String(account.profileId || '').trim()) return false;
    const platform = getPlatformInfo(account.platform);
    const idleTimeout = 'off';
    const timeoutSec = Math.max(0, Number(ctx.api?.settings?.timeouts?.loginTimeoutSec || 0));
    await ctx.api.cmdSpawn({
      title: `启动浏览器 ${account.alias || account.profileId}`,
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
      timeoutMs: 0,
    });
    return true;
  }

  async function fixAccount(account: Account) {
    const ok = await checkAccountStatus(account.profileId, { resolveAlias: true });
    if (ok) return;
    await openAccountLogin(account, { reason: 'fix_relogin' });
  }

  async function addAccount(alias: string) {
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
      throw new Error('创建 profile 失败: ' + (profileOut?.error || '未知错误'));
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
      throw new Error('创建账号失败: ' + (out?.error || '未知错误'));
    }

    if (alias) {
      const aliases = { ...ctx.api.settings?.profileAliases, [profileId]: alias };
      await ctx.api.settingsSet({ profileAliases: aliases });
      if (typeof ctx.refreshSettings === 'function') {
        await ctx.refreshSettings();
      }
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

    await loadAccountsInternal();
    render();
    return profileId;
  }

  async function deleteAccount(acc: Account) {
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
    await loadAccountsInternal();
    render();
  }

  async function loadAccountsInternal() {
    const rows = await listAccountProfiles(ctx.api);
    const mapped = rows.map((row: UiAccountProfile) => ({
      ...row,
      platform: normalizePlatform(row.platform),
      statusView: row.valid ? 'valid' : (row.status === 'pending' ? 'pending' : 'expired'),
      lastCheckAt: toTimestamp(row.updatedAt),
    } as Account))
      .sort((a, b) => {
        const p = String(a.profileId || '').localeCompare(String(b.profileId || ''));
        if (p !== 0) return p;
        return String(a.platform || '').localeCompare(String(b.platform || ''));
      });

    state.accounts = mapped;
  }

  async function checkAllAccounts() {
    for (const acc of state.accounts) {
      await checkAccountStatus(acc.profileId, { resolveAlias: true });
    }
  }

  async function refreshExpiredAccounts() {
    const expired = state.accounts.filter((a) => !a.valid && a.status !== 'pending');
    if (expired.length === 0) {
      alert('没有失效的账户需要刷新');
      return;
    }
    for (const acc of expired) {
      try {
        await openAccountLogin(acc, { reason: 'refresh_expired' });
      } catch (err) {
        console.error(`Failed to refresh ${acc.profileId}:`, err);
      }
    }
  }

  async function syncPendingAccounts() {
    const pending = state.accounts.filter((acc) => acc.statusView === 'pending');
    for (const acc of pending) {
      await checkAccountStatus(acc.profileId, { pendingWhileLogin: true });
    }
  }

  return {
    checkAccountStatus,
    openAccountLogin,
    openBrowserOnly,
    fixAccount,
    addAccount,
    deleteAccount,
    loadAccountsInternal,
    checkAllAccounts,
    refreshExpiredAccounts,
    syncPendingAccounts,
  };
}
