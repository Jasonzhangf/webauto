import { createEl } from '../../ui-components.mjs';
import { XhsLastConfig, makeCheckbox, makeNumberInput, makeTextInput } from './helpers.mjs';

type BuildLayoutOptions = {
  createTile: (id: string, titleText: string) => { tile: HTMLDivElement; body: HTMLDivElement };
  card: HTMLDivElement;
  tileLane: HTMLDivElement;
  guideLockMask: HTMLDivElement;
  onboardingCard: HTMLDivElement;
  persistedConfig: XhsLastConfig;
};

export function buildXhsLayout(opts: BuildLayoutOptions) {
  const { createTile, card, tileLane, onboardingCard, persistedConfig } = opts;

  // ============================================
  // 核心配置项（Release态可见）
  // ============================================

  // 账号选择
  const profilePickSel = createEl('select', { style: 'min-width:360px; max-width:580px;' }) as HTMLSelectElement;
  profilePickSel.appendChild(createEl('option', { value: '' }, ['(请选择账号：alias / profile)']));
  const profileRefreshBtn = createEl('button', { type: 'button', className: 'secondary' }, ['刷新账号']) as HTMLButtonElement;

  // 任务设置
  const keywordInput = makeTextInput('', '搜索关键词（必填）');
  const maxNotesInput = makeNumberInput('100', '1');
  const commentsToggle = makeCheckbox(true, 'xh-do-comments');
  const likesToggle = makeCheckbox(false, 'xh-do-likes');

  // ============================================
  // 固定值配置（不显示UI）
  // ============================================
  // orchestrateMode: unified-only
  // accountMode: single
  // env: prod
  // dryRun: false
  // protocolMode: true
  // headless: false

  // ============================================
  // 简化的UI布局
  // ============================================

  // 账号登录区
  const accountSection = createEl('div', { className: 'xhs-bento-card' });
  accountSection.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:14px; color:#2b67ff;' }, ['👤 账号登录']));
  const accountRow = createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:6px;' });
  accountRow.appendChild(createEl('label', { style: 'font-size:12px; min-width:60px;' }, ['选择账号']));
  accountRow.appendChild(profilePickSel);
  accountRow.appendChild(profileRefreshBtn);
  accountSection.appendChild(accountRow);

  // 账号状态提示
  const singleProfileHint = createEl('div', { className: 'muted', style: 'font-size:12px; margin:6px 0;' }, [
    '当前实际使用：(未选择账号)',
  ]) as HTMLDivElement;

  // 任务设置区
  const taskSection = createEl('div', { className: 'xhs-bento-card' });
  taskSection.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:14px; color:#2b67ff;' }, ['⚙️ 任务设置']));

  // 关键字
  const keywordRow = createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:6px;' });
  keywordRow.appendChild(createEl('label', { style: 'font-size:12px; min-width:60px;' }, ['关键词']));
  keywordRow.appendChild(keywordInput);
  taskSection.appendChild(keywordRow);

  // 目标数量
  const maxNotesRow = createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:6px;' });
  maxNotesRow.appendChild(createEl('label', { style: 'font-size:12px; min-width:60px;' }, ['目标帖子']));
  maxNotesRow.appendChild(maxNotesInput);
  taskSection.appendChild(maxNotesRow);

  // 功能开关
  const togglesRow = createEl('div', { className: 'row', style: 'gap:16px; margin-bottom:6px;' });
  togglesRow.appendChild(commentsToggle);
  togglesRow.appendChild(createEl('label', { htmlFor: 'xh-do-comments', style: 'cursor:pointer; font-size:12px;' }, ['评论采集']));
  togglesRow.appendChild(likesToggle);
  togglesRow.appendChild(createEl('label', { htmlFor: 'xh-do-likes', style: 'cursor:pointer; font-size:12px;' }, ['评论点赞']));
  taskSection.appendChild(togglesRow);

  // ============================================
  // 状态显示区
  // ============================================
  const statsSection = createEl('div', { className: 'xhs-bento-card', style: 'margin-bottom:0;' });
  statsSection.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:14px; color:#2b67ff;' }, ['📊 运行状态']));

  const statsRow = createEl('div', {
    className: 'row',
    style: 'flex-wrap: wrap; gap: 12px; margin-bottom: 8px; font-size: 12px;',
  });

  const linksStat = createEl('span', { className: 'muted' }, ['链接：0/0']) as HTMLSpanElement;
  const postsStat = createEl('span', { className: 'muted' }, ['帖子：0']) as HTMLSpanElement;
  const commentsStat = createEl('span', { className: 'muted' }, ['评论：0']) as HTMLSpanElement;
  const likesStat = createEl('span', { className: 'muted' }, ['点赞：0']) as HTMLSpanElement;
  const streamStat = createEl('span', { className: 'muted', style: 'font-size:11px;' }, ['状态：空闲']) as HTMLSpanElement;

  [linksStat, postsStat, commentsStat, likesStat, streamStat].forEach(el => statsRow.appendChild(el));
  statsSection.appendChild(statsRow);

  // 分片进度（简化版，隐藏）
  const shardStatsList = createEl('div', { style: 'display:none;' }) as HTMLDivElement;
  statsSection.appendChild(shardStatsList);

  // 已点赞/已回复列表（简化版，隐藏）
  const likedList = createEl('div', { style: 'display:none;' }) as HTMLDivElement;
  const repliedList = createEl('div', { style: 'display:none;' }) as HTMLDivElement;
  statsSection.appendChild(likedList);
  statsSection.appendChild(repliedList);

  // ============================================
  // Tile布局（简化版）
  // ============================================

  // 账号Tile
  const accountTile = createTile('account', '账号登录');
  const accountBento = createEl('div', { className: 'xhs-bento-grid' });
  accountBento.appendChild(onboardingCard);
  accountBento.appendChild(accountSection);
  accountTile.body.appendChild(accountBento);

  // 任务Tile
  const runTile = createTile('run', '任务设置');
  const runBento = createEl('div', { className: 'xhs-bento-grid' });
  runBento.appendChild(taskSection);
  runTile.body.appendChild(runBento);

  // 看板Tile
  const boardTile = createTile('board', '运行状态');
  boardTile.body.appendChild(statsSection);

  // 添加到tileLane
  [boardTile.tile, accountTile.tile, runTile.tile].forEach((tile) => tileLane.appendChild(tile));

  card.appendChild(tileLane);

  // ============================================
  // 返回值（简化版）
  // ============================================
  const persistedSingleProfile = String(persistedConfig.singleProfile || '').trim();
  const persistedShardProfiles = new Set<string>();

  // 应用持久化值
  if (typeof persistedConfig.doComments === 'boolean') commentsToggle.checked = persistedConfig.doComments;
  if (typeof persistedConfig.doLikes === 'boolean') likesToggle.checked = persistedConfig.doLikes;

  const bindLikeRulePersistence = () => {};

  return {
    // 核心配置
    profilePickSel,
    profileRefreshBtn,
    keywordInput,
    maxNotesInput,
    commentsToggle,
    likesToggle,
    singleProfileHint,

    // 状态显示
    linksStat,
    postsStat,
    commentsStat,
    likesStat,
    streamStat,
    shardStatsList,
    likedList,
    repliedList,

    // 持久化
    persistedSingleProfile,
    persistedShardProfiles,
    bindLikeRulePersistence,

    // 隐藏的配置（返回空元素/默认值）
    orchestrateModeSelect: createEl('select', { style: 'display:none;' }) as HTMLSelectElement,
    envInput: createEl('input', { type: 'hidden', value: 'prod' }) as HTMLInputElement,
    accountModeSelect: createEl('select', { style: 'display:none;' }) as HTMLSelectElement,
    shardProfilesBox: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    shardProfilesHint: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    shardResolvedHint: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    dryRunCheckbox: makeCheckbox(false, 'xh-dry-run-hidden'),
    protocolModeCheckbox: makeCheckbox(true, 'xh-protocol-mode-hidden'),
    headlessCheckbox: makeCheckbox(false, 'xh-headless-hidden'),
    modeHint: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    singleProfileRow: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    shardProfilesSection: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    accountAuditSummary: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    accountAuditList: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    accountRefreshBtn: createEl('button', { style: 'display:none;' }) as HTMLButtonElement,
    accountLiveProbeBtn: createEl('button', { style: 'display:none;' }) as HTMLButtonElement,
    addAccountCountInput: makeNumberInput('1', '1'),
    addBatchNameInput: makeTextInput('', ''),
    accountAddBtn: createEl('button', { style: 'display:none;' }) as HTMLButtonElement,
    accountNextLikeBtn: createEl('button', { style: 'display:none;' }) as HTMLButtonElement,
    batchKeyValue: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    batchNextBtn: createEl('button', { style: 'display:none;' }) as HTMLButtonElement,
    homepageToggle: makeCheckbox(false, 'xh-do-homepage-hidden'),
    imagesToggle: makeCheckbox(false, 'xh-do-images-hidden'),
    maxCommentsInput: makeNumberInput('0', '0'),
    commentRoundsInput: makeNumberInput('0', '0'),
    gateToggle: makeCheckbox(false, 'xh-do-gate-hidden'),
    matchKeywordsInput: makeTextInput('', ''),
    matchModeSelect: createEl('select', { style: 'display:none;' }) as HTMLSelectElement,
    matchMinHitsInput: makeNumberInput('2', '1'),
    maxLikesInput: makeNumberInput('0', '0'),
    likeRuleTypeSelect: createEl('select', { style: 'display:none;' }) as HTMLSelectElement,
    likeRuleAInput: makeTextInput('', ''),
    likeRuleBInput: makeTextInput('', ''),
    addLikeRuleBtn: createEl('button', { style: 'display:none;' }) as HTMLButtonElement,
    likeRulePreview: createEl('input', { type: 'hidden' }) as HTMLInputElement,
    replyToggle: makeCheckbox(false, 'xh-do-reply-hidden'),
    replyTextInput: makeTextInput('', ''),
    ocrToggle: makeCheckbox(false, 'xh-do-ocr-hidden'),
    ocrCommandInput: makeTextInput('', ''),
    opOrderInput: makeTextInput('', ''),
    opOrderRow: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    homeSection: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    commentsSection: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    gateSection: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    likesSection: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    replySection: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    ocrSection: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    likeNextBoardBtn: createEl('button', { style: 'display:none;' }) as HTMLButtonElement,
    likesSkipStat: createEl('span', { style: 'display:none;' }) as HTMLSpanElement,
    repliesStat: createEl('span', { style: 'display:none;' }) as HTMLSpanElement,
  };
}
