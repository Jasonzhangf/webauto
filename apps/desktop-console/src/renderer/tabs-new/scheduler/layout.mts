import { createEl } from '../../ui-components.mts';

export type SchedulerLayout = {
  refreshBtn: HTMLButtonElement;
  runDueBtn: HTMLButtonElement;
  exportAllBtn: HTMLButtonElement;
  importBtn: HTMLButtonElement;
  openConfigBtn: HTMLButtonElement;
  daemonStartBtn: HTMLButtonElement;
  daemonStopBtn: HTMLButtonElement;
  daemonIntervalInput: HTMLInputElement;
  daemonStatus: HTMLSpanElement;
  activeTaskIdText: HTMLElement;
  listEl: HTMLDivElement;
  platformSelect: HTMLSelectElement;
  taskTypeSelect: HTMLSelectElement;
  editingIdInput: HTMLInputElement;
  nameInput: HTMLInputElement;
  enabledInput: HTMLInputElement;
  typeSelect: HTMLSelectElement;
  periodicTypeWrap: HTMLDivElement;
  periodicTypeSelect: HTMLSelectElement;
  intervalWrap: HTMLDivElement;
  runAtWrap: HTMLDivElement;
  intervalInput: HTMLInputElement;
  runAtInput: HTMLInputElement;
  maxRunsInput: HTMLInputElement;
  profileInput: HTMLInputElement;
  profileHint: HTMLDivElement;
  keywordInput: HTMLInputElement;
  userIdWrap: HTMLDivElement;
  userIdInput: HTMLInputElement;
  maxNotesInput: HTMLInputElement;
  envSelect: HTMLSelectElement;
  commentsInput: HTMLInputElement;
  likesInput: HTMLInputElement;
  headlessInput: HTMLInputElement;
  dryRunInput: HTMLInputElement;
  likeKeywordsInput: HTMLInputElement;
  saveBtn: HTMLButtonElement;
  runNowBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
};

export function renderSchedulerLayout(root: HTMLElement): SchedulerLayout {
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
          <option value="immediate">马上执行（仅一次）</option>
          <option value="periodic">周期任务</option>
          <option value="scheduled">定时任务</option>
        </select>
      </div>
      <div id="scheduler-periodic-type-wrap" style="display:none;">
        <label>周期类型</label>
        <select id="scheduler-periodic-type" style="width: 120px;">
          <option value="interval">按间隔</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
        </select>
      </div>
      <div id="scheduler-interval-wrap" style="display:none;">
        <label>间隔分钟</label>
        <input id="scheduler-interval" type="number" min="1" value="30" style="width: 120px;" />
      </div>
      <div id="scheduler-runat-wrap" style="display:none;">
        <label>执行时间</label>
        <input id="scheduler-runat" type="datetime-local" style="width: 220px;" />
      </div>
      <div>
        <label>最大执行次数</label>
        <input id="scheduler-max-runs" type="number" min="1" placeholder="不限" style="width: 120px;" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>Profile（可留空自动选）</label>
        <input id="scheduler-profile" placeholder="留空自动选择该平台有效账号" style="width: 260px;" />
        <div id="scheduler-profile-hint" class="muted" style="font-size:11px; margin-top:2px;">推荐: -</div>
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
      <button id="scheduler-run-now-btn" class="secondary" style="flex:1;">立即执行(不保存)</button>
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

  return {
    refreshBtn: root.querySelector('#scheduler-refresh-btn') as HTMLButtonElement,
    runDueBtn: root.querySelector('#scheduler-run-due-btn') as HTMLButtonElement,
    exportAllBtn: root.querySelector('#scheduler-export-all-btn') as HTMLButtonElement,
    importBtn: root.querySelector('#scheduler-import-btn') as HTMLButtonElement,
    openConfigBtn: root.querySelector('#scheduler-open-config-btn') as HTMLButtonElement,
    daemonStartBtn: root.querySelector('#scheduler-daemon-start-btn') as HTMLButtonElement,
    daemonStopBtn: root.querySelector('#scheduler-daemon-stop-btn') as HTMLButtonElement,
    daemonIntervalInput: root.querySelector('#scheduler-daemon-interval') as HTMLInputElement,
    daemonStatus: root.querySelector('#scheduler-daemon-status') as HTMLSpanElement,
    activeTaskIdText: root.querySelector('#scheduler-active-task-id') as HTMLElement,
    listEl: root.querySelector('#scheduler-list') as HTMLDivElement,
    platformSelect: root.querySelector('#scheduler-platform') as HTMLSelectElement,
    taskTypeSelect: root.querySelector('#scheduler-task-type') as HTMLSelectElement,
    editingIdInput: root.querySelector('#scheduler-editing-id') as HTMLInputElement,
    nameInput: root.querySelector('#scheduler-name') as HTMLInputElement,
    enabledInput: root.querySelector('#scheduler-enabled') as HTMLInputElement,
    typeSelect: root.querySelector('#scheduler-type') as HTMLSelectElement,
    periodicTypeWrap: root.querySelector('#scheduler-periodic-type-wrap') as HTMLDivElement,
    periodicTypeSelect: root.querySelector('#scheduler-periodic-type') as HTMLSelectElement,
    intervalWrap: root.querySelector('#scheduler-interval-wrap') as HTMLDivElement,
    runAtWrap: root.querySelector('#scheduler-runat-wrap') as HTMLDivElement,
    intervalInput: root.querySelector('#scheduler-interval') as HTMLInputElement,
    runAtInput: root.querySelector('#scheduler-runat') as HTMLInputElement,
    maxRunsInput: root.querySelector('#scheduler-max-runs') as HTMLInputElement,
    profileInput: root.querySelector('#scheduler-profile') as HTMLInputElement,
    profileHint: root.querySelector('#scheduler-profile-hint') as HTMLDivElement,
    keywordInput: root.querySelector('#scheduler-keyword') as HTMLInputElement,
    userIdWrap: root.querySelector('#scheduler-user-id-wrap') as HTMLDivElement,
    userIdInput: root.querySelector('#scheduler-user-id') as HTMLInputElement,
    maxNotesInput: root.querySelector('#scheduler-max-notes') as HTMLInputElement,
    envSelect: root.querySelector('#scheduler-env') as HTMLSelectElement,
    commentsInput: root.querySelector('#scheduler-comments') as HTMLInputElement,
    likesInput: root.querySelector('#scheduler-likes') as HTMLInputElement,
    headlessInput: root.querySelector('#scheduler-headless') as HTMLInputElement,
    dryRunInput: root.querySelector('#scheduler-dryrun') as HTMLInputElement,
    likeKeywordsInput: root.querySelector('#scheduler-like-keywords') as HTMLInputElement,
    saveBtn: root.querySelector('#scheduler-save-btn') as HTMLButtonElement,
    runNowBtn: root.querySelector('#scheduler-run-now-btn') as HTMLButtonElement,
    resetBtn: root.querySelector('#scheduler-reset-btn') as HTMLButtonElement,
  };
}
