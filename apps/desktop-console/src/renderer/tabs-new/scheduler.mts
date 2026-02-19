import { createEl } from '../ui-components.mts';

type ScheduleTask = {
  id: string;
  name: string;
  enabled: boolean;
  scheduleType: 'interval' | 'once' | 'daily' | 'weekly';
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
  nextRunAt: string | null;
  commandType: string;
  commandArgv: Record<string, any>;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  runCount: number;
  failCount: number;
};

function toLocalDatetimeValue(iso: string | null): string {
  const text = String(iso || '').trim();
  if (!text) return '';
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return '';
  const date = new Date(ts);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function toIsoOrNull(localDateTime: string): string | null {
  const text = String(localDateTime || '').trim();
  if (!text) return null;
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function parseTaskRows(payload: any): ScheduleTask[] {
  const rows = Array.isArray(payload?.tasks) ? payload.tasks : [];
  return rows
    .map((row) => {
      const scheduleType: ScheduleTask['scheduleType'] = (() => {
        const value = String(row?.scheduleType || 'interval').trim().toLowerCase();
        if (value === 'once' || value === 'daily' || value === 'weekly') return value;
        return 'interval';
      })();
      return ({
      id: String(row?.id || '').trim(),
      name: String(row?.name || row?.id || '').trim(),
      enabled: row?.enabled !== false,
      scheduleType,
      intervalMinutes: Number(row?.intervalMinutes || 30) || 30,
      runAt: String(row?.runAt || '').trim() || null,
      maxRuns: Number.isFinite(Number(row?.maxRuns)) && Number(row.maxRuns) > 0 ? Math.floor(Number(row.maxRuns)) : null,
      nextRunAt: String(row?.nextRunAt || '').trim() || null,
      commandType: String(row?.commandType || 'xhs-unified').trim() || 'xhs-unified',
      commandArgv: row?.commandArgv && typeof row.commandArgv === 'object' ? row.commandArgv : {},
      lastRunAt: String(row?.lastRunAt || '').trim() || null,
      lastStatus: String(row?.lastStatus || '').trim() || null,
      lastError: String(row?.lastError || '').trim() || null,
      runCount: Number(row?.runCount || 0) || 0,
      failCount: Number(row?.failCount || 0) || 0,
    });
    })
    .filter((row) => row.id);
}

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
    <div id="scheduler-list" style="max-height: 560px; overflow: auto;"></div>
  `;
  grid.appendChild(listCell);
  root.appendChild(grid);

  const refreshBtn = root.querySelector('#scheduler-refresh-btn') as HTMLButtonElement;
  const runDueBtn = root.querySelector('#scheduler-run-due-btn') as HTMLButtonElement;
  const exportAllBtn = root.querySelector('#scheduler-export-all-btn') as HTMLButtonElement;
  const importBtn = root.querySelector('#scheduler-import-btn') as HTMLButtonElement;
  const daemonStartBtn = root.querySelector('#scheduler-daemon-start-btn') as HTMLButtonElement;
  const daemonStopBtn = root.querySelector('#scheduler-daemon-stop-btn') as HTMLButtonElement;
  const daemonIntervalInput = root.querySelector('#scheduler-daemon-interval') as HTMLInputElement;
  const daemonStatus = root.querySelector('#scheduler-daemon-status') as HTMLSpanElement;
  const listEl = root.querySelector('#scheduler-list') as HTMLDivElement;

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

  function setDaemonStatus(text: string) {
    daemonStatus.textContent = text;
  }

  function updateTypeFields() {
    const mode = typeSelect.value;
    const useRunAt = mode === 'once' || mode === 'daily' || mode === 'weekly';
    runAtWrap.style.display = useRunAt ? '' : 'none';
    intervalWrap.style.display = useRunAt ? 'none' : '';
  }

  function resetForm() {
    editingIdInput.value = '';
    nameInput.value = '';
    enabledInput.checked = true;
    typeSelect.value = 'interval';
    intervalInput.value = '30';
    runAtInput.value = '';
    maxRunsInput.value = '';
    profileInput.value = '';
    keywordInput.value = '';
    maxNotesInput.value = '50';
    envSelect.value = 'debug';
    commentsInput.checked = true;
    likesInput.checked = false;
    headlessInput.checked = false;
    dryRunInput.checked = false;
    likeKeywordsInput.value = '';
    updateTypeFields();
  }

  function readFormAsPayload() {
    const maxRunsRaw = maxRunsInput.value.trim();
    const maxRuns = maxRunsRaw
      ? Math.max(1, Number(maxRunsRaw) || 1)
      : null;
    const argv = {
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
    return {
      id: editingIdInput.value.trim(),
      name: nameInput.value.trim(),
      enabled: enabledInput.checked,
      scheduleType: typeSelect.value,
      intervalMinutes: Number(intervalInput.value || 30) || 30,
      runAt: toIsoOrNull(runAtInput.value),
      maxRuns,
      argv,
    };
  }

  function applyTaskToForm(task: ScheduleTask) {
    editingIdInput.value = task.id;
    nameInput.value = task.name || '';
    enabledInput.checked = task.enabled !== false;
    typeSelect.value = task.scheduleType;
    intervalInput.value = String(task.intervalMinutes || 30);
    runAtInput.value = toLocalDatetimeValue(task.runAt);
    maxRunsInput.value = task.maxRuns ? String(task.maxRuns) : '';
    profileInput.value = String(task.commandArgv?.profile || '');
    keywordInput.value = String(task.commandArgv?.keyword || task.commandArgv?.k || '');
    maxNotesInput.value = String(task.commandArgv?.['max-notes'] ?? task.commandArgv?.target ?? 50);
    envSelect.value = String(task.commandArgv?.env || 'debug');
    commentsInput.checked = task.commandArgv?.['do-comments'] !== false;
    likesInput.checked = task.commandArgv?.['do-likes'] === true;
    headlessInput.checked = task.commandArgv?.headless === true;
    dryRunInput.checked = task.commandArgv?.['dry-run'] === true;
    likeKeywordsInput.value = String(task.commandArgv?.['like-keywords'] || '');
    updateTypeFields();
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
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:6px;">
          <div style="font-weight:600;">${task.name || task.id}</div>
          <span style="font-size:12px; color:${task.enabled ? 'var(--success)' : 'var(--danger)'};">${task.enabled ? 'enabled' : 'disabled'}</span>
        </div>
        <div class="muted" style="font-size:12px; margin-bottom:4px;">id=${task.id}</div>
        <div style="font-size:12px;">schedule: ${scheduleText}</div>
        <div style="font-size:12px;">maxRuns: ${task.maxRuns || 'unlimited'}</div>
        <div style="font-size:12px;">nextRunAt: ${task.nextRunAt || '-'}</div>
        <div style="font-size:12px;">status: ${statusText}</div>
        ${task.lastError ? `<div style="font-size:12px; color:var(--danger);">error: ${task.lastError}</div>` : ''}
      `;
      const actions = createEl('div', { className: 'btn-group', style: 'margin-top: 8px;' });
      const editBtn = createEl('button', { className: 'secondary' }, ['编辑']) as HTMLButtonElement;
      const runBtn = createEl('button', { className: 'secondary' }, ['执行']) as HTMLButtonElement;
      const exportBtn = createEl('button', { className: 'secondary' }, ['导出']) as HTMLButtonElement;
      const delBtn = createEl('button', { className: 'danger' }, ['删除']) as HTMLButtonElement;
      actions.appendChild(editBtn);
      actions.appendChild(runBtn);
      actions.appendChild(exportBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);

      editBtn.onclick = () => applyTaskToForm(task);
      runBtn.onclick = async () => {
        try {
          await runScheduleJson(['run', task.id], 0);
          await refreshList();
        } catch (err: any) {
          alert(`执行失败: ${err?.message || String(err)}`);
        }
      };
      exportBtn.onclick = async () => {
        try {
          const out = await runScheduleJson(['export', task.id]);
          downloadJson(`${task.id}.json`, out);
        } catch (err: any) {
          alert(`导出失败: ${err?.message || String(err)}`);
        }
      };
      delBtn.onclick = async () => {
        if (!confirm(`确认删除任务 ${task.id} ?`)) return;
        try {
          await runScheduleJson(['delete', task.id]);
          await refreshList();
        } catch (err: any) {
          alert(`删除失败: ${err?.message || String(err)}`);
        }
      };

      listEl.appendChild(card);
    }
  }

  async function refreshList() {
    const out = await runScheduleJson(['list']);
    tasks = parseTaskRows(out);
    renderTaskList();
  }

  async function saveTask() {
    const payload = readFormAsPayload();
    if (!payload.name) {
      alert('任务名不能为空');
      return;
    }
    if (!payload.argv.profile && !payload.argv.profiles && !payload.argv.profilepool) {
      alert('profile/profiles/profilepool 至少填写一个');
      return;
    }
    if (!payload.argv.keyword) {
      alert('关键词不能为空');
      return;
    }
    const args = payload.id
      ? ['update', payload.id]
      : ['add'];
    args.push('--name', payload.name);
    args.push('--enabled', String(payload.enabled));
    args.push('--schedule-type', payload.scheduleType);
    if (payload.scheduleType === 'once') {
      if (!payload.runAt) {
        alert('一次性任务需要锚点时间');
        return;
      }
      args.push('--run-at', payload.runAt);
    } else if (payload.scheduleType === 'daily' || payload.scheduleType === 'weekly') {
      if (!payload.runAt) {
        alert(`${payload.scheduleType} 任务需要锚点时间`);
        return;
      }
      args.push('--run-at', payload.runAt);
    } else {
      args.push('--interval-minutes', String(Math.max(1, payload.intervalMinutes)));
    }
    args.push('--max-runs', payload.maxRuns === null ? '0' : String(payload.maxRuns));
    args.push('--argv-json', JSON.stringify(payload.argv));
    try {
      await runScheduleJson(args);
      await refreshList();
      resetForm();
    } catch (err: any) {
      alert(`保存失败: ${err?.message || String(err)}`);
    }
  }

  async function runDueNow() {
    try {
      const out = await runScheduleJson(['run-due', '--limit', '20'], 0);
      alert(`到点任务执行完成：due=${out.count || 0}, success=${out.success || 0}, failed=${out.failed || 0}`);
      await refreshList();
    } catch (err: any) {
      alert(`执行失败: ${err?.message || String(err)}`);
    }
  }

  async function exportAll() {
    try {
      const out = await runScheduleJson(['export']);
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
        await runScheduleJson(['import', '--payload-json', text, '--mode', 'merge']);
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
    const script = ctx.api.pathJoin('apps', 'webauto', 'entry', 'schedule.mjs');
    const ret = await ctx.api.cmdSpawn({
      title: `schedule daemon ${interval}s`,
      cwd: '',
      args: [script, 'daemon', '--interval-sec', String(interval), '--limit', '20', '--json'],
      groupKey: 'scheduler',
    });
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

  typeSelect.addEventListener('change', updateTypeFields);
  saveBtn.onclick = () => void saveTask();
  resetBtn.onclick = () => resetForm();
  refreshBtn.onclick = () => void refreshList();
  runDueBtn.onclick = () => void runDueNow();
  exportAllBtn.onclick = () => void exportAll();
  importBtn.onclick = () => void importFromFile();
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
