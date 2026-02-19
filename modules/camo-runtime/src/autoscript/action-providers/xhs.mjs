import path from 'node:path';
import fsp from 'node:fs/promises';
import { asErrorPayload } from '../../container/runtime-core/utils.mjs';
import {
  createEvaluateHandler,
  extractEvaluateResultData,
  evaluateWithScript,
  runEvaluateScript,
} from './xhs/common.mjs';
import { buildCommentsHarvestScript, buildCommentMatchScript } from './xhs/comments.mjs';
import {
  buildCloseDetailScript,
  buildDetailHarvestScript,
  buildExpandRepliesScript,
} from './xhs/detail.mjs';
import {
  buildCommentReplyScript,
  executeCommentLikeOperation,
} from './xhs/interaction.mjs';
import {
  mergeCommentsJsonl,
  resolveXhsOutputContext,
} from './xhs/persistence.mjs';
import { buildOpenDetailScript, buildSubmitSearchScript } from './xhs/search.mjs';

const XHS_OPERATION_LOCKS = new Map();

function toLockKey(text, fallback = '') {
  const value = String(text || '').trim();
  return value || fallback;
}

async function withSerializedLock(lockKey, fn) {
  const key = toLockKey(lockKey);
  if (!key) return fn();
  const previous = XHS_OPERATION_LOCKS.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  XHS_OPERATION_LOCKS.set(key, previous.catch(() => null).then(() => gate));
  await previous.catch(() => null);
  try {
    return await fn();
  } finally {
    release();
    if (XHS_OPERATION_LOCKS.get(key) === gate) XHS_OPERATION_LOCKS.delete(key);
  }
}

function normalizeNoteIdList(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const noteId = String(item || '').trim();
    if (!noteId || seen.has(noteId)) continue;
    seen.add(noteId);
    out.push(noteId);
  }
  return out;
}

function resolveSharedClaimPath(params = {}) {
  const raw = String(params.sharedHarvestPath || params.sharedClaimPath || '').trim();
  return raw ? path.resolve(raw) : '';
}

function resolveSearchLockKey(params = {}) {
  const raw = String(params.searchSerialKey || params.searchLockKey || '').trim();
  if (raw) return raw;
  const claimPath = resolveSharedClaimPath(params);
  return claimPath ? `claim:${claimPath}` : '';
}

async function loadSharedClaimDoc(filePath) {
  if (!filePath) {
    return { noteIds: [], byNoteId: {}, updatedAt: null };
  }
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const noteIds = normalizeNoteIdList(parsed?.noteIds);
    const byNoteId = parsed?.byNoteId && typeof parsed.byNoteId === 'object' ? parsed.byNoteId : {};
    return {
      noteIds,
      byNoteId,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return { noteIds: [], byNoteId: {}, updatedAt: null };
  }
}

async function saveSharedClaimDoc(filePath, doc) {
  if (!filePath) return;
  const noteIds = normalizeNoteIdList(doc?.noteIds);
  const payload = {
    updatedAt: new Date().toISOString(),
    noteIds,
    byNoteId: doc?.byNoteId && typeof doc.byNoteId === 'object' ? doc.byNoteId : {},
  };
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function executeSubmitSearchOperation({ profileId, params = {} }) {
  const script = buildSubmitSearchScript(params);
  const highlight = params.highlight !== false;
  const lockKey = resolveSearchLockKey(params);
  return withSerializedLock(lockKey ? `xhs_submit_search:${lockKey}` : '', () => evaluateWithScript({
    profileId,
    script,
    message: 'xhs_submit_search done',
    highlight,
  }));
}

async function executeOpenDetailOperation({ profileId, params = {} }) {
  const highlight = params.highlight !== false;
  const claimPath = resolveSharedClaimPath(params);
  const lockKey = claimPath ? `xhs_open_detail:${claimPath}` : '';

  const mapOpenDetailError = (err, paramsRef = {}) => {
    const message = String(err?.message || err || '');
    const mode = String(paramsRef?.mode || '').trim().toLowerCase();
    if (message.includes('AUTOSCRIPT_DONE_NO_MORE_NOTES')) {
      return {
        ok: true,
        code: 'AUTOSCRIPT_DONE_NO_MORE_NOTES',
        message: 'no more notes',
        data: { stopReason: 'no_more_notes' },
      };
    }
    if (message.includes('NO_SEARCH_RESULT_ITEM')) {
      if (mode === 'first') return null;
      return {
        ok: true,
        code: 'OPERATION_SKIPPED_NO_SEARCH_RESULT_ITEM',
        message: 'search result item missing',
        data: { skipped: true },
      };
    }
    return null;
  };

  const runWithExclude = async (excludeNoteIds) => {
    const script = buildOpenDetailScript({
      ...params,
      excludeNoteIds,
    });
    const operationResult = await evaluateWithScript({
      profileId,
      script,
      message: 'xhs_open_detail done',
      highlight,
    });
    const payload = extractEvaluateResultData(operationResult.data) || {};
    return {
      operationResult,
      payload: payload && typeof payload === 'object' ? payload : {},
    };
  };

  if (!claimPath) {
    try {
      const { operationResult } = await runWithExclude([]);
      return operationResult;
    } catch (err) {
      const mapped = mapOpenDetailError(err, params);
      if (mapped) return mapped;
      throw err;
    }
  }

  const runLocked = async () => {
    const claimDoc = await loadSharedClaimDoc(claimPath);
    const excludeNoteIds = normalizeNoteIdList(claimDoc.noteIds);
    const { operationResult, payload } = await runWithExclude(excludeNoteIds);

    const claimSet = new Set(excludeNoteIds);
    const claimAdded = [];
    const markClaim = (noteId, source = 'open_detail') => {
      const id = String(noteId || '').trim();
      if (!id || claimSet.has(id)) return;
      claimSet.add(id);
      claimAdded.push(id);
      claimDoc.byNoteId[id] = {
        noteId: id,
        profileId,
        source,
        ts: new Date().toISOString(),
      };
    };

    const seeded = normalizeNoteIdList(payload.seedCollectedNoteIds);
    for (const noteId of seeded) markClaim(noteId, 'seed_collect');
    if (payload.opened === true) markClaim(payload.noteId, 'open_detail');
    claimDoc.noteIds = Array.from(claimSet);
    if (claimAdded.length > 0) {
      await saveSharedClaimDoc(claimPath, claimDoc);
    }

    const mergedPayload = {
      ...payload,
      sharedClaimPath: claimPath,
      sharedClaimCount: claimDoc.noteIds.length,
      sharedClaimAdded: claimAdded,
      dedupExcluded: excludeNoteIds.length,
    };
    const mergedData = operationResult.data && typeof operationResult.data === 'object'
      ? { ...operationResult.data, result: mergedPayload }
      : { result: mergedPayload };

    return {
      ...operationResult,
      data: mergedData,
    };
  };

  try {
    return await withSerializedLock(lockKey, runLocked);
  } catch (err) {
    const mapped = mapOpenDetailError(err, params);
    if (mapped) return mapped;
    throw err;
  }
}

function buildReadStateScript() {
  return `(() => {
    const state = window.__camoXhsState || {};
    return {
      keyword: state.keyword || null,
      currentNoteId: state.currentNoteId || null,
      lastCommentsHarvest: state.lastCommentsHarvest && typeof state.lastCommentsHarvest === 'object'
        ? state.lastCommentsHarvest
        : null,
    };
  })()`;
}

async function readXhsRuntimeState(profileId) {
  try {
    const payload = await runEvaluateScript({
      profileId,
      script: buildReadStateScript(),
      highlight: false,
    });
    return extractEvaluateResultData(payload) || {};
  } catch {
    return {};
  }
}

async function handleRaiseError({ params }) {
  const code = String(params.code || params.message || 'AUTOSCRIPT_ABORT').trim();
  return asErrorPayload('OPERATION_FAILED', code || 'AUTOSCRIPT_ABORT');
}

async function executeCommentsHarvestOperation({ profileId, params = {} }) {
  const script = buildCommentsHarvestScript(params);
  const highlight = params.highlight !== false;
  const operationResult = await evaluateWithScript({
    profileId,
    script,
    message: 'xhs_comments_harvest done',
    highlight,
  });

  const payload = extractEvaluateResultData(operationResult.data) || {};
  const shouldPersistComments = params.persistComments === true || params.persistCollectedComments === true;
  const includeComments = params.includeComments !== false;
  const comments = Array.isArray(payload.comments) ? payload.comments : [];

  if (!shouldPersistComments || !includeComments || comments.length === 0) {
    return {
      ...operationResult,
      data: {
        ...payload,
        commentsPath: null,
        commentsAdded: 0,
        commentsTotal: Number(payload.collected || comments.length || 0),
      },
    };
  }

  const state = await readXhsRuntimeState(profileId);
  const output = resolveXhsOutputContext({
    params,
    state,
    noteId: payload.noteId || state.currentNoteId || params.noteId,
  });

  const merged = await mergeCommentsJsonl({
    filePath: output.commentsPath,
    noteId: output.noteId,
    comments,
  });

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comments_harvest done',
    data: {
      ...payload,
      commentsPath: merged.filePath,
      commentsAdded: merged.added,
      commentsTotal: merged.total,
      outputNoteDir: output.noteDir,
    },
  };
}

const XHS_ACTION_HANDLERS = {
  raise_error: handleRaiseError,
  xhs_submit_search: executeSubmitSearchOperation,
  xhs_open_detail: executeOpenDetailOperation,
  xhs_detail_harvest: createEvaluateHandler('xhs_detail_harvest done', buildDetailHarvestScript),
  xhs_expand_replies: createEvaluateHandler('xhs_expand_replies done', buildExpandRepliesScript),
  xhs_comments_harvest: executeCommentsHarvestOperation,
  xhs_comment_match: createEvaluateHandler('xhs_comment_match done', buildCommentMatchScript),
  xhs_comment_like: executeCommentLikeOperation,
  xhs_comment_reply: createEvaluateHandler('xhs_comment_reply done', buildCommentReplyScript),
  xhs_close_detail: createEvaluateHandler('xhs_close_detail done', buildCloseDetailScript),
};

export function isXhsAutoscriptAction(action) {
  const normalized = String(action || '').trim();
  return normalized === 'raise_error' || normalized.startsWith('xhs_');
}

export async function executeXhsAutoscriptOperation({ profileId, action, params = {} }) {
  const handler = XHS_ACTION_HANDLERS[action];
  if (!handler) {
    return asErrorPayload('UNSUPPORTED_OPERATION', `Unsupported xhs operation: ${action}`);
  }
  return handler({ profileId, params });
}
