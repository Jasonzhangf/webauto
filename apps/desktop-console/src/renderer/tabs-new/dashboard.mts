import { createEl } from '../ui-components.mts';

type DashboardOptions = {
  api: any;
  setActiveTab: (id: string) => void;
};

export function renderDashboard(root: HTMLElement, ctx: any) {
  root.innerHTML = '';

  // Page indicator
  const pageIndicator = createEl('div', { className: 'page-indicator' }, [
    '当前: ',
    createEl('span', {}, ['看板页']),
    ' ← 从配置页跳入 | 完成后返回 ',
    createEl('span', {}, ['配置页'])
  ]);
  root.appendChild(pageIndicator);

  // Stats Grid (Top)
  const statsGrid = createEl('div', { className: 'bento-grid bento-4', style: 'margin-bottom: var(--gap);' });
  statsGrid.innerHTML = `
    <div class="stat-card info">
      <div class="stat-value" id="stat-collected">0</div>
      <div class="stat-label">已采集</div>
    </div>
    <div class="stat-card success">
      <div class="stat-value" id="stat-success">0</div>
      <div class="stat-label">成功</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-value" id="stat-failed">0</div>
      <div class="stat-label">失败</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-value" id="stat-remaining">0</div>
      <div class="stat-label">剩余</div>
    </div>
  `;
  root.appendChild(statsGrid);

  // Run Summary Card
  const runSummaryGrid = createEl('div', { className: 'bento-grid', style: 'margin-bottom: var(--gap);' });
  const runSummaryCard = createEl('div', { className: 'bento-cell highlight' });
  runSummaryCard.innerHTML = `
    <div class="bento-title">运行摘要</div>
    <div style="display:grid; grid-template-columns: minmax(200px, 1fr) 160px; gap: var(--gap); margin-bottom: var(--gap-sm);">
      <div>
        <label>当前 Run ID</label>
        <div id="run-id-text" style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-1); word-break: break-all;">-</div>
      </div>
      <div>
        <label>累计错误</label>
        <div id="error-count-text" style="font-weight:700; color: var(--danger); font-size: 18px;">0</div>
      </div>
    </div>
    <div>
      <label>最近错误（最多 8 条）</label>
      <div id="recent-errors-empty" class="muted" style="font-size: 12px;">暂无错误</div>
      <ul id="recent-errors-list" style="margin: 6px 0 0 16px; padding: 0; font-size: 12px; line-height: 1.5; display:none;"></ul>
    </div>
  `;
  runSummaryGrid.appendChild(runSummaryCard);
  root.appendChild(runSummaryGrid);

  // Main Content Grid
  const mainGrid = createEl('div', { className: 'bento-grid bento-aside' });

  // Left: Task Info
  const taskCard = createEl('div', { className: 'bento-cell' });
  taskCard.innerHTML = `
    <div class="bento-title">当前任务</div>

    <div class="row" style="margin-bottom: var(--gap);">
      <div>
        <label>关键词</label>
        <div id="task-keyword" style="font-weight: 600; color: var(--text-1);">-</div>
      </div>
      <div>
        <label>目标数量</label>
        <div id="task-target" style="font-weight: 600; color: var(--text-1);">-</div>
      </div>
      <div>
        <label>使用账户</label>
        <div id="task-account" style="font-weight: 600; color: var(--text-1);">-</div>
      </div>
      <div>
        <label>配置ID</label>
        <div id="task-config-id" style="font-weight: 600; color: var(--text-1);">-</div>
      </div>
    </div>

    <div class="phase-indicator" style="margin-bottom: var(--gap);">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <span style="color: var(--text-3); font-size: 12px;">当前阶段</span>
        <span id="current-phase" style="font-weight: 600; color: var(--accent-light);">待启动</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-3); font-size: 12px;">当前操作</span>
        <span id="current-action" style="color: var(--text-1);">-</span>
      </div>
    </div>

    <div style="margin-bottom: var(--gap);">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <span style="font-size: 12px; color: var(--text-3);">整体进度</span>
        <span id="progress-percent" style="font-size: 12px; color: var(--text-1);">0%</span>
      </div>
      <div class="progress-bar-container">
        <div id="progress-bar" class="progress-bar" style="width: 0%;"></div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--gap-sm);">
      <div style="font-size: 12px;"><span style="color: var(--text-4);">评论采集：</span><span id="stat-comments">0条</span></div>
      <div style="font-size: 12px;"><span style="color: var(--text-4);">点赞操作：</span><span id="stat-likes">0次</span></div>
      <div style="font-size: 12px;"><span style="color: var(--text-4);">限流次数：</span><span id="stat-ratelimit" style="color: var(--warning);">0次</span></div>
      <div style="font-size: 12px;"><span style="color: var(--text-4);">运行时间：</span><span id="stat-elapsed">00:00:00</span></div>
    </div>
  `;
  mainGrid.appendChild(taskCard);

  // Right: Logs
  const logsCard = createEl('div', { className: 'bento-cell' });
  logsCard.innerHTML = `
    <div class="bento-title">
      实时日志
      <button id="toggle-logs-btn" class="secondary" style="margin-left: auto; padding: 4px 10px; font-size: 11px;">展开</button>
    </div>
    <div id="logs-container" class="log-container" style="display: none;"></div>

    <div style="margin-top: var(--gap);">
      <div class="btn-group">
        <button id="pause-btn" class="secondary" style="flex: 1;">暂停</button>
        <button id="stop-btn" class="danger" style="flex: 1;">停止</button>
        <button id="back-config-btn" class="secondary" style="flex: 1;">返回配置</button>
      </div>
    </div>
  `;
  mainGrid.appendChild(logsCard);
  root.appendChild(mainGrid);

  // Elements
  const statCollected = root.querySelector('#stat-collected') as HTMLDivElement;
  const statSuccess = root.querySelector('#stat-success') as HTMLDivElement;
  const statFailed = root.querySelector('#stat-failed') as HTMLDivElement;
  const statRemaining = root.querySelector('#stat-remaining') as HTMLDivElement;
  const taskKeyword = root.querySelector('#task-keyword') as HTMLDivElement;
  const taskTarget = root.querySelector('#task-target') as HTMLDivElement;
  const taskAccount = root.querySelector('#task-account') as HTMLDivElement;
  const taskConfigId = root.querySelector('#task-config-id') as HTMLDivElement;
  const currentPhase = root.querySelector('#current-phase') as HTMLSpanElement;
  const currentAction = root.querySelector('#current-action') as HTMLSpanElement;
  const progressPercent = root.querySelector('#progress-percent') as HTMLSpanElement;
  const progressBar = root.querySelector('#progress-bar') as HTMLDivElement;
  const statComments = root.querySelector('#stat-comments') as HTMLSpanElement;
  const statLikes = root.querySelector('#stat-likes') as HTMLSpanElement;
  const statRatelimit = root.querySelector('#stat-ratelimit') as HTMLSpanElement;
  const statElapsed = root.querySelector('#stat-elapsed') as HTMLSpanElement;
  const runIdText = root.querySelector('#run-id-text') as HTMLDivElement;
  const errorCountText = root.querySelector('#error-count-text') as HTMLDivElement;
  const recentErrorsEmpty = root.querySelector('#recent-errors-empty') as HTMLDivElement;
  const recentErrorsList = root.querySelector('#recent-errors-list') as HTMLUListElement;
  const logsContainer = root.querySelector('#logs-container') as HTMLDivElement;
  const toggleLogsBtn = root.querySelector('#toggle-logs-btn') as HTMLButtonElement;
  const pauseBtn = root.querySelector('#pause-btn') as HTMLButtonElement;
  const stopBtn = root.querySelector('#stop-btn') as HTMLButtonElement;
  const backConfigBtn = root.querySelector('#back-config-btn') as HTMLButtonElement;

  // State
  let logsExpanded = false;
  let paused = false;
  let unsubscribeBus: (() => void) | null = null;
  let commentsCount = 0;
  let likesCount = 0;
  let likesSkippedCount = 0;
  let likesAlreadyCount = 0;
  let likesDedupCount = 0;
  let startTime = Date.now();
  let stoppedAt: number | null = null;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let statePollTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribeState: (() => void) | null = null;
  let unsubscribeCmd: (() => void) | null = null;
  const contextRun = ctx?.xhsCurrentRun && typeof ctx.xhsCurrentRun === 'object' ? ctx.xhsCurrentRun : null;
  let activeRunId = String(contextRun?.runId || ctx?.activeRunId || '').trim();
  let activeStatus = '';
  let errorCountTotal = 0;
  const recentErrors: Array<{ ts: string; source: string; message: string }> = [];
  const maxLogs = 500;
  const maxRecentErrors = 8;
  const initialTaskId = String(contextRun?.taskId || ctx?.activeTaskConfigId || '').trim();
  if (initialTaskId) {
    taskConfigId.textContent = initialTaskId;
  }

  const normalizeStatus = (value: any) => String(value || '').trim().toLowerCase();
  const isRunningStatus = (value: any) => ['running', 'queued', 'pending', 'starting'].includes(normalizeStatus(value));
  const isTerminalStatus = (value: any) => ['completed', 'done', 'success', 'succeeded', 'failed', 'error', 'stopped', 'canceled'].includes(normalizeStatus(value));
  const isXhsCommandTitle = (title: any) => {
    const normalized = String(title || '').trim().toLowerCase();
    if (!normalized) return false;
    return normalized.includes('xhs unified') || normalized.startsWith('xhs:') || normalized.startsWith('xhs unified:');
  };
  const hasRenderableValue = (value: any) => {
    const text = String(value ?? '').trim();
    return text.length > 0 && text !== '-';
  };

  if (contextRun) {
    if (hasRenderableValue(contextRun.keyword)) taskKeyword.textContent = String(contextRun.keyword);
    if (Number(contextRun.target) > 0) taskTarget.textContent = String(Number(contextRun.target));
    if (hasRenderableValue(contextRun.profileId)) {
      const aliases = ctx.api?.settings?.profileAliases || {};
      const profileId = String(contextRun.profileId);
      taskAccount.textContent = aliases[profileId] || profileId;
    }
    if (hasRenderableValue(contextRun.taskId)) taskConfigId.textContent = String(contextRun.taskId);
    const startedAtTs = Date.parse(String(contextRun.startedAt || ''));
    if (Number.isFinite(startedAtTs) && startedAtTs > 0) {
      startTime = startedAtTs;
      updateElapsed();
    }
  }

  function renderRunSummary() {
    runIdText.textContent = activeRunId || '-';
    if (ctx && typeof ctx === 'object') {
      ctx.activeRunId = activeRunId || null;
    }
    errorCountText.textContent = String(errorCountTotal);
    recentErrorsList.innerHTML = '';
    if (recentErrors.length === 0) {
      recentErrorsEmpty.style.display = 'block';
      recentErrorsList.style.display = 'none';
      return;
    }
    recentErrorsEmpty.style.display = 'none';
    recentErrorsList.style.display = 'block';
    recentErrors.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `[${item.ts}] ${item.source}: ${item.message}`;
      recentErrorsList.appendChild(li);
    });
  }

  function pushRecentError(message: string, source = 'runtime') {
    const msg = String(message || '').trim();
    if (!msg) return;
    errorCountTotal += 1;
    recentErrors.push({
      ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      source: String(source || 'runtime').trim() || 'runtime',
      message: msg,
    });
    while (recentErrors.length > maxRecentErrors) recentErrors.shift();
    renderRunSummary();
  }

  // Update elapsed time
  function updateElapsed() {
    const base = stoppedAt ?? Date.now();
    const elapsed = Math.max(0, Math.floor((base - startTime) / 1000));
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    statElapsed.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function startElapsedTimer() {
    if (elapsedTimer) return;
    elapsedTimer = setInterval(updateElapsed, 1000);
  }

  function stopElapsedTimer() {
    if (!elapsedTimer) return;
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function startStatePoll() {
    if (statePollTimer) return;
    if (typeof ctx.api?.stateGetTasks !== 'function') return;
    statePollTimer = setInterval(() => {
      if (paused) return;
      void fetchCurrentState();
    }, 5000);
  }

  function stopStatePoll() {
    if (!statePollTimer) return;
    clearInterval(statePollTimer);
    statePollTimer = null;
  }

  // Add log line
  function addLog(line: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const logLine = createEl('div', { className: 'log-line' });
    logLine.innerHTML = `<span class="log-time">[${ts}]</span> <span class="log-${type}">${line}</span>`;
    logsContainer.appendChild(logLine);

    // Keep max logs
    while (logsContainer.children.length > maxLogs) {
      logsContainer.removeChild(logsContainer.firstChild!);
    }

    // Auto-scroll
    if (logsExpanded) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }

  // Update stats from task state
  function updateFromTaskState(state: any) {
    if (!state) return;

    const progressObj = state.progress && typeof state.progress === 'object' ? state.progress : null;
    const processedRaw = progressObj?.processed ?? progressObj?.current ?? state.progress ?? state.collected ?? state.current ?? 0;
    const totalRaw = progressObj?.total ?? state.total ?? state.target ?? state.maxNotes ?? 0;
    const failedRaw = progressObj?.failed ?? state.failed ?? state.errors ?? 0;
    const collected = Number(processedRaw) || 0;
    const target = Number(totalRaw) || 0;
    const success = Number(state.success ?? collected) || 0;
    const failed = Number(failedRaw) || 0;
    const remaining = Math.max(0, target - collected);

    statCollected.textContent = String(collected);
    statSuccess.textContent = String(success);
    statFailed.textContent = String(failed);
    statRemaining.textContent = String(remaining);

    let percent = 0;
    if (target > 0) {
      percent = Math.round((collected / target) * 100);
    } else if (progressObj && Number.isFinite(Number(progressObj.percent))) {
      const pct = Number(progressObj.percent);
      percent = pct <= 1 ? Math.round(pct * 100) : Math.round(pct);
    }
    progressPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;

    if (state.phase) {
      currentPhase.textContent = state.phase;
    }
    const action = String(state.action || state.message || state.step || '').trim();
    if (action) {
      currentAction.textContent = action;
    }
    const stats = state.stats && typeof state.stats === 'object' ? state.stats : null;
    const comments = Number(stats?.commentsCollected ?? state.comments);
    if (Number.isFinite(comments)) {
      commentsCount = Math.max(0, Math.floor(comments));
      statComments.textContent = `${commentsCount}条`;
    }
    const likes = Number(stats?.likesPerformed ?? state.likes);
    if (Number.isFinite(likes)) {
      likesCount = Math.max(0, Math.floor(likes));
      statLikes.textContent = `${likesCount}次 (跳过:${likesSkippedCount}, 已赞:${likesAlreadyCount}, 去重:${likesDedupCount})`;
    }
    if (state.ratelimits) {
      statRatelimit.textContent = `${state.ratelimits}次`;
    }

    // Update task info
    if (state.keyword) {
      taskKeyword.textContent = state.keyword;
    }
    if (state.target) {
      taskTarget.textContent = String(state.target);
    }
    if (state.profileId) {
      const aliases = ctx.api?.settings?.profileAliases || {};
      taskAccount.textContent = aliases[state.profileId] || state.profileId;
    }
    const taskId = String(state.taskId || state.scheduleTaskId || state.configTaskId || '').trim();
    if (taskId) {
      taskConfigId.textContent = taskId;
      if (ctx && typeof ctx === 'object') {
        ctx.activeTaskConfigId = taskId;
      }
    }
    if (state.runId) {
      activeRunId = String(state.runId);
      renderRunSummary();
    }
    if (state.startedAt) {
      const ts = Number(state.startedAt) || Date.parse(String(state.startedAt));
      if (Number.isFinite(ts) && ts > 0) {
        startTime = ts;
        if (!stoppedAt) {
          updateElapsed();
          startElapsedTimer();
        }
      }
    }
    const status = normalizeStatus(state.status);
    if (status) {
      activeStatus = status;
    }
    if (status === 'completed' || status === 'done' || status === 'success' || status === 'succeeded') {
      if (!stoppedAt) {
        stoppedAt = Date.now();
        updateElapsed();
        stopElapsedTimer();
      }
    }
    if (status === 'failed' || status === 'error') {
      if (!stoppedAt) {
        stoppedAt = Date.now();
        updateElapsed();
        stopElapsedTimer();
      }
    }
    if (state.error) {
      pushRecentError(String(state.error), 'state');
    }
  }

  function pickTaskFromList(tasks: any[]) {
    const target = activeRunId;
    const running = tasks.find((item) => isRunningStatus(item?.status));
    const sorted = [...tasks].sort((a, b) => {
      const aTs = Number(a?.updatedAt ?? a?.completedAt ?? a?.startedAt ?? 0) || 0;
      const bTs = Number(b?.updatedAt ?? b?.completedAt ?? b?.startedAt ?? 0) || 0;
      return bTs - aTs;
    });
    const latest = sorted[0] || null;
    if (target) {
      const matched = tasks.find((item) => String(item?.runId || '').trim() === target);
      if (matched) {
        return matched;
      }
      if (running) return running;
      return null;
    }
    return running || latest || null;
  }

  function updateFromEventPayload(payload: any) {
    const event = String(payload?.event || '').trim();
    if (!event) return;
    if (event === 'xhs.unified.start') {
      currentPhase.textContent = '运行中';
      currentAction.textContent = '启动 autoscript';
      activeStatus = 'running';
      statCollected.textContent = '0';
      statSuccess.textContent = '0';
      statFailed.textContent = '0';
      statRemaining.textContent = '0';
      progressPercent.textContent = '0%';
      progressBar.style.width = '0%';
      commentsCount = 0;
      likesCount = 0;
      likesSkippedCount = 0;
      likesAlreadyCount = 0;
      likesDedupCount = 0;
      statComments.textContent = `0条`;
      statLikes.textContent = `0次 (跳过:0, 已赞:0, 去重:0)`;
      const ts = Date.parse(String(payload.ts || '')) || Date.now();
      startTime = ts;
      stoppedAt = null;
      updateElapsed();
      startElapsedTimer();
      if (payload.runId) {
        activeRunId = String(payload.runId || '').trim() || activeRunId;
      }
      if (payload.keyword) taskKeyword.textContent = String(payload.keyword);
      if (payload.maxNotes) taskTarget.textContent = String(payload.maxNotes);
      if (payload.taskId) {
        const taskId = String(payload.taskId || '').trim();
        if (taskId) {
          taskConfigId.textContent = taskId;
          if (ctx && typeof ctx === 'object') {
            ctx.activeTaskConfigId = taskId;
          }
        }
      }
      renderRunSummary();
      return;
    }
    if (event === 'autoscript:operation_done') {
      const opId = String(payload.operationId || '').trim();
      currentAction.textContent = opId || currentAction.textContent;
      const result = payload.result && typeof payload.result === 'object' ? payload.result : {};
      const opResult = (result && typeof result === 'object' && 'result' in result) ? result.result : result;
      if (opId === 'open_first_detail' || opId === 'open_next_detail') {
        const visited = Number(opResult?.visited || 0);
        const maxNotes = Number(opResult?.maxNotes || 0);
        if (visited > 0) {
          statCollected.textContent = String(visited);
          statSuccess.textContent = String(visited);
          if (maxNotes > 0) {
            const remaining = Math.max(0, maxNotes - visited);
            statRemaining.textContent = String(remaining);
            taskTarget.textContent = String(maxNotes);
            const pct = Math.round((visited / maxNotes) * 100);
            progressPercent.textContent = `${pct}%`;
            progressBar.style.width = `${pct}%`;
          }
        }
      }
      if (opId === 'comments_harvest') {
        const added = Number(opResult?.collected || 0);
        commentsCount = Math.max(0, commentsCount + added);
        statComments.textContent = `${commentsCount}条`;
      }
      if (opId === 'comment_like') {
        const added = Number(opResult?.likedCount || 0);
        const skipped = Number(opResult?.skippedCount || 0);
        const already = Number(opResult?.alreadyLikedSkipped || 0);
        const dedup = Number(opResult?.dedupSkipped || 0);
        likesCount = Math.max(0, likesCount + added);
        likesSkippedCount = Math.max(0, likesSkippedCount + skipped);
        likesAlreadyCount = Math.max(0, likesAlreadyCount + already);
        likesDedupCount = Math.max(0, likesDedupCount + dedup);
        statLikes.textContent = `${likesCount}次 (跳过:${likesSkippedCount}, 已赞:${likesAlreadyCount}, 去重:${likesDedupCount})`;
      }
      return;
    }
    if (event === 'autoscript:operation_error' || event === 'autoscript:operation_recovery_failed' || event === 'xhs.unified.profile_failed') {
      const failed = Number(statFailed.textContent || '0') || 0;
      statFailed.textContent = String(failed + 1);
      const opId = String(payload?.operationId || '').trim();
      const err = String(payload?.error || payload?.message || payload?.code || event).trim();
      pushRecentError(opId ? `${opId}: ${err}` : err, event);
      return;
    }
    if (event === 'xhs.unified.merged') {
      currentPhase.textContent = '已完成';
      currentAction.textContent = '结果合并完成';
      if (payload.profilesFailed) {
        statFailed.textContent = String(Number(payload.profilesFailed) || 0);
      }
      return;
    }
    if (event === 'xhs.unified.stop') {
      const reason = String(payload.reason || '').trim();
      const stoppedTs = Date.parse(String(payload.stoppedAt || payload.ts || '')) || Date.now();
      stoppedAt = stoppedTs;
      activeStatus = reason ? normalizeStatus(reason) || 'stopped' : 'stopped';
      updateElapsed();
      stopElapsedTimer();
      const successReasons = new Set(['completed', 'script_complete']);
      currentPhase.textContent = reason && reason !== 'script_failure' ? '已结束' : '失败';
      currentAction.textContent = reason || 'stop';
      if (reason && !successReasons.has(reason)) {
        pushRecentError(`stop reason=${reason}`, event);
      }
      renderRunSummary();
    }
    if (event === 'autoscript:operation_terminal') {
      const code = String(payload.code || '').trim();
      currentAction.textContent = code ? `terminal:${code}` : 'terminal';
      renderRunSummary();
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

    statCollected.textContent = String(opened);
    statSuccess.textContent = String(opened);
    statFailed.textContent = String(failed);
    statRemaining.textContent = String(remaining);

    let percent = 0;
    if (assigned > 0) {
      percent = Math.round((opened / assigned) * 100);
    }
    progressPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;

    const comments = Number(stats?.commentsCollected ?? totals?.commentsCollected ?? 0);
    if (Number.isFinite(comments)) {
      commentsCount = Math.max(0, Math.floor(comments));
      statComments.textContent = `${commentsCount}条`;
    }

    const likesNew = Number(stats?.likesNewCount ?? totals?.likesNewCount ?? 0);
    const likesSkipped = Number(stats?.likesSkippedCount ?? totals?.likesSkippedCount ?? 0);
    const likesAlready = Number(stats?.likesAlreadyCount ?? totals?.likesAlreadyCount ?? 0);
    const likesDedup = Number(stats?.likesDedupCount ?? totals?.likesDedupCount ?? 0);
    likesCount = Math.max(0, Math.floor(likesNew || 0));
    likesSkippedCount = Math.max(0, Math.floor(likesSkipped || 0));
    likesAlreadyCount = Math.max(0, Math.floor(likesAlready || 0));
    likesDedupCount = Math.max(0, Math.floor(likesDedup || 0));
    statLikes.textContent = `${likesCount}次(跳过:${likesSkippedCount}, 已赞:${likesAlreadyCount}, 去重:${likesDedupCount})`;

    if (summary.keyword) taskKeyword.textContent = String(summary.keyword);
    if (assigned) taskTarget.textContent = String(assigned);
    if (profile?.profileId) {
      const aliases = ctx.api?.settings?.profileAliases || {};
      taskAccount.textContent = aliases[profile.profileId] || profile.profileId;
    }

    const runId = String(profile?.runId || summary?.runId || '').trim();
    if (runId) {
      activeRunId = runId;
      renderRunSummary();
    }

    const reason = String(profile?.reason || summary?.status || '').trim();
    if (reason) {
      const okReasons = new Set(['script_complete', 'completed', 'success', 'succeeded']);
      currentPhase.textContent = okReasons.has(reason) ? '已结束' : '失败';
      currentAction.textContent = reason;
      activeStatus = normalizeStatus(reason) || activeStatus;
    }

    const summaryTs = Date.parse(String(summary?.generatedAt || '')) || Date.now();
    stoppedAt = summaryTs;
    updateElapsed();
    stopElapsedTimer();

    const errorTotal = Number(totals?.operationErrors ?? 0) + Number(totals?.recoveryFailed ?? 0);
    if (Number.isFinite(errorTotal)) {
      errorCountTotal = Math.max(0, Math.floor(errorTotal));
      renderRunSummary();
    }
  }

  async function loadLatestSummary() {
    if (typeof ctx.api?.resultsScan !== 'function') return null;
    if (typeof ctx.api?.fsListDir !== 'function') return null;
    if (typeof ctx.api?.fsReadTextPreview !== 'function') return null;

    const res = await ctx.api.resultsScan({ downloadRoot: ctx.settings?.downloadRoot });
    if (!res?.ok || !Array.isArray(res?.entries) || res.entries.length === 0) return null;

    const keyword = String(taskKeyword.textContent || '').trim();
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

  // Subscribe to state updates
  function subscribeToUpdates() {
    if (typeof ctx.api?.onStateUpdate === 'function') {
      unsubscribeState = ctx.api.onStateUpdate((update: any) => {
        if (paused) return;
        const runId = String(update?.runId || '').trim();
        const status = normalizeStatus(update?.data?.status);
        if (activeRunId && runId && runId !== activeRunId) {
          if (isTerminalStatus(activeStatus) && (isRunningStatus(status) || status)) {
            activeRunId = runId;
            activeStatus = status || 'running';
            stoppedAt = null;
            renderRunSummary();
          } else {
            return;
          }
        }
        if (!activeRunId && runId) {
          activeRunId = runId;
          renderRunSummary();
        }

        if (update?.data && typeof update.data === 'object') {
          const payload = { ...(update.data || {}), runId };
          updateFromTaskState(payload);
          if (payload.action) addLog(String(payload.action), 'info');
          if (payload.error) {
            addLog(String(payload.error), 'error');
            pushRecentError(String(payload.error), 'state');
          }
        }
      });
    }

    // Also subscribe to cmd events for logs
    if (typeof ctx.api?.onBusEvent === 'function') {
      unsubscribeBus = ctx.api.onBusEvent((payload: any) => {
        if (paused) return;
        if (payload && payload.event) {
          updateFromEventPayload(payload);
        }
      });
    }

    if (typeof ctx.api?.onCmdEvent === 'function') {
      unsubscribeCmd = ctx.api.onCmdEvent((evt: any) => {
        if (paused) return;
        const runId = String(evt?.runId || '').trim();
        const preferredRunId = String(ctx?.activeRunId || '').trim();
        const shouldAdoptStartedRun = (
          evt?.type === 'started'
          && runId
          && isXhsCommandTitle(evt?.title)
          && (
            !activeRunId
            || isTerminalStatus(activeStatus)
            || (preferredRunId && preferredRunId === runId)
          )
        );
        if (shouldAdoptStartedRun) {
          activeRunId = runId;
          activeStatus = 'running';
          stoppedAt = null;
          renderRunSummary();
        }
        if (activeRunId && runId && runId !== activeRunId) return;

        if (evt.type === 'stdout') {
          addLog(evt.line, 'info');
          parseLineEvent(String(evt.line || '').trim());
        } else if (evt.type === 'stderr') {
          addLog(evt.line, 'error');
          pushRecentError(String(evt.line || ''), 'stderr');
          const failed = Number(statFailed.textContent || '0') || 0;
          statFailed.textContent = String(failed + 1);
        } else if (evt.type === 'exit') {
          if (!stoppedAt) {
            currentPhase.textContent = Number(evt.exitCode || 0) === 0 ? '已结束' : '失败';
            currentAction.textContent = `exit(${evt.exitCode ?? 'null'})`;
          }
          addLog(`进程退出: code=${evt.exitCode}`, evt.exitCode === 0 ? 'success' : 'error');
          if (!stoppedAt) {
            stoppedAt = Date.now();
            updateElapsed();
            stopElapsedTimer();
          }
          if (Number(evt.exitCode || 0) !== 0) {
            pushRecentError(`进程退出 code=${evt.exitCode ?? 'null'}`, 'exit');
          }
          renderRunSummary();
        }
      });
    }
  }

  // Load last config for display
  async function loadTaskInfo() {
    try {
      const config = await ctx.api.configLoadLast();
      if (config) {
        if (!hasRenderableValue(contextRun?.keyword)) {
          taskKeyword.textContent = config.keyword || '-';
        }
        if (!(Number(contextRun?.target) > 0)) {
          taskTarget.textContent = String(config.target || 50);
        }

        if (!hasRenderableValue(contextRun?.profileId) && config.lastProfileId) {
          const aliases = ctx.api?.settings?.profileAliases || {};
          taskAccount.textContent = aliases[config.lastProfileId] || config.lastProfileId;
        }
        const taskId = String(contextRun?.taskId || config.taskId || ctx?.activeTaskConfigId || '').trim();
        if (taskId) {
          taskConfigId.textContent = taskId;
        }
      }
    } catch (err) {
      console.error('Failed to load task info:', err);
    }
  }

  // Fetch current task state
  async function fetchCurrentState() {
    try {
      const tasks = await ctx.api.stateGetTasks();
      if (Array.isArray(tasks) && tasks.length > 0) {
        const picked = pickTaskFromList(tasks);
        if (picked) {
          const runId = String(picked?.runId || '').trim();
          if (runId) {
            activeRunId = runId;
            renderRunSummary();
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

  // Event handlers
  toggleLogsBtn.onclick = () => {
    logsExpanded = !logsExpanded;
    logsContainer.style.display = logsExpanded ? 'block' : 'none';
    toggleLogsBtn.textContent = logsExpanded ? '收起' : '展开';
  };

  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '继续' : '暂停';
    if (paused) {
      addLog('任务已暂停', 'warn');
    } else {
      addLog('任务继续执行', 'info');
    }
  };

  stopBtn.onclick = async () => {
    if (confirm('确定要停止当前任务吗？')) {
      try {
        const tasks = await ctx.api.stateGetTasks();
        let runIdToStop = String(activeRunId || '').trim();
        if (!runIdToStop && Array.isArray(tasks)) {
          const running = tasks.find((item: any) => ['running', 'queued', 'pending', 'starting'].includes(String(item?.status || '').toLowerCase()));
          runIdToStop = String(running?.runId || tasks[0]?.runId || '').trim();
        }
        if (runIdToStop) {
          await ctx.api.cmdKill(runIdToStop);
          addLog('任务已停止', 'warn');
        } else {
          addLog('未找到可停止的运行任务', 'warn');
        }
      } catch (err) {
        console.error('Failed to stop task:', err);
      }

      setTimeout(() => {
        if (typeof ctx.setActiveTab === 'function') {
          ctx.setActiveTab('config');
        }
      }, 1500);
    }
  };

  backConfigBtn.onclick = () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('config');
    }
  };

  // Initialize
  renderRunSummary();
  loadTaskInfo();
  subscribeToUpdates();
  fetchCurrentState();
  startStatePoll();

  // Start elapsed timer
  startElapsedTimer();

  // Cleanup
  return () => {
    stopElapsedTimer();
    stopStatePoll();
    if (unsubscribeState) unsubscribeState();
    if (unsubscribeCmd) unsubscribeCmd();
    if (unsubscribeBus) unsubscribeBus();
  };
}
