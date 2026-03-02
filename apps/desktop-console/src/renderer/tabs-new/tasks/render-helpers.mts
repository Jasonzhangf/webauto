import type { ScheduleTask } from '../../schedule-task-bridge.mts';
import { parseSortableTime } from './types.mts';

export function sortedTasksByRecent(tasks: ScheduleTask[]): ScheduleTask[] {
  return [...tasks].sort((a, b) => {
    const byUpdated = parseSortableTime(b.updatedAt) - parseSortableTime(a.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    const byCreated = parseSortableTime(b.createdAt) - parseSortableTime(a.createdAt);
    if (byCreated !== 0) return byCreated;
    return (Number(b.seq) || 0) - (Number(a.seq) || 0);
  });
}

export function updateSelectionUi(
  rows: ScheduleTask[],
  selectedTaskIds: Set<string>,
  taskSelectAll: HTMLInputElement,
  historyDeleteBtn: HTMLButtonElement,
) {
  const availableIds = new Set(rows.map((row) => row.id));
  for (const id of Array.from(selectedTaskIds)) {
    if (!availableIds.has(id)) selectedTaskIds.delete(id);
  }
  const total = rows.length;
  const selected = rows.filter((row) => selectedTaskIds.has(row.id)).length;
  taskSelectAll.checked = total > 0 && selected === total;
  taskSelectAll.indeterminate = selected > 0 && selected < total;
  historyDeleteBtn.disabled = selected === 0;
  historyDeleteBtn.textContent = selected > 0 ? `批量删除(${selected})` : '批量删除';
}
