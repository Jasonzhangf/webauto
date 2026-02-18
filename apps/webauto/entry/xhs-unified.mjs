#!/usr/bin/env node
import minimist from 'minimist';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildXhsUnifiedAutoscript } from '../../../modules/camo-runtime/src/autoscript/xhs-unified-template.mjs';
import { normalizeAutoscript, validateAutoscript } from '../../../modules/camo-runtime/src/autoscript/schema.mjs';
import { AutoscriptRunner } from '../../../modules/camo-runtime/src/autoscript/runtime.mjs';
import { syncXhsAccountsByProfiles } from './lib/account-detect.mjs';
import { markProfileInvalid } from './lib/account-store.mjs';
import { listProfilesForPool } from './lib/profilepool.mjs';

function nowIso() {
  return new Date().toISOString();
}

function formatRunLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function parseIntFlag(value, fallback, min = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

function parseNonNegativeInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function parseProfiles(argv) {
  const profile = String(argv.profile || '').trim();
  const profilesRaw = String(argv.profiles || '').trim();
  const profilePool = String(argv.profilepool || '').trim();

  if (profilesRaw) {
    return Array.from(new Set(profilesRaw.split(',').map((item) => item.trim()).filter(Boolean)));
  }
  if (profilePool) {
    return Array.from(new Set(listProfilesForPool(profilePool).profiles));
  }
  if (profile) return [profile];
  return [];
}

function sanitizeForPath(name, fallback = 'unknown') {
  const text = String(name || '').trim();
  if (!text) return fallback;
  const cleaned = text.replace(/[\\/:"*?<>|]+/g, '_').trim();
  return cleaned || fallback;
}

function sanitizeKeywordDirParts({ env, keyword }) {
  return {
    safeEnv: sanitizeForPath(env, 'debug'),
    safeKeyword: sanitizeForPath(keyword, 'unknown'),
  };
}

function resolveDownloadRoot(customRoot = '') {
  const fromArg = String(customRoot || '').trim();
  if (fromArg) return path.resolve(fromArg);
  const fromEnv = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

const NON_NOTE_DIR_NAMES = new Set([
  'merged',
  'profiles',
  'like-evidence',
  'virtual-like',
  'smart-reply',
  'comment-match',
  'discover-fallback',
]);

async function collectKeywordDirs(baseOutputRoot, env, keyword) {
  const { safeEnv, safeKeyword } = sanitizeKeywordDirParts({ env, keyword });
  const dirs = [
    path.join(baseOutputRoot, 'xiaohongshu', safeEnv, safeKeyword),
  ];
  const shardsRoot = path.join(baseOutputRoot, 'shards');
  try {
    const entries = await fsp.readdir(shardsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      dirs.push(path.join(shardsRoot, entry.name, 'xiaohongshu', safeEnv, safeKeyword));
    }
  } catch {
    // ignore
  }
  return Array.from(new Set(dirs));
}

async function collectCompletedNoteIds(baseOutputRoot, env, keyword) {
  const keywordDirs = await collectKeywordDirs(baseOutputRoot, env, keyword);
  const completed = new Set();
  for (const keywordDir of keywordDirs) {
    let entries = [];
    try {
      entries = await fsp.readdir(keywordDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const noteId = String(entry.name || '').trim();
      if (!noteId || noteId.startsWith('.') || noteId.startsWith('_')) continue;
      if (NON_NOTE_DIR_NAMES.has(noteId)) continue;
      completed.add(noteId);
    }
  }
  return {
    count: completed.size,
    noteIds: Array.from(completed),
  };
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function appendJsonl(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fsp.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function buildTemplateOptions(argv, profileId, overrides = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim();
  const env = String(argv.env || 'debug').trim() || 'debug';
  const inputMode = String(argv['input-mode'] || 'protocol').trim() || 'protocol';
  const headless = parseBool(argv.headless, false);
  const ocrCommand = String(argv['ocr-command'] || '').trim();
  const maxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const throttle = parseIntFlag(argv.throttle, 500, 100);
  const tabCount = parseIntFlag(argv['tab-count'], 4, 1);
  const noteIntervalMs = parseIntFlag(argv['note-interval'], 900, 200);
  const maxLikesPerRound = parseIntFlag(argv['max-likes'], 2, 1);
  const matchMode = String(argv['match-mode'] || 'any').trim() || 'any';
  const matchMinHits = parseIntFlag(argv['match-min-hits'], 1, 1);
  const matchKeywords = String(argv['match-keywords'] || keyword).trim();
  const likeKeywords = String(argv['like-keywords'] || '').trim();
  const replyText = String(argv['reply-text'] || '感谢分享，已关注').trim() || '感谢分享，已关注';
  const outputRoot = String(argv['output-root'] || '').trim();
  const resume = parseBool(argv.resume, true);
  const incrementalMax = parseBool(argv['incremental-max'], true);
  const sharedHarvestPath = String(overrides.sharedHarvestPath ?? argv['shared-harvest-path'] ?? '').trim();
  const searchSerialKey = String(overrides.searchSerialKey ?? argv['search-serial-key'] ?? '').trim();
  const seedCollectCount = parseNonNegativeInt(
    overrides.seedCollectCount ?? argv['seed-collect-count'],
    0,
  );
  const seedCollectMaxRounds = parseNonNegativeInt(
    overrides.seedCollectMaxRounds ?? argv['seed-collect-rounds'],
    0,
  );

  const dryRun = parseBool(argv['dry-run'], false);
  const disableDryRun = parseBool(argv['no-dry-run'], false);
  const effectiveDryRun = disableDryRun ? false : dryRun;

  const base = {
    profileId,
    keyword,
    env,
    inputMode,
    headless,
    ocrCommand,
    outputRoot,
    throttle,
    tabCount,
    noteIntervalMs,
    maxNotes,
    maxLikesPerRound,
    resume,
    incrementalMax,
    matchMode,
    matchMinHits,
    matchKeywords,
    likeKeywords,
    replyText,
    doHomepage: parseBool(argv['do-homepage'], true),
    doImages: parseBool(argv['do-images'], false),
    doComments: parseBool(argv['do-comments'], true),
    doLikes: parseBool(argv['do-likes'], false) && !effectiveDryRun,
    doReply: parseBool(argv['do-reply'], false) && !effectiveDryRun,
    doOcr: parseBool(argv['do-ocr'], false),
    persistComments: parseBool(argv['persist-comments'], !effectiveDryRun),
    sharedHarvestPath,
    searchSerialKey,
    seedCollectCount,
    seedCollectMaxRounds,
  };
  return { ...base, ...overrides };
}

function buildEvenShardPlan({ profiles, totalNotes, defaultMaxNotes }) {
  const uniqueProfiles = Array.from(new Set(profiles.map((item) => String(item || '').trim()).filter(Boolean)));
  if (uniqueProfiles.length === 0) return [];

  if (!Number.isFinite(totalNotes) || totalNotes <= 0) {
    return uniqueProfiles.map((profileId) => ({ profileId, assignedNotes: defaultMaxNotes }));
  }

  const base = Math.floor(totalNotes / uniqueProfiles.length);
  const remainder = totalNotes % uniqueProfiles.length;
  const plan = uniqueProfiles.map((profileId, index) => ({
    profileId,
    assignedNotes: base + (index < remainder ? 1 : 0),
  }));
  return plan.filter((item) => item.assignedNotes > 0);
}

function buildDynamicWavePlan({ profiles, remainingNotes }) {
  const uniqueProfiles = Array.from(new Set(profiles.map((item) => String(item || '').trim()).filter(Boolean)));
  if (uniqueProfiles.length === 0) return [];
  const remaining = Math.max(0, Number(remainingNotes) || 0);
  if (remaining <= 0) return [];

  if (remaining < uniqueProfiles.length) {
    return uniqueProfiles.slice(0, remaining).map((profileId) => ({
      profileId,
      assignedNotes: 1,
    }));
  }

  const waveTotal = remaining - (remaining % uniqueProfiles.length);
  return buildEvenShardPlan({
    profiles: uniqueProfiles,
    totalNotes: waveTotal > 0 ? waveTotal : remaining,
    defaultMaxNotes: 1,
  });
}

function createProfileStats(spec) {
  return {
    assignedNotes: spec.assignedNotes,
    openedNotes: 0,
    commentsHarvestRuns: 0,
    commentsCollected: 0,
    commentsExpected: 0,
    commentsReachedBottomCount: 0,
    likesHitCount: 0,
    likesNewCount: 0,
    likesSkippedCount: 0,
    likesAlreadyCount: 0,
    likesDedupCount: 0,
    searchCount: 0,
    rollbackCount: 0,
    returnToSearchCount: 0,
    operationErrors: 0,
    recoveryFailed: 0,
    terminalCode: null,
    commentPaths: [],
    likeSummaryPaths: [],
    likeStatePaths: [],
  };
}

function pushUnique(arr, value) {
  const text = String(value || '').trim();
  if (!text) return;
  if (!arr.includes(text)) arr.push(text);
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function updateProfileStatsFromEvent(stats, payload) {
  const event = String(payload?.event || '').trim();
  if (!event) return;

  if (event === 'autoscript:operation_error') {
    stats.operationErrors += 1;
    return;
  }
  if (event === 'autoscript:operation_recovery_failed') {
    stats.recoveryFailed += 1;
    return;
  }
  if (event === 'autoscript:operation_terminal') {
    stats.terminalCode = String(payload.code || '').trim() || stats.terminalCode;
    return;
  }
  if (event !== 'autoscript:operation_done') return;

  const operationId = String(payload.operationId || '').trim();
  const rawResult = payload.result && typeof payload.result === 'object' ? payload.result : {};
  const result = rawResult.result && typeof rawResult.result === 'object'
    ? rawResult.result
    : rawResult;

  if (operationId === 'open_first_detail' || operationId === 'open_next_detail') {
    if (result.opened === true) {
      stats.openedNotes += 1;
    }
    return;
  }

  if (operationId === 'submit_search') {
    stats.searchCount = Math.max(stats.searchCount, toNumber(result.searchCount, stats.searchCount));
    return;
  }

  if (operationId === 'comments_harvest') {
    stats.commentsHarvestRuns += 1;
    stats.commentsCollected += toNumber(result.collected, 0);
    stats.commentsExpected += Math.max(0, toNumber(result.expectedCommentsCount, 0));
    if (result.reachedBottom === true) stats.commentsReachedBottomCount += 1;
    pushUnique(stats.commentPaths, result.commentsPath);
    return;
  }

  if (operationId === 'comment_like') {
    stats.likesHitCount += toNumber(result.hitCount, 0);
    stats.likesNewCount += toNumber(result.likedCount, 0);
    stats.likesSkippedCount += toNumber(result.skippedCount, 0);
    stats.likesAlreadyCount += toNumber(result.alreadyLikedSkipped, 0);
    stats.likesDedupCount += toNumber(result.dedupSkipped, 0);
    pushUnique(stats.likeSummaryPaths, result.summaryPath);
    pushUnique(stats.likeStatePaths, result.likeStatePath);
    pushUnique(stats.commentPaths, result.commentsPath);
    return;
  }

  if (operationId === 'close_detail') {
    stats.rollbackCount = Math.max(stats.rollbackCount, toNumber(result.rollbackCount, stats.rollbackCount));
    stats.returnToSearchCount = Math.max(stats.returnToSearchCount, toNumber(result.returnToSearchCount, stats.returnToSearchCount));
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function runProfile(spec, argv, baseOverrides = {}) {
  const profileId = spec.profileId;
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
  const options = buildTemplateOptions(argv, profileId, overrides);
  const script = buildXhsUnifiedAutoscript(options);
  const normalized = normalizeAutoscript(script, `xhs-unified:${profileId}`);
  const validation = validateAutoscript(normalized);
  if (!validation.ok) throw new Error(`autoscript validation failed for ${profileId}: ${validation.errors.join('; ')}`);

  await ensureDir(path.dirname(spec.logPath));
  const stats = createProfileStats(spec);

  const logEvent = (payload) => {
    const eventPayload = isObject(payload) ? payload : { event: 'autoscript:raw', payload };
    const merged = {
      ts: eventPayload.ts || nowIso(),
      profileId,
      ...eventPayload,
    };
    fs.appendFileSync(spec.logPath, `${JSON.stringify(merged)}\n`, 'utf8');
    console.log(JSON.stringify(merged));
    updateProfileStatsFromEvent(stats, merged);
    if (
      merged.event === 'autoscript:event'
      && merged.subscriptionId === 'login_guard'
      && (merged.type === 'appear' || merged.type === 'exist')
    ) {
      try {
        markProfileInvalid(profileId, 'login_guard_runtime');
      } catch {
        // ignore account state update errors during runtime logging
      }
    }
  };

  logEvent({
    event: 'xhs.unified.start',
    keyword: options.keyword,
    env: options.env,
    maxNotes: options.maxNotes,
    assignedNotes: spec.assignedNotes,
    outputRoot: options.outputRoot,
    parallelRunLabel: spec.runLabel,
  });

  const runner = new AutoscriptRunner(normalized, {
    profileId,
    log: logEvent,
  });

  const running = await runner.start();
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

  stats.stopReason = stopPayload.reason;

  const profileResult = {
    ok: stopPayload.reason !== 'script_failure',
    profileId,
    runId: stopPayload.runId,
    reason: stopPayload.reason,
    assignedNotes: spec.assignedNotes,
    outputRoot: options.outputRoot,
    logPath: spec.logPath,
    stats,
  };

  await writeJson(spec.summaryPath, profileResult);
  return profileResult;
}

async function runWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(1, Math.min(items.length || 1, concurrency || 1));
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => consume()));
  return results;
}

async function readJsonlRows(filePath) {
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildCommentDedupKey(row) {
  const noteId = String(row?.noteId || '').trim();
  const userId = String(row?.userId || '').trim();
  const content = String(row?.content || '').replace(/\s+/g, ' ').trim();
  return `${noteId}|${userId}|${content}`;
}

async function mergeProfileOutputs({
  results,
  mergedDir,
  keyword,
  env,
  totalNotes,
  parallel,
  concurrency,
  skippedProfiles = [],
}) {
  const success = results.filter((item) => item && item.ok);
  const failed = results.filter((item) => !item || item.ok === false);

  const mergedComments = [];
  const seenCommentKeys = new Set();
  const mergedLikeSummaries = [];

  for (const result of success) {
    for (const commentsPath of result.stats.commentPaths || []) {
      const rows = await readJsonlRows(commentsPath);
      for (const row of rows) {
        const key = buildCommentDedupKey(row);
        if (!key || seenCommentKeys.has(key)) continue;
        seenCommentKeys.add(key);
        mergedComments.push({
          profileId: result.profileId,
          ...row,
        });
      }
    }

    for (const summaryPath of result.stats.likeSummaryPaths || []) {
      try {
        const raw = await fsp.readFile(summaryPath, 'utf8');
        const summary = JSON.parse(raw);
        mergedLikeSummaries.push({ profileId: result.profileId, summaryPath, summary });
      } catch {
        continue;
      }
    }
  }

  await ensureDir(mergedDir);
  const mergedCommentsPath = path.join(mergedDir, 'comments.merged.jsonl');
  if (mergedComments.length > 0) {
    const payload = mergedComments.map((row) => JSON.stringify(row)).join('\n');
    await fsp.writeFile(mergedCommentsPath, `${payload}\n`, 'utf8');
  }

  const mergedLikeSummaryPath = path.join(mergedDir, 'likes.merged.json');
  const likeTotals = {
    noteSummaries: mergedLikeSummaries.length,
    scannedCount: 0,
    hitCount: 0,
    likedCount: 0,
    skippedCount: 0,
    reachedBottomCount: 0,
  };
  for (const item of mergedLikeSummaries) {
    const summary = item.summary || {};
    likeTotals.scannedCount += toNumber(summary.scannedCount, 0);
    likeTotals.hitCount += toNumber(summary.hitCount, 0);
    likeTotals.likedCount += toNumber(summary.likedCount, 0);
    likeTotals.skippedCount += toNumber(summary.skippedCount, 0);
    if (summary.reachedBottom === true) likeTotals.reachedBottomCount += 1;
  }
  await writeJson(mergedLikeSummaryPath, {
    generatedAt: nowIso(),
    totals: likeTotals,
    items: mergedLikeSummaries,
  });

  const totals = {
    profilesTotal: results.length,
    profilesSucceeded: success.length,
    profilesFailed: failed.length,
    assignedNotes: 0,
    openedNotes: 0,
    commentsHarvestRuns: 0,
    commentsCollected: 0,
    commentsExpected: 0,
    commentsReachedBottomCount: 0,
    likesHitCount: 0,
    likesNewCount: 0,
    likesSkippedCount: 0,
    likesAlreadyCount: 0,
    likesDedupCount: 0,
    searchCount: 0,
    rollbackCount: 0,
    returnToSearchCount: 0,
    operationErrors: 0,
    recoveryFailed: 0,
  };

  for (const result of results) {
    const stats = result?.stats || {};
    totals.assignedNotes += toNumber(result?.assignedNotes ?? stats.assignedNotes, 0);
    totals.openedNotes += toNumber(stats.openedNotes, 0);
    totals.commentsHarvestRuns += toNumber(stats.commentsHarvestRuns, 0);
    totals.commentsCollected += toNumber(stats.commentsCollected, 0);
    totals.commentsExpected += toNumber(stats.commentsExpected, 0);
    totals.commentsReachedBottomCount += toNumber(stats.commentsReachedBottomCount, 0);
    totals.likesHitCount += toNumber(stats.likesHitCount, 0);
    totals.likesNewCount += toNumber(stats.likesNewCount, 0);
    totals.likesSkippedCount += toNumber(stats.likesSkippedCount, 0);
    totals.likesAlreadyCount += toNumber(stats.likesAlreadyCount, 0);
    totals.likesDedupCount += toNumber(stats.likesDedupCount, 0);
    totals.searchCount += toNumber(stats.searchCount, 0);
    totals.rollbackCount += toNumber(stats.rollbackCount, 0);
    totals.returnToSearchCount += toNumber(stats.returnToSearchCount, 0);
    totals.operationErrors += toNumber(stats.operationErrors, 0);
    totals.recoveryFailed += toNumber(stats.recoveryFailed, 0);
  }

  const mergedSummary = {
    generatedAt: nowIso(),
    keyword,
    env,
    totalNotes: Number.isFinite(totalNotes) ? totalNotes : null,
    execution: {
      parallel,
      concurrency,
    },
    skippedProfiles,
    totals,
    artifacts: {
      mergedCommentsPath: mergedComments.length > 0 ? mergedCommentsPath : null,
      mergedLikeSummaryPath,
    },
    profiles: results,
  };

  const summaryPath = path.join(mergedDir, 'summary.json');
  await writeJson(summaryPath, mergedSummary);
  return {
    summaryPath,
    mergedSummary,
  };
}

export async function runUnified(argv, overrides = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim();
  if (!keyword) throw new Error('missing --keyword');

  const env = String(argv.env || 'debug').trim() || 'debug';
  const profiles = parseProfiles(argv);
  if (profiles.length === 0) throw new Error('missing --profile or --profiles or --profilepool');
  const defaultMaxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const totalNotes = parseNonNegativeInt(argv['total-notes'] ?? argv['total-target'], 0);
  const hasTotalTarget = totalNotes > 0;
  const maxWaves = parseIntFlag(argv['max-waves'], 40, 1);
  const parallelRequested = parseBool(argv.parallel, false);
  const configuredConcurrency = parseIntFlag(argv.concurrency, profiles.length || 1, 1);
  const planOnly = parseBool(argv['plan-only'], false);
  const seedCollectCountFlag = parseNonNegativeInt(argv['seed-collect-count'], 0);
  const seedCollectRoundsFlag = parseNonNegativeInt(argv['seed-collect-rounds'], 6);

  const runLabel = formatRunLabel();
  const baseOutputRoot = resolveDownloadRoot(argv['output-root']);
  const outputRootArg = String(argv['output-root'] || '').trim();
  const useShardRoots = profiles.length > 1;
  const sharedHarvestPath = profiles.length > 1
    ? path.join(baseOutputRoot, 'xiaohongshu', sanitizeForPath(env, 'debug'), sanitizeForPath(keyword, 'unknown'), 'merged', `run-${runLabel}`, 'coord', 'harvest-note-claims.json')
    : '';
  const searchSerialKey = `${sanitizeForPath(env, 'debug')}:${sanitizeForPath(keyword, 'unknown')}:${runLabel}`;
  const mergedDir = path.join(
    baseOutputRoot,
    'xiaohongshu',
    sanitizeForPath(env, 'debug'),
    sanitizeForPath(keyword, 'unknown'),
    'merged',
    `run-${runLabel}`,
  );
  const planPath = path.join(mergedDir, 'plan.json');
  const completedAtStart = hasTotalTarget
    ? await collectCompletedNoteIds(baseOutputRoot, env, keyword)
    : { count: 0, noteIds: [] };
  let remainingNotes = hasTotalTarget
    ? Math.max(0, totalNotes - completedAtStart.count)
    : defaultMaxNotes;

  const skippedProfileMap = new Map();
  const wavePlans = [];
  const allResults = [];
  let finalAccountStates = [];

  const execute = async (spec) => {
    try {
      return await runProfile(spec, argv, overrides);
    } catch (error) {
      const failure = {
        ok: false,
        profileId: spec.profileId,
        assignedNotes: spec.assignedNotes,
        outputRoot: spec.outputRoot,
        logPath: spec.logPath,
        reason: 'runner_error',
        error: error?.message || String(error),
        stats: {
          assignedNotes: spec.assignedNotes,
          openedNotes: 0,
          commentsHarvestRuns: 0,
          commentsCollected: 0,
          commentsExpected: 0,
          commentsReachedBottomCount: 0,
          likesHitCount: 0,
          likesNewCount: 0,
          likesSkippedCount: 0,
          likesAlreadyCount: 0,
          likesDedupCount: 0,
          searchCount: 0,
          rollbackCount: 0,
          returnToSearchCount: 0,
          operationErrors: 1,
          recoveryFailed: 0,
          terminalCode: null,
          commentPaths: [],
          likeSummaryPaths: [],
          likeStatePaths: [],
          stopReason: 'runner_error',
        },
      };
      await appendJsonl(spec.logPath, {
        ts: nowIso(),
        profileId: spec.profileId,
        event: 'xhs.unified.runner_error',
        error: failure.error,
      });
      await writeJson(spec.summaryPath, failure);
      console.error(JSON.stringify({
        event: 'xhs.unified.profile_failed',
        profileId: spec.profileId,
        error: failure.error,
      }));
      return failure;
    }
  };

  for (let wave = 1; wave <= maxWaves; wave += 1) {
    if (hasTotalTarget && remainingNotes <= 0) break;
    if (!hasTotalTarget && wave > 1) break;

    const accountStates = await syncXhsAccountsByProfiles(profiles);
    finalAccountStates = accountStates;
    const executableProfiles = accountStates
      .filter((item) => item?.valid === true && Boolean(String(item?.accountId || '').trim()))
      .map((item) => item.profileId);
    const invalidProfiles = accountStates.filter((item) => !item || item.valid !== true);
    for (const item of invalidProfiles) {
      const profileId = String(item?.profileId || '').trim();
      if (!profileId) continue;
      skippedProfileMap.set(profileId, {
        profileId,
        status: item?.status || 'invalid',
        reason: item?.reason || 'invalid',
        valid: item?.valid === true,
        accountId: item?.accountId || null,
      });
    }

    if (executableProfiles.length === 0) {
      if (wave === 1) {
        throw new Error(`no valid business accounts: ${invalidProfiles.map((item) => `${item.profileId}:${item.reason || 'invalid'}`).join(', ')}`);
      }
      break;
    }

    const plan = hasTotalTarget
      ? buildDynamicWavePlan({ profiles: executableProfiles, remainingNotes })
      : buildEvenShardPlan({ profiles: executableProfiles, totalNotes: 0, defaultMaxNotes });
    if (plan.length === 0) break;

    const parallel = parallelRequested && plan.length > 1;
    const concurrency = parallel
      ? Math.min(plan.length, configuredConcurrency)
      : 1;
    const waveTag = `wave-${String(wave).padStart(3, '0')}`;
    const specs = plan.map((item, index) => {
      const shardId = sanitizeForPath(item.profileId, 'profile');
      const shardOutputRoot = useShardRoots
        ? path.join(baseOutputRoot, 'shards', shardId)
        : outputRootArg;
      const defaultSeedCollectCount = Math.max(1, Math.min(
        Number(item.assignedNotes || 1),
        Math.max(1, plan.length * 2),
      ));
      const seedCollectCount = index === 0
        ? (seedCollectCountFlag > 0 ? seedCollectCountFlag : defaultSeedCollectCount)
        : 0;
      return {
        ...item,
        runLabel,
        waveTag,
        outputRoot: shardOutputRoot,
        logPath: path.join(mergedDir, 'profiles', `${waveTag}.${shardId}.events.jsonl`),
        summaryPath: path.join(mergedDir, 'profiles', `${waveTag}.${shardId}.summary.json`),
        sharedHarvestPath,
        searchSerialKey,
        seedCollectCount,
        seedCollectMaxRounds: index === 0 ? seedCollectRoundsFlag : 0,
      };
    });

    wavePlans.push({
      wave,
      waveTag,
      remainingBefore: remainingNotes,
      parallel,
      concurrency,
      specs: specs.map((item) => ({
        profileId: item.profileId,
        assignedNotes: item.assignedNotes,
        outputRoot: item.outputRoot,
        logPath: item.logPath,
        sharedHarvestPath: item.sharedHarvestPath || null,
        seedCollectCount: item.seedCollectCount || 0,
        seedCollectMaxRounds: item.seedCollectMaxRounds || 0,
      })),
    });

    if (planOnly) break;

    const waveResults = parallel
      ? await runWithConcurrency(specs, concurrency, execute)
      : await runWithConcurrency(specs, 1, execute);
    allResults.push(...waveResults);

    if (hasTotalTarget) {
      const openedInWave = waveResults.reduce((sum, item) => sum + toNumber(item?.stats?.openedNotes, 0), 0);
      remainingNotes = Math.max(0, remainingNotes - openedInWave);
      const waveRecord = wavePlans[wavePlans.length - 1];
      waveRecord.openedInWave = openedInWave;
      waveRecord.remainingAfter = remainingNotes;
      if (openedInWave <= 0) {
        console.error(JSON.stringify({
          event: 'xhs.unified.wave_stalled',
          wave,
          remainingNotes,
        }));
        break;
      }
    }
  }

  const skippedProfiles = Array.from(skippedProfileMap.values());

  const planPayload = {
    event: 'xhs.unified.plan',
    planPath,
    keyword,
    env,
    totalNotes: totalNotes > 0 ? totalNotes : null,
    defaultMaxNotes,
    maxWaves,
    runLabel,
    hasTotalTarget,
    completedAtStart: completedAtStart.count,
    remainingAtPlan: remainingNotes,
    accountStates: finalAccountStates,
    skippedProfiles,
    waves: wavePlans,
  };
  console.log(JSON.stringify(planPayload));

  await writeJson(planPath, planPayload);

  if (planOnly) {
    return {
      ok: true,
      planOnly: true,
      planPath,
      waves: wavePlans,
    };
  }

  const results = allResults;
  if (results.length === 0) {
    throw new Error(`no executable waves generated, see ${planPath}`);
  }

  const merged = await mergeProfileOutputs({
    results,
    mergedDir,
    keyword,
    env,
    totalNotes,
    parallel: parallelRequested,
    concurrency: configuredConcurrency,
    skippedProfiles,
  });

  const mergedSummary = {
    ...merged.mergedSummary,
    progress: {
      completedAtStart: completedAtStart.count,
      completedDuringRun: toNumber(merged.mergedSummary?.totals?.openedNotes, 0),
      targetTotal: hasTotalTarget ? totalNotes : null,
      remainingAfterRun: hasTotalTarget ? Math.max(0, remainingNotes) : null,
      reachedTarget: hasTotalTarget ? remainingNotes <= 0 : null,
    },
    waves: wavePlans,
  };
  await writeJson(merged.summaryPath, mergedSummary);

  console.log(JSON.stringify({
    event: 'xhs.unified.merged',
    summaryPath: merged.summaryPath,
    waves: wavePlans.length,
    profilesTotal: results.length,
    profilesSucceeded: results.filter((item) => item.ok).length,
    profilesFailed: results.filter((item) => !item.ok).length,
    remainingNotes: hasTotalTarget ? remainingNotes : null,
  }));

  const failedResults = results.filter((item) => !item.ok);
  if (hasTotalTarget && remainingNotes > 0) {
    throw new Error(`target not reached, remaining=${remainingNotes}, see ${merged.summaryPath}`);
  }
  if (failedResults.length > 0) {
    if (hasTotalTarget && remainingNotes <= 0) {
      console.warn(JSON.stringify({
        event: 'xhs.unified.partial_failures_tolerated',
        summaryPath: merged.summaryPath,
        failedProfiles: failedResults.map((item) => ({
          profileId: item.profileId,
          reason: item.reason || null,
        })),
      }));
    } else {
      throw new Error(`unified finished with failures, see ${merged.summaryPath}`);
    }
  }

  return {
    ok: true,
    summaryPath: merged.summaryPath,
    results,
  };
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    console.log([
      'Usage: node apps/webauto/entry/xhs-unified.mjs --profile <id> --keyword <kw> [options]',
      'Options:',
      '  --profiles <a,b,c>           多账号列表',
      '  --profilepool <prefix>       账号池前缀（自动读取匹配 profile）',
      '  --max-notes <n>              单账号目标（未启用 total-notes 时）',
      '  --total-notes <n>            总目标数（自动分片到账号）',
      '  --total-target <n>           total-notes 别名',
      '  --max-waves <n>              动态分片最大波次（默认40）',
      '  --parallel                   启用并行执行',
      '  --concurrency <n>            并行度（默认=账号数）',
      '  --resume <bool>              断点续传（默认 true）',
      '  --incremental-max <bool>     max-notes 作为增量配额（默认 true）',
      '  --plan-only                  只生成分片计划，不执行',
      '  --output-root <path>         输出根目录（并行时自动分 profile shard）',
      '  --seed-collect-count <n>     首账号预采样去重ID数量（默认按分片自动）',
      '  --seed-collect-rounds <n>    首账号预采样滚动轮数（默认6）',
      '  --search-serial-key <key>    搜索阶段串行锁key（默认自动生成）',
      '  --shared-harvest-path <path> 共享harvest去重列表路径（默认自动生成）',
    ].join('\n'));
    return;
  }
  await runUnified(argv);
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ xhs-unified failed:', err?.message || String(err));
    process.exit(1);
  });
}
