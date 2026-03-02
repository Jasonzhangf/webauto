import { renderSchedulerLayout } from './scheduler/layout.mts';
import { SchedulerState } from './scheduler/types.mts';
import { createSchedulerUiHelpers } from './scheduler/shared.mts';
import { createSchedulerFormActions } from './scheduler/forms.mts';
import { createSchedulerActions } from './scheduler/actions.mts';
import { invokeSchedule } from './scheduler/api.mts';
import { parseTaskRows } from './schedule-task-bridge.mts';
import { createSchedulerListRenderer } from './scheduler/list.mts';

export function renderSchedulerPanel(root: HTMLElement, ctx: any) {
  const ui = renderSchedulerLayout(root);

  const state: SchedulerState = {
    tasks: [],
    accountRows: [],
    daemonRunId: '',
    unsubscribeCmd: null,
    pendingFocusTaskId: String(ctx?.activeTaskConfigId || '').trim(),
  };

  const helpers = createSchedulerUiHelpers(ctx, ui, state);
  const forms = createSchedulerFormActions(ctx, ui, state, helpers);
  const listRenderer = createSchedulerListRenderer({
    ctx,
    ui,
    state,
    helpers,
    forms,
    refreshList,
  });

  async function refreshList() {
    const out = await invokeSchedule(ctx, { action: 'list' });
    state.tasks = parseTaskRows(out);
    if (!state.pendingFocusTaskId) {
      state.pendingFocusTaskId = String(ctx?.activeTaskConfigId || '').trim();
    }
    if (state.pendingFocusTaskId) {
      const target = state.tasks.find((item) => item.id === state.pendingFocusTaskId);
      if (target) {
        forms.applyTaskToForm(target);
      } else {
        helpers.setActiveTaskContext('');
      }
      state.pendingFocusTaskId = '';
    } else {
      helpers.setActiveTaskContext(String(ctx?.activeTaskConfigId || '').trim());
    }
    listRenderer.renderTaskList();
  }

  const actions = createSchedulerActions(ctx, ui, state, helpers, forms, refreshList);

  ui.platformSelect.addEventListener('change', forms.updateTaskTypeOptions);
  ui.taskTypeSelect.addEventListener('change', forms.updatePlatformFields);
  ui.typeSelect.addEventListener('change', forms.updateTypeFields);
  ui.periodicTypeSelect.addEventListener('change', forms.updateTypeFields);

  ui.saveBtn.onclick = () => void actions.saveTask();
  ui.runNowBtn.onclick = () => void actions.runNowFromForm();
  ui.resetBtn.onclick = () => forms.resetForm();
  ui.refreshBtn.onclick = () => void refreshList();
  ui.runDueBtn.onclick = () => void actions.runDueNow();
  ui.exportAllBtn.onclick = () => void actions.exportAll();
  ui.importBtn.onclick = () => void actions.importFromFile();
  ui.openConfigBtn.onclick = () => {
    const id = String(ui.editingIdInput.value || ui.activeTaskIdText.textContent || '').trim();
    helpers.openConfigTab(id);
  };
  ui.daemonStartBtn.onclick = () => void actions.startDaemon();
  ui.daemonStopBtn.onclick = () => void actions.stopDaemon();

  if (typeof ctx.api?.onCmdEvent === 'function') {
    state.unsubscribeCmd = ctx.api.onCmdEvent((evt: any) => {
      const runId = String(evt?.runId || '').trim();
      if (!state.daemonRunId || runId !== state.daemonRunId) return;
      if (evt?.type === 'exit') {
        state.daemonRunId = '';
        helpers.setDaemonStatus('daemon: 已退出');
      }
    });
  }

  forms.resetForm();
  forms.updateTaskTypeOptions();
  listRenderer.renderTaskList();
  void refreshList().catch((err: any) => {
    ui.listEl.innerHTML = `<div class="muted" style="padding: 12px;">加载失败: ${err?.message || String(err)}</div>`;
  });

  return () => {
    if (state.unsubscribeCmd) {
      try { state.unsubscribeCmd(); } catch {}
      state.unsubscribeCmd = null;
    }
  };
}
