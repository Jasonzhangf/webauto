import { buildXhsDetailOperations } from './xhs-autoscript-detail-ops.mjs';
export function buildXhsBootstrapOperations(options) {
  const { recovery, detailLinksStartup } = options;
  return [
    {
      id: 'sync_window_viewport',
      action: 'sync_window_viewport',
      params: { followWindow: true, settleMs: 220, attempts: 2 },
      trigger: 'startup',
      once: true,
      retry: { attempts: 3, backoffMs: 500 },
      impact: 'op',
      onFailure: 'continue',
    },
    {
      id: 'goto_home',
      action: 'goto',
      params: { url: 'https://www.xiaohongshu.com/explore' },
      trigger: 'startup',
      dependsOn: ['sync_window_viewport'],
      once: true,
      retry: { attempts: 2, backoffMs: 300 },
      validation: {
        mode: 'post',
        post: {
          page: { hostIncludes: ['xiaohongshu.com'], checkpointIn: ['home_ready', 'search_ready'] },
        },
      },
      checkpoint: {
        containerId: 'xiaohongshu_home.discover_button',
        targetCheckpoint: 'home_ready',
        recovery,
      },
    },
  ];
}

export function buildXhsSearchOperations(options) {
  const {
    keyword,
    searchSerialKey,
    sharedHarvestPath,
    profileId,
    submitMethod,
    submitActionDelayMinMs,
    submitActionDelayMaxMs,
    submitSettleMinMs,
    submitSettleMaxMs,
    detailLinksStartup,
    detailLoopEnabled,
    recovery,
  } = options;

  const verifyDependsOn = detailLoopEnabled ? 'ensure_tab_pool' : 'submit_search';

  return [
    {
      id: 'wait_search_permit',
      enabled: !detailLinksStartup,
      action: 'xhs_wait_search_permit',
      params: {
        key: profileId,
        keyword,
        denyOnConsecutiveSame: false,
      },
      trigger: 'startup',
      dependsOn: ['goto_home'],
      once: true,
      timeoutMs: 300000,
      retry: { attempts: 1, backoffMs: 0 },
      impact: 'script',
      onFailure: 'stop_all',
      checkpoint: {
        containerId: 'xiaohongshu_home.search_input',
        targetCheckpoint: 'search_ready',
        recovery,
      },
    },
    {
      id: 'submit_search',
      enabled: !detailLinksStartup,
      action: 'xhs_submit_search',
      params: {
        keyword,
        searchSerialKey,
        sharedHarvestPath,
        method: submitMethod,
        lockTimeoutMs: Number(options.submitLockTimeoutMs ?? 20000) || 20000,
        actionDelayMinMs: submitActionDelayMinMs,
        actionDelayMaxMs: submitActionDelayMaxMs,
        settleMinMs: submitSettleMinMs,
        settleMaxMs: submitSettleMaxMs,
      },
      trigger: 'startup',
      dependsOn: ['wait_search_permit'],
      once: true,
      timeoutMs: 120000,
      validation: detailLinksStartup ? undefined : {
        mode: 'post',
        post: { page: { hostIncludes: ['xiaohongshu.com'], checkpointIn: ['search_ready', 'home_ready'] } },
      },
      checkpoint: {
        containerId: 'xiaohongshu_home.search_button',
        targetCheckpoint: 'search_ready',
        recovery,
      },
    },
   {
     id: 'verify_subscriptions_all_pages',
     action: 'verify_subscriptions',
     enabled: !detailLinksStartup,
     params: {
       acrossPages: true,
       settleMs: 800,
       pageUrlIncludes: ['/search_result'],
       requireMatchedPages: true,
       selectors: [
         { id: 'home_search_input', selector: '#search-input, input.search-input' },
         { id: 'search_result_item', selector: '.note-item', visible: false, minCount: 0 },
       ],
     },
     trigger: 'search_result_item.exist',
     dependsOn: [verifyDependsOn],
     once: true,
     timeoutMs: 300000,
     onFailure: 'continue',
     impact: 'op',
   },
  ];
}

export function buildXhsTabPoolOperation(options) {
  const { tabCount, tabOpenDelayMs, tabOpenMinDelayMs, detailLinksStartup } = options;
  // In detail mode with detailLinksStartup=true, skip tab pool creation.
  // Detail mode operates on existing safe-detail URLs from a prior collect phase.
  // Creating about:blank tabs provides no value and causes timeout issues.
  if (detailLinksStartup) {
    return [{
      id: 'ensure_tab_pool',
      enabled: false,
      action: 'ensure_tab_pool',
      params: { tabCount: 1, reuseOnly: true },
      trigger: 'startup',
      dependsOn: ['goto_home'],
      once: true,
    }];
  }
  return [
    {
      id: 'ensure_tab_pool',
      action: 'ensure_tab_pool',
      params: {
        tabCount,
        openDelayMs: tabOpenDelayMs,
        minDelayMs: tabOpenMinDelayMs,
        reuseOnly: false,
        normalizeTabs: false,
        seedOnOpen: true,
        shortcutOnly: false,
      },
      trigger: 'search_result_item.exist',
      dependsOn: ['submit_search'],
      once: true,
      timeoutMs: 60000,
      retry: { attempts: 1, backoffMs: 0 },
      impact: 'op',
      onFailure: 'continue',
      validation: detailLinksStartup
        ? undefined
        : {
            mode: 'post',
            post: { page: { hostIncludes: ['xiaohongshu.com'], checkpointIn: ['search_ready', 'home_ready'] } },
          },
      checkpoint: {
        targetCheckpoint: 'search_ready',
        recovery: { attempts: 0, actions: [] },
      },
    },
  ];
}

export function buildXhsGuardOperations(options = {}) {
  const env = String(options.env || 'debug').trim().toLowerCase();
  const loginGuardEnabled = true;
  return [
    {
      id: 'abort_on_login_guard',
      enabled: loginGuardEnabled,
      action: 'xhs_assert_logged_in',
      params: { code: 'LOGIN_GUARD_DETECTED' },
      trigger: 'login_guard.appear',
      once: false,
      retry: { attempts: 1, backoffMs: 0 },
      impact: 'script',
      onFailure: 'stop_all',
      checkpoint: {
        containerId: 'xiaohongshu_login.login_guard',
        targetCheckpoint: 'login_guard',
        recovery: { attempts: 0, actions: [] },
      },
    },
    {
      id: 'abort_on_risk_guard',
      action: 'raise_error',
      params: { code: 'RISK_CONTROL_DETECTED' },
      trigger: 'risk_guard.appear',
      once: false,
      retry: { attempts: 1, backoffMs: 0 },
      impact: 'script',
      onFailure: 'stop_all',
      checkpoint: {
        containerId: 'xiaohongshu_login.qrcode_guard',
        targetCheckpoint: 'risk_control',
        recovery: { attempts: 0, actions: [] },
      },
    },
  ];
}

export function buildXhsFeedLikeOperations(options = {}) {
  return [
    {
      id: 'feed_like_round',
      action: 'xhs_feed_like',
      params: {
        keyword: options.keyword,
        keywords: options.keywords,
        actionMode: options.actionMode ?? options.mode,
        unlikesPerRound: options.unlikesPerRound,
        maxUnlikesPerTab: options.maxUnlikesPerTab,
        maxLikesPerTab: options.maxLikesPerTab,
        likesPerRound: options.maxLikesPerTab ?? 5,
        likeIntervalMinMs: options.likeIntervalMinMs,
        likeIntervalMaxMs: options.likeIntervalMaxMs,
        maxNoProgressScrolls: options.maxNoProgressScrolls,
      },
      trigger: 'search_result_item.exist',
      dependsOn: ['submit_search'],
      once: true, // 单次长运行，内部自行管理 Tab 轮转
      disableTimeout: true,
      retry: { attempts: 1, backoffMs: 0 },
      impact: 'script',
      onFailure: 'stop_all',
      validation: { mode: 'none' },
      checkpoint: {
        containerId: 'xiaohongshu_search.search_result_item',
        targetCheckpoint: 'search_ready',
        recovery: options.recovery,
      },
    },
  ];
}

export { buildXhsDetailOperations };
