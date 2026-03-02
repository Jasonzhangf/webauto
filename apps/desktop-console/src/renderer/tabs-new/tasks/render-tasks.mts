import type { ScheduleTask } from '../../schedule-task-bridge.mts';
import { sortedTasksByRecent } from './render-helpers.mts';

export type TaskActionCallbacks = {
  getTaskById: (taskId: string) => ScheduleTask | null;
  applyTaskToForm: (task: ScheduleTask, mode: 'edit' | 'clone') => void;
  runTaskImmediately: (task: ScheduleTask) => void;
  deleteTasks: (taskIds: string[]) => Promise<void>;
  updateSelectionUi: (rows: ScheduleTask[], selectedTaskIds: Set<string>, taskSelectAll: HTMLInputElement, historyDeleteBtn: HTMLButtonElement) => void;
};

export function renderHistorySelect(
  historySelect: HTMLSelectElement,
  tasks: ScheduleTask[],
) {
  const previous = String(historySelect.value || '').trim();
  const rows = sortedTasksByRecent(tasks);
  historySelect.innerHTML = '<option value="">选择历史任务...</option>';
  for (const row of rows) {
    const label = `${row.name || row.id} (${row.id})`;
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = label;
    historySelect.appendChild(option);
  }
  if (previous && rows.some((row) => row.id === previous)) {
    historySelect.value = previous;
  }
}

export function renderRecentTasks(
  recentTasksList: HTMLDivElement,
  tasks: ScheduleTask[],
  selectedTaskIds: Set<string>,
  taskSelectAll: HTMLInputElement,
  historyDeleteBtn: HTMLButtonElement,
  cbs: TaskActionCallbacks,
) {
  const rows = sortedTasksByRecent(tasks);
  if (rows.length === 0) {
    recentTasksList.innerHTML = '<div class="muted" style="font-size:12px;">暂无任务</div>';
    cbs.updateSelectionUi([], selectedTaskIds, taskSelectAll, historyDeleteBtn);
    return;
  }
  recentTasksList.innerHTML = rows.map((task) => `
    <div class="task-row task-item" data-id="${task.id}" style="display:flex;gap:var(--gap-sm);padding:var(--gap-xs)0;border-bottom:1px solid var(--border-subtle);align-items:center;cursor:pointer;">
      <input class="task-select-checkbox" data-id="${task.id}" type="checkbox" style="margin:0;" ${selectedTaskIds.has(task.id) ? 'checked' : ''} />
      <span style="flex:1;font-size:12px;">${task.name || task.id}</span>
      <span style="font-size:11px;color:var(--text-tertiary);">${task.commandType}</span>
      <span style="font-size:11px;color:${task.enabled ? 'var(--accent-success)' : 'var(--text-muted)'};">${task.enabled ? '启用' : '禁用'}</span>
      <button class="secondary edit-task-btn" data-id="${task.id}" style="padding:2px 6px;font-size:10px;height:auto;">编辑</button>
      <button class="run-task-btn" data-id="${task.id}" style="padding:2px 6px;font-size:10px;height:auto;">立即执行</button>
      <button class="secondary delete-task-btn" data-id="${task.id}" style="padding:2px 6px;font-size:10px;height:auto;">删除</button>
    </div>
  `).join('');
  recentTasksList.querySelectorAll('.task-select-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener('change', () => {
      const input = checkbox as HTMLInputElement;
      const taskId = String(input.dataset.id || '').trim();
      if (!taskId) return;
      if (input.checked) selectedTaskIds.add(taskId);
      else selectedTaskIds.delete(taskId);
      cbs.updateSelectionUi(rows, selectedTaskIds, taskSelectAll, historyDeleteBtn);
    });
  });
  recentTasksList.querySelectorAll('.task-item').forEach((item) => {
    item.addEventListener('dblclick', () => {
      const taskId = (item as HTMLDivElement).dataset.id || '';
      const task = cbs.getTaskById(taskId);
      if (!task) return;
      cbs.applyTaskToForm(task, 'edit');
    });
  });
  recentTasksList.querySelectorAll('.edit-task-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const taskId = (btn as HTMLButtonElement).dataset.id || '';
      const task = cbs.getTaskById(taskId);
      if (!task) return;
      cbs.applyTaskToForm(task, 'edit');
    });
  });
  recentTasksList.querySelectorAll('.run-task-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const taskId = (btn as HTMLButtonElement).dataset.id || '';
      const task = cbs.getTaskById(taskId);
      if (!task) return;
      cbs.runTaskImmediately(task);
    });
  });
  recentTasksList.querySelectorAll('.delete-task-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const taskId = String((btn as HTMLButtonElement).dataset.id || '').trim();
      if (!taskId) return;
      void cbs.deleteTasks([taskId]);
    });
  });
  cbs.updateSelectionUi(rows, selectedTaskIds, taskSelectAll, historyDeleteBtn);
}
