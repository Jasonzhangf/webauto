import type { Platform, ScheduleTask } from '../../schedule-task-bridge.mts';

export type TaskFormData = {
  id?: string;
  name: string;
  enabled: boolean;
  platform: Platform;
  taskType: string;
  profileId: string;
  keyword: string;
  targetCount: number;
  env: 'debug' | 'prod';
  userId: string;
  collectComments: boolean;
  collectBody: boolean;
  doLikes: boolean;
  likeKeywords: string;
  scheduleMode: 'immediate' | 'periodic' | 'scheduled';
  periodicType: 'interval' | 'daily' | 'weekly';
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
};

export type RunMeta = Pick<TaskFormData, 'taskType' | 'profileId' | 'keyword' | 'targetCount'>;

export type TaskDedupFingerprint = {
  taskType: string;
  profileId: string;
  keyword: string;
  targetCount: number;
  env: 'debug' | 'prod';
  userId: string;
  collectComments: boolean;
  collectBody: boolean;
  doLikes: boolean;
  likeKeywords: string;
  scheduleMode: TaskFormData['scheduleMode'];
  periodicType: TaskFormData['periodicType'];
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
};

export const DEFAULT_FORM: TaskFormData = {
  name: '',
  enabled: true,
  platform: 'xiaohongshu',
  taskType: 'xhs-unified',
  profileId: '',
  keyword: '',
  targetCount: 50,
  env: 'debug',
  userId: '',
  collectComments: true,
  collectBody: true,
  doLikes: false,
  likeKeywords: '',
  scheduleMode: 'immediate',
  periodicType: 'interval',
  intervalMinutes: 30,
  runAt: null,
  maxRuns: null,
};

export function parseSortableTime(value: string | null | undefined): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

export function normalizeCsvKeywords(value: string): string {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',');
}

export function normalizeIsoOrNull(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return text;
  return new Date(ts).toISOString();
}

export type { Platform, ScheduleTask };
