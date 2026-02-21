import { createEl } from '../ui-components.mts';
import {
  getPlatformForCommandType,
  getTasksForPlatform,
  parseTaskRows,
  toIsoOrNull,
  toLocalDatetimeValue,
  type Platform,
  type ScheduleTask,
} from './schedule-task-bridge.mts';

type TaskFormData = {
  id?: string;
  name: string;
  enabled: boolean;
  platform: Platform;
  taskType: string;
  profileId: string;
  keyword: string;
  targetCount: number;
  env: 'debug' | 'prod';
  userId: string;
  collectComments: boolean;
  collectBody: boolean;
  doLikes: boolean;
  likeKeywords: string;
  scheduleType: 'interval' | 'once' | 'daily' | 'weekly';
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
};

const DEFAULT_FORM: TaskFormData = {
  name: '',
  enabled: true,
  platform: 'xiaohongshu',
  taskType: 'xhs-unified',
  profileId: '',
  keyword: '',
  targetCount: 50,
  env: 'debug',
  userId: '',
  collectComments: true,
  collectBody: true,
  doLikes: false,
  likeKeywords: '',
  scheduleType: 'interval',
  intervalMinutes: 30,
  runAt: null,
  maxRuns: null,
};

function parseSortableTime(value: string | null | undefined): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

function isKeywordRequired(taskType: string): boolean {
  return taskType === 'xhs-unified' || taskType === 'weibo-search' || taskType === '1688-search';
}

function commandTypeToWeiboTaskType(commandType: string): string {
  if (commandType === 'weibo-search') return 'search';
  if (commandType === 'weibo-monitor') return 'monitor';
  return 'timeline';
}

function fallbackTaskName(data: TaskFormData): string {
  const keyword = String(data.keyword || '').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return keyword ? `${data.taskType}-${keyword}` : `${data.taskType}-${stamp}`;
}

export function renderTasksPanel(root: HTMLElement, ctx: any) {
  root.innerHTML = '';

  const pageIndicator = createEl('div', { className: 'page-indicator' }, [
    '当前: ',
    createEl('span', {}, ['任务管理']),
    ' → 创建、编辑、执行任务',
  ]);
  root.appendChild(pageIndicator);

  const quotaBar = createEl('div', { className: 'bento-cell', style: 'margin-bottom: var(--gap); padding: var(--gap-sm);' });
  quotaBar.innerHTML = `
    <div style="display: flex; gap: var(--gap); align-items: center; flex-wrap: wrap;">
      <span style="font-size: 12px; color: var(--text-secondary);">配额状态:</span>
      <span id="quota-search" class="quota-item" style="font-size: 11px;">搜索: -/-</span>
      <span id="quota-like" class="quota-item" style="font-size: 11px;">点赞: -/-</span>
      <span id="quota-comment" class="quota-item" style="font-size: 11px;">评论: -/-</span>
      <button id="quota-refresh-btn" class="secondary" style="padding: 4px 8px; font-size: 11px; height: auto;">刷新</button>
    </div>
  `;
  root.appendChild(quotaBar);

  const mainGrid = createEl('div', { className: 'bento-grid bento-sidebar' });

  const formCard = createEl('div', { className: 'bento-cell' });
  formCard.innerHTML = `
    <div id="task-form-title" class="bento-title">新建任务</div>
    <input type="hidden" id="task-editing-id" />

    <div class="row">
      <div>
        <label>平台</label>
        <select id="task-platform" style="width: 130px;">
          <option value="xiaohongshu">📕 小红书</option>
          <option value="weibo">📰 微博</option>
          <option value="1688">🛒 1688</option>
        </select>
      </div>
      <div>
        <label>任务类型</label>
        <select id="task-type" style="width: 140px;"></select>
      </div>
      <div>
        <label>任务名</label>
        <input id="task-name" placeholder="可选，便于识别" style="width: 180px;" />
      </div>
    </div>

    <div class="row">
      <div>
        <label>关键词</label>
        <input id="task-keyword" placeholder="搜索关键词" style="width: 180px;" />
      </div>
      <div>
        <label>目标数</label>
        <input id="task-target" type="number" min="1" value="50" style="width: 80px;" />
      </div>
      <div>
        <label>Profile</label>
        <input id="task-profile" placeholder="xiaohongshu-batch-1" style="width: 160px;" />
      </div>
      <div>
        <label>环境</label>
        <select id="task-env" style="width: 80px;">
          <option value="debug">debug</option>
          <option value="prod">prod</option>
        </select>
      </div>
    </div>

    <div id="task-user-id-wrap" class="row" style="display:none;">
      <div>
        <label>微博用户ID (monitor 必填)</label>
        <input id="task-user-id" placeholder="例如: 1234567890" style="width: 220px;" />
      </div>
    </div>

    <div class="row">
      <label style="display:flex;align-items:center;gap:6px;">
        <input id="task-comments" type="checkbox" checked />
        <span style="font-size:12px;">评论</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;">
        <input id="task-body" type="checkbox" checked />
        <span style="font-size:12px;">正文</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;">
        <input id="task-likes" type="checkbox" />
        <span style="font-size:12px;">点赞</span>
      </label>
      <input id="task-like-keywords" placeholder="点赞关键词(逗号分隔)" style="flex:1; min-width:120px;" disabled />
    </div>

    <div style="margin-top: var(--gap); padding-top: var(--gap-sm); border-top: 1px solid var(--border);">
      <div style="font-size:12px; color:var(--text-secondary); margin-bottom:var(--gap-sm);">调度设置（可选）</div>
      <div class="row">
        <div>
          <select id="task-schedule-type" style="width: 100px;">
            <option value="interval">循环间隔</option>
            <option value="once">一次性</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
        </div>
        <div id="task-interval-wrap">
          <input id="task-interval" type="number" min="1" value="30" style="width: 70px;" />
          <span style="font-size:11px;color:var(--text-tertiary);">分钟</span>
        </div>
        <div id="task-runat-wrap" style="display:none;">
          <input id="task-runat" type="datetime-local" style="width: 160px;" />
        </div>
        <div>
          <input id="task-max-runs" type="number" min="1" placeholder="不限" style="width: 70px;" />
          <span style="font-size:11px;color:var(--text-tertiary);">次</span>
        </div>
      </div>
    </div>

    <div class="btn-group" style="margin-top: var(--gap);">
      <button id="task-save-btn" style="flex:1;">保存任务</button>
      <button id="task-run-btn" class="primary" style="flex:1;">保存并执行</button>
      <button id="task-run-ephemeral-btn" class="secondary" style="flex:1;">仅执行(不保存)</button>
      <button id="task-reset-btn" class="secondary" style="flex:0.6;">重置</button>
    </div>
  `;
  mainGrid.appendChild(formCard);

  const statsCard = createEl('div', { className: 'bento-cell', style: 'max-width: 300px;' });
  statsCard.innerHTML = `
    <div class="bento-title">快速状态</div>
    <div id="quick-stats">
      <div style="margin-bottom: var(--gap-sm);">
        <span style="font-size:11px;color:var(--text-tertiary);">运行中任务</span>
        <div id="stat-running" style="font-size:18px;font-weight:700;color:var(--accent-success);">0</div>
      </div>
      <div style="margin-bottom: var(--gap-sm);">
        <span style="font-size:11px;color:var(--text-tertiary);">累计执行</span>
        <div id="stat-today" style="font-size:18px;font-weight:700;">0</div>
      </div>
      <div>
        <span style="font-size:11px;color:var(--text-tertiary);">已保存任务</span>
        <div id="stat-saved" style="font-size:18px;font-weight:700;">0</div>
      </div>
    </div>
    <div style="margin-top: var(--gap);">
      <button id="goto-scheduler-btn" class="secondary" style="width:100%;">查看任务列表</button>
    </div>
  `;
  mainGrid.appendChild(statsCard);

  root.appendChild(mainGrid);

  const recentCard = createEl('div', { className: 'bento-cell', style: 'margin-top: var(--gap);' });
  recentCard.innerHTML = `
    <div class="bento-title">历史任务</div>
    <div class="row" style="margin-bottom: var(--gap-sm);">
      <select id="task-history-select" style="min-width: 320px;">
        <option value="">选择历史任务...</option>
      </select>
      <button id="task-history-edit-btn" class="secondary">载入编辑</button>
      <button id="task-history-clone-btn" class="secondary">载入另存</button>
      <button id="task-history-refresh-btn" class="secondary">刷新</button>
    </div>
    <div id="recent-tasks-list"></div>
  `;
  root.appendChild(recentCard);

  const formTitle = formCard.querySelector('#task-form-title') as HTMLDivElement;
  const platformSelect = formCard.querySelector('#task-platform') as HTMLSelectElement;
  const taskTypeSelect = formCard.querySelector('#task-type') as HTMLSelectElement;
  const nameInput = formCard.querySelector('#task-name') as HTMLInputElement;
  const keywordInput = formCard.querySelector('#task-keyword') as HTMLInputElement;
  const targetInput = formCard.querySelector('#task-target') as HTMLInputElement;
  const profileInput = formCard.querySelector('#task-profile') as HTMLInputElement;
  const envSelect = formCard.querySelector('#task-env') as HTMLSelectElement;
  const userIdWrap = formCard.querySelector('#task-user-id-wrap') as HTMLDivElement;
  const userIdInput = formCard.querySelector('#task-user-id') as HTMLInputElement;
  const commentsInput = formCard.querySelector('#task-comments') as HTMLInputElement;
  const bodyInput = formCard.querySelector('#task-body') as HTMLInputElement;
  const likesInput = formCard.querySelector('#task-likes') as HTMLInputElement;
  const likeKeywordsInput = formCard.querySelector('#task-like-keywords') as HTMLInputElement;
  const scheduleTypeSelect = formCard.querySelector('#task-schedule-type') as HTMLSelectElement;
  const intervalInput = formCard.querySelector('#task-interval') as HTMLInputElement;
  const intervalWrap = formCard.querySelector('#task-interval-wrap') as HTMLDivElement;
  const runAtInput = formCard.querySelector('#task-runat') as HTMLInputElement;
  const runAtWrap = formCard.querySelector('#task-runat-wrap') as HTMLDivElement;
  const maxRunsInput = formCard.querySelector('#task-max-runs') as HTMLInputElement;
  const editingIdInput = formCard.querySelector('#task-editing-id') as HTMLInputElement;
  const saveBtn = formCard.querySelector('#task-save-btn') as HTMLButtonElement;
  const runBtn = formCard.querySelector('#task-run-btn') as HTMLButtonElement;
  const runEphemeralBtn = formCard.querySelector('#task-run-ephemeral-btn') as HTMLButtonElement;
  const resetBtn = formCard.querySelector('#task-reset-btn') as HTMLButtonElement;
  const quotaRefreshBtn = quotaBar.querySelector('#quota-refresh-btn') as HTMLButtonElement;
  const gotoSchedulerBtn = statsCard.querySelector('#goto-scheduler-btn') as HTMLButtonElement;
  const historySelect = recentCard.querySelector('#task-history-select') as HTMLSelectElement;
  const historyEditBtn = recentCard.querySelector('#task-history-edit-btn') as HTMLButtonElement;
  const historyCloneBtn = recentCard.querySelector('#task-history-clone-btn') as HTMLButtonElement;
  const historyRefreshBtn = recentCard.querySelector('#task-history-refresh-btn') as HTMLButtonElement;
  const recentTasksList = recentCard.querySelector('#recent-tasks-list') as HTMLDivElement;
  const statRunning = statsCard.querySelector('#stat-running') as HTMLDivElement;
  const statToday = statsCard.querySelector('#stat-today') as HTMLDivElement;
  const statSaved = statsCard.querySelector('#stat-saved') as HTMLDivElement;

  let tasks: ScheduleTask[] = [];
  const activeRunIds = new Set<string>();
  let unsubscribeActiveRuns: (() => void) | null = null;

  const joinPath = (...parts: string[]) => {
    if (typeof ctx?.api?.pathJoin === 'function') return ctx.api.pathJoin(...parts);
    return parts.filter(Boolean).join('/');
  };
  const scheduleScript = joinPath('apps', 'webauto', 'entry', 'schedule.mjs');
  const quotaScript = joinPath('apps', 'webauto', 'entry', 'lib', 'quota-status.mjs');
  const xhsScript = joinPath('apps', 'webauto', 'entry', 'xhs-unified.mjs');
  const weiboScript = joinPath('apps', 'webauto', 'entry', 'weibo-unified.mjs');

  function getTaskById(taskId: string): ScheduleTask | null {
    const id = String(taskId || '').trim();
    if (!id) return null;
    return tasks.find((row) => row.id === id) || null;
  }

  function updateFormTitle(mode: 'new' | 'edit' | 'clone') {
    if (mode === 'edit') {
      formTitle.textContent = '编辑任务';
      return;
    }
    if (mode === 'clone') {
      formTitle.textContent = '另存为新任务';
      return;
    }
    formTitle.textContent = '新建任务';
  }

  function updateTaskTypeOptions(preferredType = '') {
    const platform = platformSelect.value as Platform;
    const options = getTasksForPlatform(platform);
    taskTypeSelect.innerHTML = options
      .map((item) => `<option value="${item.type}">${item.icon} ${item.label}</option>`)
      .join('');
    const target = String(preferredType || '').trim();
    const matched = options.find((item) => item.type === target);
    taskTypeSelect.value = matched?.type || options[0]?.type || '';
    updatePlatformFields();
  }

  function updatePlatformFields() {
    const taskType = String(taskTypeSelect.value || '').trim();
    const isWeiboMonitor = taskType === 'weibo-monitor';
    userIdWrap.style.display = isWeiboMonitor ? '' : 'none';
  }

  function updateScheduleVisibility() {
    const scheduleType = String(scheduleTypeSelect.value || 'interval').trim();
    intervalWrap.style.display = scheduleType === 'interval' ? 'inline-flex' : 'none';
    runAtWrap.style.display = scheduleType === 'once' || scheduleType === 'daily' || scheduleType === 'weekly'
      ? 'inline-flex'
      : 'none';
  }

  function updateLikeKeywordsState() {
    likeKeywordsInput.disabled = !likesInput.checked;
  }

  function collectFormData(): TaskFormData {
    const maxRunsRaw = String(maxRunsInput.value || '').trim();
    const maxRunsNum = maxRunsRaw ? Number(maxRunsRaw) : 0;
    return {
      id: String(editingIdInput.value || '').trim() || undefined,
      name: String(nameInput.value || '').trim(),
      enabled: true,
      platform: platformSelect.value as Platform,
      taskType: String(taskTypeSelect.value || '').trim(),
      profileId: String(profileInput.value || '').trim(),
      keyword: String(keywordInput.value || '').trim(),
      targetCount: Math.max(1, Number(targetInput.value || 50) || 50),
      env: (String(envSelect.value || 'debug').trim() === 'prod' ? 'prod' : 'debug'),
      userId: String(userIdInput.value || '').trim(),
      collectComments: commentsInput.checked,
      collectBody: bodyInput.checked,
      doLikes: likesInput.checked,
      likeKeywords: String(likeKeywordsInput.value || '').trim(),
      scheduleType: scheduleTypeSelect.value as TaskFormData['scheduleType'],
      intervalMinutes: Math.max(1, Number(intervalInput.value || 30) || 30),
      runAt: toIsoOrNull(String(runAtInput.value || '')),
      maxRuns: Number.isFinite(maxRunsNum) && maxRunsNum > 0 ? Math.max(1, Math.floor(maxRunsNum)) : null,
    };
  }

  function applyTaskToForm(task: ScheduleTask, mode: 'edit' | 'clone') {
    const taskType = String(task.commandType || 'xhs-unified').trim() || 'xhs-unified';
    const platform = getPlatformForCommandType(taskType);
    platformSelect.value = platform;
    updateTaskTypeOptions(taskType);
    editingIdInput.value = mode === 'edit' ? String(task.id || '') : '';
    nameInput.value = mode === 'clone'
      ? `${String(task.name || task.id || '').trim()}-copy`
      : String(task.name || '').trim();
    keywordInput.value = String(task.commandArgv?.keyword || task.commandArgv?.k || '').trim();
    targetInput.value = String(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? 50);
    profileInput.value = String(task.commandArgv?.profile || task.commandArgv?.profileId || '').trim();
    envSelect.value = String(task.commandArgv?.env || 'debug').trim() === 'prod' ? 'prod' : 'debug';
    userIdInput.value = String(task.commandArgv?.['user-id'] || task.commandArgv?.userId || '').trim();
    commentsInput.checked = task.commandArgv?.['do-comments'] !== false;
    bodyInput.checked = task.commandArgv?.['fetch-body'] !== false;
    likesInput.checked = task.commandArgv?.['do-likes'] === true;
    likeKeywordsInput.value = String(task.commandArgv?.['like-keywords'] || '').trim();
    scheduleTypeSelect.value = String(task.scheduleType || 'interval') as TaskFormData['scheduleType'];
    intervalInput.value = String(task.intervalMinutes || 30);
    runAtInput.value = toLocalDatetimeValue(task.runAt);
    maxRunsInput.value = task.maxRuns ? String(task.maxRuns) : '';
    updatePlatformFields();
    updateScheduleVisibility();
    updateLikeKeywordsState();
    updateFormTitle(mode);
  }

  function resetForm() {
    editingIdInput.value = '';
    nameInput.value = DEFAULT_FORM.name;
    platformSelect.value = DEFAULT_FORM.platform;
    updateTaskTypeOptions(DEFAULT_FORM.taskType);
    keywordInput.value = DEFAULT_FORM.keyword;
    targetInput.value = String(DEFAULT_FORM.targetCount);
    profileInput.value = DEFAULT_FORM.profileId;
    envSelect.value = DEFAULT_FORM.env;
    userIdInput.value = DEFAULT_FORM.userId;
    commentsInput.checked = DEFAULT_FORM.collectComments;
    bodyInput.checked = DEFAULT_FORM.collectBody;
    likesInput.checked = DEFAULT_FORM.doLikes;
    likeKeywordsInput.value = DEFAULT_FORM.likeKeywords;
    scheduleTypeSelect.value = DEFAULT_FORM.scheduleType;
    intervalInput.value = String(DEFAULT_FORM.intervalMinutes);
    runAtInput.value = '';
    maxRunsInput.value = '';
    updatePlatformFields();
    updateScheduleVisibility();
    updateLikeKeywordsState();
    updateFormTitle('new');
  }

  function sortedTasksByRecent(): ScheduleTask[] {
    return [...tasks].sort((a, b) => {
      const byUpdated = parseSortableTime(b.updatedAt) - parseSortableTime(a.updatedAt);
      if (byUpdated !== 0) return byUpdated;
      const byCreated = parseSortableTime(b.createdAt) - parseSortableTime(a.createdAt);
      if (byCreated !== 0) return byCreated;
      return (Number(b.seq) || 0) - (Number(a.seq) || 0);
    });
  }

  function renderHistorySelect() {
    const previous = String(historySelect.value || '').trim();
    const rows = sortedTasksByRecent();
    historySelect.innerHTML = '<option value="">选择历史任务...</option>';
    for (const row of rows) {
      const label = `${row.name || row.id} (${row.id})`;
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = label;
      historySelect.appendChild(option);
    }
    if (previous && rows.some((row) => row.id === previous)) {
      historySelect.value = previous;
    }
  }

  function renderRecentTasks() {
    const rows = sortedTasksByRecent().slice(0, 8);
    if (rows.length === 0) {
      recentTasksList.innerHTML = '<div class="muted" style="font-size:12px;">暂无任务</div>';
      return;
    }
    recentTasksList.innerHTML = rows.map((task) => `
      <div class="task-row" style="display:flex;gap:var(--gap-sm);padding:var(--gap-xs)0;border-bottom:1px solid var(--border-subtle);align-items:center;">
        <span style="flex:1;font-size:12px;">${task.name || task.id}</span>
        <span style="font-size:11px;color:var(--text-tertiary);">${task.commandType}</span>
        <span style="font-size:11px;color:${task.enabled ? 'var(--accent-success)' : 'var(--text-muted)'};">${task.enabled ? '启用' : '禁用'}</span>
        <button class="secondary edit-task-btn" data-id="${task.id}" style="padding:2px 6px;font-size:10px;height:auto;">编辑</button>
      </div>
    `).join('');
    recentTasksList.querySelectorAll('.edit-task-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const taskId = (btn as HTMLButtonElement).dataset.id || '';
        const task = getTaskById(taskId);
        if (!task) return;
        historySelect.value = task.id;
        applyTaskToForm(task, 'edit');
      });
    });
  }

  function updateStats() {
    statSaved.textContent = String(tasks.length);
    statRunning.textContent = String(activeRunIds.size);
    const totalRunCount = tasks.reduce((sum, row) => sum + (Number(row.runCount) || 0), 0);
    statToday.textContent = String(totalRunCount);
  }

  async function runJsonScript(scriptPath: string, args: string[], timeoutMs = 60_000) {
    const ret = await ctx.api.cmdRunJson({
      title: `task-panel ${args.join(' ')}`.trim(),
      cwd: '',
      args: [scriptPath, ...args, '--json'],
      timeoutMs,
    });
    if (!ret?.ok) {
      const reason = String(ret?.error || ret?.stderr || ret?.stdout || 'unknown_error').trim();
      throw new Error(reason || 'command failed');
    }
    return ret.json || {};
  }

  async function runScheduleJson(args: string[], timeoutMs = 60_000) {
    return runJsonScript(scheduleScript, args, timeoutMs);
  }

  async function loadQuotaStatus() {
    try {
      const ret = await ctx.api.cmdRunJson({
        title: 'quota status',
        cwd: '',
        args: [quotaScript],
        timeoutMs: 30_000,
      });
      if (!ret?.ok) return;
      const payload = ret?.json || {};
      const quotas = Array.isArray(payload?.quotas) ? payload.quotas : [];
      for (const quota of quotas) {
        const type = String(quota?.type || '').trim();
        if (!type) continue;
        const count = Number(quota?.count || 0);
        const max = Number(quota?.max || 0);
        const el = quotaBar.querySelector(`#quota-${type}`) as HTMLSpanElement | null;
        if (!el) continue;
        el.textContent = `${type}: ${count}/${max || '-'}`;
        el.style.color = max > 0 && count >= max ? 'var(--accent-danger)' : '';
      }
    } catch (err) {
      console.error('load quota failed:', err);
    }
  }

  async function loadTasks() {
    try {
      const out = await runScheduleJson(['list']);
      tasks = parseTaskRows(out);
      renderHistorySelect();
      renderRecentTasks();
      updateStats();
    } catch (err) {
      console.error('load tasks failed:', err);
    }
  }

  function buildCommandArgv(data: TaskFormData): Record<string, any> {
    const argv: Record<string, any> = {
      profile: data.profileId,
      keyword: data.keyword,
      'max-notes': data.targetCount,
      target: data.targetCount,
      env: data.env,
      'do-comments': data.collectComments,
      'fetch-body': data.collectBody,
      'do-likes': data.doLikes,
      'like-keywords': data.likeKeywords,
    };
    if (String(data.taskType || '').startsWith('weibo-')) {
      argv['task-type'] = commandTypeToWeiboTaskType(data.taskType);
      if (data.userId) argv['user-id'] = data.userId;
    }
    return argv;
  }

  function validateBeforeSave(data: TaskFormData): string | null {
    if (!data.profileId) return '请输入 Profile ID';
    if (isKeywordRequired(data.taskType) && !data.keyword) return '请输入关键词';
    if (data.taskType === 'weibo-monitor' && !data.userId) return '微博 monitor 任务需要 user-id';
    if (data.scheduleType !== 'interval' && !data.runAt) return `${data.scheduleType} 任务需要执行时间`;
    return null;
  }

  function buildSaveArgs(data: TaskFormData): string[] {
    const args = data.id ? ['update', data.id] : ['add'];
    args.push('--name', data.name || fallbackTaskName(data));
    args.push('--enabled', String(data.enabled));
    args.push('--command-type', data.taskType || 'xhs-unified');
    args.push('--schedule-type', data.scheduleType);
    if (data.scheduleType === 'interval') {
      args.push('--interval-minutes', String(data.intervalMinutes));
    } else {
      args.push('--run-at', String(data.runAt || ''));
    }
    args.push('--max-runs', data.maxRuns === null ? '0' : String(data.maxRuns));
    args.push('--argv-json', JSON.stringify(buildCommandArgv(data)));
    return args;
  }

  async function runSavedTask(taskId: string, data: TaskFormData) {
    const out = await runScheduleJson(['run', taskId], 0);
    const runId = String(
      out?.result?.runResult?.lastRunId
      || out?.result?.runResult?.runId
      || out?.runResult?.runId
      || '',
    ).trim();
    if (typeof ctx.setStatus === 'function') {
      ctx.setStatus(`running: ${taskId}`);
    }
    if (data.taskType === 'xhs-unified' && ctx && typeof ctx === 'object') {
      ctx.xhsCurrentRun = {
        runId: runId || null,
        taskId,
        profileId: data.profileId,
        keyword: data.keyword,
        target: data.targetCount,
        startedAt: new Date().toISOString(),
      };
      ctx.activeRunId = runId || ctx.activeRunId || null;
    }
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab(data.taskType === 'xhs-unified' ? 'dashboard' : 'scheduler');
    }
  }

  async function saveTask(runImmediately = false) {
    const data = collectFormData();
    const invalidReason = validateBeforeSave(data);
    if (invalidReason) {
      alert(invalidReason);
      return;
    }
    saveBtn.disabled = true;
    runBtn.disabled = true;
    runEphemeralBtn.disabled = true;
    try {
      const out = await runScheduleJson(buildSaveArgs(data));
      const taskId = String(out?.task?.id || data.id || '').trim();
      if (!taskId) {
        throw new Error('task id missing after save');
      }
      editingIdInput.value = taskId;
      updateFormTitle('edit');
      await loadTasks();
      historySelect.value = taskId;
      if (runImmediately) {
        await runSavedTask(taskId, data);
      } else {
        alert('任务已保存');
      }
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    } finally {
      saveBtn.disabled = false;
      runBtn.disabled = false;
      runEphemeralBtn.disabled = false;
    }
  }

  function buildEphemeralRunSpec(data: TaskFormData): { args: string[]; title: string; groupKey: string } | null {
    if (!data.profileId) return null;
    if (data.taskType === 'xhs-unified') {
      if (!data.keyword) return null;
      return {
        title: `xhs unified: ${data.keyword}`,
        groupKey: 'xhs-unified',
        args: [
          xhsScript,
          '--profile', data.profileId,
          '--keyword', data.keyword,
          '--target', String(data.targetCount),
          '--max-notes', String(data.targetCount),
          '--env', data.env,
          '--do-comments', String(data.collectComments),
          '--fetch-body', String(data.collectBody),
          '--do-likes', String(data.doLikes),
          '--like-keywords', data.likeKeywords,
        ],
      };
    }
    if (data.taskType === 'weibo-search') {
      if (!data.keyword) return null;
      return {
        title: `weibo: ${data.keyword}`,
        groupKey: 'weibo-search',
        args: [
          weiboScript,
          'search',
          '--profile', data.profileId,
          '--keyword', data.keyword,
          '--target', String(data.targetCount),
          '--env', data.env,
        ],
      };
    }
    return null;
  }

  async function runWithoutSave() {
    const data = collectFormData();
    if (!data.profileId) {
      alert('请输入 Profile ID');
      return;
    }
    if (isKeywordRequired(data.taskType) && !data.keyword) {
      alert('请输入关键词');
      return;
    }
    if (data.taskType === 'weibo-monitor' && !data.userId) {
      alert('微博 monitor 任务需要 user-id');
      return;
    }
    const spec = buildEphemeralRunSpec(data);
    if (!spec) {
      alert(`当前任务类型暂不支持仅执行(不保存): ${data.taskType}`);
      return;
    }
    runEphemeralBtn.disabled = true;
    try {
      const ret = await ctx.api.cmdSpawn({
        title: spec.title,
        cwd: '',
        args: spec.args,
        groupKey: spec.groupKey,
      });
      const runId = String(ret?.runId || '').trim();
      if (runId) {
        activeRunIds.add(runId);
        updateStats();
      }
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`started: ${spec.title}`);
      }
      if (data.taskType === 'xhs-unified' && ctx && typeof ctx === 'object') {
        ctx.xhsCurrentRun = {
          runId: runId || null,
          taskId: null,
          profileId: data.profileId,
          keyword: data.keyword,
          target: data.targetCount,
          startedAt: new Date().toISOString(),
        };
        ctx.activeRunId = runId || ctx.activeRunId || null;
      }
      if (typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab(data.taskType === 'xhs-unified' ? 'dashboard' : 'scheduler');
      }
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    } finally {
      runEphemeralBtn.disabled = false;
    }
  }

  function selectedHistoryTask(): ScheduleTask | null {
    const taskId = String(historySelect.value || '').trim();
    if (!taskId) return null;
    return getTaskById(taskId);
  }

  async function loadLastProfile() {
    try {
      const config = await ctx.api.configLoadLast();
      if (!profileInput.value && config?.lastProfileId) {
        profileInput.value = String(config.lastProfileId || '');
      }
      if (!keywordInput.value && config?.keyword) {
        keywordInput.value = String(config.keyword || '');
      }
    } catch {
      // ignore
    }
  }

  platformSelect.addEventListener('change', () => {
    updateTaskTypeOptions();
  });
  taskTypeSelect.addEventListener('change', () => updatePlatformFields());
  scheduleTypeSelect.addEventListener('change', () => updateScheduleVisibility());
  likesInput.addEventListener('change', () => updateLikeKeywordsState());
  saveBtn.addEventListener('click', () => { void saveTask(false); });
  runBtn.addEventListener('click', () => { void saveTask(true); });
  runEphemeralBtn.addEventListener('click', () => { void runWithoutSave(); });
  resetBtn.addEventListener('click', resetForm);
  quotaRefreshBtn.addEventListener('click', () => { void loadQuotaStatus(); });
  historyRefreshBtn.addEventListener('click', () => { void loadTasks(); });
  historyEditBtn.addEventListener('click', () => {
    const task = selectedHistoryTask();
    if (!task) {
      alert('请先选择历史任务');
      return;
    }
    applyTaskToForm(task, 'edit');
  });
  historyCloneBtn.addEventListener('click', () => {
    const task = selectedHistoryTask();
    if (!task) {
      alert('请先选择历史任务');
      return;
    }
    applyTaskToForm(task, 'clone');
  });
  gotoSchedulerBtn.addEventListener('click', () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('scheduler');
    }
  });

  if (typeof ctx.api?.onCmdEvent === 'function') {
    unsubscribeActiveRuns = ctx.api.onCmdEvent((evt: any) => {
      const runId = String(evt?.runId || '').trim();
      if (!runId) return;
      if (evt?.type === 'started') {
        activeRunIds.add(runId);
        updateStats();
        return;
      }
      if (evt?.type === 'exit') {
        activeRunIds.delete(runId);
        updateStats();
      }
    });
  }

  resetForm();
  updateTaskTypeOptions(DEFAULT_FORM.taskType);
  updateScheduleVisibility();
  updateLikeKeywordsState();
  void loadQuotaStatus();
  void loadTasks();
  void loadLastProfile();

  return () => {
    if (unsubscribeActiveRuns) {
      try { unsubscribeActiveRuns(); } catch {}
      unsubscribeActiveRuns = null;
    }
  };
}
