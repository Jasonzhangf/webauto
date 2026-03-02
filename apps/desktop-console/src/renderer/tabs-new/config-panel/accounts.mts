import { createEl } from '../ui-components.mts';
import { listAccountProfiles, type UiAccountProfile } from '../account-source.mts';
import type { ConfigPanelLayout } from './layout.mts';
import type { ConfigPanelState } from './types.mts';

export function ensureAccountOption(ui: ConfigPanelLayout, profileId: string) {
  const id = String(profileId || '').trim();
  if (!id) return;
  const found = Array.from(ui.accountSelect.options).some((opt) => String(opt.value || '') === id);
  if (found) return;
  const opt = createEl('option', { value: id }, [`${id} (非活动账号)`]) as HTMLOptionElement;
  ui.accountSelect.appendChild(opt);
}

export async function loadAccounts(ctx: any, ui: ConfigPanelLayout, state: ConfigPanelState) {
  try {
    state.accountRows = await listAccountProfiles(ctx.api, { platform: 'xiaohongshu' });
    const validRows = state.accountRows.filter((row) => row.valid);
    const current = String(ui.accountSelect.value || '').trim();
    ui.accountSelect.innerHTML = '<option value="">请选择账户...</option>';
    for (const row of validRows) {
      const profileId = String(row.profileId || '');
      const label = row.alias ? `${row.alias} (${profileId})` : (row.name || profileId);
      ui.accountSelect.appendChild(createEl('option', { value: profileId }, [label]) as HTMLOptionElement);
    }
    if (current) ensureAccountOption(ui, current);
    if (current) ui.accountSelect.value = current;
  } catch (err) {
    console.error('Failed to load accounts:', err);
  }
}
