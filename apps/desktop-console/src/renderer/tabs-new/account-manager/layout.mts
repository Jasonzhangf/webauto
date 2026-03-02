import { createEl } from '../../ui-components.mts';

export type AccountManagerLayout = {
  recheckEnvBtn: HTMLButtonElement;
  envCleanupBtn: HTMLButtonElement;
  addAccountBtn: HTMLButtonElement;
  newAccountAliasInput: HTMLInputElement;
  checkAllBtn: HTMLButtonElement;
  refreshExpiredBtn: HTMLButtonElement;
  accountListEl: HTMLDivElement;
  updateEnvItem: (id: string, ok: boolean) => void;
};

export function renderAccountManagerLayout(root: HTMLElement): AccountManagerLayout {
  root.innerHTML = '';

  const bentoGrid = createEl('div', { className: 'bento-grid bento-sidebar' });

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

  const recheckEnvBtn = root.querySelector('#recheck-env-btn') as HTMLButtonElement;
  const envCleanupBtn = root.querySelector('#env-cleanup-btn') as HTMLButtonElement;
  const addAccountBtn = root.querySelector('#add-account-btn') as HTMLButtonElement;
  const newAccountAliasInput = root.querySelector('#new-account-alias-input') as HTMLInputElement;
  const checkAllBtn = root.querySelector('#check-all-btn') as HTMLButtonElement;
  const refreshExpiredBtn = root.querySelector('#refresh-expired-btn') as HTMLButtonElement;
  const accountListEl = root.querySelector('#account-list') as HTMLDivElement;

  const updateEnvItem = (id: string, ok: boolean) => {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    const icon = el.querySelector('.icon') as HTMLSpanElement;
    icon.textContent = ok ? '✓' : '✗';
    icon.style.color = ok ? 'var(--success)' : 'var(--danger)';
  };

  return {
    recheckEnvBtn,
    envCleanupBtn,
    addAccountBtn,
    newAccountAliasInput,
    checkAllBtn,
    refreshExpiredBtn,
    accountListEl,
    updateEnvItem,
  };
}
