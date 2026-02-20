export type ScheduleType = 'interval' | 'once' | 'daily' | 'weekly';

export type Platform = 'xiaohongshu' | 'weibo' | '1688';

export type TaskDefinition = {
  type: string;
  label: string;
  icon: string;
  platform: Platform;
};

export const PLATFORM_TASKS: Record<Platform, TaskDefinition[]> = {
  xiaohongshu: [
    { type: 'xhs-unified', label: '搜索任务', icon: '📕', platform: 'xiaohongshu' }
  ],
  weibo: [
    { type: 'weibo-timeline', label: '主页时间线', icon: '📰', platform: 'weibo' },
    { type: 'weibo-search', label: '搜索任务', icon: '🔍', platform: 'weibo' },
    { type: 'weibo-monitor', label: '监控个人主页', icon: '👁️', platform: 'weibo' }
  ],
  '1688': [
    { type: '1688-search', label: '搜索任务', icon: '🛒', platform: '1688' }
  ]
};

export const SUPPORTED_COMMAND_TYPES = [
  'xhs-unified',
  'weibo-timeline',
  'weibo-search',
  'weibo-monitor',
  '1688-search',
];

export type ScheduleTask = {
  id: string;
  seq: number;
  name: string;
  enabled: boolean;
  scheduleType: ScheduleType;
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
  nextRunAt: string | null;
  commandType: string;
  commandArgv: Record<string, any>;
  createdAt: string | null;
  updatedAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  runCount: number;
  failCount: number;
  runHistory?: Array<{ timestamp: string; status: 'success' | 'failure'; durationMs: number }>;
};

function normalizeScheduleType(value: any): ScheduleType {
  const text = String(value || 'interval').trim().toLowerCase();
  if (text === 'once' || text === 'daily' || text === 'weekly') return text;
  return 'interval';
}

export function toLocalDatetimeValue(iso: string | null): string {
  const text = String(iso || '').trim();
  if (!text) return '';
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return '';
  const date = new Date(ts);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function toIsoOrNull(localDateTime: string): string | null {
  const text = String(localDateTime || '').trim();
  if (!text) return null;
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function parseRunHistory(items: any): ScheduleTask['runHistory'] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item: any) => ({
      timestamp: String(item?.timestamp || '').trim(),
      status: String(item?.status || '').trim() === 'failure' ? 'failure' : 'success',
      durationMs: Number.isFinite(Number(item?.durationMs)) ? Math.max(0, Number(item.durationMs)) : 0,
    }))
    .filter((item: any) => item.timestamp);
}

export function parseTaskRows(payload: any): ScheduleTask[] {
  const rows = Array.isArray(payload?.tasks) ? payload.tasks : [];
  return rows
    .map((row: any) => ({
      id: String(row?.id || '').trim(),
      seq: Number.isFinite(Number(row?.seq)) ? Math.max(0, Math.floor(Number(row.seq))) : 0,
      name: String(row?.name || row?.id || '').trim(),
      enabled: row?.enabled !== false,
      scheduleType: normalizeScheduleType(row?.scheduleType),
      intervalMinutes: Number.isFinite(Number(row?.intervalMinutes))
        ? Math.max(1, Math.floor(Number(row.intervalMinutes)))
        : 30,
      runAt: String(row?.runAt || '').trim() || null,
      maxRuns: Number.isFinite(Number(row?.maxRuns)) && Number(row.maxRuns) > 0
        ? Math.floor(Number(row.maxRuns))
        : null,
      nextRunAt: String(row?.nextRunAt || '').trim() || null,
      commandType: String(row?.commandType || 'xhs-unified').trim() || 'xhs-unified',
      commandArgv: row?.commandArgv && typeof row.commandArgv === 'object' ? row.commandArgv : {},
      createdAt: String(row?.createdAt || '').trim() || null,
      updatedAt: String(row?.updatedAt || '').trim() || null,
      lastRunAt: String(row?.lastRunAt || '').trim() || null,
      lastStatus: String(row?.lastStatus || '').trim() || null,
      lastError: String(row?.lastError || '').trim() || null,
      runCount: Number(row?.runCount || 0) || 0,
      failCount: Number(row?.failCount || 0) || 0,
      runHistory: parseRunHistory(row?.runHistory),
    }))
    .filter((row) => row.id);
}

function parseSortableTime(value: string | null): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

export function pickLatestTask(tasks: ScheduleTask[]): ScheduleTask | null {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  const sorted = [...tasks].sort((a, b) => {
    const byUpdated = parseSortableTime(b.updatedAt) - parseSortableTime(a.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    const byCreated = parseSortableTime(b.createdAt) - parseSortableTime(a.createdAt);
    if (byCreated !== 0) return byCreated;
    return (Number(b.seq) || 0) - (Number(a.seq) || 0);
  });
  return sorted[0] || null;
}

export function asCsvText(value: any): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(',');
  }
  return String(value || '').trim();
}

export function getTasksForPlatform(platform: string): TaskDefinition[] {
  const p = platform as Platform;
  return PLATFORM_TASKS[p] || [];
}

export function getPlatformForCommandType(commandType: string): Platform {
  if (commandType.startsWith('xhs')) return 'xiaohongshu';
  if (commandType.startsWith('weibo')) return 'weibo';
  if (commandType.startsWith('1688')) return '1688';
  return 'xiaohongshu';
}

export function getTaskDefinition(commandType: string): TaskDefinition | null {
  const platform = getPlatformForCommandType(commandType);
  const tasks = PLATFORM_TASKS[platform];
  return tasks.find(t => t.type === commandType) || null;
}
