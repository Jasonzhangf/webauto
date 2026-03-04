import { callAPI } from '../../../utils/browser-service.mjs';
import { getProfileState } from './state.mjs';
import { buildTraceRecorder, emitActionTrace } from './trace.mjs';
import { sleep, readLocation, clickPoint, pressKey } from './dom-ops.mjs';
import { readSearchCandidateByNoteId, ensureSearchCandidateFullyVisible, readSearchCandidates, readSearchInput } from './search-ops.mjs';
import { isDetailVisible, readDetailCloseTarget, closeDetailToSearch, readDetailSnapshot, readDetailLinks } from './detail-ops.mjs';
import { resolveXhsOutputContext, mergeLinksJsonl, readJsonlRows } from './persistence.mjs';

async function waitForCondition(conditionFn, timeoutMs = 5000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await conditionFn();
    if (result) return result;
    await sleep(intervalMs);
  }
  return null;
}

async function waitForDetailVisible(profileId, timeoutMs = 5000) {
  return waitForCondition(async () => {
    const detailVisible = await isDetailVisible(profileId);
    return detailVisible?.detailVisible === true ? detailVisible : null;
  }, timeoutMs, 200);
}

async function waitForSearchReady(profileId, timeoutMs = 5000) {
  return waitForCondition(async () => {
    const candidates = await readSearchCandidates(profileId);
    const rows = Array.isArray(candidates?.rows) ? candidates.rows : [];
    if (rows.length > 0) return { rows, page: candidates.page || null };
    const input = await readSearchInput(profileId);
    return input?.ok ? { rows: [], page: candidates?.page || null } : null;
  }, timeoutMs, 200);
}

export async function executeOpenDetailOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const mode = String(params.mode || '').trim() || 'single';
  const maxNotes = Math.max(1, Number(params.maxNotes ?? 21) || 21);
  const collectMode = mode === 'collect';
  const keyword = String(params.keyword || state.keyword || 'unknown').trim();
  const env = String(params.env || 'debug').trim();

  if (collectMode) {
    state.collectIndex = typeof state.collectIndex === 'number' ? state.collectIndex : 0;
    state.collectCount = typeof state.collectCount === 'number' ? state.collectCount : 0;
    state.preCollectedNoteIds = Array.isArray(state.preCollectedNoteIds) ? state.preCollectedNoteIds : [];
  }

  if (collectMode) {
    const outputCtx = resolveXhsOutputContext({ params: { keyword, env }, state });
    const linksPath = outputCtx.linksPath;

    if (state.preCollectedNoteIds.length === 0) {
      const existing = await readJsonlRows(linksPath);
      for (const row of existing) {
        const noteId = String(row?.noteId || '').trim();
        if (noteId && !state.preCollectedNoteIds.includes(noteId)) {
          state.preCollectedNoteIds.push(noteId);
        }
      }
    }

    while (state.collectCount < maxNotes) {
      // 先判断详情容器
      const detailVisible = await waitForDetailVisible(profileId, 5000);
      if (detailVisible?.detailVisible === true) {
        const detailLinks = await readDetailLinks(profileId);
        if (detailLinks?.currentUrl && detailLinks.noteIdFromUrl) {
          if (!state.preCollectedNoteIds.includes(detailLinks.noteIdFromUrl)) {
            state.preCollectedNoteIds.push(detailLinks.noteIdFromUrl);
            await mergeLinksJsonl({
              filePath: linksPath,
              links: [{
                noteId: detailLinks.noteIdFromUrl,
                noteUrl: detailLinks.currentUrl,
                listUrl: state.lastListUrl,
              }],
            });
            state.collectCount = (state.collectCount || 0) + 1;
            pushTrace({ kind: 'collect', stage: 'link_collected', noteId: detailLinks.noteIdFromUrl, collectCount: state.collectCount });
          }
        }
        await closeDetailToSearch(profileId, pushTrace);
        await waitForSearchReady(profileId, 5000);
        await sleep(300);
        continue;
      }

      // 搜索页容器
      const searchReady = await waitForSearchReady(profileId, 5000);
      if (!searchReady) {
        await pressKey(profileId, 'Escape');
        await sleep(300);
        continue;
      }

      const rows = Array.isArray(searchReady.rows) ? searchReady.rows : [];
      if (rows.length === 0) {
        await pressKey(profileId, 'PageDown');
        await sleep(400);
        continue;
      }

      const targetIndex = state.collectIndex || 0;
      if (targetIndex >= rows.length) {
        await pressKey(profileId, 'PageDown');
        await sleep(400);
        continue;
      }

      const target = rows.find((row) => row.index === targetIndex) || rows[0];
      if (!target?.center) {
        state.collectIndex = (state.collectIndex || 0) + 1;
        continue;
      }

      if (state.preCollectedNoteIds.includes(target.noteId)) {
        state.collectIndex = (state.collectIndex || 0) + 1;
        continue;
      }

      if (!target.inViewport) {
        await ensureSearchCandidateFullyVisible(profileId, target.noteId || '');
      }

      await clickPoint(profileId, target.center, { steps: 3 });
      pushTrace({ kind: 'click', stage: 'open_detail', noteId: target.noteId, selector: target.selector, collectIndex: targetIndex });

      const openedDetail = await waitForDetailVisible(profileId, 5000);
      if (!openedDetail?.detailVisible) {
        state.collectIndex = (state.collectIndex || 0) + 1;
        continue;
      }

      const afterUrl = await readLocation(profileId);
      const detailSnapshot = await readDetailSnapshot(profileId);
      if (detailSnapshot?.noteIdFromUrl && !state.preCollectedNoteIds.includes(detailSnapshot.noteIdFromUrl)) {
        state.preCollectedNoteIds.push(detailSnapshot.noteIdFromUrl);
        await mergeLinksJsonl({
          filePath: linksPath,
          links: [{
            noteId: detailSnapshot.noteIdFromUrl,
            noteUrl: afterUrl,
            listUrl: state.lastListUrl,
          }],
        });
        state.collectCount = (state.collectCount || 0) + 1;
        pushTrace({ kind: 'collect', stage: 'link_collected', noteId: detailSnapshot.noteIdFromUrl, url: afterUrl, collectCount: state.collectCount });
      }

      state.collectIndex = (state.collectIndex || 0) + 1;
      await closeDetailToSearch(profileId, pushTrace);
      await waitForSearchReady(profileId, 5000);
      await sleep(300);
    }

    emitActionTrace(context, actionTrace, { stage: 'xhs_open_detail' });
    return {
      ok: true,
      code: 'COLLECT_DONE',
      message: `Collected ${state.collectCount} notes (max: ${maxNotes})`,
      data: {
        opened: true,
        noteId: null,
        beforeUrl: null,
        afterUrl: await readLocation(profileId),
        detailVisible: false,
        collectCount: state.collectCount,
        collectIndex: state.collectIndex,
        maxNotes,
        done: true,
        linksPath,
      },
    };
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
      collectCount: state.collectCount,
      collectIndex: state.collectIndex,
      maxNotes,
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
