import { getProfileState } from './state.mjs';
import { emitActionTrace, buildTraceRecorder, emitOperationProgress } from './trace.mjs';
import { buildElementCollectability, normalizeInlineText } from './utils.mjs';
import { readDetailSnapshot, readDetailState } from './detail-ops.mjs';
import { readCommentsSnapshot, readCommentEntryPoint, readCommentTotalTarget, readCommentScrollContainerTarget, readVisibleCommentTarget, readVisibleCommentTargets, readResumeAnchorPairTarget, readLikeTargetByIndex, readReplyTargetByIndex, readReplyInputTarget, readReplySendButtonTarget, readExpandReplyTargets } from './comments-ops.mjs';
import { consumeTabBudget } from './tab-state.mjs';
import { markDetailSlotProgress, readDetailSlotState, writeDetailSlotState } from './detail-slot-state.mjs';
import { resolveXhsOutputContext, mergeCommentsJsonl, writeCommentsMd, writeContentMarkdown, appendLikeStateRows, writeLikeSummary } from './persistence.mjs';
import { clickPoint, sleep, clearAndType, pressKey, scrollBySelector, highlightVisualTarget, clearVisualHighlight, readLocation } from './dom-ops.mjs';

function shouldPauseForTabBudget(state, params = {}, pendingAdded = 0) {
  const tabCount = Math.max(1, Number(params.tabCount || 1) || 1);
  if (tabCount <= 1) return false;
  const rawBudget = Number(params.commentBudget ?? 0);
  const commentBudget = Number.isFinite(rawBudget) ? Math.max(0, rawBudget) : 0;
  if (commentBudget <= 0) return false;
  const tabState = state?.tabState && typeof state.tabState === 'object' ? state.tabState : null;
  const currentIndex = Math.max(1, Math.min(tabCount, Number(tabState?.cursor || 1) || 1));
  const used = Math.max(0, Number(tabState?.used?.[currentIndex - 1] || 0) || 0);
  return used + Math.max(0, Number(pendingAdded || 0) || 0) >= commentBudget;
}

async function ensureDetailInteractionState(profileId, deps = {}) {
  const readDetailSnapshotImpl = typeof deps.readDetailSnapshot === 'function'
    ? deps.readDetailSnapshot
    : readDetailSnapshot;
  const pressKeyImpl = typeof deps.pressKey === 'function' ? deps.pressKey : pressKey;
  const sleepImpl = typeof deps.sleep === 'function' ? deps.sleep : sleep;
  const state = await readDetailSnapshotImpl(profileId).catch(() => null);
  const detailVisible = state && (state.noteIdFromUrl || state.commentsContextAvailable || state.textPresent || state.imageCount > 0 || state.videoPresent);
  if (detailVisible) return { ok: true, escaped: false };
  await pressKeyImpl(profileId, 'Escape');
  await sleepImpl(1200);
  const recovered = await readDetailSnapshotImpl(profileId).catch(() => null);
  const recoveredVisible = recovered && (recovered.noteIdFromUrl || recovered.commentsContextAvailable || recovered.textPresent || recovered.imageCount > 0 || recovered.videoPresent);
  return { ok: Boolean(recoveredVisible), escaped: true };
}

function isUsableCommentFocusTarget(target) {
  return Boolean(target && typeof target === 'object' && target.center);
}

export function resolveCommentFocusTarget({ visibleComment = null, commentTotal = null, commentScroll = null } = {}) {
  if (isUsableCommentFocusTarget(visibleComment)) {
    return {
      ...visibleComment,
      source: 'visible_comment',
      selector: String(visibleComment.selector || '.comment-item').trim() || '.comment-item',
    };
  }
  if (isUsableCommentFocusTarget(commentTotal)) {
    return {
      ...commentTotal,
      source: 'comment_total',
      selector: String(commentTotal.selector || '.total').trim() || '.total',
    };
  }
  if (isUsableCommentFocusTarget(commentScroll)) {
    return {
      ...commentScroll,
      source: 'comment_scroll',
      selector: String(commentScroll.selector || '').trim() || null,
    };
  }
  return null;
}

export async function readXhsRuntimeState(profileId) {
  const state = getProfileState(profileId);
  const binding = resolveRuntimeNoteBinding(state);
  return {
    keyword: state.keyword || null,
    currentNoteId: state.currentNoteId || null,
    expectedNoteId: binding.noteId || null,
    currentTabIndex: binding.tabIndex,
    lastCommentsHarvest: state.lastCommentsHarvest && typeof state.lastCommentsHarvest === 'object' ? state.lastCommentsHarvest : null,
  };
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

function createExpandRepliesAggregate(noteId = null) {
  return {
    noteId: noteId || null,
    capturedAt: null,
    visibleInitial: 0,
    visibleMax: 0,
    distinctSeen: 0,
    clicks: 0,
    scanned: 0,
    maxExpand: 0,
    textsSample: [],
    clickTimeline: [],
    exhaustedTargets: false,
    passes: 0,
  };
}

function mergeExpandRepliesAggregate(aggregate, latest) {
  if (!aggregate || !latest || typeof latest !== 'object') return aggregate;
  const next = aggregate;
  const texts = new Set(Array.isArray(next.textsSample) ? next.textsSample : []);
  if (Array.isArray(latest.textsSample)) {
    for (const text of latest.textsSample) {
      const normalized = String(text || '').trim();
      if (normalized) texts.add(normalized);
    }
  }
  const priorTimelineLength = Array.isArray(next.clickTimeline) ? next.clickTimeline.length : 0;
  const latestTimeline = Array.isArray(latest.clickTimeline)
    ? latest.clickTimeline.map((entry, index) => ({
        ...entry,
        pass: next.passes + 1,
        globalStep: priorTimelineLength + index + 1,
      }))
    : [];
  next.noteId = String(next.noteId || latest.noteId || '').trim() || null;
  if (!next.capturedAt) next.capturedAt = latest.capturedAt || new Date().toISOString();
  if (next.passes === 0) {
    next.visibleInitial = Math.max(0, Number(latest.visibleInitial ?? 0) || 0);
  }
  next.visibleMax = Math.max(next.visibleMax, Math.max(0, Number(latest.visibleMax ?? 0) || 0));
  next.clicks += Math.max(0, Number(latest.clicks ?? latest.showMoreClicks ?? latest.expanded ?? 0) || 0);
  next.scanned += Math.max(0, Number(latest.scanned ?? 0) || 0);
  next.maxExpand = Math.max(next.maxExpand, Math.max(0, Number(latest.maxExpand ?? 0) || 0));
  next.textsSample = Array.from(texts).slice(0, 20);
  next.distinctSeen = next.textsSample.length;
  next.clickTimeline = [...(Array.isArray(next.clickTimeline) ? next.clickTimeline : []), ...latestTimeline];
  next.exhaustedTargets = latest.exhaustedTargets === true;
  next.passes += 1;
  return next;
}

function resolveRuntimeNoteBinding(state, params = {}) {
  const tabState = state?.tabState && typeof state.tabState === 'object' ? state.tabState : {};
  const configuredTabCount = Math.max(1, Number(params.tabCount ?? tabState.tabCount ?? 1) || 1);
  const detailSlots = state?.detailLinkState?.activeByTab && typeof state.detailLinkState.activeByTab === 'object'
    ? state.detailLinkState.activeByTab
    : {};
  const linkSlots = state?.linksState?.byTab && typeof state.linksState.byTab === 'object'
    ? state.linksState.byTab
    : {};
  const explicitTabIndex = Object.prototype.hasOwnProperty.call(params, 'tabIndex')
    ? Math.max(1, Number(params.tabIndex || 1) || 1)
    : null;
  const activeTabIndex = Math.max(1, Number(state?.detailLinkState?.activeTabIndex ?? 0) || 0) || null;
  const cursorTabIndex = Math.max(1, Number(tabState.cursor ?? 1) || 1);
  const currentNoteId = String(state?.currentNoteId || '').trim() || null;
  const currentHref = String(state?.currentHref || '').trim() || null;
  const getDetailSlot = (slotIndex) => {
    const slot = detailSlots[String(slotIndex)];
    return slot && typeof slot === 'object' ? slot : null;
  };
  const getLinkEntry = (slotIndex) => {
    const entry = linkSlots[String(slotIndex)];
    return entry && typeof entry === 'object' ? entry : null;
  };
  const slotMatchesCurrentDetail = (slot) => {
    if (!slot || typeof slot !== 'object') return false;
    const slotNoteId = String(slot.noteId || slot.lastOpenedNoteId || slot.link?.noteId || '').trim() || null;
    const slotHref = String(slot.href || slot.lastOpenedHref || slot.link?.noteUrl || '').trim() || null;
    if (currentNoteId && slotNoteId && slotNoteId === currentNoteId) return true;
    if (currentHref && slotHref && slotHref === currentHref) return true;
    return false;
  };
  let tabIndex = explicitTabIndex || activeTabIndex || cursorTabIndex;
  let detailSlot = getDetailSlot(tabIndex);
  let linkEntry = getLinkEntry(tabIndex);
  const hasBoundLink = Boolean(
    detailSlot?.link
    || detailSlot?.noteId
    || detailSlot?.lastOpenedNoteId
    || linkEntry?.link,
  );
  if (!explicitTabIndex && !hasBoundLink && (currentNoteId || currentHref)) {
    const matchingTabIndex = Array.from({ length: configuredTabCount }, (_, index) => index + 1)
      .find((slotIndex) => slotMatchesCurrentDetail(getDetailSlot(slotIndex)));
    if (matchingTabIndex) {
      tabIndex = matchingTabIndex;
      detailSlot = getDetailSlot(tabIndex);
      linkEntry = getLinkEntry(tabIndex);
    }
  }
  const link = detailSlot?.link && typeof detailSlot.link === 'object'
    ? detailSlot.link
    : (linkEntry?.link && typeof linkEntry.link === 'object' ? linkEntry.link : null);
  const allowGlobalFallback = configuredTabCount <= 1;
  const noteId = String(
    params.noteId
      || detailSlot?.noteId
      || detailSlot?.lastOpenedNoteId
      || link?.noteId
      || (allowGlobalFallback ? state?.currentNoteId : ''),
  ).trim() || null;
  const href = String(
    params.noteUrl
      || detailSlot?.href
      || detailSlot?.lastOpenedHref
      || link?.noteUrl
      || (allowGlobalFallback ? state?.currentHref : ''),
  ).trim() || null;
  return {
    tabIndex,
    tabCount: configuredTabCount,
    noteId,
    href,
    detailSlot,
    linkEntry,
    link,
  };
}

function buildResumeAnchorPair(comments = []) {
  const list = Array.isArray(comments) ? comments : [];
  for (let index = 0; index < list.length - 1; index += 1) {
    const first = list[index];
    const second = list[index + 1];
    const firstContent = String(first?.content || '').replace(/\s+/g, ' ').trim();
    const secondContent = String(second?.content || '').replace(/\s+/g, ' ').trim();
    const firstId = String(first?.commentId || '').trim();
    const secondId = String(second?.commentId || '').trim();
    if (!firstContent && !firstId) continue;
    if (!secondContent && !secondId) continue;
    return {
      first: {
        commentId: firstId || null,
        author: String(first?.author || '').trim() || null,
        content: firstContent || null,
        index: Number.isFinite(Number(first?.index)) ? Number(first.index) : null,
      },
      second: {
        commentId: secondId || null,
        author: String(second?.author || '').trim() || null,
        content: secondContent || null,
        index: Number.isFinite(Number(second?.index)) ? Number(second.index) : null,
      },
      capturedAt: new Date().toISOString(),
    };
  }
  return null;
}

function buildCommentLikeDedupKey(state, row, index) {
  const noteId = String(resolveRuntimeNoteBinding(state).noteId || state?.currentNoteId || '').trim() || 'note';
  const commentId = String(row?.commentId || row?.id || '').trim();
  if (commentId) return `${noteId}:${commentId}`;
  const userId = String(row?.authorId || row?.userId || '').trim();
  const content = String(row?.content || '').replace(/\s+/g, ' ').trim();
  if (userId || content) return `${noteId}:${userId}:${content}`;
  return `${noteId}:idx:${Number(index) || 0}`;
}

async function persistVisibleLikeArtifacts({ state, params, session }) {
  const binding = resolveRuntimeNoteBinding(state, params);
  const boundNoteId = String(binding.noteId || state?.currentNoteId || '').trim() || null;
  const boundHref = String(binding.href || state?.currentHref || '').trim() || null;
  if (!boundNoteId || !session || !Array.isArray(session.stateRows)) {
    return { summaryPath: null, likeStatePath: null };
  }
  const outputCtx = resolveXhsOutputContext({ params, state, noteId: boundNoteId });
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
      noteId: boundNoteId,
      detailUrl: boundHref,
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
  const binding = resolveRuntimeNoteBinding(state, params);
  const boundNoteId = String(binding.noteId || state.currentNoteId || '').trim() || null;
  const boundHref = String(binding.href || state.currentHref || '').trim() || null;
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
    const preLikeNoteId = String(preLikeDetail?.noteIdFromUrl || '').trim() || null;
    emitOperationProgress(context, {
      kind: 'pre_like_state',
      stage: 'inline_comment_like',
      index: idx,
      href: preLikeDetailState?.href || null,
      noteIdFromUrl: preLikeDetail?.noteIdFromUrl || null,
      detailVisible: Boolean(preLikeDetail && (preLikeDetail.noteIdFromUrl || preLikeDetail.commentsContextAvailable || preLikeDetail.textPresent || preLikeDetail.imageCount > 0 || preLikeDetail.videoPresent)),
      commentsContextAvailable: preLikeDetail?.commentsContextAvailable === true,
      currentNoteId: boundNoteId,
      commentPreview: String(row?.content || '').slice(0, 160),
    });
    if (boundNoteId && preLikeNoteId && preLikeNoteId !== boundNoteId) {
      roundSkippedCount += 1;
      session.skippedCount += 1;
      session.skippedIndexes.push(idx);
      pushTrace({ kind: 'skip', stage: 'inline_comment_like', index: idx, reason: 'note_binding_mismatch', expectedNoteId: boundNoteId, actualNoteId: preLikeNoteId });
      continue;
    }
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
          noteId: boundNoteId,
          detailUrl: boundHref,
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
      currentNoteId: boundNoteId,
      commentPreview: String(row?.content || '').slice(0, 160),
    });
    session.processedKeys.add(dedupKey);
    session.hitCount += 1;
    session.likedCount += 1;
    session.likedIndexes.push(idx);
    session.stateRows.push({
      ts: new Date().toISOString(),
        noteId: boundNoteId,
        detailUrl: boundHref,
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
  const testingOverrides = context?.testingOverrides && typeof context.testingOverrides === 'object'
    ? context.testingOverrides
    : null;
  const readDetailSnapshotImpl = typeof testingOverrides?.readDetailSnapshot === 'function'
    ? testingOverrides.readDetailSnapshot
    : readDetailSnapshot;
  const readDetailStateImpl = typeof testingOverrides?.readDetailState === 'function'
    ? testingOverrides.readDetailState
    : readDetailState;
  const readCommentsSnapshotImpl = typeof testingOverrides?.readCommentsSnapshot === 'function'
    ? testingOverrides.readCommentsSnapshot
    : readCommentsSnapshot;
  const readCommentEntryPointImpl = typeof testingOverrides?.readCommentEntryPoint === 'function'
    ? testingOverrides.readCommentEntryPoint
    : readCommentEntryPoint;
  const readCommentTotalTargetImpl = typeof testingOverrides?.readCommentTotalTarget === 'function'
    ? testingOverrides.readCommentTotalTarget
    : readCommentTotalTarget;
  const readCommentScrollContainerTargetImpl = typeof testingOverrides?.readCommentScrollContainerTarget === 'function'
    ? testingOverrides.readCommentScrollContainerTarget
    : readCommentScrollContainerTarget;
  const readVisibleCommentTargetImpl = typeof testingOverrides?.readVisibleCommentTarget === 'function'
    ? testingOverrides.readVisibleCommentTarget
    : readVisibleCommentTarget;
  const readVisibleCommentTargetsImpl = typeof testingOverrides?.readVisibleCommentTargets === 'function'
    ? testingOverrides.readVisibleCommentTargets
    : readVisibleCommentTargets;
  const readResumeAnchorPairTargetImpl = typeof testingOverrides?.readResumeAnchorPairTarget === 'function'
    ? testingOverrides.readResumeAnchorPairTarget
    : readResumeAnchorPairTarget;
  const readLocationImpl = typeof testingOverrides?.readLocation === 'function'
    ? testingOverrides.readLocation
    : readLocation;
  const clickPointImpl = typeof testingOverrides?.clickPoint === 'function' ? testingOverrides.clickPoint : clickPoint;
  const sleepImpl = typeof testingOverrides?.sleep === 'function' ? testingOverrides.sleep : sleep;
  const scrollBySelectorImpl = typeof testingOverrides?.scrollBySelector === 'function'
    ? testingOverrides.scrollBySelector
    : scrollBySelector;
  const highlightVisualTargetImpl = typeof testingOverrides?.highlightVisualTarget === 'function'
    ? testingOverrides.highlightVisualTarget
    : highlightVisualTarget;
  const clearVisualHighlightImpl = typeof testingOverrides?.clearVisualHighlight === 'function'
    ? testingOverrides.clearVisualHighlight
    : clearVisualHighlight;
  const mergeCommentsJsonlImpl = typeof testingOverrides?.mergeCommentsJsonl === 'function'
    ? testingOverrides.mergeCommentsJsonl
    : mergeCommentsJsonl;
  const writeCommentsMdImpl = typeof testingOverrides?.writeCommentsMd === 'function'
    ? testingOverrides.writeCommentsMd
    : writeCommentsMd;
  const readExpectedBinding = () => resolveRuntimeNoteBinding(state, params);
  const progress = (kind, data = {}) => emitOperationProgress(context, {
    stage: 'comments_harvest',
    kind,
    noteId: readExpectedBinding().noteId || state.currentNoteId || null,
    expectedNoteId: readExpectedBinding().noteId || null,
    tabIndex: readExpectedBinding().tabIndex,
    ...data,
  });
  const initialBinding = readExpectedBinding();
  const detailSnapshotBefore = await readDetailSnapshotImpl(profileId).catch(() => null);
  const detailSnapshotNoteId = String(detailSnapshotBefore?.noteIdFromUrl || '').trim() || null;
  const expectedNoteId = String(initialBinding.noteId || '').trim() || null;
  if (expectedNoteId && detailSnapshotNoteId && detailSnapshotNoteId !== expectedNoteId) {
    progress('note_binding_mismatch', {
      actualNoteId: detailSnapshotNoteId,
      actualHref: String(detailSnapshotBefore?.href || '').trim() || null,
      expectedHref: initialBinding.href || null,
    });
    await clearVisualHighlightImpl(profileId, 'xhs-detail-comment-like').catch(() => null);
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_comments_harvest skipped due to note binding mismatch',
      data: {
        commentsPath: null,
        commentsMdPath: null,
        commentsAdded: 0,
        commentsTotal: 0,
        noteId: detailSnapshotNoteId,
        expectedNoteId,
        collected: 0,
        expectedCommentsCount: 0,
        commentCoverageRate: null,
        recoveries: 0,
        maxRecoveries: Math.max(1, Number(params.maxRecoveries ?? 3) || 3),
        reachedBottom: false,
        exitReason: 'note_binding_mismatch',
        commentsSkippedReason: 'note_binding_mismatch',
        rounds: 0,
        maxRounds: Math.max(1, Number(params.maxRounds ?? 1) || 1),
        tabIndex: initialBinding.tabIndex,
      },
    };
  }
  if (detailSnapshotNoteId) {
    state.currentNoteId = detailSnapshotNoteId;
  } else if (expectedNoteId) {
    state.currentNoteId = expectedNoteId;
  }
  state.currentHref = String(detailSnapshotBefore?.href || initialBinding.href || state.currentHref || '').trim() || null;
  const highlightStep = async (channel, target, stateName, label, duration = 2400) => {
    if (!target?.center) return;
    await highlightVisualTargetImpl(profileId, target, {
      channel,
      state: stateName,
      label,
      duration,
    });
  };
  const restoreResumeAnchor = async (mode = 'initial') => {
    const binding = readExpectedBinding();
    const slotState = readDetailSlotState(state, binding.tabIndex, { tabCount: params.tabCount });
    const resumeAnchor = slotState?.resumeAnchor || null;
    if (!resumeAnchor) return { ok: true, restored: false, reason: 'no_resume_anchor' };
    const anchorTarget = await readResumeAnchorPairTargetImpl(profileId, resumeAnchor).catch(() => null);
    progress('resume_anchor_probe', {
      mode,
      restored: anchorTarget?.found === true,
      reason: anchorTarget?.reason || null,
      firstCommentId: resumeAnchor?.first?.commentId || null,
      secondCommentId: resumeAnchor?.second?.commentId || null,
      pairText: anchorTarget?.pairText || null,
    });
    if (!anchorTarget?.found || !anchorTarget?.center) {
      return { ok: true, restored: false, reason: anchorTarget?.reason || 'resume_anchor_not_visible' };
    }
    await highlightStep('xhs-detail-comment-item', anchorTarget, 'focus', 'resume anchor');
    await clickPointImpl(profileId, anchorTarget.center, { steps: 2 });
    await highlightStep('xhs-detail-comment-item', anchorTarget, 'processed', 'resume anchor', 3200);
    await sleepImpl(1200);
    return { ok: true, restored: true, target: anchorTarget };
  };
  const saveResumeAnchor = async (reason = 'loop') => {
    const binding = readExpectedBinding();
    const visibleTargets = await readVisibleCommentTargetsImpl(profileId).catch(() => null);
    const anchor = buildResumeAnchorPair(visibleTargets?.comments || []);
    if (!anchor) {
      progress('resume_anchor_save', { reason, saved: false, visibleCount: Array.isArray(visibleTargets?.comments) ? visibleTargets.comments.length : 0 });
      return null;
    }
    writeDetailSlotState(state, binding.tabIndex, { resumeAnchor: anchor });
    progress('resume_anchor_save', {
      reason,
      saved: true,
      firstCommentId: anchor.first?.commentId || null,
      secondCommentId: anchor.second?.commentId || null,
      firstContent: anchor.first?.content || null,
      secondContent: anchor.second?.content || null,
    });
    return anchor;
  };
  const clearCommentHighlights = async () => {
    await Promise.allSettled([
      clearVisualHighlightImpl(profileId, 'xhs-detail-comment-entry'),
      clearVisualHighlightImpl(profileId, 'xhs-detail-comment-total'),
      clearVisualHighlightImpl(profileId, 'xhs-detail-comment-item'),
      clearVisualHighlightImpl(profileId, 'xhs-detail-comment-scroll'),
      clearVisualHighlightImpl(profileId, 'xhs-detail-comment-like'),
    ]);
  };
  const ensureExpectedDetail = async () => {
    const interactionState = await ensureDetailInteractionState(profileId, {
      readDetailSnapshot: readDetailSnapshotImpl,
      pressKey: testingOverrides?.pressKey,
      sleep: sleepImpl,
    });
    if (!interactionState?.ok) return false;
    const res = await readDetailSnapshotImpl(profileId);
    if (!res) return false;
    const binding = readExpectedBinding();
    const expected = String(binding.noteId || state.currentNoteId || '').trim() || null;
    const actual = String(res.noteIdFromUrl || '').trim() || null;
    if (!actual || !expected) return true;
    return actual === expected;
  };
  const focusCommentContext = async (mode = 'initial', options = {}) => {
    const preferScrollContainerClick = options?.preferScrollContainerClick === true;
    progress('focus_comment_context_start', { mode });
    let commentTotal = await readCommentTotalTargetImpl(profileId);
    let commentScroll = await readCommentScrollContainerTargetImpl(profileId);
    let visibleComment = await readVisibleCommentTargetImpl(profileId);
    progress('focus_comment_context_targets_read', {
      mode,
      commentTotalFound: Boolean(commentTotal?.found && commentTotal?.center),
      commentScrollFound: Boolean(commentScroll?.found && commentScroll?.center),
      visibleCommentFound: Boolean(visibleComment?.found && visibleComment?.center),
      commentScrollSelector: commentScroll?.selector || null,
      visibleCommentSelector: visibleComment?.selector || null,
    });
    let entry = null;
    const hasVisibleComments = Boolean(visibleComment?.found && visibleComment.center);
    const hasCommentTotal = Boolean(commentTotal?.found && commentTotal.center);
    const hasCommentScroll = Boolean(commentScroll?.found && commentScroll.center);
    const hasExistingCommentContext = hasVisibleComments || hasCommentTotal || hasCommentScroll;

    if (hasVisibleComments) {
      await highlightStep('xhs-detail-comment-item', visibleComment, 'matched', 'visible comment');
    }
    if (hasCommentTotal) {
      await highlightStep('xhs-detail-comment-total', commentTotal, 'matched', 'comment total');
    }

    if (!hasExistingCommentContext) {
      entry = await readCommentEntryPointImpl(profileId);
      progress('focus_comment_context_entry_probe', {
        mode,
        entryFound: Boolean(entry?.found && entry?.center),
        reason: entry?.reason || null,
        selector: entry?.selector || null,
      });
      if (entry?.found && entry.center) {
        await highlightStep('xhs-detail-comment-entry', entry, 'matched', 'comment entry');
        const ok = await ensureExpectedDetail();
        if (!ok) {
          return { ok: false, code: 'DETAIL_NOTEID_MISMATCH', message: 'Detail noteId mismatch before comment entry', data: { expected: state.currentNoteId || null } };
        }
        await highlightStep('xhs-detail-comment-entry', entry, 'focus', 'comment entry');
        progress('focus_comment_context_before_entry_click', {
          mode,
          selector: entry.selector || null,
        });
        await clickPointImpl(profileId, entry.center, { steps: 2 });
        await highlightStep('xhs-detail-comment-entry', entry, 'processed', 'comment entry', 4200);
        await sleepImpl(5000);
        progress('focus_comment_context_after_entry_click', { mode });
        commentTotal = await readCommentTotalTargetImpl(profileId);
        commentScroll = await readCommentScrollContainerTargetImpl(profileId);
        visibleComment = await readVisibleCommentTargetImpl(profileId);
        progress('focus_comment_context_targets_reread', {
          mode,
          phase: 'after_entry_click',
          commentTotalFound: Boolean(commentTotal?.found && commentTotal?.center),
          commentScrollFound: Boolean(commentScroll?.found && commentScroll?.center),
          visibleCommentFound: Boolean(visibleComment?.found && visibleComment?.center),
          commentScrollSelector: commentScroll?.selector || null,
          visibleCommentSelector: visibleComment?.selector || null,
        });
      }
    } else if (!hasVisibleComments) {
      progress('focus_comment_context_entry_skip', {
        mode,
        reason: 'existing_comment_context',
        commentTotalFound: hasCommentTotal,
        commentScrollFound: hasCommentScroll,
      });
    }

    const hasVisibleCommentsAfterEntry = Boolean(visibleComment?.found && visibleComment.center);
    const hasCommentTotalAfterEntry = Boolean(commentTotal?.found && commentTotal.center);
    const hasCommentScrollAfterEntry = Boolean(commentScroll?.found && commentScroll.center);
    const hasCommentContextAfterEntry = hasVisibleCommentsAfterEntry || hasCommentTotalAfterEntry || hasCommentScrollAfterEntry;
    const focusTarget = resolveCommentFocusTarget({
      visibleComment,
      commentTotal,
      commentScroll,
    });
    const resolvedFocusTarget = focusTarget || commentScroll;
    const clickableScrollTarget = isUsableCommentFocusTarget(commentScroll)
      ? {
          ...commentScroll,
          source: 'comment_scroll',
          selector: String(commentScroll.selector || '').trim() || null,
      }
      : null;
    progress('focus_comment_context_target_resolved', {
      mode,
      preferScrollContainerClick,
      resolvedSource: resolvedFocusTarget?.source || null,
      resolvedSelector: resolvedFocusTarget?.selector || null,
      clickableScrollSource: clickableScrollTarget?.source || null,
      clickableScrollSelector: clickableScrollTarget?.selector || null,
    });

    if (hasVisibleCommentsAfterEntry) {
      await highlightStep('xhs-detail-comment-item', visibleComment, 'matched', 'visible comment');
    }
    if (hasCommentTotalAfterEntry) {
      await highlightStep('xhs-detail-comment-total', commentTotal, 'matched', 'comment total');
    }

    if (!hasCommentContextAfterEntry) {
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
        const clickableTarget = clickableScrollTarget || resolvedFocusTarget;
        const focusChannel = clickableTarget?.source === 'visible_comment'
          ? 'xhs-detail-comment-item'
          : clickableTarget?.source === 'comment_total'
            ? 'xhs-detail-comment-total'
            : 'xhs-detail-comment-scroll';
        const focusLabel = clickableTarget?.source === 'visible_comment'
          ? 'visible comment'
          : clickableTarget?.source === 'comment_total'
            ? 'comment total'
            : 'comment scroll';
        await highlightStep(focusChannel, clickableTarget, 'focus', focusLabel);
        progress('focus_comment_context_before_focus_click', {
          mode,
          selector: commentScroll.selector || null,
          focusSource: clickableTarget?.source || null,
          focusSelector: clickableTarget?.selector || null,
        });
        await clickPointImpl(profileId, clickableTarget.center, { steps: 2 });
        await highlightStep(focusChannel, clickableTarget, 'processed', focusLabel, 4200);
        await sleepImpl(5000);
        progress('focus_comment_context_after_scroll_focus', {
          mode,
          selector: commentScroll.selector || null,
          focusSource: clickableTarget?.source || 'comment_scroll',
          focusSelector: clickableTarget?.selector || null,
          detectedSource: resolvedFocusTarget?.source || null,
          detectedSelector: resolvedFocusTarget?.selector || null,
        });
      }
      progress('focus_comment_context_done', {
        mode,
        selector: commentScroll.selector || null,
        hasVisibleComment: Boolean(visibleComment?.found && visibleComment.center),
        focusSource: (clickableScrollTarget || resolvedFocusTarget)?.source || 'comment_scroll',
        focusSelector: (clickableScrollTarget || resolvedFocusTarget)?.selector || null,
        detectedSource: resolvedFocusTarget?.source || null,
        detectedSelector: resolvedFocusTarget?.selector || null,
      });
      return {
        ok: true,
        scrollTarget: commentScroll,
        visibleCommentTarget: visibleComment || null,
        focusTarget: resolvedFocusTarget,
        clickedFocusTarget: mode !== 'probe' ? (clickableScrollTarget || resolvedFocusTarget || null) : null,
        didFocusClick: mode !== 'probe',
      };
    }
    progress('focus_comment_context_done', {
      mode,
      selector: null,
      hasVisibleComment: Boolean(visibleComment?.found && visibleComment.center),
    });
    return { ok: true, scrollTarget: null };
  };
  progress('operation_start');
  const interactionState = await ensureDetailInteractionState(profileId, {
    readDetailSnapshot: readDetailSnapshotImpl,
    pressKey: testingOverrides?.pressKey,
    sleep: sleepImpl,
  });
  progress('after_detail_interaction_state', { ok: interactionState?.ok === true });
  if (!interactionState?.ok) {
    await clearCommentHighlights();
    markActiveDetailFailure(state, 'DETAIL_INTERACTION_STATE_INVALID', { stage: 'comments_harvest_start' });
    return { ok: false, code: 'DETAIL_INTERACTION_STATE_INVALID', message: 'detail interaction state invalid before comments harvest' };
  }
  const focusResult = await focusCommentContext('initial');
  progress('after_initial_focus', {
    ok: focusResult?.ok !== false,
    commentsUnavailable: focusResult?.commentsUnavailable === true,
    selector: focusResult?.scrollTarget?.selector || null,
  });
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
  const resumeRestoreResult = await restoreResumeAnchor('initial');
  if (resumeRestoreResult?.ok === false) {
    await clearCommentHighlights();
    markActiveDetailFailure(state, resumeRestoreResult.code || 'RESUME_ANCHOR_RESTORE_FAILED', resumeRestoreResult.data || null);
    return resumeRestoreResult;
  }
  let commentScroll = focusResult?.scrollTarget || null;
  const expandRepliesAggregate = createExpandRepliesAggregate(state.currentNoteId || null);
  const reanchorAfterExpandPass = async ({ phase = 'initial', round = 0, passResult = null } = {}) => {
    const expandedCount = Math.max(0, Number(passResult?.data?.expanded ?? 0) || 0);
    if (expandedCount <= 0) return { ok: true, reanchored: false };
    const refocus = await focusCommentContext(`after_expand_${phase}`, { preferScrollContainerClick: true });
    progress('after_expand_reanchor', {
      phase,
      round,
      ok: refocus?.ok !== false,
      reanchored: refocus?.ok !== false,
      selector: refocus?.scrollTarget?.selector || null,
      focusSource: refocus?.clickedFocusTarget?.source || refocus?.focusTarget?.source || null,
      focusSelector: refocus?.clickedFocusTarget?.selector || refocus?.focusTarget?.selector || null,
      detectedFocusSource: refocus?.focusTarget?.source || null,
      detectedFocusSelector: refocus?.focusTarget?.selector || null,
      expandedCount,
    });
    if (refocus?.ok === false) return refocus;
    if (refocus?.commentsUnavailable === true) {
      return {
        ok: false,
        code: 'COMMENTS_CONTEXT_LOST_AFTER_EXPAND',
        message: 'comments context lost after expanding replies',
        data: { phase, round, expandedCount },
      };
    }
    commentScroll = refocus?.scrollTarget || commentScroll;
    return {
      ok: true,
      reanchored: true,
      scrollTarget: commentScroll,
      focusTarget: refocus?.focusTarget || null,
      clickedFocusTarget: refocus?.clickedFocusTarget || null,
    };
  };
  const runExpandRepliesPass = async ({ phase = 'initial', round = 0 } = {}) => {
    const passResult = await executeExpandRepliesOperation({
      profileId,
      context: {
        ...context,
        event: { count: 12, elements: [] },
      },
    }).catch((error) => ({
      ok: false,
      code: 'EXPAND_REPLIES_FAILED',
      message: error?.message || 'expand replies failed',
      data: null,
    }));
    if (state.lastExpandReplies && typeof state.lastExpandReplies === 'object') {
      mergeExpandRepliesAggregate(expandRepliesAggregate, state.lastExpandReplies);
    }
    progress('expand_replies_pass', {
      phase,
      round,
      ok: passResult?.ok === true || passResult?.code === 'EXPAND_REPLIES_NO_TARGETS',
      code: passResult?.code || null,
      expanded: Math.max(0, Number(passResult?.data?.expanded ?? state.lastExpandReplies?.clicks ?? 0) || 0),
      visibleMax: Math.max(0, Number(passResult?.data?.visibleMax ?? state.lastExpandReplies?.visibleMax ?? 0) || 0),
      clicksTotal: expandRepliesAggregate.clicks,
      passes: expandRepliesAggregate.passes,
    });
    return passResult;
  };
  const initialExpandPass = await runExpandRepliesPass({ phase: 'initial', round: 0 });
  const initialReanchor = await reanchorAfterExpandPass({ phase: 'initial', round: 0, passResult: initialExpandPass });
  if (initialReanchor?.ok === false) {
    await clearCommentHighlights();
    markActiveDetailFailure(state, initialReanchor.code || 'COMMENTS_CONTEXT_LOST_AFTER_EXPAND', initialReanchor.data || null);
    return initialReanchor;
  }
  progress('before_initial_comments_snapshot', {
    selector: commentScroll?.selector || null,
  });
  let snapshot = await readCommentsSnapshotImpl(profileId);
  progress('after_initial_comments_snapshot', {
    hasCommentsContext: snapshot?.hasCommentsContext === true,
    detailVisible: snapshot?.detailVisible === true,
    visibleCount: Array.isArray(snapshot?.comments) ? snapshot.comments.length : 0,
    expectedCommentsCount: Number(snapshot?.expectedCommentsCount ?? 0) || 0,
  });
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
  const scrollStepMin = Math.max(240, Number(params.scrollStepMin ?? params.scrollStep ?? 560) || 560);
  const scrollStepMax = Math.max(scrollStepMin, Number(params.scrollStepMax ?? params.scrollStep ?? 840) || 840);
  const settleMinMs = Math.max(80, Number(params.settleMinMs ?? params.settleMs ?? 280) || 280);
  const settleMaxMs = Math.max(settleMinMs, Number(params.settleMaxMs ?? params.settleMs ?? 820) || 820);
  const scrollDelayMinMs = Math.max(600, Number(params.scrollDelayMinMs ?? params.scrollDelayMs ?? 1200) || 1200);
  const scrollDelayMaxMs = Math.max(scrollDelayMinMs, Number(params.scrollDelayMaxMs ?? params.scrollDelayMs ?? 2200) || 2200);
  const stallRounds = Math.max(1, Number(params.stallRounds ?? 8) || 8);
  const recoveryNoProgressRounds = Math.max(1, Number(params.recoveryNoProgressRounds ?? 3) || 3);
  const recoveryUpRounds = Math.max(3, Number(params.recoveryUpRounds ?? 4) || 4);
  const recoveryDownRounds = Math.max(1, Number(params.recoveryDownRounds ?? 1) || 1);
  const maxRecoveries = Math.max(1, Number(params.maxRecoveries ?? 3) || 3);
  const noChangeTimeoutMs = Math.max(30000, Number(params.noChangeTimeoutMs ?? 30000) || 30000);
  const refocusRetryDelayMs = Math.max(800, Number(params.refocusRetryDelayMs ?? 1200) || 1200);

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
  let lastProgressAt = Date.now();
  let reachedBottom = false;
  let commentsEmpty = false;
  let exitReason = 'harvest_complete';
  let lastExpectedCommentsCount = Number(snapshot?.expectedCommentsCount ?? 0) || 0;
  let lastScrollMeta = snapshot?.scroll && typeof snapshot.scroll === 'object' ? { ...snapshot.scroll } : null;

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
        const merged = await mergeCommentsJsonlImpl({
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
      const mdRes = await writeCommentsMdImpl({
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
    progress('visible_like_pass_start', {
      kind: 'visible_comments_probe',
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
    progress('visible_like_pass_done', {
      hitCount: inlineLikeStats.hitCount,
      likedCount: inlineLikeStats.likedCount,
      skippedCount: inlineLikeStats.skippedCount,
    });
    return inlineLikeStats;
  };

  while (rounds < effectiveMaxRounds) {
    rounds += 1;
    progress('loop_round_start', {
      round: rounds,
      effectiveMaxRounds,
      collectedCount: collectedRows.length,
      noProgressRounds,
      recoveries,
    });
    const loopInteractionState = await ensureDetailInteractionState(profileId, {
      readDetailSnapshot: readDetailSnapshotImpl,
      pressKey: testingOverrides?.pressKey,
      sleep: sleepImpl,
    });
    progress('after_loop_detail_interaction_state', { round: rounds, ok: loopInteractionState?.ok === true });
    if (!loopInteractionState?.ok) {
      await clearCommentHighlights();
      markActiveDetailFailure(state, 'DETAIL_INTERACTION_STATE_INVALID', { stage: 'comments_harvest_loop', commentCount: collectedRows.length });
      return { ok: false, code: 'DETAIL_INTERACTION_STATE_INVALID', message: 'detail interaction state invalid during comments harvest', data: { commentCount: collectedRows.length } };
    }
    if (rounds > 1) {
      const loopExpandPass = await runExpandRepliesPass({ phase: 'loop', round: rounds });
      const loopReanchor = await reanchorAfterExpandPass({ phase: 'loop', round: rounds, passResult: loopExpandPass });
      if (loopReanchor?.ok === false) {
        await clearCommentHighlights();
        markActiveDetailFailure(state, loopReanchor.code || 'COMMENTS_CONTEXT_LOST_AFTER_EXPAND', loopReanchor.data || null);
        return loopReanchor;
      }
    }
    progress('before_loop_comments_snapshot', { round: rounds, firstRound: rounds === 1 });
    const current = rounds === 1 ? snapshot : await readCommentsSnapshotImpl(profileId);
    progress('after_loop_comments_snapshot', {
      round: rounds,
      detailVisible: current?.detailVisible === true,
      hasCommentsContext: current?.hasCommentsContext === true,
      visibleCount: Array.isArray(current?.comments) ? current.comments.length : 0,
      expectedCommentsCount: Number(current?.expectedCommentsCount ?? 0) || 0,
      atBottom: current?.scroll?.atBottom === true,
    });
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
    lastExpectedCommentsCount = expectedCommentsCount;
    lastScrollMeta = current?.scroll && typeof current.scroll === 'object' ? { ...current.scroll } : null;
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
      lastProgressAt = Date.now();
      await flushCommentArtifacts(collectedRows, current.expectedCommentsCount);
      progress('comments_flushed', {
        round: rounds,
        newComments: newComments.length,
        collectedCount: collectedRows.length,
      });
      if (shouldPauseForTabBudget(state, params, totalAdded)) {
        await saveResumeAnchor('tab_budget_reached_after_collect');
        exitReason = 'tab_comment_budget_reached';
        break;
      }
    }

    await applyVisibleLikePass(current);

    const signature = makeSignature(list);
    if (signature && signature === lastSignature) {
      noProgressRounds += 1;
    } else {
      noProgressRounds = 0;
      lastSignature = signature || lastSignature;
      if (signature) lastProgressAt = Date.now();
    }

    if (maxComments > 0 && collectedRows.length >= maxComments) {
      exitReason = 'max_comments_reached';
      break;
    }

    if (shouldPauseForTabBudget(state, params, totalAdded)) {
      await saveResumeAnchor('tab_budget_reached_before_break');
      exitReason = 'tab_comment_budget_reached';
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
      progress('recovery_start', {
        round: rounds,
        noProgressRounds,
        recoveries,
      });
      const noChangeElapsedMs = Date.now() - lastProgressAt;
      if (noChangeElapsedMs < noChangeTimeoutMs) {
        const waitMs = Math.min(2000, Math.max(600, noChangeTimeoutMs - noChangeElapsedMs));
        await sleepImpl(waitMs);
        progress('recovery_wait_before_refocus', { round: rounds, waitMs });
      }
      recoveries += 1;
      let refocus = await focusCommentContext('recovery').catch((error) => ({ ok: false, code: 'COMMENTS_CONTEXT_RECOVERY_CLICK_TIMEOUT', message: error?.message || 'focus comment context failed', data: { reason: 'exception' } }));
      if (refocus?.ok === false) {
        await sleepImpl(refocusRetryDelayMs);
        refocus = { ok: true, scrollTarget: commentScroll || null, degradedRecovery: true, recoveryError: refocus?.message || refocus?.code || 'focus_failed' };
      }
      commentScroll = refocus?.scrollTarget || commentScroll;
      progress('recovery_after_refocus', {
        round: rounds,
        selector: commentScroll?.selector || null,
        degradedRecovery: refocus?.degradedRecovery === true,
      });
      const scrollSelector = String(commentScroll?.selector || '').trim();
      if (!scrollSelector) {
        await clearCommentHighlights();
        markActiveDetailFailure(state, 'COMMENTS_SCROLL_CONTAINER_MISSING', { stage: 'recovery' });
        return { ok: false, code: 'COMMENTS_SCROLL_CONTAINER_MISSING', message: 'comment scroll container missing before recovery' };
      }
      const preRecoverySnapshot = await readCommentsSnapshotImpl(profileId).catch(() => null);
      progress('recovery_pre_snapshot', {
        round: rounds,
        hasCommentsContext: preRecoverySnapshot?.hasCommentsContext === true,
        detailVisible: preRecoverySnapshot?.detailVisible === true,
      });
      if (preRecoverySnapshot?.detailVisible && preRecoverySnapshot?.hasCommentsContext) {
        await applyVisibleLikePass(preRecoverySnapshot);
      }
      for (let i = 0; i < recoveryUpRounds; i += 1) {
        progress('recovery_scroll_up', { round: rounds, step: i + 1, total: recoveryUpRounds });
        await scrollBySelectorImpl(profileId, scrollSelector, { direction: 'up', amount: 420, highlight: true, skipFocusClick: true, focusTarget: commentScroll });
        await sleepImpl(900);
      }
      for (let i = 0; i < recoveryDownRounds; i += 1) {
        progress('recovery_scroll_down', { round: rounds, step: i + 1, total: recoveryDownRounds });
        await scrollBySelectorImpl(profileId, scrollSelector, { direction: 'down', amount: 420, highlight: true, skipFocusClick: true, focusTarget: commentScroll });
        await sleepImpl(900);
      }
      const scrollDelayAfterRecovery = Math.floor(scrollDelayMinMs + Math.random() * (scrollDelayMaxMs - scrollDelayMinMs + 1));
      await sleepImpl(scrollDelayAfterRecovery);
      const postRecoverySnapshot = await readCommentsSnapshotImpl(profileId).catch(() => null);
      progress('recovery_post_snapshot', {
        round: rounds,
        hasCommentsContext: postRecoverySnapshot?.hasCommentsContext === true,
        detailVisible: postRecoverySnapshot?.detailVisible === true,
        visibleCount: Array.isArray(postRecoverySnapshot?.comments) ? postRecoverySnapshot.comments.length : 0,
      });
      if (postRecoverySnapshot?.detailVisible && postRecoverySnapshot?.hasCommentsContext) {
        await applyVisibleLikePass(postRecoverySnapshot);
        const postSignature = makeSignature(Array.isArray(postRecoverySnapshot.comments) ? postRecoverySnapshot.comments : []);
        if (postSignature && postSignature !== lastSignature) {
          lastSignature = postSignature;
          lastProgressAt = Date.now();
          noProgressRounds = 0;
        } else if ((Date.now() - lastProgressAt) >= noChangeTimeoutMs && recoveries >= maxRecoveries) {
          exitReason = reachedBottom ? 'reached_bottom' : 'scroll_stalled_after_recovery';
          break;
        }
      }
      if ((Date.now() - lastProgressAt) >= noChangeTimeoutMs && recoveries >= maxRecoveries) {
        exitReason = reachedBottom ? 'reached_bottom' : 'scroll_stalled_after_recovery';
        break;
      }
    } else {
      const deltaRaw = Math.floor(scrollStepMin + Math.random() * (scrollStepMax - scrollStepMin + 1));
      progress('before_scroll_probe', { round: rounds, deltaRaw });
      const probe = await focusCommentContext('probe');
      progress('after_scroll_probe', {
        round: rounds,
        ok: probe?.ok !== false,
        selector: probe?.scrollTarget?.selector || null,
      });
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
      const maxDelta = Math.max(240, Math.floor(viewportScreen * 0.95));
      const delta = Math.min(deltaRaw, maxDelta);
      progress('before_scroll_action', {
        round: rounds,
        selector: scrollSelector,
        delta,
        viewportScreen,
      });
      await scrollBySelectorImpl(profileId, scrollSelector, {
        direction: 'down',
        amount: delta,
        highlight: true,
        focusTarget: commentScroll,
      });
    progress('after_scroll_action', { round: rounds, selector: scrollSelector, delta });
    const scrollDelay = Math.floor(scrollDelayMinMs + Math.random() * (scrollDelayMaxMs - scrollDelayMinMs + 1));
    await sleepImpl(scrollDelay);
    progress('after_scroll_delay', { round: rounds, scrollDelay });

    const afterScrollHref = await readLocationImpl(profileId, { timeoutMs: 3000, fallback: '' }).catch(() => '');
    const afterScrollDetailState = await readDetailStateImpl(profileId).catch(() => null);
    const afterScrollDetail = await readDetailSnapshotImpl(profileId).catch(() => null);
    progress('post_scroll_state', {
      kind: 'post_scroll_state',
      href: afterScrollHref || afterScrollDetailState?.href || null,
      noteIdFromUrl: afterScrollDetail?.noteIdFromUrl || null,
      detailVisible: Boolean(afterScrollDetail && (afterScrollDetail.noteIdFromUrl || afterScrollDetail.commentsContextAvailable || afterScrollDetail.textPresent || afterScrollDetail.imageCount > 0 || afterScrollDetail.videoPresent)),
      commentsContextAvailable: afterScrollDetail?.commentsContextAvailable === true,
      currentNoteId: state.currentNoteId || null,
    });
    }

    const settle = Math.floor(settleMinMs + Math.random() * (settleMaxMs - settleMinMs + 1));
    await sleepImpl(settle);
    progress('after_settle_delay', { round: rounds, settle });

    const postScrollSnapshot = await readCommentsSnapshotImpl(profileId).catch(() => null);
    progress('after_post_scroll_snapshot', {
      round: rounds,
      hasCommentsContext: postScrollSnapshot?.hasCommentsContext === true,
      detailVisible: postScrollSnapshot?.detailVisible === true,
      visibleCount: Array.isArray(postScrollSnapshot?.comments) ? postScrollSnapshot.comments.length : 0,
    });
    if (postScrollSnapshot?.detailVisible && postScrollSnapshot?.hasCommentsContext) {
      await applyVisibleLikePass(postScrollSnapshot);
    }

    if (rounds >= stallRounds && noProgressRounds >= recoveryNoProgressRounds && (Date.now() - lastProgressAt) >= noChangeTimeoutMs) {
      exitReason = reachedBottom ? 'reached_bottom' : 'scroll_stalled_after_recovery';
      break;
    }
  }

  if (rounds >= effectiveMaxRounds && exitReason === 'harvest_complete') {
    const expectedForCompletion = Math.max(0, Number(lastExpectedCommentsCount || 0) || 0);
    const collectedCount = collectedRows.length;
    const coverageRate = expectedForCompletion > 0 ? (collectedCount / expectedForCompletion) : null;
    const coverageEnough = expectedForCompletion > 0 && coverageRate >= 0.9;
    const noCommentsExpected = expectedForCompletion === 0;
    const scrollAtBottom = lastScrollMeta?.atBottom === true;
    if (coverageEnough) {
      exitReason = 'coverage_satisfied';
      reachedBottom = scrollAtBottom;
    } else if (noCommentsExpected) {
      exitReason = 'comments_empty';
      commentsEmpty = true;
    } else if (scrollAtBottom) {
      exitReason = 'reached_bottom';
      reachedBottom = true;
    } else {
      exitReason = 'max_rounds_reached';
    }
  }

  state.lastCommentsHarvest = {
    noteId: state.currentNoteId || null,
    commentCount: collectedRows.length,
    expectedCommentsCount: lastExpectedCommentsCount,
    comments: collectedRows,
    showMore: expandRepliesAggregate.passes > 0
      ? { ...expandRepliesAggregate }
      : null,
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

  const { commentsPath, commentsMdPath } = await flushCommentArtifacts(collectedRows, lastExpectedCommentsCount);

  const tabBudget = consumeTabBudget(state, totalAdded, {
    tabCount: params.tabCount,
    commentBudget: params.commentBudget,
  });
  const budgetExhausted = tabBudget.exhausted === true;
  const completed = commentsEmpty
    || reachedBottom
    || exitReason === 'coverage_satisfied'
    || (maxComments > 0 && collectedRows.length >= maxComments);
  const paused = !completed && budgetExhausted;
  const failed = !completed && !paused;

  if (paused) {
    await saveResumeAnchor('final_pause');
  } else if (completed || failed) {
    writeDetailSlotState(state, readExpectedBinding().tabIndex, { resumeAnchor: null });
  }

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
      expectedCommentsCount: lastExpectedCommentsCount,
    } : null,
  });

  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeFailed: false,
    lastHarvestSuccessAt: new Date().toISOString(),
    lastHarvestStage: 'comments_harvest',
  };
  emitActionTrace(context, actionTrace, { stage: 'xhs_comments_harvest' });
  progress('operation_done', {
    commentsAdded: totalAdded,
    commentsTotal: state.lastCommentsHarvest.comments.length,
    rounds,
    exitReason,
    reachedBottom,
    commentsEmpty,
  });
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
      expectedCommentsCount: lastExpectedCommentsCount,
      commentCoverageRate: lastExpectedCommentsCount ? (state.lastCommentsHarvest.comments.length / lastExpectedCommentsCount).toFixed(2) : null,
      showMore: state.lastCommentsHarvest.showMore || null,
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
      budgetExpectedCommentsCount: lastExpectedCommentsCount,
      scroll: lastScrollMeta || null,
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
  const state = getProfileState(profileId);
  const event = context?.event || {};
  const rawElements = Array.isArray(event.elements) ? event.elements : [];
  const testingOverrides = context?.testingOverrides && typeof context.testingOverrides === 'object'
    ? context.testingOverrides
    : null;
  const readExpandReplyTargetsImpl = typeof testingOverrides?.readExpandReplyTargets === 'function'
    ? testingOverrides.readExpandReplyTargets
    : readExpandReplyTargets;
  const clickPointImpl = typeof testingOverrides?.clickPoint === 'function'
    ? testingOverrides.clickPoint
    : clickPoint;
  const sleepImpl = typeof testingOverrides?.sleep === 'function'
    ? testingOverrides.sleep
    : sleep;

  const buildTargetKey = (target) => {
    if (!target || typeof target !== 'object') return '';
    const rect = target.rect || {};
    const path = String(target.path || '').trim();
    const text = String(target.text || '').replace(/\s+/g, ' ').trim();
    if (path) return `${path}::${text}`;
    return [
      Math.round(Number(rect.left || 0)),
      Math.round(Number(rect.top || 0)),
      Math.round(Number(rect.width || 0)),
      Math.round(Number(rect.height || 0)),
      text,
    ].join(':');
  };

  const normalizeTargets = (targets) => {
    const dedup = new Map();
    for (const target of Array.isArray(targets) ? targets : []) {
      if (!target || typeof target !== 'object') continue;
      const rect = target.rect || null;
      const center = target.center || null;
      if (!rect || !center) continue;
      const width = Number(rect.width || 0);
      const height = Number(rect.height || 0);
      if (width <= 1 || height <= 1) continue;
      const text = String(target.text || '').replace(/\s+/g, ' ').trim();
      const normalized = {
        path: String(target.path || ''),
        text,
        rect,
        center,
      };
      const key = buildTargetKey(normalized);
      if (!key || dedup.has(key)) continue;
      dedup.set(key, normalized);
    }
    return Array.from(dedup.values()).sort((a, b) => {
      const topDiff = Number(a.rect.top || 0) - Number(b.rect.top || 0);
      if (Math.abs(topDiff) > 1) return topDiff;
      return Number(a.rect.left || 0) - Number(b.rect.left || 0);
    });
  };

  const matchesShowMore = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.visible !== true) return false;
    const text = String(node.textSnippet || '').replace(/\s+/g, ' ').trim();
    if (!text || !text.includes('展开') || !text.includes('回复')) return false;
    const classes = Array.isArray(node.classes) ? node.classes : [];
    return classes.includes('show-more') || String(node.selector || '').includes('.show-more');
  };

  const rawCandidates = rawElements
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
  let scanned = rawElements.length;
  const clickedKeys = new Set();
  const maxExpand = Math.max(1, Math.min(24, Number(event.count || rawCandidates.length || 12) || 12));
  const initialCandidates = normalizeTargets(rawCandidates);
  let observedCandidates = initialCandidates;
  const visibleInitial = initialCandidates.length;
  let visibleMax = visibleInitial;
  const distinctSeenKeys = new Set(initialCandidates.map((target) => buildTargetKey(target)).filter(Boolean));
  const textsSeen = new Set(initialCandidates.map((target) => String(target.text || '').trim()).filter(Boolean));
  const clickTimeline = [];

  let expanded = 0;
  for (let step = 1; step <= maxExpand; step += 1) {
    const liveTargets = await readExpandReplyTargetsImpl(profileId).catch(() => null);
    const liveCandidates = normalizeTargets(Array.isArray(liveTargets?.targets)
      ? liveTargets.targets.map((node) => ({
        path: '',
        text: String(node.text || '').replace(/\s+/g, ' ').trim(),
        rect: node.rect || null,
        center: node.center || null,
      }))
      : []);
    scanned = Math.max(scanned, Array.isArray(liveTargets?.targets) ? liveTargets.targets.length : 0, liveCandidates.length);
    visibleMax = Math.max(visibleMax, liveCandidates.length);
    if (liveCandidates.length > 0) observedCandidates = liveCandidates;
    for (const candidate of liveCandidates) {
      const key = buildTargetKey(candidate);
      if (key) distinctSeenKeys.add(key);
      if (candidate?.text) textsSeen.add(String(candidate.text).trim());
    }
    const fallbackCandidates = observedCandidates.filter((candidate) => !clickedKeys.has(buildTargetKey(candidate)));
    const target = [...liveCandidates, ...fallbackCandidates]
      .find((candidate) => !clickedKeys.has(buildTargetKey(candidate)));

    if (!target) {
      state.lastExpandReplies = {
        noteId: state.currentNoteId || null,
        capturedAt: new Date().toISOString(),
        visibleInitial,
        visibleMax,
        distinctSeen: textsSeen.size,
        clicks: expanded,
        scanned,
        maxExpand,
        textsSample: Array.from(textsSeen).slice(0, 20),
        clickTimeline,
        exhaustedTargets: true,
      };
      if (expanded === 0) {
        return {
          ok: false,
          code: 'EXPAND_REPLIES_NO_TARGETS',
          message: 'no visible show-more targets',
          data: {
            expanded: 0,
            scanned,
            visibleInitial,
            visibleMax,
            distinctSeen: textsSeen.size,
            showMoreClicks: 0,
            textsSample: Array.from(textsSeen).slice(0, 20),
            clickTimeline,
          },
        };
      }
      break;
    }

    const targetKey = buildTargetKey(target);
    const beforeVisible = liveCandidates.length;
    clickedKeys.add(targetKey);
    await clickPointImpl(profileId, target.center, { steps: 2 });
    pushTrace({ kind: 'click', stage: 'expand_replies', text: target.text.slice(0, 60), center: target.center });
    await sleepImpl(350);
    expanded += 1;
    const afterTargets = await readExpandReplyTargetsImpl(profileId).catch(() => null);
    const afterCandidates = normalizeTargets(Array.isArray(afterTargets?.targets)
      ? afterTargets.targets.map((node) => ({
        path: '',
        text: String(node.text || '').replace(/\s+/g, ' ').trim(),
        rect: node.rect || null,
        center: node.center || null,
      }))
      : []);
    if (afterCandidates.length > 0) observedCandidates = afterCandidates;
    visibleMax = Math.max(visibleMax, afterCandidates.length);
    for (const candidate of afterCandidates) {
      const key = buildTargetKey(candidate);
      if (key) distinctSeenKeys.add(key);
      if (candidate?.text) textsSeen.add(String(candidate.text).trim());
    }
    clickTimeline.push({
      step,
      targetKey,
      text: String(target.text || '').slice(0, 120),
      beforeVisible,
      afterVisible: afterCandidates.length,
    });
  }

  state.lastExpandReplies = {
    noteId: state.currentNoteId || null,
    capturedAt: new Date().toISOString(),
    visibleInitial,
    visibleMax,
    distinctSeen: textsSeen.size,
    clicks: expanded,
    scanned,
    maxExpand,
    textsSample: Array.from(textsSeen).slice(0, 20),
    clickTimeline,
    exhaustedTargets: expanded < maxExpand,
  };

  emitActionTrace(context, actionTrace, { stage: 'xhs_expand_replies' });
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_expand_replies done',
    data: {
      expanded,
      scanned,
      visibleInitial,
      visibleMax,
      distinctSeen: textsSeen.size,
      showMoreClicks: expanded,
      textsSample: Array.from(textsSeen).slice(0, 20),
      clickTimeline,
    },
  };
}
