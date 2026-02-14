import { createEl } from '../ui-components.mjs';
import * as state from './xiaohongshu-state.mjs';
import {
  LikeRuleDraft,
  LikeRuleKind,
  XHS_DEFAULT_BATCH_KEY,
  attachTooltip,
  bindInputHistory,
  bindSectionToggle,
  likeRuleGuide,
  makeCheckbox,
  makeNumberInput,
  makeTextInput,
  parseLikeRulesCsv,
  readLastConfig,
  stringifyLikeRule,
  writeLastConfig,
} from './xiaohongshu/helpers.mjs';
import { createLiveStatsController } from './xiaohongshu/live-stats.mjs';
import { createAccountFlowController } from './xiaohongshu/account-flow.mjs';
import { createRunFlowController } from './xiaohongshu/run-flow.mjs';
import { buildXhsLayout } from './xiaohongshu/layout-block.mjs';
import { consumeNavTarget, runGuideBrowserCheck } from './xiaohongshu/guide-browser-check.mjs';
let xhsCmdUnsubscribe: (() => void) | null = null;
let xhsSettingsUnsubscribe: (() => void) | null = null;
let startupBrowserChecked = false;
export function renderXiaohongshuTab(root: HTMLElement, api: any) {
  if (xhsCmdUnsubscribe) {
    xhsCmdUnsubscribe();
    xhsCmdUnsubscribe = null;
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
 const navigationModeEnabled = true;
 const navStepHint = createEl('div', { className: 'muted', style: 'font-size:12px;' }, ['导航模式：先账号检查，再点赞设置，最后回到运行看板。']) as HTMLDivElement;
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
  let runBtn: HTMLButtonElement | null = null;
 const guideCard = createEl('div', { 
   style: 'border:1px solid #26437a; background:#0c1830; border-radius:10px; padding:10px; margin-bottom:10px;'
 }) as HTMLDivElement;
 const guideTitle = createEl('div', { style: 'font-weight:600; margin-bottom:8px; color:#dbeafe;' }, ['🧭 新用户引导']) as HTMLDivElement;
 const guideProgress = createEl('div', { style: 'font-size:12px; color:#8b93a6; margin-bottom:8px;' }, ['检查进度...']) as HTMLDivElement;
 guideCard.appendChild(guideTitle); guideCard.appendChild(guideProgress);
 const browserStep = createEl('div', { style: 'margin-bottom:6px; padding:6px; background:#0f1419; border-radius:6px;' }) as HTMLDivElement;
 browserStep.appendChild(createEl('span', {}, ['1. ']));
 const browserStatus = createEl('span', { style: 'color:#f59e0b;' }, ['⏳ 检查浏览器']) as HTMLSpanElement;
 browserStep.appendChild(browserStatus);
 guideCard.appendChild(browserStep);
 const accountStep = createEl('div', { style: 'margin-bottom:6px; padding:6px; background:#0f1419; border-radius:6px;' }) as HTMLDivElement;
 accountStep.appendChild(createEl('span', {}, ['2. ']));
 const accountStatus = createEl('span', { style: 'color:#f59e0b;' }, ['⏳ 配置账号']) as HTMLSpanElement;
 accountStatus.style.cursor = 'pointer';
 accountStatus.title = '点击开始账号检查与交互配置';
 accountStatus.addEventListener('click', () => runInteractiveAccountCheck());
 accountStep.appendChild(accountStatus);
 guideCard.appendChild(accountStep);
 const keywordStep = createEl('div', { style: 'margin-bottom:6px; padding:6px; background:#0f1419; border-radius:6px;' }) as HTMLDivElement;
 keywordStep.appendChild(createEl('span', {}, ['3. ']));
 const keywordStatus = createEl('span', { style: 'color:#f59e0b;' }, ['⏳ 配置关键词']) as HTMLSpanElement;
 keywordStep.appendChild(keywordStatus); guideCard.appendChild(keywordStep);
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
  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('button, input, select, textarea, label, a'));
  };
  const createTile = (id: string, titleText: string) => {
    const tile = createEl('section', { className: 'xhs-tile', 'data-xhs-tile': id }) as HTMLDivElement;
    const head = createEl('div', { className: 'xhs-tile-head' }, [titleText]);
    const body = createEl('div', { className: 'xhs-tile-body' }) as HTMLDivElement;
    tile.addEventListener('pointerdown', (evt) => {
      if (isInteractiveTarget(evt.target)) return;
      setActiveTile(id);
    }, { capture: true });
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
  const guideLockMask = createEl('div', {
    style: 'position:absolute; inset:0; background:rgba(10,14,24,0.72); border:1px dashed #26437a; border-radius:10px; display:none; align-items:center; justify-content:center; z-index:5; color:#c7d2fe; text-align:center; padding:12px; font-size:12px; pointer-events:none;',
  }, ['请先完成引导：浏览器检查、账号登录、关键词配置']) as HTMLDivElement;
  const isKeywordReady = () => String(keywordInput.value || '').trim().length > 0;
  const runQuickBrowserCheck = async () => {
    await runGuideBrowserCheck(api, guideState, browserStatus, saveGuideState);
  };
 const applyGuideLock = () => {
    const accountReady = guideState.accountReady;
    const keywordReady = isKeywordReady();
    guideState.keywordSet = keywordReady;
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
    startRunBtn.style.display = '';
    startRunBtn.textContent = allReady ? '开始运行' : '仍然开始运行';
    tileLane.style.pointerEvents = '';
    tileLane.style.filter = '';
    guideLockMask.style.display = allReady ? 'none' : 'flex';
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.title = allReady ? '' : '引导未完成，仍可直接运行';
    }
    if (!allReady) {
      setActiveTile('account');
      const accountTile = tileRegistry.get('account');
      if (accountTile) accountTile.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
    saveGuideState(guideState);
 };
  const runBrowserStatusCheck = async (profileId: string, reason = 'account-check') => {
    if (typeof window.api?.cmdSpawn !== 'function') return false;
    const args = [
      window.api.pathJoin('scripts', 'browser-status.mjs'),
      profileId,
      '--site',
      'xiaohongshu',
    ];
    api?.appendLog?.(`[ui] browser-status (${reason}) profile=${profileId}`);
    await window.api.cmdSpawn({
      title: `browser-status ${profileId}`,
      cwd: '',
      args,
      groupKey: 'xiaohongshu',
    });
    return true;
  };
  const runInteractiveAccountCheck = async () => {
    const selectedProfile = String(profilePickSel.value || '').trim();
    if (!selectedProfile) {
      guideState.accountReady = false;
      applyGuideLock();
      setActiveTile('account');
      if (typeof api?.setActiveTab === 'function') api.setActiveTab('preflight');
      navStepHint.textContent = '请先新增账号并完成登录，再进行账号检查。';
      alert('请先新增账号并完成登录，再进行账号检查。');
      return;
    }
    const ok = await runBrowserStatusCheck(selectedProfile, 'guide-step');
    if (!ok) {
      setActiveTile('account');
      if (typeof api?.setActiveTab === 'function') api.setActiveTab('preflight');
      navStepHint.textContent = '账号检查失败，请在账号区重新触发登录。';
      alert('账号检查失败：cmdSpawn 不可用，请查看日志');
      return;
    }
    void refreshProfileChoices(selectedProfile);
  };
 card.appendChild(guideCard);
  const persistedConfig = readLastConfig();
  const layout = buildXhsLayout({
    createTile,
    card,
    tileLane,
    guideLockMask,
    onboardingCard,
    persistedConfig,
  });
  const {
    orchestrateModeSelect, keywordInput, envInput, accountModeSelect, profilePickSel, profileRefreshBtn,
    shardProfilesBox, shardProfilesHint, shardResolvedHint, maxNotesInput, dryRunCheckbox, protocolModeCheckbox,
    headlessCheckbox, modeHint, singleProfileRow, singleProfileHint, shardProfilesSection, accountAuditSummary,
    accountAuditList, accountRefreshBtn, accountLiveProbeBtn, addAccountCountInput, addBatchNameInput,
    accountAddBtn, accountNextLikeBtn, batchKeyValue, batchNextBtn, homepageToggle, imagesToggle, commentsToggle, maxCommentsInput,
    commentRoundsInput, gateToggle, matchKeywordsInput, matchModeSelect, matchMinHitsInput, likesToggle,
    maxLikesInput, likeRuleTypeSelect, likeRuleAInput, likeRuleBInput, addLikeRuleBtn, likeRulePreview,
    replyToggle, replyTextInput, ocrToggle, ocrCommandInput, opOrderInput, opOrderRow, homeSection,
    commentsSection, gateSection, likesSection, replySection, ocrSection, likeNextBoardBtn, linksStat,
    postsStat, commentsStat, likesStat, repliesStat, streamStat, likedList, repliedList,
    persistedSingleProfile, persistedShardProfiles, bindLikeRulePersistence,
  } = layout;
  accountNextLikeBtn.onclick = () => focusTile('like');
  likeNextBoardBtn.onclick = () => focusTile('board');
  browserStep.onclick = () => { focusTile('account'); void runQuickBrowserCheck(); };
  accountStep.onclick = () => { focusTile('account'); void runInteractiveAccountCheck(); };
  keywordStep.onclick = () => { focusTile('board'); keywordInput.focus(); };
  queueMicrotask(() => {
    const finalizeGuide = () => { navStepHint.textContent = 'Step 1: complete account check/login, then configure keyword.'; applyGuideLock(); };
    if (startupBrowserChecked) return void finalizeGuide();
    startupBrowserChecked = true;
    runQuickBrowserCheck().finally(finalizeGuide);
  });
  const liveStatsController = createLiveStatsController({
    maxCommentsInput,
    linksStat,
    postsStat,
    commentsStat,
    likesStat,
    repliesStat,
    streamStat,
    likedList,
    repliedList,
  });
  const accountFlow = createAccountFlowController({
    api,
    profilePickSel,
    accountModeSelect,
    singleProfileHint,
    shardProfilesBox,
    shardProfilesHint,
    shardResolvedHint,
    accountAuditSummary,
    accountAuditList,
    accountRefreshBtn,
    accountLiveProbeBtn,
    addAccountCountInput,
    addBatchNameInput,
    accountAddBtn,
    batchKeyValue,
    batchNextBtn,
    onboardingSummary,
    onboardingCard,
    onboardingTips,
    persistedSingleProfile,
    persistedShardProfiles,
    setActiveTile,
    saveGuideState,
    applyGuideLock,
    getGuideState: () => guideState,
    setNavHint: (text: string) => {
      navStepHint.textContent = text;
    },
    runBrowserStatusCheck,
  });
  const {
    refreshProfileChoices,
    startAccountAutoRefresh,
    stopAccountAutoRefresh,
    getSelectedShardProfiles,
    renderSingleProfileHint,
    renderShardHints,
    syncAddBatchPlaceholder,
  } = accountFlow;
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
  bindLikeRulePersistence({
    persistLastConfig,
    persistLikeRuleAHistory,
    persistLikeRuleBHistory,
  });
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
  consumeNavTarget(focusTile);
  void refreshProfileChoices();
  startAccountAutoRefresh('tab-enter');
  xhsSettingsUnsubscribe = window.api.onSettingsChanged((next: any) => {
    api.settings = next;
    void refreshProfileChoices();
  });
  const runFlow = createRunFlowController({
    card,
    api,
    startRunBtn,
    orchestrateModeSelect,
    accountModeSelect,
    profilePickSel,
    keywordInput,
    envInput,
    protocolModeCheckbox,
    headlessCheckbox,
    dryRunCheckbox,
    maxNotesInput,
    maxCommentsInput,
    commentRoundsInput,
    gateToggle,
    matchKeywordsInput,
    matchModeSelect,
    matchMinHitsInput,
    likesToggle,
    maxLikesInput,
    likeRulePreview,
    replyToggle,
    replyTextInput,
    ocrToggle,
    ocrCommandInput,
    opOrderInput,
    commentsToggle,
    persistHistoryFns,
    persistLastConfig,
    getSelectedShardProfiles,
    getEffectiveHomepageFlags,
    focusAccountSetup: () => {
      focusTile('account');
      queueMicrotask(() => {
        if (String(accountModeSelect.value || 'single').trim() === 'shards') {
          const firstShard = shardProfilesBox.querySelector('input[type=checkbox]') as HTMLInputElement | null;
          if (firstShard) firstShard.focus();
          return;
        }
        profilePickSel.focus();
      });
    },
    focusKeywordSetup: () => {
      focusTile('board');
      queueMicrotask(() => keywordInput.focus());
    },
    liveStats: liveStatsController,
  });
  runBtn = runFlow.runBtn;
  xhsCmdUnsubscribe = runFlow.dispose;
  root.appendChild(card);
}
