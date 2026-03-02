import { createEl } from '../../ui-components.mts';
import { formatProfileTag, formatTs, getPlatformInfo } from './helpers.mts';
import type { UiAccountProfile } from '../account-source.mts';

export type Account = UiAccountProfile & {
  statusView: 'valid' | 'expired' | 'pending' | 'checking';
  lastCheckAt?: number | null;
};

export type AccountListHandlers = {
  onCheck: (acc: Account) => void;
  onOpen: (acc: Account) => void;
  onOpenBrowser: (acc: Account) => void;
  onFix: (acc: Account) => void;
  onDetail: (acc: Account, platform: ReturnType<typeof getPlatformInfo>) => void;
  onDelete: (acc: Account) => void | Promise<void>;
};

export function renderAccountList(
  accountListEl: HTMLDivElement,
  accounts: Account[],
  handlers: AccountListHandlers,
) {
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
    const browserBtn = createEl('button', { className: 'secondary', style: 'padding: 6px 8px; font-size: 10px;' }, ['启动浏览器']) as HTMLButtonElement;
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
    actionsDiv.appendChild(browserBtn);
    actionsDiv.appendChild(fixBtn);
    actionsDiv.appendChild(detailBtn);
    actionsDiv.appendChild(deleteBtn);

    row.appendChild(nameDiv);
    row.appendChild(statusBadge);
    row.appendChild(actionsDiv);

    checkBtn.onclick = () => {
      handlers.onCheck(acc);
    };
    openBtn.onclick = () => {
      handlers.onOpen(acc);
    };
    browserBtn.onclick = () => {
      handlers.onOpenBrowser(acc);
    };
    fixBtn.onclick = () => {
      handlers.onFix(acc);
    };
    detailBtn.onclick = () => {
      handlers.onDetail(acc, platform);
    };
    deleteBtn.onclick = () => {
      void handlers.onDelete(acc);
    };

    accountListEl.appendChild(row);
  });
}
