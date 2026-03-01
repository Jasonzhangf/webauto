function toTrimmedString(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function toPositiveInt(value, fallback, min = 1) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

function toNonNegativeInt(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function splitCsv(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => toTrimmedString(item))
      .filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickCloseDependency(options) {
  if (options.doReply) return 'comment_reply';
  if (options.doLikes) return 'comment_like';
  if (options.matchGateEnabled) return 'comment_match_gate';
  if (options.commentsHarvestEnabled) return 'comments_harvest';
  if (options.detailHarvestEnabled) return 'detail_harvest';
  return 'open_first_detail';
}

export function buildXhsUnifiedAutoscript(rawOptions = {}) {
  const profileId = toTrimmedString(rawOptions.profileId, 'xiaohongshu-batch-1');
  const keyword = toTrimmedString(rawOptions.keyword, '手机膜');
  const env = toTrimmedString(rawOptions.env, 'prod');
  const outputRoot = toTrimmedString(rawOptions.outputRoot, '');
  const throttle = toPositiveInt(rawOptions.throttle, 900, 100);
  const tabCountProvided = rawOptions.tabCount !== undefined
    && rawOptions.tabCount !== null
    && rawOptions.tabCount !== '';
  let tabCount = toPositiveInt(rawOptions.tabCount, 1, 1);
  const tabOpenDelayMs = toNonNegativeInt(rawOptions.tabOpenDelayMs, 1400);
  const noteIntervalMs = toPositiveInt(rawOptions.noteIntervalMs, 1200, 200);
  const submitMethod = toTrimmedString(rawOptions.submitMethod, 'click').toLowerCase();
  const submitActionDelayMinMs = toPositiveInt(rawOptions.submitActionDelayMinMs, 180, 20);
  const submitActionDelayMaxMs = toPositiveInt(rawOptions.submitActionDelayMaxMs, 620, submitActionDelayMinMs);
  const submitSettleMinMs = toPositiveInt(rawOptions.submitSettleMinMs, 1200, 60);
  const submitSettleMaxMs = toPositiveInt(rawOptions.submitSettleMaxMs, 2600, submitSettleMinMs);
  const openDetailPreClickMinMs = toPositiveInt(rawOptions.openDetailPreClickMinMs, 700, 60);
  const openDetailPreClickMaxMs = toPositiveInt(rawOptions.openDetailPreClickMaxMs, 2200, openDetailPreClickMinMs);
  const openDetailPollDelayMinMs = toPositiveInt(rawOptions.openDetailPollDelayMinMs, 260, 80);
  const openDetailPollDelayMaxMs = toPositiveInt(rawOptions.openDetailPollDelayMaxMs, 700, openDetailPollDelayMinMs);
  const openDetailPostOpenMinMs = toPositiveInt(rawOptions.openDetailPostOpenMinMs, 5000, 120);
  const openDetailPostOpenMaxMs = toPositiveInt(rawOptions.openDetailPostOpenMaxMs, 10000, openDetailPostOpenMinMs);
  const commentsScrollStepMin = toPositiveInt(rawOptions.commentsScrollStepMin, 280, 120);
  const commentsScrollStepMax = toPositiveInt(rawOptions.commentsScrollStepMax, 420, commentsScrollStepMin);
  const commentsSettleMinMs = toPositiveInt(rawOptions.commentsSettleMinMs, 280, 80);
  const commentsSettleMaxMs = toPositiveInt(rawOptions.commentsSettleMaxMs, 820, commentsSettleMinMs);
  const defaultOperationMinIntervalMs = toNonNegativeInt(rawOptions.defaultOperationMinIntervalMs, 1200);
  const defaultEventCooldownMs = toNonNegativeInt(rawOptions.defaultEventCooldownMs, 700);
  const defaultPacingJitterMs = toNonNegativeInt(rawOptions.defaultPacingJitterMs, 900);
  const navigationMinIntervalMs = toNonNegativeInt(rawOptions.navigationMinIntervalMs, 2200);
  const maxNotes = toPositiveInt(rawOptions.maxNotes, 30, 1);
  const maxComments = toNonNegativeInt(rawOptions.maxComments, 0);
  const resume = toBoolean(rawOptions.resume, false);
  const incrementalMax = toBoolean(rawOptions.incrementalMax, true);
  const maxLikesPerRound = toNonNegativeInt(rawOptions.maxLikesPerRound ?? rawOptions.maxLikes, 0);
  const matchMode = toTrimmedString(rawOptions.matchMode, 'any');
  const matchMinHits = toPositiveInt(rawOptions.matchMinHits, 1, 1);
  const replyText = toTrimmedString(rawOptions.replyText, '感谢分享，已关注');
  const sharedHarvestPath = toTrimmedString(rawOptions.sharedHarvestPath, '');
  const searchSerialKey = toTrimmedString(rawOptions.searchSerialKey, `${env}:${keyword}`);
  const seedCollectCount = toNonNegativeInt(rawOptions.seedCollectCount, maxNotes);
  const seedCollectMaxRounds = toNonNegativeInt(
    rawOptions.seedCollectMaxRounds,
    Math.max(6, Math.ceil(maxNotes / 2)),
  );

  const doHomepage = toBoolean(rawOptions.doHomepage, true);
  const doImages = toBoolean(rawOptions.doImages, false);
  const doComments = toBoolean(rawOptions.doComments, true);
  const doLikes = toBoolean(rawOptions.doLikes, false);
  const doReply = toBoolean(rawOptions.doReply, false);
  const doOcr = toBoolean(rawOptions.doOcr, false);
  const persistComments = toBoolean(rawOptions.persistComments, true);
  const stage = toTrimmedString(rawOptions.stage, 'full').toLowerCase();
  const stageLinksRequested = toBoolean(rawOptions.stageLinksEnabled, true);
  const stageContentEnabled = toBoolean(rawOptions.stageContentEnabled, true);
  const stageLikeEnabled = toBoolean(rawOptions.stageLikeEnabled, doLikes);
  const stageReplyEnabled = toBoolean(rawOptions.stageReplyEnabled, doReply);
  const stageDetailEnabled = toBoolean(rawOptions.stageDetailEnabled, stage === 'detail');

  const matchKeywords = splitCsv(rawOptions.matchKeywords || keyword);
  const likeKeywordsSeed = splitCsv(rawOptions.likeKeywords || '');
  const likeKeywords = likeKeywordsSeed.length > 0 ? likeKeywordsSeed : matchKeywords;

  const detailLoopEnabled = stageDetailEnabled || stageContentEnabled || stageLikeEnabled || stageReplyEnabled;
  const stageLinksEnabled = stageLinksRequested || detailLoopEnabled;
  const collectOpenLinksOnly = stageLinksEnabled;
  const detailOpenByLinks = toBoolean(rawOptions.detailOpenByLinks, stageLinksEnabled && detailLoopEnabled);
  const openByLinksMaxAttempts = toPositiveInt(rawOptions.openByLinksMaxAttempts, 3, 1);
  const detailLinksStartup = detailOpenByLinks && stage === 'detail';
  if (!tabCountProvided && detailOpenByLinks) tabCount = 4;
  const detailHarvestEnabled = detailLoopEnabled && (doHomepage || doImages || doComments || doOcr);
  const commentsHarvestEnabled = detailLoopEnabled && (doComments || stageLikeEnabled || stageReplyEnabled);
  const matchGateEnabled = !stageDetailEnabled && (stageLikeEnabled || stageReplyEnabled);
  const collectPerNoteBudgetMs = toPositiveInt(rawOptions.collectPerNoteBudgetMs ?? rawOptions.collectPerNoteMs, 15000, 5000);
  const collectLinksTimeoutMinMs = toPositiveInt(rawOptions.collectLinksTimeoutMinMs, 600000, 60000);
  const collectLinksTimeoutMs = toPositiveInt(
    rawOptions.collectLinksTimeoutMs,
    Math.max(collectLinksTimeoutMinMs, maxNotes * collectPerNoteBudgetMs),
    60000,
  );
  const collectStallTimeoutMs = toPositiveInt(
    rawOptions.collectStallTimeoutMs,
    Math.max(180000, Math.min(300000, collectLinksTimeoutMs)),
    30000,
  );
  const closeDependsOn = pickCloseDependency({
    doReply: stageReplyEnabled,
    doLikes: stageLikeEnabled,
    matchGateEnabled,
    commentsHarvestEnabled,
    detailHarvestEnabled,
  });

  const recovery = {
    attempts: 0,
    actions: [],
  };

  return {
    version: 1,
    name: 'xhs-unified-harvest-autoscript',
    source: '/Users/fanzhang/Documents/github/webauto/scripts/xiaohongshu/phase-unified-harvest.mjs',
    profileId,
    throttle,
    defaults: {
      disableTimeout: true,
      retry: { attempts: 2, backoffMs: 500 },
      impact: 'subscription',
      onFailure: 'chain_stop',
      validationMode: 'none',
      recovery,
      pacing: {
        operationMinIntervalMs: defaultOperationMinIntervalMs,
        eventCooldownMs: defaultEventCooldownMs,
        jitterMs: defaultPacingJitterMs,
        navigationMinIntervalMs,
        timeoutMs: 0,
      },
      timeoutMs: 0,
    },
    metadata: {
      keyword,
      env,
      outputRoot,
      tabCount,
      detailOpenByLinks,
      openByLinksMaxAttempts,
      tabOpenDelayMs,
      noteIntervalMs,
      submitMethod,
      submitActionDelayMinMs,
      submitActionDelayMaxMs,
      submitSettleMinMs,
      submitSettleMaxMs,
      openDetailPreClickMinMs,
      openDetailPreClickMaxMs,
      openDetailPollDelayMinMs,
      openDetailPollDelayMaxMs,
      openDetailPostOpenMinMs,
      openDetailPostOpenMaxMs,
      commentsScrollStepMin,
      commentsScrollStepMax,
      commentsSettleMinMs,
      commentsSettleMaxMs,
      defaultOperationMinIntervalMs,
      defaultEventCooldownMs,
      defaultPacingJitterMs,
      navigationMinIntervalMs,
      maxNotes,
      maxComments,
      maxLikesPerRound,
      resume,
      incrementalMax,
      doHomepage,
      doImages,
      doComments,
      doLikes: stageLikeEnabled,
      doReply: stageReplyEnabled,
      doOcr,
      stage,
      stageLinksEnabled,
      stageContentEnabled,
      stageLikeEnabled,
      stageReplyEnabled,
      stageDetailEnabled,
      persistComments,
      matchMode,
      matchMinHits,
      matchKeywords,
      likeKeywords,
      replyText,
      sharedHarvestPath,
      searchSerialKey,
      seedCollectCount,
      seedCollectMaxRounds,
      collectOpenLinksOnly,
      collectPerNoteBudgetMs,
      collectLinksTimeoutMinMs,
      collectLinksTimeoutMs,
      collectStallTimeoutMs,
      notes: [
        'open_next_detail intentionally stops script by throwing AUTOSCRIPT_DONE_* when exhausted.',
        'dev mode uses deterministic no-recovery policy (checkpoint recovery disabled).',
        'resume=true keeps visited note history for断点续传; incrementalMax=true treats maxNotes as增量配额.',
        'when persistComments=true, xhs_comments_harvest emits full comments in operation result for downstream jsonl/file persistence.',
      ],
    },
    subscriptions: [
      { id: 'home_search_input', selector: '#search-input, input.search-input', events: ['appear', 'exist', 'disappear'] },
      { id: 'home_search_button', selector: '.input-button, .input-button .search-icon', events: ['exist'] },
      { id: 'search_result_item', selector: '.note-item', events: ['appear', 'exist', 'change'] },
      {
        id: 'detail_modal',
        selector: '.note-detail-mask, .note-detail-page, .note-detail-dialog',
        events: ['appear', 'exist', 'disappear'],
      },
      { id: 'detail_comment_item', selector: '.comment-item, [class*="comment-item"]', events: ['appear', 'exist', 'change'] },
      { id: 'detail_show_more', selector: '.note-detail-mask .show-more, .note-detail-mask .reply-expand, .note-detail-mask [class*="expand"], .note-detail-page .show-more, .note-detail-page .reply-expand, .note-detail-page [class*="expand"]', events: ['appear', 'exist'] },
      { id: 'detail_discover_button', selector: 'a[href*="/explore?channel_id=homefeed_recommend"]', events: ['appear', 'exist'] },
      { id: 'login_guard', selector: '.login-container, .login-dialog, #login-container', events: ['appear', 'exist'] },
      { id: 'risk_guard', selector: '.qrcode-box, .captcha-container, [class*="captcha"]', events: ['appear', 'exist'] },
    ],
    operations: [
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
      {
        id: 'fill_keyword',
        enabled: !detailLinksStartup,
        action: 'type',
        params: { selector: '#search-input', text: keyword },
        trigger: 'home_search_input.exist',
        dependsOn: ['goto_home'],
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
        validation: {
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
        id: 'collect_links',
        enabled: stageLinksEnabled,
        action: 'xhs_open_detail',
        params: {
          mode: 'collect',
          maxNotes,
          env,
          keyword,
          outputRoot,
          resume,
          incrementalMax,
          sharedHarvestPath,
          seedCollectCount,
          seedCollectMaxRounds,
          collectOpenLinksOnly,
          collectStallTimeoutMs,
        },
        trigger: detailLinksStartup ? 'startup' : 'search_result_item.exist',
        dependsOn: ['ensure_tab_pool'],
        once: true,
        timeoutMs: collectLinksTimeoutMs,
        retry: { attempts: 1, backoffMs: 0 },
        impact: 'script',
        onFailure: 'stop_all',
      },
      {
        id: 'open_first_detail',
        enabled: detailLoopEnabled,
        action: 'xhs_open_detail',
        params: {
          mode: 'first',
          stage,
          maxNotes,
          keyword,
          resume,
          incrementalMax,
          sharedHarvestPath,
          preservePreCollected: stageLinksEnabled,
          seedCollectCount,
          seedCollectMaxRounds,
          preClickDelayMinMs: openDetailPreClickMinMs,
          preClickDelayMaxMs: openDetailPreClickMaxMs,
          pollDelayMinMs: openDetailPollDelayMinMs,
          pollDelayMaxMs: openDetailPollDelayMaxMs,
          postOpenDelayMinMs: openDetailPostOpenMinMs,
          postOpenDelayMaxMs: openDetailPostOpenMaxMs,
          openByLinks: detailOpenByLinks,
          openByLinksMaxAttempts,
        },
        trigger: detailLinksStartup ? 'startup' : 'search_result_item.exist',
        dependsOn: [stageLinksEnabled ? 'collect_links' : 'submit_search'],
        once: true,
        timeoutMs: 90000,
        onFailure: 'stop_all',
        impact: 'script',
        validation: { mode: 'none' },
        checkpoint: {
          containerId: 'xiaohongshu_search.search_result_item',
          targetCheckpoint: 'detail_ready',
          recovery,
        },
      },
      {
        id: 'finish_after_collect_links',
        enabled: stageLinksEnabled && !detailLoopEnabled,
        action: 'raise_error',
        params: { code: 'AUTOSCRIPT_DONE_LINKS_COLLECTED' },
        trigger: 'search_result_item.exist',
        dependsOn: ['collect_links'],
        once: true,
        retry: { attempts: 1, backoffMs: 0 },
        impact: 'script',
        onFailure: 'stop_all',
      },
      {
        id: 'detail_harvest',
        enabled: detailHarvestEnabled,
        action: 'xhs_detail_harvest',
        params: {},
        trigger: 'detail_modal.exist',
        dependsOn: ['open_first_detail'],
        once: false,
        oncePerAppear: true,
        timeoutMs: 90000,
        retry: { attempts: 1, backoffMs: 0 },
        impact: 'op',
        onFailure: 'continue',
        pacing: { operationMinIntervalMs: 2000, eventCooldownMs: 1200, jitterMs: 260 },
        validation: { mode: 'none' },
        checkpoint: {
          containerId: 'xiaohongshu_detail.modal_shell',
          targetCheckpoint: 'detail_ready',
          recovery,
        },
      },
      {
        id: 'expand_replies',
        enabled: commentsHarvestEnabled,
        action: 'xhs_expand_replies',
        params: {},
        trigger: 'detail_show_more.exist',
        dependsOn: [detailHarvestEnabled ? 'detail_harvest' : 'open_first_detail'],
        conditions: [{ type: 'subscription_exist', subscriptionId: 'detail_modal' }],
        once: false,
        oncePerAppear: true,
        retry: { attempts: 1, backoffMs: 0 },
        onFailure: 'continue',
        impact: 'op',
        pacing: { operationMinIntervalMs: 2500, eventCooldownMs: 1500, jitterMs: 220 },
      },
      {
        id: 'comments_harvest',
        enabled: commentsHarvestEnabled,
        action: 'xhs_comments_harvest',
        params: {
          env,
          keyword,
          outputRoot,
          persistComments,
          commentsLimit: maxComments,
          maxRounds: 48,
          scrollStep: commentsScrollStepMin,
          scrollStepMin: commentsScrollStepMin,
          scrollStepMax: commentsScrollStepMax,
          settleMs: commentsSettleMinMs,
          settleMinMs: commentsSettleMinMs,
          settleMaxMs: commentsSettleMaxMs,
          stallRounds: 8,
          recoveryNoProgressRounds: 3,
          recoveryStuckRounds: 2,
          recoveryUpRounds: 2,
          recoveryDownRounds: 3,
          maxRecoveries: 3,
          adaptiveMaxRounds: true,
          adaptiveExpectedPerRound: 6,
          adaptiveBufferRounds: 22,
          adaptiveMinBoostRounds: 36,
          adaptiveMaxRoundsCap: 320,
          requireBottom: maxComments <= 0,
          includeComments: persistComments,
        },
        trigger: 'detail_modal.exist',
        dependsOn: [detailHarvestEnabled ? 'detail_harvest' : 'open_first_detail'],
        once: false,
        oncePerAppear: true,
        timeoutMs: 180000,
        retry: { attempts: 1, backoffMs: 0 },
        impact: 'script',
        onFailure: 'continue',
        pacing: { operationMinIntervalMs: 2400, eventCooldownMs: 1500, jitterMs: 280 },
        validation: {
          mode: 'both',
          pre: {
            page: { hostIncludes: ['xiaohongshu.com'], checkpointIn: ['detail_ready', 'comments_ready'] },
            container: { selector: '.note-detail-mask, .note-detail-page, .note-detail-dialog', mustExist: true, minCount: 1 },
          },
          post: {
            page: { hostIncludes: ['xiaohongshu.com'], checkpointIn: ['detail_ready', 'comments_ready'] },
            container: { selector: '.comment-item, [class*="comment-item"]', mustExist: false, minCount: 0 },
          },
        },
        checkpoint: {
          containerId: 'xiaohongshu_detail.comment_section.comment_item',
          targetCheckpoint: 'comments_ready',
          recovery,
        },
      },
      {
        id: 'comment_match_gate',
        enabled: matchGateEnabled,
        action: 'xhs_comment_match',
        params: { keywords: matchKeywords, mode: matchMode, minHits: matchMinHits },
        trigger: 'detail_modal.exist',
        dependsOn: ['comments_harvest'],
        once: false,
        oncePerAppear: true,
        pacing: { operationMinIntervalMs: 2400, eventCooldownMs: 1200, jitterMs: 160 },
      },
      {
        id: 'comment_like',
        enabled: stageLikeEnabled,
        action: 'xhs_comment_like',
        params: {
          env,
          keyword,
          outputRoot,
          persistLikeState: true,
          saveEvidence: true,
          keywords: likeKeywords,
          maxLikes: maxLikesPerRound,
          pickOneIfNoNew: false,
        },
        trigger: 'detail_modal.exist',
        dependsOn: ['comment_match_gate'],
        once: false,
        oncePerAppear: true,
        timeoutMs: 90000,
        retry: { attempts: 1, backoffMs: 0 },
        onFailure: 'continue',
        impact: 'op',
        pacing: { operationMinIntervalMs: 2600, eventCooldownMs: 1500, jitterMs: 300 },
      },
      {
        id: 'comment_reply',
        enabled: stageReplyEnabled,
        action: 'xhs_comment_reply',
        params: { replyText },
        trigger: 'detail_modal.exist',
        dependsOn: [stageLikeEnabled ? 'comment_like' : 'comment_match_gate'],
        once: false,
        oncePerAppear: true,
        timeoutMs: 90000,
        retry: { attempts: 1, backoffMs: 0 },
        onFailure: 'continue',
        impact: 'op',
        pacing: { operationMinIntervalMs: 2600, eventCooldownMs: 1500, jitterMs: 300 },
      },
      {
        id: 'close_detail',
        enabled: detailLoopEnabled,
        action: 'xhs_close_detail',
        params: {},
        trigger: 'detail_modal.exist',
        dependsOn: [closeDependsOn],
        once: false,
        oncePerAppear: true,
        pacing: { operationMinIntervalMs: 2500, eventCooldownMs: 1300, jitterMs: 180 },
        validation: { mode: 'none' },
        checkpoint: {
          containerId: 'xiaohongshu_detail.discover_button',
          targetCheckpoint: 'search_ready',
          recovery,
        },
      },
      {
        id: 'wait_between_notes',
        enabled: detailLoopEnabled,
        action: 'wait',
        params: { ms: noteIntervalMs },
        trigger: detailOpenByLinks ? 'detail_modal.exist' : 'search_result_item.exist',
        dependsOn: ['close_detail'],
        once: false,
        oncePerAppear: false,
        retry: { attempts: 1, backoffMs: 0 },
        impact: 'op',
        onFailure: 'continue',
        pacing: { operationMinIntervalMs: noteIntervalMs, eventCooldownMs: Math.max(400, Math.floor(noteIntervalMs / 2)), jitterMs: 160 },
      },
      {
        id: 'switch_tab_round_robin',
        enabled: detailLoopEnabled,
        action: 'tab_pool_switch_next',
        params: { settleMs: 450 },
        trigger: detailOpenByLinks ? 'detail_modal.exist' : 'search_result_item.exist',
        dependsOn: ['wait_between_notes', 'ensure_tab_pool'],
        once: false,
        oncePerAppear: false,
        timeoutMs: 180000,
        retry: { attempts: 2, backoffMs: 500 },
        impact: 'op',
        onFailure: 'continue',
      },
      {
        id: 'open_next_detail',
        enabled: detailLoopEnabled,
        action: 'xhs_open_detail',
        params: {
          mode: 'next',
          stage,
          maxNotes,
          resume,
          incrementalMax,
          sharedHarvestPath,
          preClickDelayMinMs: openDetailPreClickMinMs,
          preClickDelayMaxMs: openDetailPreClickMaxMs,
          pollDelayMinMs: openDetailPollDelayMinMs,
          pollDelayMaxMs: openDetailPollDelayMaxMs,
          postOpenDelayMinMs: openDetailPostOpenMinMs,
          postOpenDelayMaxMs: openDetailPostOpenMaxMs,
          openByLinks: detailOpenByLinks,
          openByLinksMaxAttempts,
        },
        trigger: detailOpenByLinks ? 'detail_modal.exist' : 'search_result_item.exist',
        dependsOn: ['switch_tab_round_robin'],
        once: false,
        oncePerAppear: false,
        timeoutMs: 90000,
        retry: { attempts: 3, backoffMs: 1000 },
        impact: 'op',
        onFailure: 'continue',
        checkpoint: {
          containerId: 'xiaohongshu_search.search_result_item',
          targetCheckpoint: 'detail_ready',
          recovery: { attempts: 0, actions: [] },
        },
      },
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
      {
        id: 'ensure_tab_pool',
        action: 'ensure_tab_pool',
        params: {
          tabCount,
          openDelayMs: tabOpenDelayMs,
          normalizeTabs: false,
        },
        trigger: detailLinksStartup ? 'startup' : 'search_result_item.exist',
        dependsOn: [detailLinksStartup ? 'goto_home' : 'submit_search'],
        once: true,
        timeoutMs: 180000,
        retry: { attempts: 2, backoffMs: 500 },
        impact: 'script',
        onFailure: 'stop_all',
        validation: {
          mode: 'post',
          post: { page: { hostIncludes: ['xiaohongshu.com'], checkpointIn: ['search_ready', 'home_ready'] } },
        },
        checkpoint: {
          targetCheckpoint: 'search_ready',
          recovery: {
            attempts: 0,
            actions: [],
          },
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
        impact: 'op',
        onFailure: 'continue',
      },
    ],
  };
}
