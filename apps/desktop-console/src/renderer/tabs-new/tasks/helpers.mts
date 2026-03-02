import type { Platform, ScheduleTask } from '../../schedule-task-bridge.mts';
import type { UiAccountProfile } from '../../account-source.mts';

export { listAccountProfiles } from '../../account-source.mts';

export function normalizePlatform(value: string): Platform {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'weibo') return 'weibo';
  if (raw === '1688') return '1688';
  return 'xiaohongshu';
}

export function platformToAccountPlatform(value: Platform): string {
  return value === 'xiaohongshu' ? 'xiaohongshu' : value;
}

export async function refreshPlatformAccountRows(api: any, platform: Platform): Promise<UiAccountProfile[]> {
  try {
    const { listAccountProfiles } = await import('../../account-source.mts');
    return await listAccountProfiles(api, { platform: platformToAccountPlatform(platform) });
  } catch {
    return [];
  }
}

export function getRecommendedProfile(accountRows: UiAccountProfile[]): UiAccountProfile | null {
  const candidates = accountRows
    .filter((row) => row.valid)
    .sort((a, b) => {
      const ta = Date.parse(String(a.updatedAt || '')) || 0;
      const tb = Date.parse(String(b.updatedAt || '')) || 0;
      if (tb !== ta) return tb - ta;
      return String(a.profileId || '').localeCompare(String(b.profileId || ''));
    });
  return candidates[0] || null;
}

export function isValidProfileForPlatform(accountRows: UiAccountProfile[], profileId: string): boolean {
  const id = String(profileId || '').trim();
  if (!id) return false;
  return accountRows.some((row) => row.valid && row.profileId === id);
}

export function resolveUsableProfileId(accountRows: UiAccountProfile[], preferredProfileId: string): string {
  const preferred = String(preferredProfileId || '').trim();
  if (preferred && accountRows.some((row) => row.valid && row.profileId === preferred)) {
    return preferred;
  }
  const recommended = getRecommendedProfile(accountRows);
  return String(recommended?.profileId || '').trim();
}

export async function ensureUsableProfileBeforeSubmit(
  api: any,
  platform: Platform,
  accountRows: UiAccountProfile[],
  profileInput: HTMLInputElement,
): Promise<string> {
  const rows = await refreshPlatformAccountRows(api, platform);
  accountRows.length = 0;
  accountRows.push(...rows);
  const current = String(profileInput.value || '').trim();
  if (isValidProfileForPlatform(accountRows, current)) return current;
  const recommended = getRecommendedProfile(accountRows);
  const recommendedId = String(recommended?.profileId || '').trim();
  if (recommendedId) {
    profileInput.value = recommendedId;
    return recommendedId;
  }
  return current;
}

export function getTaskById(tasks: ScheduleTask[], taskId: string): ScheduleTask | null {
  const id = String(taskId || '').trim();
  if (!id) return null;
  return tasks.find((row) => row.id === id) || null;
}

export function joinPath(ctx: any, ...parts: string[]): string {
  if (typeof ctx?.api?.pathJoin === 'function') return ctx.api.pathJoin(...parts);
  return parts.filter(Boolean).join('/');
}
