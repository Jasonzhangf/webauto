import { createEl } from '../ui-components.mts';

export type ConfigPanelLayout = {
  taskConfigSelect: HTMLSelectElement;
  taskNameInput: HTMLInputElement;
  taskEnabledCb: HTMLInputElement;
  taskConfigRefreshBtn: HTMLButtonElement;
  taskOpenSchedulerBtn: HTMLButtonElement;
  keywordInput: HTMLInputElement;
  targetInput: HTMLInputElement;
  envSelect: HTMLSelectElement;
  accountSelect: HTMLSelectElement;
  scheduleTypeSelect: HTMLSelectElement;
  schedulePeriodicTypeWrap: HTMLDivElement;
  schedulePeriodicTypeSelect: HTMLSelectElement;
  scheduleIntervalWrap: HTMLDivElement;
  scheduleRunAtWrap: HTMLDivElement;
  scheduleIntervalInput: HTMLInputElement;
  scheduleRunAtInput: HTMLInputElement;
  scheduleMaxRunsInput: HTMLInputElement;
  fetchBodyCb: HTMLInputElement;
  fetchCommentsCb: HTMLInputElement;
  maxCommentsInput: HTMLInputElement;
  autoLikeCb: HTMLInputElement;
  likeKeywordsInput: HTMLInputElement;
  maxLikesInput: HTMLInputElement;
  headlessCb: HTMLInputElement;
  dryRunCb: HTMLInputElement;
  importBtn: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  saveCurrentBtn: HTMLButtonElement;
  saveNewBtn: HTMLButtonElement;
  saveOpenSchedulerBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  startNowBtn: HTMLButtonElement;
  configActiveTaskId: HTMLDivElement;
  configEditMode: HTMLDivElement;
  configDirtyState: HTMLDivElement;
  configSchedulePreview: HTMLDivElement;
  configLastAction: HTMLDivElement;
};

export function renderConfigPanelLayout(root: HTMLElement): ConfigPanelLayout {
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

  return {
    taskConfigSelect: root.querySelector('#task-config-select') as HTMLSelectElement,
    taskNameInput: root.querySelector('#task-name-input') as HTMLInputElement,
    taskEnabledCb: root.querySelector('#task-enabled-cb') as HTMLInputElement,
    taskConfigRefreshBtn: root.querySelector('#task-config-refresh-btn') as HTMLButtonElement,
    taskOpenSchedulerBtn: root.querySelector('#task-open-scheduler-btn') as HTMLButtonElement,
    keywordInput: root.querySelector('#keyword-input') as HTMLInputElement,
    targetInput: root.querySelector('#target-input') as HTMLInputElement,
    envSelect: root.querySelector('#env-select') as HTMLSelectElement,
    accountSelect: root.querySelector('#account-select') as HTMLSelectElement,
    scheduleTypeSelect: root.querySelector('#schedule-type-select') as HTMLSelectElement,
    schedulePeriodicTypeWrap: root.querySelector('#schedule-periodic-type-wrap') as HTMLDivElement,
    schedulePeriodicTypeSelect: root.querySelector('#schedule-periodic-type-select') as HTMLSelectElement,
    scheduleIntervalWrap: root.querySelector('#schedule-interval-wrap') as HTMLDivElement,
    scheduleRunAtWrap: root.querySelector('#schedule-runat-wrap') as HTMLDivElement,
    scheduleIntervalInput: root.querySelector('#schedule-interval-input') as HTMLInputElement,
    scheduleRunAtInput: root.querySelector('#schedule-runat-input') as HTMLInputElement,
    scheduleMaxRunsInput: root.querySelector('#schedule-max-runs-input') as HTMLInputElement,
    fetchBodyCb: root.querySelector('#fetch-body-cb') as HTMLInputElement,
    fetchCommentsCb: root.querySelector('#fetch-comments-cb') as HTMLInputElement,
    maxCommentsInput: root.querySelector('#max-comments-input') as HTMLInputElement,
    autoLikeCb: root.querySelector('#auto-like-cb') as HTMLInputElement,
    likeKeywordsInput: root.querySelector('#like-keywords-input') as HTMLInputElement,
    maxLikesInput: root.querySelector('#max-likes-input') as HTMLInputElement,
    headlessCb: root.querySelector('#headless-cb') as HTMLInputElement,
    dryRunCb: root.querySelector('#dry-run-cb') as HTMLInputElement,
    importBtn: root.querySelector('#import-btn') as HTMLButtonElement,
    exportBtn: root.querySelector('#export-btn') as HTMLButtonElement,
    saveCurrentBtn: root.querySelector('#save-current-btn') as HTMLButtonElement,
    saveNewBtn: root.querySelector('#save-new-btn') as HTMLButtonElement,
    saveOpenSchedulerBtn: root.querySelector('#save-open-scheduler-btn') as HTMLButtonElement,
    startBtn: root.querySelector('#start-btn') as HTMLButtonElement,
    startNowBtn: root.querySelector('#start-now-btn') as HTMLButtonElement,
    configActiveTaskId: root.querySelector('#config-active-task-id') as HTMLDivElement,
    configEditMode: root.querySelector('#config-edit-mode') as HTMLDivElement,
    configDirtyState: root.querySelector('#config-dirty-state') as HTMLDivElement,
    configSchedulePreview: root.querySelector('#config-schedule-preview') as HTMLDivElement,
    configLastAction: root.querySelector('#config-last-action') as HTMLDivElement,
  };
}
