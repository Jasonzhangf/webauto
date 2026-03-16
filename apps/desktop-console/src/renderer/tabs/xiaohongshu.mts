import { createEl } from '../ui-components.mjs';
import {
  bindInputHistory,
  makeCheckbox,
  makeNumberInput,
  makeTextInput,
  readLastConfig,
  writeLastConfig,
} from './xiaohongshu/helpers.mjs';
import { createLiveStatsController } from './xiaohongshu/live-stats.mjs';
import { createAccountFlowController } from './xiaohongshu/account-flow.mjs';
import { createRunFlowController } from './xiaohongshu/run-flow.mjs';
import { buildXhsLayout } from './xiaohongshu/layout-block.mjs';

let xhsCmdUnsubscribe: (() => void) | null = null;
let xhsSettingsUnsubscribe: (() => void) | null = null;

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

  // 简化的 Tile 导航
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
    const tile = createEl('section', { className: `xhs-tile xhs-tile--${id}`, 'data-xhs-tile': id }) as HTMLDivElement;
    const head = createEl('div', { className: 'xhs-tile-head' }, [titleText]);
    const body = createEl('div', { className: 'xhs-tile-body' }) as HTMLDivElement;
    tile.onclick = () => setActiveTile(id);
    tile.appendChild(head);
    tile.appendChild(body);
    tileRegistry.set(id, tile);
    return { tile, body };
  };

  // 构建布局
  const persistedConfig = readLastConfig();
  const layout = buildXhsLayout({
    createTile,
    card,
    tileLane,
    guideLockMask: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    onboardingCard: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    persistedConfig,
  });

  const {
    profilePickSel,
    profileRefreshBtn,
    keywordInput,
    maxNotesInput,
    commentsToggle,
    likesToggle,
    singleProfileHint,
    linksStat,
    postsStat,
    commentsStat,
    likesStat,
    streamStat,
    shardStatsList,
    likedList,
    repliedList,
    persistedSingleProfile,
    persistedShardProfiles,
    bindLikeRulePersistence,
  } = layout;

  // 账号流程控制器
  const accountFlow = createAccountFlowController({
    api,
    profilePickSel,
    accountModeSelect: createEl('select', { style: 'display:none;' }) as HTMLSelectElement,
    singleProfileHint,
    shardProfilesBox: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    shardProfilesHint: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    shardResolvedHint: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
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
    onboardingSummary: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    onboardingCard: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    onboardingTips: createEl('div', { style: 'display:none;' }) as HTMLDivElement,
    persistedSingleProfile,
    persistedShardProfiles,
    setActiveTile,
    saveGuideState: () => {},
    applyGuideLock: () => {},
    getGuideState: () => ({ browserReady: true, accountReady: true, keywordSet: true }),
    setNavHint: () => {},
    runBrowserStatusCheck: async () => true,
  });


  // 历史输入持久化
  const persistHistoryFns: (() => void)[] = [];
  const registerHistoryInput = (input: HTMLInputElement, key: string) => {
    const persist = bindInputHistory(input, key, api);
    persistHistoryFns.push(persist);
    return persist;
  };
  registerHistoryInput(keywordInput, 'keyword');
  registerHistoryInput(maxNotesInput, 'target');

  // 运行流程控制器
  const runFlow = createRunFlowController({
    card,
    api,
    startRunBtn: null,
    modeSelect: createEl('select', { style: 'display:none;' }) as HTMLSelectElement,
    profileSelect: profilePickSel,
    keywordInput,
    headlessCheckbox: makeCheckbox(false, 'xh-headless-hidden'),
    maxNotesInput,
    commentsToggle,
    maxCommentsInput: makeNumberInput('50', '0'),
    likesToggle,
    maxLikesInput: makeNumberInput('10', '0'),
    likeKeywordsInput: makeTextInput('', ''),
    persistHistoryFns,
    persistLastConfig: () => {
      writeLastConfig({
        keyword: keywordInput.value,
        maxNotes: maxNotesInput.value,
        doComments: commentsToggle.checked,
        doLikes: likesToggle.checked,
        singleProfile: profilePickSel.value,
      });
    },
    focusAccountSetup: () => profilePickSel.focus(),
    focusKeywordSetup: () => keywordInput.focus(),
    liveStats: createLiveStatsController({
      maxCommentsInput: makeNumberInput('50', '0'),
      linksStat,
      postsStat,
      commentsStat,
      likesStat,
      likesSkipStat: createEl('span', { style: 'display:none;' }) as HTMLSpanElement,
      repliesStat: createEl('span', { style: 'display:none;' }) as HTMLSpanElement,
      streamStat,
      shardStatsList,
      likedList,
      repliedList,
    }),
  });

  startAccountAutoRefresh('tab-enter');

  // 设置变更监听
  xhsSettingsUnsubscribe = window.api.onSettingsChanged((next) => {
    api.settings = next;
    void refreshProfileChoices();
  });

  // 渲染 Tile
  const boardTile = createTile('board', '📊 运行状态');
  boardTile.body.appendChild(layout.statsSection || createEl('div', {}));

  const accountTile = createTile('account', '👤 账号登录');
  const accountBento = createEl('div', { className: 'xhs-bento-grid' });
  accountBento.appendChild(layout.accountSection || createEl('div', {}));
  accountTile.body.appendChild(accountBento);

  const runTile = createTile('run', '⚙️ 任务设置');
  const runBento = createEl('div', { className: 'xhs-bento-grid' });
  runBento.appendChild(layout.taskSection || createEl('div', {}));
  runTile.body.appendChild(runBento);

  [boardTile.tile, accountTile.tile, runTile.tile].forEach((tile) => tileLane.appendChild(tile));
  card.appendChild(tileLane);
  root.appendChild(card);
}

export function disposeXiaohongshuTab() {
  if (xhsCmdUnsubscribe) {
    xhsCmdUnsubscribe();
    xhsCmdUnsubscribe = null;
  }
  if (xhsSettingsUnsubscribe) {
    xhsSettingsUnsubscribe();
    xhsSettingsUnsubscribe = null;
  }
}
