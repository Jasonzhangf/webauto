import type { ConfigPanelLayout } from './layout.mts';
import type { ConfigPanelState } from './types.mts';
import { DEFAULT_MAX_NOTES } from './types.mts';
import { readNumber } from './helpers.mts';
import { invokeSchedule, invokeTaskRunEphemeral } from './api.mts';
import { ensureAccountOption, loadAccounts as loadAccountsBase } from './accounts.mts';
import { createDraftPersistence } from './draft.mts';
import { buildSchedulePayload } from './payload.mts';
import {
  asCsvText,
  inferUiScheduleEditorState,
  parseTaskRows,
  pickLatestTask,
  toLocalDatetimeValue,
  type ScheduleTask,
} from '../schedule-task-bridge.mts';

export type StateHandlers = {
  markDirty: (reason?: string) => void;
  markSaved: (reason: string) => void;
  withSilentFormApply: (apply: () => void) => void;
  updateScheduleFields: () => void;
  updateLikeKeywordsState: () => void;
  renderConfigStatus: () => void;
};

export function createConfigPanelActions(
  ctx: any,
  ui: ConfigPanelLayout,
  state: ConfigPanelState,
  handlers: StateHandlers,
) {
  const draft = createDraftPersistence(ctx, ui, state);

  function applyTaskToForm(task: ScheduleTask) {
    handlers.withSilentFormApply(() => {
      state.selectedTaskId = task.id;
      if (ctx && typeof ctx === 'object') {
        ctx.activeTaskConfigId = task.id;
      }
      ui.taskConfigSelect.value = task.id;
      ui.taskNameInput.value = task.name || '';
      ui.taskEnabledCb.checked = task.enabled !== false;
      const uiSchedule = inferUiScheduleEditorState(task);
      ui.scheduleTypeSelect.value = uiSchedule.mode;
      ui.schedulePeriodicTypeSelect.value = uiSchedule.periodicType;
      ui.scheduleIntervalInput.value = String(task.intervalMinutes || 30);
      ui.scheduleRunAtInput.value = toLocalDatetimeValue(task.runAt);
      ui.scheduleMaxRunsInput.value = task.maxRuns ? String(task.maxRuns) : '';

      const profileId = String(task.commandArgv?.profile || '').trim();
      ensureAccountOption(ui, profileId);
      if (profileId) ui.accountSelect.value = profileId;
      ui.keywordInput.value = String(task.commandArgv?.keyword || task.commandArgv?.k || '');
      ui.targetInput.value = String(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? DEFAULT_MAX_NOTES);
      ui.envSelect.value = String(task.commandArgv?.env || 'debug');
      ui.fetchBodyCb.checked = task.commandArgv?.['fetch-body'] !== false;
      ui.fetchCommentsCb.checked = task.commandArgv?.['do-comments'] !== false;
      ui.maxCommentsInput.value = String(task.commandArgv?.['max-comments'] ?? 0);
      ui.autoLikeCb.checked = task.commandArgv?.['do-likes'] === true;
      ui.likeKeywordsInput.value = asCsvText(task.commandArgv?.['like-keywords']);
      ui.maxLikesInput.value = String(task.commandArgv?.['max-likes'] ?? 0);
      ui.headlessCb.checked = task.commandArgv?.headless === true;
      ui.dryRunCb.checked = task.commandArgv?.['dry-run'] === true;

      handlers.updateScheduleFields();
      handlers.updateLikeKeywordsState();
      draft.queueDraftSave();
    });
    handlers.markSaved(`已加载配置 ${task.id}`);
  }

  function renderTaskSelectOptions(preferredTaskId = '') {
    const targetId = String(preferredTaskId || state.selectedTaskId || '').trim();
    ui.taskConfigSelect.innerHTML = '';
    if (state.taskRows.length === 0) {
      ui.taskConfigSelect.appendChild(document.createElement('option')).textContent = '暂无配置任务';
      ui.taskConfigSelect.value = '';
      state.selectedTaskId = '';
      handlers.renderConfigStatus();
      return;
    }
    for (const row of state.taskRows) {
      const opt = document.createElement('option');
      opt.value = row.id;
      opt.textContent = `${row.name || row.id} (${row.id})`;
      ui.taskConfigSelect.appendChild(opt);
    }
    const fallbackLatest = pickLatestTask(state.taskRows);
    const selected = targetId && state.taskRows.some((row) => row.id === targetId)
      ? targetId
      : String(fallbackLatest?.id || '');
    if (selected) {
      ui.taskConfigSelect.value = selected;
      const row = state.taskRows.find((item) => item.id === selected);
      if (row) applyTaskToForm(row);
    }
  }

  async function loadLegacyDraftIfNeeded() {
    if (state.loadedFromLegacy) return;
    state.loadedFromLegacy = true;
    try {
      const config = await ctx.api.configLoadLast();
      if (!config) return;
      handlers.withSilentFormApply(() => {
        state.selectedTaskId = '';
        ui.taskNameInput.value = String(config.taskName || '').trim();
        ui.keywordInput.value = config.keyword || '';
        ui.targetInput.value = String(config.target || DEFAULT_MAX_NOTES);
        ui.envSelect.value = config.env || 'prod';
        ui.fetchBodyCb.checked = config.fetchBody !== false;
        ui.fetchCommentsCb.checked = config.fetchComments !== false;
        ui.maxCommentsInput.value = String(config.maxComments ?? 0);
        ui.autoLikeCb.checked = config.autoLike === true;
        ui.likeKeywordsInput.value = asCsvText(config.likeKeywords);
        ui.maxLikesInput.value = String(config.maxLikes ?? 0);
        ui.headlessCb.checked = config.headless === true;
        ui.dryRunCb.checked = config.dryRun === true;
        const legacyScheduleType = String(config.scheduleType || 'immediate').trim();
        if (legacyScheduleType === 'interval') {
          ui.scheduleTypeSelect.value = 'periodic';
          ui.schedulePeriodicTypeSelect.value = 'interval';
        } else if (legacyScheduleType === 'daily' || legacyScheduleType === 'weekly') {
          ui.scheduleTypeSelect.value = 'periodic';
          ui.schedulePeriodicTypeSelect.value = legacyScheduleType;
        } else if (legacyScheduleType === 'scheduled') {
          ui.scheduleTypeSelect.value = 'scheduled';
          ui.schedulePeriodicTypeSelect.value = 'interval';
        } else {
          ui.scheduleTypeSelect.value = 'immediate';
          ui.schedulePeriodicTypeSelect.value = 'interval';
        }
        ui.scheduleIntervalInput.value = String(config.intervalMinutes || 30);
        ui.scheduleRunAtInput.value = toLocalDatetimeValue(config.runAt || null);
        ui.scheduleMaxRunsInput.value = config.maxRuns ? String(config.maxRuns) : '';
        const preferredProfileId = String(config.lastProfileId || '').trim();
        ensureAccountOption(ui, preferredProfileId);
        if (preferredProfileId) {
          ui.accountSelect.value = preferredProfileId;
        }
        handlers.updateScheduleFields();
        handlers.updateLikeKeywordsState();
      });
      handlers.markSaved('已加载上次草稿');
    } catch (err) {
      console.error('Failed to load last config:', err);
    }
  }

  async function refreshTaskList(preferredTaskId = '') {
    try {
      const out = await invokeSchedule(ctx, { action: 'list' });
      state.taskRows = parseTaskRows(out).filter((row) => row.commandType === 'xhs-unified');
      renderTaskSelectOptions(preferredTaskId);
      if (state.taskRows.length === 0) {
        await loadLegacyDraftIfNeeded();
      }
    } catch (err) {
      console.error('Failed to list schedule tasks:', err);
      state.taskRows = [];
      renderTaskSelectOptions('');
      await loadLegacyDraftIfNeeded();
    }
  }

  async function loadAccounts() {
    await loadAccountsBase(ctx, ui, state);
  }

  async function persistTask(mode: 'add' | 'update') {
    const payload = buildSchedulePayload(ui, mode === 'update' ? state.selectedTaskId : '');
    if (mode === 'update' && !payload.id) {
      return persistTask('add');
    }
    const out = await invokeSchedule(ctx, {
      action: 'save',
      payload: mode === 'add' ? { ...payload, id: '' } : payload,
    });
    const taskId = String(out?.task?.id || payload.id || '').trim();
    if (!taskId) return '';
    state.selectedTaskId = taskId;
    if (ctx && typeof ctx === 'object') {
      ctx.activeTaskConfigId = taskId;
    }
    await refreshTaskList(taskId);
    draft.queueDraftSave();
    return taskId;
  }

  async function saveCurrentConfig() {
    try {
      const id = state.selectedTaskId
        ? await persistTask('update')
        : await persistTask('add');
      if (id && typeof ctx.setStatus === 'function') {
        ctx.setStatus(`saved: ${id}`);
      }
      if (id) {
        handlers.markSaved(`已保存配置 ${id}`);
      }
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function saveAsNewConfig() {
    try {
      const id = await persistTask('add');
      if (id && typeof ctx.setStatus === 'function') {
        ctx.setStatus(`saved new: ${id}`);
      }
      if (id) {
        handlers.markSaved(`已另存为 ${id}`);
      }
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function saveAndOpenScheduler() {
    try {
      const id = state.selectedTaskId
        ? await persistTask('update')
        : await persistTask('add');
      if (!id) return;
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`saved: ${id}`);
      }
      handlers.markSaved(`已保存并跳转任务页 ${id}`);
      if (typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab('scheduler');
      }
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function runCurrentConfig() {
    const mode = String(ui.scheduleTypeSelect.value || 'immediate').trim();
    if (mode === 'immediate') {
      await runNowWithoutSave();
      return;
    }
    ui.startBtn.disabled = true;
    const prevText = ui.startBtn.textContent;
    ui.startBtn.textContent = '执行中...';
    try {
      const taskId = state.selectedTaskId
        ? await persistTask('update')
        : await persistTask('add');
      if (!taskId) return;
      const out = await invokeSchedule(ctx, { action: 'run', taskId, timeoutMs: 0 });
      const runId = String(out?.result?.runResult?.lastRunId || '').trim();
      ctx.xhsCurrentRun = {
        runId: runId || null,
        taskId,
        profileId: ui.accountSelect.value || '',
        keyword: ui.keywordInput.value.trim(),
        target: readNumber(ui.targetInput, DEFAULT_MAX_NOTES, 1),
        startedAt: new Date().toISOString(),
      };
      ctx.activeRunId = runId || null;
      if (typeof ctx.appendLog === 'function') {
        ctx.appendLog(`[ui] schedule run task=${taskId} runId=${runId || '-'}`);
      }
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`running: ${taskId}`);
      }
      handlers.markSaved(`执行中: ${taskId}`);
      if (typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab('dashboard');
      }
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    } finally {
      ui.startBtn.disabled = false;
      ui.startBtn.textContent = prevText || '执行当前配置';
    }
  }

  async function runNowWithoutSave() {
    ui.startNowBtn.disabled = true;
    const prevText = ui.startNowBtn.textContent;
    ui.startNowBtn.textContent = '执行中...';
    try {
      const payload = buildSchedulePayload(ui, state.selectedTaskId || '');
      const ret = await invokeTaskRunEphemeral(ctx, {
        commandType: payload.commandType,
        argv: payload.argv,
      });
      const runId = String(ret?.runId || '').trim();
      ctx.xhsCurrentRun = {
        runId: runId || null,
        taskId: null,
        profileId: String(payload.argv.profile || ''),
        keyword: String(payload.argv.keyword || ''),
        target: Number(payload.argv['max-notes'] || DEFAULT_MAX_NOTES) || DEFAULT_MAX_NOTES,
        startedAt: new Date().toISOString(),
      };
      ctx.activeRunId = runId || null;
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus('started: xhs-unified');
      }
      handlers.markDirty('已立即执行（未保存）');
      if (typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab('dashboard');
      }
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    } finally {
      ui.startNowBtn.disabled = false;
      ui.startNowBtn.textContent = prevText || '立即执行(不保存)';
    }
  }

  async function openSchedulerEditor() {
    if (state.selectedTaskId && ctx && typeof ctx === 'object') {
      ctx.activeTaskConfigId = state.selectedTaskId;
    }
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('scheduler');
    }
  }

  async function exportConfig() {
    try {
      const config = draft.buildDraftConfig();
      const home = ctx.api.osHomedir();
      const downloadsPath = ctx.api.pathJoin(home, 'Downloads');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filePath = ctx.api.pathJoin(downloadsPath, `webauto-config-${timestamp}.json`);
      const result = await ctx.api.configExport({ filePath, config });
      if (result.ok) {
        alert(`配置已导出到: ${result.path}`);
      }
    } catch (err: any) {
      alert(`导出失败: ${err?.message || String(err)}`);
    }
  }

  async function importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text.replace(/^\uFEFF/, ''));
        handlers.withSilentFormApply(() => {
          ui.taskNameInput.value = String(config.taskName || config.name || '').trim();
          ui.keywordInput.value = String(config.keyword || '');
          ui.targetInput.value = String(config.target || config.maxNotes || DEFAULT_MAX_NOTES);
          ui.envSelect.value = String(config.env || 'prod');
          ui.fetchBodyCb.checked = config.fetchBody !== false;
          ui.fetchCommentsCb.checked = config.fetchComments !== false;
          ui.maxCommentsInput.value = String(config.maxComments ?? 0);
          ui.autoLikeCb.checked = config.autoLike === true;
          ui.likeKeywordsInput.value = asCsvText(config.likeKeywords);
          ui.maxLikesInput.value = String(config.maxLikes ?? 0);
          ui.headlessCb.checked = config.headless === true;
          ui.dryRunCb.checked = config.dryRun === true;
          const legacyScheduleType = String(config.scheduleType || 'immediate').trim();
          if (legacyScheduleType === 'interval') {
            ui.scheduleTypeSelect.value = 'periodic';
            ui.schedulePeriodicTypeSelect.value = 'interval';
          } else if (legacyScheduleType === 'daily' || legacyScheduleType === 'weekly') {
            ui.scheduleTypeSelect.value = 'periodic';
            ui.schedulePeriodicTypeSelect.value = legacyScheduleType;
          } else if (legacyScheduleType === 'scheduled') {
            ui.scheduleTypeSelect.value = 'scheduled';
            ui.schedulePeriodicTypeSelect.value = 'interval';
          } else {
            ui.scheduleTypeSelect.value = 'immediate';
            ui.schedulePeriodicTypeSelect.value = 'interval';
          }
          ui.scheduleIntervalInput.value = String(config.intervalMinutes || 30);
          ui.scheduleRunAtInput.value = toLocalDatetimeValue(config.runAt || null);
          ui.scheduleMaxRunsInput.value = config.maxRuns ? String(config.maxRuns) : '';
          const profileId = String(config.lastProfileId || config.profile || '').trim();
          if (profileId) {
            ensureAccountOption(ui, profileId);
            ui.accountSelect.value = profileId;
          }
          state.selectedTaskId = '';
          ui.taskConfigSelect.value = '';
          handlers.updateScheduleFields();
          handlers.updateLikeKeywordsState();
        });
        handlers.markDirty('已导入配置，待保存');
        draft.queueDraftSave();
        alert('配置已导入');
      } catch (err: any) {
        alert(`导入失败: ${err?.message || String(err)}`);
      }
    };
    input.click();
  }

  function selectTaskById(taskId: string) {
    const row = state.taskRows.find((item) => item.id === taskId);
    if (row) {
      applyTaskToForm(row);
    }
  }

  return {
    queueDraftSave: draft.queueDraftSave,
    refreshTaskList,
    loadAccounts,
    saveCurrentConfig,
    saveAsNewConfig,
    saveAndOpenScheduler,
    runCurrentConfig,
    runNowWithoutSave,
    openSchedulerEditor,
    exportConfig,
    importConfig,
    selectTaskById,
  };
}
