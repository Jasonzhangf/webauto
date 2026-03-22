import path from 'node:path';

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

function sanitizePathSegment(value, fallback) {
  const text = toTrimmedString(value, fallback);
  const cleaned = text.replace(/[\\/:"*?<>|]+/g, '_').trim();
  return cleaned || fallback;
}

function resolveSharedHarvestPath({ sharedHarvestPath, outputRoot, env, keyword }) {
  const explicit = toTrimmedString(sharedHarvestPath, '');
  if (explicit) return path.resolve(explicit);
  const root = toTrimmedString(outputRoot, '');
  if (!root) return '';
  const safeEnv = sanitizePathSegment(env, 'debug');
  const safeKeyword = sanitizePathSegment(keyword, 'unknown');
  return path.join(path.resolve(root), 'xiaohongshu', safeEnv, safeKeyword, 'safe-detail-urls.jsonl');
}

function pickCloseDependency(options) {
  if (options.doReply) return 'comment_reply';
  if (options.matchGateEnabled) return 'comment_match_gate';
  if (options.commentsHarvestEnabled) return 'comments_harvest';
  if (options.detailHarvestEnabled) return 'detail_harvest';
  return 'open_first_detail';
}

export function resolveXhsUnifiedOptions(rawOptions = {}) {
  const profileId = toTrimmedString(rawOptions.profileId, 'xiaohongshu-batch-1');
  const keyword = toTrimmedString(rawOptions.keyword, '手机膜');
  const env = toTrimmedString(rawOptions.env, 'prod');
  const strictFailure = env === 'debug';
  const recoveryEnabled = strictFailure ? false : toBoolean(rawOptions.recoveryEnabled, true);
  const outputRoot = toTrimmedString(rawOptions.outputRoot, '');
  const throttle = toPositiveInt(rawOptions.throttle, 900, 100);
  const tabCountProvided = rawOptions.tabCount !== undefined
    && rawOptions.tabCount !== null
    && rawOptions.tabCount !== '';
  let tabCount = toPositiveInt(rawOptions.tabCount, 1, 1);
  const tabOpenDelayMs = toNonNegativeInt(rawOptions.tabOpenDelayMs, 1400);
  const tabOpenMinDelayMs = toNonNegativeInt(rawOptions.tabOpenMinDelayMs, 10000);
  const noteIntervalMs = toPositiveInt(rawOptions.noteIntervalMs, 1200, 200);
  const noteIntervalMinMs = toPositiveInt(rawOptions.noteIntervalMinMs, 2000, 1000);
  const noteIntervalMaxMs = toPositiveInt(rawOptions.noteIntervalMaxMs, 5000, noteIntervalMinMs);
  const submitMethod = toTrimmedString(rawOptions.submitMethod, 'enter').toLowerCase();
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
  const commentsScrollStepMin = toPositiveInt(rawOptions.commentsScrollStepMin, 960, 120);
  const commentsScrollStepMax = toPositiveInt(rawOptions.commentsScrollStepMax, 1280, commentsScrollStepMin);
  const commentsSettleMinMs = toPositiveInt(rawOptions.commentsSettleMinMs, 280, 80);
  const commentsSettleMaxMs = toPositiveInt(rawOptions.commentsSettleMaxMs, 820, commentsSettleMinMs);
  const defaultOperationMinIntervalMs = toNonNegativeInt(rawOptions.defaultOperationMinIntervalMs, 1200);
  const defaultEventCooldownMs = toNonNegativeInt(rawOptions.defaultEventCooldownMs, 700);
  const defaultPacingJitterMs = toNonNegativeInt(rawOptions.defaultPacingJitterMs, 1500);
  const navigationMinIntervalMs = toNonNegativeInt(rawOptions.navigationMinIntervalMs, 3500);
  const maxNotes = toPositiveInt(rawOptions.maxNotes, 30, 1);
  const maxComments = toNonNegativeInt(rawOptions.maxComments, 0);
  const resume = toBoolean(rawOptions.resume, false);
  const incrementalMax = toBoolean(rawOptions.incrementalMax, true);
  const maxLikesPerRound = toNonNegativeInt(rawOptions.maxLikesPerRound ?? rawOptions.maxLikes, 5);
  const matchMode = toTrimmedString(rawOptions.matchMode, 'any');
  const matchMinHits = toPositiveInt(rawOptions.matchMinHits, 1, 1);
  const replyText = toTrimmedString(rawOptions.replyText, '感谢分享，已关注');
  const sharedHarvestPath = resolveSharedHarvestPath({
    sharedHarvestPath: rawOptions.sharedHarvestPath,
    outputRoot,
    env,
    keyword,
  });
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
  const skipAccountSync = toBoolean(rawOptions.skipAccountSync, env === 'debug');

  const matchKeywords = splitCsv(rawOptions.matchKeywords || '');
  const likeKeywords = splitCsv(rawOptions.likeKeywords || '');

  const detailLoopEnabled = stageDetailEnabled || stageContentEnabled || stageLikeEnabled || stageReplyEnabled;
  const stageLinksEnabled = stageLinksRequested || detailLoopEnabled;
  const collectOpenLinksOnly = stageLinksEnabled;
  const detailOpenByLinks = toBoolean(rawOptions.detailOpenByLinks, stageLinksEnabled && detailLoopEnabled);
  const autoCloseDetail = toBoolean(
    rawOptions.autoCloseDetail,
    detailOpenByLinks || !(stage === 'detail' && maxNotes <= 1),
  );
  const openByLinksMaxAttempts = toPositiveInt(rawOptions.openByLinksMaxAttempts, 3, 1);
  const detailLinksStartup = detailOpenByLinks && stage === 'detail';
  const autoResumeDetailLinksStartup = (stage === 'full' || stage === 'detail') && toBoolean(rawOptions.resume, false);
  const effectiveDetailLinksStartup = autoResumeDetailLinksStartup || detailLinksStartup;
  if (!tabCountProvided && detailLoopEnabled) tabCount = 3;
  const detailRotateComments = toNonNegativeInt(
    rawOptions.detailRotateComments,
    detailLoopEnabled && tabCount > 1 && maxComments <= 0 ? 50 : 0,
  );
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

  const collectIndexStart = toNonNegativeInt(rawOptions.collectIndexStart ?? rawOptions.collectIndex, 0);
  const collectIndexMaxAttempts = toPositiveInt(rawOptions.collectIndexMaxAttempts, 3, 1);
  const collectIndexFailurePolicy = toTrimmedString(rawOptions.collectIndexFailurePolicy, 'retry').toLowerCase();

  const closeDependsOn = pickCloseDependency({
    doReply: stageReplyEnabled,
    doLikes: stageLikeEnabled,
    matchGateEnabled,
    commentsHarvestEnabled,
    detailHarvestEnabled,
  });

  const recovery = recoveryEnabled
    ? { attempts: 1, actions: ['requery_container'] }
    : { attempts: 0, actions: [] };

  return {
    profileId,
    keyword,
    env,
    outputRoot,
    throttle,
    tabCount,
    tabCountProvided,
    tabOpenDelayMs,
    tabOpenMinDelayMs,
    noteIntervalMs,
    noteIntervalMinMs,
    noteIntervalMaxMs,
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
    detailRotateComments,
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
    autoCloseDetail,
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
    detailOpenByLinks,
    openByLinksMaxAttempts,
    detailLinksStartup: effectiveDetailLinksStartup,
    detailLoopEnabled,
    detailHarvestEnabled,
    commentsHarvestEnabled,
    matchGateEnabled,
    collectPerNoteBudgetMs,
    collectLinksTimeoutMinMs,
    collectLinksTimeoutMs,
    collectStallTimeoutMs,
    closeDependsOn,
    recovery,
    strictFailure,
    skipAccountSync,
  };
}
