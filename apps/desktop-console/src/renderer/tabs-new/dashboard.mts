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
    <div id="logs-container" class="log-container" style="display: none; max-height: 300px;"></div>

    <div style="margin-top: var(--gap);">
      <div class="btn-group">
        <button id="pause-btn" class="secondary" style="flex: 1;">暂停</button>
        <button id="stop-btn" class="danger" style="flex: 1;">停止</button>
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
  let unsubscribeState: (() => void) | null = null;
  let unsubscribeCmd: (() => void) | null = null;
  let activeRunId = String(ctx?.xhsCurrentRun?.runId || '').trim();
  let errorCountTotal = 0;
  const recentErrors: Array<{ ts: string; source: string; message: string }> = [];
  const maxLogs = 500;
  const maxRecentErrors = 8;

  function renderRunSummary() {
    runIdText.textContent = activeRunId || '-';
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
    const status = String(state.status || '').trim().toLowerCase();
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
    if (target) {
      const matched = tasks.find((item) => String(item?.runId || '').trim() === target);
      if (matched) return matched;
    }
    const running = tasks.find((item) => ['running', 'queued', 'pending', 'starting'].includes(String(item?.status || '').toLowerCase()));
    return running || tasks[0] || null;
  }

  function updateFromEventPayload(payload: any) {
    const event = String(payload?.event || '').trim();
    if (!event) return;
    if (event === 'xhs.unified.start') {
      currentPhase.textContent = '运行中';
      currentAction.textContent = '启动 autoscript';
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

  // Subscribe to state updates
  function subscribeToUpdates() {
    if (typeof ctx.api?.onStateUpdate === 'function') {
      unsubscribeState = ctx.api.onStateUpdate((update: any) => {
        if (paused) return;
        const runId = String(update?.runId || '').trim();
        if (activeRunId && runId && runId !== activeRunId) return;
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
        if (!activeRunId && evt?.type === 'started' && String(evt?.title || '').includes('xhs unified')) {
          activeRunId = runId;
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
        taskKeyword.textContent = config.keyword || '-';
        taskTarget.textContent = String(config.target || 50);

        if (config.lastProfileId) {
          const aliases = ctx.api?.settings?.profileAliases || {};
          taskAccount.textContent = aliases[config.lastProfileId] || config.lastProfileId;
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
        if (Array.isArray(tasks) && tasks.length > 0 && tasks[0].runId) {
          await ctx.api.cmdKill(tasks[0].runId);
          addLog('任务已停止', 'warn');
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

  // Initialize
  renderRunSummary();
  loadTaskInfo();
  subscribeToUpdates();
  fetchCurrentState();

  // Start elapsed timer
  startElapsedTimer();

  // Cleanup
  return () => {
    stopElapsedTimer();
    if (unsubscribeState) unsubscribeState();
    if (unsubscribeCmd) unsubscribeCmd();
    if (unsubscribeBus) unsubscribeBus();
  };
}
