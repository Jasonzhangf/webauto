import { createEl } from '../../ui-components.mjs';

export const INPUT_HISTORY_MAX = 10;
export const XHS_LAST_CONFIG_KEY = 'webauto.xhs.lastConfig.v1';
export const XHS_BATCH_KEY = 'webauto.xhs.batchKey.v1';
export const XHS_DEFAULT_BATCH_KEY = 'xiaohongshu';

export type XhsLastConfig = {
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

export type LikeRuleKind = 'contains' | 'and' | 'include_without';

export type LikeRuleDraft = {
  kind: LikeRuleKind;
  a: string;
  b?: string;
};

export function makeNumberInput(value: string, min = '1', width = '92px') {
  return createEl('input', { type: 'number', value, min, style: `width:${width};` }) as HTMLInputElement;
}

export function makeTextInput(value: string, placeholder = '', width = '100%') {
  return createEl('input', { type: 'text', value, placeholder, style: `width:${width};` }) as HTMLInputElement;
}

export function makeCheckbox(checked: boolean, id: string) {
  return createEl('input', { type: 'checkbox', checked, id }) as HTMLInputElement;
}

export function attachTooltip(anchor: HTMLElement, text: string) {
  const tip = createEl('div', {
    style: 'position:absolute; left:0; top:100%; margin-top:4px; padding:6px 8px; background:#0f1419; border:1px solid #26437a; border-radius:6px; font-size:11px; color:#c7d2fe; z-index:20; opacity:0; pointer-events:none; transition:opacity 0.15s; max-width:320px; white-space:normal;',
  }, [text]) as HTMLDivElement;
  anchor.style.position = anchor.style.position || 'relative';
  anchor.appendChild(tip);
  anchor.addEventListener('mouseenter', () => {
    tip.style.opacity = '1';
  });
  anchor.addEventListener('mouseleave', () => {
    tip.style.opacity = '0';
  });
}

export function bindSectionToggle(toggle: HTMLInputElement, body: HTMLElement) {
  const refresh = () => {
    body.style.display = toggle.checked ? '' : 'none';
  };
  toggle.addEventListener('change', refresh);
  setTimeout(refresh, 0);
}

export function formatBatchKey(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `batch-${y}${m}${d}-${hh}${mm}`;
}

export function sanitizeBatchKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return cleaned;
}

export function readBatchKey() {
  try {
    const raw = window.localStorage.getItem(XHS_BATCH_KEY) || '';
    return String(raw || '').trim();
  } catch {
    return '';
  }
}

export function writeBatchKey(next: string) {
  try {
    window.localStorage.setItem(XHS_BATCH_KEY, String(next || '').trim());
  } catch {
    // ignore storage failures
  }
}

export function readInputHistory(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(`webauto.xhs.history.${key}`) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function writeInputHistory(key: string, values: string[]) {
  const next = Array.from(new Set(values.map((x) => String(x || '').trim()).filter(Boolean))).slice(0, INPUT_HISTORY_MAX);
  try {
    window.localStorage.setItem(`webauto.xhs.history.${key}`, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

export function readLastConfig(): XhsLastConfig {
  try {
    const raw = window.localStorage.getItem(XHS_LAST_CONFIG_KEY) || '{}';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeLastConfig(next: XhsLastConfig) {
  try {
    window.localStorage.setItem(XHS_LAST_CONFIG_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

export function bindInputHistory(input: HTMLInputElement, key: string, api?: any): () => void {
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
  input.addEventListener('keydown', (evt) => {
    if (evt.ctrlKey && evt.shiftKey && evt.key === 'Backspace') {
      evt.preventDefault();
      removeCurrent();
    }
  });

  refreshOptions();
  return persistCurrent;
}

export function stringifyLikeRule(rule: LikeRuleDraft): string {
  const kind = (rule.kind || 'contains') as LikeRuleKind;
  const a = String(rule.a || '').trim();
  const b = String(rule.b || '').trim();
  if (!a) return '';
  if (kind === 'contains') return a;
  if (kind === 'and') return `${a}+${b}`;
  return `${a}-${b}`;
}

export function parseLikeRuleToken(token: string): LikeRuleDraft | null {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const plusIndex = raw.indexOf('+');
  if (plusIndex > 0) {
    const a = raw.slice(0, plusIndex).trim();
    const b = raw.slice(plusIndex + 1).trim();
    if (a && b) return { kind: 'and', a, b };
    return null;
  }
  const minusIndex = raw.indexOf('-');
  if (minusIndex > 0) {
    const a = raw.slice(0, minusIndex).trim();
    const b = raw.slice(minusIndex + 1).trim();
    if (a && b) return { kind: 'include_without', a, b };
    return null;
  }
  return { kind: 'contains', a: raw };
}

export function parseLikeRulesCsv(value: string): LikeRuleDraft[] {
  return String(value || '')
    .split(',')
    .map((token) => parseLikeRuleToken(token))
    .filter(Boolean) as LikeRuleDraft[];
}

export function likeRuleGuide(kind: LikeRuleKind): { title: string; desc: string; example: string } {
  switch (kind) {
    case 'and':
      return {
        title: '同时包含 {A+B}',
        desc: '评论文本同时出现 A 与 B 才命中',
        example: '示例：操底+上链接',
      };
    case 'include_without':
      return {
        title: '包含排除 {A-B}',
        desc: '包含 A 且不包含 B 时命中',
        example: '示例：上链接-广告',
      };
    default:
      return {
        title: '单关键词',
        desc: '评论文本包含词 A 即命中',
        example: '示例：操底',
      };
  }
}
