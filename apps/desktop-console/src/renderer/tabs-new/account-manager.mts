import { createEl } from '../ui-components.mts';
import { listAccountProfiles, type UiAccountProfile } from '../account-source.mts';

export function renderAccountManager(root: HTMLElement, ctx: any) {
  root.innerHTML = '';

  // Bento Grid Layout
  const bentoGrid = createEl('div', { className: 'bento-grid bento-sidebar' });

  // Left: Environment Status
  const envCard = createEl('div', { className: 'bento-cell' });
  envCard.innerHTML = `
    <div class="bento-title"><span style="color: var(--success);">●</span> 环境状态</div>
    <div class="env-status-grid">
      <div class="env-item" id="env-camo">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Camoufox CLI</span>
      </div>
      <div class="env-item" id="env-unified">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Unified API</span>
      </div>
      <div class="env-item" id="env-browser">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Browser Service</span>
      </div>
      <div class="env-item" id="env-firefox">
        <span class="icon" style="color: var(--text-4);">○</span>
        <span>Firefox</span>
      </div>
    </div>
    <div style="margin-top: var(--gap);">
      <button id="recheck-env-btn" class="secondary" style="width: 100%;">重新检查</button>
    </div>
  `;
  bentoGrid.appendChild(envCard);

  // Right: Account List
  const accountCard = createEl('div', { className: 'bento-cell' });
  accountCard.innerHTML = `
    <div class="bento-title">
      账户列表
      <button id="add-account-btn" style="margin-left: auto; padding: 6px 12px; font-size: 12px;">添加账户</button>
    </div>
    <div class="row" style="margin: 8px 0; gap: 8px; align-items: center;">
      <input id="new-account-alias-input" placeholder="别名可选（登录后自动识别）" style="flex: 1; min-width: 180px;" />
      <button id="add-account-confirm-btn" class="secondary" style="flex: 0 0 auto;">创建并登录</button>
    </div>
    <div id="account-list" class="account-list" style="margin-bottom: var(--gap); max-height: 300px; overflow: auto;"></div>
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
  const addAccountBtn = root.querySelector('#add-account-btn') as HTMLButtonElement;
  const addAccountConfirmBtn = root.querySelector('#add-account-confirm-btn') as HTMLButtonElement;
  const newAccountAliasInput = root.querySelector('#new-account-alias-input') as HTMLInputElement;
  const checkAllBtn = root.querySelector('#check-all-btn') as HTMLButtonElement;
  const refreshExpiredBtn = root.querySelector('#refresh-expired-btn') as HTMLButtonElement;
  const accountListEl = root.querySelector('#account-list') as HTMLDivElement;

  // State
  type Account = UiAccountProfile & {
    statusView: 'valid' | 'expired' | 'pending' | 'checking';
    lastCheck?: string;
  };
  let accounts: Account[] = [];

  // Check environment
  async function checkEnvironment() {
    try {
      const [camo, services, firefox] = await Promise.all([
        ctx.api.envCheckCamo(),
        ctx.api.envCheckServices(),
        ctx.api.envCheckFirefox()
      ]);

      updateEnvItem('env-camo', camo.installed);
      updateEnvItem('env-unified', services.unifiedApi);
      updateEnvItem('env-browser', services.browserService);
      updateEnvItem('env-firefox', firefox.installed);
    } catch (err) {
      console.error('Environment check failed:', err);
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
        statusView: row.valid ? 'valid' : (row.status === 'pending' ? 'pending' : 'expired'),
      }));

      renderAccountList();
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }

  // Render account list
  function renderAccountList() {
    accountListEl.innerHTML = '';

    if (accounts.length === 0) {
      accountListEl.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-4);">暂无账户</div>';
      return;
    }

    accounts.forEach(acc => {
      const row = createEl('div', {
        className: 'account-item',
        style: 'display: grid; grid-template-columns: 1fr 120px 100px 100px; gap: var(--gap-sm); padding: var(--gap-sm); align-items: center; border-bottom: 1px solid var(--border);'
      });

      const nameDiv = createEl('div', {}, [
        createEl('div', { className: 'account-name' }, [acc.alias || acc.name || acc.profileId]),
        createEl('div', { className: 'account-alias' }, [acc.profileId])
      ]);

      const statusBadge = createEl('span', {
        className: `status-badge ${acc.statusView === 'valid' ? 'status-valid' : acc.statusView === 'expired' ? 'status-expired' : 'status-pending'}`
      }, [
        acc.statusView === 'valid'
          ? '✓ 有效'
          : acc.statusView === 'expired'
            ? '✗ 失效'
            : acc.statusView === 'checking'
              ? '⏳ 检查中'
              : '⏳ 待检查'
      ]);

      const checkBtn = createEl('button', {
        className: 'secondary',
        style: 'padding: 6px 10px; font-size: 11px;'
      }, ['检查']) as HTMLButtonElement;

      const actionsDiv = createEl('div', { className: 'btn-group', style: 'flex: 0;' });
      const detailBtn = createEl('button', {
        className: 'secondary',
        style: 'padding: 6px 8px; font-size: 10px;'
      }, ['详情']) as HTMLButtonElement;
      const deleteBtn = createEl('button', {
        className: 'danger',
        style: 'padding: 6px 8px; font-size: 10px;'
      }, ['删除']) as HTMLButtonElement;
      actionsDiv.appendChild(detailBtn);
      actionsDiv.appendChild(deleteBtn);

      row.appendChild(nameDiv);
      row.appendChild(statusBadge);
      row.appendChild(checkBtn);
      row.appendChild(actionsDiv);

      // Check account status
      checkBtn.onclick = () => checkAccountStatus(acc.profileId);

      // Show details
      detailBtn.onclick = () => {
        alert(`账户详情:\n\nProfile ID: ${acc.profileId}\n账号ID: ${acc.accountId || '未识别'}\n别名: ${acc.alias || '未设置'}\n状态: ${acc.status}\n原因: ${acc.reason || '-'}\n最后检查: ${acc.lastCheck || '未检查'}`);
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
  async function checkAccountStatus(profileId: string) {
    const account = accounts.find(a => a.profileId === profileId);
    if (!account) return;

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
          '--json',
        ],
      });
      const profile = result?.json?.profile;
      if (profile && String(profile.profileId || '').trim() === profileId) {
        account.accountId = String(profile.accountId || '').trim() || null;
        account.alias = String(profile.alias || '').trim() || account.alias;
        account.status = String(profile.status || '').trim() || account.status;
        account.valid = profile.valid === true && Boolean(account.accountId);
        account.reason = String(profile.reason || '').trim() || null;
      }
      account.statusView = account.valid ? 'valid' : 'expired';
      account.lastCheck = new Date().toLocaleString('zh-CN');
    } catch (err) {
      account.statusView = 'expired';
    }

    renderAccountList();
  }

  // Add new account
  async function addAccount() {
    const alias = newAccountAliasInput.value.trim();

    try {
      // Create profile
      const out = await ctx.api.cmdRunJson({
        title: 'profilepool add',
        cwd: '',
        args: [ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'), 'add', 'xiaohongshu', '--json']
      });

      if (!out?.ok || !out?.json?.profileId) {
        alert('创建账号失败: ' + (out?.error || '未知错误'));
        return;
      }

      const profileId = out.json.profileId;

      // Save alias if provided
      if (alias) {
        const aliases = { ...ctx.api.settings?.profileAliases, [profileId]: alias.trim() };
        await ctx.api.settingsSet({ profileAliases: aliases });
        if (typeof ctx.refreshSettings === 'function') {
          await ctx.refreshSettings();
        }
      }

      // Open login window
      const timeoutSec = ctx.api.settings?.timeouts?.loginTimeoutSec || 900;
      await ctx.api.cmdSpawn({
        title: `登录 ${alias || profileId}`,
        cwd: '',
        args: [
          ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
          'login-profile',
          profileId,
          '--timeout-sec',
          String(timeoutSec),
          '--keep-session'
        ],
        groupKey: 'profilepool'
      });

      await loadAccounts();
      newAccountAliasInput.value = '';

    } catch (err: any) {
      alert('添加账号失败: ' + (err?.message || String(err)));
    }
  }

  // Check all accounts
  async function checkAllAccounts() {
    checkAllBtn.disabled = true;
    checkAllBtn.textContent = '检查中...';

    for (const acc of accounts) {
      await checkAccountStatus(acc.profileId);
    }

    checkAllBtn.disabled = false;
    checkAllBtn.textContent = '检查所有';
  }

  // Refresh expired accounts
  async function refreshExpiredAccounts() {
    const expired = accounts.filter((a) => !a.valid);

    if (expired.length === 0) {
      alert('没有失效的账户需要刷新');
      return;
    }

    refreshExpiredBtn.disabled = true;
    refreshExpiredBtn.textContent = '刷新中...';

    for (const acc of expired) {
      try {
        const accountKey = acc.accountRecordId || acc.profileId;
        await ctx.api.cmdSpawn({
          title: `重新登录 ${acc.alias || acc.profileId}`,
          cwd: '',
          args: [
            ctx.api.pathJoin('apps', 'webauto', 'entry', 'account.mjs'),
            'login',
            accountKey,
            '--url',
            'https://www.xiaohongshu.com',
            '--json',
          ],
          groupKey: 'profilepool'
        });
      } catch (err) {
        console.error(`Failed to refresh ${acc.profileId}:`, err);
      }
    }

    refreshExpiredBtn.disabled = false;
    refreshExpiredBtn.textContent = '刷新失效';
  }

  // Event handlers
  recheckEnvBtn.onclick = checkEnvironment;
  addAccountBtn.onclick = addAccount;
  addAccountConfirmBtn.onclick = addAccount;
  newAccountAliasInput.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void addAccount();
    }
  };
  checkAllBtn.onclick = checkAllAccounts;
  refreshExpiredBtn.onclick = refreshExpiredAccounts;

  // Initial load
  void checkEnvironment();
  void loadAccounts();
}
