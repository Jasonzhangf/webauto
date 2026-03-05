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
      retry: { attempts: 1, backoffMs: 0 },
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
    recovery,
  } = options;

  return [
    {
      id: 'wait_search_permit',
      enabled: !detailLinksStartup,
      action: 'xhs_wait_search_permit',
      params: {
        key: profileId,
        keyword,
      },
      trigger: 'home_search_input.exist',
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
      id: 'fill_keyword',
      enabled: !detailLinksStartup,
      action: 'type',
      params: { selector: '#search-input', text: keyword },
      trigger: 'home_search_input.exist',
      dependsOn: ['wait_search_permit'],
      once: true,
      validation: {
        mode: 'both',
        pre: { page: { hostIncludes: ['xiaohongshu.com'], checkpointIn: ['home_ready', 'search_ready'] } },
        post: { container: { selector: '#search-input', mustExist: true, minCount: 1 } },
      },
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
        actionDelayMinMs: submitActionDelayMinMs,
        actionDelayMaxMs: submitActionDelayMaxMs,
        settleMinMs: submitSettleMinMs,
        settleMaxMs: submitSettleMaxMs,
      },
      trigger: 'home_search_input.exist',
      dependsOn: ['fill_keyword'],
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
        settleMs: 320,
        pageUrlIncludes: ['/search_result'],
        requireMatchedPages: true,
        selectors: [
          { id: 'home_search_input', selector: '#search-input, input.search-input' },
          { id: 'search_result_item', selector: '.note-item', visible: false, minCount: 1 },
        ],
      },
      trigger: 'search_result_item.exist',
      dependsOn: ['ensure_tab_pool'],
      once: true,
      timeoutMs: 90000,
    },
  ];
}

export function buildXhsTabPoolOperation(options) {
  const { tabCount, tabOpenDelayMs, detailLinksStartup } = options;
  return [
    {
      id: 'ensure_tab_pool',
      action: 'ensure_tab_pool',
      params: {
        tabCount,
        openDelayMs: tabOpenDelayMs,
        normalizeTabs: false,
        seedOnOpen: !detailLinksStartup,
        shortcutOnly: false,
      },
      trigger: detailLinksStartup ? 'startup' : 'search_result_item.exist',
      dependsOn: [detailLinksStartup ? 'goto_home' : 'submit_search'],
      once: true,
      timeoutMs: 180000,
      retry: { attempts: 2, backoffMs: 500 },
      impact: 'script',
      onFailure: 'stop_all',
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

export function buildXhsGuardOperations() {
  return [
    {
      id: 'abort_on_login_guard',
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

export { buildXhsDetailOperations };
