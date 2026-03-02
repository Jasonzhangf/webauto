import type { DashboardLayout } from './layout.mts';
import type { DashboardState } from './types.mts';
import { hasRenderableValue, isRunningStatus, isTerminalStatus, normalizeStatus } from './helpers.mts';

export type StateUpdaterDeps = {
  ctx: any;
  ui: DashboardLayout;
  state: DashboardState;
  accountLabels: {
    applyAccountLabel: (profileIdLike: any) => void;
  };
  runSummary: {
    renderRunSummary: () => void;
    pushRecentError: (message: string, source?: string, details?: any) => void;
    resetDashboardForNewRun: (reason: string, startedAtMs?: number) => void;
  };
  elapsed: {
    updateElapsed: () => void;
    startElapsedTimer: () => void;
    stopElapsedTimer: () => void;
  };
};

export function createDashboardStateUpdater(deps: StateUpdaterDeps) {
  const { ctx, ui, state, accountLabels, runSummary, elapsed } = deps;

  function updateFromTaskState(taskState: any) {
    if (!taskState) return;
    const incomingRunId = String(taskState.runId || '').trim();
    if (
      incomingRunId
      && state.activeRunId
      && incomingRunId !== state.activeRunId
      && (isTerminalStatus(state.activeStatus) || !isRunningStatus(state.activeStatus))
      && isRunningStatus(taskState.status)
    ) {
      state.activeRunId = incomingRunId;
      runSummary.resetDashboardForNewRun('切换到新任务');
    }

    const progressObj = taskState.progress && typeof taskState.progress === 'object' ? taskState.progress : null;
    const processedRaw = progressObj?.processed ?? progressObj?.current ?? taskState.progress ?? taskState.collected ?? taskState.current ?? 0;
    const totalRaw = progressObj?.total ?? taskState.total ?? taskState.target ?? taskState.maxNotes ?? 0;
    const failedRaw = progressObj?.failed ?? taskState.failed ?? taskState.errors ?? 0;
    const collected = Number(processedRaw) || 0;
    const target = Number(totalRaw) || 0;
    const success = Number(taskState.success ?? collected) || 0;
    const failed = Number(failedRaw) || 0;
    const remaining = Math.max(0, target - collected);

    ui.statCollected.textContent = String(collected);
    ui.statSuccess.textContent = String(success);
    ui.statFailed.textContent = String(failed);
    ui.statRemaining.textContent = String(remaining);

    let percent = 0;
    if (target > 0) {
      percent = Math.round((collected / target) * 100);
    } else if (progressObj && Number.isFinite(Number(progressObj.percent))) {
      const pct = Number(progressObj.percent);
      percent = pct <= 1 ? Math.round(pct * 100) : Math.round(pct);
    }
    ui.progressPercent.textContent = `${percent}%`;
    ui.progressBar.style.width = `${percent}%`;

    if (taskState.phase) {
      ui.currentPhase.textContent = taskState.phase;
    }
    const action = String(taskState.action || taskState.message || taskState.step || '').trim();
    if (action) {
      ui.currentAction.textContent = action;
    }
    const stats = taskState.stats && typeof taskState.stats === 'object' ? taskState.stats : null;
    const comments = Number(stats?.commentsCollected ?? taskState.comments);
    if (Number.isFinite(comments)) {
      state.commentsCount = Math.max(0, Math.floor(comments));
      ui.statComments.textContent = `${state.commentsCount}条`;
    }
    const likes = Number(stats?.likesPerformed ?? taskState.likes);
    if (Number.isFinite(likes)) {
      state.likesCount = Math.max(0, Math.floor(likes));
      ui.statLikes.textContent = `${state.likesCount}次 (跳过:${state.likesSkippedCount}, 已赞:${state.likesAlreadyCount}, 去重:${state.likesDedupCount})`;
    }
    if (taskState.ratelimits) {
      ui.statRatelimit.textContent = `${taskState.ratelimits}次`;
    }

    if (taskState.keyword) {
      ui.taskKeyword.textContent = taskState.keyword;
    }
    if (taskState.target) {
      ui.taskTarget.textContent = String(taskState.target);
    }
    if (taskState.profileId) {
      accountLabels.applyAccountLabel(taskState.profileId);
    }
    const taskId = String(taskState.taskId || taskState.scheduleTaskId || taskState.configTaskId || '').trim();
    if (taskId) {
      ui.taskConfigId.textContent = taskId;
      if (ctx && typeof ctx === 'object') {
        ctx.activeTaskConfigId = taskId;
      }
    }
    if (taskState.runId) {
      state.activeRunId = String(taskState.runId);
      runSummary.renderRunSummary();
    }
    if (taskState.startedAt) {
      const ts = Number(taskState.startedAt) || Date.parse(String(taskState.startedAt));
      if (Number.isFinite(ts) && ts > 0) {
        state.startTime = ts;
        if (!state.stoppedAt) {
          elapsed.updateElapsed();
          elapsed.startElapsedTimer();
        }
      }
    }
    const status = normalizeStatus(taskState.status);
    if (status) {
      state.activeStatus = status;
    }
    if (status === 'completed' || status === 'done' || status === 'success' || status === 'succeeded') {
      if (!state.stoppedAt) {
        state.stoppedAt = Date.now();
        elapsed.updateElapsed();
        elapsed.stopElapsedTimer();
      }
    }
    if (status === 'failed' || status === 'error') {
      if (!state.stoppedAt) {
        state.stoppedAt = Date.now();
        elapsed.updateElapsed();
        elapsed.stopElapsedTimer();
      }
    }
    if (taskState.error) {
      runSummary.pushRecentError(String(taskState.error), 'state', taskState);
    }
  }

  function pickTaskFromList(tasks: any[]) {
    const target = state.activeRunId;
    const sorted = [...tasks].sort((a, b) => {
      const aTs = Number(a?.updatedAt ?? a?.completedAt ?? a?.startedAt ?? 0) || 0;
      const bTs = Number(b?.updatedAt ?? b?.completedAt ?? b?.startedAt ?? 0) || 0;
      return bTs - aTs;
    });
    const running = sorted.find((item) => isRunningStatus(item?.status)) || null;
    const latest = sorted[0] || null;
    const launchingFresh = Number.isFinite(state.contextStartedAtMs)
      && state.contextStartedAtMs > 0
      && (Date.now() - state.contextStartedAtMs) < 120_000;
    if (target) {
      const matched = tasks.find((item) => String(item?.runId || '').trim() === target);
      if (matched) {
        return matched;
      }
      if (launchingFresh) {
        return null;
      }
      if (running) return running;
      return null;
    }
    if (launchingFresh) {
      return running || null;
    }
    return running || latest || null;
  }

  function applySummary(summary: any) {
    if (!summary || typeof summary !== 'object') return;
    const totals = summary?.totals && typeof summary.totals === 'object' ? summary.totals : {};
    const profiles = Array.isArray(summary?.profiles) ? summary.profiles : [];
    const profile = profiles[0] || null;
    const stats = profile?.stats && typeof profile.stats === 'object' ? profile.stats : totals;

    const assigned = Number(stats?.assignedNotes ?? totals?.assignedNotes ?? summary?.target ?? 0) || 0;
    const opened = Number(stats?.openedNotes ?? totals?.openedNotes ?? totals?.assignedNotes ?? 0) || 0;
    const failed = Number(totals?.operationErrors ?? 0) || 0;
    const remaining = Math.max(0, assigned - opened);

    ui.statCollected.textContent = String(opened);
    ui.statSuccess.textContent = String(opened);
    ui.statFailed.textContent = String(failed);
    ui.statRemaining.textContent = String(remaining);

    let percent = 0;
    if (assigned > 0) {
      percent = Math.round((opened / assigned) * 100);
    }
    ui.progressPercent.textContent = `${percent}%`;
    ui.progressBar.style.width = `${percent}%`;

    const comments = Number(stats?.commentsCollected ?? totals?.commentsCollected ?? 0);
    if (Number.isFinite(comments)) {
      state.commentsCount = Math.max(0, Math.floor(comments));
      ui.statComments.textContent = `${state.commentsCount}条`;
    }

    const likesNew = Number(stats?.likesNewCount ?? totals?.likesNewCount ?? 0);
    const likesSkipped = Number(stats?.likesSkippedCount ?? totals?.likesSkippedCount ?? 0);
    const likesAlready = Number(stats?.likesAlreadyCount ?? totals?.likesAlreadyCount ?? 0);
    const likesDedup = Number(stats?.likesDedupCount ?? totals?.likesDedupCount ?? 0);
    state.likesCount = Math.max(0, Math.floor(likesNew || 0));
    state.likesSkippedCount = Math.max(0, Math.floor(likesSkipped || 0));
    state.likesAlreadyCount = Math.max(0, Math.floor(likesAlready || 0));
    state.likesDedupCount = Math.max(0, Math.floor(likesDedup || 0));
    ui.statLikes.textContent = `${state.likesCount}次(跳过:${state.likesSkippedCount}, 已赞:${state.likesAlreadyCount}, 去重:${state.likesDedupCount})`;

    if (summary.keyword) ui.taskKeyword.textContent = String(summary.keyword);
    if (assigned) ui.taskTarget.textContent = String(assigned);
    if (profile?.profileId) {
      accountLabels.applyAccountLabel(profile.profileId);
    }

    const runId = String(profile?.runId || summary?.runId || '').trim();
    if (runId) {
      state.activeRunId = runId;
      runSummary.renderRunSummary();
    }

    const reason = String(profile?.reason || summary?.status || '').trim();
    if (reason) {
      const okReasons = new Set(['script_complete', 'completed', 'success', 'succeeded']);
      ui.currentPhase.textContent = okReasons.has(reason) ? '已结束' : '失败';
      ui.currentAction.textContent = reason;
      state.activeStatus = normalizeStatus(reason) || state.activeStatus;
    }

    const summaryTs = Date.parse(String(summary?.generatedAt || '')) || Date.now();
    state.stoppedAt = summaryTs;
    elapsed.updateElapsed();
    elapsed.stopElapsedTimer();

    const errorTotal = Number(totals?.operationErrors ?? 0) + Number(totals?.recoveryFailed ?? 0);
    if (Number.isFinite(errorTotal)) {
      state.errorCountTotal = Math.max(0, Math.floor(errorTotal));
      runSummary.renderRunSummary();
    }
  }

  async function loadLatestSummary() {
    if (typeof ctx.api?.resultsScan !== 'function') return null;
    if (typeof ctx.api?.fsListDir !== 'function') return null;
    if (typeof ctx.api?.fsReadTextPreview !== 'function') return null;

    const res = await ctx.api.resultsScan({ downloadRoot: ctx.settings?.downloadRoot });
    if (!res?.ok || !Array.isArray(res?.entries) || res.entries.length === 0) return null;

    const keyword = String(ui.taskKeyword.textContent || '').trim();
    const matched = keyword ? res.entries.find((e: any) => e?.keyword === keyword) : null;
    const entry = matched || res.entries[0];
    if (!entry?.path) return null;

    const mergedRoot = ctx.api.pathJoin(entry.path, 'merged');
    const list = await ctx.api.fsListDir({ root: mergedRoot, recursive: true, maxEntries: 3000 });
    if (!list?.ok || !Array.isArray(list?.entries)) return null;
    const summaries = list.entries.filter((e: any) => !e?.isDir && e?.name === 'summary.json');
    if (summaries.length === 0) return null;
    summaries.sort((a: any, b: any) => (b?.mtimeMs || 0) - (a?.mtimeMs || 0));
    const summaryPath = summaries[0].path;
    if (!summaryPath) return null;

    const textRes = await ctx.api.fsReadTextPreview({ path: summaryPath, maxBytes: 1_000_000, maxLines: 20_000 });
    if (!textRes?.ok || !textRes?.text) return null;
    try {
      return JSON.parse(textRes.text);
    } catch {
      return null;
    }
  }

  async function loadTaskInfo() {
    try {
      const config = await ctx.api.configLoadLast();
      if (config) {
        if (!hasRenderableValue(state.contextRun?.keyword)) {
          ui.taskKeyword.textContent = config.keyword || '-';
        }
        if (!(Number(state.contextRun?.target) > 0)) {
          ui.taskTarget.textContent = String(config.target || 50);
        }

        if (!hasRenderableValue(state.contextRun?.profileId) && config.lastProfileId) {
          accountLabels.applyAccountLabel(config.lastProfileId);
        }
        const taskId = String(state.contextRun?.taskId || config.taskId || ctx?.activeTaskConfigId || '').trim();
        if (taskId) {
          ui.taskConfigId.textContent = taskId;
        }
      }
    } catch (err) {
      console.error('Failed to load task info:', err);
    }
  }

  async function fetchCurrentState() {
    try {
      const tasks = await ctx.api.stateGetTasks();
      if (Array.isArray(tasks) && tasks.length > 0) {
        const picked = pickTaskFromList(tasks);
        if (picked) {
          const runId = String(picked?.runId || '').trim();
          if (runId) {
            state.activeRunId = runId;
            runSummary.renderRunSummary();
          }
          updateFromTaskState(picked);
        }
      } else {
        const summary = await loadLatestSummary();
        if (summary) applySummary(summary);
      }
    } catch (err) {
      console.error('Failed to fetch state:', err);
    }
  }

  return {
    updateFromTaskState,
    pickTaskFromList,
    applySummary,
    loadLatestSummary,
    loadTaskInfo,
    fetchCurrentState,
  };
}
