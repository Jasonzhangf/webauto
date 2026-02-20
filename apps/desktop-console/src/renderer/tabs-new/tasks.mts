/**
 * Tasks Panel - Unified task creation and management
 * 
 * Merges config-panel and scheduler task creation into single flow:
 * 1. Select platform (xiaohongshu/weibo/1688)
 * 2. Select task type (search/timeline/monitor)
 * 3. Configure parameters
 * 4. Set schedule (optional)
 * 5. Save or execute
 */

import { createEl } from '../ui-components.mts';
import {
  PLATFORM_TASKS,
  getTasksForPlatform,
  getPlatformForCommandType,
  type ScheduleTask,
  type Platform,
  type TaskDefinition,
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
  collectComments: boolean;
  collectBody: boolean;
  doLikes: boolean;
  likeKeywords: string;
  maxLikes: number;
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
  collectComments: true,
  collectBody: true,
  doLikes: false,
  likeKeywords: '',
  maxLikes: 0,
  scheduleType: 'interval',
  intervalMinutes: 30,
  runAt: null,
  maxRuns: null,
};

export function renderTasksPanel(root: HTMLElement, ctx: any) {
  root.innerHTML = '';
  
  // Page indicator
  const pageIndicator = createEl('div', { className: 'page-indicator' }, [
    '当前: ',
    createEl('span', {}, ['任务管理']),
    ' → 创建、编辑、执行任务',
  ]);
  root.appendChild(pageIndicator);
  
  // Quota status bar (top)
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
  
  // Main grid: form + quick actions
  const mainGrid = createEl('div', { className: 'bento-grid bento-sidebar' });
  
  // Form card
  const formCard = createEl('div', { className: 'bento-cell' });
  formCard.innerHTML = `
    <div class="bento-title">新建任务</div>
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
      <button id="task-reset-btn" class="secondary" style="flex:0.5;">重置</button>
    </div>
  `;
  mainGrid.appendChild(formCard);
  
  // Quick stats card
  const statsCard = createEl('div', { className: 'bento-cell', style: 'max-width: 300px;' });
  statsCard.innerHTML = `
    <div class="bento-title">快速状态</div>
    <div id="quick-stats">
      <div style="margin-bottom: var(--gap-sm);">
        <span style="font-size:11px;color:var(--text-tertiary);">运行中任务</span>
        <div id="stat-running" style="font-size:18px;font-weight:700;color:var(--accent-success);">0</div>
      </div>
      <div style="margin-bottom: var(--gap-sm);">
        <span style="font-size:11px;color:var(--text-tertiary);">今日采集</span>
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
  
  // Recent tasks preview
  const recentCard = createEl('div', { className: 'bento-cell', style: 'margin-top: var(--gap);' });
  recentCard.innerHTML = `
    <div class="bento-title">最近任务</div>
    <div id="recent-tasks-list" style="max-height: 200px; overflow: auto;"></div>
  `;
  root.appendChild(recentCard);
  
  // Get elements
  const platformSelect = formCard.querySelector('#task-platform') as HTMLSelectElement;
  const taskTypeSelect = formCard.querySelector('#task-type') as HTMLSelectElement;
  const nameInput = formCard.querySelector('#task-name') as HTMLInputElement;
  const keywordInput = formCard.querySelector('#task-keyword') as HTMLInputElement;
  const targetInput = formCard.querySelector('#task-target') as HTMLInputElement;
  const profileInput = formCard.querySelector('#task-profile') as HTMLInputElement;
  const envSelect = formCard.querySelector('#task-env') as HTMLSelectElement;
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
  const resetBtn = formCard.querySelector('#task-reset-btn') as HTMLButtonElement;
  const quotaRefreshBtn = quotaBar.querySelector('#quota-refresh-btn') as HTMLButtonElement;
  const gotoSchedulerBtn = statsCard.querySelector('#goto-scheduler-btn') as HTMLButtonElement;
  const recentTasksList = recentCard.querySelector('#recent-tasks-list') as HTMLDivElement;
  
  // State
  let formData = { ...DEFAULT_FORM };
  let tasks: ScheduleTask[] = [];
  
  // Update task type options based on platform
  function updateTaskTypeOptions() {
    const platform = platformSelect.value as Platform;
    const tasks = getTasksForPlatform(platform);
    taskTypeSelect.innerHTML = tasks.map(t => 
      `<option value="${t.type}">${t.icon} ${t.label}</option>`
    ).join('');
    formData.platform = platform;
    formData.taskType = tasks[0]?.type || '';
  }
  
  // Update schedule visibility
  function updateScheduleVisibility() {
    const type = scheduleTypeSelect.value;
    intervalWrap.style.display = type === 'interval' ? 'inline-flex' : 'none';
    runAtWrap.style.display = type === 'once' || type === 'daily' || type === 'weekly' ? 'inline-flex' : 'none';
  }
  
  // Load quota status
  async function loadQuotaStatus() {
    try {
      const result = await ctx.api.cmdRunJson({
        script: 'apps/webauto/entry/lib/quota-status.mjs',
        args: [],
      });
      
      if (result?.json?.quotas) {
        const quotas = result.json.quotas;
        for (const q of quotas) {
          const el = quotaBar.querySelector(`#quota-${q.type}`) as HTMLSpanElement;
          if (el) {
            el.textContent = `${q.type}: ${q.count}/${q.max}`;
            el.style.color = q.count >= q.max ? 'var(--accent-danger)' : '';
          }
        }
      }
    } catch (err) {
      console.error('Failed to load quota:', err);
    }
  }
  
  // Load recent tasks
  async function loadRecentTasks() {
    try {
      const result = await ctx.api.cmdRunJson({
        script: 'apps/webauto/entry/schedule.mjs',
        args: ['list', '--json'],
      });
      
      if (result?.ok && Array.isArray(result.tasks)) {
        tasks = result.tasks;
        renderRecentTasks();
        updateStats();
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }
  
  // Render recent tasks
  function renderRecentTasks() {
    const recent = tasks.slice(0, 5);
    if (recent.length === 0) {
      recentTasksList.innerHTML = '<div class="muted" style="font-size:12px;">暂无任务</div>';
      return;
    }
    
    recentTasksList.innerHTML = recent.map(task => `
      <div class="task-row" style="display:flex;gap:var(--gap-sm);padding:var(--gap-xs)0;border-bottom:1px solid var(--border-subtle);align-items:center;">
        <span style="flex:1;font-size:12px;">${task.name || task.id}</span>
        <span style="font-size:11px;color:var(--text-tertiary);">${task.commandType}</span>
        <span style="font-size:11px;color:${task.enabled ? 'var(--accent-success)' : 'var(--text-muted)'};">${task.enabled ? '启用' : '禁用'}</span>
        <button class="secondary edit-task-btn" data-id="${task.id}" style="padding:2px 6px;font-size:10px;height:auto;">编辑</button>
      </div>
    `).join('');
    
    // Bind edit buttons
    recentTasksList.querySelectorAll('.edit-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = (btn as HTMLButtonElement).dataset.id;
        const task = tasks.find(t => t.id === taskId);
        if (task) populateForm(task);
      });
    });
  }
  
  // Update stats
  function updateStats() {
    const statSaved = statsCard.querySelector('#stat-saved') as HTMLDivElement;
    statSaved.textContent = String(tasks.length);
  }
  
  // Populate form from task
  function populateForm(task: ScheduleTask) {
    editingIdInput.value = task.id;
    nameInput.value = task.name || '';
    
    const platform = getPlatformForCommandType(task.commandType);
    platformSelect.value = platform;
    updateTaskTypeOptions();
    
    taskTypeSelect.value = task.commandType;
    keywordInput.value = task.commandArgv?.keyword || '';
    targetInput.value = task.commandArgv?.targetCount || task.commandArgv?.maxNotes || 50;
    profileInput.value = task.commandArgv?.profileId || task.commandArgv?.profile || '';
    envSelect.value = task.commandArgv?.env || 'debug';
    commentsInput.checked = task.commandArgv?.collectComments !== false;
    likesInput.checked = task.commandArgv?.doLikes === true;
    likeKeywordsInput.value = task.commandArgv?.likeKeywords || '';
    scheduleTypeSelect.value = task.scheduleType;
    intervalInput.value = String(task.intervalMinutes || 30);
    maxRunsInput.value = task.maxRuns ? String(task.maxRuns) : '';
    
    updateScheduleVisibility();
  }
  
  // Collect form data
  function collectFormData(): TaskFormData {
    return {
      id: editingIdInput.value || undefined,
      name: nameInput.value.trim(),
      enabled: true,
      platform: platformSelect.value as Platform,
      taskType: taskTypeSelect.value,
      profileId: profileInput.value.trim(),
      keyword: keywordInput.value.trim(),
      targetCount: parseInt(targetInput.value) || 50,
      env: envSelect.value as 'debug' | 'prod',
      collectComments: commentsInput.checked,
      collectBody: bodyInput.checked,
      doLikes: likesInput.checked,
      likeKeywords: likeKeywordsInput.value.trim(),
      maxLikes: 0,
      scheduleType: scheduleTypeSelect.value as any,
      intervalMinutes: parseInt(intervalInput.value) || 30,
      runAt: runAtInput.value || null,
      maxRuns: parseInt(maxRunsInput.value) || null,
    };
  }
  
  // Save task
  async function saveTask(runImmediately = false) {
    const data = collectFormData();
    
    if (!data.keyword) {
      alert('请输入关键词');
      return;
    }
    
    if (!data.profileId) {
      alert('请输入 Profile ID');
      return;
    }
    
    try {
      const taskPayload = {
        id: data.id || undefined,
        name: data.name || `${data.platform}-${data.keyword}`,
        enabled: data.enabled,
        scheduleType: data.scheduleType,
        intervalMinutes: data.intervalMinutes,
        runAt: data.runAt,
        maxRuns: data.maxRuns,
        commandType: data.taskType,
        commandArgv: {
          keyword: data.keyword,
          targetCount: data.targetCount,
          maxNotes: data.targetCount,
          profileId: data.profileId,
          profile: data.profileId,
          env: data.env,
          collectComments: data.collectComments,
          collectBody: data.collectBody,
          doLikes: data.doLikes,
          likeKeywords: data.likeKeywords,
        },
      };
      
      const args = ['upsert', '--json', '--payload', JSON.stringify(taskPayload)];
      
      const result = await ctx.api.cmdRunJson({
        script: 'apps/webauto/entry/schedule.mjs',
        args,
      });
      
      if (!result?.ok) {
        alert('保存失败: ' + (result?.error || '未知错误'));
        return;
      }
      
      if (runImmediately) {
        // Execute the task
        await ctx.api.cmdSpawn({
          title: `${data.platform}: ${data.keyword}`,
          script: `apps/webauto/entry/${data.platform === 'xiaohongshu' ? 'xhs-unified' : data.platform === 'weibo' ? 'weibo-unified' : '1688-unified'}.mjs`,
          args: [
            'search',
            '--profile', data.profileId,
            '--keyword', data.keyword,
            '--target', String(data.targetCount),
            '--env', data.env,
            data.doLikes ? '--do-likes' : '',
            data.collectComments ? '--do-comments' : '',
            data.likeKeywords ? '--like-keywords' : '',
            data.likeKeywords || '',
          ].filter(Boolean),
        });
        
        // Navigate to dashboard
        if (typeof ctx.setActiveTab === 'function') {
          setTimeout(() => ctx.setActiveTab('dashboard'), 500);
        }
      } else {
        alert('任务已保存');
        loadRecentTasks();
      }
    } catch (err) {
      console.error('Save failed:', err);
      alert('保存失败: ' + err);
    }
  }
  
  // Reset form
  function resetForm() {
    formData = { ...DEFAULT_FORM };
    editingIdInput.value = '';
    nameInput.value = '';
    platformSelect.value = 'xiaohongshu';
    updateTaskTypeOptions();
    keywordInput.value = '';
    targetInput.value = '50';
    profileInput.value = '';
    envSelect.value = 'debug';
    commentsInput.checked = true;
    bodyInput.checked = true;
    likesInput.checked = false;
    likeKeywordsInput.value = '';
    scheduleTypeSelect.value = 'interval';
    intervalInput.value = '30';
    maxRunsInput.value = '';
    updateScheduleVisibility();
  }
  
  // Event handlers
  platformSelect.addEventListener('change', updateTaskTypeOptions);
  scheduleTypeSelect.addEventListener('change', updateScheduleVisibility);
  likesInput.addEventListener('change', () => {
    likeKeywordsInput.disabled = !likesInput.checked;
  });
  
  saveBtn.addEventListener('click', () => saveTask(false));
  runBtn.addEventListener('click', () => saveTask(true));
  resetBtn.addEventListener('click', resetForm);
  quotaRefreshBtn.addEventListener('click', loadQuotaStatus);
  
  gotoSchedulerBtn.addEventListener('click', () => {
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('scheduler');
    }
  });
  
  // Initialize
  updateTaskTypeOptions();
  updateScheduleVisibility();
  loadQuotaStatus();
  loadRecentTasks();
  
  // Load last profile
  async function loadLastProfile() {
    try {
      const config = await ctx.api.configLoadLast();
      if (config?.lastProfileId) {
        profileInput.value = config.lastProfileId;
      }
      if (config?.keyword) {
        keywordInput.value = config.keyword;
      }
    } catch {}
  }
  loadLastProfile();
}
