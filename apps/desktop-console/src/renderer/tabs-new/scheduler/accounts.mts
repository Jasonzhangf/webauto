import { listAccountProfiles, type UiAccountProfile } from '../../account-source.mts';
import type { SchedulerLayout } from './layout.mts';
import type { SchedulerState } from './types.mts';

export function normalizePlatform(value: string): 'xiaohongshu' | 'weibo' | '1688' {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'weibo') return 'weibo';
  if (raw === '1688') return '1688';
  return 'xiaohongshu';
}

export async function refreshPlatformAccounts(
  ctx: any,
  ui: SchedulerLayout,
  state: SchedulerState,
  platformValue: string,
) {
  const platform = normalizePlatform(platformValue);
  try {
    state.accountRows = await listAccountProfiles(ctx.api, { platform: platform === 'xiaohongshu' ? 'xiaohongshu' : platform });
  } catch {
    state.accountRows = [];
  }
  const recommended = getRecommendedProfile(state.accountRows);
  if (!recommended) {
    ui.profileHint.textContent = `推荐: 当前平台(${platform})无有效账号`;
    return;
  }
  const label = recommended.alias || recommended.name || recommended.profileId;
  ui.profileHint.textContent = `推荐: ${label} (${recommended.profileId})`;
  if (!String(ui.profileInput.value || '').trim()) {
    ui.profileInput.value = recommended.profileId;
  }
}

export function getRecommendedProfile(rows: UiAccountProfile[]): UiAccountProfile | null {
  const sorted = rows
    .filter((row) => row.valid)
    .sort((a, b) => {
      const ta = Date.parse(String(a.updatedAt || '')) || 0;
      const tb = Date.parse(String(b.updatedAt || '')) || 0;
      if (tb !== ta) return tb - ta;
      return String(a.profileId || '').localeCompare(String(b.profileId || ''));
    });
  return sorted[0] || null;
}

export function isValidProfileForCurrentPlatform(rows: UiAccountProfile[], profileId: string): boolean {
  const id = String(profileId || '').trim();
  if (!id) return false;
  return rows.some((row) => row.valid && row.profileId === id);
}

export async function ensureUsableProfileBeforeSubmit(
  ctx: any,
  ui: SchedulerLayout,
  state: SchedulerState,
): Promise<string> {
  await refreshPlatformAccounts(ctx, ui, state, ui.platformSelect.value);
  const current = String(ui.profileInput.value || '').trim();
  if (isValidProfileForCurrentPlatform(state.accountRows, current)) return current;
  const recommended = getRecommendedProfile(state.accountRows);
  const recommendedId = String(recommended?.profileId || '').trim();
  if (recommendedId) {
    ui.profileInput.value = recommendedId;
    return recommendedId;
  }
  return current;
}
