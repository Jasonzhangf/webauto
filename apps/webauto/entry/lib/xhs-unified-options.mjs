import { resolvePlatformFlowGate } from './flow-gate.mjs';
import { resolveXhsStage } from './xhs-unified-stages.mjs';
import {
  parseBool,
  parseIntFlag,
  parseNonNegativeInt,
  pickRandomInt,
} from './xhs-unified-blocks.mjs';
import { buildXhsUnifiedAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-unified-template.mjs';
import { buildXhsCollectAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-collect-template.mjs';
import { buildXhsDetailAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-detail-template.mjs';

export async function buildUnifiedOptions(argv, profileId, overrides = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim();
  const env = String(argv.env || 'prod').trim() || 'prod';
  const inputMode = String(argv['input-mode'] || 'protocol').trim() || 'protocol';
  const headless = parseBool(argv.headless, false);
  const ocrCommand = String(argv['ocr-command'] || '').trim();
  const maxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const maxComments = parseNonNegativeInt(argv['max-comments'], 0);
  const flowGate = await resolvePlatformFlowGate('xiaohongshu');

  const throttleMin = parseIntFlag(flowGate?.throttle?.minMs, 900, 100);
  const throttleMax = parseIntFlag(flowGate?.throttle?.maxMs, 1800, throttleMin);
  const noteIntervalMin = parseIntFlag(flowGate?.noteInterval?.minMs, 2200, 200);
  const noteIntervalMax = parseIntFlag(flowGate?.noteInterval?.maxMs, 4200, noteIntervalMin);
  const tabCountDefault = parseIntFlag(flowGate?.tabPool?.tabCount, 1, 1);
  const tabCountFlag = argv['tab-count'];
  const tabCountProvided = tabCountFlag !== undefined && tabCountFlag !== null && tabCountFlag !== '';
  const tabOpenDelayMin = parseIntFlag(flowGate?.tabPool?.openDelayMinMs, 1400, 0);
  const tabOpenDelayMax = parseIntFlag(flowGate?.tabPool?.openDelayMaxMs, 2800, tabOpenDelayMin);
  const submitMethodDefault = String(flowGate?.submitSearch?.method || 'click').trim().toLowerCase() || 'click';
  const submitActionDelayMinDefault = parseIntFlag(flowGate?.submitSearch?.actionDelayMinMs, 180, 20);
  const submitActionDelayMaxDefault = parseIntFlag(flowGate?.submitSearch?.actionDelayMaxMs, 620, submitActionDelayMinDefault);
  const submitSettleMinDefault = parseIntFlag(flowGate?.submitSearch?.settleMinMs, 1200, 60);
  const submitSettleMaxDefault = parseIntFlag(flowGate?.submitSearch?.settleMaxMs, 2600, submitSettleMinDefault);
  const openDetailPreClickMinDefault = parseIntFlag(flowGate?.openDetail?.preClickMinMs, 700, 60);
  const openDetailPreClickMaxDefault = parseIntFlag(flowGate?.openDetail?.preClickMaxMs, 2200, openDetailPreClickMinDefault);
  const openDetailPollDelayMinDefault = parseIntFlag(flowGate?.openDetail?.pollDelayMinMs, 260, 80);
  const openDetailPollDelayMaxDefault = parseIntFlag(flowGate?.openDetail?.pollDelayMaxMs, 700, openDetailPollDelayMinDefault);
  const openDetailPostOpenMinDefault = parseIntFlag(flowGate?.openDetail?.postOpenMinMs, 5000, 120);
  const openDetailPostOpenMaxDefault = parseIntFlag(flowGate?.openDetail?.postOpenMaxMs, 10000, openDetailPostOpenMinDefault);
  const commentsScrollStepMinDefault = parseIntFlag(flowGate?.commentsHarvest?.scrollStepMin, 280, 120);
  const commentsScrollStepMaxDefault = parseIntFlag(flowGate?.commentsHarvest?.scrollStepMax, 420, commentsScrollStepMinDefault);
  const commentsSettleMinDefault = parseIntFlag(flowGate?.commentsHarvest?.settleMinMs, 280, 80);
  const commentsSettleMaxDefault = parseIntFlag(flowGate?.commentsHarvest?.settleMaxMs, 820, commentsSettleMinDefault);
  const defaultOperationMinIntervalDefault = parseIntFlag(flowGate?.pacing?.defaultOperationMinIntervalMs, 1200, 0);
  const defaultEventCooldownDefault = parseIntFlag(flowGate?.pacing?.defaultEventCooldownMs, 700, 0);
  const defaultPacingJitterDefault = parseIntFlag(flowGate?.pacing?.defaultJitterMs, 900, 0);
  const navigationMinIntervalDefault = parseIntFlag(flowGate?.pacing?.navigationMinIntervalMs, 2200, 0);

  const throttle = parseIntFlag(argv.throttle, pickRandomInt(throttleMin, throttleMax), 100);
  let tabCount = parseIntFlag(tabCountFlag, tabCountDefault, 1);
  const noteIntervalMs = parseIntFlag(argv['note-interval'], pickRandomInt(noteIntervalMin, noteIntervalMax), 200);
  const tabOpenDelayMs = parseIntFlag(argv['tab-open-delay'], pickRandomInt(tabOpenDelayMin, tabOpenDelayMax), 0);
  const submitMethod = String(argv['search-submit-method'] || submitMethodDefault).trim().toLowerCase() || 'click';
  const submitActionDelayMinMs = parseIntFlag(argv['submit-action-delay-min'], submitActionDelayMinDefault, 20);
  const submitActionDelayMaxMs = parseIntFlag(argv['submit-action-delay-max'], submitActionDelayMaxDefault, submitActionDelayMinMs);
  const submitSettleMinMs = parseIntFlag(argv['submit-settle-min'], submitSettleMinDefault, 60);
  const submitSettleMaxMs = parseIntFlag(argv['submit-settle-max'], submitSettleMaxDefault, submitSettleMinMs);
  const openDetailPreClickMinMs = parseIntFlag(argv['open-detail-preclick-min'], openDetailPreClickMinDefault, 60);
  const openDetailPreClickMaxMs = parseIntFlag(argv['open-detail-preclick-max'], openDetailPreClickMaxDefault, openDetailPreClickMinMs);
  const openDetailPollDelayMinMs = parseIntFlag(argv['open-detail-poll-min'], openDetailPollDelayMinDefault, 80);
  const openDetailPollDelayMaxMs = parseIntFlag(argv['open-detail-poll-max'], openDetailPollDelayMaxDefault, openDetailPollDelayMinMs);
  const openDetailPostOpenMinMs = parseIntFlag(argv['open-detail-postopen-min'], openDetailPostOpenMinDefault, 120);
  const openDetailPostOpenMaxMs = parseIntFlag(argv['open-detail-postopen-max'], openDetailPostOpenMaxDefault, openDetailPostOpenMinMs);
  const commentsScrollStepMin = parseIntFlag(argv['comments-scroll-step-min'], commentsScrollStepMinDefault, 120);
  const commentsScrollStepMax = parseIntFlag(argv['comments-scroll-step-max'], commentsScrollStepMaxDefault, commentsScrollStepMin);
  const commentsSettleMinMs = parseIntFlag(argv['comments-settle-min'], commentsSettleMinDefault, 80);
  const commentsSettleMaxMs = parseIntFlag(argv['comments-settle-max'], commentsSettleMaxDefault, commentsSettleMinMs);
  const defaultOperationMinIntervalMs = parseIntFlag(argv['operation-min-interval'], defaultOperationMinIntervalDefault, 0);
  const defaultEventCooldownMs = parseIntFlag(argv['event-cooldown'], defaultEventCooldownDefault, 0);
  const defaultPacingJitterMs = parseIntFlag(argv['pacing-jitter'], defaultPacingJitterDefault, 0);
  const navigationMinIntervalMs = parseIntFlag(argv['navigation-min-interval'], navigationMinIntervalDefault, 0);
  const maxLikesPerRound = parseNonNegativeInt(argv['max-likes'], 0);
  const matchMode = String(argv['match-mode'] || 'any').trim() || 'any';
  const matchMinHits = parseIntFlag(argv['match-min-hits'], 1, 1);
  const matchKeywords = String(argv['match-keywords'] || keyword).trim();
  const likeKeywords = String(argv['like-keywords'] || '').trim();
  const replyText = String(argv['reply-text'] || '感谢分享，已关注').trim() || '感谢分享，已关注';
  const outputRoot = String(argv['output-root'] || '').trim();
  const uiTriggerId = String(argv['ui-trigger-id'] || process.env.WEBAUTO_UI_TRIGGER_ID || '').trim();
  const resume = parseBool(argv.resume, false);
  const incrementalMax = parseBool(argv['incremental-max'], true);
  const sharedHarvestPath = String(overrides.sharedHarvestPath ?? argv['shared-harvest-path'] ?? '').trim();
  const searchSerialKey = String(overrides.searchSerialKey ?? argv['search-serial-key'] ?? '').trim();
  const seedCollectCount = parseNonNegativeInt(
    overrides.seedCollectCount ?? argv['seed-collect-count'],
    Math.max(1, maxNotes),
  );
  const seedCollectMaxRounds = parseNonNegativeInt(
    overrides.seedCollectMaxRounds ?? argv['seed-collect-rounds'],
    Math.max(6, Math.ceil(Math.max(1, maxNotes) / 2)),
  );
  const dryRun = parseBool(argv['dry-run'], false);
  const disableDryRun = parseBool(argv['no-dry-run'], false);
  const effectiveDryRun = disableDryRun ? false : dryRun;
  const stage = resolveXhsStage(argv, overrides);
  if (!tabCountProvided && (stage === 'detail' || stage === 'full')) {
    tabCount = 4;
  }
  const stageDetailEnabled = stage === 'detail';
  const stageLinksEnabled = true;
  const stageContentEnabled = stage === 'detail' || stage === 'full' || stage === 'content' || stage === 'like' || stage === 'reply';
  const likeRequested = parseBool(overrides.doLikes ?? argv['do-likes'], stage === 'like');
  const replyRequested = parseBool(overrides.doReply ?? argv['do-reply'], stage === 'reply');
  const stageLikeEnabled = (stage === 'like' || stage === 'full')
    && likeRequested
    && !effectiveDryRun;
  const stageReplyEnabled = (stage === 'reply' || stage === 'full')
    && replyRequested
    && !effectiveDryRun;
  const commentsRequested = parseBool(
    overrides.doComments ?? argv['do-comments'],
    stageContentEnabled || stageLikeEnabled || stageReplyEnabled,
  );
  const doComments = commentsRequested;
  const doHomepage = stageContentEnabled && parseBool(overrides.doHomepage ?? argv['do-homepage'], true);
  const doImages = stageContentEnabled && parseBool(overrides.doImages ?? argv['do-images'], false);
  const doOcr = stageContentEnabled && parseBool(overrides.doOcr ?? argv['do-ocr'], false);
  const persistComments = doComments && parseBool(overrides.persistComments ?? argv['persist-comments'], !effectiveDryRun);

  const base = {
    profileId,
    keyword,
    env,
    inputMode,
    headless,
    ocrCommand,
    uiTriggerId,
    outputRoot,
    throttle,
    tabCount,
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
    matchMode,
    matchMinHits,
    matchKeywords,
    likeKeywords,
    replyText,
    stage,
    stageLinksEnabled,
    stageContentEnabled,
    stageLikeEnabled,
    stageReplyEnabled,
    stageDetailEnabled,
    doComments,
    doLikes: stageLikeEnabled,
    doReply: stageReplyEnabled,
    doHomepage,
    doImages,
    doOcr,
    persistComments,
    sharedHarvestPath,
    searchSerialKey,
    seedCollectCount,
    seedCollectMaxRounds,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    stage,
    stageLinksEnabled,
    stageContentEnabled,
    stageLikeEnabled,
    stageReplyEnabled,
    stageDetailEnabled,
    doComments,
    doLikes: stageLikeEnabled,
    doReply: stageReplyEnabled,
    doHomepage,
    doImages,
    doOcr,
    persistComments,
  };
}

export function resolveAutoscriptBuilder(stage) {
  const normalized = String(stage || '').trim().toLowerCase();
  if (normalized === 'links') return buildXhsCollectAutoscript;
  if (normalized === 'detail') return buildXhsDetailAutoscript;
  return buildXhsUnifiedAutoscript;
}
