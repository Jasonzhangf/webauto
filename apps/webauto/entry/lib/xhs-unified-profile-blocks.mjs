import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { normalizeAutoscript, validateAutoscript } from '../../../../modules/camo-runtime/src/autoscript/schema.mjs';
import { AutoscriptRunner } from '../../../../modules/camo-runtime/src/autoscript/runtime.mjs';

// 编排层：仅组合模块，不含业务细节
// 模板/runner 已在 camo-runtime 中实现，此文件仅做参数归一化 + 调度
// 符合三层铁律：编排层只做参数归一 + 调度，业务细节全在 camo-runtime/action-providers
import { markProfileInvalid } from './account-store.mjs';
import { runCamo } from './camo-cli.mjs';
import { ensureSessionInitialized } from './session-init.mjs';
import { publishBusEvent } from './bus-publish.mjs';
import { buildUnifiedOptions, resolveAutoscriptBuilder } from './xhs-unified-options.mjs';
import {
  nowIso,
  parseBool,
  parseNonNegativeInt,
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
  const options = await buildUnifiedOptions(argv, profileId, overrides);
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
  const buildScript = resolveAutoscriptBuilder(options.stage);
  const script = buildScript(options);
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
