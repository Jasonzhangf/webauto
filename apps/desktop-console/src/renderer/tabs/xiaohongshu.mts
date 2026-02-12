import { createEl } from "../ui-components.mjs";
import * as state from "./xiaohongshu-state.mjs";


function makeNumberInput(value: string, min = '1', width = '92px') {
  return createEl('input', { type: 'number', value, min, style: `width:${width};` }) as HTMLInputElement;
}

function makeTextInput(value: string, placeholder = '', width = '100%') {
  return createEl('input', { type: 'text', value, placeholder, style: `width:${width};` }) as HTMLInputElement;
}

function makeCheckbox(checked: boolean, id: string) {
 return createEl('input', { type: 'checkbox', checked, id }) as HTMLInputElement;
}

function attachTooltip(anchor: HTMLElement, text: string) {
  const tip = createEl('div', {
    style: 'position:absolute; left:0; top:100%; margin-top:4px; padding:6px 8px; background:#0f1419; border:1px solid #26437a; border-radius:6px; font-size:11px; color:#c7d2fe; z-index:20; opacity:0; pointer-events:none; transition:opacity 0.15s; max-width:320px; white-space:normal;',
  }, [text]) as HTMLDivElement;
  anchor.style.position = anchor.style.position || 'relative';
  anchor.appendChild(tip);
  anchor.addEventListener('mouseenter', () => { tip.style.opacity = '1'; });
  anchor.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
}

function bindSectionToggle(toggle: HTMLInputElement, body: HTMLElement) {
  const refresh = () => {
    body.style.display = toggle.checked ? '' : 'none';
  };
  toggle.addEventListener('change', refresh);
  setTimeout(refresh, 0);
}


const INPUT_HISTORY_MAX = 10;
const XHS_LAST_CONFIG_KEY = 'webauto.xhs.lastConfig.v1';
const XHS_NAV_MODE_KEY = 'webauto.xhs.navigationMode.v1';

function readInputHistory(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(`webauto.xhs.history.${key}`) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeInputHistory(key: string, values: string[]) {
  const next = Array.from(new Set(values.map((x) => String(x || '').trim()).filter(Boolean))).slice(0, INPUT_HISTORY_MAX);
  try {
    window.localStorage.setItem(`webauto.xhs.history.${key}`, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}


type XhsLastConfig = {
  orchestrateMode?: string;
  keyword?: string;
  env?: string;
  accountMode?: string;
  singleProfile?: string;
  shardProfiles?: string[];
  maxNotes?: string;
  dryRun?: boolean;
  protocolMode?: boolean;
  headless?: boolean;
  doHomepage?: boolean;
  doImages?: boolean;
  doComments?: boolean;
  maxComments?: string;
  commentRounds?: string;
  doGate?: boolean;
  matchKeywords?: string;
  matchMode?: string;
  matchMinHits?: string;
  doLikes?: boolean;
  maxLikes?: string;
  likeRules?: string;
  doReply?: boolean;
  replyText?: string;
  doOcr?: boolean;
  ocrCommand?: string;
  opOrder?: string;
};

function readLastConfig(): XhsLastConfig {
  try {
    const raw = window.localStorage.getItem(XHS_LAST_CONFIG_KEY) || '{}';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLastConfig(next: XhsLastConfig) {
  try {
    window.localStorage.setItem(XHS_LAST_CONFIG_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

function bindInputHistory(input: HTMLInputElement, key: string, api?: any): () => void {
  const safeId = `xh-history-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  let listEl = document.getElementById(safeId) as HTMLDataListElement | null;
  if (!listEl) {
    listEl = createEl('datalist', { id: safeId }) as HTMLDataListElement;
    document.body.appendChild(listEl);
  }

  const refreshOptions = () => {
    if (!listEl) return;
    listEl.innerHTML = '';
    readInputHistory(key).forEach((item) => {
      listEl?.appendChild(createEl('option', { value: item }));
    });
  };

  const persistCurrent = () => {
    const value = String(input.value || '').trim();
    if (!value) return;
    const next = [value, ...readInputHistory(key)];
    writeInputHistory(key, next);
    refreshOptions();
  };

  const removeCurrent = () => {
    const value = String(input.value || '').trim();
    if (!value) return;
    const next = readInputHistory(key).filter((item) => item !== value);
    writeInputHistory(key, next);
    refreshOptions();
    api?.appendLog?.(`[history] removed key=${key} value=${value}`);
  };

  input.setAttribute('list', safeId);
  input.setAttribute('autocomplete', 'on');

  input.addEventListener('focus', refreshOptions);
  input.addEventListener('blur', persistCurrent);
  input.addEventListener('change', persistCurrent);
  input.addEventListener('keydown', (evt) => {
    // Ctrl+Shift+Backspace: delete current value from this input's history
    if (evt.ctrlKey && evt.shiftKey && evt.key === 'Backspace') {
      evt.preventDefault();
      removeCurrent();
    }
  });

  refreshOptions();
  return persistCurrent;
}

type LikeRuleKind = 'contains' | 'and' | 'include_without';

type LikeRuleDraft = {
  kind: LikeRuleKind;
  a: string;
  b?: string;
};

function stringifyLikeRule(rule: LikeRuleDraft): string {
  const a = String(rule.a || '').trim();
  const b = String(rule.b || '').trim();
  if (rule.kind === 'contains') return a;
  if (rule.kind === 'and') return `{${a} + ${b}}`;
  return `{${a} - ${b}}`;
}


function parseLikeRuleToken(token: string): LikeRuleDraft | null {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const m = raw.match(/^\{\s*(.+?)\s*([+\-＋－])\s*(.+?)\s*\}$/);
  if (!m) return { kind: 'contains', a: raw };
  const a = String(m[1] || '').trim();
  const b = String(m[3] || '').trim();
  if (!a || !b) return null;
  const op = m[2] === '＋' ? '+' : m[2] === '－' ? '-' : m[2];
  return op === '+' ? { kind: 'and', a, b } : { kind: 'include_without', a, b };
}

function parseLikeRulesCsv(value: string): LikeRuleDraft[] {
  const rows = String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
  const out: LikeRuleDraft[] = [];
  for (const row of rows) {
    const parsed = parseLikeRuleToken(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

function likeRuleGuide(kind: LikeRuleKind): { title: string; desc: string; example: string } {
  if (kind === 'and') {
    return {
      title: '同时包含（A + B）',
      desc: '同一条评论里必须同时出现 A 和 B 才命中。用于精确筛选。',
      example: '示例：{求链接 + 工作服}',
    };
  }
  if (kind === 'include_without') {
    return {
      title: '包含且排除（A - B）',
      desc: '同一条评论必须包含 A，且不能包含 B 才命中。用于过滤噪音。',
      example: '示例：{求链接 - 已买}',
    };
  }
  return {
    title: '单关键词',
    desc: '同一条评论只要包含 A 即命中。',
    example: '示例：求链接',
  };
}



let xhsCmdUnsubscribe: (() => void) | null = null;
let xhsEventsPollTimer: number | null = null;
let xhsSettingsUnsubscribe: (() => void) | null = null;
export function renderXiaohongshuTab(root: HTMLElement, api: any) {
  if (xhsCmdUnsubscribe) {
    xhsCmdUnsubscribe();
    xhsCmdUnsubscribe = null;
  }
  if (xhsEventsPollTimer != null) {
    window.clearInterval(xhsEventsPollTimer);
    xhsEventsPollTimer = null;
  }
 if (xhsSettingsUnsubscribe) {
   xhsSettingsUnsubscribe();
   xhsSettingsUnsubscribe = null;
 }

 root.innerHTML = '';



 const card = createEl('div', { className: 'card', style: 'padding:12px;' });

  const onboardingCard = createEl('div', {
    style: 'margin-bottom:0; border:1px dashed #2b67ff; border-radius:10px; padding:10px; background:#0d1a33;',
  }) as HTMLDivElement;
  const onboardingTitle = createEl('div', { style: 'font-weight:600; margin-bottom:4px; color:#dbeafe;' }, ['首次引导：先配置账号']);
  const onboardingSummary = createEl('div', { className: 'muted', style: 'font-size:12px; margin-bottom:4px;' }, ['正在加载 profile...']) as HTMLDivElement;
  const onboardingTips = createEl('div', { className: 'muted', style: 'font-size:12px; margin-bottom:8px;' }, [
    '请先在预处理页创建 profile，并设置账号名（alias），这里会按“账号名 (profileId)”显示。',
  ]) as HTMLDivElement;
  const onboardingGotoPreflightBtn = createEl('button', { type: 'button', className: 'secondary' }, ['去预处理设置账号']) as HTMLButtonElement;
  onboardingGotoPreflightBtn.onclick = () => {
    if (typeof api?.setActiveTab === 'function') api.setActiveTab('preflight');
  };
  onboardingCard.appendChild(onboardingTitle);
  onboardingCard.appendChild(onboardingSummary);
  onboardingCard.appendChild(onboardingTips);
  onboardingCard.appendChild(createEl('div', { className: 'row', style: 'margin-bottom:0;' }, [onboardingGotoPreflightBtn]));

 // 强制导航模式：用户无法关闭，引导完成前隐藏配置详情
 const navigationModeEnabled = true;
 const navStepHint = createEl('div', { className: 'muted', style: 'font-size:12px;' }, ['导航模式：先账号检查，再点赞设置，最后回到运行看板。']) as HTMLDivElement;
 
 // 引导步骤状态管理
 const GUIDE_STATE_KEY = 'webauto.xhs.guideState.v1';
 const readGuideState = () => {
   try {
     const raw = window.localStorage.getItem(GUIDE_STATE_KEY);
     return raw ? JSON.parse(raw) : { browserReady: false, accountReady: false, keywordSet: false };
   } catch { return { browserReady: false, accountReady: false, keywordSet: false }; }
 };
 const saveGuideState = (s: any) => {
   try { window.localStorage.setItem(GUIDE_STATE_KEY, JSON.stringify(s)); } catch {}
 };
 let guideState = readGuideState();

 // 导航向导UI（强制顺序引导）
 const guideCard = createEl('div', { 
   style: 'border:1px solid #26437a; background:#0c1830; border-radius:10px; padding:10px; margin-bottom:10px;'
 }) as HTMLDivElement;
 
 const guideTitle = createEl('div', { style: 'font-weight:600; margin-bottom:8px; color:#dbeafe;' }, ['🧭 新用户引导']) as HTMLDivElement;
 const guideProgress = createEl('div', { style: 'font-size:12px; color:#8b93a6; margin-bottom:8px;' }, ['检查进度...']) as HTMLDivElement;
 guideCard.appendChild(guideTitle);
 guideCard.appendChild(guideProgress);
 
 // 步骤1: 浏览器检查
 const browserStep = createEl('div', { style: 'margin-bottom:6px; padding:6px; background:#0f1419; border-radius:6px;' }) as HTMLDivElement;
 browserStep.appendChild(createEl('span', {}, ['1. ']));
 const browserStatus = createEl('span', { style: 'color:#f59e0b;' }, ['⏳ 检查浏览器']) as HTMLSpanElement;
 browserStep.appendChild(browserStatus);
 guideCard.appendChild(browserStep);
 
 // 步骤2: 账号检查
 const accountStep = createEl('div', { style: 'margin-bottom:6px; padding:6px; background:#0f1419; border-radius:6px;' }) as HTMLDivElement;
 accountStep.appendChild(createEl('span', {}, ['2. ']));
 const accountStatus = createEl('span', { style: 'color:#f59e0b;' }, ['⏳ 配置账号']) as HTMLSpanElement;
 accountStatus.style.cursor = 'pointer';
 accountStatus.title = '点击开始账号检查与交互配置';
 accountStatus.addEventListener('click', () => runInteractiveAccountCheck());
 accountStep.appendChild(accountStatus);
 guideCard.appendChild(accountStep);
 
 // 步骤3: 关键字配置
 const keywordStep = createEl('div', { style: 'margin-bottom:6px; padding:6px; background:#0f1419; border-radius:6px;' }) as HTMLDivElement;
 keywordStep.appendChild(createEl('span', {}, ['3. ']));
 const keywordStatus = createEl('span', { style: 'color:#f59e0b;' }, ['⏳ 配置关键词']) as HTMLSpanElement;
 keywordStep.appendChild(keywordStatus);
 guideCard.appendChild(keywordStep);
 
 // 步骤4: 完成
 const completeStep = createEl('div', { style: 'margin-bottom:6px; padding:6px; background:#0f1419; border-radius:6px; display:none;' }) as HTMLDivElement;
 completeStep.appendChild(createEl('span', {}, ['✅ ']));
 completeStep.appendChild(createEl('span', { style: 'color:#22c55e;' }, ['准备就绪，可以开始运行']));
 guideCard.appendChild(completeStep);
 
 const startRunBtn = createEl('button', { type: 'button', style: 'display:none; margin-top:8px; width:100%;' }, ['开始运行']) as HTMLButtonElement;
 guideCard.appendChild(startRunBtn);

 const tileLane = createEl('div', { className: 'xhs-tile-lane' }) as HTMLDivElement;
  const tileRegistry = new Map<string, HTMLDivElement>();
  let activeTileId = 'board';

  const setActiveTile = (id: string) => {
    activeTileId = id;
    tileRegistry.forEach((tileEl, tileId) => {
      tileEl.classList.toggle('active', tileId === id);
    });
  };

  const createTile = (id: string, titleText: string) => {
    const tile = createEl('section', { className: 'xhs-tile', 'data-xhs-tile': id }) as HTMLDivElement;
    const head = createEl('div', { className: 'xhs-tile-head' }, [titleText]);
    const body = createEl('div', { className: 'xhs-tile-body' }) as HTMLDivElement;
    tile.addEventListener('pointerdown', () => setActiveTile(id), { capture: true });
    tile.onclick = () => setActiveTile(id);
    tile.appendChild(head);
    tile.appendChild(body);
    tileRegistry.set(id, tile);
    return { tile, body };
  };
  const focusTile = (id: string) => {
    const tile = tileRegistry.get(id);
    if (!tile) return;
    setActiveTile(id);
    tile.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  const resolveTileIdFromEvent = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return '';
    const tileEl = target.closest('[data-xhs-tile]') as HTMLElement | null;
    return String(tileEl?.dataset?.xhsTile || '').trim();
  };

  tileLane.addEventListener(
    'wheel',
    (evt) => {
      const sourceTileId = resolveTileIdFromEvent(evt.target);
      if (!sourceTileId || sourceTileId !== activeTileId) return;

      const baseDelta = Math.abs(evt.deltaY) >= Math.abs(evt.deltaX) ? evt.deltaY : evt.deltaX;
      if (!Number.isFinite(baseDelta) || baseDelta === 0) return;

      const deltaFactor = evt.deltaMode === 1
        ? 18
        : evt.deltaMode === 2
          ? Math.max(240, tileLane.clientWidth * 0.85)
          : 1;

      evt.preventDefault();
      tileLane.scrollLeft += baseDelta * deltaFactor;
    },
    { passive: false, capture: true },
  );

 // 旧导航按钮已移除，由向导流程替代

  // 引导与锁定：未完成前强制只允许账号检查入口
  const guideLockMask = createEl('div', {
    style: 'position:absolute; inset:0; background:rgba(10,14,24,0.72); border:1px dashed #26437a; border-radius:10px; display:none; align-items:center; justify-content:center; z-index:5; color:#c7d2fe; text-align:center; padding:12px; font-size:12px;',
  }, ['请先完成引导：浏览器检查、账号登录、关键词配置']) as HTMLDivElement;

  const isKeywordReady = () => String(keywordInput.value || '').trim().length > 0;

  const runQuickBrowserCheck = async () => {
    const script = window.api.pathJoin('scripts', 'browser-status.mjs');
    const args = [script, String(profilePickSel.value || ''), '--site', 'xiaohongshu'];
    try {
      await window.api.cmdSpawn({ title: 'browser-status quick-check', cwd: '', args, groupKey: 'xiaohongshu' });
      guideState.browserReady = true;
      browserStatus.textContent = '✅ 浏览器检查已触发';
      browserStatus.style.color = '#22c55e';
    } catch {
      guideState.browserReady = false;
      browserStatus.textContent = '❌ 浏览器检查失败';
      browserStatus.style.color = '#ef4444';
    }
    saveGuideState(guideState);
  };

 const applyGuideLock = () => {
    const accountReady = guideState.accountReady;
    const keywordReady = isKeywordReady();
    guideState.keywordSet = keywordReady;

    // 强制项高亮：关键词为空时高亮
    keywordInput.style.borderColor = keywordReady ? '' : '#ef4444';
    keywordInput.style.backgroundColor = keywordReady ? '' : '#2a1515';

    accountStatus.textContent = accountReady ? '✅ 已有可用账号' : '⏳ 至少登录1个账号';
    accountStatus.style.color = accountReady ? '#22c55e' : '#f59e0b';
    keywordStatus.textContent = keywordReady ? '✅ 关键词已配置' : '⏳ 请先配置关键词';
    keywordStatus.style.color = keywordReady ? '#22c55e' : '#f59e0b';

    const allReady = Boolean(guideState.browserReady && accountReady && keywordReady);
    guideProgress.textContent = allReady
      ? '引导完成，可查看全部配置并运行。'
      : `引导未完成：browser=${guideState.browserReady ? 'ok' : 'pending'} account=${accountReady ? 'ok' : 'pending'} keyword=${keywordReady ? 'ok' : 'pending'}`;

    completeStep.style.display = allReady ? '' : 'none';
    startRunBtn.style.display = allReady ? '' : 'none';
    tileLane.style.pointerEvents = allReady ? '' : 'none';
    tileLane.style.filter = allReady ? '' : 'blur(1px)';
    guideLockMask.style.display = allReady ? 'none' : 'flex';

    if (!allReady) {
      setActiveTile('account');
      const accountTile = tileRegistry.get('account');
      if (accountTile) accountTile.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
    saveGuideState(guideState);
 };

  const runInteractiveAccountCheck = async () => {
    const selectedProfile = String(profilePickSel.value || '').trim();
    if (!selectedProfile) {
      guideState.accountReady = false;
      applyGuideLock();
      if (typeof api?.setActiveTab === 'function') {
        api.setActiveTab('preflight');
      }
      alert('请先在预处理页创建或选择一个账号');
      return;
    }

    // 交互式询问：是否改名
    const wantRename = window.confirm('是否要为当前账号设置/修改易读名称（alias）？');
    if (wantRename) {
      const nextAlias = window.prompt('请输入账号显示名称（alias）：', '');
      if (nextAlias && String(nextAlias).trim()) {
        try {
          const aliases = (api?.settings?.profileAliases && typeof api.settings.profileAliases === 'object')
            ? { ...api.settings.profileAliases }
            : {};
          aliases[selectedProfile] = String(nextAlias).trim();
          const nextSettings = await window.api.settingsSet({
            profileAliases: aliases,
          });
          api.settings = nextSettings;
        } catch {
          alert('alias 保存失败，请检查设置权限');
        }
      }
    }

    // 交互式询问：是否新增账号
    const wantAdd = window.confirm('是否立即新增账号？（将打开 headful/camoufox 登录）');
    if (wantAdd) {
      // 提醒用户设置alias
      window.alert('新增账号后，系统将自动获取用户名作为默认别名，您也可以手动修改。');
      accountAddBtn.click();
    }

    guideState.accountReady = true;
    applyGuideLock();
  };

 card.appendChild(guideCard);

  // Base params
  const orchestrateModeSelect = createEl('select', { style: 'width:280px;' }) as HTMLSelectElement;
  orchestrateModeSelect.appendChild(createEl('option', { value: 'phase1-phase2-unified', selected: true }, ['完整编排：Phase1 + Phase2 + Unified']));
  orchestrateModeSelect.appendChild(createEl('option', { value: 'phase1-phase2' }, ['仅预处理：Phase1 + Phase2']));
  orchestrateModeSelect.appendChild(createEl('option', { value: 'phase1-only' }, ['仅启动浏览器：Phase1']));
  orchestrateModeSelect.appendChild(createEl('option', { value: 'unified-only' }, ['仅执行 Unified（使用已有 links）']));

  const keywordInput = makeTextInput('黄金走势', '关键词');
  const envInput = makeTextInput('debug', 'env');
  const accountModeSelect = createEl('select', { style: 'width:220px;' }) as HTMLSelectElement;
  accountModeSelect.appendChild(createEl('option', { value: 'single', selected: true }, ['单账号（一个 profile）']));
  accountModeSelect.appendChild(createEl('option', { value: 'shards' }, ['分片并发（多个 profiles）']));
  const profilePickSel = createEl('select', { style: 'min-width:360px; max-width:580px;' }) as HTMLSelectElement;
  profilePickSel.appendChild(createEl('option', { value: '' }, ['(请选择账号：alias / profile)']));
  const profileRefreshBtn = createEl('button', { type: 'button', className: 'secondary' }, ['刷新 profiles']) as HTMLButtonElement;
  const shardProfilesBox = createEl('div', {
    className: 'list',
    style: 'width:100%; max-height:156px; overflow:auto; border:1px solid #1f2937; border-radius:6px; padding:6px;',
  });
  const shardProfilesHint = createEl('div', { className: 'muted', style: 'font-size:12px; margin-top:6px;' }, ['selected=0']) as HTMLDivElement;
  const shardResolvedHint = createEl('div', { className: 'muted', style: 'font-size:12px; margin-top:4px;' }, ['']) as HTMLDivElement;
  const maxNotesInput = makeNumberInput('100', '1');
  const dryRunCheckbox = makeCheckbox(true, 'xh-dry-run');
  const protocolModeCheckbox = makeCheckbox(true, 'xh-protocol-mode');
  const headlessCheckbox = makeCheckbox(true, 'xh-headless');

  const modeHint = createEl('div', { style: 'margin-bottom:8px; color:#64748b; font-size:12px;' }, [
    '完整编排推荐：先 Phase1 启动，再 Phase2 采集链接，最后 Unified 采集评论/点赞。',
  ]);

  // 基础参数 - 3列Tile布局
  const baseParamsTile = createEl('div', { style: 'display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:10px;' });
  
  // Tile 1: 编排与关键词
  const tileBase1 = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  tileBase1.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['📋 编排设置']));
  tileBase1.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['模式']), orchestrateModeSelect,
  ]));
  tileBase1.appendChild(createEl('div', { className: 'row', style: 'gap:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['关键词']), keywordInput,
  ]));
  baseParamsTile.appendChild(tileBase1);
  
  // Tile 2: 环境与账号
  const tileBase2 = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  tileBase2.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['🔧 环境账号']));
  tileBase2.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['环境']), envInput,
  ]));
  tileBase2.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['账号模式']), accountModeSelect,
  ]));
  const singleProfileRow = createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['单账号（账号名 / profile）']), profilePickSel, profileRefreshBtn,
  ]) as HTMLDivElement;
  const singleProfileHint = createEl('div', { className: 'muted', style: 'font-size:12px; margin:-2px 0 6px 0;' }, [
    '当前实际使用：(未选择账号)',
  ]) as HTMLDivElement;
  const shardProfilesSection = createEl('div', { style: 'margin-top:6px;' }) as HTMLDivElement;
  shardProfilesSection.appendChild(createEl('div', { className: 'muted', style: 'font-size:12px; margin-bottom:4px;' }, ['分片 profiles（仅分片模式生效）']));
  shardProfilesSection.appendChild(shardProfilesBox);
  shardProfilesSection.appendChild(shardProfilesHint);
  shardProfilesSection.appendChild(shardResolvedHint);
  tileBase2.appendChild(singleProfileRow);
  tileBase2.appendChild(singleProfileHint);
  tileBase2.appendChild(shardProfilesSection);
  shardProfilesBox.style.marginTop = '0';

  const accountAuditSummary = createEl('div', { className: 'muted', style: 'font-size:12px;' }, ['账号检查：待刷新']) as HTMLDivElement;
  const accountAuditList = createEl('div', { className: 'xhs-account-list' }) as HTMLDivElement;
  const accountRefreshBtn = createEl('button', { type: 'button', className: 'secondary' }, ['检查账号状态']) as HTMLButtonElement;
  const accountLiveProbeBtn = createEl('button', { type: 'button', className: 'secondary' }, ['实时探测登录']) as HTMLButtonElement;
  const addAccountCountInput = makeNumberInput('1', '1', '64px');
  const addBatchNameInput = makeTextInput('', '账号名前缀（默认当前 batch / xiaohongshu）', '220px');
  const accountAddBtn = createEl('button', { type: 'button' }, ['新增账号（headful/camoufox）']) as HTMLButtonElement;
  const accountNextLikeBtn = createEl('button', { type: 'button', className: 'secondary' }, ['下一步：点赞设置']) as HTMLButtonElement;

  const accountAuditCard = createEl('div', { className: 'xhs-compact-card' });
  accountAuditCard.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:6px; color:#dbeafe;' }, ['账号检查与新增']));
  accountAuditCard.appendChild(accountAuditSummary);
  accountAuditCard.appendChild(accountAuditList);
  accountAuditCard.appendChild(createEl('div', { className: 'row', style: 'margin-top:8px; margin-bottom:6px;' }, [
    accountRefreshBtn,
    accountLiveProbeBtn,
    createEl('label', { style: 'font-size:12px; color:#8b93a6;' }, ['新增账号数']),
    addAccountCountInput,
    createEl('label', { style: 'font-size:12px; color:#8b93a6;' }, ['账号名前缀']),
    addBatchNameInput,
    accountAddBtn,
  ]));
  accountAuditCard.appendChild(createEl('div', { className: 'row', style: 'margin-bottom:0;' }, [accountNextLikeBtn]));
  tileBase2.appendChild(accountAuditCard);

  baseParamsTile.appendChild(tileBase2);
  
  // Tile 3: 运行选项
  const tileBase3 = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  tileBase3.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['⚙️ 运行选项']));
  tileBase3.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['目标帖子']), maxNotesInput,
  ]));
  tileBase3.appendChild(createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:6px;' }, [
    dryRunCheckbox,
    createEl('label', { htmlFor: 'xh-dry-run', style: 'font-size:12px; color:#a87b00; cursor:pointer;' }, ['Dry Run']),
  ]));
  tileBase3.appendChild(createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:6px;' }, [
    headlessCheckbox,
    createEl('label', { htmlFor: 'xh-headless', style: 'font-size:12px; color:#2b67ff; cursor:pointer;' }, ['无头模式']),
  ]));
  tileBase3.appendChild(createEl('div', { className: 'row', style: 'gap:8px;' }, [
    protocolModeCheckbox,
    createEl('label', { htmlFor: 'xh-protocol-mode', style: 'font-size:12px; color:#14532d; cursor:pointer;' }, ['协议级操作']),
  ]));
  baseParamsTile.appendChild(tileBase3);
  
  // moved into horizontal lane tiles

  const featureTiles = createEl('div', { style: 'display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:10px; align-items:start; grid-auto-rows:min-content;' });

  // 任务 1：主页采集
  const homepageToggle = makeCheckbox(false, 'xh-do-homepage');
  const imagesToggle = makeCheckbox(false, 'xh-do-images');
  const homeSection = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  homeSection.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:8px;' }, [
    homepageToggle,
    createEl('label', { htmlFor: 'xh-do-homepage', style: 'cursor:pointer; font-weight:600;' }, ['主页内容采集（正文/作者/链接）']),
  ]));
  const homeBody = createEl('div', { style: 'padding-left:24px;' });
  homeBody.appendChild(createEl('div', { className: 'row', style: 'gap:6px;' }, [
    imagesToggle,
    createEl('label', { htmlFor: 'xh-do-images', style: 'cursor:pointer;' }, ['同时下载图片']),
  ]));
 homeSection.appendChild(homeBody);
 attachTooltip(homeSection, '主页采集：抓取帖子正文、作者和主贴链接；若勾选图片下载，会额外下载图片。');
 bindSectionToggle(homepageToggle, homeBody);
  homepageToggle.addEventListener('change', () => { if (!homepageToggle.checked) imagesToggle.checked = false; });
  featureTiles.appendChild(homeSection);

  // 任务 2：评论采集
  const commentsToggle = makeCheckbox(true, 'xh-do-comments');
  const maxCommentsInput = makeNumberInput('0', '0');
  const commentRoundsInput = makeNumberInput('0', '0');
  const commentsSection = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  commentsSection.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:8px;' }, [
    commentsToggle,
    createEl('label', { htmlFor: 'xh-do-comments', style: 'cursor:pointer; font-weight:600;' }, ['评论采集']),
  ]));
  const commentsBody = createEl('div', { style: 'padding-left:24px;' });
  commentsBody.appendChild(createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:6px;' }, [
    createEl('label', { style: 'width:86px;' }, ['每帖上限(0=不限)']), maxCommentsInput,
  ]));
  commentsBody.appendChild(createEl('div', { className: 'row', style: 'gap:8px;' }, [
    createEl('label', { style: 'width:86px;' }, ['滚屏轮次(0=不限)']), commentRoundsInput,
  ]));
 commentsSection.appendChild(commentsBody);
 attachTooltip(commentsSection, '评论采集：抓取评论区内容；可配置每帖最大评论数与滚屏轮次。');
 bindSectionToggle(commentsToggle, commentsBody);
  featureTiles.appendChild(commentsSection);

  // 命中规则（用于回复或高级匹配）
  const gateToggle = makeCheckbox(false, 'xh-do-gate');
  const gateSection = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  gateSection.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:8px;' }, [
    gateToggle,
    createEl('label', { htmlFor: 'xh-do-gate', style: 'cursor:pointer; font-weight:600;' }, ['评论命中规则（用于回复/兜底匹配）']),
  ]));
  const matchKeywordsInput = makeTextInput('操底,上链接', '逗号分隔关键词');
  const matchModeSelect = createEl('select', { style: 'width:120px;' }) as HTMLSelectElement;
  matchModeSelect.appendChild(createEl('option', { value: 'any', selected: true }, ['任一命中']));
  matchModeSelect.appendChild(createEl('option', { value: 'atLeast' }, ['至少N个']));
  matchModeSelect.appendChild(createEl('option', { value: 'all' }, ['全部命中']));
  const matchMinHitsInput = makeNumberInput('2', '1', '74px');
  const gateBody = createEl('div', { style: 'padding-left:24px;' });
  gateBody.appendChild(createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:6px;' }, [
    createEl('label', { style: 'width:86px;' }, ['关键词']), matchKeywordsInput,
  ]));
  gateBody.appendChild(createEl('div', { className: 'row', style: 'gap:8px;' }, [
    createEl('label', { style: 'width:86px;' }, ['匹配模式']), matchModeSelect,
    createEl('label', { style: 'width:62px; margin-left:8px;' }, ['最少命中']), matchMinHitsInput,
  ]));
 gateSection.appendChild(gateBody);
 attachTooltip(gateSection, '命中规则：根据关键词筛选评论；通常与自动回复联动使用。');
 bindSectionToggle(gateToggle, gateBody);
  featureTiles.appendChild(gateSection);

  // 任务 4：点赞 - 3列Tile布局
  const likesToggle = makeCheckbox(false, 'xh-do-likes');
  const maxLikesInput = makeNumberInput('2', '1');
  const likesSection = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  
  // 标题行
  likesSection.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:8px;' }, [
    likesToggle,
    createEl('label', { htmlFor: 'xh-do-likes', style: 'cursor:pointer; font-weight:600;' }, ['评论点赞']),
  ]));
  
  // 3列Tile网格
  const likesBody = createEl('div', { style: 'display:grid; grid-template-columns:1fr; gap:8px;' });

  // Tile 1: 数量限制
  const tile1 = createEl('div', { style: 'border:1px solid #e2e8f0; border-radius:8px; padding:10px; background:#0f1117; display:flex; flex-direction:column;' });
  tile1.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['📊 数量限制']));
  tile1.appendChild(createEl('div', { className: 'row', style: 'gap:6px; flex-wrap:nowrap;' }, [
    createEl('label', { style: 'font-size:12px; white-space:nowrap; color:#8b93a6;' }, ['每轮滚动点赞上限']), 
    maxLikesInput,
  ]));
  likesBody.appendChild(tile1);

  // Tile 2: 匹配模式
  const likeRuleTypeSelect = createEl('select', { style: 'width:100%; font-size:12px;' }) as HTMLSelectElement;
  likeRuleTypeSelect.appendChild(createEl('option', { value: 'contains' }, ['单关键词']));
  likeRuleTypeSelect.appendChild(createEl('option', { value: 'and' }, ['同时包含 {A+B}']));
  likeRuleTypeSelect.appendChild(createEl('option', { value: 'include_without' }, ['包含排除 {A-B}']));
  
  const tile2 = createEl('div', { style: 'border:1px solid #e2e8f0; border-radius:8px; padding:10px; background:#0f1117; display:flex; flex-direction:column;' });
  tile2.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['🎯 匹配模式']));
  tile2.appendChild(likeRuleTypeSelect);
  
  const likeRuleHelp = createEl('div', { style: 'color:#8b93a6; font-size:10px; margin-top:6px; line-height:1.4;' });
  tile2.appendChild(likeRuleHelp);
  likesBody.appendChild(tile2);

  // Tile 3: 添加规则
  const likeRuleAInput = makeTextInput('', '词A', '100%');
  const likeRuleBInput = makeTextInput('', '词B (可选)', '100%');
  const addLikeRuleBtn = createEl('button', { type: 'button', style: 'width:100%; font-size:12px;' }, ['+ 添加规则']) as HTMLButtonElement;
  
  const tile3 = createEl('div', { style: 'border:1px solid #e2e8f0; border-radius:8px; padding:10px; background:#0f1117; display:flex; flex-direction:column;' });
  tile3.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['➕ 添加规则']));
  tile3.appendChild(createEl('div', { style: 'margin-bottom:6px;' }, [likeRuleAInput]));
  tile3.appendChild(createEl('div', { style: 'margin-bottom:6px;' }, [likeRuleBInput]));
  tile3.appendChild(addLikeRuleBtn);
  likesBody.appendChild(tile3);

  // 规则列表（横跨3列）
  const likeRules: LikeRuleDraft[] = [
    { kind: 'contains', a: '操底' },
    { kind: 'contains', a: '上链接' },
  ];
  
  const likeRuleList = createEl('div', { style: 'display:flex; flex-wrap:wrap; gap:6px;' });
  const likeRulePreview = createEl('input', { type: 'hidden', readOnly: true }) as HTMLInputElement;

  const refreshLikeGuide = () => {
    const kind = (likeRuleTypeSelect.value || 'contains') as LikeRuleKind;
    const g = likeRuleGuide(kind);
    likeRuleHelp.textContent = `${g.title}：${g.desc}`;
    likeRuleBInput.disabled = kind === 'contains';
    likeRuleBInput.style.opacity = kind === 'contains' ? '0.5' : '1';
    likeRuleBInput.placeholder = kind === 'contains' ? '(单关键词无需词B)' : '词B';
    if (kind === 'contains') likeRuleBInput.value = '';
  };

  const refreshLikeRuleList = () => {
    likeRuleList.innerHTML = '';
    if (likeRules.length === 0) {
      likeRuleList.appendChild(createEl('span', { style: 'color:#666; font-size:11px;' }, ['暂无规则']));
    }
    likeRules.forEach((rule, idx) => {
      const chip = createEl('div', {
        style: 'display:inline-flex; align-items:center; gap:4px; background:#1b2233; border:1px solid #2b67ff; border-radius:6px; padding:4px 8px; font-size:12px;',
      });
      chip.appendChild(createEl('span', {}, [stringifyLikeRule(rule)]));
      const rmBtn = createEl('span', { style: 'cursor:pointer; color:#ff6b6b; margin-left:4px; font-weight:bold;' }, ['×']) as HTMLSpanElement;
      rmBtn.onclick = () => {
        likeRules.splice(idx, 1);
        refreshLikeRuleList();
        persistLastConfig();
      };
      chip.appendChild(rmBtn);
      likeRuleList.appendChild(chip);
    });
    likeRulePreview.value = likeRules.map((rule) => stringifyLikeRule(rule)).join(',');
  };

  addLikeRuleBtn.onclick = () => {
    const kind = (likeRuleTypeSelect.value || 'contains') as LikeRuleKind;
    const a = String(likeRuleAInput.value || '').trim();
    const b = String(likeRuleBInput.value || '').trim();

    if (!a) {
      alert('请先填写词A');
      return;
    }
    if (kind !== 'contains' && !b) {
      alert('当前规则需要词B');
      return;
    }

    likeRules.push({ kind, a, b: kind === 'contains' ? '' : b });
    persistLikeRuleAHistory();
    persistLikeRuleBHistory();
    likeRuleAInput.value = '';
    likeRuleBInput.value = '';
    refreshLikeRuleList();
    persistLastConfig();
  };

  likeRuleTypeSelect.onchange = refreshLikeGuide;

  const persistedConfig = readLastConfig();
  const persistedLikeRules = parseLikeRulesCsv(String(persistedConfig.likeRules || ''));
  if (persistedLikeRules.length > 0) {
    likeRules.splice(0, likeRules.length, ...persistedLikeRules);
  }

  refreshLikeGuide();
  refreshLikeRuleList();

  // 规则列表单独一行（横跨3列）
  const ruleListRow = createEl('div', { style: 'grid-column:span 1; margin-top:4px; border:1px solid #23262f; border-radius:8px; padding:8px; background:#0b1220;' });
  ruleListRow.appendChild(createEl('div', { style: 'font-size:11px; color:#8b93a6; margin-bottom:6px;' }, ['已添加规则（点击 × 删除）：']));
  ruleListRow.appendChild(likeRuleList);
  likesBody.appendChild(ruleListRow);
 likesSection.appendChild(likesBody);
 attachTooltip(likesSection, '评论点赞：按规则对评论点赞；需配置关键词规则和点赞上限。');
 const likeNextBoardBtn = createEl('button', { type: 'button', className: 'secondary' }, ['点赞设置完成：回看板']) as HTMLButtonElement;
  likesSection.appendChild(createEl('div', { className: 'row', style: 'margin-top:8px; margin-bottom:0;' }, [likeNextBoardBtn]));
  bindSectionToggle(likesToggle, likesBody);
  featureTiles.appendChild(likesSection);
  // 任务 5：回复
  const replyToggle = makeCheckbox(false, 'xh-do-reply');
  const replyTextInput = makeTextInput('感谢分享，已关注', '回复内容');
  const replySection = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  replySection.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:8px;' }, [
    replyToggle,
    createEl('label', { htmlFor: 'xh-do-reply', style: 'cursor:pointer; font-weight:600;' }, ['自动回复（开发态，不发送）']),
  ]));
  const replyBody = createEl('div', { style: 'padding-left:24px;' });
  replyBody.appendChild(createEl('div', { className: 'row', style: 'gap:8px;' }, [
    createEl('label', { style: 'width:86px;' }, ['回复文本']), replyTextInput,
  ]));
 replySection.appendChild(replyBody);
 attachTooltip(replySection, '自动回复：对命中规则的评论执行回复；必须配合“评论命中规则”开启。');
 bindSectionToggle(replyToggle, replyBody);
  featureTiles.appendChild(replySection);

  const ocrToggle = makeCheckbox(false, 'xh-do-ocr');
  const ocrSection = createEl('div', { style: 'border:1px solid #eee; border-radius:8px; padding:10px;' });
  ocrSection.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:8px;' }, [
    ocrToggle,
    createEl('label', { htmlFor: 'xh-do-ocr', style: 'cursor:pointer; font-weight:600;' }, ['图片 OCR（DeepSeek OCR）']),
  ]));
  const ocrCommandInput = makeTextInput('', 'OCR命令（留空自动: deepseek-ocr 或 dsocr）');
  const ocrBody = createEl('div', { style: 'padding-left:24px;' });
  ocrBody.appendChild(createEl('div', { className: 'row', style: 'gap:8px;' }, [
    createEl('label', { style: 'width:86px;' }, ['OCR命令']), ocrCommandInput,
  ]));
  ocrSection.appendChild(ocrBody);
  bindSectionToggle(ocrToggle, ocrBody);
  featureTiles.appendChild(ocrSection);

  // moved into horizontal lane tiles

  const opOrderInput = makeTextInput('', '执行顺序列表（留空使用默认编排）');
  const opOrderRow = createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:12px;' }, [
    createEl('label', { style: 'width:86px;' }, ['执行顺序']), opOrderInput,
  ]);
  // moved into horizontal lane tiles

  const applyPersistedValue = (input: HTMLInputElement | HTMLSelectElement, value: unknown) => {
    if (value === undefined || value === null) return;
    const textValue = String(value).trim();
    if (!textValue) return;
    input.value = textValue;
  };

  applyPersistedValue(orchestrateModeSelect, persistedConfig.orchestrateMode);
  applyPersistedValue(keywordInput, persistedConfig.keyword);
  applyPersistedValue(envInput, persistedConfig.env);
  applyPersistedValue(accountModeSelect, persistedConfig.accountMode);
  applyPersistedValue(maxNotesInput, persistedConfig.maxNotes);
  applyPersistedValue(maxCommentsInput, persistedConfig.maxComments);
  applyPersistedValue(commentRoundsInput, persistedConfig.commentRounds);
  applyPersistedValue(matchKeywordsInput, persistedConfig.matchKeywords);
  applyPersistedValue(matchModeSelect, persistedConfig.matchMode);
  applyPersistedValue(matchMinHitsInput, persistedConfig.matchMinHits);
  applyPersistedValue(maxLikesInput, persistedConfig.maxLikes);
  applyPersistedValue(replyTextInput, persistedConfig.replyText);
  applyPersistedValue(ocrCommandInput, persistedConfig.ocrCommand);
  applyPersistedValue(opOrderInput, persistedConfig.opOrder);

  if (typeof persistedConfig.dryRun === 'boolean') dryRunCheckbox.checked = persistedConfig.dryRun;
  if (typeof persistedConfig.protocolMode === 'boolean') protocolModeCheckbox.checked = persistedConfig.protocolMode;
  if (typeof persistedConfig.headless === 'boolean') headlessCheckbox.checked = persistedConfig.headless;
  if (typeof persistedConfig.doHomepage === 'boolean') homepageToggle.checked = persistedConfig.doHomepage;
  if (typeof persistedConfig.doImages === 'boolean') imagesToggle.checked = persistedConfig.doImages;
  if (!homepageToggle.checked) imagesToggle.checked = false;
  if (typeof persistedConfig.doComments === 'boolean') commentsToggle.checked = persistedConfig.doComments;
  if (typeof persistedConfig.doGate === 'boolean') gateToggle.checked = persistedConfig.doGate;
  if (typeof persistedConfig.doLikes === 'boolean') likesToggle.checked = persistedConfig.doLikes;
  if (typeof persistedConfig.doReply === 'boolean') replyToggle.checked = persistedConfig.doReply;
  if (typeof persistedConfig.doOcr === 'boolean') ocrToggle.checked = persistedConfig.doOcr;

  const persistedSingleProfile = String(persistedConfig.singleProfile || '').trim();
  const persistedShardProfiles = new Set(
    Array.isArray(persistedConfig.shardProfiles)
      ? persistedConfig.shardProfiles.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
  );

  const statsSection = createEl('div', {
    style: 'border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:12px; background:#0b1220;',
  });

  // 单行横向统计：节省垂直空间
  const statsRow = createEl('div', {
    className: 'row',
    style: 'flex-wrap: nowrap; gap: 16px; margin-bottom: 8px; font-size: 12px; overflow-x: auto;',
  });
  const linksStat = createEl('span', { className: 'muted' }, ['链接：0/0']) as HTMLSpanElement;
  const postsStat = createEl('span', { className: 'muted' }, ['帖子：0']) as HTMLSpanElement;
  const commentsStat = createEl('span', { className: 'muted' }, ['评论：0/不限']) as HTMLSpanElement;
  const likesStat = createEl('span', { className: 'muted' }, ['点赞：0']) as HTMLSpanElement;
  const repliesStat = createEl('span', { className: 'muted' }, ['回复：0']) as HTMLSpanElement;
  const streamStat = createEl('span', { className: 'muted', style: 'font-size:11px;' }, ['事件流：未绑定']) as HTMLSpanElement;

  [linksStat, postsStat, commentsStat, likesStat, repliesStat, streamStat].forEach(el => statsRow.appendChild(el));
  statsSection.appendChild(statsRow);

  const likedTitle = createEl('div', { style: 'margin-top:8px; font-weight:600;' }, ['已点赞帖子']) as HTMLDivElement;
  const likedList = createEl('div', { style: 'display:flex; flex-direction:column; gap:6px; margin-top:6px;' }) as HTMLDivElement;
  const repliedTitle = createEl('div', { style: 'margin-top:10px; font-weight:600;' }, ['已回复帖子']) as HTMLDivElement;
  const repliedList = createEl('div', { style: 'display:flex; flex-direction:column; gap:6px; margin-top:6px;' }) as HTMLDivElement;
  statsSection.appendChild(likedTitle);
  statsSection.appendChild(likedList);
  statsSection.appendChild(repliedTitle);
  statsSection.appendChild(repliedList);
  // moved into horizontal lane tiles

  const boardTile = createTile('board', '运行看板');
  boardTile.body.appendChild(statsSection);

  const likeTile = createTile('like', '点赞设置');
  likeTile.body.appendChild(likesSection);

  const accountTile = createTile('account', '账号检查与登录引导');
  accountTile.body.appendChild(onboardingCard);
  accountTile.body.appendChild(tileBase2);

  const runTile = createTile('run', '编排与运行参数');
  runTile.body.appendChild(tileBase1);
  runTile.body.appendChild(tileBase3);
  runTile.body.appendChild(createEl('div', { className: 'xhs-compact-card' }, [modeHint]));
  runTile.body.appendChild(createEl('div', { className: 'xhs-compact-card' }, [opOrderRow]));

  const commentTile = createTile('comment', '评论与回复设置');
  commentTile.body.appendChild(commentsSection);
  commentTile.body.appendChild(gateSection);
  commentTile.body.appendChild(replySection);

  const collectTile = createTile('collect', '主页采集与OCR');
  collectTile.body.appendChild(homeSection);
  collectTile.body.appendChild(ocrSection);

 [boardTile.tile, likeTile.tile, accountTile.tile, runTile.tile, commentTile.tile, collectTile.tile].forEach((tile) => tileLane.appendChild(tile));
 tileLane.style.position = 'relative';
 tileLane.appendChild(guideLockMask);
 card.appendChild(tileLane);

  accountNextLikeBtn.onclick = () => focusTile('like');
  likeNextBoardBtn.onclick = () => focusTile('board');

  queueMicrotask(() => {
    runQuickBrowserCheck().finally(() => {
      navStepHint.textContent = '第1步：先完成账号检查/登录，再配置关键词。';
      applyGuideLock();
    });
  });

  const parentDir = (inputPath: string) => {
    const p = String(inputPath || '');
    const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return slash > 0 ? p.slice(0, slash) : '';
  };

  const liveStats = {
    linksCollected: 0,
    linksTarget: 0,
    postsProcessed: 0,
    currentCommentsCollected: 0,
    currentCommentsTarget: '不限',
    likesTotal: 0,
    repliesTotal: 0,
    eventsPath: '',
    noteId: '',
  };

  let sessionStartMs = Date.now();
  let eventsOffset = 0;
  let eventsCarry = '';
  const activeUnifiedRunIds = new Set<string>();
  const processedNotes = new Set<string>();
  const noteAgg = new Map<string, { liked: number; replied: number; comments: number; path: string }>();
  const runDoneAgg = new Map<string, { processed: number; liked: number; replied: number }>();
  const likedNotes = new Map<string, { count: number; path: string }>();
  const repliedNotes = new Map<string, { count: number; path: string }>();

  const renderActionList = (container: HTMLDivElement, items: Map<string, { count: number; path: string }>, emptyText: string) => {
    container.innerHTML = '';
    if (items.size === 0) {
      container.appendChild(createEl('div', { className: 'muted' }, [emptyText]));
      return;
    }
    Array.from(items.entries()).forEach(([noteId, item]) => {
      const row = createEl('div', { className: 'row', style: 'justify-content:space-between; gap:8px; border:1px solid #1f2937; border-radius:6px; padding:6px 8px;' });
      row.appendChild(createEl('span', { className: 'muted' }, [`${noteId} × ${item.count}`]));
      const openBtn = createEl('button', { type: 'button', className: 'secondary', style: 'padding:2px 8px;' }, ['打开目录']) as HTMLButtonElement;
      openBtn.onclick = async () => {
        const targetPath = String(item.path || '').trim();
        if (!targetPath) {
          alert('该帖子暂无目录信息');
          return;
        }
        const ret = await window.api.osOpenPath(targetPath);
        if (!ret?.ok) alert(`打开失败：${ret?.error || 'unknown_error'}`);
      };
      row.appendChild(openBtn);
      container.appendChild(row);
    });
  };

  const renderLiveStats = () => {
    linksStat.textContent = `链接采集：${liveStats.linksCollected}/${liveStats.linksTarget || 0}`;
    postsStat.textContent = `帖子处理：${liveStats.postsProcessed}`;
    commentsStat.textContent = `当前帖子评论：${liveStats.currentCommentsCollected}/${liveStats.currentCommentsTarget}`;
    likesStat.textContent = `总点赞：${liveStats.likesTotal}`;
    repliesStat.textContent = `总回复：${liveStats.repliesTotal}`;
    const shardHint = activeUnifiedRunIds.size > 0 ? `（分片run=${activeUnifiedRunIds.size}）` : '';
    streamStat.textContent = liveStats.eventsPath ? `事件流${shardHint}：${liveStats.eventsPath}` : '事件流：未绑定';
    renderActionList(likedList, likedNotes, '暂无点赞命中');
    renderActionList(repliedList, repliedNotes, '暂无回复命中');
  };

  const resetLiveStats = () => {
    liveStats.linksCollected = 0;
    liveStats.linksTarget = 0;
    liveStats.postsProcessed = 0;
    liveStats.currentCommentsCollected = 0;
    liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0 ? String(Math.floor(Number(maxCommentsInput.value || 0))) : '不限';
    liveStats.likesTotal = 0;
    liveStats.repliesTotal = 0;
    liveStats.eventsPath = '';
    liveStats.noteId = '';
    sessionStartMs = Date.now();
    eventsOffset = 0;
    eventsCarry = '';
    activeUnifiedRunIds.clear();
    processedNotes.clear();
    noteAgg.clear();
    runDoneAgg.clear();
    likedNotes.clear();
    repliedNotes.clear();
    renderLiveStats();
  };

  const applyUnifiedTotals = () => {
    let likesFromNotes = 0;
    let repliesFromNotes = 0;
    noteAgg.forEach((v) => {
      likesFromNotes += Number(v.liked || 0);
      repliesFromNotes += Number(v.replied || 0);
    });

    let processedFromDone = 0;
    let likesFromDone = 0;
    let repliesFromDone = 0;
    runDoneAgg.forEach((v) => {
      processedFromDone += Number(v.processed || 0);
      likesFromDone += Number(v.liked || 0);
      repliesFromDone += Number(v.replied || 0);
    });

    liveStats.postsProcessed = Math.max(processedNotes.size, processedFromDone, Number(liveStats.postsProcessed || 0));
    liveStats.likesTotal = Math.max(likesFromNotes, likesFromDone, Number(liveStats.likesTotal || 0));
    liveStats.repliesTotal = Math.max(repliesFromNotes, repliesFromDone, Number(liveStats.repliesTotal || 0));
  };

  const applyRunEvent = (evt: any) => {
    const eventType = String(evt?.type || '');
    const noteId = String(evt?.noteId || '');

    if (eventType === 'phase2_resume') {
      liveStats.linksCollected = Number(evt?.existing || 0);
      liveStats.linksTarget = Number(evt?.target || liveStats.linksTarget || 0);
    }
    if (eventType === 'phase2_done') {
      liveStats.linksCollected = Number(evt?.count || liveStats.linksCollected || 0);
      liveStats.linksTarget = Number(evt?.target || liveStats.linksTarget || 0);
    }
    if (eventType === 'phase_unified_links_check') {
      liveStats.linksCollected = Number(evt?.valid || liveStats.linksCollected || 0);
      liveStats.linksTarget = Number(evt?.target || liveStats.linksTarget || 0);
    }
    if (eventType === 'phase_unified_like_round') {
      liveStats.noteId = noteId || liveStats.noteId;
      liveStats.currentCommentsCollected = Number(evt?.harvestedTotal || liveStats.currentCommentsCollected || 0);
    }
    if (eventType === 'phase_unified_op_done') {
      const op = String(evt?.op || '');
      if (op === 'comments_harvest' || op === 'comment_like' || op === 'comment_reply') {
        liveStats.noteId = noteId || liveStats.noteId;
        liveStats.currentCommentsCollected = Number(evt?.commentsTotal || liveStats.currentCommentsCollected || 0);
      }
      if (noteId) {
        const current = noteAgg.get(noteId) || { liked: 0, replied: 0, comments: 0, path: '' };
        if (typeof evt?.commentsTotal === 'number') current.comments = Number(evt.commentsTotal || 0);
        if (typeof evt?.likedCount === 'number') current.liked = Number(evt.likedCount || 0);
        if (typeof evt?.repliedCount === 'number') current.replied = Number(evt.repliedCount || 0);
        const commentsPath = String(evt?.commentsPath || '').trim();
        const noteDir = String(evt?.noteDir || '').trim();
        const likeEvidenceDir = String(evt?.likeEvidenceDir || '').trim();
        if (commentsPath) current.path = parentDir(commentsPath);
        else if (likeEvidenceDir) current.path = likeEvidenceDir;
        else if (noteDir) current.path = noteDir;
        noteAgg.set(noteId, current);

        if (current.liked > 0) likedNotes.set(noteId, { count: current.liked, path: current.path });
        if (current.replied > 0) repliedNotes.set(noteId, { count: current.replied, path: current.path });
      }
    }
    if (eventType === 'phase_unified_note_done' && noteId) {
      processedNotes.add(noteId);
      liveStats.postsProcessed = processedNotes.size;
      liveStats.noteId = noteId;
      liveStats.currentCommentsCollected = Number(evt?.commentsTotal || liveStats.currentCommentsCollected || 0);
      const current = noteAgg.get(noteId) || { liked: 0, replied: 0, comments: 0, path: '' };
      current.comments = Number(evt?.commentsTotal || current.comments || 0);
      current.liked = Number(evt?.likedCount || current.liked || 0);
      current.replied = Number(evt?.repliedCount || current.replied || 0);
      const noteDir = String(evt?.noteDir || '').trim();
      const likeEvidenceDir = String(evt?.likeEvidenceDir || '').trim();
      if (!current.path && likeEvidenceDir) current.path = likeEvidenceDir;
      if (!current.path && noteDir) current.path = noteDir;
      noteAgg.set(noteId, current);
      if (current.liked > 0) likedNotes.set(noteId, { count: current.liked, path: current.path });
      if (current.replied > 0) repliedNotes.set(noteId, { count: current.replied, path: current.path });
    }
    if (eventType === 'phase_unified_done') {
      const runId = String(evt?.runId || '').trim();
      if (runId) {
        runDoneAgg.set(runId, {
          processed: Number(evt?.processed || 0),
          liked: Number(evt?.totalLiked || 0),
          replied: Number(evt?.totalReplied || 0),
        });
      } else {
        liveStats.postsProcessed = Number(evt?.processed || liveStats.postsProcessed || 0);
        liveStats.likesTotal = Number(evt?.totalLiked || liveStats.likesTotal || 0);
        liveStats.repliesTotal = Number(evt?.totalReplied || liveStats.repliesTotal || 0);
      }
    }

    applyUnifiedTotals();
    renderLiveStats();
  };

  const isCurrentSessionEvent = (evt: any) => {
    const tsRaw = String(evt?.ts || '').trim();
    if (!tsRaw) return true;
    const tsMs = Date.parse(tsRaw);
    if (!Number.isFinite(tsMs)) return true;
    return tsMs + 2000 >= sessionStartMs;
  };

  const maybeBindEventsFile = (filePath: string) => {
    const normalized = String(filePath || '').trim();
    if (!normalized || normalized === liveStats.eventsPath) return;
    liveStats.eventsPath = normalized;
    eventsOffset = 0;
    eventsCarry = '';
    renderLiveStats();

    if (xhsEventsPollTimer != null) {
      window.clearInterval(xhsEventsPollTimer);
      xhsEventsPollTimer = null;
    }

    xhsEventsPollTimer = window.setInterval(async () => {
      try {
        const ret = await window.api.fsReadTextTail({ path: liveStats.eventsPath, fromOffset: eventsOffset, maxBytes: 256000 });
        if (!ret?.ok) return;
        const text = String(ret?.text || '');
        eventsOffset = Number(ret?.nextOffset || eventsOffset || 0);
        if (!text) return;

        const lines = (eventsCarry + text).split(/\r?\n/g);
        eventsCarry = lines.pop() || '';

        for (const rawLine of lines) {
          const line = String(rawLine || '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (!isCurrentSessionEvent(evt)) continue;

            const evtRunId = String(evt?.runId || '').trim();
            if (evtRunId && String(evt?.type || '') === 'run_start') {
              activeUnifiedRunIds.add(evtRunId);
            }

            if (activeUnifiedRunIds.size > 0 && evtRunId && !activeUnifiedRunIds.has(evtRunId)) continue;
            if (activeUnifiedRunIds.size === 0 && evtRunId) activeUnifiedRunIds.add(evtRunId);
            applyRunEvent(evt);
          } catch {
            // ignore malformed json lines
          }
        }
      } catch {
        // ignore polling failures
      }
    }, 1200);
  };

  const parseStdoutForEvents = (line: string) => {
    const text = String(line || '');
    const runIdMatch = text.match(/runId\s*[:=]\s*([A-Za-z0-9_-]+)/);
    if (runIdMatch?.[1]) {
      activeUnifiedRunIds.add(String(runIdMatch[1]));
      renderLiveStats();
    }

    const eventsPathMatch = text.match(/(?:events=|eventsPath\s*[:=]\s*)(\/[^\s]+run-events\.jsonl)/);
    if (eventsPathMatch?.[1]) {
      maybeBindEventsFile(String(eventsPathMatch[1]));
    }

    const phase2ProgressMatch = text.match(/\[Phase2Collect\]\s*\[(\d+)\/(\d+)\]/);
    if (phase2ProgressMatch) {
      liveStats.linksCollected = Number(phase2ProgressMatch[1] || liveStats.linksCollected || 0);
      liveStats.linksTarget = Number(phase2ProgressMatch[2] || liveStats.linksTarget || 0);
      renderLiveStats();
    }
  };

  maxCommentsInput.addEventListener('change', () => {
    liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0
      ? String(Math.floor(Number(maxCommentsInput.value || 0)))
      : '不限';
    renderLiveStats();
  });

  resetLiveStats();


  const aliasesMap = () => {
    const aliases = api?.settings?.profileAliases;
    return aliases && typeof aliases === 'object' ? aliases : {};
  };

  const getSelectedShardProfiles = () => {
    const selected: string[] = [];
    shardProfilesBox.querySelectorAll('input[type="checkbox"][data-profile-id]').forEach((node) => {
      const cb = node as HTMLInputElement;
      if (!cb.checked) return;
      const id = String(cb.dataset.profileId || '').trim();
      if (id) selected.push(id);
    });
    return selected;
  };

  const renderSingleProfileHint = () => {
    const current = String(profilePickSel.value || '').trim();
    if (!current) {
      singleProfileHint.textContent = '当前实际使用：(未选择账号)';
      return;
    }
    const label = String(profilePickSel.selectedOptions?.[0]?.textContent || current).trim();
    singleProfileHint.textContent = `当前实际使用：${label}`;
  };

  const renderShardHints = () => {
    const selected = getSelectedShardProfiles();
    shardProfilesHint.textContent = `selected=${selected.length}`;
    shardResolvedHint.textContent = selected.length > 0 ? `resolved: --profiles ${selected.join(',')}` : '';
  };

  let latestProfiles: string[] = [];

  function extractBatchBase(profileId: string): string {
    const m = String(profileId || '').trim().match(/^(.*?)[-_]batch(?:[-_](\\d+))?$/);
    if (!m) return '';
    return String(m[1] || '').trim();
  }

  function inferDefaultBatchBase(): string {
    const currentProfile = String(profilePickSel.value || '').trim();
    const fromCurrent = extractBatchBase(currentProfile);
    if (fromCurrent) return fromCurrent;
    const firstBatch = latestProfiles.find((p) => /[-_]batch(?:[-_]\\d+)?$/.test(String(p || '').trim()));
    const fromFirst = extractBatchBase(String(firstBatch || ''));
    return fromFirst || 'xiaohongshu';
  }

  function resolveAddBatchPrefix(): string {
    const manual = String(addBatchNameInput.value || '').trim();
    const base = manual || inferDefaultBatchBase();
    return `${base}-batch`;
  }

  function syncAddBatchPlaceholder() {
    const base = inferDefaultBatchBase();
    addBatchNameInput.placeholder = `账号名前缀（默认 ${base}）`;
  }

  const deriveCookiePath = (profileDir: string, profileId: string) => {
    const normalized = String(profileDir || '').replace(/\\/g, '/');
    const marker = '/profiles/';
    const at = normalized.lastIndexOf(marker);
    if (at <= 0) return '';
    const rootDir = normalized.slice(0, at);
    return rootDir + '/cookies/' + profileId + '.json';
  };

  const refreshAccountAudit = async (
    profiles: string[],
    aliases: Record<string, string>,
    profileDirs: Map<string, string>,
  ) => {
    accountAuditList.innerHTML = '';

    const sessions = await window.api.runtimeListSessions().catch(() => []);
    const activeProfiles = new Set(
      Array.isArray(sessions)
        ? sessions.map((s: any) => String(s?.profileId || '').trim()).filter(Boolean)
        : [],
    );

    const rows = await Promise.all(
      profiles.map(async (profileId) => {
        const profileDir = String(profileDirs.get(profileId) || '').trim();
        const cookiePath = deriveCookiePath(profileDir, profileId);
        const cookieRet = cookiePath
          ? await window.api.fsReadTextPreview({ path: cookiePath, maxBytes: 160, maxLines: 2 }).catch(() => null)
          : null;
        const cookieReady = Boolean(cookieRet?.ok && String(cookieRet?.text || '').trim());
        const active = activeProfiles.has(profileId);
        return {
          profileId,
          alias: String((aliases as any)[profileId] || '').trim(),
          cookieReady,
          active,
        };
      }),
    );

    if (rows.length === 0) {
      accountAuditList.appendChild(createEl('div', { className: 'xhs-account-row muted' }, ['暂无账号，请先新增账号。']));
      accountAuditSummary.textContent = '账号检查：0 个账号';
      guideState.accountReady = false;
      return;
    }

    const cookieReadyCount = rows.filter((x) => x.cookieReady).length;
    const activeCount = rows.filter((x) => x.active).length;
    accountAuditSummary.textContent = '账号检查：总数=' + rows.length + '，cookie就绪=' + cookieReadyCount + '，当前在线=' + activeCount;

    // 自动判定账号就绪：有 cookie 的账号即算可用
    if (cookieReadyCount > 0) {
      guideState.accountReady = true;
    }
    // 保存状态
    saveGuideState(guideState);
    applyGuideLock();

    rows.forEach((entry) => {
      const label = entry.alias ? entry.alias + ' (' + entry.profileId + ')' : entry.profileId;
      const status = entry.active ? '在线' : entry.cookieReady ? 'cookie就绪' : '待登录';
      const statusColor = entry.active ? '#22c55e' : entry.cookieReady ? '#f59e0b' : '#ef4444';
      const row = createEl('div', { className: 'xhs-account-row' });
      row.appendChild(createEl('div', { className: 'muted', style: 'font-size:12px;' }, [label]));
      row.appendChild(createEl('div', { style: 'font-size:12px; color:' + statusColor + ';' }, [status]));
      accountAuditList.appendChild(row);
    });
  };

  const refreshProfileChoices = async () => {
    const selectedNow = getSelectedShardProfiles();
    const prevSingle = String(profilePickSel.value || persistedSingleProfile || '').trim();
    const prevSelected = selectedNow.length > 0 ? new Set(selectedNow) : new Set(persistedShardProfiles);

    const scan = await window.api.profilesScan().catch(() => null);
    const entries: any[] = Array.isArray(scan?.entries) ? scan.entries : [];
    const profiles: string[] = entries.map((e: any) => String(e?.profileId || '').trim()).filter(Boolean);
    const profileDirs = new Map<string, string>();
    entries.forEach((e: any) => {
      const pid = String(e?.profileId || '').trim();
      if (!pid) return;
      profileDirs.set(pid, String(e?.profileDir || '').trim());
    });
    latestProfiles = profiles.slice();
    syncAddBatchPlaceholder();
    const aliases = aliasesMap();

    const aliasedProfiles = profiles.filter((profileId) => String((aliases as any)[profileId] || '').trim()).length;
    onboardingSummary.textContent = `profile=${profiles.length}，已设置账号名=${aliasedProfiles}`;
    if (profiles.length === 0) {
      onboardingCard.style.display = '';
      onboardingTips.textContent = '当前没有可用 profile：请前往预处理页创建/登录 profile，再返回此页。';
    } else if (aliasedProfiles < profiles.length) {
      onboardingCard.style.display = '';
      onboardingTips.textContent = `仍有 ${profiles.length - aliasedProfiles} 个 profile 未设置账号名。建议先配置 alias，再按账号运行。`;
    } else {
      onboardingCard.style.display = 'none';
    }

    profilePickSel.textContent = '';
    profilePickSel.appendChild(createEl('option', { value: '' }, ['(请选择账号：alias / profile)']));
    for (const profileId of profiles) {
      const alias = String((aliases as any)[profileId] || '').trim();
      const label = alias ? `${alias} (${profileId})` : profileId;
      profilePickSel.appendChild(createEl('option', { value: profileId }, [label]));
    }

    if (prevSingle && profiles.includes(prevSingle)) {
      profilePickSel.value = prevSingle;
    } else if (profiles.length > 0) {
      profilePickSel.value = profiles[0];
    }
    renderSingleProfileHint();

    shardProfilesBox.innerHTML = '';
    for (const profileId of profiles) {
      const alias = String((aliases as any)[profileId] || '').trim();
      const label = alias ? `${alias} (${profileId})` : profileId;
      const id = `xh-profile-${profileId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const cb = createEl('input', { type: 'checkbox', id }) as HTMLInputElement;
      cb.dataset.profileId = profileId;
      cb.checked = prevSelected.has(profileId);
      cb.onchange = () => {
        persistedShardProfiles.clear();
        getSelectedShardProfiles().forEach((pid) => persistedShardProfiles.add(pid));
        renderShardHints();
      };
      const row = createEl('div', { className: 'row', style: 'align-items:center; gap:8px; margin-bottom:4px;' }, [
        cb,
        createEl('label', { for: id, style: 'cursor:pointer;' }, [label]),
      ]);
      shardProfilesBox.appendChild(row);
    }

    if (shardProfilesBox.childElementCount === 0) {
      shardProfilesBox.appendChild(createEl('div', { className: 'muted' }, ['暂无可用账号，请先在预处理页新增账号']));
    }

    persistedShardProfiles.clear();
    getSelectedShardProfiles().forEach((pid) => persistedShardProfiles.add(pid));
    renderShardHints();
    await refreshAccountAudit(profiles, aliases as Record<string, string>, profileDirs);
  };

  profileRefreshBtn.onclick = () => {
    void refreshProfileChoices();
  };

  accountRefreshBtn.onclick = () => {
    void refreshProfileChoices();
  };

  accountLiveProbeBtn.onclick = async () => {
    const profileId = String(profilePickSel.value || '').trim();
    if (!profileId) {
      alert('请先选择一个账号后再执行实时探测');
      return;
    }
    const args = [
      window.api.pathJoin('scripts', 'browser-status.mjs'),
      profileId,
      '--site',
      'xiaohongshu',
    ];
    await window.api.cmdSpawn({
      title: 'browser-status ' + profileId,
      cwd: '',
      args,
      groupKey: 'xiaohongshu',
    });
  };

  accountAddBtn.onclick = async () => {
    const kw = resolveAddBatchPrefix();
    const addCount = Math.max(1, Math.floor(Number(addAccountCountInput.value || '1')));
    const poolCount = latestProfiles.filter((p) => String(p || '').trim() === kw || String(p || '').trim().startsWith(kw + '-')).length;
    const ensureCount = poolCount + addCount;
    const timeoutSec = Math.max(30, Math.floor(Number(api?.settings?.timeouts?.loginTimeoutSec || 900)));
    const args = [
      window.api.pathJoin('scripts', 'profilepool.mjs'),
      'login',
      kw,
      '--ensure-count',
      String(ensureCount),
      '--timeout-sec',
      String(timeoutSec),
      '--keep-session',
      ...(api?.settings?.unifiedApiUrl ? ['--unified-api', String(api.settings.unifiedApiUrl)] : []),
      ...(api?.settings?.browserServiceUrl ? ['--browser-service', String(api.settings.browserServiceUrl)] : []),
    ];

    await window.api.cmdSpawn({
      title: 'profilepool login ' + kw + ' (headful)',
      cwd: '',
      args,
      groupKey: 'profilepool',
      env: { WEBAUTO_DAEMON: '1' },
    });

    navStepHint.textContent = `已触发新增账号流程（前缀 ${kw}）：请在弹出的 camoufox/headful 窗口完成登录，再点“检查账号状态”。`;
    setTimeout(() => void refreshProfileChoices(), 1800);
  };

  const persistHistoryFns: Array<() => void> = [];
  const registerHistoryInput = (input: HTMLInputElement, key: string) => {
    const persist = bindInputHistory(input, key, api);
    persistHistoryFns.push(persist);
    return persist;
  };

  registerHistoryInput(keywordInput, 'keyword');
  registerHistoryInput(envInput, 'env');
  registerHistoryInput(maxNotesInput, 'target');
  registerHistoryInput(maxCommentsInput, 'maxComments');
  registerHistoryInput(commentRoundsInput, 'commentRounds');
  registerHistoryInput(matchKeywordsInput, 'matchKeywords');
  registerHistoryInput(matchMinHitsInput, 'matchMinHits');
  registerHistoryInput(maxLikesInput, 'maxLikes');
  const persistLikeRuleAHistory = registerHistoryInput(likeRuleAInput, 'likeRuleA');
  const persistLikeRuleBHistory = registerHistoryInput(likeRuleBInput, 'likeRuleB');
  registerHistoryInput(replyTextInput, 'replyText');
  registerHistoryInput(ocrCommandInput, 'ocrCommand');
  registerHistoryInput(opOrderInput, 'opOrder');

  const getEffectiveHomepageFlags = () => ({
    doHomepage: Boolean(homepageToggle.checked),
    doImages: Boolean(homepageToggle.checked && imagesToggle.checked),
  });

  const persistLastConfig = () => {
    writeLastConfig({
      orchestrateMode: orchestrateModeSelect.value,
      keyword: keywordInput.value,
      env: envInput.value,
      accountMode: accountModeSelect.value,
      singleProfile: profilePickSel.value,
      shardProfiles: getSelectedShardProfiles(),
      maxNotes: maxNotesInput.value,
      dryRun: dryRunCheckbox.checked,
      protocolMode: protocolModeCheckbox.checked,
      headless: headlessCheckbox.checked,
      doHomepage: getEffectiveHomepageFlags().doHomepage,
      doImages: getEffectiveHomepageFlags().doImages,
      doComments: commentsToggle.checked,
      maxComments: maxCommentsInput.value,
      commentRounds: commentRoundsInput.value,
      doGate: gateToggle.checked,
      matchKeywords: matchKeywordsInput.value,
      matchMode: matchModeSelect.value,
      matchMinHits: matchMinHitsInput.value,
      doLikes: likesToggle.checked,
      maxLikes: maxLikesInput.value,
      likeRules: likeRulePreview.value,
      doReply: replyToggle.checked,
      replyText: replyTextInput.value,
      doOcr: ocrToggle.checked,
      ocrCommand: ocrCommandInput.value,
      opOrder: opOrderInput.value,
    });
  };

  const bindPersistControl = (el: HTMLElement, evt = 'change') => {
    el.addEventListener(evt, persistLastConfig);
  };

  [
    orchestrateModeSelect,
    accountModeSelect,
    profilePickSel,
    keywordInput,
    envInput,
    maxNotesInput,
    maxCommentsInput,
    commentRoundsInput,
    matchKeywordsInput,
    matchModeSelect,
    matchMinHitsInput,
    maxLikesInput,
    replyTextInput,
    ocrCommandInput,
    opOrderInput,
    dryRunCheckbox,
    protocolModeCheckbox,
    headlessCheckbox,
    homepageToggle,
    imagesToggle,
    commentsToggle,
    gateToggle,
    likesToggle,
    replyToggle,
    ocrToggle,
  ].forEach((el) => bindPersistControl(el));

  likeRuleTypeSelect.addEventListener('change', persistLastConfig);
  addLikeRuleBtn.addEventListener('click', persistLastConfig);

  const refreshOrchestrationLayout = () => {
    const mode = String(orchestrateModeSelect.value || 'phase1-phase2-unified').trim();
    const unifiedEnabled = mode === 'phase1-phase2-unified' || mode === 'unified-only';
    const accountMode = String(accountModeSelect.value || 'single').trim();
    const isSingleMode = accountMode !== 'shards';

    singleProfileRow.style.display = isSingleMode ? '' : 'none';
    singleProfileHint.style.display = isSingleMode ? '' : 'none';
    shardProfilesSection.style.display = isSingleMode ? 'none' : '';
    if (isSingleMode) renderSingleProfileHint();
    else renderShardHints();

    // 目标帖子在 tileBase3 内，暂时通过显示/隐藏整个 baseParamsTile 控制

    const featureDisplay = unifiedEnabled ? '' : 'none';
    homeSection.style.display = featureDisplay;
    commentsSection.style.display = featureDisplay;
    gateSection.style.display = featureDisplay;
    likesSection.style.display = featureDisplay;
    replySection.style.display = featureDisplay;
    ocrSection.style.display = featureDisplay;
    opOrderRow.style.display = featureDisplay;

    if (mode === 'phase1-only') {
      modeHint.textContent = '仅执行 Phase1：启动/恢复浏览器会话，不做搜索采集与互动。';
      return;
    }
    if (mode === 'phase1-phase2') {
      modeHint.textContent = '执行 Phase1 + Phase2：启动会话并采集链接，不执行评论/点赞。';
      return;
    }
    if (mode === 'unified-only') {
      modeHint.textContent = '仅执行 Unified：使用已有 phase2-links.jsonl 执行评论采集/点赞/回复。';
      return;
    }
    modeHint.textContent = '完整编排：先 Phase1 启动，再 Phase2 采集链接，最后 Unified 采集评论/点赞。';
  };

  profilePickSel.addEventListener('change', () => { renderSingleProfileHint(); syncAddBatchPlaceholder(); });
  orchestrateModeSelect.addEventListener('change', refreshOrchestrationLayout);
  accountModeSelect.addEventListener('change', refreshOrchestrationLayout);
  refreshOrchestrationLayout();
  void refreshProfileChoices();
  xhsSettingsUnsubscribe = window.api.onSettingsChanged((next: any) => {
    api.settings = next;
    void refreshProfileChoices();
  });

  let localRunId = '';
 const runBtn = createEl('button', {}, ['开始执行编排']) as HTMLButtonElement;
 const stopBtn = createEl('button', { className: 'danger' }, ['停止当前任务']) as HTMLButtonElement;

  // 确保按钮被正确添加到 DOM
  const actionsRow = createEl('div', { className: 'row', style: 'margin-bottom:12px;' }, [runBtn, stopBtn]);
  card.insertBefore(actionsRow, card.firstChild);

  runBtn.onclick = async () => {
    if (typeof window.api?.cmdSpawn !== 'function') {
      api?.appendLog?.('[error] cmdSpawn API unavailable in renderer');
      alert('启动失败：cmdSpawn API 不可用');
      return;
    }

    persistHistoryFns.forEach((persist) => persist());
    persistLastConfig();
    resetLiveStats();

    const mode = String(orchestrateModeSelect.value || 'phase1-phase2-unified').trim();
    const accountMode = String(accountModeSelect.value || 'single').trim();
    const singleProfile = String(profilePickSel.value || '').trim();
    const shardProfiles = getSelectedShardProfiles();

    const profileArgs: string[] = [];
    if (accountMode === 'shards') {
      if (shardProfiles.length === 0) {
        alert('当前为分片模式，请在可用项中至少勾选一个 profile');
        return;
      }
      api?.appendLog?.(`[shard-hint] profiles=${shardProfiles.join(',')}`);
      profileArgs.push('--profiles', shardProfiles.join(','));
    } else {
      if (!singleProfile) {
        alert('当前为单账号模式，请在首选项中选择一个 profile');
        return;
      }
      profileArgs.push('--profile', singleProfile);
    }

    const needKeyword = mode !== 'phase1-only';
    const targetNum = Number(maxNotesInput.value || 0);
    if (needKeyword && !String(keywordInput.value || '').trim()) {
      alert('该编排模式需要关键词');
      return;
    }
    if (mode !== 'phase1-only' && (!Number.isFinite(targetNum) || targetNum <= 0)) {
      alert('目标帖子必须是正整数');
      return;
    }

    const unifiedEnabled = mode === 'phase1-phase2-unified' || mode === 'unified-only';
    if (unifiedEnabled && replyToggle.checked && !gateToggle.checked) {
      alert('开启“自动回复”时，请同时开启“评论命中规则”。');
      return;
    }

    const args: string[] = [
      '--mode', mode,
      ...profileArgs,
      '--env', envInput.value || 'debug',
      '--input-mode', protocolModeCheckbox.checked ? 'protocol' : 'system',
      '--headless', headlessCheckbox.checked ? 'true' : 'false',
      '--foreground',
    ];

    if (needKeyword) {
      args.push('--keyword', keywordInput.value || '黄金走势');
    }
    if (mode !== 'phase1-only') {
      args.push('--target', String(Math.floor(targetNum)));
    }

    if (dryRunCheckbox.checked) args.push('--dry-run');
    else args.push('--no-dry-run');

    if (unifiedEnabled) {
      const homepageFlags = getEffectiveHomepageFlags();
      api?.appendLog?.(`[ui-run-flags] doHomepage=${homepageFlags.doHomepage} doImages=${homepageFlags.doImages}`);
      args.push(
        '--do-homepage', getEffectiveHomepageFlags().doHomepage ? 'true' : 'false',
        '--do-images', getEffectiveHomepageFlags().doImages ? 'true' : 'false',
        '--do-comments', commentsToggle.checked ? 'true' : 'false',
        '--max-comments', String(maxCommentsInput.value || 0),
        '--comment-rounds', String(commentRoundsInput.value || 0),
        '--match-keywords', gateToggle.checked ? (matchKeywordsInput.value || '') : '',
        '--match-mode', gateToggle.checked ? (matchModeSelect.value || 'any') : 'any',
        '--match-min-hits', gateToggle.checked ? String(matchMinHitsInput.value || 2) : '1',
        '--do-likes', likesToggle.checked ? 'true' : 'false',
        '--max-likes', String(maxLikesInput.value || 2),
        '--like-keywords', likeRulePreview.value || '',
        '--do-reply', replyToggle.checked ? 'true' : 'false',
        '--reply-text', replyTextInput.value || '',
        '--do-ocr', ocrToggle.checked ? 'true' : 'false',
      );
      if (ocrToggle.checked && String(ocrCommandInput.value || '').trim()) {
        args.push('--ocr-command', String(ocrCommandInput.value || '').trim());
      }
      if (String(opOrderInput.value || '').trim()) {
        args.push('--op-order', String(opOrderInput.value || '').trim());
      }
    }

    const script = window.api.pathJoin('scripts', 'xiaohongshu', 'phase-orchestrate.mjs');
    const spawnArgs = [script, ...args];
    const titleText = `xiaohongshu orchestrate ${mode} ${keywordInput.value || ''}`.trim();

    runBtn.disabled = true;
    const prevText = runBtn.textContent;
    runBtn.textContent = '启动中...';
    try {
      api?.clearLog?.();
      const ret = await window.api.cmdSpawn({
        title: titleText || 'xiaohongshu unified',
        cwd: '',
        args: spawnArgs,
        groupKey: 'xiaohongshu',
        env: { WEBAUTO_DAEMON: '1' },
      });
      if (!ret || !ret.runId) {
        api?.appendLog?.('[error] unified spawn failed: empty runId');
        alert('启动失败：命令未启动（请查看日志）');
      } else {
        localRunId = String(ret.runId || '');
      }
    } catch (err: any) {
      api?.appendLog?.(`[error] unified spawn failed: ${err?.message || String(err)}`);
      alert(`启动失败：${err?.message || String(err)}`);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = prevText || '开始执行编排';
    }
  };

  startRunBtn.onclick = () => {
    runBtn.click();
  };

  stopBtn.onclick = async () => {
    const runId = String(localRunId || api?.activeRunId || '').trim();
    if (!runId) {
      alert('当前没有可停止的运行任务');
      return;
    }
    try {
      const ret = await window.api.cmdKill(runId);
      if (!ret?.ok) {
        alert(`停止失败：${ret?.error || 'unknown_error'}`);
        return;
      }
      api?.appendLog?.(`[killed] runId=${runId}`);
      localRunId = '';
    } catch (err: any) {
      alert(`停止失败：${err?.message || String(err)}`);
    }
  };

  xhsCmdUnsubscribe = window.api.onCmdEvent((evt: any) => {
    const eventType = String(evt?.type || '');
    const evtRunId = String(evt?.runId || '').trim();

    if (eventType === 'started') {
      const title = String(evt?.title || '');
      if (title.includes('xiaohongshu orchestrate')) {
        localRunId = String(evt?.runId || localRunId || '');
        resetLiveStats();
      }
      return;
    }

    // stdout/stderr 里会携带 eventsPath/runId，先解析再做 runId 过滤
    if (eventType === 'stdout' || eventType === 'stderr') {
      parseStdoutForEvents(String(evt?.line || ''));
      return;
    }

    if (!localRunId || evtRunId !== localRunId) return;

    if (eventType === 'exit') {
      if (xhsEventsPollTimer != null) {
        window.clearInterval(xhsEventsPollTimer);
        xhsEventsPollTimer = null;
      }
    }
 });

  root.appendChild(card);
}
