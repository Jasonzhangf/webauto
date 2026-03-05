import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitActionTrace } from './trace.mjs';
import { sleep, readLocation, clickPoint } from './dom-ops.mjs';
import { readSearchCandidateByNoteId, ensureSearchCandidateFullyVisible } from './search-ops.mjs';
import { getCurrentTabIndex, getOrAssignLinkForTab } from './tab-state.mjs';
import { isDetailVisible, readDetailCloseTarget, closeDetailToSearch, readDetailSnapshot } from './detail-ops.mjs';


export async function executeOpenDetailOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const mode = String(params.mode || '').trim() || 'single';
  const collectMode = mode === 'collect';
  if (collectMode) {
    return { ok: false, code: 'INVALID_MODE', message: 'collect mode must use xhs_collect_links' };
  }

  // Single mode
  const noteId = String(params.noteId || '').trim() || null;
  const noteUrl = String(params.noteUrl || '').trim() || null;

  const useLinks = String(params.openByLinks || '').toLowerCase() === 'true' || params.openByLinks === true;
  let effectiveNoteUrl = noteUrl;
  if (useLinks && !effectiveNoteUrl) {
    const tabIndex = getCurrentTabIndex(state, { tabCount: params.tabCount });
    const link = await getOrAssignLinkForTab(state, params, tabIndex);
    if (link?.noteUrl) {
      effectiveNoteUrl = link.noteUrl;
    } else {
      return { ok: false, code: 'LINKS_EXHAUSTED', message: 'no more collected links for tab' };
    }
  }

  if (effectiveNoteUrl && !String(effectiveNoteUrl).includes('xsec_token=')) {
    return { ok: false, code: 'MISSING_XSEC_TOKEN', message: 'detail url missing xsec_token' };
  }

  if (!noteId && !effectiveNoteUrl) {
    return { ok: false, code: 'INVALID_PARAMS', message: 'noteId or noteUrl required in single mode' };
  }

  const beforeUrl = await readLocation(profileId);
  const detailVisible = await isDetailVisible(profileId);
  if (detailVisible?.detailVisible === true && !useLinks) {
    await closeDetailToSearch(profileId, pushTrace);
    await sleep(300);
  }

  if (effectiveNoteUrl) {
    await callAPI('goto', { profileId, url: effectiveNoteUrl });
    await sleep(1000);
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
  const detailSnapshot = await readDetailSnapshot(profileId);
  state.currentNoteId = noteId || detailSnapshot?.noteIdFromUrl || null;
  state.currentHref = afterUrl || null;
  state.lastListUrl = beforeUrl || null;
  emitActionTrace(context, actionTrace, { stage: 'xhs_open_detail' });
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_open_detail done',
    data: {
      opened: true,
      noteId: noteId || detailSnapshot?.noteIdFromUrl,
      beforeUrl,
      afterUrl,
      detailVisible: true,
      done: false,
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

  const initialVisible = await isDetailVisible(profileId);
  if (!initialVisible?.detailVisible) {
    emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
    return { ok: true, code: 'OPERATION_DONE', message: 'xhs_close_detail already closed', data: { closed: true, method: 'already_closed', attempts: 0 } };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (retryPolicy == 'esc') {
      await callAPI('keyboard:press', { profileId, key: 'Escape' });
      pushTrace({ kind: 'key', stage: 'close_detail', key: 'Escape', attempt });
      await sleep(400);
      const visible = await isDetailVisible(profileId);
      if (!visible?.detailVisible) {
        closed = true;
        used = 'esc';
        break;
      }
    } else if (retryPolicy == 'x') {
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
    } else {
      if (attempt == 1) {
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
  }

  if (!closed) {
    const anchorNoteId = String(getProfileState(profileId)?.currentNoteId || '').trim();
    if (anchorNoteId) {
      const anchor = await readSearchCandidateByNoteId(profileId, anchorNoteId, { visibilityMargin: 8 });
      if (anchor?.found && anchor.inViewport) {
        closed = true;
        used = 'anchor';
      }
    }
  }

  if (!closed && openByLinks) {
    await callAPI('page:back', { profileId });
    await sleep(600);
    const backVisible = await isDetailVisible(profileId);
    if (!backVisible?.detailVisible) {
      closed = true;
      used = 'back';
    } else if (state?.lastListUrl) {
      await callAPI('goto', { profileId, url: state.lastListUrl });
      await sleep(800);
      const gotoVisible = await isDetailVisible(profileId);
      if (!gotoVisible?.detailVisible) {
        closed = true;
        used = 'goto_list';
      }
    }
  }

  emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
  if (!closed && allowKeepDetail) {
    return { ok: true, code: 'OPERATION_DONE', message: 'xhs_close_detail skipped for direct link', data: { closed: false, method: used || 'keep_open', attempts } };
  }
  return { ok: closed, code: closed ? 'OPERATION_DONE' : 'CLOSE_FAILED', message: 'xhs_close_detail done', data: { closed, method: used, attempts } };
}
