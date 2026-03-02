import type { DashboardLayout } from './layout.mts';
import type { DashboardState } from './types.mts';
import { normalizeLink, normalizeStatus, resolveUnifiedActionFromEvent, resolveUnifiedPhaseFromOp } from './helpers.mts';

export type DashboardEventDeps = {
  ctx: any;
  ui: DashboardLayout;
  state: DashboardState;
  accountLabels: {
    applyAccountLabel: (profileIdLike: any) => void;
  };
  runSummary: {
    pushLikedLink: (entry: { url: string; noteId: string | null; source: string; profileId?: string | null; ts?: string | null }) => void;
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

export function createDashboardEventHandlers(deps: DashboardEventDeps) {
  const { ctx, ui, state, accountLabels, runSummary, elapsed } = deps;

  function updateFromEventPayload(payload: any) {
    const event = String(payload?.event || '').trim();
    if (!event) return;
    if (event === 'xhs.unified.start') {
      ui.currentPhase.textContent = '运行中';
      ui.currentAction.textContent = '启动 autoscript';
      state.activeStatus = 'running';
      const ts = Date.parse(String(payload.ts || '')) || Date.now();
      if (payload.runId) {
        state.activeRunId = String(payload.runId || '').trim() || state.activeRunId;
      }
      runSummary.resetDashboardForNewRun('新任务启动', ts);
      if (payload.keyword) ui.taskKeyword.textContent = String(payload.keyword);
      if (payload.maxNotes) ui.taskTarget.textContent = String(payload.maxNotes);
      if (payload.profileId) accountLabels.applyAccountLabel(payload.profileId);
      if (payload.taskId) {
        const taskId = String(payload.taskId || '').trim();
        if (taskId) {
          ui.taskConfigId.textContent = taskId;
          if (ctx && typeof ctx === 'object') {
            ctx.activeTaskConfigId = taskId;
          }
        }
      }
      runSummary.renderRunSummary();
      return;
    }
    if (event === 'autoscript:operation_start' || event === 'autoscript:operation_progress') {
      const opId = String(payload?.operationId || '').trim();
      ui.currentPhase.textContent = resolveUnifiedPhaseFromOp(opId, ui.currentPhase.textContent || '运行中');
      ui.currentAction.textContent = resolveUnifiedActionFromEvent(event, payload, ui.currentAction.textContent || '-');
      return;
    }
    if (event === 'autoscript:operation_done') {
      const opId = String(payload.operationId || '').trim();
      ui.currentPhase.textContent = resolveUnifiedPhaseFromOp(opId, ui.currentPhase.textContent || '运行中');
      ui.currentAction.textContent = resolveUnifiedActionFromEvent(event, payload, ui.currentAction.textContent || '-');
      const result = payload.result && typeof payload.result === 'object' ? payload.result : {};
      const opResult = (result && typeof result === 'object' && 'result' in result) ? result.result : result;
      if (opId === 'open_first_detail' || opId === 'open_next_detail') {
        const visited = Number(opResult?.visited || 0);
        const maxNotes = Number(opResult?.maxNotes || 0);
        if (visited > 0) {
          ui.statCollected.textContent = String(visited);
          ui.statSuccess.textContent = String(visited);
          if (maxNotes > 0) {
            const remaining = Math.max(0, maxNotes - visited);
            ui.statRemaining.textContent = String(remaining);
            ui.taskTarget.textContent = String(maxNotes);
            const pct = Math.round((visited / maxNotes) * 100);
            ui.progressPercent.textContent = `${pct}%`;
            ui.progressBar.style.width = `${pct}%`;
          }
        }
      }
      if (opId === 'comments_harvest') {
        const added = Number(opResult?.collected || 0);
        state.commentsCount = Math.max(0, state.commentsCount + added);
        ui.statComments.textContent = `${state.commentsCount}条`;
      }
      if (opId === 'comment_like') {
        const added = Number(opResult?.likedCount || 0);
        const skipped = Number(opResult?.skippedCount || 0);
        const already = Number(opResult?.alreadyLikedSkipped || 0);
        const dedup = Number(opResult?.dedupSkipped || 0);
        state.likesCount = Math.max(0, state.likesCount + added);
        state.likesSkippedCount = Math.max(0, state.likesSkippedCount + skipped);
        state.likesAlreadyCount = Math.max(0, state.likesAlreadyCount + already);
        state.likesDedupCount = Math.max(0, state.likesDedupCount + dedup);
        ui.statLikes.textContent = `${state.likesCount}次 (跳过:${state.likesSkippedCount}, 已赞:${state.likesAlreadyCount}, 去重:${state.likesDedupCount})`;
        const candidates: Array<{ url: string; noteId: string | null; source: string }> = [];
        const direct = normalizeLink(opResult?.noteUrl || opResult?.url || opResult?.href || opResult?.link, opResult?.noteId);
        if (direct) candidates.push({ ...direct, source: 'comment_like' });
        const likedComments = Array.isArray(opResult?.likedComments) ? opResult.likedComments : [];
        for (const row of likedComments) {
          const item = normalizeLink(row?.noteUrl || row?.url || row?.href || row?.link, row?.noteId || opResult?.noteId);
          if (!item) continue;
          candidates.push({ ...item, source: 'liked_comment' });
        }
        for (const item of candidates) {
          runSummary.pushLikedLink({
            ...item,
            profileId: state.activeProfileId || null,
            ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          });
        }
        runSummary.renderRunSummary();
      }
      return;
    }
    if (event === 'autoscript:operation_error' || event === 'autoscript:operation_recovery_failed' || event === 'xhs.unified.profile_failed') {
      const failed = Number(ui.statFailed.textContent || '0') || 0;
      ui.statFailed.textContent = String(failed + 1);
      const opId = String(payload?.operationId || '').trim();
      if (opId) {
        ui.currentPhase.textContent = resolveUnifiedPhaseFromOp(opId, ui.currentPhase.textContent || '运行中');
      }
      const summary = resolveUnifiedActionFromEvent(event, payload, ui.currentAction.textContent || '-');
      ui.currentAction.textContent = summary;
      runSummary.pushRecentError(summary || String(event), event, payload);
      return;
    }
    if (event === 'xhs.unified.merged') {
      ui.currentPhase.textContent = '已完成';
      ui.currentAction.textContent = '结果合并完成';
      if (payload.profilesFailed) {
        ui.statFailed.textContent = String(Number(payload.profilesFailed) || 0);
      }
      return;
    }
    if (event === 'xhs.unified.stop') {
      const reason = String(payload.reason || '').trim();
      const stoppedTs = Date.parse(String(payload.stoppedAt || payload.ts || '')) || Date.now();
      state.stoppedAt = stoppedTs;
      state.activeStatus = reason ? normalizeStatus(reason) || 'stopped' : 'stopped';
      elapsed.updateElapsed();
      elapsed.stopElapsedTimer();
      const successReasons = new Set(['completed', 'script_complete']);
      ui.currentPhase.textContent = reason && reason !== 'script_failure' ? '已结束' : '失败';
      ui.currentAction.textContent = reason || 'stop';
      if (reason && !successReasons.has(reason)) {
        runSummary.pushRecentError(`stop reason=${reason}`, event, payload);
      }
      runSummary.renderRunSummary();
    }
    if (event === 'autoscript:operation_terminal') {
      const code = String(payload.code || '').trim();
      ui.currentAction.textContent = code ? `terminal:${code}` : 'terminal';
      runSummary.renderRunSummary();
    }
  }

  function parseLineEvent(line: string) {
    const text = String(line || '').trim();
    if (!text.startsWith('{') || !text.endsWith('}')) return;
    try {
      const payload = JSON.parse(text);
      updateFromEventPayload(payload);
    } catch {
      // ignore non-json log lines
    }
  }

  return {
    updateFromEventPayload,
    parseLineEvent,
  };
}
