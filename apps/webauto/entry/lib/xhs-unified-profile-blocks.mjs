import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { buildXhsUnifiedAutoscript } from '../../../../modules/camo-runtime/src/autoscript/xhs-unified-template.mjs';
import { normalizeAutoscript, validateAutoscript } from '../../../../modules/camo-runtime/src/autoscript/schema.mjs';
import { AutoscriptRunner } from '../../../../modules/camo-runtime/src/autoscript/runtime.mjs';
import { markProfileInvalid } from './account-store.mjs';
import { runCamo } from './camo-cli.mjs';
import { ensureSessionInitialized } from './session-init.mjs';
import { publishBusEvent } from './bus-publish.mjs';
import { resolvePlatformFlowGate } from './flow-gate.mjs';
import { resolveXhsStage } from './xhs-unified-stages.mjs';
import {
  nowIso,
  parseBool,
  parseIntFlag,
  parseNonNegativeInt,
  pickRandomInt,
  sanitizeForPath,
} from './xhs-unified-blocks.mjs';
import {
  createTaskReporter,
  createProfileStats,
  resolveUnifiedPhaseLabel,
  resolveUnifiedActionLabel,
  updateProfileStatsFromEvent,
} from './xhs-unified-runtime-blocks.mjs';

const XHS_HOME_URL = 'https://www.xiaohongshu.com';

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildStopScreenshotPath(profileId, reason, outputDir) {
  const safeProfile = sanitizeForPath(profileId, 'profile');
  const safeReason = sanitizeForPath(reason || 'stop', 'stop');
  const file = `stop-${safeProfile}-${safeReason}.png`;
  return path.join(outputDir, file);
}

async function captureStopScreenshot({ profileId, reason, outputDir }) {
  const outDir = String(outputDir || '').trim();
  if (!outDir) return null;
  try {
    await fsp.mkdir(outDir, { recursive: true });
  } catch {}
  const outputPath = buildStopScreenshotPath(profileId, reason, outDir);
  const tryCapture = () => runCamo(['screenshot', profileId, '--output', outputPath], {
    rootDir: process.cwd(),
    timeoutMs: 60000,
  });
  let ret = tryCapture();
  if (!ret?.ok) {
    await ensureProfileSession(profileId);
    ret = tryCapture();
  }
  if (ret?.ok) return outputPath;
  return null;
}

export async function ensureProfileSession(profileId, options = {}) {
  const id = String(profileId || '').trim();
  if (!id) return false;
  const ret = await ensureSessionInitialized(id, {
    url: XHS_HOME_URL,
    rootDir: process.cwd(),
    timeoutMs: 60000,
    headless: options?.headless === true,
  });
  return Boolean(ret?.ok);
}

async function buildTemplateOptions(argv, profileId, overrides = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim();
  const env = String(argv.env || 'prod').trim() || 'prod';
  const inputMode = String(argv['input-mode'] || 'protocol').trim() || 'protocol';
  const headless = parseBool(argv.headless, false);
  const ocrCommand = String(argv['ocr-command'] || '').trim();
  const maxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const maxComments = parseNonNegativeInt(argv['max-comments'], 0);
  let flowGate = null;
  try {
    flowGate = await resolvePlatformFlowGate('xiaohongshu');
  } catch {
    flowGate = null;
  }

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

export async function runProfile(spec, argv, baseOverrides = {}) {
  const profileId = spec.profileId;
  const busEnabled = parseBool(argv['bus-events'], false) || process.env.WEBAUTO_BUS_EVENTS === '1';
  const busPublishable = new Set([
    'xhs.unified.start',
    'xhs.unified.stop',
    'xhs.unified.stop_screenshot',
    'xhs.unified.profile_failed',
    'autoscript:operation_done',
    'autoscript:operation_progress',
    'autoscript:operation_error',
    'autoscript:operation_terminal',
    'autoscript:operation_recovery_failed',
  ]);
  let currentRunId = null;
  const overrides = {
    ...baseOverrides,
    maxNotes: spec.assignedNotes,
    outputRoot: spec.outputRoot,
  };
  if (spec.sharedHarvestPath) overrides.sharedHarvestPath = spec.sharedHarvestPath;
  if (spec.searchSerialKey) overrides.searchSerialKey = spec.searchSerialKey;
  if (spec.seedCollectCount !== undefined && spec.seedCollectCount !== null) {
    overrides.seedCollectCount = parseNonNegativeInt(spec.seedCollectCount, 0);
  }
  if (spec.seedCollectMaxRounds !== undefined && spec.seedCollectMaxRounds !== null) {
    overrides.seedCollectMaxRounds = parseNonNegativeInt(spec.seedCollectMaxRounds, 0);
  }
  const options = await buildTemplateOptions(argv, profileId, overrides);
  console.log(JSON.stringify({
    event: 'xhs.unified.flow_gate',
    profileId,
    throttle: options.throttle,
    noteIntervalMs: options.noteIntervalMs,
    tabCount: options.tabCount,
    tabOpenDelayMs: options.tabOpenDelayMs,
    submitMethod: options.submitMethod,
    submitActionDelayMinMs: options.submitActionDelayMinMs,
    submitActionDelayMaxMs: options.submitActionDelayMaxMs,
    submitSettleMinMs: options.submitSettleMinMs,
    submitSettleMaxMs: options.submitSettleMaxMs,
    commentsScrollStepMin: options.commentsScrollStepMin,
    commentsScrollStepMax: options.commentsScrollStepMax,
    commentsSettleMinMs: options.commentsSettleMinMs,
    commentsSettleMaxMs: options.commentsSettleMaxMs,
  }));
  const script = buildXhsUnifiedAutoscript(options);
  const normalized = normalizeAutoscript(script, `xhs-unified:${profileId}`);
  const validation = validateAutoscript(normalized);
  if (!validation.ok) throw new Error(`autoscript validation failed for ${profileId}: ${validation.errors.join('; ')}`);

  await ensureDir(path.dirname(spec.logPath));
  const stats = createProfileStats(spec);
  const reporter = createTaskReporter({
    profileId,
    keyword: options.keyword,
    uiTriggerId: options.uiTriggerId,
  });
  let activeRunId = '';
  let runtimePhaseLabel = '登录校验';
  let runtimeActionLabel = '启动 autoscript';
  let lastSnapshotTs = 0;
  const pushTaskSnapshot = (status = 'running') => {
    if (!activeRunId) return;
    const nowTs = Date.now();
    if (status === 'running' && (nowTs - lastSnapshotTs) < 900) return;
    lastSnapshotTs = nowTs;
    void reporter.update(activeRunId, {
      status,
      phase: runtimePhaseLabel,
      action: runtimeActionLabel,
      progress: {
        total: Math.max(0, Number(spec.assignedNotes) || 0),
        processed: Math.max(0, Number(stats.openedNotes) || 0),
        failed: Math.max(0, Number(stats.operationErrors) || 0),
      },
      stats: {
        notesProcessed: Math.max(0, Number(stats.openedNotes) || 0),
        commentsCollected: Math.max(0, Number(stats.commentsCollected) || 0),
        likesPerformed: Math.max(0, Number(stats.likesNewCount) || 0),
        repliesGenerated: 0,
        imagesDownloaded: 0,
        ocrProcessed: 0,
      },
    });
  };

  const logEvent = (payload) => {
    const eventPayload = isObject(payload) ? payload : { event: 'autoscript:raw', payload };
    const merged = {
      ts: eventPayload.ts || nowIso(),
      profileId,
      ...eventPayload,
    };
    if (!merged.runId && currentRunId) merged.runId = currentRunId;
    fs.appendFileSync(spec.logPath, `${JSON.stringify(merged)}\n`, 'utf8');
    console.log(JSON.stringify(merged));
    updateProfileStatsFromEvent(stats, merged);
    if (busEnabled && busPublishable.has(String(merged.event || '').trim())) {
      void publishBusEvent(merged);
    }
    const eventName = String(merged.event || '').trim();
    const mergedRunId = String(merged.runId || '').trim();
    if (mergedRunId) activeRunId = mergedRunId;
    if (
      eventName === 'autoscript:operation_start'
      || eventName === 'autoscript:operation_progress'
      || eventName === 'autoscript:operation_done'
      || eventName === 'autoscript:operation_error'
      || eventName === 'autoscript:operation_recovery_failed'
    ) {
      runtimePhaseLabel = resolveUnifiedPhaseLabel(merged.operationId, runtimePhaseLabel);
      runtimeActionLabel = resolveUnifiedActionLabel(eventName, merged, runtimeActionLabel);
    }
    if (eventName === 'xhs.unified.start') {
      runtimePhaseLabel = '登录校验';
      runtimeActionLabel = '启动 autoscript';
    }
    if (eventName === 'xhs.unified.stop') {
      const reason = String(merged.reason || '').trim();
      runtimePhaseLabel = reason === 'script_failure' ? '失败' : '已结束';
      runtimeActionLabel = reason || 'stop';
    }
    const shouldReportEvent = (
      eventName === 'xhs.unified.start'
      || eventName === 'xhs.unified.stop'
      || eventName === 'autoscript:start'
      || eventName === 'autoscript:stop'
      || eventName === 'autoscript:impact'
      || eventName === 'autoscript:operation_start'
      || eventName === 'autoscript:operation_progress'
      || eventName === 'autoscript:operation_done'
      || eventName === 'autoscript:operation_error'
      || eventName === 'autoscript:operation_recovery_failed'
    );
    if (activeRunId && shouldReportEvent) {
      void reporter.pushEvent(activeRunId, eventName, merged);
    }
    if (
      eventName === 'autoscript:operation_start'
      || eventName === 'autoscript:operation_progress'
      || eventName === 'xhs.unified.start'
      || eventName === 'xhs.unified.stop'
      || eventName === 'autoscript:stop'
      || eventName === 'autoscript:start'
      || eventName === 'autoscript:operation_terminal'
      || eventName === 'autoscript:operation_done'
      || eventName === 'autoscript:operation_error'
      || eventName === 'autoscript:operation_recovery_failed'
      || eventName === 'autoscript:impact'
    ) {
      pushTaskSnapshot(eventName === 'xhs.unified.stop' ? (runtimePhaseLabel === '失败' ? 'failed' : 'completed') : 'running');
    }
    if (
      eventName === 'autoscript:operation_done'
      || eventName === 'autoscript:operation_error'
      || eventName === 'autoscript:operation_recovery_failed'
      || eventName === 'autoscript:impact'
    ) {
      pushTaskSnapshot('running');
    }
    if (
      merged.event === 'autoscript:operation_error'
      && String(merged.operationId || '').trim() === 'abort_on_login_guard'
      && String(merged.message || '').includes('LOGIN_GUARD_DETECTED')
    ) {
      try {
        markProfileInvalid(profileId, 'login_guard_runtime');
      } catch {}
    }
  };

  const runner = new AutoscriptRunner(normalized, {
    profileId,
    log: logEvent,
  });

  const running = await runner.start();
  currentRunId = running?.runId || currentRunId;
  activeRunId = String(running?.runId || '').trim();
  if (activeRunId) {
    await reporter.ensureCreated(activeRunId, {
      status: 'starting',
      phase: runtimePhaseLabel,
      action: runtimeActionLabel,
      progress: {
        total: Math.max(0, Number(spec.assignedNotes) || 0),
        processed: 0,
        failed: 0,
      },
    });
    await reporter.update(activeRunId, {
      status: 'running',
      phase: runtimePhaseLabel,
      action: runtimeActionLabel,
      progress: {
        total: Math.max(0, Number(spec.assignedNotes) || 0),
        processed: 0,
        failed: 0,
      },
      stats: {
        notesProcessed: 0,
        commentsCollected: 0,
        likesPerformed: 0,
        repliesGenerated: 0,
        imagesDownloaded: 0,
        ocrProcessed: 0,
      },
    });
  }
  logEvent({
    event: 'xhs.unified.start',
    runId: running?.runId || null,
    keyword: options.keyword,
    env: options.env,
    maxNotes: options.maxNotes,
    assignedNotes: spec.assignedNotes,
    outputRoot: options.outputRoot,
    parallelRunLabel: spec.runLabel,
  });
  const done = await running.done;

  const stopPayload = {
    event: 'xhs.unified.stop',
    profileId,
    runId: done?.runId || running.runId,
    reason: done?.reason || null,
    startedAt: done?.startedAt || null,
    stoppedAt: done?.stoppedAt || null,
  };
  logEvent(stopPayload);

  const stopScreenshotPath = await captureStopScreenshot({
    profileId,
    reason: stopPayload.reason || 'stop',
    outputDir: path.dirname(spec.logPath),
  });
  if (stopScreenshotPath) {
    logEvent({
      event: 'xhs.unified.stop_screenshot',
      profileId,
      runId: stopPayload.runId,
      reason: stopPayload.reason || null,
      path: stopScreenshotPath,
    });
  }

  stats.stopReason = stopPayload.reason;
  const finalRunId = String(stopPayload.runId || activeRunId || '').trim();
  if (finalRunId) {
    activeRunId = finalRunId;
    const failed = stopPayload.reason === 'script_failure';
    await reporter.update(finalRunId, {
      status: failed ? 'failed' : 'completed',
      phase: failed ? '失败' : '已结束',
      action: String(stopPayload.reason || (failed ? 'script_failure' : 'completed')),
      progress: {
        total: Math.max(0, Number(spec.assignedNotes) || 0),
        processed: Math.max(0, Number(stats.openedNotes) || 0),
        failed: Math.max(0, Number(stats.operationErrors) || 0),
      },
      stats: {
        notesProcessed: Math.max(0, Number(stats.openedNotes) || 0),
        commentsCollected: Math.max(0, Number(stats.commentsCollected) || 0),
        likesPerformed: Math.max(0, Number(stats.likesNewCount) || 0),
        repliesGenerated: 0,
        imagesDownloaded: 0,
        ocrProcessed: 0,
      },
    });
    if (failed) {
      await reporter.setError(finalRunId, `autoscript stopped: ${stopPayload.reason || 'script_failure'}`, 'SCRIPT_FAILURE', false);
    }
  }

  const profileResult = {
    ok: stopPayload.reason !== 'script_failure',
    profileId,
    runId: stopPayload.runId,
    reason: stopPayload.reason,
    assignedNotes: spec.assignedNotes,
    outputRoot: options.outputRoot,
    logPath: spec.logPath,
    stopScreenshotPath: stopScreenshotPath || null,
    stats,
  };

  await writeJson(spec.summaryPath, profileResult);
  return profileResult;
}
