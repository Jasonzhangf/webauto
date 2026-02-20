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
          <label>循环模式</label>
          <select id="schedule-type-select" style="width: 140px;">
            <option value="interval">循环间隔</option>
            <option value="once">一次性</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
        </div>
        <div id="schedule-interval-wrap">
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

  const actionRow = createEl('div', { className: 'bento-grid', style: 'margin-top: var(--gap);' });
  const actionCard = createEl('div', { className: 'bento-cell highlight' });
  actionCard.innerHTML = `
    <div style="display:flex; justify-content:center; flex-wrap: wrap; gap: 12px;">
      <button id="save-current-btn" class="secondary">保存当前配置</button>
      <button id="save-new-btn" class="secondary">另存为新配置</button>
      <button id="start-btn" style="padding: 12px 44px; font-size: 15px;">执行当前配置</button>
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
  const startBtn = root.querySelector('#start-btn') as HTMLButtonElement;

  let accountRows: UiAccountProfile[] = [];
  let taskRows: ScheduleTask[] = [];
  let selectedTaskId = String(ctx?.activeTaskConfigId || '').trim();
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let loadedFromLegacy = false;

  function readNumber(input: HTMLInputElement, fallback: number, min = 0) {
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.floor(raw));
  }

  function updateScheduleFields() {
    const mode = String(scheduleTypeSelect.value || 'interval');
    const useRunAt = mode === 'once' || mode === 'daily' || mode === 'weekly';
    scheduleRunAtWrap.style.display = useRunAt ? '' : 'none';
    scheduleIntervalWrap.style.display = useRunAt ? 'none' : '';
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
      scheduleType: String(scheduleTypeSelect.value || 'interval') as ScheduleTask['scheduleType'],
      intervalMinutes: readNumber(scheduleIntervalInput, 30, 1),
      runAt: toIsoOrNull(scheduleRunAtInput.value),
      maxRuns,
      argv,
    };
  }

  function validateSchedulePayload(payload: SchedulePayload): string | null {
    if (!payload.argv.profile) return '请选择账户';
    if (!payload.argv.keyword) return '请输入关键词';
    if (payload.scheduleType === 'once' || payload.scheduleType === 'daily' || payload.scheduleType === 'weekly') {
      if (!payload.runAt) return `${payload.scheduleType} 任务需要设置执行时间`;
    }
    return null;
  }

  function buildSaveArgs(payload: SchedulePayload, mode: 'add' | 'update'): string[] {
    const args = mode === 'update' ? ['update', payload.id] : ['add'];
    args.push('--name', payload.name);
    args.push('--enabled', String(payload.enabled));
    args.push('--schedule-type', payload.scheduleType);
    if (payload.scheduleType === 'once' || payload.scheduleType === 'daily' || payload.scheduleType === 'weekly') {
      args.push('--run-at', String(payload.runAt || ''));
    } else {
      args.push('--interval-minutes', String(payload.intervalMinutes));
    }
    args.push('--max-runs', payload.maxRuns === null ? '0' : String(payload.maxRuns));
    args.push('--argv-json', JSON.stringify(payload.argv));
    return args;
  }

  async function runScheduleJson(args: string[], timeoutMs = 60_000) {
    const script = ctx.api.pathJoin('apps', 'webauto', 'entry', 'schedule.mjs');
    const ret = await ctx.api.cmdRunJson({
      title: `schedule ${args.join(' ')}`,
      cwd: '',
      args: [script, ...args, '--json'],
      timeoutMs,
    });
    if (!ret?.ok) {
      const reason = String(ret?.error || ret?.stderr || ret?.stdout || 'unknown_error').trim();
      throw new Error(reason || 'schedule command failed');
    }
    return ret.json || {};
  }

  function applyTaskToForm(task: ScheduleTask) {
    selectedTaskId = task.id;
    if (ctx && typeof ctx === 'object') {
      ctx.activeTaskConfigId = task.id;
    }
    taskConfigSelect.value = task.id;
    taskNameInput.value = task.name || '';
    taskEnabledCb.checked = task.enabled !== false;
    scheduleTypeSelect.value = task.scheduleType;
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
  }

  function renderTaskSelectOptions(preferredTaskId = '') {
    const targetId = String(preferredTaskId || selectedTaskId || '').trim();
    taskConfigSelect.innerHTML = '';
    if (taskRows.length === 0) {
      taskConfigSelect.appendChild(createEl('option', { value: '' }, ['暂无配置任务']) as HTMLOptionElement);
      taskConfigSelect.value = '';
      selectedTaskId = '';
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
      scheduleTypeSelect.value = String(config.scheduleType || 'interval');
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
    } catch (err) {
      console.error('Failed to load last config:', err);
    }
  }

  async function refreshTaskList(preferredTaskId = '') {
    try {
      const out = await runScheduleJson(['list']);
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
    const validationError = validateSchedulePayload(payload);
    if (validationError) {
      alert(validationError);
      return '';
    }
    if (mode === 'update' && !payload.id) {
      return persistTask('add');
    }
    const out = await runScheduleJson(buildSaveArgs(payload, mode));
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
      const out = await runScheduleJson(['run', taskId], 0);
      const runId = String(out?.result?.runResult?.lastRunId || '').trim();
      ctx.xhsCurrentRun = {
        runId: runId || null,
        taskId,
        profileId: accountSelect.value || '',
        keyword: keywordInput.value.trim(),
        target: readNumber(targetInput, DEFAULT_MAX_NOTES, 1),
        startedAt: new Date().toISOString(),
      };
      if (typeof ctx.appendLog === 'function') {
        ctx.appendLog(`[ui] schedule run task=${taskId} runId=${runId || '-'}`);
      }
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`running: ${taskId}`);
      }
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
        scheduleTypeSelect.value = String(config.scheduleType || 'interval');
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
    queueDraftSave();
  });
  autoLikeCb.onchange = () => {
    updateLikeKeywordsState();
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
  startBtn.onclick = () => {
    void runCurrentConfig();
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
    el.onchange = queueDraftSave;
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') {
      (el as HTMLInputElement).oninput = queueDraftSave;
    }
  });

  updateScheduleFields();
  updateLikeKeywordsState();
  void loadAccounts();
  void refreshTaskList(selectedTaskId);
}
