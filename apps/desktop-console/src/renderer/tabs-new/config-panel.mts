import { createEl } from '../ui-components.mts';
import { listAccountProfiles, type UiAccountProfile } from '../account-source.mts';
import {
  asCsvText,
  parseTaskRows,
  pickLatestTask,
  toIsoOrNull,
  toLocalDatetimeValue,
  type ScheduleTask,
} from './schedule-task-bridge.mts';

type SchedulePayload = {
  id: string;
  name: string;
  enabled: boolean;
  commandType: string;
  scheduleType: ScheduleTask['scheduleType'];
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
  argv: Record<string, any>;
};

const DEFAULT_MAX_NOTES = 50;

export function renderConfigPanel(root: HTMLElement, ctx: any) {
  root.innerHTML = '';

  const pageIndicator = createEl('div', { className: 'page-indicator' }, [
    '当前: ',
    createEl('span', {}, ['任务配置']),
    ' → 可直接执行或跳转 ',
    createEl('span', {}, ['定时任务']),
  ]);
  root.appendChild(pageIndicator);

  const grid = createEl('div', { className: 'bento-grid bento-sidebar' });

  const taskCard = createEl('div', { className: 'bento-cell' });
  taskCard.innerHTML = `
    <div class="bento-title">任务配置</div>
    <div class="row">
      <div>
        <label>配置任务</label>
        <select id="task-config-select" style="width: 280px;">
          <option value="">加载中...</option>
        </select>
      </div>
      <div style="display:flex; gap:8px; margin-top: 20px;">
        <button id="task-config-refresh-btn" class="secondary">刷新</button>
        <button id="task-open-scheduler-btn" class="secondary">在任务页编辑</button>
      </div>
    </div>
    <div class="row">
      <div>
        <label>任务名</label>
        <input id="task-name-input" placeholder="例如：工作服-主流程" style="width: 280px;" />
      </div>
      <label style="display:flex; align-items:center; gap:8px; margin-top: 22px;">
        <input id="task-enabled-cb" type="checkbox" checked />
        <span>启用</span>
      </label>
    </div>
    <div class="row">
      <div>
        <label>搜索关键词</label>
        <input id="keyword-input" placeholder="输入关键词" style="width: 220px;" />
      </div>
      <div>
        <label>目标数量</label>
        <input id="target-input" type="number" value="50" min="1" style="width: 100px;" />
      </div>
      <div>
        <label>运行环境</label>
        <select id="env-select" style="width: 120px;">
          <option value="debug">debug</option>
          <option value="prod">prod</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div>
        <label>执行账户</label>
        <select id="account-select" style="min-width: 280px;">
          <option value="">请选择账户...</option>
        </select>
      </div>
    </div>
    <div style="margin-top: var(--gap); padding-top: var(--gap); border-top: 1px solid var(--border);">
      <div class="bento-title" style="font-size: 13px;">调度设置</div>
      <div class="row">
        <div>
          <label>任务类型</label>
          <select id="schedule-type-select" style="width: 140px;">
            <option value="immediate">马上执行（仅一次）</option>
            <option value="periodic">周期任务</option>
            <option value="scheduled">定时任务</option>
          </select>
        </div>
        <div id="schedule-periodic-type-wrap" style="display:none;">
          <label>周期类型</label>
          <select id="schedule-periodic-type-select" style="width: 120px;">
            <option value="interval">按间隔</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
        </div>
        <div id="schedule-interval-wrap" style="display:none;">
          <label>间隔分钟</label>
          <input id="schedule-interval-input" type="number" min="1" value="30" style="width: 120px;" />
        </div>
        <div id="schedule-runat-wrap" style="display:none;">
          <label>执行时间</label>
          <input id="schedule-runat-input" type="datetime-local" style="width: 220px;" />
        </div>
        <div>
          <label>最大执行次数</label>
          <input id="schedule-max-runs-input" type="number" min="1" placeholder="不限" style="width: 120px;" />
        </div>
      </div>
    </div>
  `;
  grid.appendChild(taskCard);

  const optionsCard = createEl('div', { className: 'bento-cell' });
  optionsCard.innerHTML = `
    <div class="bento-title">采集选项</div>
    <div style="display: flex; gap: var(--gap); margin-bottom: var(--gap);">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
        <input id="fetch-body-cb" type="checkbox" checked />
        <span>爬取正文</span>
      </label>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
        <input id="fetch-comments-cb" type="checkbox" checked />
        <span>爬取评论</span>
      </label>
    </div>
    <div class="row">
      <div>
        <label>最多评论数 (0=不限)</label>
        <input id="max-comments-input" type="number" value="0" min="0" style="width: 100px;" />
      </div>
    </div>
    <div style="margin-top: var(--gap); padding-top: var(--gap); border-top: 1px solid var(--border);">
      <div class="bento-title" style="font-size: 13px;">点赞设置</div>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: var(--gap-sm);">
        <input id="auto-like-cb" type="checkbox" />
        <span>自动点赞</span>
      </label>
      <div>
        <label>点赞关键词（逗号分隔）</label>
        <input id="like-keywords-input" placeholder="例如: 购买链接,真敬业" />
      </div>
      <div class="row" style="margin-top: 8px;">
        <div>
          <label>最大点赞数 (0=不限)</label>
          <input id="max-likes-input" type="number" value="0" min="0" style="width: 100px;" />
        </div>
      </div>
    </div>
    <div style="margin-top: var(--gap); padding-top: var(--gap); border-top: 1px solid var(--border);">
      <div class="bento-title" style="font-size: 13px;">高级选项</div>
      <div style="display: flex; gap: var(--gap);">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input id="headless-cb" type="checkbox" />
          <span>Headless</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input id="dry-run-cb" type="checkbox" />
          <span>Dry Run</span>
        </label>
      </div>
    </div>
    <div style="margin-top: var(--gap); padding-top: var(--gap); border-top: 1px solid var(--border);">
      <div class="bento-title" style="font-size: 13px;">配置文件</div>
      <div class="btn-group">
        <button id="import-btn" class="secondary" style="flex: 1;">导入配置</button>
        <button id="export-btn" class="secondary" style="flex: 1;">导出配置</button>
      </div>
    </div>
  `;
  grid.appendChild(optionsCard);
  root.appendChild(grid);

  const statusRow = createEl('div', { className: 'bento-grid', style: 'margin-top: var(--gap);' });
  const statusCard = createEl('div', { className: 'bento-cell' });
  statusCard.innerHTML = `
    <div class="bento-title">配置状态</div>
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
      <div>
        <label>当前配置ID</label>
        <div id="config-active-task-id" style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">新配置</div>
      </div>
      <div>
        <label>编辑模式</label>
        <div id="config-edit-mode">新建</div>
      </div>
      <div>
        <label>保存状态</label>
        <div id="config-dirty-state" style="font-weight: 600; color: var(--accent-success);">已保存</div>
      </div>
      <div>
        <label>调度预览</label>
        <div id="config-schedule-preview" class="muted">马上执行（仅一次）</div>
      </div>
    </div>
    <div id="config-last-action" class="muted" style="margin-top: 6px; font-size: 12px;">最近操作：-</div>
  `;
  statusRow.appendChild(statusCard);
  root.appendChild(statusRow);

  const actionRow = createEl('div', { className: 'bento-grid', style: 'margin-top: var(--gap);' });
  const actionCard = createEl('div', { className: 'bento-cell highlight' });
  actionCard.innerHTML = `
    <div style="display:flex; justify-content:center; flex-wrap: wrap; gap: 12px;">
      <button id="save-current-btn" class="secondary">保存当前配置</button>
      <button id="save-new-btn" class="secondary">另存为新配置</button>
      <button id="save-open-scheduler-btn" class="secondary">保存并前往任务页</button>
      <button id="start-btn" style="padding: 12px 44px; font-size: 15px;">保存并执行</button>
      <button id="start-now-btn" class="secondary" style="padding: 12px 24px; font-size: 14px;">立即执行(不保存)</button>
    </div>
  `;
  actionRow.appendChild(actionCard);
  root.appendChild(actionRow);

  const taskConfigSelect = root.querySelector('#task-config-select') as HTMLSelectElement;
  const taskNameInput = root.querySelector('#task-name-input') as HTMLInputElement;
  const taskEnabledCb = root.querySelector('#task-enabled-cb') as HTMLInputElement;
  const taskConfigRefreshBtn = root.querySelector('#task-config-refresh-btn') as HTMLButtonElement;
  const taskOpenSchedulerBtn = root.querySelector('#task-open-scheduler-btn') as HTMLButtonElement;

  const keywordInput = root.querySelector('#keyword-input') as HTMLInputElement;
  const targetInput = root.querySelector('#target-input') as HTMLInputElement;
  const envSelect = root.querySelector('#env-select') as HTMLSelectElement;
  const accountSelect = root.querySelector('#account-select') as HTMLSelectElement;
  const scheduleTypeSelect = root.querySelector('#schedule-type-select') as HTMLSelectElement;
  const schedulePeriodicTypeWrap = root.querySelector('#schedule-periodic-type-wrap') as HTMLDivElement;
  const schedulePeriodicTypeSelect = root.querySelector('#schedule-periodic-type-select') as HTMLSelectElement;
  const scheduleIntervalWrap = root.querySelector('#schedule-interval-wrap') as HTMLDivElement;
  const scheduleRunAtWrap = root.querySelector('#schedule-runat-wrap') as HTMLDivElement;
  const scheduleIntervalInput = root.querySelector('#schedule-interval-input') as HTMLInputElement;
  const scheduleRunAtInput = root.querySelector('#schedule-runat-input') as HTMLInputElement;
  const scheduleMaxRunsInput = root.querySelector('#schedule-max-runs-input') as HTMLInputElement;

  const fetchBodyCb = root.querySelector('#fetch-body-cb') as HTMLInputElement;
  const fetchCommentsCb = root.querySelector('#fetch-comments-cb') as HTMLInputElement;
  const maxCommentsInput = root.querySelector('#max-comments-input') as HTMLInputElement;
  const autoLikeCb = root.querySelector('#auto-like-cb') as HTMLInputElement;
  const likeKeywordsInput = root.querySelector('#like-keywords-input') as HTMLInputElement;
  const maxLikesInput = root.querySelector('#max-likes-input') as HTMLInputElement;
  const headlessCb = root.querySelector('#headless-cb') as HTMLInputElement;
  const dryRunCb = root.querySelector('#dry-run-cb') as HTMLInputElement;
  const importBtn = root.querySelector('#import-btn') as HTMLButtonElement;
  const exportBtn = root.querySelector('#export-btn') as HTMLButtonElement;
  const saveCurrentBtn = root.querySelector('#save-current-btn') as HTMLButtonElement;
  const saveNewBtn = root.querySelector('#save-new-btn') as HTMLButtonElement;
  const saveOpenSchedulerBtn = root.querySelector('#save-open-scheduler-btn') as HTMLButtonElement;
  const startBtn = root.querySelector('#start-btn') as HTMLButtonElement;
  const startNowBtn = root.querySelector('#start-now-btn') as HTMLButtonElement;
  const configActiveTaskId = root.querySelector('#config-active-task-id') as HTMLDivElement;
  const configEditMode = root.querySelector('#config-edit-mode') as HTMLDivElement;
  const configDirtyState = root.querySelector('#config-dirty-state') as HTMLDivElement;
  const configSchedulePreview = root.querySelector('#config-schedule-preview') as HTMLDivElement;
  const configLastAction = root.querySelector('#config-last-action') as HTMLDivElement;

  let accountRows: UiAccountProfile[] = [];
  let taskRows: ScheduleTask[] = [];
  let selectedTaskId = String(ctx?.activeTaskConfigId || '').trim();
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let loadedFromLegacy = false;
  let isDirty = false;
  let suppressDirtyTracking = false;
  let lastActionText = '-';

  function nowText() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function scheduleSummaryText() {
    const mode = String(scheduleTypeSelect.value || 'immediate').trim();
    const periodicType = String(schedulePeriodicTypeSelect.value || 'interval').trim();
    const maxRunsRaw = scheduleMaxRunsInput.value.trim();
    const maxRuns = maxRunsRaw ? `，最多 ${Math.max(1, Number(maxRunsRaw) || 1)} 次` : '，不限次数';
    if (mode === 'immediate') {
      return '马上执行（仅一次）';
    }
    if (mode === 'periodic') {
      if (periodicType === 'daily' || periodicType === 'weekly') {
        const label = periodicType === 'daily' ? '每天' : '每周';
        const runAtText = scheduleRunAtInput.value ? scheduleRunAtInput.value.replace('T', ' ') : '未设置时间';
        return `${label}，${runAtText}${maxRuns}`;
      }
      const interval = readNumber(scheduleIntervalInput, 30, 1);
      return `每 ${interval} 分钟${maxRuns}`;
    }
    const runAtText = scheduleRunAtInput.value ? scheduleRunAtInput.value.replace('T', ' ') : '未设置时间';
    return `定时任务，${runAtText}`;
  }

  function renderConfigStatus() {
    const hasTask = Boolean(selectedTaskId);
    configActiveTaskId.textContent = hasTask ? selectedTaskId : '新配置';
    configEditMode.textContent = hasTask ? '编辑已有配置' : '新建配置';
    configDirtyState.textContent = isDirty ? '未保存' : '已保存';
    configDirtyState.style.color = isDirty ? 'var(--accent-warning)' : 'var(--accent-success)';
    configSchedulePreview.textContent = scheduleSummaryText();
    configLastAction.textContent = `最近操作：${lastActionText}`;
  }

  function markDirty(reason = '配置已修改') {
    if (suppressDirtyTracking) return;
    isDirty = true;
    lastActionText = `${reason} (${nowText()})`;
    renderConfigStatus();
  }

  function markSaved(reason: string) {
    isDirty = false;
    lastActionText = `${reason} (${nowText()})`;
    renderConfigStatus();
  }

  function withSilentFormApply(apply: () => void) {
    suppressDirtyTracking = true;
    try {
      apply();
    } finally {
      suppressDirtyTracking = false;
      renderConfigStatus();
    }
  }

  function readNumber(input: HTMLInputElement, fallback: number, min = 0) {
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.floor(raw));
  }

  function updateScheduleFields() {
    const mode = String(scheduleTypeSelect.value || 'immediate');
    const periodicType = String(schedulePeriodicTypeSelect.value || 'interval');
    const periodic = mode === 'periodic';
    const scheduled = mode === 'scheduled';
    schedulePeriodicTypeWrap.style.display = periodic ? '' : 'none';
    scheduleIntervalWrap.style.display = periodic && periodicType === 'interval' ? '' : 'none';
    scheduleRunAtWrap.style.display = scheduled || (periodic && periodicType !== 'interval') ? '' : 'none';
    scheduleMaxRunsInput.disabled = mode === 'immediate' || mode === 'scheduled';
    if (mode === 'immediate' || mode === 'scheduled') {
      scheduleMaxRunsInput.value = '';
    }
    renderConfigStatus();
  }

  function updateLikeKeywordsState() {
    likeKeywordsInput.disabled = false;
    likeKeywordsInput.style.opacity = autoLikeCb.checked ? '1' : '0.9';
    maxLikesInput.disabled = false;
    maxLikesInput.style.opacity = autoLikeCb.checked ? '1' : '0.9';
  }

  function ensureAccountOption(profileId: string) {
    const id = String(profileId || '').trim();
    if (!id) return;
    const found = Array.from(accountSelect.options).some((opt) => String(opt.value || '') === id);
    if (found) return;
    const opt = createEl('option', { value: id }, [`${id} (非活动账号)`]) as HTMLOptionElement;
    accountSelect.appendChild(opt);
  }

  function buildDraftConfig() {
    return {
      keyword: keywordInput.value.trim(),
      target: readNumber(targetInput, DEFAULT_MAX_NOTES, 1),
      env: envSelect.value as 'debug' | 'prod',
      fetchBody: fetchBodyCb.checked,
      fetchComments: fetchCommentsCb.checked,
      maxComments: readNumber(maxCommentsInput, 0),
      autoLike: autoLikeCb.checked,
      likeKeywords: likeKeywordsInput.value.trim(),
      maxLikes: readNumber(maxLikesInput, 0),
      headless: headlessCb.checked,
      dryRun: dryRunCb.checked,
      lastProfileId: accountSelect.value || undefined,
    };
  }

  function queueDraftSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await ctx.api.configSaveLast(buildDraftConfig());
      } catch {
        // keep UI workflow running even if draft persistence fails
      }
    }, 400);
  }

  function toTaskNameFallback() {
    const keyword = keywordInput.value.trim();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return keyword ? `${keyword}-${stamp}` : `xhs-task-${stamp}`;
  }

  function buildSchedulePayload(withId: string): SchedulePayload {
    const maxRunsRaw = scheduleMaxRunsInput.value.trim();
    const maxRuns = maxRunsRaw ? Math.max(1, Number(maxRunsRaw) || 1) : null;
    const scheduleMode = String(scheduleTypeSelect.value || 'immediate').trim();
    const periodicType = String(schedulePeriodicTypeSelect.value || 'interval').trim();
    const runAtValue = String(scheduleRunAtInput.value || '').trim();
    let scheduleType: ScheduleTask['scheduleType'] = 'once';
    let runAt = toIsoOrNull(runAtValue);
    let normalizedMaxRuns: number | null = maxRuns;
    if (scheduleMode === 'immediate') {
      scheduleType = 'once';
      runAt = new Date().toISOString();
      normalizedMaxRuns = 1;
    } else if (scheduleMode === 'periodic') {
      if (periodicType === 'daily' || periodicType === 'weekly') {
        scheduleType = periodicType;
      } else {
        scheduleType = 'interval';
        runAt = null;
      }
    } else {
      scheduleType = 'once';
      normalizedMaxRuns = 1;
    }
    const argv = {
      profile: accountSelect.value.trim(),
      keyword: keywordInput.value.trim(),
      'max-notes': readNumber(targetInput, DEFAULT_MAX_NOTES, 1),
      env: envSelect.value || 'debug',
      'fetch-body': fetchBodyCb.checked,
      'do-comments': fetchCommentsCb.checked,
      'persist-comments': fetchCommentsCb.checked,
      'max-comments': readNumber(maxCommentsInput, 0),
      'do-likes': autoLikeCb.checked,
      'like-keywords': asCsvText(likeKeywordsInput.value),
      'max-likes': readNumber(maxLikesInput, 0),
      headless: headlessCb.checked,
      'dry-run': dryRunCb.checked,
    };
    return {
      id: String(withId || '').trim(),
      name: taskNameInput.value.trim() || toTaskNameFallback(),
      enabled: taskEnabledCb.checked,
      commandType: 'xhs-unified',
      scheduleType,
      intervalMinutes: readNumber(scheduleIntervalInput, 30, 1),
      runAt,
      maxRuns: normalizedMaxRuns,
      argv,
    };
  }

  async function invokeSchedule(input: Record<string, any>) {
    if (typeof ctx.api?.scheduleInvoke !== 'function') {
      throw new Error('scheduleInvoke unavailable');
    }
    const ret = await ctx.api.scheduleInvoke(input);
    if (!ret?.ok) {
      const reason = String(ret?.error || 'schedule command failed').trim();
      throw new Error(reason || 'schedule command failed');
    }
    return ret?.json ?? ret;
  }

  async function invokeTaskRunEphemeral(input: Record<string, any>) {
    if (typeof ctx.api?.taskRunEphemeral !== 'function') {
      throw new Error('taskRunEphemeral unavailable');
    }
    const ret = await ctx.api.taskRunEphemeral(input);
    if (!ret?.ok) {
      const reason = String(ret?.error || 'run ephemeral failed').trim();
      throw new Error(reason || 'run ephemeral failed');
    }
    return ret;
  }

  function applyTaskToForm(task: ScheduleTask) {
    withSilentFormApply(() => {
      selectedTaskId = task.id;
      if (ctx && typeof ctx === 'object') {
        ctx.activeTaskConfigId = task.id;
      }
      taskConfigSelect.value = task.id;
      taskNameInput.value = task.name || '';
      taskEnabledCb.checked = task.enabled !== false;
      scheduleTypeSelect.value = task.scheduleType;
      if (task.scheduleType === 'interval') {
        scheduleTypeSelect.value = 'periodic';
        schedulePeriodicTypeSelect.value = 'interval';
      } else if (task.scheduleType === 'daily' || task.scheduleType === 'weekly') {
        scheduleTypeSelect.value = 'periodic';
        schedulePeriodicTypeSelect.value = task.scheduleType;
      } else {
        scheduleTypeSelect.value = 'scheduled';
        schedulePeriodicTypeSelect.value = 'interval';
      }
      scheduleIntervalInput.value = String(task.intervalMinutes || 30);
      scheduleRunAtInput.value = toLocalDatetimeValue(task.runAt);
      scheduleMaxRunsInput.value = task.maxRuns ? String(task.maxRuns) : '';

      const profileId = String(task.commandArgv?.profile || '').trim();
      ensureAccountOption(profileId);
      if (profileId) accountSelect.value = profileId;
      keywordInput.value = String(task.commandArgv?.keyword || task.commandArgv?.k || '');
      targetInput.value = String(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? DEFAULT_MAX_NOTES);
      envSelect.value = String(task.commandArgv?.env || 'debug');
      fetchBodyCb.checked = task.commandArgv?.['fetch-body'] !== false;
      fetchCommentsCb.checked = task.commandArgv?.['do-comments'] !== false;
      maxCommentsInput.value = String(task.commandArgv?.['max-comments'] ?? 0);
      autoLikeCb.checked = task.commandArgv?.['do-likes'] === true;
      likeKeywordsInput.value = asCsvText(task.commandArgv?.['like-keywords']);
      maxLikesInput.value = String(task.commandArgv?.['max-likes'] ?? 0);
      headlessCb.checked = task.commandArgv?.headless === true;
      dryRunCb.checked = task.commandArgv?.['dry-run'] === true;

      updateScheduleFields();
      updateLikeKeywordsState();
      queueDraftSave();
    });
    markSaved(`已加载配置 ${task.id}`);
  }

  function renderTaskSelectOptions(preferredTaskId = '') {
    const targetId = String(preferredTaskId || selectedTaskId || '').trim();
    taskConfigSelect.innerHTML = '';
    if (taskRows.length === 0) {
      taskConfigSelect.appendChild(createEl('option', { value: '' }, ['暂无配置任务']) as HTMLOptionElement);
      taskConfigSelect.value = '';
      selectedTaskId = '';
      renderConfigStatus();
      return;
    }
    for (const row of taskRows) {
      const label = `${row.name || row.id} (${row.id})`;
      taskConfigSelect.appendChild(createEl('option', { value: row.id }, [label]) as HTMLOptionElement);
    }
    const fallbackLatest = pickLatestTask(taskRows);
    const selected = targetId && taskRows.some((row) => row.id === targetId)
      ? targetId
      : String(fallbackLatest?.id || '');
    if (selected) {
      taskConfigSelect.value = selected;
      const row = taskRows.find((item) => item.id === selected);
      if (row) applyTaskToForm(row);
    }
  }

  async function loadLegacyDraftIfNeeded() {
    if (loadedFromLegacy) return;
    loadedFromLegacy = true;
    try {
      const config = await ctx.api.configLoadLast();
      if (!config) return;
      withSilentFormApply(() => {
        selectedTaskId = '';
        taskNameInput.value = String(config.taskName || '').trim();
        keywordInput.value = config.keyword || '';
        targetInput.value = String(config.target || DEFAULT_MAX_NOTES);
        envSelect.value = config.env || 'prod';
        fetchBodyCb.checked = config.fetchBody !== false;
        fetchCommentsCb.checked = config.fetchComments !== false;
        maxCommentsInput.value = String(config.maxComments ?? 0);
        autoLikeCb.checked = config.autoLike === true;
        likeKeywordsInput.value = asCsvText(config.likeKeywords);
        maxLikesInput.value = String(config.maxLikes ?? 0);
        headlessCb.checked = config.headless === true;
        dryRunCb.checked = config.dryRun === true;
        const legacyScheduleType = String(config.scheduleType || 'immediate').trim();
        if (legacyScheduleType === 'interval') {
          scheduleTypeSelect.value = 'periodic';
          schedulePeriodicTypeSelect.value = 'interval';
        } else if (legacyScheduleType === 'daily' || legacyScheduleType === 'weekly') {
          scheduleTypeSelect.value = 'periodic';
          schedulePeriodicTypeSelect.value = legacyScheduleType;
        } else if (legacyScheduleType === 'scheduled') {
          scheduleTypeSelect.value = 'scheduled';
          schedulePeriodicTypeSelect.value = 'interval';
        } else {
          scheduleTypeSelect.value = 'immediate';
          schedulePeriodicTypeSelect.value = 'interval';
        }
        scheduleIntervalInput.value = String(config.intervalMinutes || 30);
        scheduleRunAtInput.value = toLocalDatetimeValue(config.runAt || null);
        scheduleMaxRunsInput.value = config.maxRuns ? String(config.maxRuns) : '';
        const preferredProfileId = String(config.lastProfileId || '').trim();
        ensureAccountOption(preferredProfileId);
        if (preferredProfileId) {
          accountSelect.value = preferredProfileId;
        }
        updateScheduleFields();
        updateLikeKeywordsState();
      });
      markSaved('已加载上次草稿');
    } catch (err) {
      console.error('Failed to load last config:', err);
    }
  }

  async function refreshTaskList(preferredTaskId = '') {
    try {
      const out = await invokeSchedule({ action: 'list' });
      taskRows = parseTaskRows(out).filter((row) => row.commandType === 'xhs-unified');
      renderTaskSelectOptions(preferredTaskId);
      if (taskRows.length === 0) {
        await loadLegacyDraftIfNeeded();
      }
    } catch (err) {
      console.error('Failed to list schedule tasks:', err);
      taskRows = [];
      renderTaskSelectOptions('');
      await loadLegacyDraftIfNeeded();
    }
  }

  async function loadAccounts() {
    try {
      accountRows = await listAccountProfiles(ctx.api);
      const validRows = accountRows.filter((row) => row.valid);
      const current = String(accountSelect.value || '').trim();
      accountSelect.innerHTML = '<option value="">请选择账户...</option>';
      for (const row of validRows) {
        const profileId = String(row.profileId || '');
        const label = row.alias ? `${row.alias} (${profileId})` : (row.name || profileId);
        accountSelect.appendChild(createEl('option', { value: profileId }, [label]) as HTMLOptionElement);
      }
      if (current) ensureAccountOption(current);
      if (current) accountSelect.value = current;
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }

  async function persistTask(mode: 'add' | 'update') {
    const payload = buildSchedulePayload(mode === 'update' ? selectedTaskId : '');
    if (mode === 'update' && !payload.id) {
      return persistTask('add');
    }
    const out = await invokeSchedule({
      action: 'save',
      payload: mode === 'add' ? { ...payload, id: '' } : payload,
    });
    const taskId = String(out?.task?.id || payload.id || '').trim();
    if (!taskId) return '';
    selectedTaskId = taskId;
    if (ctx && typeof ctx === 'object') {
      ctx.activeTaskConfigId = taskId;
    }
    await refreshTaskList(taskId);
    queueDraftSave();
    return taskId;
  }

  async function saveCurrentConfig() {
    try {
      const id = selectedTaskId
        ? await persistTask('update')
        : await persistTask('add');
      if (id && typeof ctx.setStatus === 'function') {
        ctx.setStatus(`saved: ${id}`);
      }
      if (id) {
        markSaved(`已保存配置 ${id}`);
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
        markSaved(`已另存为 ${id}`);
      }
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function saveAndOpenScheduler() {
    try {
      const id = selectedTaskId
        ? await persistTask('update')
        : await persistTask('add');
      if (!id) return;
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`saved: ${id}`);
      }
      markSaved(`已保存并跳转任务页 ${id}`);
      if (typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab('scheduler');
      }
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function runCurrentConfig() {
    startBtn.disabled = true;
    const prevText = startBtn.textContent;
    startBtn.textContent = '执行中...';
    try {
      const taskId = selectedTaskId
        ? await persistTask('update')
        : await persistTask('add');
      if (!taskId) return;
      const out = await invokeSchedule({ action: 'run', taskId, timeoutMs: 0 });
      const runId = String(out?.result?.runResult?.lastRunId || '').trim();
      ctx.xhsCurrentRun = {
        runId: runId || null,
        taskId,
        profileId: accountSelect.value || '',
        keyword: keywordInput.value.trim(),
        target: readNumber(targetInput, DEFAULT_MAX_NOTES, 1),
        startedAt: new Date().toISOString(),
      };
      ctx.activeRunId = runId || ctx.activeRunId || null;
      if (typeof ctx.appendLog === 'function') {
        ctx.appendLog(`[ui] schedule run task=${taskId} runId=${runId || '-'}`);
      }
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`running: ${taskId}`);
      }
      markSaved(`执行中: ${taskId}`);
      if (typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab('dashboard');
      }
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = prevText || '执行当前配置';
    }
  }

  async function runNowWithoutSave() {
    startNowBtn.disabled = true;
    const prevText = startNowBtn.textContent;
    startNowBtn.textContent = '执行中...';
    try {
      const payload = buildSchedulePayload(selectedTaskId || '');
      const ret = await invokeTaskRunEphemeral({
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
      ctx.activeRunId = runId || ctx.activeRunId || null;
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus('started: xhs-unified');
      }
      markDirty('已立即执行（未保存）');
      if (typeof ctx.setActiveTab === 'function') {
        ctx.setActiveTab('dashboard');
      }
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    } finally {
      startNowBtn.disabled = false;
      startNowBtn.textContent = prevText || '立即执行(不保存)';
    }
  }

  async function openSchedulerEditor() {
    if (selectedTaskId && ctx && typeof ctx === 'object') {
      ctx.activeTaskConfigId = selectedTaskId;
    }
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('scheduler');
    }
  }

  async function exportConfig() {
    try {
      const config = buildDraftConfig();
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
        withSilentFormApply(() => {
          taskNameInput.value = String(config.taskName || config.name || '').trim();
          keywordInput.value = String(config.keyword || '');
          targetInput.value = String(config.target || config.maxNotes || DEFAULT_MAX_NOTES);
          envSelect.value = String(config.env || 'prod');
          fetchBodyCb.checked = config.fetchBody !== false;
          fetchCommentsCb.checked = config.fetchComments !== false;
          maxCommentsInput.value = String(config.maxComments ?? 0);
          autoLikeCb.checked = config.autoLike === true;
          likeKeywordsInput.value = asCsvText(config.likeKeywords);
          maxLikesInput.value = String(config.maxLikes ?? 0);
          headlessCb.checked = config.headless === true;
          dryRunCb.checked = config.dryRun === true;
          const legacyScheduleType = String(config.scheduleType || 'immediate').trim();
          if (legacyScheduleType === 'interval') {
            scheduleTypeSelect.value = 'periodic';
            schedulePeriodicTypeSelect.value = 'interval';
          } else if (legacyScheduleType === 'daily' || legacyScheduleType === 'weekly') {
            scheduleTypeSelect.value = 'periodic';
            schedulePeriodicTypeSelect.value = legacyScheduleType;
          } else if (legacyScheduleType === 'scheduled') {
            scheduleTypeSelect.value = 'scheduled';
            schedulePeriodicTypeSelect.value = 'interval';
          } else {
            scheduleTypeSelect.value = 'immediate';
            schedulePeriodicTypeSelect.value = 'interval';
          }
          scheduleIntervalInput.value = String(config.intervalMinutes || 30);
          scheduleRunAtInput.value = toLocalDatetimeValue(config.runAt || null);
          scheduleMaxRunsInput.value = config.maxRuns ? String(config.maxRuns) : '';
          const profileId = String(config.lastProfileId || config.profile || '').trim();
          if (profileId) {
            ensureAccountOption(profileId);
            accountSelect.value = profileId;
          }
          selectedTaskId = '';
          taskConfigSelect.value = '';
          updateScheduleFields();
          updateLikeKeywordsState();
        });
        markDirty('已导入配置，待保存');
        queueDraftSave();
        alert('配置已导入');
      } catch (err: any) {
        alert(`导入失败: ${err?.message || String(err)}`);
      }
    };
    input.click();
  }

  taskConfigSelect.addEventListener('change', () => {
    const taskId = String(taskConfigSelect.value || '').trim();
    const row = taskRows.find((item) => item.id === taskId);
    if (row) {
      applyTaskToForm(row);
    }
  });
  scheduleTypeSelect.addEventListener('change', () => {
    updateScheduleFields();
    markDirty();
    queueDraftSave();
  });
  schedulePeriodicTypeSelect.addEventListener('change', () => {
    updateScheduleFields();
    markDirty();
    queueDraftSave();
  });
  autoLikeCb.onchange = () => {
    updateLikeKeywordsState();
    markDirty();
    queueDraftSave();
  };

  taskConfigRefreshBtn.onclick = () => {
    void refreshTaskList(selectedTaskId);
  };
  taskOpenSchedulerBtn.onclick = () => {
    void openSchedulerEditor();
  };
  importBtn.onclick = () => {
    void importConfig();
  };
  exportBtn.onclick = () => {
    void exportConfig();
  };
  saveCurrentBtn.onclick = () => {
    void saveCurrentConfig();
  };
  saveNewBtn.onclick = () => {
    void saveAsNewConfig();
  };
  saveOpenSchedulerBtn.onclick = () => {
    void saveAndOpenScheduler();
  };
  startBtn.onclick = () => {
    void runCurrentConfig();
  };
  startNowBtn.onclick = () => {
    void runNowWithoutSave();
  };

  [
    taskNameInput,
    taskEnabledCb,
    keywordInput,
    targetInput,
    envSelect,
    accountSelect,
    scheduleIntervalInput,
    scheduleRunAtInput,
    scheduleMaxRunsInput,
    fetchBodyCb,
    fetchCommentsCb,
    maxCommentsInput,
    likeKeywordsInput,
    maxLikesInput,
    headlessCb,
    dryRunCb,
  ].forEach((el) => {
    el.onchange = () => {
      markDirty();
      queueDraftSave();
    };
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') {
      (el as HTMLInputElement).oninput = () => {
        markDirty();
        queueDraftSave();
      };
    }
  });

  scheduleTypeSelect.value = 'immediate';
  schedulePeriodicTypeSelect.value = 'interval';
  scheduleRunAtInput.value = '';
  updateScheduleFields();
  updateLikeKeywordsState();
  renderConfigStatus();
  void loadAccounts();
  void refreshTaskList(selectedTaskId);
}
