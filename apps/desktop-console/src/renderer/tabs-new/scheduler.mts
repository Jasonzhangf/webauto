import { createEl } from '../ui-components.mts';
import {
  parseTaskRows,
  toIsoOrNull,
  toLocalDatetimeValue,
  type ScheduleTask,
  getTasksForPlatform,
  getPlatformForCommandType,
} from './schedule-task-bridge.mts';

export function renderSchedulerPanel(root: HTMLElement, ctx: any) {
  root.innerHTML = '';

  const pageIndicator = createEl('div', { className: 'page-indicator' }, [
    '当前: ',
    createEl('span', {}, ['定时任务']),
    ' → 配置并定时执行多条任务',
  ]);
  root.appendChild(pageIndicator);

  const toolbar = createEl('div', { className: 'bento-grid', style: 'margin-bottom: var(--gap);' });
  const toolbarCell = createEl('div', { className: 'bento-cell' });
  toolbarCell.innerHTML = `
    <div class="bento-title">调度控制</div>
    <div class="row">
      <button id="scheduler-refresh-btn" class="secondary">刷新列表</button>
      <button id="scheduler-run-due-btn" class="secondary">立即执行到点任务</button>
      <button id="scheduler-export-all-btn" class="secondary">导出全部</button>
      <button id="scheduler-import-btn" class="secondary">导入</button>
    </div>
    <div class="row" style="margin-top: 8px; align-items: center;">
      <span class="muted">当前配置: <strong id="scheduler-active-task-id">-</strong></span>
      <button id="scheduler-open-config-btn" class="secondary">打开配置页</button>
    </div>
    <div class="row" style="margin-top: 8px; align-items: end;">
      <div>
        <label>Daemon 间隔(秒)</label>
        <input id="scheduler-daemon-interval" type="number" min="5" value="30" style="width: 120px;" />
      </div>
      <button id="scheduler-daemon-start-btn">启动 Daemon</button>
      <button id="scheduler-daemon-stop-btn" class="danger">停止 Daemon</button>
      <span id="scheduler-daemon-status" class="muted">daemon: 未启动</span>
    </div>
  `;
  toolbar.appendChild(toolbarCell);
  root.appendChild(toolbar);

  const grid = createEl('div', { className: 'bento-grid bento-sidebar' });
  const formCell = createEl('div', { className: 'bento-cell' });
  formCell.innerHTML = `
    <div class="bento-title">任务编辑</div>
    <input id="scheduler-editing-id" type="hidden" />
    <div class="row">
      <div>
        <label>平台</label>
        <select id="scheduler-platform" style="width: 140px;">
          <option value="xiaohongshu">📕 小红书</option>
          <option value="weibo">📰 微博</option>
          <option value="1688">🛒 1688</option>
        </select>
      </div>
      <div>
        <label>任务类型</label>
        <select id="scheduler-task-type" style="width: 160px;">
        </select>
      </div>
    </div>
    <div class="row">
      <div>
        <label>任务名</label>
        <input id="scheduler-name" placeholder="例如：deepseek-每30分钟" style="width: 240px;" />
      </div>
      <label style="display:flex; align-items:center; gap:8px; margin-top: 22px;">
        <input id="scheduler-enabled" type="checkbox" checked />
        <span>启用</span>
      </label>
    </div>
    <div class="row">
      <div>
        <label>调度类型</label>
        <select id="scheduler-type" style="width: 140px;">
          <option value="interval">循环间隔</option>
          <option value="once">一次性</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
        </select>
      </div>
      <div id="scheduler-interval-wrap">
        <label>间隔分钟</label>
        <input id="scheduler-interval" type="number" min="1" value="30" style="width: 120px;" />
      </div>
      <div id="scheduler-runat-wrap" style="display:none;">
        <label>锚点时间</label>
        <input id="scheduler-runat" type="datetime-local" style="width: 220px;" />
      </div>
      <div>
        <label>最大执行次数</label>
        <input id="scheduler-max-runs" type="number" min="1" placeholder="不限" style="width: 120px;" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>Profile</label>
        <input id="scheduler-profile" placeholder="xiaohongshu-batch-1" style="width: 220px;" />
      </div>
      <div>
        <label>关键词</label>
        <input id="scheduler-keyword" placeholder="deepseek新模型" style="width: 220px;" />
      </div>
    </div>
    <div class="row" id="scheduler-user-id-wrap" style="display:none;">
      <div>
        <label>微博用户ID (monitor 必填)</label>
        <input id="scheduler-user-id" placeholder="例如: 1234567890" style="width: 220px;" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>目标帖子数</label>
        <input id="scheduler-max-notes" type="number" min="1" value="50" style="width: 120px;" />
      </div>
      <div>
        <label>环境</label>
        <select id="scheduler-env" style="width: 120px;">
          <option value="debug">debug</option>
          <option value="prod">prod</option>
        </select>
      </div>
    </div>
    <div class="row">
      <label style="display:flex; align-items:center; gap:8px;">
        <input id="scheduler-comments" type="checkbox" checked />
        <span>抓评论</span>
      </label>
      <label style="display:flex; align-items:center; gap:8px;">
        <input id="scheduler-likes" type="checkbox" />
        <span>点赞</span>
      </label>
      <label style="display:flex; align-items:center; gap:8px;">
        <input id="scheduler-headless" type="checkbox" />
        <span>headless</span>
      </label>
      <label style="display:flex; align-items:center; gap:8px;">
        <input id="scheduler-dryrun" type="checkbox" />
        <span>dry-run</span>
      </label>
    </div>
    <div>
      <label>点赞关键词（逗号分隔）</label>
      <input id="scheduler-like-keywords" placeholder="真牛逼,购买链接" />
    </div>
    <div class="btn-group" style="margin-top: var(--gap);">
      <button id="scheduler-save-btn" style="flex:1;">保存任务</button>
      <button id="scheduler-reset-btn" class="secondary" style="flex:1;">清空表单</button>
    </div>
  `;
  grid.appendChild(formCell);

  const listCell = createEl('div', { className: 'bento-cell' });
  listCell.innerHTML = `
    <div class="bento-title">任务列表</div>
    <div id="scheduler-list"></div>
  `;
  grid.appendChild(listCell);
  root.appendChild(grid);

  const refreshBtn = root.querySelector('#scheduler-refresh-btn') as HTMLButtonElement;
  const runDueBtn = root.querySelector('#scheduler-run-due-btn') as HTMLButtonElement;
  const exportAllBtn = root.querySelector('#scheduler-export-all-btn') as HTMLButtonElement;
  const importBtn = root.querySelector('#scheduler-import-btn') as HTMLButtonElement;
  const openConfigBtn = root.querySelector('#scheduler-open-config-btn') as HTMLButtonElement;
  const daemonStartBtn = root.querySelector('#scheduler-daemon-start-btn') as HTMLButtonElement;
  const daemonStopBtn = root.querySelector('#scheduler-daemon-stop-btn') as HTMLButtonElement;
  const daemonIntervalInput = root.querySelector('#scheduler-daemon-interval') as HTMLInputElement;
  const daemonStatus = root.querySelector('#scheduler-daemon-status') as HTMLSpanElement;
  const activeTaskIdText = root.querySelector('#scheduler-active-task-id') as HTMLElement;
  const listEl = root.querySelector('#scheduler-list') as HTMLDivElement;

  const platformSelect = root.querySelector('#scheduler-platform') as HTMLSelectElement;
  const taskTypeSelect = root.querySelector('#scheduler-task-type') as HTMLSelectElement;
  const editingIdInput = root.querySelector('#scheduler-editing-id') as HTMLInputElement;
  const nameInput = root.querySelector('#scheduler-name') as HTMLInputElement;
  const enabledInput = root.querySelector('#scheduler-enabled') as HTMLInputElement;
  const typeSelect = root.querySelector('#scheduler-type') as HTMLSelectElement;
  const intervalWrap = root.querySelector('#scheduler-interval-wrap') as HTMLDivElement;
  const runAtWrap = root.querySelector('#scheduler-runat-wrap') as HTMLDivElement;
  const intervalInput = root.querySelector('#scheduler-interval') as HTMLInputElement;
  const runAtInput = root.querySelector('#scheduler-runat') as HTMLInputElement;
  const maxRunsInput = root.querySelector('#scheduler-max-runs') as HTMLInputElement;
  const profileInput = root.querySelector('#scheduler-profile') as HTMLInputElement;
  const keywordInput = root.querySelector('#scheduler-keyword') as HTMLInputElement;
  const userIdWrap = root.querySelector('#scheduler-user-id-wrap') as HTMLDivElement;
  const userIdInput = root.querySelector('#scheduler-user-id') as HTMLInputElement;
  const maxNotesInput = root.querySelector('#scheduler-max-notes') as HTMLInputElement;
  const envSelect = root.querySelector('#scheduler-env') as HTMLSelectElement;
  const commentsInput = root.querySelector('#scheduler-comments') as HTMLInputElement;
  const likesInput = root.querySelector('#scheduler-likes') as HTMLInputElement;
  const headlessInput = root.querySelector('#scheduler-headless') as HTMLInputElement;
  const dryRunInput = root.querySelector('#scheduler-dryrun') as HTMLInputElement;
  const likeKeywordsInput = root.querySelector('#scheduler-like-keywords') as HTMLInputElement;
  const saveBtn = root.querySelector('#scheduler-save-btn') as HTMLButtonElement;
  const resetBtn = root.querySelector('#scheduler-reset-btn') as HTMLButtonElement;

  let tasks: ScheduleTask[] = [];
  let daemonRunId = '';
  let unsubscribeCmd: (() => void) | null = null;
  let pendingFocusTaskId = String(ctx?.activeTaskConfigId || '').trim();

  function setDaemonStatus(text: string) {
    daemonStatus.textContent = text;
  }

  function setActiveTaskContext(taskId: string) {
    const id = String(taskId || '').trim();
    activeTaskIdText.textContent = id || '-';
    if (ctx && typeof ctx === 'object') {
      ctx.activeTaskConfigId = id;
    }
  }

  function openConfigTab(taskId: string) {
    setActiveTaskContext(taskId);
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('config');
    }
  }

  function updateTypeFields() {
    const mode = typeSelect.value;
    const useRunAt = mode === 'once' || mode === 'daily' || mode === 'weekly';
    runAtWrap.style.display = useRunAt ? '' : 'none';
    intervalWrap.style.display = useRunAt ? 'none' : '';
  }

  function updateTaskTypeOptions() {
    const platform = platformSelect.value;
    const tasks = getTasksForPlatform(platform);
    taskTypeSelect.innerHTML = tasks
      .map(t => `<option value="${t.type}">${t.icon} ${t.label}</option>`)
      .join('');
    if (taskTypeSelect.options.length > 0) {
      taskTypeSelect.value = taskTypeSelect.options[0]?.value || '';
    }
    updatePlatformFields();
  }

  function updatePlatformFields() {
    const commandType = String(taskTypeSelect.value || '').trim();
    const isWeiboMonitor = commandType === 'weibo-monitor';
    userIdWrap.style.display = isWeiboMonitor ? '' : 'none';
  }

  function resetForm() {
    platformSelect.value = 'xiaohongshu';
    updateTaskTypeOptions();
    editingIdInput.value = '';
    nameInput.value = '';
    enabledInput.checked = true;
    typeSelect.value = 'interval';
    intervalInput.value = '30';
    runAtInput.value = '';
    maxRunsInput.value = '';
    profileInput.value = '';
    keywordInput.value = '';
    userIdInput.value = '';
    maxNotesInput.value = '50';
    envSelect.value = 'debug';
    commentsInput.checked = true;
    likesInput.checked = false;
    headlessInput.checked = false;
    dryRunInput.checked = false;
    likeKeywordsInput.value = '';
    setActiveTaskContext('');
    updatePlatformFields();
    updateTypeFields();
  }

  function readFormAsPayload() {
    const maxRunsRaw = maxRunsInput.value.trim();
    const maxRuns = maxRunsRaw
      ? Math.max(1, Number(maxRunsRaw) || 1)
      : null;
    const commandType = String(taskTypeSelect.value || 'xhs-unified').trim();
    const argv: Record<string, any> = {
      profile: profileInput.value.trim(),
      keyword: keywordInput.value.trim(),
      'max-notes': Number(maxNotesInput.value || 50) || 50,
      env: envSelect.value,
      'do-comments': commentsInput.checked,
      'do-likes': likesInput.checked,
      'like-keywords': likeKeywordsInput.value.trim(),
      headless: headlessInput.checked,
      'dry-run': dryRunInput.checked,
    };
    if (commandType.startsWith('weibo')) {
      argv['user-id'] = userIdInput.value.trim();
    }
    return {
      id: editingIdInput.value.trim(),
      name: nameInput.value.trim(),
      enabled: enabledInput.checked,
      commandType,
      scheduleType: typeSelect.value as ScheduleTask['scheduleType'],
      intervalMinutes: Number(intervalInput.value || 30) || 30,
      runAt: toIsoOrNull(runAtInput.value),
      maxRuns,
      argv,
    };
  }

  function applyTaskToForm(task: ScheduleTask) {
    pendingFocusTaskId = '';
    const platform = getPlatformForCommandType(String(task.commandType || 'xhs-unified'));
    platformSelect.value = platform;
    updateTaskTypeOptions();
    taskTypeSelect.value = String(task.commandType || taskTypeSelect.value || 'xhs-unified');
    editingIdInput.value = task.id;
    nameInput.value = task.name || '';
    enabledInput.checked = task.enabled !== false;
    typeSelect.value = task.scheduleType;
    intervalInput.value = String(task.intervalMinutes || 30);
    runAtInput.value = toLocalDatetimeValue(task.runAt);
    maxRunsInput.value = task.maxRuns ? String(task.maxRuns) : '';
    profileInput.value = String(task.commandArgv?.profile || '');
    keywordInput.value = String(task.commandArgv?.keyword || task.commandArgv?.k || '');
    userIdInput.value = String(task.commandArgv?.['user-id'] || task.commandArgv?.userId || '');
    maxNotesInput.value = String(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? 50);
    envSelect.value = String(task.commandArgv?.env || 'debug');
    commentsInput.checked = task.commandArgv?.['do-comments'] !== false;
    likesInput.checked = task.commandArgv?.['do-likes'] === true;
    headlessInput.checked = task.commandArgv?.headless === true;
    dryRunInput.checked = task.commandArgv?.['dry-run'] === true;
    likeKeywordsInput.value = String(task.commandArgv?.['like-keywords'] || '');
    setActiveTaskContext(task.id);
    updatePlatformFields();
    updateTypeFields();
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

  function downloadJson(fileName: string, payload: any) {
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderTaskList() {
    listEl.innerHTML = '';
    if (tasks.length === 0) {
      listEl.innerHTML = '<div class="muted" style="padding: 12px;">暂无任务</div>';
      return;
    }
    for (const task of tasks) {
      const card = createEl('div', {
        style: 'border:1px solid var(--border); border-radius:10px; padding:10px; margin-bottom:10px; background: var(--panel-soft);',
      });
      const scheduleText = task.scheduleType === 'once'
        ? `once @ ${task.runAt || '-'}`
        : task.scheduleType === 'daily'
          ? `daily @ ${task.runAt || '-'}`
          : task.scheduleType === 'weekly'
            ? `weekly @ ${task.runAt || '-'}`
            : `interval ${task.intervalMinutes}m`;
      const statusText = task.lastStatus
        ? `${task.lastStatus} / run=${task.runCount} / fail=${task.failCount}`
        : 'never run';

      const headRow = createEl('div', { style: 'display:flex; justify-content:space-between; gap:8px; margin-bottom:6px;' });
      headRow.appendChild(createEl('div', { style: 'font-weight:600;' }, [task.name || task.id]));
      headRow.appendChild(
        createEl(
          'span',
          { style: `font-size:12px; color:${task.enabled ? 'var(--accent-success)' : 'var(--accent-danger)'};` },
          [task.enabled ? 'enabled' : 'disabled'],
        ),
      );
      card.appendChild(headRow);
      card.appendChild(createEl('div', { className: 'muted', style: 'font-size:12px; margin-bottom:4px;' }, [`id=${task.id}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`schedule: ${scheduleText}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`maxRuns: ${task.maxRuns || 'unlimited'}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`nextRunAt: ${task.nextRunAt || '-'}`]));
      card.appendChild(createEl('div', { style: 'font-size:12px;' }, [`status: ${statusText}`]));

      const recent = (task.runHistory || []).slice(-5);
      if (recent.length > 0) {
        const recentRow = createEl('div', { style: 'font-size:12px;' }, ['recent: ']);
        for (const h of recent) {
          const icon = h.status === 'success' ? '✅' : '❌';
          const duration = h.durationMs ? `${Math.round(h.durationMs / 1000)}s` : '-';
          const badge = createEl('span', { title: `${h.timestamp} ${duration}` }, [icon]);
          recentRow.appendChild(badge);
          recentRow.appendChild(document.createTextNode(' '));
        }
        card.appendChild(recentRow);
      }

      if (task.lastError) {
        card.appendChild(createEl('div', { style: 'font-size:12px; color:var(--accent-danger);' }, [`error: ${task.lastError}`]));
      }
      const actions = createEl('div', { className: 'btn-group', style: 'margin-top: 8px;' });
      const editBtn = createEl('button', { className: 'secondary' }, ['编辑']) as HTMLButtonElement;
      const loadBtn = createEl('button', { className: 'secondary' }, ['载入配置']) as HTMLButtonElement;
      const runBtn = createEl('button', { className: 'secondary' }, ['执行']) as HTMLButtonElement;
      const exportBtn = createEl('button', { className: 'secondary' }, ['导出']) as HTMLButtonElement;
      const delBtn = createEl('button', { className: 'danger' }, ['删除']) as HTMLButtonElement;
      actions.appendChild(editBtn);
      actions.appendChild(loadBtn);
      actions.appendChild(runBtn);
      actions.appendChild(exportBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);

      editBtn.onclick = () => applyTaskToForm(task);
      loadBtn.onclick = () => openConfigTab(task.id);
      runBtn.onclick = async () => {
        try {
          setActiveTaskContext(task.id);
          const out = await invokeSchedule({ action: 'run', taskId: task.id, timeoutMs: 0 });
          const runId = String(
            out?.result?.runResult?.lastRunId
            || out?.result?.runResult?.runId
            || out?.runResult?.runId
            || '',
          ).trim();
          if (task.commandType === 'xhs-unified' && ctx && typeof ctx === 'object') {
            const argv = task.commandArgv || {};
            ctx.xhsCurrentRun = {
              runId: runId || null,
              taskId: task.id,
              profileId: String(argv.profile || ''),
              keyword: String(argv.keyword || argv.k || ''),
              target: Number(argv['max-notes'] || argv.target || 0) || 0,
              startedAt: new Date().toISOString(),
            };
            ctx.activeRunId = runId || ctx.activeRunId || null;
          }
          if (typeof ctx.setStatus === 'function') {
            ctx.setStatus(`running: ${task.id}`);
          }
          if (task.commandType === 'xhs-unified' && typeof ctx.setActiveTab === 'function') {
            ctx.setActiveTab('dashboard');
          }
          await refreshList();
        } catch (err: any) {
          alert(`执行失败: ${err?.message || String(err)}`);
        }
      };
      exportBtn.onclick = async () => {
        try {
          const out = await invokeSchedule({ action: 'export', taskId: task.id });
          downloadJson(`${task.id}.json`, out);
        } catch (err: any) {
          alert(`导出失败: ${err?.message || String(err)}`);
        }
      };
      delBtn.onclick = async () => {
        if (!confirm(`确认删除任务 ${task.id} ?`)) return;
        try {
          await invokeSchedule({ action: 'delete', taskId: task.id });
          await refreshList();
        } catch (err: any) {
          alert(`删除失败: ${err?.message || String(err)}`);
        }
      };

      listEl.appendChild(card);
    }
  }

  async function refreshList() {
    const out = await invokeSchedule({ action: 'list' });
    tasks = parseTaskRows(out);
    if (!pendingFocusTaskId) {
      pendingFocusTaskId = String(ctx?.activeTaskConfigId || '').trim();
    }
    if (pendingFocusTaskId) {
      const target = tasks.find((item) => item.id === pendingFocusTaskId);
      if (target) {
        applyTaskToForm(target);
      } else {
        setActiveTaskContext('');
      }
      pendingFocusTaskId = '';
    } else {
      setActiveTaskContext(String(ctx?.activeTaskConfigId || '').trim());
    }
    renderTaskList();
  }

  async function saveTask() {
    const payload = readFormAsPayload();
    try {
      const out = await invokeSchedule({ action: 'save', payload });
      const savedId = String(out?.task?.id || payload.id || '').trim();
      pendingFocusTaskId = savedId;
      if (savedId) setActiveTaskContext(savedId);
      await refreshList();
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function runDueNow() {
    try {
      const out = await invokeSchedule({ action: 'run-due', limit: 20, timeoutMs: 0 });
      alert(`到点任务执行完成：due=${out.count || 0}, success=${out.success || 0}, failed=${out.failed || 0}`);
      await refreshList();
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    }
  }

  async function exportAll() {
    try {
      const out = await invokeSchedule({ action: 'export' });
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
        await invokeSchedule({ action: 'import', payloadJson: text, mode: 'merge' });
        await refreshList();
      } catch (err: any) {
        alert(`导入失败: ${err?.message || String(err)}`);
      }
    };
    input.click();
  }

  async function startDaemon() {
    if (daemonRunId) {
      alert('daemon 已启动');
      return;
    }
    const interval = Math.max(5, Number(daemonIntervalInput.value || 30) || 30);
    const ret = await invokeSchedule({ action: 'daemon-start', intervalSec: interval, limit: 20 });
    daemonRunId = String(ret?.runId || '').trim();
    setDaemonStatus(daemonRunId ? `daemon: 运行中 (${daemonRunId})` : 'daemon: 启动失败');
  }

  async function stopDaemon() {
    if (!daemonRunId) {
      setDaemonStatus('daemon: 未启动');
      return;
    }
    try {
      await ctx.api.cmdKill({ runId: daemonRunId });
    } catch {
      // ignore
    }
    daemonRunId = '';
    setDaemonStatus('daemon: 已停止');
  }

  platformSelect.addEventListener('change', updateTaskTypeOptions);
  taskTypeSelect.addEventListener('change', updatePlatformFields);

  typeSelect.addEventListener('change', updateTypeFields);
  saveBtn.onclick = () => void saveTask();
  resetBtn.onclick = () => resetForm();
  refreshBtn.onclick = () => void refreshList();
  runDueBtn.onclick = () => void runDueNow();
  exportAllBtn.onclick = () => void exportAll();
  importBtn.onclick = () => void importFromFile();
  openConfigBtn.onclick = () => {
    const id = String(editingIdInput.value || activeTaskIdText.textContent || '').trim();
    openConfigTab(id);
  };
  daemonStartBtn.onclick = () => void startDaemon();
  daemonStopBtn.onclick = () => void stopDaemon();

  if (typeof ctx.api?.onCmdEvent === 'function') {
    unsubscribeCmd = ctx.api.onCmdEvent((evt: any) => {
      const runId = String(evt?.runId || '').trim();
      if (!daemonRunId || runId !== daemonRunId) return;
      if (evt?.type === 'exit') {
        daemonRunId = '';
        setDaemonStatus('daemon: 已退出');
      }
    });
  }

  resetForm();
  updateTaskTypeOptions();
  void refreshList().catch((err: any) => {
    listEl.innerHTML = `<div class="muted" style="padding: 12px;">加载失败: ${err?.message || String(err)}</div>`;
  });

  return () => {
    if (unsubscribeCmd) {
      try { unsubscribeCmd(); } catch {}
      unsubscribeCmd = null;
    }
  };
}
