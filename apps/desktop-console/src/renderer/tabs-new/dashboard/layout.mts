import { createEl } from '../../ui-components.mts';

export type DashboardLayout = {
  statCollected: HTMLDivElement;
  statSuccess: HTMLDivElement;
  statFailed: HTMLDivElement;
  statRemaining: HTMLDivElement;
  taskKeyword: HTMLDivElement;
  taskTarget: HTMLDivElement;
  taskAccount: HTMLDivElement;
  taskConfigId: HTMLDivElement;
  currentPhase: HTMLSpanElement;
  currentAction: HTMLSpanElement;
  progressPercent: HTMLSpanElement;
  progressBar: HTMLDivElement;
  statComments: HTMLSpanElement;
  statLikes: HTMLSpanElement;
  statRatelimit: HTMLSpanElement;
  statElapsed: HTMLSpanElement;
  runIdText: HTMLDivElement;
  errorCountText: HTMLDivElement;
  recentErrorsEmpty: HTMLDivElement;
  recentErrorsList: HTMLUListElement;
  likedLinksEmpty: HTMLDivElement;
  likedLinksList: HTMLUListElement;
  logsContainer: HTMLDivElement;
  toggleLogsBtn: HTMLButtonElement;
  pauseBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  backConfigBtn: HTMLButtonElement;
};

export function renderDashboardLayout(root: HTMLElement): DashboardLayout {
  root.innerHTML = '';

  const pageIndicator = createEl('div', { className: 'page-indicator' }, [
    '当前: ',
    createEl('span', {}, ['看板页']),
    ' ← 从配置页跳入 | 完成后返回 ',
    createEl('span', {}, ['配置页'])
  ]);
  root.appendChild(pageIndicator);

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
    <div style="margin-top: 10px;">
      <label>点赞链接（最多 30 条）</label>
      <div id="liked-links-empty" class="muted" style="font-size: 12px;">暂无点赞记录</div>
      <ul id="liked-links-list" style="margin: 6px 0 0 16px; padding: 0; font-size: 12px; line-height: 1.5; display:none;"></ul>
    </div>
  `;
  runSummaryGrid.appendChild(runSummaryCard);
  root.appendChild(runSummaryGrid);

  const mainGrid = createEl('div', { className: 'bento-grid bento-aside' });

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

  return {
    statCollected: root.querySelector('#stat-collected') as HTMLDivElement,
    statSuccess: root.querySelector('#stat-success') as HTMLDivElement,
    statFailed: root.querySelector('#stat-failed') as HTMLDivElement,
    statRemaining: root.querySelector('#stat-remaining') as HTMLDivElement,
    taskKeyword: root.querySelector('#task-keyword') as HTMLDivElement,
    taskTarget: root.querySelector('#task-target') as HTMLDivElement,
    taskAccount: root.querySelector('#task-account') as HTMLDivElement,
    taskConfigId: root.querySelector('#task-config-id') as HTMLDivElement,
    currentPhase: root.querySelector('#current-phase') as HTMLSpanElement,
    currentAction: root.querySelector('#current-action') as HTMLSpanElement,
    progressPercent: root.querySelector('#progress-percent') as HTMLSpanElement,
    progressBar: root.querySelector('#progress-bar') as HTMLDivElement,
    statComments: root.querySelector('#stat-comments') as HTMLSpanElement,
    statLikes: root.querySelector('#stat-likes') as HTMLSpanElement,
    statRatelimit: root.querySelector('#stat-ratelimit') as HTMLSpanElement,
    statElapsed: root.querySelector('#stat-elapsed') as HTMLSpanElement,
    runIdText: root.querySelector('#run-id-text') as HTMLDivElement,
    errorCountText: root.querySelector('#error-count-text') as HTMLDivElement,
    recentErrorsEmpty: root.querySelector('#recent-errors-empty') as HTMLDivElement,
    recentErrorsList: root.querySelector('#recent-errors-list') as HTMLUListElement,
    likedLinksEmpty: root.querySelector('#liked-links-empty') as HTMLDivElement,
    likedLinksList: root.querySelector('#liked-links-list') as HTMLUListElement,
    logsContainer: root.querySelector('#logs-container') as HTMLDivElement,
    toggleLogsBtn: root.querySelector('#toggle-logs-btn') as HTMLButtonElement,
    pauseBtn: root.querySelector('#pause-btn') as HTMLButtonElement,
    stopBtn: root.querySelector('#stop-btn') as HTMLButtonElement,
    backConfigBtn: root.querySelector('#back-config-btn') as HTMLButtonElement,
  };
}
