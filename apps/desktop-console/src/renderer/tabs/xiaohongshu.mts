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

function bindSectionToggle(toggle: HTMLInputElement, body: HTMLElement) {
  const refresh = () => {
    body.style.display = toggle.checked ? '' : 'none';
  };
  toggle.addEventListener('change', refresh);
  setTimeout(refresh, 0);
}


const INPUT_HISTORY_MAX = 10;
const XHS_LAST_CONFIG_KEY = 'webauto.xhs.lastConfig.v1';

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

  const title = createEl('div', { style: 'font-weight:700; margin-bottom:10px;' }, ['小红书 · Unified Harvest Pipeline']);
  const sub = createEl('div', { style: 'margin-bottom:6px; color:#666; font-size:12px;' }, [
    '编排支持：Phase1 启动 -> Phase2 链接采集 -> Unified 评论采集/点赞/回复（可按模式裁剪）',
  ]);
  const relation = createEl('div', { style: 'margin-bottom:14px; color:#7a8599; font-size:12px;' }, [
    '说明：本页已整合 Orchestrate（phase-orchestrate.mjs），可在此直接执行 Phase1/2/Unified。',
  ]);

  const historyHint = createEl('div', { style: 'margin-bottom:10px; color:#64748b; font-size:12px;' }, [
    '输入框支持历史候选；快捷键 Ctrl+Shift+Backspace 可删除当前输入的历史项。',
  ]);
  root.appendChild(title);
  root.appendChild(sub);
  root.appendChild(relation);
  root.appendChild(historyHint);

  const card = createEl('div', { className: 'card', style: 'padding:12px;' });

  // Base params
  card.appendChild(createEl('div', { style: 'font-weight:700; margin-bottom:8px;' }, ['基础参数']));
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
  profilePickSel.appendChild(createEl('option', { value: '' }, ['(请选择 profile)']));
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
  tileBase2.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['首选项']), profilePickSel, profileRefreshBtn,
  ]));
  tileBase2.appendChild(shardProfilesBox);
  shardProfilesBox.style.marginTop = '6px';
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
  
  card.appendChild(baseParamsTile);
  card.appendChild(modeHint);

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

  card.appendChild(featureTiles);

  const opOrderInput = makeTextInput('', '执行顺序列表（留空使用默认编排）');
  const opOrderRow = createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:12px;' }, [
    createEl('label', { style: 'width:86px;' }, ['执行顺序']), opOrderInput,
  ]);
  card.appendChild(opOrderRow);

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
  card.appendChild(statsSection);

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

  let internalRunId = '';
  let eventsOffset = 0;
  let eventsCarry = '';
  const processedNotes = new Set<string>();
  const noteAgg = new Map<string, { liked: number; replied: number; comments: number; path: string }>();
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
    streamStat.textContent = liveStats.eventsPath ? `事件流：${liveStats.eventsPath}` : '事件流：未绑定';
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
    internalRunId = '';
    eventsOffset = 0;
    eventsCarry = '';
    processedNotes.clear();
    noteAgg.clear();
    likedNotes.clear();
    repliedNotes.clear();
    renderLiveStats();
  };

  const applyUnifiedTotals = () => {
    let likes = 0;
    let replies = 0;
    noteAgg.forEach((v) => {
      likes += Number(v.liked || 0);
      replies += Number(v.replied || 0);
    });
    liveStats.likesTotal = likes;
    liveStats.repliesTotal = replies;
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
      liveStats.postsProcessed = Number(evt?.processed || liveStats.postsProcessed || 0);
      liveStats.likesTotal = Number(evt?.totalLiked || liveStats.likesTotal || 0);
      liveStats.repliesTotal = Number(evt?.totalReplied || liveStats.repliesTotal || 0);
    }

    applyUnifiedTotals();
    renderLiveStats();
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

        const lines = `${eventsCarry}${text}`.split(/\r?\n/g);
        eventsCarry = lines.pop() || '';

        for (const rawLine of lines) {
          const line = String(rawLine || '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (!internalRunId && evt?.type === 'run_start' && evt?.runId) internalRunId = String(evt.runId);
            if (internalRunId && evt?.runId && String(evt.runId) !== internalRunId) continue;
            if (!internalRunId && evt?.runId) internalRunId = String(evt.runId);
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
      internalRunId = String(runIdMatch[1]);
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

  const renderShardHints = () => {
    const selected = getSelectedShardProfiles();
    shardProfilesHint.textContent = `selected=${selected.length}`;
    shardResolvedHint.textContent = selected.length > 0 ? `resolved: --profiles ${selected.join(',')}` : '';
  };

  const refreshProfileChoices = async () => {
    const selectedNow = getSelectedShardProfiles();
    const prevSingle = String(profilePickSel.value || persistedSingleProfile || '').trim();
    const prevSelected = selectedNow.length > 0 ? new Set(selectedNow) : new Set(persistedShardProfiles);

    const res = await window.api.profilesList().catch(() => null);
    const profiles: string[] = Array.isArray(res?.profiles) ? res.profiles : [];
    const aliases = aliasesMap();

    profilePickSel.textContent = '';
    profilePickSel.appendChild(createEl('option', { value: '' }, ['(请选择 profile)']));
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
      shardProfilesBox.appendChild(createEl('div', { className: 'muted' }, ['暂无可用 profile，请先在预处理创建']));
    }

    persistedShardProfiles.clear();
    getSelectedShardProfiles().forEach((pid) => persistedShardProfiles.add(pid));
    renderShardHints();
  };

  profileRefreshBtn.onclick = () => {
    void refreshProfileChoices();
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
    const needsTarget = mode !== 'phase1-only';
    const accountMode = String(accountModeSelect.value || 'single').trim();

    // 目标帖子在 tileBase3 内，暂时通过显示/隐藏整个 baseParamsTile 控制
    // 账号选择相关已整合到 tile 中

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

    if (eventType === 'started') {
      const title = String(evt?.title || '');
      if (title.includes('xiaohongshu orchestrate')) {
        localRunId = String(evt?.runId || localRunId || '');
        resetLiveStats();
      }
      return;
    }

    const evtRunId = String(evt?.runId || '').trim();
    if (!localRunId || evtRunId !== localRunId) return;

    if (eventType === 'stdout' || eventType === 'stderr') {
      parseStdoutForEvents(String(evt?.line || ''));
      return;
    }

    if (eventType === 'exit') {
      if (xhsEventsPollTimer != null) {
        window.clearInterval(xhsEventsPollTimer);
        xhsEventsPollTimer = null;
      }
    }
  });

  card.insertBefore(createEl('div', { className: 'row', style: 'margin-bottom:12px;' }, [runBtn, stopBtn]), card.firstChild);
  root.appendChild(card);
}
