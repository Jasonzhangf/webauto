import { createEl } from '../../ui-components.mts';
import type { ScheduleTask } from '../schedule-task-bridge.mts';
import type { SchedulerLayout } from './layout.mts';
import type { SchedulerState } from './types.mts';
import { invokeSchedule, downloadJson } from './api.mts';

export type SchedulerListDeps = {
  ctx: any;
  ui: SchedulerLayout;
  state: SchedulerState;
  helpers: {
    setActiveTaskContext: (taskId: string) => void;
    openConfigTab: (taskId: string) => void;
  };
  forms: {
    applyTaskToForm: (task: ScheduleTask) => void;
  };
  refreshList: () => Promise<void>;
};

export function createSchedulerListRenderer(deps: SchedulerListDeps) {
  const { ctx, ui, state, helpers, forms, refreshList } = deps;

  function renderTaskList() {
    ui.listEl.innerHTML = '';
    if (state.tasks.length === 0) {
      ui.listEl.innerHTML = '<div class="muted" style="padding: 12px;">暂无任务</div>';
      return;
    }
    for (const task of state.tasks) {
      const card = createEl('div', {
        style: 'border:1px solid var(--border); border-radius:10px; padding:10px; margin-bottom:10px; background: var(--panel-soft);',
      });
      const scheduleText = task.scheduleType === 'once'
        ? `定时任务 @ ${task.runAt || '-'}`
        : task.scheduleType === 'daily'
          ? `周期任务(日) @ ${task.runAt || '-'}`
          : task.scheduleType === 'weekly'
            ? `周期任务(周) @ ${task.runAt || '-'}`
            : `周期任务(间隔 ${task.intervalMinutes}m)`;
      const statusText = task.lastStatus
        ? `${task.lastStatus} / run=${task.runCount} / fail=${task.failCount}`
        : 'never run';

      const headRow = createEl('div', { style: 'display:flex; justify-content:space-between; gap:8px; margin-bottom:6px;' });
      headRow.appendChild(createEl('div', { style: 'font-weight:600;' }, [task.name || task.id]));
      headRow.appendChild(
        createEl(
          'span',
          { style: `font-size:12px; color:${task.enabled ? 'var(--accent-success)' : 'var(--accent-danger)'};` },
          [task.enabled ? 'enabled' : 'disabled'],
        ),
      );
      card.appendChild(headRow);
      card.appendChild(createEl('div', { className: 'muted', style: 'font-size:12px; margin-bottom:4px;' }, [`id=${task.id}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`schedule: ${scheduleText}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`maxRuns: ${task.maxRuns || 'unlimited'}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`nextRunAt: ${task.nextRunAt || '-'}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`status: ${statusText}`]));

      const recent = (task.runHistory || []).slice(-5);
      if (recent.length > 0) {
        const recentRow = createEl('div', { style: 'font-size:12px;' }, ['recent: ']);
        for (const h of recent) {
          const icon = h.status === 'success' ? '✅' : '❌';
          const duration = h.durationMs ? `${Math.round(h.durationMs / 1000)}s` : '-';
          const badge = createEl('span', { title: `${h.timestamp} ${duration}` }, [icon]);
          recentRow.appendChild(badge);
          recentRow.appendChild(document.createTextNode(' '));
        }
        card.appendChild(recentRow);
      }

      if (task.lastError) {
        card.appendChild(createEl('div', { style: 'font-size:12px; color:var(--accent-danger);' }, [`error: ${task.lastError}`]));
      }

      const actions = createEl('div', { className: 'btn-group', style: 'margin-top: 8px;' });
      const editBtn = createEl('button', { className: 'secondary' }, ['编辑']) as HTMLButtonElement;
      const loadBtn = createEl('button', { className: 'secondary' }, ['载入配置']) as HTMLButtonElement;
      const runBtn = createEl('button', { className: 'secondary' }, ['执行']) as HTMLButtonElement;
      const exportBtn = createEl('button', { className: 'secondary' }, ['导出']) as HTMLButtonElement;
      const delBtn = createEl('button', { className: 'danger' }, ['删除']) as HTMLButtonElement;
      actions.appendChild(editBtn);
      actions.appendChild(loadBtn);
      actions.appendChild(runBtn);
      actions.appendChild(exportBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);

      editBtn.onclick = () => forms.applyTaskToForm(task);
      loadBtn.onclick = () => helpers.openConfigTab(task.id);
      runBtn.onclick = async () => {
        try {
          helpers.setActiveTaskContext(task.id);
          const out = await invokeSchedule(ctx, { action: 'run', taskId: task.id, timeoutMs: 0 });
          const runId = String(
            out?.result?.runResult?.lastRunId
            || out?.result?.runResult?.runId
            || out?.runResult?.runId
            || '',
          ).trim();
          if (task.commandType === 'xhs-unified' && ctx && typeof ctx === 'object') {
            const argv = task.commandArgv || {};
            ctx.xhsCurrentRun = {
              runId: runId || null,
              taskId: task.id,
              profileId: String(argv.profile || ''),
              keyword: String(argv.keyword || argv.k || ''),
              target: Number(argv['max-notes'] || argv.target || 0) || 0,
              startedAt: new Date().toISOString(),
            };
            ctx.activeRunId = runId || null;
          }
          if (typeof ctx.setStatus === 'function') {
            ctx.setStatus(`running: ${task.id}`);
          }
          if (task.commandType === 'xhs-unified' && typeof ctx.setActiveTab === 'function') {
            ctx.setActiveTab('dashboard');
          }
          await refreshList();
        } catch (err: any) {
          alert(`执行失败: ${err?.message || String(err)}`);
        }
      };
      exportBtn.onclick = async () => {
        try {
          const out = await invokeSchedule(ctx, { action: 'export', taskId: task.id });
          downloadJson(`${task.id}.json`, out);
        } catch (err: any) {
          alert(`导出失败: ${err?.message || String(err)}`);
        }
      };
      delBtn.onclick = async () => {
        if (!confirm(`确认删除任务 ${task.id} ?`)) return;
        try {
          await invokeSchedule(ctx, { action: 'delete', taskId: task.id });
          await refreshList();
        } catch (err: any) {
          alert(`删除失败: ${err?.message || String(err)}`);
        }
      };

      ui.listEl.appendChild(card);
    }
  }

  return { renderTaskList };
}
