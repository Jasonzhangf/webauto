import { getProfileState, withSerializedLock } from './state.mjs';
import { buildTraceRecorder, emitActionTrace, emitOperationProgress } from './trace.mjs';
import { resolveSearchLockKey, randomBetween, resolveSearchResultTokenLink } from './utils.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, readLocation, clickPoint, clearAndType, pressKey, resolveSelectorTarget, sleepRandom, evaluateReadonly } from './dom-ops.mjs';
import { readSearchInput, readSearchViewportReady, readSearchCandidates, ensureSearchCandidateFullyVisible } from './search-ops.mjs';
import { closeDetailToSearch, readDetailSnapshot, readDetailLinks } from './detail-ops.mjs';
import { buildSelectorCheck, ensureActiveSession, maybeSelector } from '../../../container/runtime-core/index.mjs';
import { getDomSnapshotByProfile } from '../../../utils/browser-service.mjs';
import { resolveXhsOutputContext, mergeLinksJsonl, readJsonlRows, writeContentMarkdown } from './persistence.mjs';
import { dumpNoProgressDiagnostics } from './diagnostic-ops.mjs';

const SEARCH_LIST_SELECTOR = '.feeds-container';
const SEARCH_ANCHOR_SELECTOR = '.note-item:has(a.cover)';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(MODULE_DIR, '../../../../../..');
const CONTAINER_LIB_ROOT = process.env.CAMO_CONTAINER_LIBRARY_ROOT
  ? path.resolve(process.env.CAMO_CONTAINER_LIBRARY_ROOT)
  : path.join(DEFAULT_REPO_ROOT, 'apps', 'webauto', 'resources', 'container-library');
const SEARCH_LIST_CONTAINER_PATH = path.join(CONTAINER_LIB_ROOT, 'xiaohongshu', 'search', 'search_result_list', 'container.json');
const SEARCH_ITEM_CONTAINER_PATH = path.join(CONTAINER_LIB_ROOT, 'xiaohongshu', 'search', 'search_result_item', 'container.json');

function pickSelectorFromContainer(container = {}, fallback) {
  const selectors = Array.isArray(container?.selectors) ? container.selectors : [];
  if (selectors.length > 0) {
    const sorted = [...selectors].sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
    const first = sorted.find((entry) => String(entry?.css || '').trim());
    if (first?.css) return String(first.css).trim();
  }
  return String(fallback || '').trim();
}

async function loadSearchSelectors() {
  try {
    const [listRaw, itemRaw] = await Promise.all([
      fs.readFile(SEARCH_LIST_CONTAINER_PATH, 'utf8'),
      fs.readFile(SEARCH_ITEM_CONTAINER_PATH, 'utf8'),
    ]);
    const listContainer = JSON.parse(listRaw);
    const itemContainer = JSON.parse(itemRaw);
    const listSelector = pickSelectorFromContainer(listContainer, SEARCH_LIST_SELECTOR);
    const anchorSelector = pickSelectorFromContainer(itemContainer, SEARCH_ANCHOR_SELECTOR);
    return {
      listSelector,
      anchorSelector,
      selectors: {
        listSelector,
        anchorSelector,
        listContainerId: listContainer?.id || null,
        itemContainerId: itemContainer?.id || null,
        listContainerPath: SEARCH_LIST_CONTAINER_PATH,
        itemContainerPath: SEARCH_ITEM_CONTAINER_PATH,
      },
    };
  } catch {
    const listSelector = SEARCH_LIST_SELECTOR;
    const anchorSelector = SEARCH_ANCHOR_SELECTOR;
    return {
      listSelector,
      anchorSelector,
      selectors: {
        listSelector,
        anchorSelector,
        listContainerId: null,
        itemContainerId: null,
        listContainerPath: SEARCH_LIST_CONTAINER_PATH,
        itemContainerPath: SEARCH_ITEM_CONTAINER_PATH,
      },
    };
  }
}

function buildSearchAnchorsScript(listSelector, anchorSelector) {
  const listLiteral = JSON.stringify(String(listSelector || '').trim());
  const anchorLiteral = JSON.stringify(String(anchorSelector || '').trim());
  return `(() => {
    const listSelector = ${listLiteral};
    const anchorSelector = ${anchorLiteral};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      } catch { return false; }
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (vw && vh) {
        if (rect.bottom <= 0 || rect.right <= 0) return false;
        if (rect.top >= vh || rect.left >= vw) return false;
      }
      return true;
    };
    const listNode = listSelector ? document.querySelector(listSelector) : null;
    const containerVisible = listNode ? isVisible(listNode) : false;
    const anchors = anchorSelector ? Array.from(document.querySelectorAll(anchorSelector)) : [];
    const visibleCount = anchors.filter(isVisible).length;
    return {
      listSelector: listSelector || null,
      anchorSelector: anchorSelector || null,
      anchorCount: anchors.length,
      visibleCount,
      containerVisible,
      anchorsSample: [],
    };
  })()`;
}

function buildAnchorsSampleScript() {
  return `(() => {
    const parseNoteId = (href) => {
      if (!href) return '';
      const cleaned = String(href).split('#')[0];
      const base = cleaned.split('?')[0];
      const seg = base.split('/').filter(Boolean).pop() || '';
      return seg.trim();
    };
    const items = Array.from(document.querySelectorAll('.note-item'));
    const sample = items.slice(0, 10).map((node) => {
      let noteId = node.getAttribute('data-note-id') || node.dataset?.noteId || '';
      const href = node.querySelector('a.cover')?.getAttribute('href') || '';
      if (!noteId && href) noteId = parseNoteId(href);
      return {
        noteId: noteId ? String(noteId) : null,
        href: href ? String(href) : null,
      };
    });
    return { anchorsSample: sample };
  })()`;
}

function normalizeAnchorsSample(sample) {
  if (!Array.isArray(sample)) return [];
  return sample
    .slice(0, 10)
    .map((item) => ({
      noteId: item?.noteId ? String(item.noteId) : null,
      href: item?.href ? String(item.href) : null,
    }));
}

function buildClickTargetInfoScript(noteId, href) {
  const noteLiteral = JSON.stringify(String(noteId || '').trim());
  const hrefLiteral = JSON.stringify(String(href || '').trim());
  return `(() => {
    const targetNoteId = ${noteLiteral};
    const targetHref = ${hrefLiteral};
    const items = Array.from(document.querySelectorAll('.note-item'));
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const parseNoteId = (href) => {
      if (!href) return '';
      const cleaned = String(href).split('#')[0];
      const base = cleaned.split('?')[0];
      const seg = base.split('/').filter(Boolean).pop() || '';
      return seg.trim();
    };
    const pickMatch = () => {
      for (const item of items) {
        let noteId = item.getAttribute('data-note-id') || item.dataset?.noteId || '';
        const cover = item.querySelector('a.cover');
        const href = String(cover?.getAttribute('href') || '').trim();
        if (!noteId && href) noteId = parseNoteId(href);
        if (targetNoteId && noteId === targetNoteId) return { item, href, noteId };
        if (targetHref && href && (href === targetHref || href.includes(targetHref))) {
          return { item, href, noteId: noteId || null };
        }
      }
      return null;
    };
    const match = pickMatch();
    const text = match?.item ? normalize(match.item.textContent || '') : '';
    const selector = match?.noteId ? '.note-item[data-note-id="' + String(match.noteId) + '"]' : '.note-item';
    return {
      selector,
      noteId: match?.noteId || targetNoteId || null,
      url: match?.href || targetHref || null,
      text: text ? text.slice(0, 200) : null,
    };
  })()`;
}

async function readClickTargetInfo(profileId, { noteId, href } = {}) {
  return evaluateReadonly(profileId, buildClickTargetInfoScript(noteId, href));
}

async function readAnchorsSample(profileId) {
  const payload = await evaluateReadonly(profileId, buildAnchorsSampleScript());
  return Array.isArray(payload?.anchorsSample) ? payload.anchorsSample : [];
}

async function readSearchAnchors(profileId, { listSelector, anchorSelector, selectorsMeta } = {}) {
  const payload = await evaluateReadonly(profileId, buildSearchAnchorsScript(listSelector, anchorSelector));
  return {
    listSelector,
    anchorSelector,
    anchorCount: Number(payload?.anchorCount || 0),
    visibleCount: Number(payload?.visibleCount || 0),
    containerVisible: payload?.containerVisible === true,
    anchorsSample: Array.isArray(payload?.anchorsSample) ? payload.anchorsSample : [],
    selectors: selectorsMeta || {
      listSelector,
      anchorSelector,
    },
  };
}

async function readSearchTokenLinks(profileId, { limit = 60 } = {}) {
  const max = Math.max(1, Number(limit) || 60);
  const script = `(() => {
    const rows = Array.from(document.querySelectorAll('.note-item'));
    const out = [];
    for (let i = 0; i < rows.length && out.length < ${max}; i += 1) {
      const item = rows[i];
      const cover = item.querySelector('a.cover[href*="/search_result/"]');
      if (!cover) continue;
      const href = String(cover.getAttribute('href') || '').trim();
      if (!href || !href.includes('xsec_token=')) continue;
      const noteIdAttr = String(item.getAttribute('data-note-id') || '').trim();
      out.push({ href, noteId: noteIdAttr || null, index: i });
    }
    return { rows: out };
  })()`;
  const payload = await evaluateReadonly(profileId, script);
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

export function buildCollectAnchorEmptyError({
  stage,
  expected,
  actual,
  persistPath,
  lastUrl,
  anchorCount,
  visibleCount,
  containerVisible,
  selectors,
} = {}) {
  const details = {
    stage: stage || 'collect_links',
    expected: Number(expected) || 0,
    actual: Number(actual) || 0,
    persistPath: persistPath || null,
    lastUrl: lastUrl || null,
    anchorCount: Number(anchorCount) || 0,
    visibleCount: Number(visibleCount) || 0,
    containerVisible: containerVisible === true,
    selector: selectors || null,
  };
  const message = `COLLECT_ANCHOR_EMPTY stage=${details.stage} expected=${details.expected} actual=${details.actual} persistPath=${details.persistPath}`;
  const err = new Error(message);
  err.code = 'COLLECT_ANCHOR_EMPTY';
  err.details = details;
  return err;
}

export function buildCollectNoProgressError({
  stage,
  expected,
  actual,
  persistPath,
  lastAnchor,
  lastUrl,
  anchorsSample,
  lastClickTarget,
  noProgressRounds,
  maxNoProgressRounds,
} = {}) {
  const details = {
    stage: stage || 'collect_links',
    expected: Number(expected) || 0,
    actual: Number(actual) || 0,
    persistPath: persistPath || null,
    lastAnchor: lastAnchor || null,
    lastUrl: lastUrl || null,
    anchorsSample: Array.isArray(anchorsSample) ? anchorsSample : null,
    lastClickTarget: lastClickTarget || null,
    noProgressRounds: Number(noProgressRounds) || 0,
    maxNoProgressRounds: Number(maxNoProgressRounds) || 0,
  };
  const message = `COLLECT_NO_PROGRESS stage=${details.stage} expected=${details.expected} actual=${details.actual} persistPath=${details.persistPath}`;
  const err = new Error(message);
  err.code = 'COLLECT_NO_PROGRESS';
  err.details = details;
  return err;
}

export function assertCollectNoProgress({
  stage,
  expected,
  actual,
  persistPath,
  lastAnchor,
  lastUrl,
  anchorsSample,
  lastClickTarget,
  noProgressRounds,
  maxNoProgressRounds,
} = {}) {
  if (Number(maxNoProgressRounds) > 0 && Number(noProgressRounds) >= Number(maxNoProgressRounds)) {
    throw buildCollectNoProgressError({
      stage,
      expected,
      actual,
      persistPath,
      lastAnchor,
      lastUrl,
      anchorsSample,
      lastClickTarget,
      noProgressRounds,
      maxNoProgressRounds,
    });
  }
}

export async function handleCollectNoProgress({
  profileId,
  params = {},
  context = {},
  stage,
  expected,
  actual,
  persistPath,
  lastAnchor,
  lastUrl,
  anchorsSample,
  lastClickTarget,
  listSelector,
  anchorSelector,
  selectors,
  anchorCount,
  visibleCount,
  containerVisible,
  noProgressRounds,
  maxNoProgressRounds,
  dumpDiagnostics = dumpNoProgressDiagnostics,
} = {}) {
  if (Number(maxNoProgressRounds) > 0 && Number(noProgressRounds) >= Number(maxNoProgressRounds)) {
    await dumpDiagnostics({
      profileId,
      params,
      context,
      stage,
      expected,
      actual,
      persistPath,
      lastAnchor,
      lastUrl,
      anchorsSample,
      lastClickTarget,
      listSelector,
      anchorSelector,
      selectors,
      anchorCount,
      visibleCount,
      containerVisible,
    });
    throw buildCollectNoProgressError({
      stage,
      expected,
      actual,
      persistPath,
      lastAnchor,
      lastUrl,
      anchorsSample,
      lastClickTarget,
      noProgressRounds,
      maxNoProgressRounds,
    });
  }
  return null;
}

export async function handleCollectAnchorEmpty({
  profileId,
  params = {},
  context = {},
  stage,
  expected,
  actual,
  persistPath,
  lastUrl,
  anchorCount,
  visibleCount,
  containerVisible,
  listSelector,
  anchorSelector,
  selectors,
  dumpDiagnostics = dumpNoProgressDiagnostics,
} = {}) {
  await dumpDiagnostics({
    profileId,
    params,
    context,
    stage,
    expected,
    actual,
    persistPath,
    lastUrl,
    listSelector,
    anchorSelector,
    selectors,
    anchorCount,
    visibleCount,
    containerVisible,
  });
  throw buildCollectAnchorEmptyError({
    stage,
    expected,
    actual,
    persistPath,
    lastUrl,
    anchorCount,
    visibleCount,
    containerVisible,
    selectors,
  });
}


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


async function waitForContainerReady(profileId, containerId, timeoutMs = 5000, intervalMs = 200) {
  const selector = maybeSelector({ profileId, containerId, selector: null });
  if (!selector) return { ok: false, code: 'CONTAINER_NOT_FOUND', message: `container selector not resolved: ${containerId}` };
  const session = await ensureActiveSession(profileId);
  const resolvedProfile = session.profileId || profileId;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snapshot = await getDomSnapshotByProfile(resolvedProfile);
    const nodes = buildSelectorCheck(snapshot, selector);
    if (nodes.length > 0) {
      return { ok: true, code: 'CONTAINER_READY', message: 'container ready', data: { selector, count: nodes.length } };
    }
    await sleep(intervalMs);
  }
  return { ok: false, code: 'CONTAINER_TIMEOUT', message: `container not ready within ${timeoutMs}ms`, data: { selector } };
}

async function waitForDetailVisible(profileId, timeoutMs = 5000) {
  const ready = await waitForContainerReady(profileId, 'xiaohongshu_detail.modal_shell', timeoutMs, 200);
  return ready?.ok ? { detailVisible: true, container: ready } : null;
}

async function waitForSearchReady(profileId, timeoutMs = 5000) {
  const ready = await waitForContainerReady(profileId, 'xiaohongshu_search.search_result_item', timeoutMs, 200);
  if (!ready?.ok) return null;
  const candidates = await readSearchCandidates(profileId);
  const rows = Array.isArray(candidates?.rows) ? candidates.rows : [];
  return { rows, page: candidates.page || null, container: ready };
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
  const collectIndexStart = Math.max(0, Number(params.collectIndexStart ?? 0) || 0);
  const collectIndexMaxAttempts = Math.max(1, Number(params.collectIndexMaxAttempts ?? 3) || 3);
  const collectIndexFailurePolicy = String(params.collectIndexFailurePolicy || 'retry').trim().toLowerCase();
  const collectAddedZeroRounds = Math.max(1, Number(params.collectAddedZeroRounds ?? 5) || 5);
  const collectNoProgressRounds = Math.max(collectAddedZeroRounds + 1, Number(params.collectNoProgressRounds ?? 10) || 10);
  const collectAnchorEmptyRounds = Math.max(1, Number(params.collectAnchorEmptyRounds ?? 3) || 3);
  const tabCount = Math.max(1, Number(params.tabCount ?? 4) || 4);
  const commentBudget = Math.max(1, Number(params.commentBudget ?? 50) || 50);
  const keyword = String(params.keyword || state.keyword || 'unknown').trim();
  const env = String(params.env || 'debug').trim();
  const outputCtx = resolveXhsOutputContext({ params: { keyword, env }, state });
  const linksPath = outputCtx.safeDetailPath || outputCtx.linksPath;
  const phase2LinksPath = outputCtx.phase2LinksPath;

  state.collectIndex = typeof state.collectIndex === 'number' ? state.collectIndex : collectIndexStart;
  state.collectCount = typeof state.collectCount === 'number' ? state.collectCount : 0;
  state.preCollectedNoteIds = Array.isArray(state.preCollectedNoteIds) ? state.preCollectedNoteIds : [];
  state.collectPersistedCount = typeof state.collectPersistedCount === 'number' ? state.collectPersistedCount : 0;
  state.collectNoProgressRounds = typeof state.collectNoProgressRounds === 'number' ? state.collectNoProgressRounds : 0;
  state.collectAnchorEmptyRounds = typeof state.collectAnchorEmptyRounds === 'number' ? state.collectAnchorEmptyRounds : 0;
  state.collectAddedZeroRounds = typeof state.collectAddedZeroRounds === 'number' ? state.collectAddedZeroRounds : 0;
  state.collectLastClickTarget = state.collectLastClickTarget || null;
  state.collectAnchorsSample = Array.isArray(state.collectAnchorsSample) ? state.collectAnchorsSample : [];
  state.collectLastAnchor = state.collectLastAnchor || null;
  state.collectLastUrl = state.collectLastUrl || null;

  if (state.preCollectedNoteIds.length === 0) {
    const existing = await readJsonlRows(linksPath);
    for (const row of existing) {
      const noteId = String(row?.noteId || '').trim();
      if (noteId && !state.preCollectedNoteIds.includes(noteId)) {
        state.preCollectedNoteIds.push(noteId);
      }
    }
    state.collectPersistedCount = existing.length;
    state.collectCount = existing.length;
  }

  state.collectNoProgressRounds = 0;
  state.collectAddedZeroRounds = 0;
  state.collectAnchorEmptyRounds = 0;
  state.collectAnchorsSample = [];
  state.collectLastClickTarget = null;

  const lastProgressAt = () => Number(state.collectLastProgressAt || 0) || 0;
  const markProgress = () => { state.collectLastProgressAt = Date.now(); };
  const markNoProgress = () => {
    state.collectNoProgressRounds = (state.collectNoProgressRounds || 0) + 1;
  };
  const resetNoProgress = () => { state.collectNoProgressRounds = 0; };
  const markAddedZero = () => { state.collectAddedZeroRounds = (state.collectAddedZeroRounds || 0) + 1; };
  const resetAddedZero = () => { state.collectAddedZeroRounds = 0; };
  const seedProgress = () => { if (!lastProgressAt()) markProgress(); };
  seedProgress();
  while (state.collectCount < maxNotes) {
    let progressedThisRound = false;
    const selectorsMeta = await loadSearchSelectors();
    const detailVisible = await waitForDetailVisible(profileId, 5000);
    if (detailVisible?.detailVisible === true) {
    const detailLinks = await readDetailLinks(profileId);
    const detailSnapshot = await readDetailSnapshot(profileId);
    if (detailLinks?.currentUrl && detailLinks.noteIdFromUrl) {
      if (!state.preCollectedNoteIds.includes(detailLinks.noteIdFromUrl)) {
        state.preCollectedNoteIds.push(detailLinks.noteIdFromUrl);
        const beforeCount = state.collectPersistedCount;
        emitOperationProgress(context, { kind: 'collect_candidate', stage: 'detail_links', candidateCount: 1, persistPath: linksPath });
        const collectedAt = new Date().toISOString();
        const linkPayload = {
          noteId: detailLinks.noteIdFromUrl,
          safeDetailUrl: detailLinks.currentUrl,
          noteUrl: detailLinks.currentUrl,
          listUrl: state.lastListUrl,
          title: detailSnapshot?.title || null,
          author: {
            name: detailSnapshot?.authorName || null,
            id: detailSnapshot?.authorId || null,
            link: detailSnapshot?.authorLink || null,
          },
          collectedAt,
        };
        const mergeResult = await mergeLinksJsonl({
          filePath: linksPath,
          links: [linkPayload],
        });
        if (phase2LinksPath) {
          await mergeLinksJsonl({ filePath: phase2LinksPath, links: [linkPayload] }).catch(() => {});
        }
          emitOperationProgress(context, {
            kind: 'collect_persist',
            stage: 'detail_links',
            added: mergeResult.added,
            deduped: mergeResult.existing + mergeResult.added - mergeResult.total,
            totalBefore: beforeCount,
            totalAfter: mergeResult.total,
            persistPath: linksPath,
          });
        if (mergeResult.added > 0) {
          state.collectPersistedCount = mergeResult.total;
          state.collectCount = mergeResult.total;
          markProgress();
          resetNoProgress();
          resetAddedZero();
          progressedThisRound = true;
          state.collectLastAnchor = detailLinks.noteIdFromUrl;
          state.collectLastUrl = detailLinks.currentUrl;
          if (detailSnapshot?.noteIdFromUrl) {
            const outputCtxForNote = resolveXhsOutputContext({ params: { keyword, env }, state, noteId: detailSnapshot.noteIdFromUrl });
            try {
              await writeContentMarkdown({
                filePath: outputCtxForNote.contentPath,
                imagesDir: outputCtxForNote.imagesDir,
                noteId: detailSnapshot.noteIdFromUrl,
                keyword,
                detailUrl: detailLinks.currentUrl,
                detail: detailSnapshot,
                includeImages: Boolean(params.doImages),
              });
            } catch {
              // ignore detail persist failure
            }
          }
        } else {
          progressedThisRound = false;
          markAddedZero();
        }
          pushTrace({ kind: 'collect', stage: 'link_collected', noteId: detailLinks.noteIdFromUrl, collectCount: state.collectCount });
          emitOperationProgress(context, { kind: 'collect', stage: 'link_collected', noteId: detailLinks.noteIdFromUrl, collectCount: state.collectCount });
        }
      }
      await closeDetailToSearch(profileId, pushTrace);
      await waitForSearchReady(profileId, 5000);
      await sleep(300);
      if (!progressedThisRound) {
        markNoProgress();
      }
      continue;
    }

    let anchorSnapshot = await readSearchAnchors(profileId, {
      listSelector: selectorsMeta.listSelector,
      anchorSelector: selectorsMeta.anchorSelector,
      selectorsMeta: selectorsMeta.selectors,
    });
    state.collectAnchorsSample = normalizeAnchorsSample(await readAnchorsSample(profileId));

    if (anchorSnapshot.anchorCount > 0 && state.collectPersistedCount < maxNotes) {
      const tokenLinks = await readSearchTokenLinks(profileId, { limit: Math.max(40, maxNotes) });
      if (tokenLinks.length > 0) {
        const collectedAt = new Date().toISOString();
        const candidates = tokenLinks.map((row) => {
          const resolved = resolveSearchResultTokenLink(row.href);
          if (!resolved?.searchUrl || !resolved.noteId) return null;
          return {
            noteId: resolved.noteId,
            safeDetailUrl: resolved.searchUrl,
            noteUrl: resolved.searchUrl,
            listUrl: state.lastListUrl,
            collectedAt,
          };
        }).filter(Boolean);
        if (candidates.length > 0) {
          for (const candidate of candidates) {
            const noteId = String(candidate?.noteId || '').trim();
            if (noteId && !state.preCollectedNoteIds.includes(noteId)) {
              state.preCollectedNoteIds.push(noteId);
            }
          }
          const beforeCount = state.collectPersistedCount;
          emitOperationProgress(context, { kind: 'collect_candidate', stage: 'search_result_tokens', candidateCount: candidates.length, persistPath: linksPath });
          const mergeResult = await mergeLinksJsonl({ filePath: linksPath, links: candidates });
          if (phase2LinksPath) {
            await mergeLinksJsonl({ filePath: phase2LinksPath, links: candidates }).catch(() => {});
          }
          emitOperationProgress(context, {
            kind: 'collect_persist',
            stage: 'search_result_tokens',
            added: mergeResult.added,
            deduped: mergeResult.existing + mergeResult.added - mergeResult.total,
            totalBefore: beforeCount,
            totalAfter: mergeResult.total,
            persistPath: linksPath,
          });
          if (mergeResult.added > 0) {
            state.collectPersistedCount = mergeResult.total;
            state.collectCount = mergeResult.total;
            markProgress();
            resetNoProgress();
            resetAddedZero();
            progressedThisRound = true;
          } else {
            markAddedZero();
          }
          if (state.collectCount >= maxNotes) {
            continue;
          }
        }
      }
    }
    if (anchorSnapshot.anchorCount === 0) {
      await pressKey(profileId, 'PageDown');
      await sleep(400);
      const retried = await readSearchAnchors(profileId, {
        listSelector: selectorsMeta.listSelector,
        anchorSelector: selectorsMeta.anchorSelector,
        selectorsMeta: selectorsMeta.selectors,
      });
      anchorSnapshot = retried;
      state.collectAnchorsSample = normalizeAnchorsSample(await readAnchorsSample(profileId));
    }
    if (anchorSnapshot.anchorCount === 0) {
      state.collectAnchorEmptyRounds = (state.collectAnchorEmptyRounds || 0) + 1;
    } else {
      state.collectAnchorEmptyRounds = 0;
    }
    if (anchorSnapshot.containerVisible === false || state.collectAnchorEmptyRounds >= collectAnchorEmptyRounds) {
      const lastUrl = await readLocation(profileId, { timeoutMs: 3000 });
      await handleCollectAnchorEmpty({
        profileId,
        params: { ...params, keyword, env },
        context,
        stage: 'collect_links',
        expected: maxNotes,
        actual: state.collectPersistedCount,
        persistPath: linksPath,
        lastUrl,
        anchorCount: anchorSnapshot.anchorCount,
        visibleCount: anchorSnapshot.visibleCount,
        containerVisible: anchorSnapshot.containerVisible,
        listSelector: anchorSnapshot.listSelector,
        anchorSelector: anchorSnapshot.anchorSelector,
        selectors: anchorSnapshot.selectors,
      });
    }

    const searchReady = await waitForSearchReady(profileId, 5000);
    if (!searchReady) {
      await pressKey(profileId, 'Escape');
      await sleep(300);
      markNoProgress();
      continue;
    }

    const rows = Array.isArray(searchReady.rows) ? searchReady.rows : [];
    if (rows.length === 0) {
      await pressKey(profileId, 'PageDown');
      await sleep(400);
      markNoProgress();
      continue;
    }

    const candidatesSample = rows.slice(0, 10).map((row) => ({
      noteId: row?.noteId ? String(row.noteId) : null,
      href: row?.href ? String(row.href) : null,
    }));
    if (candidatesSample.length > 0) {
      state.collectAnchorsSample = candidatesSample;
    }

    const targetIndex = state.collectIndex || 0;
    if (targetIndex >= rows.length) {
      await pressKey(profileId, 'PageDown');
      await sleep(400);
      markNoProgress();
      continue;
    }

    const target = rows.find((row) => row.index === targetIndex) || rows[0];
    if (target?.noteId || target?.href) {
      state.collectLastClickTarget = {
        noteId: target?.noteId ? String(target.noteId) : null,
        selector: anchorSnapshot.anchorSelector || '.note-item',
        idx: targetIndex,
        text: null,
        url: target?.href ? String(target.href) : null,
      };
      state.lastClickTarget = state.collectLastClickTarget;
    }

    await handleCollectNoProgress({
      profileId,
      params: { ...params, keyword, env },
      context,
      stage: 'collect_links',
      expected: maxNotes,
      actual: state.collectPersistedCount,
      persistPath: linksPath,
      lastAnchor: state.collectLastAnchor,
      lastUrl: state.collectLastUrl,
      anchorsSample: state.collectAnchorsSample,
      lastClickTarget: state.collectLastClickTarget,
      listSelector: anchorSnapshot.listSelector,
      anchorSelector: anchorSnapshot.anchorSelector,
      selectors: anchorSnapshot.selectors,
      anchorCount: anchorSnapshot.anchorCount,
      visibleCount: anchorSnapshot.visibleCount,
      containerVisible: anchorSnapshot.containerVisible,
      noProgressRounds: state.collectNoProgressRounds,
      maxNoProgressRounds: collectNoProgressRounds,
    });
    if (!target?.center) {
      state.collectIndex = (state.collectIndex || 0) + 1;
      markNoProgress();
      continue;
    }

    if (state.preCollectedNoteIds.includes(target.noteId)) {
      state.collectIndex = (state.collectIndex || 0) + 1;
      markNoProgress();
      continue;
    }

    if (!target.inViewport) {
      await ensureSearchCandidateFullyVisible(profileId, target.noteId || '');
    }
    const clickInfo = await readClickTargetInfo(profileId, {
      noteId: target.noteId || '',
      href: target.href || '',
    });
    state.collectLastClickTarget = {
      noteId: target.noteId || clickInfo?.noteId || null,
      selector: clickInfo?.selector || anchorSnapshot.anchorSelector || null,
      idx: targetIndex,
      text: clickInfo?.text || null,
      url: clickInfo?.url || target.href || null,
    };
    state.lastClickTarget = state.collectLastClickTarget;
    await clickPoint(profileId, target.center, { steps: 3 });
    pushTrace({ kind: 'click', stage: 'open_detail', noteId: target.noteId, selector: target.selector, collectIndex: targetIndex });

    let openedDetail = await waitForDetailVisible(profileId, 5000);
    if (!openedDetail?.detailVisible) {
      let recovered = false;
      for (let attempt = 2; attempt <= collectIndexMaxAttempts; attempt += 1) {
        await clickPoint(profileId, target.center, { steps: 3 });
        pushTrace({ kind: 'click', stage: 'open_detail_retry', noteId: target.noteId, selector: target.selector, collectIndex: targetIndex, attempt });
        openedDetail = await waitForDetailVisible(profileId, 5000);
        if (openedDetail?.detailVisible) {
          recovered = true;
          break;
        }
      }
      if (!recovered) {
        if (collectIndexFailurePolicy === 'skip') {
          state.collectIndex = (state.collectIndex || 0) + 1;
          markNoProgress();
          continue;
        }
        return { ok: false, code: 'COLLECT_INDEX_OPEN_FAILED', message: `Index ${targetIndex} open failed after ${collectIndexMaxAttempts}` };
      }
    }

    const afterUrl = await readLocation(profileId);
      const detailSnapshot = await readDetailSnapshot(profileId);
    if (detailSnapshot?.noteIdFromUrl && !state.preCollectedNoteIds.includes(detailSnapshot.noteIdFromUrl)) {
      state.preCollectedNoteIds.push(detailSnapshot.noteIdFromUrl);
      const beforeCount = state.collectPersistedCount;
      emitOperationProgress(context, { kind: 'collect_candidate', stage: 'detail_snapshot', candidateCount: 1, persistPath: linksPath });
      const collectedAt = new Date().toISOString();
      const linkPayload = {
        noteId: detailSnapshot.noteIdFromUrl,
        safeDetailUrl: afterUrl,
        noteUrl: afterUrl,
        listUrl: state.lastListUrl,
        title: detailSnapshot?.title || null,
        author: {
          name: detailSnapshot?.authorName || null,
          id: detailSnapshot?.authorId || null,
          link: detailSnapshot?.authorLink || null,
        },
        collectedAt,
      };
      const mergeResult = await mergeLinksJsonl({
        filePath: linksPath,
        links: [linkPayload],
      });
      if (phase2LinksPath) {
        await mergeLinksJsonl({ filePath: phase2LinksPath, links: [linkPayload] }).catch(() => {});
      }
      emitOperationProgress(context, {
        kind: 'collect_persist',
        stage: 'detail_snapshot',
        added: mergeResult.added,
        deduped: mergeResult.existing + mergeResult.added - mergeResult.total,
        totalBefore: beforeCount,
        totalAfter: mergeResult.total,
        persistPath: linksPath,
      });
      if (mergeResult.added > 0) {
        state.collectPersistedCount = mergeResult.total;
        state.collectCount = mergeResult.total;
        markProgress();
        resetNoProgress();
        progressedThisRound = true;
        state.collectLastAnchor = detailSnapshot.noteIdFromUrl;
        state.collectLastUrl = afterUrl;
        resetAddedZero();
        if (detailSnapshot?.noteIdFromUrl) {
          const outputCtxForNote = resolveXhsOutputContext({ params: { keyword, env }, state, noteId: detailSnapshot.noteIdFromUrl });
          try {
            await writeContentMarkdown({
              filePath: outputCtxForNote.contentPath,
              imagesDir: outputCtxForNote.imagesDir,
              noteId: detailSnapshot.noteIdFromUrl,
              keyword,
              detailUrl: afterUrl,
              detail: detailSnapshot,
              includeImages: Boolean(params.doImages),
            });
          } catch {
            // ignore detail persist failure
          }
        }
      } else {
        progressedThisRound = false;
        markAddedZero();
      }
      pushTrace({ kind: 'collect', stage: 'link_collected', noteId: detailSnapshot.noteIdFromUrl, url: afterUrl, collectCount: state.collectCount });
      emitOperationProgress(context, { kind: 'collect', stage: 'link_collected', noteId: detailSnapshot.noteIdFromUrl, url: afterUrl, collectCount: state.collectCount });
    }

    state.collectIndex = (state.collectIndex || 0) + 1;
    await closeDetailToSearch(profileId, pushTrace);
    await waitForSearchReady(profileId, 5000);
    await sleep(300);
    if (!progressedThisRound && state.collectCount < maxNotes) {
      markNoProgress();
    }
    if (anchorSnapshot.anchorCount > 0 && (state.collectAddedZeroRounds || 0) >= collectAddedZeroRounds) {
      const error = new Error('COLLECT_ADDED_ZERO');
      error.code = 'COLLECT_ADDED_ZERO';
      error.details = {
        stage: 'collect_links',
        expected: maxNotes,
        actual: state.collectPersistedCount,
        persistPath: linksPath,
        anchorsSample: state.collectAnchorsSample,
        lastClickTarget: state.collectLastClickTarget,
      };
      throw error;
    }
  }

  state.tabState = {
    tabCount,
    limit: commentBudget,
    cursor: 1,
    used: Array.from({ length: tabCount }, () => 0),
  };
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
