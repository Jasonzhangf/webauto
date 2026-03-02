import {
  inferUiScheduleEditorState,
  toIsoOrNull,
  toLocalDatetimeValue,
  type ScheduleTask,
  getPlatformForCommandType,
  getTasksForPlatform,
} from '../schedule-task-bridge.mts';
import type { SchedulerLayout } from './layout.mts';
import type { SchedulerState } from './types.mts';
import { refreshPlatformAccounts } from './accounts.mts';

export function createSchedulerFormActions(
  ctx: any,
  ui: SchedulerLayout,
  state: SchedulerState,
  helpers: {
    setActiveTaskContext: (taskId: string) => void;
  },
) {
  function updateTypeFields() {
    const mode = String(ui.typeSelect.value || 'immediate').trim();
    const periodicType = String(ui.periodicTypeSelect.value || 'interval').trim();
    const periodic = mode === 'periodic';
    const scheduled = mode === 'scheduled';
    ui.periodicTypeWrap.style.display = periodic ? '' : 'none';
    ui.runAtWrap.style.display = scheduled || (periodic && periodicType !== 'interval') ? '' : 'none';
    ui.intervalWrap.style.display = periodic && periodicType === 'interval' ? '' : 'none';
    ui.maxRunsInput.disabled = mode === 'immediate' || mode === 'scheduled';
    if (mode === 'immediate' || mode === 'scheduled') {
      ui.maxRunsInput.value = '';
    }
  }

  function updatePlatformFields() {
    const commandType = String(ui.taskTypeSelect.value || '').trim();
    const isWeiboMonitor = commandType === 'weibo-monitor';
    ui.userIdWrap.style.display = isWeiboMonitor ? '' : 'none';
  }

  function updateTaskTypeOptions() {
    const platform = ui.platformSelect.value;
    const tasks = getTasksForPlatform(platform);
    ui.taskTypeSelect.innerHTML = tasks
      .map(t => `<option value="${t.type}">${t.icon} ${t.label}</option>`)
      .join('');
    if (ui.taskTypeSelect.options.length > 0) {
      ui.taskTypeSelect.value = ui.taskTypeSelect.options[0]?.value || '';
    }
    updatePlatformFields();
    void refreshPlatformAccounts(ctx, ui, state, platform);
  }

  function resetForm() {
    ui.platformSelect.value = 'xiaohongshu';
    updateTaskTypeOptions();
    ui.editingIdInput.value = '';
    ui.nameInput.value = '';
    ui.enabledInput.checked = true;
    ui.typeSelect.value = 'immediate';
    ui.periodicTypeSelect.value = 'interval';
    ui.intervalInput.value = '30';
    ui.runAtInput.value = '';
    ui.maxRunsInput.value = '';
    ui.profileInput.value = '';
    ui.keywordInput.value = '';
    ui.userIdInput.value = '';
    ui.maxNotesInput.value = '50';
    ui.envSelect.value = 'debug';
    ui.commentsInput.checked = true;
    ui.likesInput.checked = false;
    ui.headlessInput.checked = false;
    ui.dryRunInput.checked = false;
    ui.likeKeywordsInput.value = '';
    helpers.setActiveTaskContext('');
    updatePlatformFields();
    updateTypeFields();
  }

  function readFormAsPayload() {
    const maxRunsRaw = ui.maxRunsInput.value.trim();
    const maxRuns = maxRunsRaw
      ? Math.max(1, Number(maxRunsRaw) || 1)
      : null;
    const commandType = String(ui.taskTypeSelect.value || 'xhs-unified').trim();
    const argv: Record<string, any> = {
      keyword: ui.keywordInput.value.trim(),
      'max-notes': Number(ui.maxNotesInput.value || 50) || 50,
      env: ui.envSelect.value,
      'do-comments': ui.commentsInput.checked,
      'do-likes': ui.likesInput.checked,
      'like-keywords': ui.likeKeywordsInput.value.trim(),
      headless: ui.headlessInput.checked,
      'dry-run': ui.dryRunInput.checked,
    };
    const profileValue = ui.profileInput.value.trim();
    if (profileValue) argv.profile = profileValue;
    if (commandType.startsWith('weibo')) {
      argv['user-id'] = ui.userIdInput.value.trim();
    }
    const mode = String(ui.typeSelect.value || 'immediate').trim();
    const periodicType = String(ui.periodicTypeSelect.value || 'interval').trim();
    let scheduleType: ScheduleTask['scheduleType'] = 'once';
    let runAt = toIsoOrNull(ui.runAtInput.value);
    let maxRunsFinal = maxRuns;
    if (mode === 'immediate') {
      scheduleType = 'once';
      runAt = new Date().toISOString();
      maxRunsFinal = 1;
    } else if (mode === 'periodic') {
      if (periodicType === 'daily' || periodicType === 'weekly') {
        scheduleType = periodicType;
      } else {
        scheduleType = 'interval';
        runAt = null;
      }
    } else {
      scheduleType = 'once';
      maxRunsFinal = 1;
    }
    return {
      id: ui.editingIdInput.value.trim(),
      name: ui.nameInput.value.trim(),
      enabled: ui.enabledInput.checked,
      commandType,
      scheduleType,
      intervalMinutes: Number(ui.intervalInput.value || 30) || 30,
      runAt,
      maxRuns: maxRunsFinal,
      argv,
    };
  }

  function applyTaskToForm(task: ScheduleTask) {
    state.pendingFocusTaskId = '';
    const platform = getPlatformForCommandType(String(task.commandType || 'xhs-unified'));
    ui.platformSelect.value = platform;
    updateTaskTypeOptions();
    ui.taskTypeSelect.value = String(task.commandType || ui.taskTypeSelect.value || 'xhs-unified');
    ui.editingIdInput.value = task.id;
    ui.nameInput.value = task.name || '';
    ui.enabledInput.checked = task.enabled !== false;
    const uiSchedule = inferUiScheduleEditorState(task);
    ui.typeSelect.value = uiSchedule.mode;
    ui.periodicTypeSelect.value = uiSchedule.periodicType;
    ui.intervalInput.value = String(task.intervalMinutes || 30);
    ui.runAtInput.value = toLocalDatetimeValue(task.runAt);
    ui.maxRunsInput.value = task.maxRuns ? String(task.maxRuns) : '';
    ui.profileInput.value = String(task.commandArgv?.profile || '');
    ui.keywordInput.value = String(task.commandArgv?.keyword || task.commandArgv?.k || '');
    ui.userIdInput.value = String(task.commandArgv?.['user-id'] || task.commandArgv?.userId || '');
    ui.maxNotesInput.value = String(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? 50);
    ui.envSelect.value = String(task.commandArgv?.env || 'debug');
    ui.commentsInput.checked = task.commandArgv?.['do-comments'] !== false;
    ui.likesInput.checked = task.commandArgv?.['do-likes'] === true;
    ui.headlessInput.checked = task.commandArgv?.headless === true;
    ui.dryRunInput.checked = task.commandArgv?.['dry-run'] === true;
    ui.likeKeywordsInput.value = String(task.commandArgv?.['like-keywords'] || '');
    helpers.setActiveTaskContext(task.id);
    updatePlatformFields();
    updateTypeFields();
  }

  return {
    updateTypeFields,
    updateTaskTypeOptions,
    updatePlatformFields,
    resetForm,
    readFormAsPayload,
    applyTaskToForm,
  };
}
