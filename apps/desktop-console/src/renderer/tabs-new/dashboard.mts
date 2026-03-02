import { renderDashboardLayout } from './dashboard/layout.mts';
import { createElapsedTracker } from './dashboard/elapsed.mts';
import { createLogWriter } from './dashboard/logs.mts';
import { createAccountLabelManager } from './dashboard/account-labels.mts';
import { createRunSummaryManager } from './dashboard/summary.mts';
import { createDashboardStateUpdater } from './dashboard/state-update.mts';
import { createDashboardEventHandlers } from './dashboard/events.mts';
import { DashboardState } from './dashboard/types.mts';
import { hasRenderableValue, isRunningStatus, isTerminalStatus, normalizeStatus, isXhsCommandTitle } from './dashboard/helpers.mts';

export function renderDashboard(root: HTMLElement, ctx: any) {
  const ui = renderDashboardLayout(root);

  const state: DashboardState = {
    logsExpanded: false,
    paused: false,
    commentsCount: 0,
    likesCount: 0,
    likesSkippedCount: 0,
    likesAlreadyCount: 0,
    likesDedupCount: 0,
    startTime: Date.now(),
    stoppedAt: null,
    elapsedTimer: null,
    statePollTimer: null,
    accountLabelPollTimer: null,
    unsubscribeState: null,
    unsubscribeCmd: null,
    unsubscribeBus: null,
    contextRun: ctx?.xhsCurrentRun && typeof ctx.xhsCurrentRun === 'object' ? ctx.xhsCurrentRun : null,
    contextStartedAtMs: Date.parse(String(ctx?.xhsCurrentRun?.startedAt || '')),
    activeRunId: String(ctx?.xhsCurrentRun?.runId || ctx?.activeRunId || '').trim(),
    activeProfileId: String(ctx?.xhsCurrentRun?.profileId || '').trim(),
    activeStatus: '',
    errorCountTotal: 0,
    recentErrors: [],
    likedLinks: new Map(),
    maxLogs: 500,
    maxRecentErrors: 8,
    maxLikedLinks: 30,
    accountLabelByProfile: new Map(),
    accountLabelRefreshInFlight: false,
    accountLabelRefreshedAt: 0,
    accountLabelRefreshTtlMs: 15_000,
    initialTaskId: String(ctx?.xhsCurrentRun?.taskId || ctx?.activeTaskConfigId || '').trim(),
  };

  if (state.initialTaskId) {
    ui.taskConfigId.textContent = state.initialTaskId;
  }

  const elapsed = createElapsedTracker(ui, state);
  const logs = createLogWriter(ui, state);
  const accountLabels = createAccountLabelManager(ctx, ui, state);
  const runSummary = createRunSummaryManager(ctx, ui, state, {
    addLog: logs.addLog,
    updateElapsed: elapsed.updateElapsed,
    startElapsedTimer: elapsed.startElapsedTimer,
  });
  const stateUpdater = createDashboardStateUpdater({
    ctx,
    ui,
    state,
    accountLabels,
    runSummary,
    elapsed,
  });
  const events = createDashboardEventHandlers({
    ctx,
    ui,
    state,
    accountLabels,
    runSummary,
    elapsed,
  });

  if (state.contextRun) {
    if (hasRenderableValue(state.contextRun.keyword)) ui.taskKeyword.textContent = String(state.contextRun.keyword);
    if (Number(state.contextRun.target) > 0) ui.taskTarget.textContent = String(Number(state.contextRun.target));
    if (hasRenderableValue(state.contextRun.profileId)) {
      accountLabels.applyAccountLabel(state.contextRun.profileId);
    }
    if (hasRenderableValue(state.contextRun.taskId)) ui.taskConfigId.textContent = String(state.contextRun.taskId);
    const startedAtTs = Date.parse(String(state.contextRun.startedAt || ''));
    if (Number.isFinite(startedAtTs) && startedAtTs > 0) {
      state.startTime = startedAtTs;
      elapsed.updateElapsed();
    }
  }

  function startStatePoll() {
    if (state.statePollTimer) return;
    if (typeof ctx.api?.stateGetTasks !== 'function') return;
    state.statePollTimer = setInterval(() => {
      if (state.paused) return;
      void stateUpdater.fetchCurrentState();
    }, 5000);
  }

  function stopStatePoll() {
    if (!state.statePollTimer) return;
    clearInterval(state.statePollTimer);
    state.statePollTimer = null;
  }

  function subscribeToUpdates() {
    if (typeof ctx.api?.onStateUpdate === 'function') {
      state.unsubscribeState = ctx.api.onStateUpdate((update: any) => {
        if (state.paused) return;
        const runId = String(update?.runId || '').trim();
        const status = normalizeStatus(update?.data?.status);
        if (state.activeRunId && runId && runId !== state.activeRunId) {
          if (isTerminalStatus(state.activeStatus) && (isRunningStatus(status) || status)) {
            state.activeRunId = runId;
            state.activeStatus = status || 'running';
            state.stoppedAt = null;
            runSummary.renderRunSummary();
          } else {
            return;
          }
        }
        if (!state.activeRunId && runId) {
          state.activeRunId = runId;
          runSummary.renderRunSummary();
        }

        if (update?.data && typeof update.data === 'object') {
          const payload = { ...(update.data || {}), runId };
          stateUpdater.updateFromTaskState(payload);
          if (payload.action) logs.addLog(String(payload.action), 'info');
          if (payload.error) {
            logs.addLog(String(payload.error), 'error');
            runSummary.pushRecentError(String(payload.error), 'state', payload);
          }
        }
      });
    }

    if (typeof ctx.api?.onBusEvent === 'function') {
      state.unsubscribeBus = ctx.api.onBusEvent((payload: any) => {
        if (state.paused) return;
        if (payload && payload.event) {
          events.updateFromEventPayload(payload);
        }
      });
    }

    if (typeof ctx.api?.onCmdEvent === 'function') {
      state.unsubscribeCmd = ctx.api.onCmdEvent((evt: any) => {
        if (state.paused) return;
        const runId = String(evt?.runId || '').trim();
        const preferredRunId = String(ctx?.activeRunId || '').trim();
        const shouldAdoptStartedRun = (
          evt?.type === 'started'
          && runId
          && isXhsCommandTitle(evt?.title)
          && (
            !state.activeRunId
            || isTerminalStatus(state.activeStatus)
            || (preferredRunId && preferredRunId === runId)
          )
        );
        if (shouldAdoptStartedRun) {
          state.activeRunId = runId;
          state.activeStatus = 'running';
          runSummary.resetDashboardForNewRun('进程启动');
          runSummary.renderRunSummary();
        }
        if (state.activeRunId && runId && runId !== state.activeRunId) return;

        if (evt.type === 'stdout') {
          logs.addLog(evt.line, 'info');
          events.parseLineEvent(String(evt.line || '').trim());
        } else if (evt.type === 'stderr') {
          logs.addLog(evt.line, 'error');
          runSummary.pushRecentError(String(evt.line || ''), 'stderr', evt);
          const failed = Number(ui.statFailed.textContent || '0') || 0;
          ui.statFailed.textContent = String(failed + 1);
        } else if (evt.type === 'exit') {
          if (!state.stoppedAt) {
            ui.currentPhase.textContent = Number(evt.exitCode || 0) === 0 ? '已结束' : '失败';
            ui.currentAction.textContent = `exit(${evt.exitCode ?? 'null'})`;
          }
          logs.addLog(`进程退出: code=${evt.exitCode}`, evt.exitCode === 0 ? 'success' : 'error');
          if (!state.stoppedAt) {
            state.stoppedAt = Date.now();
            elapsed.updateElapsed();
            elapsed.stopElapsedTimer();
          }
          if (Number(evt.exitCode || 0) !== 0) {
            runSummary.pushRecentError(`进程退出 code=${evt.exitCode ?? 'null'}`, 'exit', evt);
          }
          runSummary.renderRunSummary();
        }
      });
    }
  }

  ui.toggleLogsBtn.onclick = () => {
    state.logsExpanded = !state.logsExpanded;
    ui.logsContainer.style.display = state.logsExpanded ? 'block' : 'none';
    ui.toggleLogsBtn.textContent = state.logsExpanded ? '收起' : '展开';
  };

  ui.pauseBtn.onclick = () => {
    state.paused = !state.paused;
    ui.pauseBtn.textContent = state.paused ? '继续' : '暂停';
    if (state.paused) {
      logs.addLog('任务已暂停', 'warn');
    } else {
      logs.addLog('任务继续执行', 'info');
    }
  };

  ui.stopBtn.onclick = async () => {
    if (confirm('确定要停止当前任务吗？')) {
      try {
        const tasks = await ctx.api.stateGetTasks();
        let runIdToStop = String(state.activeRunId || '').trim();
        if (!runIdToStop && Array.isArray(tasks)) {
          const running = tasks.find((item: any) => ['running', 'queued', 'pending', 'starting'].includes(String(item?.status || '').toLowerCase()));
          runIdToStop = String(running?.runId || tasks[0]?.runId || '').trim();
        }
        if (runIdToStop) {
          await ctx.api.cmdKill(runIdToStop);
          logs.addLog('任务已停止', 'warn');
        } else {
          logs.addLog('未找到可停止的运行任务', 'warn');
        }
      } catch (err) {
        console.error('Failed to stop task:', err);
      }

      setTimeout(() => {
        if (typeof ctx.setActiveTab === 'function') {
          ctx.setActiveTab('tasks');
        }
      }, 1500);
    }
  };

  ui.backConfigBtn.onclick = () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('tasks');
    }
  };

  runSummary.renderRunSummary();
  void accountLabels.refreshAccountLabels(true);
  void stateUpdater.loadTaskInfo();
  void stateUpdater.fetchCurrentState();
  subscribeToUpdates();
  startStatePoll();
  accountLabels.startAccountLabelPoll();
  elapsed.startElapsedTimer();

  return () => {
    elapsed.stopElapsedTimer();
    stopStatePoll();
    accountLabels.stopAccountLabelPoll();
    if (state.unsubscribeState) state.unsubscribeState();
    if (state.unsubscribeCmd) state.unsubscribeCmd();
    if (state.unsubscribeBus) state.unsubscribeBus();
  };
}
