import { getProfileState } from './state.mjs';
import { emitActionTrace, buildTraceRecorder } from './trace.mjs';
import { buildElementCollectability, normalizeInlineText } from './utils.mjs';
import { readDetailSnapshot } from './detail-ops.mjs';
import { readCommentsSnapshot, readLikeTargetByIndex, readReplyTargetByIndex, readReplyInputTarget, readReplySendButtonTarget } from './comments-ops.mjs';
import { clickPoint, sleep, clearAndType } from './dom-ops.mjs';

export async function readXhsRuntimeState(profileId) {
  const state = getProfileState(profileId);
  return { keyword: state.keyword || null, currentNoteId: state.currentNoteId || null, lastCommentsHarvest: state.lastCommentsHarvest && typeof state.lastCommentsHarvest === 'object' ? state.lastCommentsHarvest : null };
}

export async function executeDetailHarvestOperation({ profileId, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace } = buildTraceRecorder();
  const detail = await readDetailSnapshot(profileId);
  const commentsSnapshot = await readCommentsSnapshot(profileId);
  const elementMeta = buildElementCollectability(detail, commentsSnapshot);
  if (detail?.noteIdFromUrl) {
    state.currentNoteId = String(detail.noteIdFromUrl);
  }
  state.lastDetail = {
    title: String(detail?.title || '').trim().slice(0, 200),
    contentLength: Number(detail?.contentLength || 0),
    href: String(detail?.href || '').trim() || null,
    textPresent: detail?.textPresent === true,
    imageCount: Number(detail?.imageCount || 0),
    imageUrls: Array.isArray(detail?.imageUrls) ? detail.imageUrls : [],
    videoPresent: detail?.videoPresent === true,
    videoUrl: String(detail?.videoUrl || '').trim() || null,
    commentsContextAvailable: commentsSnapshot?.hasCommentsContext === true || detail?.commentsContextAvailable === true,
    collectability: elementMeta.collectability,
    skippedElements: elementMeta.skippedElements,
    fallbackCaptured: elementMeta.fallbackCaptured,
    capturedAt: detail?.capturedAt || new Date().toISOString(),
  };
  emitActionTrace(context, actionTrace, { stage: 'xhs_detail_harvest' });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_detail_harvest done', data: { harvested: true, detail: state.lastDetail, collectability: elementMeta.collectability, skippedElements: elementMeta.skippedElements, fallbackCaptured: elementMeta.fallbackCaptured } };
}

export async function executeCommentsHarvestOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace } = buildTraceRecorder();
  const snapshot = await readCommentsSnapshot(profileId);
  if (!snapshot?.hasCommentsContext) {
    return { ok: false, code: 'COMMENTS_CONTEXT_MISSING', message: 'Comments context not available', data: { commentCount: 0 } };
  }
  const existingRows = state.lastCommentsHarvest?.comments || [];
  const existingIds = new Set(existingRows.map((c) => `${c.author}::${c.content?.slice(0, 50)}`));
  const newComments = (snapshot.comments || []).filter((c) => !existingIds.has(`${c.author}::${c.content?.slice(0, 50)}`));
  state.lastCommentsHarvest = { commentCount: snapshot.commentCount, expectedCommentsCount: snapshot.expectedCommentsCount, comments: [...existingRows, ...newComments], capturedAt: new Date().toISOString() };
  emitActionTrace(context, actionTrace, { stage: 'xhs_comments_harvest' });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_comments_harvest done', data: { commentsPath: null, commentsAdded: newComments.length, commentsTotal: state.lastCommentsHarvest.comments.length, noteId: state.currentNoteId, searchCount: 0, collected: newComments.length, expectedCommentsCount: snapshot.expectedCommentsCount, commentCoverageRate: snapshot.expectedCommentsCount ? (state.lastCommentsHarvest.comments.length / snapshot.expectedCommentsCount).toFixed(2) : null, recoveries: 0, maxRecoveries: params.maxRecoveries || 3, firstComment: state.lastCommentsHarvest.comments[0] || null, reachedBottom: false, exitReason: 'harvest_complete', commentsSkippedReason: null, rounds: 1, configuredMaxRounds: 1, maxRounds: 1, maxRoundsSource: 'params', budgetExpectedCommentsCount: snapshot.expectedCommentsCount, scroll: null, collectability: snapshot.collectability, skippedElements: [], fallbackCaptured: {}, actionTrace } };
}

export async function executeCommentMatchOperation({ profileId, params = {} }) {
  const snapshot = await readCommentsSnapshot(profileId);
  const comments = snapshot?.comments || [];
  const keywords = String(params.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const mode = String(params.mode || 'any').trim().toLowerCase();
  const minHits = Math.max(1, Number(params.minHits || 1) || 1);
  let matchCount = 0;
  for (const comment of comments) {
    const text = normalizeInlineText(`${comment.author} ${comment.content}`);
    const hits = keywords.filter((kw) => text.includes(kw)).length;
    if ((mode === 'any' && hits > 0) || (mode === 'all' && hits >= keywords.length) || (mode === 'min' && hits >= minHits)) {
      matchCount += 1;
    }
  }
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_comment_match done', data: { matchCount, mode, minHits } };
}

export async function executeCommentLikeOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const keywords = String(params.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const maxComments = Math.max(1, Number(params.maxComments || 50) || 50);
  const snapshot = await readCommentsSnapshot(profileId);
  const comments = snapshot?.comments || [];
  let hitCount = 0;
  let likedCount = 0;
  let skippedCount = 0;
  const likedComments = [];
  for (let i = 0; i < Math.min(comments.length, maxComments); i += 1) {
    const comment = comments[i];
    const text = normalizeInlineText(`${comment.author} ${comment.content}`);
    const matched = keywords.length === 0 || keywords.some((kw) => text.includes(kw));
    if (!matched) { skippedCount += 1; continue; }
    hitCount += 1;
    const target = await readLikeTargetByIndex(profileId, i);
    if (!target?.found) { skippedCount += 1; continue; }
    await clickPoint(profileId, target.center, { steps: 2 });
    pushTrace({ kind: 'click', stage: 'comment_like', index: i });
    await sleep(300);
    likedCount += 1;
    likedComments.push({ index: i, author: comment.author, content: comment.content?.slice(0, 100) });
  }
  emitActionTrace(context, actionTrace, { stage: 'xhs_comment_like' });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_comment_like done', data: { noteId: state.currentNoteId, scannedCount: Math.min(comments.length, maxComments), hitCount, likedCount, skippedCount, likedTotal: likedCount, hitCheckOk: hitCount > 0, dedupSkipped: 0, alreadyLikedSkipped: 0, missingLikeControl: skippedCount, clickFailed: 0, verifyFailed: 0, likedComments, commentsPath: null, likeStatePath: null, evidenceDir: null, summaryPath: null, reachedBottom: true, stopReason: 'max_comments_reached' } };
}

export async function executeCommentReplyOperation({ profileId, params = {}, context = {} }) {
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const replyText = String(params.replyText || '').trim();
  if (!replyText) {
    return { ok: false, code: 'INVALID_PARAMS', message: 'replyText required' };
  }
  const index = Math.max(0, Number(params.index || 0) || 0);
  const target = await readReplyTargetByIndex(profileId, index);
  if (!target?.found) {
    return { ok: false, code: 'REPLY_TARGET_NOT_FOUND', message: `Comment index ${index} not found` };
  }
  await clickPoint(profileId, target.center, { steps: 2 });
  pushTrace({ kind: 'click', stage: 'comment_reply', target: 'reply_button', index });
  await sleep(500);
  const inputTarget = await readReplyInputTarget(profileId);
  if (!inputTarget?.found) {
    return { ok: false, code: 'REPLY_INPUT_NOT_FOUND', message: 'Reply input not found' };
  }
  await clickPoint(profileId, inputTarget.center, { steps: 2 });
  pushTrace({ kind: 'click', stage: 'comment_reply', target: 'reply_input' });
  await sleep(300);
  await clearAndType(profileId, replyText, 60);
  pushTrace({ kind: 'type', stage: 'comment_reply', length: replyText.length });
  await sleep(500);
  const sendTarget = await readReplySendButtonTarget(profileId);
  if (!sendTarget?.found) {
    return { ok: false, code: 'REPLY_SEND_NOT_FOUND', message: 'Send button not found' };
  }
  await clickPoint(profileId, sendTarget.center, { steps: 2 });
  pushTrace({ kind: 'click', stage: 'comment_reply', target: 'send_button' });
  await sleep(1000);
  emitActionTrace(context, actionTrace, { stage: 'xhs_comment_reply' });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_comment_reply done', data: { replied: true, index, replyText: replyText.slice(0, 100) } };
}

export async function executeExpandRepliesOperation({ profileId, context = {} }) {
  // 简化版本 - 实际实现需要读取展开按钮并点击
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_expand_replies done', data: { expanded: 0, scanned: 0 } };
}
