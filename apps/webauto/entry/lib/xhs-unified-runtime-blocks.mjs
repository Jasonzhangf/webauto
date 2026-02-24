import fsp from 'node:fs/promises';
import path from 'node:path';

import { nowIso } from './xhs-unified-blocks.mjs';

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function resolveUnifiedApiBaseUrl() {
  const raw = String(
    process.env.WEBAUTO_UNIFIED_API
    || process.env.WEBAUTO_UNIFIED_URL
    || 'http://127.0.0.1:7701',
  ).trim();
  return raw.replace(/\/+$/, '');
}

async function postUnifiedTaskRequest(baseUrl, pathname, payload) {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return false;
    return true;
  } catch {
    return false;
  }
}

function pushUnique(arr, value) {
  const text = String(value || '').trim();
  if (!text) return;
  if (!arr.includes(text)) arr.push(text);
}

export function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function readJsonlRows(filePath) {
  if (!filePath) return [];
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return raw
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

export function createTaskReporter(seed = {}) {
  const baseUrl = resolveUnifiedApiBaseUrl();
  const staticSeed = {
    profileId: String(seed.profileId || 'unknown').trim() || 'unknown',
    keyword: String(seed.keyword || '').trim(),
    phase: 'unified',
    uiTriggerId: String(seed.uiTriggerId || '').trim(),
  };
  const createdRunIds = new Set();

  const ensureCreated = async (runId, extra = {}) => {
    const rid = String(runId || '').trim();
    if (!rid) return false;
    if (createdRunIds.has(rid)) return true;
    const ok = await postUnifiedTaskRequest(baseUrl, '/api/v1/tasks', {
      runId: rid,
      ...staticSeed,
      ...extra,
    });
    if (ok) createdRunIds.add(rid);
    return ok;
  };

  const update = async (runId, patch = {}) => {
    const rid = String(runId || '').trim();
    if (!rid) return false;
    await ensureCreated(rid, patch);
    return postUnifiedTaskRequest(baseUrl, `/api/v1/tasks/${encodeURIComponent(rid)}/update`, {
      ...staticSeed,
      ...patch,
    });
  };

  const pushEvent = async (runId, type, data = {}) => {
    const rid = String(runId || '').trim();
    if (!rid) return false;
    await ensureCreated(rid, data);
    return postUnifiedTaskRequest(baseUrl, `/api/v1/tasks/${encodeURIComponent(rid)}/events`, {
      type: String(type || 'event').trim() || 'event',
      data,
    });
  };

  const setError = async (runId, message, code = 'TASK_ERROR', recoverable = false) => {
    const rid = String(runId || '').trim();
    if (!rid) return false;
    return update(rid, {
      error: {
        message: String(message || 'task_error'),
        code: String(code || 'TASK_ERROR'),
        timestamp: Date.now(),
        recoverable: recoverable === true,
      },
    });
  };

  return {
    ensureCreated,
    update,
    pushEvent,
    setError,
  };
}

export function createProfileStats(spec) {
  return {
    assignedNotes: spec.assignedNotes,
    linksCollected: 0,
    linksPaths: [],
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

export function resolveUnifiedPhaseLabel(operationId, fallback = '运行中') {
  const op = String(operationId || '').trim();
  if (!op) return fallback;
  if (
    op === 'sync_window_viewport'
    || op === 'goto_home'
    || op === 'fill_keyword'
    || op === 'submit_search'
    || op === 'xhs_assert_logged_in'
    || op === 'abort_on_login_guard'
    || op === 'abort_on_risk_guard'
  ) {
    return '登录校验';
  }
  if (op === 'ensure_tab_pool' || op === 'verify_subscriptions_all_pages' || op === 'collect_links') {
    return '采集链接';
  }
  if (
    op === 'open_first_detail'
    || op === 'open_next_detail'
    || op === 'wait_between_notes'
    || op === 'switch_tab_round_robin'
  ) {
    return '打开详情';
  }
  if (
    op === 'detail_harvest'
    || op === 'expand_replies'
    || op === 'comments_harvest'
    || op === 'comment_match_gate'
    || op === 'comment_like'
    || op === 'comment_reply'
    || op === 'close_detail'
  ) {
    return '详情采集点赞';
  }
  return fallback;
}

export function resolveUnifiedActionLabel(eventName, payload = {}, fallback = '运行中') {
  const opId = String(payload?.operationId || '').trim();
  if (opId) {
    if (eventName === 'autoscript:operation_error' || eventName === 'autoscript:operation_recovery_failed') {
      const err = String(payload?.code || payload?.message || '').trim();
      return err ? `${opId}: ${err}` : `${opId}: failed`;
    }
    const stage = String(payload?.stage || '').trim();
    if (stage) return `${opId}:${stage}`;
    return opId;
  }
  const msg = String(payload?.message || payload?.reason || '').trim();
  if (msg) return msg;
  return fallback;
}

export function updateProfileStatsFromEvent(stats, payload) {
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

  if (operationId === 'collect_links') {
    stats.linksCollected = Math.max(
      stats.linksCollected,
      toNumber(result.linksWithXsecToken, toNumber(result.collected, stats.linksCollected)),
    );
    pushUnique(stats.linksPaths, result.linksPath);
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

export async function mergeProfileOutputs({
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
    linksCollected: 0,
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
    totals.linksCollected += toNumber(stats.linksCollected, 0);
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
