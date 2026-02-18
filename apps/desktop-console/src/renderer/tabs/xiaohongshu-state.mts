import { createEl } from '../ui-components.mjs';

// Persist state key
export const XHS_LAST_CONFIG_KEY = 'webauto.xhs.lastConfig.v1';
export const XHS_HISTORY_MAX = 10;

// Like rule types (moved from main file)
export type LikeRuleKind = 'contains' | 'and' | 'include_without';

export type LikeRuleDraft = {
  kind: LikeRuleKind;
  a: string;
  b?: string;
};

// Configuration interface - normalized, serializable
export interface XhsConfig {
  orchestrateMode: 'p12' | 'p1' | 'unified';
  keyword: string;
  env: 'debug' | 'prod';
  accountMode: 'single' | 'shard';
  singleProfile: string;
  shardProfiles: string[];
  maxNotes: number;
  
  // Mode flags
  dryRun: boolean;
  protocolMode: boolean;
  headless: boolean;
  
  // Feature flags
  doHomepage: boolean;
  doImages: boolean;
  doComments: boolean;
  doLikes: boolean;
  doReply: boolean;
  doOcr: boolean;
  doGate: boolean;
  
  // Sub-settings
  maxComments: number;
  commentRounds: number;
  matchKeywords: string;
  matchMode: 'any' | 'all';
  matchMinHits: number;
  maxLikes: number;
  likeRules: LikeRuleDraft[];
  replyText: string;
  ocrCommand: string;
  opOrder: 'harvest_first' | 'like_first' | 'interleave';
}

// Default configuration
export function getDefaultConfig(): XhsConfig {
  return {
    orchestrateMode: 'unified',
    keyword: '',
    env: 'prod',
    accountMode: 'single',
    singleProfile: 'xiaohongshu_default',
    shardProfiles: ['xiaohongshu_default'],
    maxNotes: 100,
    
    dryRun: true,
    protocolMode: true,
    headless: true,
    
    doHomepage: true,
    doImages: false,
    doComments: true,
    doLikes: false,
    doReply: false,
    doOcr: false,
    doGate: false,
    
    maxComments: 0,
    commentRounds: 0,
    matchKeywords: '',
    matchMode: 'any',
    matchMinHits: 1,
    maxLikes: 0,
    likeRules: [],
    replyText: '',
    ocrCommand: 'deepseek-ocr',
    opOrder: 'harvest_first',
  };
}

// Effective flags computed from config (dependencies enforced)
export interface XhsEffectiveFlags {
  doHomepage: boolean;
  doImages: boolean;
  doComments: boolean;
  doLikes: boolean;
  doReply: boolean;
  doOcr: boolean;
  doGate: boolean;
}

export function computeEffectiveFlags(config: XhsConfig): XhsEffectiveFlags {
  return {
    // Images depend on homepage
    doHomepage: config.doHomepage,
    doImages: config.doHomepage && config.doImages,
    
    // Likes depend on comments (need to read comments to match)
    doComments: config.doComments || config.doLikes,
    doLikes: config.doLikes,
    
    // Reply depends on reading comments
    doReply: config.doReply,
    
    // OCR depends on images
    doOcr: config.doImages && config.doOcr,
    
    // Gate depends on likes
    doGate: config.doLikes && config.doGate,
  };
}

// UI Controls interface - references to HTML elements
export interface XhsControls {
  // Orchestration
  orchestrateSelect: HTMLSelectElement;
  keywordInput: HTMLInputElement;
  envSelect: HTMLSelectElement;
  accountModeSelect: HTMLSelectElement;
  singleProfileSelect: HTMLSelectElement;
  shardProfileSelect: HTMLSelectElement;
  maxNotesInput: HTMLInputElement;
  
  // Mode flags
  dryRunCheckbox: HTMLInputElement;
  protocolModeCheckbox: HTMLInputElement;
  headlessCheckbox: HTMLInputElement;
  
  // Features
  homepageCheckbox: HTMLInputElement;
  imagesCheckbox: HTMLInputElement;
  commentsCheckbox: HTMLInputElement;
  likesCheckbox: HTMLInputElement;
  replyCheckbox: HTMLInputElement;
  ocrCheckbox: HTMLInputElement;
  gateCheckbox: HTMLInputElement;
  
  // Sub-settings containers
  imagesSettings: HTMLElement;
  commentsSettings: HTMLElement;
  likesSettings: HTMLElement;
  replySettings: HTMLElement;
  ocrSettings: HTMLElement;
  gateSettings: HTMLElement;
  
  // Sub-settings inputs
  maxCommentsInput: HTMLInputElement;
  commentRoundsInput: HTMLInputElement;
  matchKeywordsInput: HTMLInputElement;
  matchModeSelect: HTMLSelectElement;
  matchMinHitsInput: HTMLInputElement;
  maxLikesInput: HTMLInputElement;
  likeRulesContainer: HTMLElement;
  replyTextInput: HTMLInputElement;
  ocrCommandInput: HTMLInputElement;
  opOrderSelect: HTMLSelectElement;
}

// Serialization helpers for LikeRule
export function stringifyLikeRule(rule: LikeRuleDraft): string {
  const a = String(rule.a || '').trim();
  const b = String(rule.b || '').trim();
  if (rule.kind === 'contains') return a;
  if (rule.kind === 'and') return `{${a} + ${b}}`;
  return `{${a} - ${b}}`;
}

export function parseLikeRuleToken(token: string): LikeRuleDraft | null {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const m = raw.match(/^\{\s*(.+?)\s*([+\-＋－])\s*(.+?)\s*\}$/);
  if (!m) return { kind: 'contains', a: raw };
  const a = String(m[1] || '').trim();
  const b = String(m[3] || '').trim();
  const op = m[2];
  if (op === '+' || op === '＋') return { kind: 'and', a, b };
  return { kind: 'include_without', a, b };
}

export function serializeLikeRules(rules: LikeRuleDraft[]): string {
  return rules.map(stringifyLikeRule).join(', ');
}

export function parseLikeRules(input: string): LikeRuleDraft[] {
  const tokens = input.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  return tokens.map(parseLikeRuleToken).filter((r): r is LikeRuleDraft => r !== null);
}

// Persistence
export function persistConfig(config: XhsConfig): void {
  try {
    window.localStorage.setItem(XHS_LAST_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
}

export function loadPersistedConfig(): Partial<XhsConfig> {
  try {
    const raw = window.localStorage.getItem(XHS_LAST_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Build run arguments from config
export function buildRunArgs(config: XhsConfig): string[] {
  const args: string[] = [];
  const flags = computeEffectiveFlags(config);
  
  // Base arguments
  args.push('--keyword', config.keyword);
  args.push('--env', config.env);
  args.push('--max-notes', String(config.maxNotes));
  
  if (config.dryRun) args.push('--dry-run');
  if (config.protocolMode) args.push('--protocol-mode');
  if (config.headless) args.push('--headless');
  
  // Feature flags
  if (flags.doHomepage) args.push('--do-homepage');
  if (flags.doImages) args.push('--do-images');
  if (flags.doComments) args.push('--do-comments');
  if (flags.doLikes) args.push('--do-likes');
  if (flags.doReply) args.push('--do-reply');
  if (flags.doOcr) args.push('--do-ocr');
  if (flags.doGate) args.push('--do-gate');
  
  // Sub-settings
  if (flags.doComments) {
    args.push('--max-comments', String(config.maxComments));
    if (config.commentRounds > 0) {
      args.push('--comment-rounds', String(config.commentRounds));
    }
  }
  
  if (flags.doLikes) {
    args.push('--like-keywords', config.matchKeywords);
    args.push('--match-mode', config.matchMode);
    args.push('--match-min-hits', String(config.matchMinHits));
    args.push('--max-likes', String(config.maxLikes));
    if (config.likeRules.length > 0) {
      args.push('--like-rules', serializeLikeRules(config.likeRules));
    }
  }
  
  if (flags.doReply) {
    args.push('--reply-text', config.replyText);
  }
  
  if (flags.doOcr) {
    args.push('--ocr-command', config.ocrCommand);
  }
  
  args.push('--op-order', config.opOrder);
  
  return args;
}

// Read config from UI controls
export function readConfigFromUI(controls: XhsControls): XhsConfig {
  const defaultConfig = getDefaultConfig();
  
  return {
    orchestrateMode: (controls.orchestrateSelect.value as XhsConfig['orchestrateMode']) || defaultConfig.orchestrateMode,
    keyword: controls.keywordInput.value.trim(),
    env: (controls.envSelect.value as XhsConfig['env']) || defaultConfig.env,
    accountMode: (controls.accountModeSelect.value as XhsConfig['accountMode']) || defaultConfig.accountMode,
    singleProfile: controls.singleProfileSelect.value,
    shardProfiles: Array.from(controls.shardProfileSelect.selectedOptions).map(opt => opt.value),
    maxNotes: parseInt(controls.maxNotesInput.value, 10) || defaultConfig.maxNotes,
    
    dryRun: controls.dryRunCheckbox.checked,
    protocolMode: controls.protocolModeCheckbox.checked,
    headless: controls.headlessCheckbox.checked,
    
    doHomepage: controls.homepageCheckbox.checked,
    doImages: controls.imagesCheckbox.checked,
    doComments: controls.commentsCheckbox.checked,
    doLikes: controls.likesCheckbox.checked,
    doReply: controls.replyCheckbox.checked,
    doOcr: controls.ocrCheckbox.checked,
    doGate: controls.gateCheckbox.checked,
    
    maxComments: parseInt(controls.maxCommentsInput.value, 10) || defaultConfig.maxComments,
    commentRounds: parseInt(controls.commentRoundsInput.value, 10) || defaultConfig.commentRounds,
    matchKeywords: controls.matchKeywordsInput.value.trim(),
    matchMode: (controls.matchModeSelect.value as XhsConfig['matchMode']) || defaultConfig.matchMode,
    matchMinHits: parseInt(controls.matchMinHitsInput.value, 10) || defaultConfig.matchMinHits,
    maxLikes: parseInt(controls.maxLikesInput.value, 10) || defaultConfig.maxLikes,
    likeRules: [], // Populated separately from UI
    replyText: controls.replyTextInput.value.trim(),
    ocrCommand: controls.ocrCommandInput.value.trim() || defaultConfig.ocrCommand,
    opOrder: (controls.opOrderSelect.value as XhsConfig['opOrder']) || defaultConfig.opOrder,
  };
}

// Apply config to UI controls
export function applyConfigToUI(config: Partial<XhsConfig>, controls: XhsControls): void {
  const defaults = getDefaultConfig();
  const c = { ...defaults, ...config };
  
  // Orchestration
  controls.orchestrateSelect.value = c.orchestrateMode;
  controls.keywordInput.value = c.keyword;
  controls.envSelect.value = c.env;
  controls.accountModeSelect.value = c.accountMode;
  controls.singleProfileSelect.value = c.singleProfile;
  controls.maxNotesInput.value = String(c.maxNotes);
  
  // Mode flags
  controls.dryRunCheckbox.checked = c.dryRun;
  controls.protocolModeCheckbox.checked = c.protocolMode;
  controls.headlessCheckbox.checked = c.headless;
  
  // Features
  controls.homepageCheckbox.checked = c.doHomepage;
  controls.imagesCheckbox.checked = c.doImages;
  controls.commentsCheckbox.checked = c.doComments;
  controls.likesCheckbox.checked = c.doLikes;
  controls.replyCheckbox.checked = c.doReply;
  controls.ocrCheckbox.checked = c.doOcr;
  controls.gateCheckbox.checked = c.doGate;
  
  // Sub-settings
  controls.maxCommentsInput.value = String(c.maxComments);
  controls.commentRoundsInput.value = String(c.commentRounds);
  controls.matchKeywordsInput.value = c.matchKeywords;
  controls.matchModeSelect.value = c.matchMode;
  controls.matchMinHitsInput.value = String(c.matchMinHits);
  controls.maxLikesInput.value = String(c.maxLikes);
  controls.replyTextInput.value = c.replyText;
  controls.ocrCommandInput.value = c.ocrCommand;
  controls.opOrderSelect.value = c.opOrder;
}

// Sync UI visibility based on config state
export function syncVisibility(
  config: XhsConfig,
  containers: {
    imagesSettings: HTMLElement;
    commentsSettings: HTMLElement;
    likesSettings: HTMLElement;
    replySettings: HTMLElement;
    ocrSettings: HTMLElement;
    gateSettings: HTMLElement;
  }
): void {
  // Images settings visible when homepage enabled
  containers.imagesSettings.style.display = config.doHomepage ? '' : 'none';
  
  // Comments settings visible when comments enabled
  containers.commentsSettings.style.display = config.doComments ? '' : 'none';
  
  // Likes settings visible when likes enabled
  containers.likesSettings.style.display = config.doLikes ? '' : 'none';
  
  // Reply settings visible when reply enabled
  containers.replySettings.style.display = config.doReply ? '' : 'none';
  
  // OCR settings visible when both images and ocr enabled
  containers.ocrSettings.style.display = (config.doImages && config.doOcr) ? '' : 'none';
  
  // Gate settings visible when both likes and gate enabled
  containers.gateSettings.style.display = (config.doLikes && config.doGate) ? '' : 'none';
}

// Initialize UI from persisted config
export function initUIFromPersistence(controls: XhsControls, containers: {
  imagesSettings: HTMLElement;
  commentsSettings: HTMLElement;
  likesSettings: HTMLElement;
  replySettings: HTMLElement;
  ocrSettings: HTMLElement;
  gateSettings: HTMLElement;
}): void {
  const persisted = loadPersistedConfig();
  if (Object.keys(persisted).length > 0) {
    applyConfigToUI(persisted, controls);
    const config = readConfigFromUI(controls);
    syncVisibility(config, containers);
  }
}

// Helper: Bind checkbox to show/hide a settings container
export function bindToggleVisibility(
  checkbox: HTMLInputElement,
  container: HTMLElement,
  onChange?: (checked: boolean) => void
): void {
  const update = () => {
    container.style.display = checkbox.checked ? '' : 'none';
    onChange?.(checkbox.checked);
  };
  checkbox.addEventListener('change', update);
  // Initial state
  setTimeout(update, 0);
}

// Helper: Create dependent toggle (parent must be checked for child to be enabled)
export function bindDependentToggle(
  parent: HTMLInputElement,
  child: HTMLInputElement,
  childContainer?: HTMLElement
): void {
  const update = () => {
    child.disabled = !parent.checked;
    if (childContainer) {
      childContainer.style.opacity = parent.checked ? '1' : '0.5';
    }
  };
  parent.addEventListener('change', update);
  setTimeout(update, 0);
}
