import { renderAccountManagerLayout } from './account-manager/layout.mts';
import { renderAccountList, type Account } from './account-manager/list.mts';
import { createAccountActions } from './account-manager/actions.mts';
import { createAutoSyncController } from './account-manager/auto-sync.mts';
import { formatTs } from './account-manager/helpers.mts';

export function renderAccountManager(root: HTMLElement, ctx: any) {
  const ui = renderAccountManagerLayout(root);

  type AccountState = {
    accounts: Account[];
  };

  const state: AccountState = {
    accounts: [],
  };

  let envCheckInFlight = false;
  let accountCheckInFlight = false;
  let busUnsubscribe: (() => void) | null = null;

  const actions = createAccountActions({
    ctx,
    state,
    render: () => render(),
  });

  const autoSync = createAutoSyncController({
    ctx,
    checkAccountStatus: actions.checkAccountStatus,
  });

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
      ui.updateEnvItem('env-camo', Boolean(unified.camo?.installed));
      ui.updateEnvItem('env-unified', Boolean(unified.services?.unifiedApi));
      ui.updateEnvItem('env-browser', Boolean(unified.services?.camoRuntime));
      ui.updateEnvItem('env-firefox', browserReady);
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

  async function cleanupEnvironment() {
    if (!ui.envCleanupBtn) return;
    ui.envCleanupBtn.disabled = true;
    const previous = ui.envCleanupBtn.textContent;
    ui.envCleanupBtn.textContent = '清理中...';
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
      ui.envCleanupBtn.disabled = false;
      ui.envCleanupBtn.textContent = previous || '一键清理';
    }
  }

  function render() {
    renderAccountList(ui.accountListEl, state.accounts, {
      onCheck: (acc) => void actions.checkAccountStatus(acc.profileId, { resolveAlias: true }),
      onOpen: (acc) => void actions.openAccountLogin(acc, { reason: 'manual_open' }).then((ok) => {
        if (ok) autoSync.start(acc.profileId);
      }),
      onOpenBrowser: (acc) => void actions.openBrowserOnly(acc),
      onFix: (acc) => void actions.fixAccount(acc).then(() => autoSync.start(acc.profileId)),
      onDetail: (acc, platform) => {
        alert(`账户详情:\n\n平台: ${platform.label}\nProfile ID: ${acc.profileId}\n账号ID: ${acc.accountId || '未识别'}\n别名: ${acc.alias || '未设置'}\n状态: ${acc.status}\n原因: ${acc.reason || '-'}\n最后检查: ${formatTs(acc.lastCheckAt)}\n登录入口: ${platform.loginUrl}`);
      },
      onDelete: async (acc) => {
        if (confirm(`确定删除账户 "${acc.alias || acc.profileId}" 吗？此操作不可恢复。`)) {
          try {
            await actions.deleteAccount(acc);
          } catch (err: any) {
            alert('删除失败: ' + (err?.message || String(err)));
          }
        }
      },
    });
  }

  async function tickAccounts() {
    if (accountCheckInFlight) return;
    accountCheckInFlight = true;
    try {
      await actions.loadAccountsInternal();
      render();
      await actions.syncPendingAccounts();
    } finally {
      accountCheckInFlight = false;
    }
  }

  async function addAccount() {
    const alias = ui.newAccountAliasInput.value.trim();
    try {
      const profileId = await actions.addAccount(alias);
      ui.newAccountAliasInput.value = '';
      autoSync.start(profileId);
    } catch (err: any) {
      alert('添加账号失败: ' + (err?.message || String(err)));
    }
  }

  async function checkAllAccounts() {
    ui.checkAllBtn.disabled = true;
    ui.checkAllBtn.textContent = '检查中...';
    await actions.checkAllAccounts();
    ui.checkAllBtn.disabled = false;
    ui.checkAllBtn.textContent = '检查所有';
  }

  async function refreshExpiredAccounts() {
    ui.refreshExpiredBtn.disabled = true;
    ui.refreshExpiredBtn.textContent = '刷新中...';
    await actions.refreshExpiredAccounts();
    ui.refreshExpiredBtn.disabled = false;
    ui.refreshExpiredBtn.textContent = '刷新失效';
  }

  ui.recheckEnvBtn.onclick = checkEnvironment;
  if (ui.envCleanupBtn) ui.envCleanupBtn.onclick = () => { void cleanupEnvironment(); };
  ui.addAccountBtn.onclick = addAccount;
  ui.newAccountAliasInput.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void addAccount();
    }
  };
  ui.checkAllBtn.onclick = checkAllAccounts;
  ui.refreshExpiredBtn.onclick = refreshExpiredAccounts;

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
    autoSync.stopAll();
    if (typeof busUnsubscribe === 'function') busUnsubscribe();
  };
}
