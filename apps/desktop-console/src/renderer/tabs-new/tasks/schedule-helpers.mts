import type { TaskFormData, RunMeta } from './types.mts';
import type { ScheduleTask } from '../../schedule-task-bridge.mts';
import { toIsoOrNull, inferUiScheduleEditorState } from '../../schedule-task-bridge.mts';
import { normalizeIsoOrNull, normalizeCsvKeywords } from './types.mts';

export function buildCommandArgv(data: TaskFormData): Record<string, any> {
  const argv: Record<string, any> = {
    keyword: data.keyword,
    'max-notes': data.targetCount,
    target: data.targetCount,
    env: data.env,
    'service-reset': false,
    'do-comments': data.collectComments,
    'fetch-body': data.collectBody,
    'do-likes': data.doLikes,
    'like-keywords': data.likeKeywords,
  };
  const profileId = String(data.profileId || '').trim();
  if (profileId) argv.profile = profileId;
  if (String(data.taskType || '').startsWith('weibo-')) {
    if (data.userId) argv['user-id'] = data.userId;
  }
  return argv;
}

export function resolveSchedule(data: TaskFormData): {
  scheduleType: 'interval' | 'once' | 'daily' | 'weekly';
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
} {
  if (data.scheduleMode === 'immediate') {
    return {
      scheduleType: 'once',
      intervalMinutes: data.intervalMinutes,
      runAt: new Date().toISOString(),
      maxRuns: 1,
    };
  }
  if (data.scheduleMode === 'scheduled') {
    return {
      scheduleType: 'once',
      intervalMinutes: data.intervalMinutes,
      runAt: data.runAt,
      maxRuns: 1,
    };
  }
  const periodicType = data.periodicType;
  if (periodicType === 'daily' || periodicType === 'weekly') {
    return {
      scheduleType: periodicType,
      intervalMinutes: data.intervalMinutes,
      runAt: data.runAt,
      maxRuns: data.maxRuns,
    };
  }
  return {
    scheduleType: 'interval',
    intervalMinutes: data.intervalMinutes,
    runAt: null,
    maxRuns: data.maxRuns,
  };
}

export function toSchedulePayload(data: TaskFormData): Record<string, any> {
  const schedule = resolveSchedule(data);
  return {
    id: data.id || '',
    name: data.name || '',
    enabled: data.enabled,
    commandType: data.taskType || 'xhs-unified',
    scheduleType: schedule.scheduleType,
    intervalMinutes: schedule.intervalMinutes,
    runAt: schedule.runAt,
    maxRuns: schedule.maxRuns,
    argv: buildCommandArgv(data),
  };
}

export function taskToRunMeta(task: ScheduleTask): RunMeta {
  return {
    taskType: String(task.commandType || 'xhs-unified').trim() || 'xhs-unified',
    profileId: String(task.commandArgv?.profile || task.commandArgv?.profileId || '').trim(),
    keyword: String(task.commandArgv?.keyword || task.commandArgv?.k || '').trim(),
    targetCount: Math.max(1, Number(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? 50) || 50),
  };
}

export function toTaskDedupFingerprintFromForm(data: TaskFormData) {
  const scheduleMode = data.scheduleMode;
  const periodicType = scheduleMode === 'periodic' ? data.periodicType : 'interval';
  const intervalMinutes = scheduleMode === 'periodic' ? Math.max(1, Number(data.intervalMinutes || 30) || 30) : 0;
  const runAt = scheduleMode === 'scheduled'
    || (scheduleMode === 'periodic' && (periodicType === 'daily' || periodicType === 'weekly'))
    ? normalizeIsoOrNull(data.runAt)
    : null;
  const maxRuns = scheduleMode === 'periodic'
    ? (Number.isFinite(Number(data.maxRuns || 0)) && Number(data.maxRuns) > 0 ? Math.max(1, Math.floor(Number(data.maxRuns))) : null)
    : null;
  return {
    taskType: String(data.taskType || 'xhs-unified').trim() || 'xhs-unified',
    profileId: String(data.profileId || '').trim(),
    keyword: String(data.keyword || '').trim(),
    targetCount: Math.max(1, Number(data.targetCount || 50) || 50),
    env: String(data.env || 'debug').trim() === 'prod' ? 'prod' : 'debug',
    userId: String(data.userId || '').trim(),
    collectComments: data.collectComments !== false,
    collectBody: data.collectBody !== false,
    doLikes: data.doLikes === true,
    likeKeywords: normalizeCsvKeywords(data.likeKeywords),
    scheduleMode,
    periodicType,
    intervalMinutes,
    runAt,
    maxRuns,
  };
}

export function toTaskDedupFingerprintFromTask(task: ScheduleTask) {
  const uiSchedule = inferUiScheduleEditorState(task);
  const scheduleMode = uiSchedule.mode;
  const periodicType = uiSchedule.periodicType;
  const intervalMinutes = scheduleMode === 'periodic'
    ? Math.max(1, Number(task.intervalMinutes || 30) || 30)
    : 0;
  const runAt = scheduleMode === 'scheduled'
    || (scheduleMode === 'periodic' && (periodicType === 'daily' || periodicType === 'weekly'))
    ? normalizeIsoOrNull(task.runAt)
    : null;
  const maxRuns = scheduleMode === 'periodic'
    ? (Number.isFinite(Number(task.maxRuns || 0)) && Number(task.maxRuns) > 0
      ? Math.max(1, Math.floor(Number(task.maxRuns)))
      : null)
    : null;
  return {
    taskType: String(task.commandType || 'xhs-unified').trim() || 'xhs-unified',
    profileId: String(task.commandArgv?.profile || task.commandArgv?.profileId || '').trim(),
    keyword: String(task.commandArgv?.keyword || task.commandArgv?.k || '').trim(),
    targetCount: Math.max(1, Number(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? 50) || 50),
    env: String(task.commandArgv?.env || 'debug').trim() === 'prod' ? 'prod' : 'debug',
    userId: String(task.commandArgv?.['user-id'] || task.commandArgv?.userId || '').trim(),
    collectComments: task.commandArgv?.['do-comments'] !== false,
    collectBody: task.commandArgv?.['fetch-body'] !== false,
    doLikes: task.commandArgv?.['do-likes'] === true,
    likeKeywords: normalizeCsvKeywords(String(task.commandArgv?.['like-keywords'] || '').trim()),
    scheduleMode,
    periodicType,
    intervalMinutes,
    runAt,
    maxRuns,
  };
}

export function toDedupKey(fingerprint: any): string {
  return JSON.stringify(fingerprint);
}
