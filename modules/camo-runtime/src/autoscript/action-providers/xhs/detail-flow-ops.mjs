import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitActionTrace } from './trace.mjs';
import { sleep, readLocation, clickPoint } from './dom-ops.mjs';
import { readSearchCandidateByNoteId, ensureSearchCandidateFullyVisible } from './search-ops.mjs';
import { getCurrentTabIndex, getOrAssignLinkForTab, readActiveLinkForTab, writeTabSlotState, requeueTabLinkToTail, markTabLinkDone } from './tab-state.mjs';
import { readDetailSlotState, shouldCloseCurrentDetail, shouldReuseDetailForCurrentTab, writeDetailSlotState } from './detail-slot-state.mjs';
import { isDetailVisible, readDetailCloseTarget, closeDetailToSearch, readDetailSnapshot } from './detail-ops.mjs';

const XHS_DISCOVER_URL = 'https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend';

function extractNoteIdFromUrl(rawUrl) {
  const text = String(rawUrl || '').trim();
  if (!text) return null;
  const matched = text.match(/\/explore\/([^/?#]+)/i);
  return matched?.[1] ? String(matched[1]).trim() || null : null;
}

async function settleOpenedDetailState(profileId, params = {}, pushTrace, expectedNoteId = null) {
  const pollMin = Math.max(120, Number(params.pollDelayMinMs ?? 160) || 160);
  const pollMax = Math.max(pollMin, Number(params.pollDelayMaxMs ?? 320) || 320);
  const minObserveMs = Math.max(700, Math.min(2500, Number(params.postOpenDelayMinMs ?? 1200) || 1200));
  const maxObserveMs = Math.max(minObserveMs, Math.min(6000, Number(params.postOpenDelayMaxMs ?? 3000) || 3000));
  const startedAt = Date.now();
  const deadline = startedAt + maxObserveMs;
  let stableReads = 0;
  let lastKey = '';
  let lastHref = null;
  let lastNoteId = null;
  let lastSnapshot = null;

  while (Date.now() <= deadline) {
    const snapshot = await readDetailSnapshot(profileId).catch(() => null);
    const href = String(snapshot?.href || await readLocation(profileId).catch(() => '') || '').trim() || null;
    const noteId = String(snapshot?.noteIdFromUrl || extractNoteIdFromUrl(href) || '').trim() || null;
    const key = `${noteId || ''}|${href || ''}`;
    if (key && key === lastKey) {
      stableReads += 1;
    } else {
      stableReads = 1;
      lastKey = key;
    }
    if (href !== lastHref || noteId !== lastNoteId) {
      pushTrace({
        kind: 'observe',
        stage: 'open_detail_settle',
        href,
        noteId,
        expectedNoteId: expectedNoteId || null,
        stableReads,
      });
    }
    lastHref = href;
    lastNoteId = noteId;
    lastSnapshot = snapshot && typeof snapshot === 'object'
      ? { ...snapshot, href, noteIdFromUrl: noteId }
      : { href, noteIdFromUrl: noteId };
    const elapsedMs = Date.now() - startedAt;
    if (noteId && stableReads >= 2 && elapsedMs >= minObserveMs) {
      break;
    }
    const waitMs = Math.floor(pollMin + Math.random() * Math.max(1, pollMax - pollMin + 1));
    await sleep(waitMs);
  }

  return {
    href: lastHref,
    noteIdFromUrl: lastNoteId,
    snapshot: lastSnapshot,
  };
}

async function waitForDetailClose(profileId, attempts = 6, minMs = 220, maxMs = 520) {
  let lastVisible = await isDetailVisible(profileId).catch(() => null);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!lastVisible?.detailVisible) return { closed: true, visible: lastVisible, attempts: attempt };
    const waitMs = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
    await sleep(waitMs);
    lastVisible = await isDetailVisible(profileId).catch(() => null);
  }
  return { closed: !lastVisible?.detailVisible, visible: lastVisible, attempts };
}

function isDirectDetailUrl(rawUrl) {
  const text = String(rawUrl || '').trim();
  if (!text) return false;
  return /\/explore\/[^/?#]+/i.test(text);
}

function resolveReturnUrl(candidateUrl) {
  const text = String(candidateUrl || '').trim();
  if (text && !isDirectDetailUrl(text)) return text;
  return XHS_DISCOVER_URL;
}

function markOpenFailure(state, requeue) {
  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeFailed: true,
    lastFailureCode: 'DETAIL_NOT_VISIBLE',
    lastFailureAt: new Date().toISOString(),
    lastRequeue: requeue,
  };
}

async function waitForLinkOpenGate(state, params, pushTrace) {
  const minMs = Math.max(2000, Number(params.preClickDelayMinMs ?? 2000) || 2000);
  const maxMs = Math.max(5000, minMs, Number(params.preClickDelayMaxMs ?? 5000) || 5000);
  const targetGapMs = Math.floor(minMs + Math.random() * Math.max(1, maxMs - minMs + 1));
  const lastAttemptAt = Date.parse(String(state?.detailLinkState?.lastOpenAttemptAt || ''));
  const elapsedMs = Number.isFinite(lastAttemptAt) ? Math.max(0, Date.now() - lastAttemptAt) : Number.POSITIVE_INFINITY;
  const waitMs = Number.isFinite(elapsedMs) ? Math.max(0, targetGapMs - elapsedMs) : targetGapMs;
  if (waitMs > 0) {
    pushTrace({ kind: 'wait', stage: 'open_detail_link_gate', waitMs, targetGapMs });
    await sleep(waitMs);
  }
  state.detailLinkState = {
    ...(state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    lastOpenAttemptAt: new Date().toISOString(),
  };
}

export async function executeOpenDetailOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const mode = String(params.mode || '').trim() || 'single';
  const collectMode = mode === 'collect';
  if (collectMode) {
    return { ok: false, code: 'INVALID_MODE', message: 'collect mode must use xhs_collect_links' };
  }

  const noteId = String(params.noteId || '').trim() || null;
  const noteUrl = String(params.noteUrl || '').trim() || null;
  const useLinks = String(params.openByLinks || '').toLowerCase() === 'true' || params.openByLinks === true;
  const modeNext = mode === 'next';
  let effectiveNoteUrl = noteUrl;
  let assignedLink = null;
  let currentTabIndex = null;
  let slotState = null;

  if (useLinks) {
    currentTabIndex = getCurrentTabIndex(state, { tabCount: params.tabCount });
    slotState = readDetailSlotState(state, currentTabIndex, { tabCount: params.tabCount });
  }

  if (useLinks && !effectiveNoteUrl) {
    const link = await getOrAssignLinkForTab(state, params, currentTabIndex);
    assignedLink = link;
    slotState = readDetailSlotState(state, currentTabIndex, { tabCount: params.tabCount });
    if (!link?.noteUrl) {
      throw new Error('AUTOSCRIPT_DONE_DETAIL_LINKS_EXHAUSTED');
    }
    effectiveNoteUrl = String(link.noteUrl)
      .replace('/search_result/', '/explore/')
      .replace(/([?&]source=)[^&#]*/i, '$1web_explore_feed');
  }

  if (effectiveNoteUrl && !String(effectiveNoteUrl).includes('xsec_token=')) {
    return { ok: false, code: 'MISSING_XSEC_TOKEN', message: 'detail url missing xsec_token' };
  }

  if (!noteId && !effectiveNoteUrl) {
    return { ok: false, code: 'INVALID_PARAMS', message: 'noteId or noteUrl required in single mode' };
  }

  const beforeUrl = await readLocation(profileId);
  const detailVisible = await isDetailVisible(profileId);
  const detailSnapshotBefore = detailVisible?.detailVisible ? await readDetailSnapshot(profileId).catch(() => null) : null;
  const currentMatchesTargetLink = Boolean(
    useLinks
      && detailVisible?.detailVisible === true
      && beforeUrl
      && effectiveNoteUrl
      && String(beforeUrl) === String(effectiveNoteUrl),
  );
  const shouldReuseOpenDetail = useLinks
    && detailVisible?.detailVisible === true
    && (
      currentMatchesTargetLink
      || (
        shouldReuseDetailForCurrentTab(state, { tabCount: params.tabCount, openByLinks: true })
        && (
          (slotState?.lastOpenedNoteId && detailSnapshotBefore?.noteIdFromUrl && String(slotState.lastOpenedNoteId) === String(detailSnapshotBefore.noteIdFromUrl))
          || (slotState?.lastOpenedHref && beforeUrl && String(slotState.lastOpenedHref) === String(beforeUrl))
        )
      )
    );

  if (detailVisible?.detailVisible === true && !useLinks) {
    await closeDetailToSearch(profileId, pushTrace);
    await sleep(300);
  }

  if (effectiveNoteUrl) {
    if (!shouldReuseOpenDetail) {
      if (useLinks) {
        await waitForLinkOpenGate(state, params, pushTrace);
      }
      await callAPI('goto', { profileId, url: effectiveNoteUrl });
      const pollMin = Math.max(80, Number(params.pollDelayMinMs ?? 120) || 120);
      const pollMax = Math.max(pollMin, Number(params.pollDelayMaxMs ?? 240) || 240);
      const attempts = Math.max(4, Number(params.openByLinksMaxAttempts ?? params.openDetailMaxAttempts ?? 8) || 8);
      let opened = await isDetailVisible(profileId);
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (opened?.detailVisible) break;
        const waitMs = Math.floor(pollMin + Math.random() * (pollMax - pollMin + 1));
        await sleep(waitMs);
        opened = await isDetailVisible(profileId);
      }
      if (!opened?.detailVisible) {
        if (useLinks) {
          const requeueTabIndex = currentTabIndex || getCurrentTabIndex(state, { tabCount: params.tabCount });
          const requeue = requeueTabLinkToTail(state, params, requeueTabIndex, {
            reason: 'open_detail_failed',
            code: 'DETAIL_NOT_VISIBLE',
            mode: modeNext ? 'next' : mode,
            url: effectiveNoteUrl || null,
          });
          markOpenFailure(state, requeue);
        }
        return { ok: false, code: 'DETAIL_NOT_VISIBLE', message: 'detail not visible after open-by-links' };
      }
    } else {
      pushTrace({
        kind: 'reuse',
        stage: 'open_detail',
        noteId: slotState?.lastOpenedNoteId || slotState?.noteId || null,
        url: beforeUrl || effectiveNoteUrl || null,
      });
    }
  } else {
    const candidate = await readSearchCandidateByNoteId(profileId, noteId);
    if (!candidate?.found) {
      return { ok: false, code: 'NOTE_NOT_FOUND', message: `Note ${noteId} not in viewport` };
    }
    if (!candidate.inViewport) {
      await ensureSearchCandidateFullyVisible(profileId, noteId);
    }
    await clickPoint(profileId, candidate.center, { steps: 3 });
    pushTrace({ kind: 'click', stage: 'open_detail', noteId, selector: candidate.selector, attempt: 1 });
    await sleep(1500);
    const opened = await isDetailVisible(profileId);
    if (!opened?.detailVisible) {
      const retryCandidate = await readSearchCandidateByNoteId(profileId, noteId);
      if (retryCandidate?.found && retryCandidate.center) {
        await clickPoint(profileId, retryCandidate.center, { steps: 3 });
        pushTrace({ kind: 'click', stage: 'open_detail_retry', noteId, selector: retryCandidate.selector, attempt: 2 });
        await sleep(1500);
      }
    }
  }

  const afterUrl = await readLocation(profileId);
  const activeEntry = useLinks
    ? readActiveLinkForTab(state, currentTabIndex || getCurrentTabIndex(state, { tabCount: params.tabCount }))
    : null;
  const expectedNoteId = String(noteId || activeEntry?.link?.noteId || assignedLink?.noteId || '').trim() || null;
  const settled = await settleOpenedDetailState(profileId, params, pushTrace, expectedNoteId);
  const detailSnapshot = settled.snapshot || await readDetailSnapshot(profileId).catch(() => null);
  const resolvedHref = settled.href || afterUrl || effectiveNoteUrl || null;
  const resolvedNoteId = noteId || detailSnapshot?.noteIdFromUrl || extractNoteIdFromUrl(resolvedHref) || null;
  state.currentNoteId = resolvedNoteId;
  state.currentHref = resolvedHref;
  if (!shouldReuseOpenDetail) {
    const returnUrl = useLinks ? resolveReturnUrl(beforeUrl || state.lastListUrl || null) : (beforeUrl || state.lastListUrl || null);
    state.lastListUrl = returnUrl || null;
  }

  if (useLinks) {
    const tabIndex = currentTabIndex || getCurrentTabIndex(state, { tabCount: params.tabCount });
    const activeEntryForTab = readActiveLinkForTab(state, tabIndex);
    const activeLink = activeEntryForTab?.link || assignedLink || slotState?.link || null;
    const retryCount = Math.max(0, Number(activeEntryForTab?.retryCount || slotState?.retryCount || 0));
    const now = new Date().toISOString();
    const detailState = state.detailLinkState && typeof state.detailLinkState === 'object'
      ? state.detailLinkState
      : { opened: 0, activeByTab: {} };
    detailState.opened = Math.max(0, Number(detailState.opened || 0)) + (shouldReuseOpenDetail ? 0 : 1);
    detailState.activeTabIndex = tabIndex;
    detailState.activeLink = activeLink;
    detailState.activeLinkRetryCount = retryCount;
    detailState.activeFailed = false;
    detailState.openByLinks = true;
    detailState.lastAssignedNoteId = String(activeLink?.noteId || resolvedNoteId || '').trim() || null;
    detailState.lastOpenedNoteId = String(resolvedNoteId || '').trim() || null;
    detailState.lastOpenSucceededAt = now;
    state.detailLinkState = detailState;

    writeTabSlotState(state, tabIndex, {
      lastOpenedNoteId: String(resolvedNoteId || '').trim() || null,
      lastOpenedHref: resolvedHref,
      failed: false,
      paused: false,
      completed: false,
      budgetExhausted: false,
      retryCount,
      openedAt: now,
      status: 'active',
    });
    writeDetailSlotState(state, tabIndex, {
      noteId: String(resolvedNoteId || activeLink?.noteId || '').trim() || null,
      href: resolvedHref,
      lastOpenedNoteId: String(resolvedNoteId || activeLink?.noteId || '').trim() || null,
      lastOpenedHref: resolvedHref,
      failed: false,
      paused: false,
      completed: false,
      budgetExhausted: false,
      retryCount,
      openedAt: now,
      status: 'active',
      link: activeLink,
    });
  }

  emitActionTrace(context, actionTrace, { stage: 'xhs_open_detail' });
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_open_detail done',
    data: {
      opened: shouldReuseOpenDetail !== true,
      reused: shouldReuseOpenDetail === true,
      noteId: resolvedNoteId,
      beforeUrl,
      afterUrl: resolvedHref,
      detailVisible: true,
      done: false,
      doneByLinks: false,
    },
  };
}

export async function executeCloseDetailOperation({ profileId, params = {}, context = {} }) {
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const state = getProfileState(profileId);
  const retryPolicy = String(params.retryPolicy || 'esc_then_x').trim().toLowerCase();
  const attempts = Math.max(1, Number(params.retryAttempts ?? 2) || 2);
  const openByLinks = String(params.openByLinks || '').toLowerCase() === 'true' || params.openByLinks === true;
  const allowKeepDetail = String(params.allowKeepDetail || '').toLowerCase() === 'true' || params.allowKeepDetail === true;
  let closed = false;
  let used = null;

  if (openByLinks && !shouldCloseCurrentDetail(state, { tabCount: params.tabCount, openByLinks: true })) {
    emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_close_detail deferred for tab rotation',
      data: { closed: false, method: 'deferred_rotation', attempts: 0 },
    };
  }

  const initialVisible = await isDetailVisible(profileId);
  if (!initialVisible?.detailVisible) {
    emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
    return { ok: true, code: 'OPERATION_DONE', message: 'xhs_close_detail already closed', data: { closed: true, method: 'already_closed', attempts: 0 } };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (retryPolicy === 'esc') {
      await callAPI('keyboard:press', { profileId, key: 'Escape' });
      pushTrace({ kind: 'key', stage: 'close_detail', key: 'Escape', attempt });
      await sleep(400);
      const visible = await isDetailVisible(profileId);
      if (!visible?.detailVisible) {
        closed = true;
        used = 'esc';
        break;
      }
      continue;
    }

    if (retryPolicy === 'x') {
      const target = await readDetailCloseTarget(profileId);
      if (target?.found && target.center) {
        await clickPoint(profileId, target.center, { steps: 2 });
        pushTrace({ kind: 'click', stage: 'close_detail', selector: target.selector, attempt });
        await sleep(400);
        const visible = await isDetailVisible(profileId);
        if (!visible?.detailVisible) {
          closed = true;
          used = 'x';
          break;
        }
      }
      continue;
    }

    if (attempt === 1) {
      await callAPI('keyboard:press', { profileId, key: 'Escape' });
      pushTrace({ kind: 'key', stage: 'close_detail', key: 'Escape', attempt });
      await sleep(400);
      const visible = await isDetailVisible(profileId);
      if (!visible?.detailVisible) {
        closed = true;
        used = 'esc';
        break;
      }
    }

    const target = await readDetailCloseTarget(profileId);
    if (target?.found && target.center) {
      await clickPoint(profileId, target.center, { steps: 2 });
      pushTrace({ kind: 'click', stage: 'close_detail', selector: target.selector, attempt });
      await sleep(400);
      const visible = await isDetailVisible(profileId);
      if (!visible?.detailVisible) {
        closed = true;
        used = 'x';
        break;
      }
    }
  }

  if (!closed && !openByLinks) {
    const anchorNoteId = String(getProfileState(profileId)?.currentNoteId || '').trim();
    if (anchorNoteId) {
      const anchor = await readSearchCandidateByNoteId(profileId, anchorNoteId, { visibilityMargin: 8 });
      if (anchor?.found && anchor.inViewport) {
        const visible = await isDetailVisible(profileId).catch(() => null);
        if (!visible?.detailVisible) {
          closed = true;
          used = 'anchor';
        }
      }
    }
  }

  if (!closed && openByLinks) {
    try {
      await callAPI('page:back', { profileId });
      pushTrace({ kind: 'nav', stage: 'close_detail', action: 'page:back' });
    } catch (error) {
      pushTrace({ kind: 'error', stage: 'close_detail', action: 'page:back', message: String(error?.message || error) });
    }
    await sleep(600);
    const backState = await waitForDetailClose(profileId, 4, 180, 420);
    if (backState.closed) {
      closed = true;
      used = 'back';
    } else {
      const returnUrl = resolveReturnUrl(state?.lastListUrl);
      try {
        await callAPI('goto', { profileId, url: returnUrl });
        pushTrace({ kind: 'nav', stage: 'close_detail', action: 'goto', url: returnUrl });
      } catch (error) {
        pushTrace({ kind: 'error', stage: 'close_detail', action: 'goto', message: String(error?.message || error), url: returnUrl });
      }
      await sleep(800);
      const gotoState = await waitForDetailClose(profileId, 8, 220, 520);
      if (gotoState.closed) {
        closed = true;
        used = 'goto_list';
      }
    }
  }

  if (!closed) {
    const finalState = await waitForDetailClose(profileId, 6, 200, 480).catch(() => null);
    if (finalState?.closed) {
      closed = true;
      used = used || 'detail_disappeared';
    }
  }

  if (closed && openByLinks) {
    const tabIndex = Number(state?.detailLinkState?.activeTabIndex || getCurrentTabIndex(state, { tabCount: params.tabCount })) || 1;
    const activeSlot = readDetailSlotState(state, tabIndex, { tabCount: params.tabCount });
    const slotFailed = activeSlot?.failed === true;
    const shouldRequeue = state?.detailLinkState?.activeFailed === true || slotFailed;
    const queueResult = shouldRequeue
      ? requeueTabLinkToTail(state, params, tabIndex, {
        reason: 'detail_flow_failed',
        code: String(state?.detailLinkState?.lastFailureCode || activeSlot?.lastFailureCode || 'DETAIL_FLOW_FAILED').trim() || 'DETAIL_FLOW_FAILED',
        noteId: state.currentNoteId || activeSlot?.lastOpenedNoteId || null,
        url: state.currentHref || activeSlot?.lastOpenedHref || null,
      })
      : markTabLinkDone(state, tabIndex, {
        reason: 'detail_flow_done',
        noteId: state.currentNoteId || activeSlot?.lastOpenedNoteId || null,
        url: state.currentHref || activeSlot?.lastOpenedHref || null,
      });
    const detailState = state.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {};
    const activeByTab = detailState.activeByTab && typeof detailState.activeByTab === 'object' ? { ...detailState.activeByTab } : {};
    delete activeByTab[String(tabIndex)];
    state.detailLinkState = {
      ...detailState,
      activeByTab,
      activeTabIndex: null,
      activeLink: null,
      activeLinkRetryCount: 0,
      activeFailed: false,
      lastQueueOutcome: queueResult,
      lastClosedAt: new Date().toISOString(),
    };
  }

  emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
  if (!closed && allowKeepDetail) {
    return { ok: true, code: 'OPERATION_DONE', message: 'xhs_close_detail skipped for direct link', data: { closed: false, method: used || 'keep_open', attempts } };
  }
  return { ok: closed, code: closed ? 'OPERATION_DONE' : 'CLOSE_FAILED', message: 'xhs_close_detail done', data: { closed, method: used, attempts } };
}
