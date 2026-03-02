import type { SchedulerLayout } from './layout.mts';
import type { SchedulerState } from './types.mts';
import { ensureUsableProfileBeforeSubmit } from './accounts.mts';
import { invokeSchedule, invokeTaskRunEphemeral, downloadJson } from './api.mts';

export function createSchedulerActions(
  ctx: any,
  ui: SchedulerLayout,
  state: SchedulerState,
  helpers: {
    setActiveTaskContext: (taskId: string) => void;
    openConfigTab: (taskId: string) => void;
    setDaemonStatus: (text: string) => void;
  },
  forms: {
    resetForm: () => void;
    readFormAsPayload: () => any;
    applyTaskToForm: (task: any) => void;
    updateTaskTypeOptions: () => void;
    updateTypeFields: () => void;
  },
  refreshList: () => Promise<void>,
) {
  async function saveTask() {
    await ensureUsableProfileBeforeSubmit(ctx, ui, state);
    const payload = forms.readFormAsPayload();
    try {
      const out = await invokeSchedule(ctx, { action: 'save', payload });
      const savedId = String(out?.task?.id || payload.id || '').trim();
      state.pendingFocusTaskId = savedId;
      if (savedId) helpers.setActiveTaskContext(savedId);
      await refreshList();
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function runNowFromForm() {
    ui.runNowBtn.disabled = true;
    const prevText = ui.runNowBtn.textContent;
    ui.runNowBtn.textContent = '执行中...';
    try {
      await ensureUsableProfileBeforeSubmit(ctx, ui, state);
      const payload = forms.readFormAsPayload();
      const ret = await invokeTaskRunEphemeral(ctx, {
        commandType: payload.commandType,
        argv: payload.argv,
      });
      const runId = String(ret?.runId || '').trim();
      if (payload.commandType === 'xhs-unified' && ctx && typeof ctx === 'object') {
        ctx.xhsCurrentRun = {
          runId: runId || null,
          taskId: null,
          profileId: String(payload.argv.profile || ''),
          keyword: String(payload.argv.keyword || ''),
          target: Number(payload.argv['max-notes'] || payload.argv.target || 0) || 0,
          startedAt: new Date().toISOString(),
        };
        ctx.activeRunId = runId || null;
      }
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`started: ${payload.commandType}`);
      }
      if (payload.commandType === 'xhs-unified' && typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab('dashboard');
      }
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    } finally {
      ui.runNowBtn.disabled = false;
      ui.runNowBtn.textContent = prevText || '立即执行(不保存)';
    }
  }

  async function runDueNow() {
    try {
      const out = await invokeSchedule(ctx, { action: 'run-due', limit: 20, timeoutMs: 0 });
      alert(`到点任务执行完成：due=${out.count || 0}, success=${out.success || 0}, failed=${out.failed || 0}`);
      await refreshList();
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    }
  }

  async function exportAll() {
    try {
      const out = await invokeSchedule(ctx, { action: 'export' });
      downloadJson('webauto-schedules.json', out);
    } catch (err: any) {
      alert(`导出失败: ${err?.message || String(err)}`);
    }
  }

  async function importFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (evt) => {
      const file = (evt.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await invokeSchedule(ctx, { action: 'import', payloadJson: text, mode: 'merge' });
        await refreshList();
      } catch (err: any) {
        alert(`导入失败: ${err?.message || String(err)}`);
      }
    };
    input.click();
  }

  async function startDaemon() {
    if (state.daemonRunId) {
      alert('daemon 已启动');
      return;
    }
    const interval = Math.max(5, Number(ui.daemonIntervalInput.value || 30) || 30);
    const ret = await invokeSchedule(ctx, { action: 'daemon-start', intervalSec: interval, limit: 20 });
    state.daemonRunId = String(ret?.runId || '').trim();
    helpers.setDaemonStatus(state.daemonRunId ? `daemon: 运行中 (${state.daemonRunId})` : 'daemon: 启动失败');
  }

  async function stopDaemon() {
    if (!state.daemonRunId) {
      helpers.setDaemonStatus('daemon: 未启动');
      return;
    }
    try {
      await ctx.api.cmdKill({ runId: state.daemonRunId });
    } catch {
      // ignore
    }
    state.daemonRunId = '';
    helpers.setDaemonStatus('daemon: 已停止');
  }

  return {
    saveTask,
    runNowFromForm,
    runDueNow,
    exportAll,
    importFromFile,
    startDaemon,
    stopDaemon,
  };
}
