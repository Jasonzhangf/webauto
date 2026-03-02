import type { ScheduleTask } from '../../schedule-task-bridge.mts';
import type { TaskFormData } from './types.mts';
import { parseTaskRows } from '../../schedule-task-bridge.mts';
import { toTaskDedupFingerprintFromForm, toTaskDedupFingerprintFromTask, toDedupKey } from './schedule-helpers.mts';
import { sortedTasksByRecent } from './render-helpers.mts';
import { getTaskById } from './helpers.mts';

export async function invokeSchedule(ctx: any, input: Record<string, any>) {
  if (typeof ctx.api?.scheduleInvoke !== 'function') {
    throw new Error('scheduleInvoke unavailable');
  }
  const ret = await ctx.api.scheduleInvoke(input);
  if (!ret?.ok) {
    const reason = String(ret?.error || 'schedule command failed').trim();
    throw new Error(reason || 'schedule command failed');
  }
  return ret?.json ?? ret;
}

export async function invokeTaskRunEphemeral(ctx: any, input: Record<string, any>) {
  if (typeof ctx.api?.taskRunEphemeral !== 'function') {
    throw new Error('taskRunEphemeral unavailable');
  }
  const ret = await ctx.api.taskRunEphemeral(input);
  if (!ret?.ok) {
    const reason = String(ret?.error || 'run ephemeral failed').trim();
    throw new Error(reason || 'run ephemeral failed');
  }
  return ret;
}

export async function loadQuotaStatus(ctx: any, quotaBar: HTMLElement, quotaScript: string) {
  try {
    const ret = await ctx.api.cmdRunJson({
      title: 'quota status',
      cwd: '',
      args: [quotaScript],
      timeoutMs: 30_000,
    });
    if (!ret?.ok) return;
    const payload = ret?.json || {};
    const quotas = Array.isArray(payload?.quotas) ? payload.quotas : [];
    for (const quota of quotas) {
      const type = String(quota?.type || '').trim();
      if (!type) continue;
      const count = Number(quota?.count || 0);
      const max = Number(quota?.max || 0);
      const el = quotaBar.querySelector(`#quota-${type}`) as HTMLSpanElement | null;
      if (!el) continue;
      el.textContent = `${type}: ${count}/${max || '-'}`;
      el.style.color = max > 0 && count >= max ? 'var(--accent-danger)' : '';
    }
  } catch (err) {
    console.error('load quota failed:', err);
  }
}

export async function loadTasks(ctx: any): Promise<ScheduleTask[]> {
  try {
    const out = await invokeSchedule(ctx, { action: 'list' });
    return parseTaskRows(out);
  } catch (err) {
    console.error('load tasks failed:', err);
    return [];
  }
}

export function findDuplicateTaskByParams(tasks: ScheduleTask[], data: TaskFormData): ScheduleTask | null {
  const dedupKey = toDedupKey(toTaskDedupFingerprintFromForm(data));
  const rows = sortedTasksByRecent(tasks);
  for (const row of rows) {
    if (toDedupKey(toTaskDedupFingerprintFromTask(row)) === dedupKey) return row;
  }
  return null;
}

export function resolveSaveTargetTask(
  tasks: ScheduleTask[],
  data: TaskFormData,
  editingIdInput: HTMLInputElement,
  updateFormTitle: (mode: 'new' | 'edit' | 'clone') => void,
): ScheduleTask | null {
  const editingId = String(data.id || '').trim();
  if (editingId) {
    const editingTask = getTaskById(tasks, editingId);
    if (editingTask) return editingTask;
    data.id = undefined;
    editingIdInput.value = '';
    updateFormTitle('new');
  }
  return findDuplicateTaskByParams(tasks, data);
}
