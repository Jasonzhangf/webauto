import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitActionTrace } from './trace.mjs';
import { sleep, readLocation, clickPoint } from './dom-ops.mjs';
import { readSearchCandidateByNoteId, ensureSearchCandidateFullyVisible } from './search-ops.mjs';
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

  if (!noteId && !noteUrl) {
    return { ok: false, code: 'INVALID_PARAMS', message: 'noteId or noteUrl required in single mode' };
  }

  const beforeUrl = await readLocation(profileId);
  const detailVisible = await isDetailVisible(profileId);
  if (detailVisible?.detailVisible === true) {
    await closeDetailToSearch(profileId, pushTrace);
    await sleep(300);
  }

  if (noteUrl) {
    await callAPI('goto', { profileId, url: noteUrl });
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
    pushTrace({ kind: 'click', stage: 'open_detail', noteId, selector: candidate.selector });
    await sleep(1500);
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
  const retryPolicy = String(params.retryPolicy || 'esc_then_x').trim().toLowerCase();
  const attempts = Math.max(1, Number(params.retryAttempts ?? 2) || 2);
  let closed = false;
  let used = null;

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

  emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
  return { ok: closed, code: closed ? 'OPERATION_DONE' : 'CLOSE_FAILED', message: 'xhs_close_detail done', data: { closed, method: used, attempts } };
}
