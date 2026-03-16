import { createEl } from '../../ui-components.mjs';
import { LikeRuleDraft, LikeRuleKind, XhsLastConfig, attachTooltip, bindSectionToggle, likeRuleGuide, makeCheckbox, makeNumberInput, makeTextInput, parseLikeRulesCsv, stringifyLikeRule } from './helpers.mjs';
type BuildLayoutOptions = { createTile: (id: string, titleText: string) => { tile: HTMLDivElement; body: HTMLDivElement }; card: HTMLDivElement; tileLane: HTMLDivElement; guideLockMask: HTMLDivElement; onboardingCard: HTMLDivElement; persistedConfig: XhsLastConfig };
export function buildXhsLayout(opts: BuildLayoutOptions) {
  const { createTile, card, tileLane, guideLockMask, onboardingCard, persistedConfig } = opts;
  let persistLastConfigHook = () => {};
  let persistLikeRuleAHistoryHook = () => {};
  let persistLikeRuleBHistoryHook = () => {};
  const orchestrateModeSelect = createEl('select', { style: 'width:280px;' }) as HTMLSelectElement;
  orchestrateModeSelect.appendChild(createEl('option', { value: 'phase1-phase2-unified', selected: true }, ['完整编排：Phase1 + Phase2 + Unified']));
  orchestrateModeSelect.appendChild(createEl('option', { value: 'phase1-phase2' }, ['仅预处理：Phase1 + Phase2']));
  orchestrateModeSelect.appendChild(createEl('option', { value: 'phase1-only' }, ['仅启动浏览器：Phase1']));
  orchestrateModeSelect.appendChild(createEl('option', { value: 'unified-only' }, ['仅执行 Unified（使用已有 links）']));
  const keywordInput = makeTextInput('黄金走势', '关键词');
  const envInput = makeTextInput('prod', 'env');
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
  const headlessCheckbox = makeCheckbox(false, 'xh-headless');
  const modeHint = createEl('div', { style: 'margin-bottom:8px; color:#64748b; font-size:12px;' }, [
    '完整编排推荐：先 Phase1 启动，再 Phase2 采集链接，最后 Unified 采集评论/点赞。',
  ]);
  const baseParamsTile = createEl('div', { style: 'display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:10px;' });
  const tileBase1 = createEl('div', { className: 'xhs-bento-card' });
  tileBase1.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['📋 编排设置']));
  tileBase1.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['模式']), orchestrateModeSelect,
  ]));
  tileBase1.appendChild(createEl('div', { className: 'row', style: 'gap:6px;' }, [
    createEl('label', { style: 'font-size:12px;' }, ['关键词']), keywordInput,
  ]));
  baseParamsTile.appendChild(tileBase1);
  const tileBase2 = createEl('div', { className: 'xhs-bento-card' });
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
  const batchKeyValue = createEl('div', { className: 'muted', style: 'font-size:12px; min-width:160px;' }, ['xiaohongshu']) as HTMLDivElement;
  const batchNextBtn = createEl('button', { type: 'button', className: 'secondary' }, ['新建批次']) as HTMLButtonElement;
  const accountAuditCard = createEl('div', { className: 'xhs-compact-card xhs-bento-card' });
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
  accountAuditCard.appendChild(createEl('div', { className: 'row', style: 'margin-top:4px; margin-bottom:6px;' }, [
    createEl('label', { style: 'font-size:12px; color:#8b93a6;' }, ['当前批次']),
    batchKeyValue,
    batchNextBtn,
  ]));
  accountAuditCard.appendChild(createEl('div', { className: 'row', style: 'margin-bottom:0;' }, [accountNextLikeBtn]));
  // accountAuditCard is placed as an independent card in account bento grid
  baseParamsTile.appendChild(tileBase2);
  const tileBase3 = createEl('div', { className: 'xhs-bento-card' });
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
  const featureTiles = createEl('div', { style: 'display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:10px; align-items:start; grid-auto-rows:min-content;' });
  const homepageToggle = makeCheckbox(false, 'xh-do-homepage');
  const imagesToggle = makeCheckbox(false, 'xh-do-images');
  const homeSection = createEl('div', { className: 'xhs-bento-card' });
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
  const commentsToggle = makeCheckbox(true, 'xh-do-comments');
  const maxCommentsInput = makeNumberInput('0', '0');
  const commentRoundsInput = makeNumberInput('0', '0');
  const commentsSection = createEl('div', { className: 'xhs-bento-card' });
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
  const gateToggle = makeCheckbox(false, 'xh-do-gate');
  const gateSection = createEl('div', { className: 'xhs-bento-card' });
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
  const likesToggle = makeCheckbox(false, 'xh-do-likes');
  const maxLikesInput = makeNumberInput('0', '0');
  const likesSection = createEl('div', { className: 'xhs-bento-card' });
  likesSection.appendChild(createEl('div', { className: 'row', style: 'gap:6px; margin-bottom:8px;' }, [
    likesToggle,
    createEl('label', { htmlFor: 'xh-do-likes', style: 'cursor:pointer; font-weight:600;' }, ['评论点赞']),
  ]));
  const likesBody = createEl('div', { className: 'xhs-bento-grid xhs-bento-grid--tight' });
  const tile1 = createEl('div', { className: 'xhs-compact-card', style: 'display:flex; flex-direction:column;' });
  tile1.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['📊 数量限制']));
  tile1.appendChild(createEl('div', { className: 'row', style: 'gap:6px; flex-wrap:nowrap;' }, [
    createEl('label', { style: 'font-size:12px; white-space:nowrap; color:#8b93a6;' }, ['每轮滚动点赞上限']), 
    maxLikesInput,
  ]));
  likesBody.appendChild(tile1);
  const likeRuleTypeSelect = createEl('select', { style: 'width:100%; font-size:12px;' }) as HTMLSelectElement;
  likeRuleTypeSelect.appendChild(createEl('option', { value: 'contains' }, ['单关键词']));
  likeRuleTypeSelect.appendChild(createEl('option', { value: 'and' }, ['同时包含 {A+B}']));
  likeRuleTypeSelect.appendChild(createEl('option', { value: 'include_without' }, ['包含排除 {A-B}']));
  const tile2 = createEl('div', { className: 'xhs-compact-card', style: 'display:flex; flex-direction:column;' });
  tile2.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['🎯 匹配模式']));
  tile2.appendChild(likeRuleTypeSelect);
  const likeRuleHelp = createEl('div', { style: 'color:#8b93a6; font-size:10px; margin-top:6px; line-height:1.4;' });
  tile2.appendChild(likeRuleHelp);
  likesBody.appendChild(tile2);
  const likeRuleAInput = makeTextInput('', '词A', '100%');
  const likeRuleBInput = makeTextInput('', '词B (可选)', '100%');
  const addLikeRuleBtn = createEl('button', { type: 'button', style: 'width:100%; font-size:12px;' }, ['+ 添加规则']) as HTMLButtonElement;
  const tile3 = createEl('div', { className: 'xhs-compact-card', style: 'display:flex; flex-direction:column;' });
  tile3.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:8px; font-size:13px; color:#2b67ff;' }, ['➕ 添加规则']));
  tile3.appendChild(createEl('div', { style: 'margin-bottom:6px;' }, [likeRuleAInput]));
  tile3.appendChild(createEl('div', { style: 'margin-bottom:6px;' }, [likeRuleBInput]));
  tile3.appendChild(addLikeRuleBtn);
  likesBody.appendChild(tile3);
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
        persistLastConfigHook();
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
    persistLikeRuleAHistoryHook();
    persistLikeRuleBHistoryHook();
    likeRuleAInput.value = '';
    likeRuleBInput.value = '';
    refreshLikeRuleList();
    persistLastConfigHook();
  };
  likeRuleTypeSelect.onchange = refreshLikeGuide;
    const persistedLikeRules = parseLikeRulesCsv(String(persistedConfig.likeRules || ''));
  if (persistedLikeRules.length > 0) {
    likeRules.splice(0, likeRules.length, ...persistedLikeRules);
  }
  refreshLikeGuide();
  refreshLikeRuleList();
  const ruleListRow = createEl('div', { style: 'grid-column:1 / -1; margin-top:4px; border:1px solid #23262f; border-radius:8px; padding:8px; background:#0b1220;' });
  ruleListRow.appendChild(createEl('div', { style: 'font-size:11px; color:#8b93a6; margin-bottom:6px;' }, ['已添加规则（点击 × 删除）：']));
  ruleListRow.appendChild(likeRuleList);
  likesBody.appendChild(ruleListRow);
 likesSection.appendChild(likesBody);
 attachTooltip(likesSection, '评论点赞：按规则对评论点赞；需配置关键词规则和点赞上限。');
 const likeNextBoardBtn = createEl('button', { type: 'button', className: 'secondary' }, ['点赞设置完成：回看板']) as HTMLButtonElement;
  likesSection.appendChild(createEl('div', { className: 'row', style: 'margin-top:8px; margin-bottom:0;' }, [likeNextBoardBtn]));
  bindSectionToggle(likesToggle, likesBody);
  featureTiles.appendChild(likesSection);
  const replyToggle = makeCheckbox(false, 'xh-do-reply');
  const replyTextInput = makeTextInput('感谢分享，已关注', '回复内容');
  const replySection = createEl('div', { className: 'xhs-bento-card' });
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
  const ocrSection = createEl('div', { className: 'xhs-bento-card' });
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
  const opOrderInput = makeTextInput('', '执行顺序列表（留空使用默认编排）');
  const opOrderRow = createEl('div', { className: 'row', style: 'gap:8px; margin-bottom:12px;' }, [
    createEl('label', { style: 'width:86px;' }, ['执行顺序']), opOrderInput,
  ]);
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
  const statsSection = createEl('div', { className: 'xhs-bento-card', style: 'margin-bottom:0;' });
  const statsRow = createEl('div', {
    className: 'row',
    style: 'flex-wrap: nowrap; gap: 16px; margin-bottom: 8px; font-size: 12px; overflow-x: auto;',
  });
  const linksStat = createEl('span', { className: 'muted' }, ['链接：0/0']) as HTMLSpanElement;
  const postsStat = createEl('span', { className: 'muted' }, ['帖子：0']) as HTMLSpanElement;
  const commentsStat = createEl('span', { className: 'muted' }, ['评论：0/不限']) as HTMLSpanElement;
  const likesStat = createEl('span', { className: 'muted' }, ['点赞：0']) as HTMLSpanElement;
  const likesSkipStat = createEl('span', { className: 'muted' }, ['点赞跳过：0']) as HTMLSpanElement;
  const repliesStat = createEl('span', { className: 'muted' }, ['回复：0']) as HTMLSpanElement;
  const streamStat = createEl('span', { className: 'muted', style: 'font-size:11px;' }, ['事件流：未绑定']) as HTMLSpanElement;
  [linksStat, postsStat, commentsStat, likesStat, likesSkipStat, repliesStat, streamStat].forEach(el => statsRow.appendChild(el));
  statsSection.appendChild(statsRow);
  const shardStatsTitle = createEl('div', { style: 'margin-top:6px; font-weight:600;' }, ['分片进度（合并 + 明细）']) as HTMLDivElement;
  const shardStatsList = createEl('div', { style: 'display:flex; flex-direction:column; gap:6px; margin-top:6px;' }) as HTMLDivElement;
  statsSection.appendChild(shardStatsTitle);
  statsSection.appendChild(shardStatsList);
  const likedTitle = createEl('div', { style: 'margin-top:8px; font-weight:600;' }, ['已点赞帖子']) as HTMLDivElement;
  const likedList = createEl('div', { style: 'display:flex; flex-direction:column; gap:6px; margin-top:6px;' }) as HTMLDivElement;
  const repliedTitle = createEl('div', { style: 'margin-top:10px; font-weight:600;' }, ['已回复帖子']) as HTMLDivElement;
  const repliedList = createEl('div', { style: 'display:flex; flex-direction:column; gap:6px; margin-top:6px;' }) as HTMLDivElement;
  statsSection.appendChild(likedTitle);
  statsSection.appendChild(likedList);
  statsSection.appendChild(repliedTitle);
  statsSection.appendChild(repliedList);
  const boardTile = createTile('board', '运行看板');
  boardTile.body.appendChild(statsSection);
  const likeTile = createTile('like', '点赞设置');
  const likeBento = createEl('div', { className: 'xhs-bento-grid xhs-bento-grid--tight' });
  likeBento.appendChild(likesSection);
  likeTile.body.appendChild(likeBento);
  const accountTile = createTile('account', '账号检查与登录引导');
  const accountBento = createEl('div', { className: 'xhs-bento-grid' });
  accountBento.appendChild(onboardingCard);
  accountBento.appendChild(tileBase2);
  accountBento.appendChild(accountAuditCard);
  accountTile.body.appendChild(accountBento);
  const runTile = createTile('run', '编排与运行参数');
  const runBento = createEl('div', { className: 'xhs-bento-grid' });
  runBento.appendChild(tileBase1);
  runBento.appendChild(tileBase3);
  runBento.appendChild(createEl('div', { className: 'xhs-compact-card xhs-bento-card' }, [modeHint]));
  runBento.appendChild(createEl('div', { className: 'xhs-compact-card xhs-bento-card' }, [opOrderRow]));
  runTile.body.appendChild(runBento);
  const commentTile = createTile('comment', '评论与回复设置');
  const commentBento = createEl('div', { className: 'xhs-bento-grid xhs-bento-grid--tight' });
  commentBento.appendChild(commentsSection);
  commentBento.appendChild(gateSection);
  commentBento.appendChild(replySection);
  commentTile.body.appendChild(commentBento);
  const collectTile = createTile('collect', '主页采集与OCR');
  const collectBento = createEl('div', { className: 'xhs-bento-grid xhs-bento-grid--tight' });
  collectBento.appendChild(homeSection);
  collectBento.appendChild(ocrSection);
  collectTile.body.appendChild(collectBento);
 [boardTile.tile, likeTile.tile, runTile.tile, accountTile.tile, commentTile.tile, collectTile.tile].forEach((tile) => tileLane.appendChild(tile));
 tileLane.style.position = 'relative';
 tileLane.appendChild(guideLockMask);
 card.appendChild(tileLane);
  const bindLikeRulePersistence = (hooks: { persistLastConfig: () => void; persistLikeRuleAHistory: () => void; persistLikeRuleBHistory: () => void }) => {
    persistLastConfigHook = hooks.persistLastConfig;
    persistLikeRuleAHistoryHook = hooks.persistLikeRuleAHistory;
    persistLikeRuleBHistoryHook = hooks.persistLikeRuleBHistory;
  };
  return {
    orchestrateModeSelect, keywordInput, envInput, accountModeSelect, profilePickSel, profileRefreshBtn, shardProfilesBox, shardProfilesHint, shardResolvedHint,
    maxNotesInput, dryRunCheckbox, protocolModeCheckbox, headlessCheckbox, modeHint, singleProfileRow, singleProfileHint, shardProfilesSection,
    accountAuditSummary, accountAuditList, accountRefreshBtn, accountLiveProbeBtn, addAccountCountInput, addBatchNameInput, accountAddBtn,
    accountNextLikeBtn, batchKeyValue, batchNextBtn, homepageToggle, imagesToggle, commentsToggle, maxCommentsInput, commentRoundsInput, gateToggle, matchKeywordsInput,
    matchModeSelect, matchMinHitsInput, likesToggle, maxLikesInput, likeRuleTypeSelect, likeRuleAInput, likeRuleBInput, addLikeRuleBtn,
    likeRulePreview, replyToggle, replyTextInput, ocrToggle, ocrCommandInput, opOrderInput, opOrderRow, homeSection, commentsSection, gateSection,
    likesSection, replySection, ocrSection, likeNextBoardBtn, linksStat, postsStat, commentsStat, likesStat, likesSkipStat, repliesStat, streamStat, shardStatsList, likedList,
    repliedList, persistedSingleProfile, persistedShardProfiles, bindLikeRulePersistence,
  };
}
