import { createEl } from '../ui-components.mts';
import { listAccountProfiles, type UiAccountProfile } from '../account-source.mts';

type ConfigPanelOptions = {
  api: any;
  setActiveTab: (id: string) => void;
};

export function renderConfigPanel(root: HTMLElement, ctx: any) {
  root.innerHTML = '';

  // Page indicator
  const pageIndicator = createEl('div', { className: 'page-indicator' }, [
    '当前: ',
    createEl('span', {}, ['配置页']),
    ' → 完成后跳转 ',
    createEl('span', {}, ['看板页'])
  ]);
  root.appendChild(pageIndicator);

  // Bento Grid Layout
  const bentoGrid = createEl('div', { className: 'bento-grid bento-sidebar' });

  // Left: Target Settings
  const targetCard = createEl('div', { className: 'bento-cell' });
  targetCard.innerHTML = `
    <div class="bento-title">目标设定</div>

    <div class="row">
      <div>
        <label>搜索关键词</label>
        <input id="keyword-input" placeholder="输入关键词" style="width: 200px;" />
      </div>
    </div>

    <div class="row">
      <div>
        <label>目标数量</label>
        <input id="target-input" type="number" value="50" min="1" style="width: 100px;" />
      </div>
      <div>
        <label>运行环境</label>
        <select id="env-select" style="width: 120px;">
          <option value="debug">调试模式</option>
          <option value="prod" selected>生产模式</option>
        </select>
      </div>
    </div>

    <div>
      <label>选择账户</label>
      <select id="account-select" style="min-width: 200px;">
        <option value="">请选择账户...</option>
      </select>
    </div>

    <div style="margin-top: var(--gap); padding-top: var(--gap); border-top: 1px solid var(--border);">
      <div class="bento-title" style="font-size: 13px;">配置预设</div>
      <div class="row">
        <select id="preset-select" style="width: 200px;">
          <option value="last">上次配置</option>
          <option value="full">预设1：全量爬取</option>
          <option value="body-only">预设2：仅正文</option>
          <option value="quick">预设3：快速采集</option>
        </select>
      </div>
      <div class="btn-group">
        <button id="import-btn" class="secondary" style="flex: 1;">导入配置</button>
        <button id="export-btn" class="secondary" style="flex: 1;">导出配置</button>
      </div>
    </div>
  `;
  bentoGrid.appendChild(targetCard);

  // Right: Crawl Options
  const optionsCard = createEl('div', { className: 'bento-cell' });
  optionsCard.innerHTML = `
    <div class="bento-title">爬取选项</div>

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
        <label>最多评论数</label>
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
        <label>点赞关键词 (逗号分隔)</label>
        <input id="like-keywords-input" placeholder="例如: 美食,旅游,摄影" />
      
      <div class="row" style="margin-top: 8px;">
        <div>
          <label>最大点赞数 (0=不限)</label>
          <input id="max-likes-input" type="number" value="0" min="0" style="width: 100px;" />
        </div>
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
  `;
  bentoGrid.appendChild(optionsCard);
  root.appendChild(bentoGrid);

  // Bottom: Start Button
  const actionRow = createEl('div', { className: 'bento-grid', style: 'margin-top: var(--gap);' });
  const actionCard = createEl('div', { className: 'bento-cell highlight' });
  actionCard.innerHTML = `
    <div style="text-align: center;">
      <button id="start-btn" style="padding: 14px 64px; font-size: 15px;">开始爬取</button>
    </div>
  `;
  actionRow.appendChild(actionCard);
  root.appendChild(actionRow);

  // Elements
  const keywordInput = root.querySelector('#keyword-input') as HTMLInputElement;
  const targetInput = root.querySelector('#target-input') as HTMLInputElement;
  const envSelect = root.querySelector('#env-select') as HTMLSelectElement;
  const accountSelect = root.querySelector('#account-select') as HTMLSelectElement;
  const presetSelect = root.querySelector('#preset-select') as HTMLSelectElement;
  const fetchBodyCb = root.querySelector('#fetch-body-cb') as HTMLInputElement;
  const fetchCommentsCb = root.querySelector('#fetch-comments-cb') as HTMLInputElement;
  const maxCommentsInput = root.querySelector('#max-comments-input') as HTMLInputElement;
  const autoLikeCb = root.querySelector('#auto-like-cb') as HTMLInputElement;
  const likeKeywordsInput = root.querySelector('#like-keywords-input') as HTMLInputElement;
  const maxLikesInput = root.querySelector('#max-likes-input') as HTMLInputElement;
  const headlessCb = root.querySelector('#headless-cb') as HTMLInputElement;
  const dryRunCb = root.querySelector('#dry-run-cb') as HTMLInputElement;
  const startBtn = root.querySelector('#start-btn') as HTMLButtonElement;
  const importBtn = root.querySelector('#import-btn') as HTMLButtonElement;
  const exportBtn = root.querySelector('#export-btn') as HTMLButtonElement;

  // State
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let accountRows: UiAccountProfile[] = [];
  let preferredProfileId = '';

  function readNumber(input: HTMLInputElement, fallback: number) {
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(0, Math.floor(raw));
  }

  function buildConfigPayload() {
    return {
      keyword: keywordInput.value.trim(),
      target: parseInt(targetInput.value) || 50,
      env: envSelect.value as 'debug' | 'prod',
      fetchBody: fetchBodyCb.checked,
      fetchComments: fetchCommentsCb.checked,
      maxComments: readNumber(maxCommentsInput, 0),
      autoLike: autoLikeCb.checked,
      likeKeywords: likeKeywordsInput.value.trim(),
      maxLikes: readNumber(maxLikesInput, 0),
      headless: headlessCb.checked,
      dryRun: dryRunCb.checked,
      lastProfileId: accountSelect.value || undefined
    };
  }

  // Load config
  async function loadConfig() {
    try {
      const config = await ctx.api.configLoadLast();
      if (config) {
        keywordInput.value = config.keyword || '';
        targetInput.value = String(config.target || 50);
        envSelect.value = config.env || 'prod';
        fetchBodyCb.checked = config.fetchBody !== false;
        fetchCommentsCb.checked = config.fetchComments !== false;
        maxCommentsInput.value = String(config.maxComments ?? 0);
        autoLikeCb.checked = config.autoLike === true;
        likeKeywordsInput.value = config.likeKeywords || '';
        maxLikesInput.value = String(config.maxLikes ?? 0);
        headlessCb.checked = config.headless === true;
        dryRunCb.checked = config.dryRun === true;
        preferredProfileId = String(config.lastProfileId || '').trim();
        updateLikeKeywordsState();
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  // Save config (debounced)
  function saveConfig() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const config = buildConfigPayload();
      try {
        await ctx.api.configSaveLast(config);
      } catch (err) {
        console.error('Failed to save config:', err);
      }
    }, 1000);
  }

  // Load accounts
  async function loadAccounts() {
    try {
      accountRows = await listAccountProfiles(ctx.api);
      const validRows = accountRows.filter((row) => row.valid);

      accountSelect.innerHTML = '<option value="">请选择账户...</option>';
      validRows.forEach((row) => {
        const profileId = String(row.profileId || '');
        const label = row.alias ? `${row.alias} (${profileId})` : (row.name || profileId);
        const opt = createEl('option', { value: profileId }, [label]) as HTMLOptionElement;
        accountSelect.appendChild(opt);
      });
      if (preferredProfileId && validRows.some((row) => row.profileId === preferredProfileId)) {
        accountSelect.value = preferredProfileId;
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }

  // Export config
  async function exportConfig() {
    try {
      const config = buildConfigPayload();

      // Use Downloads folder
      const home = ctx.api.osHomedir();
      const downloadsPath = ctx.api.pathJoin(home, 'Downloads');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filePath = ctx.api.pathJoin(downloadsPath, `webauto-config-${timestamp}.json`);

      const result = await ctx.api.configExport({ filePath, config });
      if (result.ok) {
        alert(`配置已导出到: ${result.path}`);
      }
    } catch (err: any) {
      alert('导出失败: ' + (err?.message || String(err)));
    }
  }

  // Import config
  async function importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        // Read file content
        const text = await file.text();
        const config = JSON.parse(text.replace(/^\uFEFF/, ''));

        keywordInput.value = config.keyword || '';
        targetInput.value = String(config.target || 50);
        envSelect.value = config.env || 'prod';
        fetchBodyCb.checked = config.fetchBody !== false;
        fetchCommentsCb.checked = config.fetchComments !== false;
        maxCommentsInput.value = String(config.maxComments ?? 0);
        autoLikeCb.checked = config.autoLike === true;
        likeKeywordsInput.value = config.likeKeywords || '';
        maxLikesInput.value = String(config.maxLikes ?? 0);
        headlessCb.checked = config.headless === true;
        dryRunCb.checked = config.dryRun === true;
        updateLikeKeywordsState();
        saveConfig();

        alert('配置已导入');
      } catch (err: any) {
        alert('导入失败: ' + (err?.message || String(err)));
      }
    };
    input.click();
  }

  // Update like keywords state
  function updateLikeKeywordsState() {
    likeKeywordsInput.disabled = false;
    likeKeywordsInput.style.opacity = autoLikeCb.checked ? '1' : '0.9';
    maxLikesInput.disabled = false;
    maxLikesInput.style.opacity = autoLikeCb.checked ? '1' : '0.9';
  }

  // Start crawl
  async function startCrawl() {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      alert('请输入关键词');
      return;
    }

    const profileId = accountSelect.value;
    if (!profileId) {
      alert('请选择账户');
      return;
    }

    const account = accountRows.find((row) => row.profileId === profileId);
    if (!account || !account.valid) {
      alert('当前账户无效，请先到“账户管理”完成登录并校验');
      return;
    }

    const config = buildConfigPayload();
    try {
      await ctx.api.configSaveLast(config);
    } catch {
      // ignore config persistence errors, still allow run
    }

    const script = ctx.api.pathJoin('apps', 'webauto', 'entry', 'xhs-unified.mjs');
    const outputRoot = String(ctx?.settings?.downloadRoot || '').trim();
    const args: string[] = [
      script,
      '--profile', profileId,
      '--keyword', config.keyword,
      '--max-notes', String(config.target),
      '--resume', 'false',
      '--env', config.env,
      '--do-comments', config.fetchComments ? 'true' : 'false',
      '--persist-comments', config.fetchComments ? 'true' : 'false',
      ...(config.fetchComments ? ['--max-comments', String(config.maxComments)] : []),
      '--do-likes', config.autoLike ? 'true' : 'false',
      ...(config.autoLike ? ['--like-keywords', config.likeKeywords || '', '--max-likes', String(config.maxLikes)] : []),
      '--headless', config.headless ? 'true' : 'false',
    ];
    if (outputRoot) args.push('--output-root', outputRoot);
    if (config.dryRun) args.push('--dry-run');
    else args.push('--no-dry-run');

    startBtn.disabled = true;
    const prevText = startBtn.textContent;
    startBtn.textContent = '启动中...';
    try {
      const ret = await ctx.api.cmdSpawn({
        title: `xhs unified ${config.keyword}`.trim(),
        cwd: '',
        args,
        groupKey: 'xiaohongshu',
      });
      const runId = String(ret?.runId || '').trim();
      if (!runId) {
        throw new Error('runId 为空');
      }
      ctx.xhsCurrentRun = {
        runId,
        profileId,
        keyword: config.keyword,
        target: config.target,
        startedAt: new Date().toISOString(),
      };
      if (typeof ctx.appendLog === 'function') {
        ctx.appendLog(`[ui] started xhs-unified runId=${runId} profile=${profileId} keyword=${config.keyword}`);
      }
      if (typeof ctx.setStatus === 'function') {
        ctx.setStatus(`running: xhs-unified ${config.keyword}`);
      }
    } catch (err: any) {
      alert(`启动失败: ${err?.message || String(err)}`);
      if (typeof ctx.appendLog === 'function') {
        ctx.appendLog(`[ui][error] xhs-unified 启动失败: ${err?.message || String(err)}`);
      }
      return;
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = prevText || '开始爬取';
    }

    // Navigate to dashboard
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('dashboard');
    }
  }

  // Event listeners
  autoLikeCb.onchange = updateLikeKeywordsState;
  importBtn.onclick = importConfig;
  exportBtn.onclick = exportConfig;
  startBtn.onclick = startCrawl;

  // Auto-save on change
  [keywordInput, targetInput, envSelect, accountSelect, fetchBodyCb, fetchCommentsCb,
   maxCommentsInput, autoLikeCb, likeKeywordsInput, maxLikesInput, headlessCb, dryRunCb].forEach(el => {
    el.onchange = saveConfig;
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') {
      (el as HTMLInputElement).oninput = saveConfig;
    }
  });

  // Initial load
  void loadConfig();
  void loadAccounts();
}
