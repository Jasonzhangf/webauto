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

export function normalizePlatform(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'xiaohongshu';
  if (normalized === 'xhs') return 'xiaohongshu';
  return normalized;
}

export function getPlatformInfo(platform: string | null | undefined) {
  const key = normalizePlatform(platform);
  return {
    key,
    icon: PLATFORM_ICON[key] || '🌐',
    label: PLATFORM_LABEL[key] || key,
    loginUrl: key === 'weibo' ? 'https://weibo.com' : 'https://www.xiaohongshu.com',
  };
}

export function formatTs(value: number | null | undefined): string {
  if (!Number.isFinite(value) || Number(value) <= 0) return '未检查';
  try {
    return new Date(Number(value)).toLocaleString('zh-CN');
  } catch {
    return '未检查';
  }
}

export function toTimestamp(value: string | null | undefined): number | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function formatProfileTag(profileId: string): string {
  const id = String(profileId || '').trim();
  const m = id.match(/^profile-(\d+)$/i);
  if (!m) return id;
  const seq = Number(m[1]);
  if (!Number.isFinite(seq)) return id;
  return `P${String(seq).padStart(3, '0')}`;
}
