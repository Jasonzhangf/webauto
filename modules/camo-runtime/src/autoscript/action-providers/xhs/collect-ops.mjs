import { getProfileState, withSerializedLock } from './state.mjs';
import { buildTraceRecorder, emitActionTrace } from './trace.mjs';
import { resolveSearchLockKey, randomBetween } from './utils.mjs';
import { sleep, readLocation, clickPoint, clearAndType, pressKey, resolveSelectorTarget, sleepRandom } from './dom-ops.mjs';
import { readSearchInput, readSearchViewportReady, readSearchCandidates, ensureSearchCandidateFullyVisible } from './search-ops.mjs';
import { isDetailVisible, closeDetailToSearch, readDetailSnapshot, readDetailLinks } from './detail-ops.mjs';
import { resolveXhsOutputContext, mergeLinksJsonl, readJsonlRows } from './persistence.mjs';


async function readCandidateWindow(profileId, index) {
  const data = await readSearchCandidates(profileId);
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const centerIndex = Math.max(0, Number(index) || 0);
  const start = Math.max(0, centerIndex - 5);
  const end = Math.min(rows.length - 1, centerIndex + 5);
  const windowRows = rows.slice(start, end + 1);
  return {
    centerIndex,
    start,
    end,
    total: rows.length,
    window: windowRows.map((row) => ({
      index: row.index,
      noteId: row.noteId || null,
      href: row.href || null,
      rect: row.rect || null,
      inViewport: row.inViewport === true,
      visibleRatio: row.visibleRatio,
    })),
  };
}

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

export async function executeSubmitSearchOperation({ profileId, params = {}, context = {} }) {
  const lockKey = resolveSearchLockKey(params);
  return withSerializedLock(lockKey ? `xhs_submit_search:${lockKey}` : '', async () => {
    const profileState = getProfileState(profileId);
    const metrics = profileState.metrics || (profileState.metrics = {});
    const { actionTrace, pushTrace } = buildTraceRecorder();

    const methodRequested = String(params.method || params.submitMethod || 'click').trim().toLowerCase();
    const method = ['click', 'enter', 'form'].includes(methodRequested) ? methodRequested : 'click';
    const keyword = String(params.keyword || '').trim();
    const actionDelayMinMs = Math.max(300, Number(params.actionDelayMinMs ?? 500) || 500);
    const actionDelayMaxMs = Math.max(actionDelayMinMs, Number(params.actionDelayMaxMs ?? 1600) || 1600);
    const settleMinMs = Math.max(500, Number(params.settleMinMs ?? 1200) || 1200);
    const settleMaxMs = Math.max(settleMinMs, Number(params.settleMaxMs ?? 2800) || 2800);
    const searchReadyTimeoutMs = Math.max(2000, Number(params.searchReadyTimeoutMs ?? 12000) || 12000);
    const searchReadyPollMinMs = Math.max(120, Number(params.searchReadyPollMinMs ?? 260) || 260);
    const searchReadyPollMaxMs = Math.max(searchReadyPollMinMs, Number(params.searchReadyPollMaxMs ?? 700) || 700);
    const searchReadyRetryCount = Math.max(1, Number(params.searchReadyRetryCount ?? 3) || 3);

    const input = await readSearchInput(profileId);
    if (!input || input.ok !== true || !input.center) {
      throw new Error('SEARCH_INPUT_NOT_FOUND');
    }

    await clickPoint(profileId, input.center, { steps: 3 });
    pushTrace({ kind: 'click', stage: 'submit_search', target: 'search_input' });
    await sleepRandom(actionDelayMinMs, actionDelayMaxMs, pushTrace, 'submit_pre_type');

    if (keyword && String(input.value || '') !== keyword) {
      await clearAndType(profileId, keyword, Number(params.keyDelayMs ?? 65) || 65);
      pushTrace({ kind: 'type', stage: 'submit_search', target: 'search_input', length: keyword.length });
      await sleepRandom(actionDelayMinMs, actionDelayMaxMs, pushTrace, 'submit_after_type');
    }

    const beforeUrl = await readLocation(profileId);
    let via = method;
    const triggerSubmitOnce = async (attempt = 1) => {
      if (method === 'click') {
        const target = await resolveSelectorTarget(profileId, ['.input-button .search-icon', '.input-button', 'button.min-width-search-icon'], { requireViewport: true });
        if (target && target.center) {
          await clickPoint(profileId, target.center, { steps: 3 });
          via = target.selector || 'click';
          pushTrace({ kind: 'click', stage: 'submit_search', selector: via, attempt });
          return;
        }
        await pressKey(profileId, 'Enter');
        via = 'enter_fallback';
        pushTrace({ kind: 'key', stage: 'submit_search', key: 'Enter', fallback: true, attempt });
        return;
      }
      await pressKey(profileId, 'Enter');
      via = 'Enter';
      pushTrace({ kind: 'key', stage: 'submit_search', key: 'Enter', attempt });
    };

    const waitSearchReadyOnce = async (attempt = 1) => {
      const startedAt = Date.now();
      let lastSnapshot = null;
      while ((Date.now() - startedAt) < searchReadyTimeoutMs) {
        lastSnapshot = await readSearchViewportReady(profileId);
        const readySelector = String(lastSnapshot?.readySelector || '').trim();
        const visibleNoteCount = Math.max(0, Number(lastSnapshot?.visibleNoteCount || 0) || 0);
        if (readySelector || visibleNoteCount > 0) {
          return { ready: true, readySelector: readySelector || null, visibleNoteCount, elapsedMs: Math.max(0, Date.now() - startedAt), href: String(lastSnapshot?.href || '') };
        }
        const waitMs = randomBetween(searchReadyPollMinMs, searchReadyPollMaxMs);
        pushTrace({ kind: 'wait', stage: 'submit_wait_viewport_ready', attempt, waitMs, elapsedMs: Math.max(0, Date.now() - startedAt), visibleNoteCount });
        await sleep(waitMs);
      }
      return { ready: false, readySelector: null, visibleNoteCount: 0, elapsedMs: searchReadyTimeoutMs, href: String(lastSnapshot?.href || '') };
    };

    await triggerSubmitOnce(1);
    await sleepRandom(settleMinMs, settleMaxMs, pushTrace, 'submit_after_trigger');
    const readyResult = await waitSearchReadyOnce(1);
    if (!readyResult.ready) {
      for (let retry = 2; retry <= searchReadyRetryCount; retry += 1) {
        await triggerSubmitOnce(retry);
        await sleepRandom(settleMinMs, settleMaxMs, pushTrace, 'submit_retry_settle');
        const retryResult = await waitSearchReadyOnce(retry);
        if (retryResult.ready) {
          readyResult.ready = true;
          readyResult.readySelector = retryResult.readySelector;
          readyResult.visibleNoteCount = retryResult.visibleNoteCount;
          readyResult.elapsedMs = retryResult.elapsedMs;
          readyResult.href = retryResult.href;
          break;
        }
      }
    }
    if (!readyResult.ready) {
      throw new Error('SEARCH_VIEWPORT_READY_TIMEOUT');
    }

    const windowBefore = await readCandidateWindow(profileId, Number(params.index ?? 0));
    const afterUrl = await readLocation(profileId);
    const windowAfter = await readCandidateWindow(profileId, Number(params.index ?? 0));
    profileState.keyword = keyword || profileState.keyword;
    profileState.lastListUrl = afterUrl || beforeUrl || null;
    metrics.searchCount = Math.max(0, Number(metrics.searchCount || 0) || 0) + 1;
    metrics.lastSearchAt = new Date().toISOString();

    emitActionTrace(context, actionTrace, { stage: 'xhs_submit_search' });
    return { ok: true, code: 'OPERATION_DONE', message: 'xhs_submit_search done', data: { keyword: keyword || null, method: via, beforeUrl, afterUrl, searchReady: readyResult.ready, readySelector: readyResult.readySelector || null, visibleNoteCount: readyResult.visibleNoteCount, elapsedMs: readyResult.elapsedMs, searchCount: metrics.searchCount, indexWindowBefore: windowBefore, indexWindowAfter: windowAfter } };
  });
}

export async function executeCollectLinksOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const maxNotes = Math.max(1, Number(params.maxNotes ?? 21) || 21);
  const keyword = String(params.keyword || state.keyword || 'unknown').trim();
  const env = String(params.env || 'debug').trim();
  const outputCtx = resolveXhsOutputContext({ params: { keyword, env }, state });
  const linksPath = outputCtx.linksPath;

  state.collectIndex = typeof state.collectIndex === 'number' ? state.collectIndex : 0;
  state.collectCount = typeof state.collectCount === 'number' ? state.collectCount : 0;
  state.preCollectedNoteIds = Array.isArray(state.preCollectedNoteIds) ? state.preCollectedNoteIds : [];

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

  emitActionTrace(context, actionTrace, { stage: 'xhs_collect_links' });
  return {
    ok: true,
    code: 'COLLECT_DONE',
    message: `Collected ${state.collectCount} notes (max: ${maxNotes})`,
    data: {
      collectCount: state.collectCount,
      collectIndex: state.collectIndex,
      maxNotes,
      done: true,
      linksPath,
    },
  };
}
