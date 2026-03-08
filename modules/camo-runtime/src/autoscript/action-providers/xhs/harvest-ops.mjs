import { getProfileState } from './state.mjs';
import { emitActionTrace, buildTraceRecorder, emitOperationProgress } from './trace.mjs';
import { buildElementCollectability, normalizeInlineText } from './utils.mjs';
import { readDetailSnapshot, readDetailState } from './detail-ops.mjs';
import { readCommentsSnapshot, readCommentEntryPoint, readCommentTotalTarget, readCommentScrollContainerTarget, readVisibleCommentTarget, readLikeTargetByIndex, readReplyTargetByIndex, readReplyInputTarget, readReplySendButtonTarget, readExpandReplyTargets } from './comments-ops.mjs';
import { consumeTabBudget } from './tab-state.mjs';
import { markDetailSlotProgress } from './detail-slot-state.mjs';
import { resolveXhsOutputContext, mergeCommentsJsonl, writeCommentsMd, writeContentMarkdown, appendLikeStateRows, writeLikeSummary } from './persistence.mjs';
import { clickPoint, sleep, clearAndType, pressKey, scrollBySelector, highlightVisualTarget, clearVisualHighlight, readLocation } from './dom-ops.mjs';

async function ensureDetailInteractionState(profileId) {
  const state = await readDetailSnapshot(profileId).catch(() => null);
  const detailVisible = state && (state.noteIdFromUrl || state.commentsContextAvailable || state.textPresent || state.imageCount > 0 || state.videoPresent);
  if (detailVisible) return { ok: true, escaped: false };
  await pressKey(profileId, 'Escape');
  await sleep(1200);
  const recovered = await readDetailSnapshot(profileId).catch(() => null);
  const recoveredVisible = recovered && (recovered.noteIdFromUrl || recovered.commentsContextAvailable || recovered.textPresent || recovered.imageCount > 0 || recovered.videoPresent);
  return { ok: Boolean(recoveredVisible), escaped: true };
}

export async function readXhsRuntimeState(profileId) {
  const state = getProfileState(profileId);
  return { keyword: state.keyword || null, currentNoteId: state.currentNoteId || null, lastCommentsHarvest: state.lastCommentsHarvest && typeof state.lastCommentsHarvest === 'object' ? state.lastCommentsHarvest : null };
}

function markActiveDetailFailure(state, code, data = null) {
  const detailState = state.detailLinkState && typeof state.detailLinkState === 'object'
    ? state.detailLinkState
    : {};
  const activeTabIndex = Number(detailState.activeTabIndex || 0) || null;
  const activeByTab = detailState.activeByTab && typeof detailState.activeByTab === 'object'
    ? { ...detailState.activeByTab }
    : {};
  if (activeTabIndex !== null) {
    const key = String(activeTabIndex);
    const current = activeByTab[key] && typeof activeByTab[key] === 'object' ? activeByTab[key] : {};
    activeByTab[key] = {
      ...current,
      failed: true,
      lastFailureCode: String(code || 'DETAIL_FLOW_FAILED').trim() || 'DETAIL_FLOW_FAILED',
      lastFailureAt: new Date().toISOString(),
      lastFailureData: data && typeof data === 'object' ? { ...data } : data,
    };
  }
  state.detailLinkState = {
    ...detailState,
    activeByTab,
    activeFailed: true,
    lastFailureCode: String(code || 'DETAIL_FLOW_FAILED').trim() || 'DETAIL_FLOW_FAILED',
    lastFailureAt: new Date().toISOString(),
    lastFailureData: data && typeof data === 'object' ? { ...data } : data,
  };
}

function splitKeywords(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCommentLikeDedupKey(state, row, index) {
  const noteId = String(state?.currentNoteId || '').trim() || 'note';
  const commentId = String(row?.commentId || row?.id || '').trim();
  if (commentId) return `${noteId}:${commentId}`;
  const userId = String(row?.authorId || row?.userId || '').trim();
  const content = String(row?.content || '').replace(/\s+/g, ' ').trim();
  if (userId || content) return `${noteId}:${userId}:${content}`;
  return `${noteId}:idx:${Number(index) || 0}`;
}

async function persistVisibleLikeArtifacts({ state, params, session }) {
  if (!state?.currentNoteId || !session || !Array.isArray(session.stateRows)) {
    return { summaryPath: null, likeStatePath: null };
  }
  const outputCtx = resolveXhsOutputContext({ params, state, noteId: state.currentNoteId });
  let likeStatePath = null;
  let summaryPath = null;
  if (params.persistLikeState === true && session.stateRows.length > 0) {
    const res = await appendLikeStateRows({
      filePath: outputCtx.likeStatePath,
      rows: session.stateRows,
    }).catch(() => null);
    likeStatePath = res?.filePath || outputCtx.likeStatePath;
    session.stateRows = [];
  }
  if (params.saveEvidence === true || session.summaryDirty === true) {
    const summary = {
      noteId: state.currentNoteId || null,
      detailUrl: state.currentHref || null,
      keyword: String(params.keyword || state.keyword || '').trim() || null,
      updatedAt: new Date().toISOString(),
      hitCount: session.hitCount,
      likedCount: session.likedCount,
      skippedCount: session.skippedCount,
      alreadyLikedSkipped: session.alreadyLikedSkipped,
      dedupSkipped: session.dedupSkipped,
      likedIndexes: session.likedIndexes,
      alreadyLikedIndexes: session.alreadyLikedIndexes,
      skippedIndexes: session.skippedIndexes,
      processedKeys: Array.from(session.processedKeys || []),
      matchedCommentIds: Array.from(session.matchedCommentIds || []),
    };
    const res = await writeLikeSummary({ filePath: outputCtx.likeSummaryPath, summary }).catch(() => null);
    summaryPath = res?.filePath || outputCtx.likeSummaryPath;
    session.summaryDirty = false;
  }
  return { summaryPath, likeStatePath };
}

async function processVisibleCommentLikes({ profileId, state, params, current, session, highlightStep, pushTrace, context = {} }) {
  if (params.doLikes !== true) {
    return { hitCount: 0, likedCount: 0, skippedCount: 0, alreadyLikedSkipped: 0, dedupSkipped: 0 };
  }
  const keywords = splitKeywords(params.likeKeywords || params.keywords || state.keyword || '');
  if (keywords.length === 0) {
    return { hitCount: 0, likedCount: 0, skippedCount: 0, alreadyLikedSkipped: 0, dedupSkipped: 0 };
  }
  const matchMode = String(params.likeMatchMode || params.matchMode || 'any').trim().toLowerCase();
  const minHits = Math.max(1, Number(params.likeMinHits ?? params.minHits ?? 1) || 1);
  const maxLikes = Math.max(0, Math.min(5, Number(params.maxLikesPerRound ?? params.maxLikes ?? 5) || 0));
  if (maxLikes <= 0) {
    return { hitCount: 0, likedCount: 0, skippedCount: 0, alreadyLikedSkipped: 0, dedupSkipped: 0 };
  }
  const comments = Array.isArray(current?.comments) ? current.comments : [];
  const keywordsLower = keywords.map((kw) => String(kw).toLowerCase());
  const matchedRows = [];
  for (const row of comments) {
    const text = normalizeInlineText(`${row?.author || row?.userName || ''} ${row?.content || ''}`);
    const textLower = text.toLowerCase();
    const hits = keywordsLower.filter((kw) => textLower.includes(kw)).length;
    const matched = (matchMode === 'any' && hits > 0)
      || (matchMode === 'all' && hits >= keywords.length)
      || (matchMode === 'min' && hits >= minHits);
    if (matched) {
      matchedRows.push({ ...row });
    }
  }
  emitOperationProgress(context, {
    kind: 'match_probe',
    stage: 'inline_comment_like',
    visibleCount: comments.length,
    matchedCount: matchedRows.length,
    matchedSamples: matchedRows.slice(0, 5).map((row) => ({
      index: row.index,
      content: String(row.rawText || row.content || '').slice(0, 120),
    })),
    keywords,
  });
  let roundLiked = 0;
  let roundHitCount = 0;
  let roundSkippedCount = 0;
  let roundAlreadyLiked = 0;
  let roundDedupSkipped = 0;
  for (const row of matchedRows) {
    if (roundLiked >= maxLikes) break;
    const idx = Number(row?.index);
    if (!Number.isFinite(idx)) continue;
    const dedupKey = buildCommentLikeDedupKey(state, row, idx);
    roundHitCount += 1;
    session.matchedCommentIds.add(dedupKey);
    if (session.processedKeys.has(dedupKey)) {
      roundDedupSkipped += 1;
      roundSkippedCount += 1;
      session.dedupSkipped += 1;
      session.skippedCount += 1;
      session.skippedIndexes.push(idx);
      pushTrace({ kind: 'skip', stage: 'inline_comment_like', index: idx, reason: 'dedup' });
      continue;
    }
    const preLikeDetailState = await readDetailState(profileId).catch(() => null);
    const preLikeDetail = await readDetailSnapshot(profileId).catch(() => null);
    emitOperationProgress(context, {
      kind: 'pre_like_state',
      stage: 'inline_comment_like',
      index: idx,
      href: preLikeDetailState?.href || null,
      noteIdFromUrl: preLikeDetail?.noteIdFromUrl || null,
      detailVisible: Boolean(preLikeDetail && (preLikeDetail.noteIdFromUrl || preLikeDetail.commentsContextAvailable || preLikeDetail.textPresent || preLikeDetail.imageCount > 0 || preLikeDetail.videoPresent)),
      commentsContextAvailable: preLikeDetail?.commentsContextAvailable === true,
      currentNoteId: state.currentNoteId || null,
      commentPreview: String(row?.content || '').slice(0, 160),
    });
    const target = await readLikeTargetByIndex(profileId, idx);
    if (!target?.found || !target?.center) {
      roundSkippedCount += 1;
      session.skippedCount += 1;
      session.skippedIndexes.push(idx);
      pushTrace({ kind: 'skip', stage: 'inline_comment_like', index: idx, reason: 'like_target_missing' });
      continue;
    }
    await highlightStep('xhs-detail-comment-like', target, 'matched', 'comment like', 1800);
    if (target.liked === true) {
      session.processedKeys.add(dedupKey);
      session.hitCount += 1;
      session.likedCount += 1;
      session.alreadyLikedSkipped += 1;
      session.likedIndexes.push(idx);
      session.alreadyLikedIndexes.push(idx);
      session.stateRows.push({
        ts: new Date().toISOString(),
        noteId: state.currentNoteId || null,
        detailUrl: state.currentHref || null,
        commentId: String(row?.commentId || '').trim() || null,
        index: idx,
        userId: String(row?.authorId || row?.userId || '').trim() || null,
        userName: String(row?.author || row?.userName || '').trim() || null,
        content: String(row?.content || '').trim(),
        action: 'already_liked_skip',
        status: 'liked',
      });
      session.summaryDirty = true;
      roundLiked += 1;
      roundAlreadyLiked += 1;
      pushTrace({ kind: 'skip', stage: 'inline_comment_like', index: idx, reason: 'already_liked', status: target.likeStatus || null });
      continue;
    }
    await highlightStep('xhs-detail-comment-like', target, 'focus', 'comment like');
    emitOperationProgress(context, {
      kind: 'pre_like_click',
      stage: 'inline_comment_like',
      index: idx,
      center: target.center,
      commentPreview: String(row?.content || '').slice(0, 160),
    });
    await clickPoint(profileId, target.center, { steps: 2 });
    await highlightStep('xhs-detail-comment-like', target, 'processed', 'comment like', 3200);
    await sleep(650);
    const postLikeDetailState = await readDetailState(profileId).catch(() => null);
    const postLikeDetail = await readDetailSnapshot(profileId).catch(() => null);
    emitOperationProgress(context, {
      kind: 'post_like_state',
      stage: 'inline_comment_like',
      index: idx,
      href: postLikeDetailState?.href || null,
      noteIdFromUrl: postLikeDetail?.noteIdFromUrl || null,
      detailVisible: Boolean(postLikeDetail && (postLikeDetail.noteIdFromUrl || postLikeDetail.commentsContextAvailable || postLikeDetail.textPresent || postLikeDetail.imageCount > 0 || postLikeDetail.videoPresent)),
      commentsContextAvailable: postLikeDetail?.commentsContextAvailable === true,
      currentNoteId: state.currentNoteId || null,
      commentPreview: String(row?.content || '').slice(0, 160),
    });
    session.processedKeys.add(dedupKey);
    session.hitCount += 1;
    session.likedCount += 1;
    session.likedIndexes.push(idx);
    session.stateRows.push({
      ts: new Date().toISOString(),
      noteId: state.currentNoteId || null,
      detailUrl: state.currentHref || null,
      commentId: String(row?.commentId || '').trim() || null,
      index: idx,
      userId: String(row?.authorId || row?.userId || '').trim() || null,
      userName: String(row?.author || row?.userName || '').trim() || null,
      content: String(row?.content || '').trim(),
      action: 'click_like',
      status: 'liked',
    });
    session.summaryDirty = true;
    roundLiked += 1;
    pushTrace({ kind: 'click', stage: 'inline_comment_like', index: idx, center: target.center });
  }
  return {
    hitCount: roundHitCount,
    likedCount: roundLiked,
    skippedCount: roundSkippedCount,
    alreadyLikedSkipped: roundAlreadyLiked,
    dedupSkipped: roundDedupSkipped,
  };
}

export async function executeDetailHarvestOperation({ profileId, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const detail = await readDetailSnapshot(profileId);
  const commentsSnapshot = await readCommentsSnapshot(profileId);
  const elementMeta = buildElementCollectability(detail, commentsSnapshot);
  if (detail?.noteIdFromUrl) {
    state.currentNoteId = String(detail.noteIdFromUrl);
  }
  state.lastDetail = {
    title: String(detail?.title || '').trim().slice(0, 200),
    contentLength: Number(detail?.contentLength || 0),
    contentText: String(detail?.contentText || '').trim(),
    contentPreview: String(detail?.contentPreview || '').trim(),
    href: String(detail?.href || '').trim() || null,
    authorName: String(detail?.authorName || '').trim() || null,
    authorId: String(detail?.authorId || '').trim() || null,
    authorLink: String(detail?.authorLink || '').trim() || null,
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
  let contentPath = null;
  try {
    const outputCtx = resolveXhsOutputContext({
      params: {
        keyword: state.keyword || 'unknown',
        env: state.env || 'debug',
      },
      state,
      noteId: state.currentNoteId,
    });
    const written = await writeContentMarkdown({
      filePath: outputCtx.contentPath,
      imagesDir: outputCtx.imagesDir,
      noteId: state.currentNoteId,
      keyword: state.keyword || null,
      detailUrl: state.lastDetail?.href || state.currentHref || null,
      detail: state.lastDetail,
      includeImages: true,
    }).catch(() => null);
    contentPath = written?.filePath || outputCtx.contentPath;
  } catch {
    contentPath = null;
  }
  emitActionTrace(context, actionTrace, { stage: 'xhs_detail_harvest' });
  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeFailed: false,
    lastHarvestSuccessAt: new Date().toISOString(),
    lastHarvestStage: 'detail_harvest',
  };
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_detail_harvest done', data: { harvested: true, detail: state.lastDetail, contentPath, collectability: elementMeta.collectability, skippedElements: elementMeta.skippedElements, fallbackCaptured: elementMeta.fallbackCaptured } };
}

export async function executeCommentsHarvestOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const detailSnapshotBefore = await readDetailSnapshot(profileId).catch(() => null);
  if (detailSnapshotBefore?.noteIdFromUrl) {
    state.currentNoteId = String(detailSnapshotBefore.noteIdFromUrl);
  }
  state.currentHref = String(detailSnapshotBefore?.href || state.currentHref || '').trim() || null;
  const highlightStep = async (channel, target, stateName, label, duration = 2400) => {
    if (!target?.center) return;
    await highlightVisualTarget(profileId, target, {
      channel,
      state: stateName,
      label,
      duration,
    });
  };
  const clearCommentHighlights = async () => {
    await Promise.allSettled([
      clearVisualHighlight(profileId, 'xhs-detail-comment-entry'),
      clearVisualHighlight(profileId, 'xhs-detail-comment-total'),
      clearVisualHighlight(profileId, 'xhs-detail-comment-item'),
      clearVisualHighlight(profileId, 'xhs-detail-comment-scroll'),
      clearVisualHighlight(profileId, 'xhs-detail-comment-like'),
    ]);
  };
  const ensureExpectedDetail = async () => {
    const interactionState = await ensureDetailInteractionState(profileId);
    if (!interactionState?.ok) return false;
    const res = await readDetailSnapshot(profileId);
    if (!res) return false;
    if (!res.noteIdFromUrl || !state.currentNoteId) return true;
    return String(res.noteIdFromUrl) === String(state.currentNoteId);
  };
  const focusCommentContext = async (mode = 'initial') => {
    let commentTotal = await readCommentTotalTarget(profileId);
    let commentScroll = await readCommentScrollContainerTarget(profileId);
    let visibleComment = await readVisibleCommentTarget(profileId);
    let entry = null;
    const hasVisibleComments = visibleComment?.found && visibleComment.center;
    const hasCommentTotal = commentTotal?.found && commentTotal.center;

    if (hasVisibleComments) {
      await highlightStep('xhs-detail-comment-item', visibleComment, 'matched', 'visible comment');
    }
    if (hasCommentTotal) {
      await highlightStep('xhs-detail-comment-total', commentTotal, 'matched', 'comment total');
    }

    if (!hasVisibleComments) {
      entry = await readCommentEntryPoint(profileId);
      if (entry?.found && entry.center) {
        await highlightStep('xhs-detail-comment-entry', entry, 'matched', 'comment entry');
        const ok = await ensureExpectedDetail();
        if (!ok) {
          return { ok: false, code: 'DETAIL_NOTEID_MISMATCH', message: 'Detail noteId mismatch before comment entry', data: { expected: state.currentNoteId || null } };
        }
        await highlightStep('xhs-detail-comment-entry', entry, 'focus', 'comment entry');
        await clickPoint(profileId, entry.center, { steps: 2 });
        await highlightStep('xhs-detail-comment-entry', entry, 'processed', 'comment entry', 4200);
        await sleep(5000);
        commentTotal = await readCommentTotalTarget(profileId);
        commentScroll = await readCommentScrollContainerTarget(profileId);
        visibleComment = await readVisibleCommentTarget(profileId);
      }
    }

    const hasVisibleCommentsAfterEntry = visibleComment?.found && visibleComment.center;
    const hasCommentTotalAfterEntry = commentTotal?.found && commentTotal.center;

    if (hasVisibleCommentsAfterEntry) {
      await highlightStep('xhs-detail-comment-item', visibleComment, 'matched', 'visible comment');
    }
    if (hasCommentTotalAfterEntry) {
      await highlightStep('xhs-detail-comment-total', commentTotal, 'matched', 'comment total');
    }

    if (!hasVisibleCommentsAfterEntry && !hasCommentTotalAfterEntry) {
      return { ok: true, scrollTarget: null, commentsUnavailable: true, reason: 'comment_panel_not_opened' };
    }

    if (visibleComment?.found && visibleComment.center) {
      await highlightStep('xhs-detail-comment-item', visibleComment, 'matched', 'visible comment', 3200);
    }

    if (commentScroll?.found && commentScroll.center) {
      await highlightStep('xhs-detail-comment-scroll', commentScroll, 'matched', 'comment scroll', 3200);
      const ok = await ensureExpectedDetail();
      if (!ok) {
        return { ok: false, code: 'DETAIL_NOTEID_MISMATCH', message: 'Detail noteId mismatch before comment scroll focus', data: { expected: state.currentNoteId || null } };
      }
      if (mode !== 'probe') {
        await highlightStep('xhs-detail-comment-scroll', commentScroll, 'focus', 'comment scroll');
        await clickPoint(profileId, commentScroll.center, { steps: 2 });
        await highlightStep('xhs-detail-comment-scroll', commentScroll, 'processed', 'comment scroll', 4200);
        await sleep(5000);
      }
      return { ok: true, scrollTarget: commentScroll, visibleCommentTarget: visibleComment || null, didFocusClick: mode !== 'probe' };
    }
    return { ok: true, scrollTarget: null };
  };
  const interactionState = await ensureDetailInteractionState(profileId);
  if (!interactionState?.ok) {
    await clearCommentHighlights();
    markActiveDetailFailure(state, 'DETAIL_INTERACTION_STATE_INVALID', { stage: 'comments_harvest_start' });
    return { ok: false, code: 'DETAIL_INTERACTION_STATE_INVALID', message: 'detail interaction state invalid before comments harvest' };
  }
  const focusResult = await focusCommentContext('initial');
  if (focusResult?.ok === false) {
    await clearCommentHighlights();
    markActiveDetailFailure(state, focusResult.code || 'COMMENTS_CONTEXT_FOCUS_FAILED', focusResult.data || null);
    return focusResult;
  }
  if (focusResult?.commentsUnavailable === true) {
    markDetailSlotProgress(state, params, {
      completed: true,
      paused: false,
      budgetExhausted: false,
      reachedBottom: false,
      commentsEmpty: true,
      exitReason: String(focusResult.reason || 'comment_panel_not_opened'),
      commentsAdded: 0,
    });
    await clearCommentHighlights();
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_comments_harvest skipped',
      data: {
        commentsPath: null,
        commentsMdPath: null,
        commentsAdded: 0,
        commentsTotal: 0,
        noteId: state.currentNoteId,
        collected: 0,
        expectedCommentsCount: 0,
        commentCoverageRate: null,
        recoveries: 0,
        maxRecoveries: Math.max(1, Number(params.maxRecoveries ?? 3) || 3),
        reachedBottom: false,
        exitReason: String(focusResult.reason || 'comment_panel_not_opened'),
        commentsSkippedReason: String(focusResult.reason || 'comment_panel_not_opened'),
        rounds: 0,
        maxRounds: Math.max(1, Number(params.maxRounds ?? 1) || 1),
      },
    };
  }
  let commentScroll = focusResult?.scrollTarget || null;
  const snapshot = await readCommentsSnapshot(profileId);
  if (!snapshot?.hasCommentsContext) {
    await clearCommentHighlights();
    markActiveDetailFailure(state, 'COMMENTS_CONTEXT_MISSING', { commentCount: 0 });
    return { ok: false, code: 'COMMENTS_CONTEXT_MISSING', message: 'Comments context not available', data: { commentCount: 0 } };
  }

  const keyword = String(params.keyword || state.keyword || 'unknown').trim();
  const env = String(params.env || state.env || 'debug').trim();
  const persistComments = params.persistComments === true;

  const maxRounds = Math.max(1, Number(params.maxRounds ?? 1) || 1);
  const adaptiveMaxRounds = params.adaptiveMaxRounds !== false;
  const expectedPerRound = Math.max(1, Number(params.adaptiveExpectedPerRound ?? 6) || 6);
  const bufferRounds = Math.max(0, Number(params.adaptiveBufferRounds ?? 22) || 22);
  const minBoostRounds = Math.max(0, Number(params.adaptiveMinBoostRounds ?? 36) || 36);
  const maxRoundsCap = Math.max(maxRounds, Number(params.adaptiveMaxRoundsCap ?? 320) || 320);
  const maxComments = Number(params.commentsLimit ?? params.maxComments ?? 0) || 0;
  const scrollStepMin = Math.max(120, Number(params.scrollStepMin ?? params.scrollStep ?? 280) || 280);
  const scrollStepMax = Math.max(scrollStepMin, Number(params.scrollStepMax ?? params.scrollStep ?? 420) || 420);
  const settleMinMs = Math.max(80, Number(params.settleMinMs ?? params.settleMs ?? 280) || 280);
  const settleMaxMs = Math.max(settleMinMs, Number(params.settleMaxMs ?? params.settleMs ?? 820) || 820);
  const scrollDelayMinMs = Math.max(600, Number(params.scrollDelayMinMs ?? params.scrollDelayMs ?? 1200) || 1200);
  const scrollDelayMaxMs = Math.max(scrollDelayMinMs, Number(params.scrollDelayMaxMs ?? params.scrollDelayMs ?? 2200) || 2200);
  const stallRounds = Math.max(1, Number(params.stallRounds ?? 8) || 8);
  const recoveryNoProgressRounds = Math.max(1, Number(params.recoveryNoProgressRounds ?? 3) || 3);
  const recoveryUpRounds = Math.max(1, Number(params.recoveryUpRounds ?? 4) || 4);
  const recoveryDownRounds = Math.max(1, Number(params.recoveryDownRounds ?? 1) || 1);
  const maxRecoveries = Math.max(1, Number(params.maxRecoveries ?? 3) || 3);

  const existingRows = Array.isArray(state.lastCommentsHarvest?.comments)
    && String(state.lastCommentsHarvest?.noteId || '') === String(state.currentNoteId || '')
    ? state.lastCommentsHarvest.comments
    : [];
  const makeRowKey = (row) => {
    if (!row) return '';
    if (row.commentId) return String(row.commentId);
    const author = String(row.author || row.authorName || '').trim();
    const content = String(row.content || '').slice(0, 80);
    return `${author}::${content}`;
  };
  const existingIds = new Set(existingRows.map((c) => makeRowKey(c)).filter(Boolean));
  let collectedRows = [...existingRows];
  let totalAdded = 0;
  const inlineLikeSession = {
    hitCount: 0,
    likedCount: 0,
    skippedCount: 0,
    alreadyLikedSkipped: 0,
    dedupSkipped: 0,
    likedIndexes: [],
    skippedIndexes: [],
    alreadyLikedIndexes: [],
    processedKeys: new Set(),
    matchedCommentIds: new Set(),
    stateRows: [],
    summaryDirty: false,
  };
  let inlineLikeSummaryPath = null;
  let inlineLikeStatePath = null;
  let rounds = 0;
  let effectiveMaxRounds = maxRounds;
  let noProgressRounds = 0;
  let recoveries = 0;
  let lastSignature = '';
  let reachedBottom = false;
  let commentsEmpty = false;
  let exitReason = 'harvest_complete';

  const makeSignature = (rows = []) => {
    if (!rows.length) return '';
    const last = rows[rows.length - 1];
    return makeRowKey(last) || `${last.author || ''}::${String(last.content || '').slice(0, 80)}`;
  };

  const flushCommentArtifacts = async (rows, expectedCommentsCount) => {
    let commentsPath = null;
    let commentsMdPath = null;
    if (!state.currentNoteId) {
      return { commentsPath, commentsMdPath };
    }
    const outputCtx = resolveXhsOutputContext({ params: { keyword, env }, state, noteId: state.currentNoteId });
    if (persistComments) {
      try {
        const merged = await mergeCommentsJsonl({
          filePath: outputCtx.commentsPath,
          noteId: state.currentNoteId,
          comments: rows,
        });
        commentsPath = merged.filePath;
      } catch {
        commentsPath = outputCtx.commentsPath;
      }
    }
    try {
      const mdRes = await writeCommentsMd({
        filePath: outputCtx.commentsMdPath,
        noteId: state.currentNoteId,
        keyword,
        detailUrl: state.currentHref || '',
        comments: rows,
        commentsMeta: { expectedCommentsCount, reachedEnd: false },
      });
      commentsMdPath = mdRes.filePath;
    } catch {
      commentsMdPath = outputCtx.commentsMdPath;
    }
    return { commentsPath, commentsMdPath };
  };

  const applyVisibleLikePass = async (currentSnapshot) => {
    const kw = splitKeywords(params.likeKeywords || params.keywords || state.keyword || '');
    emitOperationProgress(context, {
      kind: 'visible_comments_probe',
      stage: 'inline_comment_like',
      visibleCount: Array.isArray(currentSnapshot?.comments) ? currentSnapshot.comments.length : 0,
      sampleComments: Array.isArray(currentSnapshot?.comments)
        ? currentSnapshot.comments.slice(0, 12).map((c) => ({
            index: c?.index ?? null,
            author: String(c?.author || '').slice(0, 40),
            content: String(c?.content || '').slice(0, 160),
          }))
        : [],
      keywords: kw,
      keywordHits: Array.isArray(currentSnapshot?.comments)
        ? currentSnapshot.comments
            .filter((c) => kw.some((kwItem) => String(c?.content || '').includes(kwItem)))
            .slice(0, 12)
            .map((c) => ({
              index: c?.index ?? null,
              author: String(c?.author || '').slice(0, 40),
              content: String(c?.content || '').slice(0, 160),
            }))
        : [],
      commentsScroll: currentSnapshot?.scroll || null,
    });
    const inlineLikeStats = await processVisibleCommentLikes({
      profileId,
      state,
      params: {
        ...params,
        doLikes: params.doLikes === true,
        keyword,
      },
      current: currentSnapshot,
      session: inlineLikeSession,
      highlightStep,
      pushTrace,
      context,
    });
    if (inlineLikeStats.likedCount > 0 || inlineLikeStats.hitCount > 0 || inlineLikeStats.skippedCount > 0) {
      const persisted = await persistVisibleLikeArtifacts({
        state,
        params: {
          ...params,
          keyword,
          env,
          outputRoot: params.outputRoot || params.rootDir || params.downloadRoot || '',
        },
        session: inlineLikeSession,
      });
      inlineLikeSummaryPath = persisted.summaryPath || inlineLikeSummaryPath;
      inlineLikeStatePath = persisted.likeStatePath || inlineLikeStatePath;
    }
    return inlineLikeStats;
  };

  while (rounds < effectiveMaxRounds) {
    rounds += 1;
    const loopInteractionState = await ensureDetailInteractionState(profileId);
    if (!loopInteractionState?.ok) {
      await clearCommentHighlights();
      markActiveDetailFailure(state, 'DETAIL_INTERACTION_STATE_INVALID', { stage: 'comments_harvest_loop', commentCount: collectedRows.length });
      return { ok: false, code: 'DETAIL_INTERACTION_STATE_INVALID', message: 'detail interaction state invalid during comments harvest', data: { commentCount: collectedRows.length } };
    }
    const current = rounds === 1 ? snapshot : await readCommentsSnapshot(profileId);
    if (!current?.detailVisible || !current?.hasCommentsContext) {
      await clearCommentHighlights();
      markActiveDetailFailure(state, 'COMMENTS_CONTEXT_LOST', { commentCount: collectedRows.length });
      return { ok: false, code: 'COMMENTS_CONTEXT_LOST', message: 'Comments context lost', data: { commentCount: collectedRows.length } };
    }
    if (adaptiveMaxRounds && rounds === 1) {
      const expected = Number(current?.expectedCommentsCount ?? 0) || 0;
      if (expected > 0 && expectedPerRound > 0) {
        const estimate = Math.ceil(expected / expectedPerRound);
        const boosted = Math.max(maxRounds, estimate + bufferRounds, minBoostRounds);
        effectiveMaxRounds = Math.min(Math.max(boosted, maxRounds), maxRoundsCap);
      }
    }
    const list = Array.isArray(current?.comments) ? current.comments : [];
    const scrollMeta = current?.scroll && typeof current.scroll === 'object' ? current.scroll : null;
    const expectedCommentsCount = Number(current?.expectedCommentsCount ?? 0) || 0;
    commentsEmpty = expectedCommentsCount === 0 || (list.length === 0 && expectedCommentsCount <= 0);
    reachedBottom = scrollMeta?.atBottom === true;
    const newComments = list.filter((c) => {
      const key = makeRowKey(c);
      return key && !existingIds.has(key);
    });
    if (newComments.length > 0) {
      for (const row of newComments) {
        const key = makeRowKey(row);
        if (key) existingIds.add(key);
      }
      collectedRows = [...collectedRows, ...newComments];
      totalAdded += newComments.length;
      await flushCommentArtifacts(collectedRows, current.expectedCommentsCount);
    }

    await applyVisibleLikePass(current);

    const signature = makeSignature(list);
    if (signature && signature === lastSignature) {
      noProgressRounds += 1;
    } else {
      noProgressRounds = 0;
      lastSignature = signature || lastSignature;
    }

    if (maxComments > 0 && collectedRows.length >= maxComments) {
      exitReason = 'max_comments_reached';
      break;
    }

    if (commentsEmpty) {
      exitReason = 'comments_empty';
      break;
    }

    if (reachedBottom) {
      exitReason = 'reached_bottom';
      break;
    }

    if (noProgressRounds >= recoveryNoProgressRounds) {
      if (collectedRows.length > 0) {
        exitReason = reachedBottom ? 'reached_bottom' : 'no_progress_with_comments';
        break;
      }
      recoveries += 1;
      const refocus = await focusCommentContext('recovery');
      if (refocus?.ok === false) {
        await clearCommentHighlights();
        markActiveDetailFailure(state, refocus.code || 'COMMENTS_CONTEXT_RECOVERY_FAILED', refocus.data || null);
        return refocus;
      }
      commentScroll = refocus?.scrollTarget || commentScroll;
      const scrollSelector = String(commentScroll?.selector || '').trim();
      if (!scrollSelector) {
        await clearCommentHighlights();
        markActiveDetailFailure(state, 'COMMENTS_SCROLL_CONTAINER_MISSING', { stage: 'recovery' });
        return { ok: false, code: 'COMMENTS_SCROLL_CONTAINER_MISSING', message: 'comment scroll container missing before recovery' };
      }
      const preRecoverySnapshot = await readCommentsSnapshot(profileId).catch(() => null);
      if (preRecoverySnapshot?.detailVisible && preRecoverySnapshot?.hasCommentsContext) {
        await applyVisibleLikePass(preRecoverySnapshot);
      }
      for (let i = 0; i < recoveryUpRounds; i += 1) {
        if (commentScroll?.found && commentScroll.center) {
          await highlightStep('xhs-detail-comment-scroll', commentScroll, 'focus', 'comment scroll');
          await clickPoint(profileId, commentScroll.center, { steps: 2 });
          await highlightStep('xhs-detail-comment-scroll', commentScroll, 'processed', 'comment scroll', 4200);
          await sleep(900);
        }
        await scrollBySelector(profileId, scrollSelector, { direction: 'up', amount: 420, highlight: true, skipFocusClick: true, focusTarget: commentScroll });
        await sleep(900);
      }
      for (let i = 0; i < recoveryDownRounds; i += 1) {
        await scrollBySelector(profileId, scrollSelector, { direction: 'down', amount: 420, highlight: true, skipFocusClick: true, focusTarget: commentScroll });
        await sleep(900);
      }
      const scrollDelayAfterRecovery = Math.floor(scrollDelayMinMs + Math.random() * (scrollDelayMaxMs - scrollDelayMinMs + 1));
      await sleep(scrollDelayAfterRecovery);
      const postRecoverySnapshot = await readCommentsSnapshot(profileId).catch(() => null);
      if (postRecoverySnapshot?.detailVisible && postRecoverySnapshot?.hasCommentsContext) {
        await applyVisibleLikePass(postRecoverySnapshot);
      }
      noProgressRounds = 0;
      if (recoveries >= maxRecoveries) {
        exitReason = reachedBottom ? 'reached_bottom' : 'scroll_stalled';
        break;
      }
    } else {
      const deltaRaw = Math.floor(scrollStepMin + Math.random() * (scrollStepMax - scrollStepMin + 1));
      const probe = await focusCommentContext('probe');
      if (probe?.ok === false) {
        await clearCommentHighlights();
        markActiveDetailFailure(state, probe.code || 'COMMENTS_CONTEXT_SCROLL_FAILED', probe.data || null);
        return probe;
      }
      commentScroll = probe?.scrollTarget || commentScroll;
      const scrollSelector = String(commentScroll?.selector || '').trim();
      if (!scrollSelector) {
        await clearCommentHighlights();
        markActiveDetailFailure(state, 'COMMENTS_SCROLL_CONTAINER_MISSING', { stage: 'scroll' });
        return { ok: false, code: 'COMMENTS_SCROLL_CONTAINER_MISSING', message: 'comment scroll container missing before scroll' };
      }
      const viewportScreen = Math.max(
        120,
        Math.floor(
          Number(current?.scroll?.clientHeight || commentScroll?.rect?.height || 0) || 0,
        ) || 120,
      );
      const maxDelta = Math.max(120, viewportScreen - 80);
      const delta = Math.min(deltaRaw, maxDelta);
      await scrollBySelector(profileId, scrollSelector, {
        direction: 'down',
        amount: delta,
        highlight: true,
        skipFocusClick: true,
        focusTarget: commentScroll,
      });
    const scrollDelay = Math.floor(scrollDelayMinMs + Math.random() * (scrollDelayMaxMs - scrollDelayMinMs + 1));
    await sleep(scrollDelay);

    const afterScrollHref = await readLocation(profileId, { timeoutMs: 3000, fallback: '' }).catch(() => '');
    const afterScrollDetailState = await readDetailState(profileId).catch(() => null);
    const afterScrollDetail = await readDetailSnapshot(profileId).catch(() => null);
    emitOperationProgress(context, {
      kind: 'post_scroll_state',
      stage: 'inline_comment_like',
      href: afterScrollHref || afterScrollDetailState?.href || null,
      noteIdFromUrl: afterScrollDetail?.noteIdFromUrl || null,
      detailVisible: Boolean(afterScrollDetail && (afterScrollDetail.noteIdFromUrl || afterScrollDetail.commentsContextAvailable || afterScrollDetail.textPresent || afterScrollDetail.imageCount > 0 || afterScrollDetail.videoPresent)),
      commentsContextAvailable: afterScrollDetail?.commentsContextAvailable === true,
      currentNoteId: state.currentNoteId || null,
    });
    }

    const settle = Math.floor(settleMinMs + Math.random() * (settleMaxMs - settleMinMs + 1));
    await sleep(settle);

    const postScrollSnapshot = await readCommentsSnapshot(profileId).catch(() => null);
    if (postScrollSnapshot?.detailVisible && postScrollSnapshot?.hasCommentsContext) {
      await applyVisibleLikePass(postScrollSnapshot);
    }

    if (rounds >= stallRounds && noProgressRounds >= recoveryNoProgressRounds) {
      exitReason = reachedBottom ? 'reached_bottom' : 'scroll_stalled';
      break;
    }
  }

  state.lastCommentsHarvest = {
    noteId: state.currentNoteId || null,
    commentCount: collectedRows.length,
    expectedCommentsCount: snapshot.expectedCommentsCount,
    comments: collectedRows,
    capturedAt: new Date().toISOString(),
  };

  const finalLikeArtifacts = await persistVisibleLikeArtifacts({
    state,
    params: {
      ...params,
      keyword,
      env,
      outputRoot: params.outputRoot || params.rootDir || params.downloadRoot || '',
    },
    session: inlineLikeSession,
  });
  inlineLikeSummaryPath = finalLikeArtifacts.summaryPath || inlineLikeSummaryPath;
  inlineLikeStatePath = finalLikeArtifacts.likeStatePath || inlineLikeStatePath;

  const { commentsPath, commentsMdPath } = await flushCommentArtifacts(collectedRows, snapshot.expectedCommentsCount);

  const tabBudget = consumeTabBudget(state, totalAdded, {
    tabCount: params.tabCount,
    commentBudget: params.commentBudget,
  });
  const budgetExhausted = tabBudget.exhausted === true;
  const completed = commentsEmpty || reachedBottom || (maxComments > 0 && collectedRows.length >= maxComments);
  const paused = !completed && budgetExhausted;
  const failed = !completed && !paused;

  markDetailSlotProgress(state, params, {
    completed,
    paused,
    failed,
    budgetExhausted,
    reachedBottom,
    commentsEmpty,
    exitReason,
    commentsAdded: totalAdded,
    failureCode: failed ? String(exitReason || 'COMMENTS_HARVEST_INCOMPLETE').trim().toUpperCase() : null,
    failureData: failed ? {
      rounds,
      configuredMaxRounds: maxRounds,
      effectiveMaxRounds,
      recoveries,
      maxRecoveries,
      commentCount: collectedRows.length,
      expectedCommentsCount: snapshot.expectedCommentsCount,
    } : null,
  });

  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeFailed: false,
    lastHarvestSuccessAt: new Date().toISOString(),
    lastHarvestStage: 'comments_harvest',
  };
  emitActionTrace(context, actionTrace, { stage: 'xhs_comments_harvest' });
  await clearCommentHighlights();
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comments_harvest done',
    data: {
      commentsPath,
      commentsMdPath,
      commentsAdded: totalAdded,
      commentsTotal: state.lastCommentsHarvest.comments.length,
      noteId: state.currentNoteId,
      searchCount: 0,
      collected: totalAdded,
      expectedCommentsCount: snapshot.expectedCommentsCount,
      commentCoverageRate: snapshot.expectedCommentsCount ? (state.lastCommentsHarvest.comments.length / snapshot.expectedCommentsCount).toFixed(2) : null,
      recoveries,
      maxRecoveries,
      firstComment: state.lastCommentsHarvest.comments[0] || null,
      reachedBottom,
      exitReason,
      commentsSkippedReason: commentsEmpty ? 'comments_empty' : null,
      rounds,
      configuredMaxRounds: maxRounds,
      maxRounds: effectiveMaxRounds,
      maxRoundsSource: adaptiveMaxRounds ? 'adaptive' : 'params',
      budgetExpectedCommentsCount: snapshot.expectedCommentsCount,
      scroll: snapshot?.scroll || null,
      collectability: snapshot.collectability,
      skippedElements: [],
      fallbackCaptured: {},
      actionTrace,
      tabBudget,
      budgetExhausted,
      paused,
      completed,
      failed,
      hitCount: inlineLikeSession.hitCount,
      liked: inlineLikeSession.likedCount,
      likedCount: inlineLikeSession.likedCount,
      skippedCount: inlineLikeSession.skippedCount,
      alreadyLikedSkipped: inlineLikeSession.alreadyLikedSkipped,
      dedupSkipped: inlineLikeSession.dedupSkipped,
      likedIndexes: inlineLikeSession.likedIndexes,
      skippedIndexes: inlineLikeSession.skippedIndexes,
      alreadyLikedIndexes: inlineLikeSession.alreadyLikedIndexes,
      summaryPath: inlineLikeSummaryPath,
      likeStatePath: inlineLikeStatePath,
      commentsPath,
    },
  };
}

export async function executeCommentMatchOperation({ profileId, params = {} }) {
  const state = getProfileState(profileId);
  const snapshot = await readCommentsSnapshot(profileId);
  const harvested = Array.isArray(state.lastCommentsHarvest?.comments)
    ? state.lastCommentsHarvest.comments
    : null;
  const comments = harvested && harvested.length > 0 ? harvested : (snapshot?.comments || []);
  const keywords = String(params.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const mode = String(params.mode || 'any').trim().toLowerCase();
  const minHits = Math.max(1, Number(params.minHits || 1) || 1);
  let matchCount = 0;
  const matchedIndexes = [];
  const matchedCommentIds = [];
  for (const comment of comments) {
    const text = normalizeInlineText(`${comment.author} ${comment.content}`);
    const hits = keywords.filter((kw) => text.includes(kw)).length;
    const matched = (mode === 'any' && hits > 0)
      || (mode === 'all' && hits >= keywords.length)
      || (mode === 'min' && hits >= minHits);
    if (matched) {
      matchCount += 1;
      if (Number.isFinite(comment.index)) matchedIndexes.push(Number(comment.index));
      if (comment.commentId) matchedCommentIds.push(String(comment.commentId));
    }
  }
  const expected = Number(snapshot?.expectedCommentsCount ?? 0) || 0;
  const totalComments = expected > 0 ? expected : comments.length;
  const matchRate = totalComments > 0 ? matchCount / totalComments : 0;
  const matchRateTarget = Math.max(0, Number(params.matchRateTarget ?? 0.9) || 0.9);
  const matchRateOk = matchRate >= matchRateTarget;
  state.lastCommentMatch = {
    matchCount,
    totalComments,
    expectedCommentsCount: expected || null,
    matchRate,
    matchRateTarget,
    matchRateOk,
    keywords,
    mode,
    minHits,
    matchedIndexes,
    matchedCommentIds,
    source: harvested && harvested.length > 0 ? 'harvested' : 'snapshot',
    capturedAt: new Date().toISOString(),
  };
  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeFailed: false,
    lastHarvestSuccessAt: new Date().toISOString(),
    lastHarvestStage: 'comment_match',
  };
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comment_match done',
    data: {
      matchCount,
      totalComments,
      expectedCommentsCount: expected || null,
      matchRate,
      matchRateTarget,
      matchRateOk,
      mode,
      minHits,
      matchedIndexes,
      matchedCommentIds,
      source: harvested && harvested.length > 0 ? 'harvested' : 'snapshot',
    },
  };
}

export async function executeCommentLikeOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const keywords = String(params.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const maxComments = Math.max(1, Number(params.maxComments || 50) || 50);
  const maxLikesRaw = params.maxLikes ?? params.maxLikesPerRound ?? params.maxLikesCount ?? 5;
  const maxLikesParsed = Number(maxLikesRaw);
  const maxLikes = Number.isFinite(maxLikesParsed)
    ? Math.min(5, Math.max(0, Math.floor(maxLikesParsed)))
    : 5;
  const requireMatchRate = params.requireMatchRate ?? params.minMatchRate ?? null;
  const requiredRate = requireMatchRate === null || requireMatchRate === undefined
    ? null
    : Math.max(0, Number(requireMatchRate) || 0);
  const lastMatch = state.lastCommentMatch || null;
  const matchRate = Number.isFinite(Number(lastMatch?.matchRate))
    ? Number(lastMatch.matchRate)
    : null;
  if (requiredRate !== null && (matchRate === null || matchRate < requiredRate)) {
    markActiveDetailFailure(state, 'MATCH_RATE_GATE', { requiredRate, matchRate });
    return {
      ok: false,
      code: 'MATCH_RATE_GATE',
      message: 'comment like gated by match rate',
      data: { requiredRate, matchRate },
    };
  }

  const matchedIndexes = Array.isArray(lastMatch?.matchedIndexes)
    ? lastMatch.matchedIndexes
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    : [];
  const allowedIndexes = new Set(matchedIndexes);
  if (allowedIndexes.size === 0) {
    markActiveDetailFailure(state, 'NO_MATCHED_COMMENTS', { requiredRate, matchRate, matchedCount: 0 });
    return {
      ok: false,
      code: 'NO_MATCHED_COMMENTS',
      message: 'no matched comments available for like',
      data: { requiredRate, matchRate, matchedCount: 0 },
    };
  }

  const snapshot = await readCommentsSnapshot(profileId);
  const comments = Array.isArray(snapshot?.comments) ? snapshot.comments : [];
  const maxVisit = Math.min(maxComments, comments.length || maxComments);
  let liked = 0;
  let attempted = 0;
  let hitCount = 0;
  let skippedCount = 0;
  let alreadyLikedSkipped = 0;
  let dedupSkipped = 0;
  const likedIndexes = [];
  const skippedIndexes = [];
  const alreadyLikedIndexes = [];
  const seenCommentIds = new Set();

  for (let idx = 0; idx < maxVisit; idx += 1) {
    if (!allowedIndexes.has(idx)) continue;
    if (liked >= maxLikes) break;
    hitCount += 1;
    const commentRow = comments[idx] && typeof comments[idx] === 'object' ? comments[idx] : null;
    const dedupKey = String(commentRow?.commentId || commentRow?.id || `${state.currentNoteId || 'note'}:${idx}`).trim();
    if (seenCommentIds.has(dedupKey)) {
      dedupSkipped += 1;
      skippedCount += 1;
      skippedIndexes.push(idx);
      pushTrace({ kind: 'skip', stage: 'comment_like', index: idx, reason: 'dedup' });
      continue;
    }
    seenCommentIds.add(dedupKey);
    const target = await readLikeTargetByIndex(profileId, idx);
    if (!target?.found || !target?.center) {
      skippedCount += 1;
      skippedIndexes.push(idx);
      pushTrace({ kind: 'skip', stage: 'comment_like', index: idx, reason: 'like_target_missing' });
      continue;
    }
    attempted += 1;
    if (target.liked === true) {
      liked += 1;
      alreadyLikedSkipped += 1;
      alreadyLikedIndexes.push(idx);
      likedIndexes.push(idx);
      pushTrace({ kind: 'skip', stage: 'comment_like', index: idx, reason: 'already_liked', status: target.likeStatus || null });
      continue;
    }
    await clickPoint(profileId, target.center, { steps: 2 });
    pushTrace({ kind: 'click', stage: 'comment_like', index: idx, center: target.center });
    liked += 1;
    likedIndexes.push(idx);
    await sleep(500);
  }

  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeFailed: false,
    lastHarvestSuccessAt: new Date().toISOString(),
    lastHarvestStage: 'comment_like',
  };
  emitActionTrace(context, actionTrace, { stage: 'xhs_comment_like' });
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comment_like done',
    data: {
      liked,
      attempted,
      hitCount,
      likedCount: liked,
      skippedCount,
      alreadyLikedSkipped,
      dedupSkipped,
      maxLikes,
      maxComments,
      matchRate,
      requiredRate,
      matchedCount: allowedIndexes.size,
      likedIndexes,
      skippedIndexes,
      alreadyLikedIndexes,
      commentsPath: state.lastCommentsHarvest?.commentsPath || null,
      keywords,
    },
  };
}

export async function executeCommentReplyOperation({ profileId, params = {}, context = {} }) {
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const replyText = String(params.replyText || '').trim();
  if (!replyText) {
    const state = getProfileState(profileId);
    markActiveDetailFailure(state, 'INVALID_PARAMS', { reason: 'replyText required' });
    return { ok: false, code: 'INVALID_PARAMS', message: 'replyText required' };
  }
  const index = Math.max(0, Number(params.index || 0) || 0);
  let target = await readReplyTargetByIndex(profileId, index);
  if (!target?.found) {
    target = await readReplyTargetByIndex(profileId, index);
  }
  if (!target?.found) {
    const state = getProfileState(profileId);
    markActiveDetailFailure(state, 'REPLY_TARGET_NOT_FOUND', { index });
    return { ok: false, code: 'REPLY_TARGET_NOT_FOUND', message: `Comment index ${index} not found` };
  }
  await clickPoint(profileId, target.center, { steps: 2 });
  pushTrace({ kind: 'click', stage: 'comment_reply', target: 'reply_button', index });
  await sleep(500);
  let inputTarget = await readReplyInputTarget(profileId);
  if (!inputTarget?.found) {
    inputTarget = await readReplyInputTarget(profileId);
  }
  if (!inputTarget?.found) {
    const state = getProfileState(profileId);
    markActiveDetailFailure(state, 'REPLY_INPUT_NOT_FOUND', { index });
    return { ok: false, code: 'REPLY_INPUT_NOT_FOUND', message: 'Reply input not found' };
  }
  await clickPoint(profileId, inputTarget.center, { steps: 2 });
  pushTrace({ kind: 'click', stage: 'comment_reply', target: 'reply_input' });
  await sleep(300);
  await clearAndType(profileId, replyText, 60);
  pushTrace({ kind: 'type', stage: 'comment_reply', length: replyText.length });
  await sleep(500);
  let sendTarget = await readReplySendButtonTarget(profileId);
  if (!sendTarget?.found) {
    sendTarget = await readReplySendButtonTarget(profileId);
  }
  if (!sendTarget?.found) {
    const state = getProfileState(profileId);
    markActiveDetailFailure(state, 'REPLY_SEND_NOT_FOUND', { index });
    return { ok: false, code: 'REPLY_SEND_NOT_FOUND', message: 'Send button not found' };
  }
  await clickPoint(profileId, sendTarget.center, { steps: 2 });
  pushTrace({ kind: 'click', stage: 'comment_reply', target: 'send_button' });
  await sleep(1000);
  const state = getProfileState(profileId);
  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeFailed: false,
    lastHarvestSuccessAt: new Date().toISOString(),
    lastHarvestStage: 'comment_reply',
  };
  emitActionTrace(context, actionTrace, { stage: 'xhs_comment_reply' });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_comment_reply done', data: { replied: true, index, replyText: replyText.slice(0, 100) } };
}

export async function executeExpandRepliesOperation({ profileId, context = {} }) {
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const event = context?.event || {};
  const rawElements = Array.isArray(event.elements) ? event.elements : [];

  const matchesShowMore = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.visible !== true) return false;
    const text = String(node.textSnippet || '').replace(/\s+/g, ' ').trim();
    if (!text || !text.includes('展开') || !text.includes('回复')) return false;
    const classes = Array.isArray(node.classes) ? node.classes : [];
    return classes.includes('show-more') || String(node.selector || '').includes('.show-more');
  };

  let candidates = rawElements
    .filter(matchesShowMore)
    .map((node) => {
      const rect = node.rect || null;
      if (!rect) return null;
      const width = Number(rect.width || 0);
      const height = Number(rect.height || 0);
      if (width <= 1 || height <= 1) return null;
      return {
        path: String(node.path || ''),
        text: String(node.textSnippet || '').replace(/\s+/g, ' ').trim(),
        rect,
        center: {
          x: Math.max(1, Math.round(Number(rect.left || 0) + width / 2)),
          y: Math.max(1, Math.round(Number(rect.top || 0) + height / 2)),
        },
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) {
    const liveTargets = await readExpandReplyTargets(profileId).catch(() => null);
    const scannedLive = Array.isArray(liveTargets?.targets) ? liveTargets.targets.length : 0;
    candidates = Array.isArray(liveTargets?.targets)
      ? liveTargets.targets.map((node) => ({
        path: '',
        text: String(node.text || '').replace(/\s+/g, ' ').trim(),
        rect: node.rect || null,
        center: node.center || null,
      })).filter((node) => node.rect && node.center)
      : [];
    if (candidates.length === 0) {
      return {
        ok: false,
        code: 'EXPAND_REPLIES_NO_TARGETS',
        message: 'no visible show-more targets',
        data: { expanded: 0, scanned: Math.max(rawElements.length, scannedLive) },
      };
    }
  }
  const scanned = Math.max(rawElements.length, candidates.length);

  const dedup = new Map();
  for (const item of candidates) {
    const key = item.path || `${Math.round(item.rect.left || 0)}:${Math.round(item.rect.top || 0)}:${Math.round(item.rect.width || 0)}:${Math.round(item.rect.height || 0)}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  const targets = Array.from(dedup.values()).sort((a, b) => {
    const topDiff = Number(a.rect.top || 0) - Number(b.rect.top || 0);
    if (Math.abs(topDiff) > 1) return topDiff;
    return Number(a.rect.left || 0) - Number(b.rect.left || 0);
  });

  let expanded = 0;
  for (const target of targets) {
    await clickPoint(profileId, target.center, { steps: 2 });
    pushTrace({ kind: 'click', stage: 'expand_replies', text: target.text.slice(0, 60), center: target.center });
    await sleep(350);
    expanded += 1;
  }

  emitActionTrace(context, actionTrace, { stage: 'xhs_expand_replies' });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_expand_replies done', data: { expanded, scanned } };
}
