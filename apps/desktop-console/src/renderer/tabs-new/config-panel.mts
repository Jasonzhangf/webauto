import { renderConfigPanelLayout } from './config-panel/layout.mts';
import { createUiStateHandlers } from './config-panel/state.mts';
import { createConfigPanelActions } from './config-panel/actions.mts';
import { DEFAULT_MAX_NOTES, type ConfigPanelState } from './config-panel/types.mts';

export function renderConfigPanel(root: HTMLElement, ctx: any) {
  const ui = renderConfigPanelLayout(root);

  const state: ConfigPanelState = {
    accountRows: [],
    taskRows: [],
    selectedTaskId: String(ctx?.activeTaskConfigId || '').trim(),
    saveTimeout: null,
    loadedFromLegacy: false,
    isDirty: false,
    suppressDirtyTracking: false,
    lastActionText: '-',
  };

  const handlers = createUiStateHandlers(ui, state);
  const actions = createConfigPanelActions(ctx, ui, state, handlers);

  ui.taskConfigSelect.addEventListener('change', () => {
    const taskId = String(ui.taskConfigSelect.value || '').trim();
    actions.selectTaskById(taskId);
  });
  ui.scheduleTypeSelect.addEventListener('change', () => {
    handlers.updateScheduleFields();
    handlers.markDirty();
    actions.queueDraftSave();
  });
  ui.schedulePeriodicTypeSelect.addEventListener('change', () => {
    handlers.updateScheduleFields();
    handlers.markDirty();
    actions.queueDraftSave();
  });
  ui.autoLikeCb.onchange = () => {
    handlers.updateLikeKeywordsState();
    handlers.markDirty();
    actions.queueDraftSave();
  };

  ui.taskConfigRefreshBtn.onclick = () => {
    void actions.refreshTaskList(state.selectedTaskId);
  };
  ui.taskOpenSchedulerBtn.onclick = () => {
    void actions.openSchedulerEditor();
  };
  ui.importBtn.onclick = () => {
    void actions.importConfig();
  };
  ui.exportBtn.onclick = () => {
    void actions.exportConfig();
  };
  ui.saveCurrentBtn.onclick = () => {
    void actions.saveCurrentConfig();
  };
  ui.saveNewBtn.onclick = () => {
    void actions.saveAsNewConfig();
  };
  ui.saveOpenSchedulerBtn.onclick = () => {
    void actions.saveAndOpenScheduler();
  };
  ui.startBtn.onclick = () => {
    void actions.runCurrentConfig();
  };
  ui.startNowBtn.onclick = () => {
    void actions.runNowWithoutSave();
  };

  [
    ui.taskNameInput,
    ui.taskEnabledCb,
    ui.keywordInput,
    ui.targetInput,
    ui.envSelect,
    ui.accountSelect,
    ui.scheduleIntervalInput,
    ui.scheduleRunAtInput,
    ui.scheduleMaxRunsInput,
    ui.fetchBodyCb,
    ui.fetchCommentsCb,
    ui.maxCommentsInput,
    ui.likeKeywordsInput,
    ui.maxLikesInput,
    ui.headlessCb,
    ui.dryRunCb,
  ].forEach((el) => {
    el.onchange = () => {
      handlers.markDirty();
      actions.queueDraftSave();
    };
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') {
      (el as HTMLInputElement).oninput = () => {
        handlers.markDirty();
        actions.queueDraftSave();
      };
    }
  });

  ui.scheduleTypeSelect.value = 'immediate';
  ui.schedulePeriodicTypeSelect.value = 'interval';
  ui.scheduleRunAtInput.value = '';
  handlers.updateScheduleFields();
  handlers.updateLikeKeywordsState();
  handlers.renderConfigStatus();
  void actions.loadAccounts();
  void actions.refreshTaskList(state.selectedTaskId);

  return {
    DEFAULT_MAX_NOTES,
  };
}
