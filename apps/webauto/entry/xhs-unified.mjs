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

function resolveDownloadRoot(customRoot = '') {
  const fromArg = String(customRoot || '').trim();
  if (fromArg) return path.resolve(fromArg);
  const fromEnv = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
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
  };
  return { ...base, ...overrides };
}

function buildShardPlan({ profiles, totalNotes, defaultMaxNotes }) {
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
  const result = payload.result && typeof payload.result === 'object' ? payload.result : {};

  if (operationId === 'open_first_detail' || operationId === 'open_next_detail') {
    stats.openedNotes = Math.max(stats.openedNotes, toNumber(result.visited, stats.openedNotes));
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

  const accountStates = await syncXhsAccountsByProfiles(profiles);
  const executableProfiles = accountStates
    .filter((item) => item?.valid === true && Boolean(String(item?.accountId || '').trim()))
    .map((item) => item.profileId);
  const invalidProfiles = accountStates.filter((item) => !item || item.valid !== true);
  if (executableProfiles.length === 0) {
    throw new Error(`no valid business accounts: ${invalidProfiles.map((item) => `${item.profileId}:${item.reason || 'invalid'}`).join(', ')}`);
  }

  const defaultMaxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const totalNotes = parseNonNegativeInt(argv['total-notes'] ?? argv['total-target'], 0);
  const plan = buildShardPlan({ profiles: executableProfiles, totalNotes, defaultMaxNotes });
  if (plan.length === 0) throw new Error('empty shard plan');

  const parallelRequested = parseBool(argv.parallel, false);
  const parallel = parallelRequested && plan.length > 1;
  const concurrency = parallel
    ? Math.min(plan.length, parseIntFlag(argv.concurrency, plan.length, 1))
    : 1;

  const runLabel = formatRunLabel();
  const baseOutputRoot = resolveDownloadRoot(argv['output-root']);
  const mergedDir = path.join(
    baseOutputRoot,
    'xiaohongshu',
    sanitizeForPath(env, 'debug'),
    sanitizeForPath(keyword, 'unknown'),
    'merged',
    `run-${runLabel}`,
  );
  const planPath = path.join(mergedDir, 'plan.json');

  const useShardRoots = plan.length > 1;
  const specs = plan.map((item) => {
    const shardId = sanitizeForPath(item.profileId, 'profile');
    const shardOutputRoot = useShardRoots
      ? path.join(baseOutputRoot, 'shards', shardId)
      : String(argv['output-root'] || '').trim();
    return {
      ...item,
      runLabel,
      outputRoot: shardOutputRoot,
      logPath: path.join(mergedDir, 'profiles', `${shardId}.events.jsonl`),
      summaryPath: path.join(mergedDir, 'profiles', `${shardId}.summary.json`),
    };
  });

  const planPayload = {
    event: 'xhs.unified.plan',
    planPath,
    keyword,
    env,
    totalNotes: totalNotes > 0 ? totalNotes : null,
    defaultMaxNotes,
    parallel,
    concurrency,
    accountStates,
    skippedProfiles: invalidProfiles.map((item) => ({
      profileId: item?.profileId || null,
      status: item?.status || 'invalid',
      reason: item?.reason || 'invalid',
      valid: item?.valid === true,
      accountId: item?.accountId || null,
    })),
    specs: specs.map((item) => ({
      profileId: item.profileId,
      assignedNotes: item.assignedNotes,
      outputRoot: item.outputRoot,
      logPath: item.logPath,
    })),
  };
  console.log(JSON.stringify(planPayload));

  await writeJson(planPath, planPayload);

  if (parseBool(argv['plan-only'], false)) {
    return {
      ok: true,
      planOnly: true,
      planPath,
      specs,
    };
  }

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

  const results = parallel
    ? await runWithConcurrency(specs, concurrency, execute)
    : await runWithConcurrency(specs, 1, execute);

  const merged = await mergeProfileOutputs({
    results,
    mergedDir,
    keyword,
    env,
    totalNotes,
    parallel,
    concurrency,
    skippedProfiles: invalidProfiles.map((item) => ({
      profileId: item?.profileId || null,
      status: item?.status || 'invalid',
      reason: item?.reason || 'invalid',
      accountId: item?.accountId || null,
    })),
  });

  console.log(JSON.stringify({
    event: 'xhs.unified.merged',
    summaryPath: merged.summaryPath,
    profilesTotal: results.length,
    profilesSucceeded: results.filter((item) => item.ok).length,
    profilesFailed: results.filter((item) => !item.ok).length,
  }));

  if (results.some((item) => !item.ok)) {
    throw new Error(`unified finished with failures, see ${merged.summaryPath}`);
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
      '  --parallel                   启用并行执行',
      '  --concurrency <n>            并行度（默认=账号数）',
      '  --plan-only                  只生成分片计划，不执行',
      '  --output-root <path>         输出根目录（并行时自动分 profile shard）',
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
