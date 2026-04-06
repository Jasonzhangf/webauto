import { getProfileState, withSerializedLock } from './state.mjs';
import { buildTraceRecorder, emitActionTrace, emitOperationProgress } from '../../shared/trace.mjs';
import { resolveSearchLockKey, randomBetween, resolveSearchResultTokenLink, normalizeBaseNoteId, resolveSearchSubmitMethod } from './utils.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, readLocation, pressKey, fillInputValue, sleepRandom, evaluateReadonly, waitForAnchor, clickPoint } from './dom-ops.mjs';
import { readSearchInput, readSearchViewportReady, readSearchCandidates, readSearchButton } from './search-ops.mjs';
import { buildSelectorCheck, ensureActiveSession, maybeSelector } from '../../../container/runtime-core/index.mjs';
import { getDomSnapshotByProfile } from '../../../utils/browser-service.mjs';
import { resolveXhsOutputContext, mergeLinksJsonl, readJsonlRows } from './persistence.mjs';
import { dumpNoProgressDiagnostics } from './diagnostic-ops.mjs';
import { readXhsInteractionGuard, buildXhsGuardFailure } from './auth-ops.mjs';

const SEARCH_LIST_SELECTOR = '.feeds-container';
const SEARCH_ANCHOR_SELECTOR = '.note-item:has(a.cover)';
const SEARCH_BOTTOM_MARKER_KEYWORDS = ['没有更多', '到底了', '已显示全部', '没有更多内容', '没有更多了'];
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

async function readAnchorsSample(profileId) {
  const payload = await evaluateReadonly(profileId, buildAnchorsSampleScript(), { timeoutMs: 6000, onTimeout: 'return' });
  return Array.isArray(payload?.anchorsSample) ? payload.anchorsSample : [];
}

async function readSearchAnchors(profileId, { listSelector, anchorSelector, selectorsMeta } = {}) {
  const payload = await evaluateReadonly(profileId, buildSearchAnchorsScript(listSelector, anchorSelector), { timeoutMs: 6000, onTimeout: 'return' });
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

async function readSearchBottomMarker(profileId) {
  const script = `(() => {
    const keywords = ${JSON.stringify(SEARCH_BOTTOM_MARKER_KEYWORDS)};
    const nodes = Array.from(document.querySelectorAll('div,span,p'));
    for (const node of nodes) {
      const text = (node.innerText || '').trim();
      if (!text) continue;
      if (keywords.some((k) => text.includes(k))) {
        return { found: true, text, tag: node.tagName, className: node.className || null };
      }
    }
    return { found: false };
  })()`;
  const payload = await evaluateReadonly(profileId, script, { timeoutMs: 6000, onTimeout: 'return' });
  return payload && typeof payload === 'object' ? payload : { found: false };
}

function buildCollectScrollStuckError({
  stage,
  expected,
  actual,
  persistPath,
  lastUrl,
  noScrollRounds,
  maxNoScrollRounds,
} = {}) {
  const details = {
    stage: stage || 'collect_links',
    expected: Number(expected) || 0,
    actual: Number(actual) || 0,
    persistPath: persistPath || null,
    lastUrl: lastUrl || null,
    noScrollRounds: Number(noScrollRounds) || 0,
    maxNoScrollRounds: Number(maxNoScrollRounds) || 0,
  };
  const message = `COLLECT_SCROLL_STUCK stage=${details.stage} expected=${details.expected} actual=${details.actual} persistPath=${details.persistPath}`;
  const err = new Error(message);
  err.code = 'COLLECT_SCROLL_STUCK';
  err.details = details;
  return err;
}

function buildCollectReachedBottomError({
  stage,
  expected,
  actual,
  persistPath,
  lastUrl,
  marker,
} = {}) {
  const details = {
    stage: stage || 'collect_links',
    expected: Number(expected) || 0,
    actual: Number(actual) || 0,
    persistPath: persistPath || null,
    lastUrl: lastUrl || null,
    marker: marker || null,
  };
  const message = `COLLECT_REACHED_BOTTOM stage=${details.stage} expected=${details.expected} actual=${details.actual} persistPath=${details.persistPath}`;
  const err = new Error(message);
  err.code = 'COLLECT_REACHED_BOTTOM';
  err.details = details;
  return err;
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
  const payload = await evaluateReadonly(profileId, script, { timeoutMs: 6000, onTimeout: 'return' });
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



/**
 * waitCollectSettle - 锚点驱动的收集阶段等待
 * 用于 collect 阶段滚动后的 DOM 稳定等待，替代 waitSearchReadyOnce（后者依赖 submit_search 作用域变量）。
 * 最大等待时间内轮询锚点，锚点出现立即返回。
 */
async function waitCollectSettle(profileId, options = {}) {
  const {
    timeoutMs = 3000,
    intervalMs = 200,
    description = 'collect_settle',
  } = options;
  return waitForAnchor(profileId, {
    selectors: [
      '.feeds-container .note-item:has(a.cover)',
      '.search-result-list .note-item:has(a.cover)',
      '.note-item:has(a.cover)',
    ],
    timeoutMs,
    intervalMs,
    description,
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


export async function executeSubmitSearchOperation({ profileId, params = {}, context = {} }) {
  const lockKey = resolveSearchLockKey(params);
  const lockTimeoutMs = Math.max(2000, Number(params.lockTimeoutMs ?? 20000) || 20000);
  const lockId = lockKey ? `xhs_submit_search:${lockKey}` : '';
  return withSerializedLock(lockId, async () => {
    const profileState = getProfileState(profileId);
    const metrics = profileState.metrics || (profileState.metrics = {});
    const { actionTrace, pushTrace } = buildTraceRecorder();
    const testingOverrides = context?.testingOverrides && typeof context.testingOverrides === 'object'
      ? context.testingOverrides
      : null;
    const readSearchInputImpl = typeof testingOverrides?.readSearchInput === 'function' ? testingOverrides.readSearchInput : readSearchInput;
    const sleepRandomImpl = typeof testingOverrides?.sleepRandom === 'function' ? testingOverrides.sleepRandom : sleepRandom;
    const readLocationImpl = typeof testingOverrides?.readLocation === 'function' ? testingOverrides.readLocation : readLocation;
    const readCandidateWindowImpl = typeof testingOverrides?.readCandidateWindow === 'function' ? testingOverrides.readCandidateWindow : readCandidateWindow;
    const pressKeyImpl = typeof testingOverrides?.pressKey === 'function' ? testingOverrides.pressKey : pressKey;
    const readSearchViewportReadyImpl = typeof testingOverrides?.readSearchViewportReady === 'function'
      ? testingOverrides.readSearchViewportReady
      : readSearchViewportReady;

    const assertNoGuard = async (stage) => {
      const guard = await readXhsInteractionGuard({ profileId, params, testingOverrides });
      if (guard?.stopCode) {
        pushTrace({ kind: 'guard', stage, code: guard.stopCode, url: guard.url || null });
        return buildXhsGuardFailure({ profileId, guard, stage, codeMode: 'guard' });
      }
      return null;
    };

    const method = resolveSearchSubmitMethod(params); // 默认 Enter，Windows 可通过 submitMethod=click 启用按钮提交
    const keyword = String(params.keyword || '').trim();
    const env = String(params.env || profileState.env || 'debug').trim();
    const outputRoot = String(params.outputRoot || params.downloadRoot || params.rootDir || profileState.outputRoot || '').trim();
    const actionDelayMinMs = Math.max(300, Number(params.actionDelayMinMs ?? 500) || 500);
    const actionDelayMaxMs = Math.max(actionDelayMinMs, Number(params.actionDelayMaxMs ?? 1600) || 1600);
    const settleMinMs = Math.max(500, Number(params.settleMinMs ?? 1200) || 1200);
    const settleMaxMs = Math.max(settleMinMs, Number(params.settleMaxMs ?? 2800) || 2800);
    const searchReadyTimeoutMs = Math.max(2000, Number(params.searchReadyTimeoutMs ?? 12000) || 12000);
    const searchReadyPollMinMs = Math.max(120, Number(params.searchReadyPollMinMs ?? 260) || 260);
    const searchReadyPollMaxMs = Math.max(searchReadyPollMinMs, Number(params.searchReadyPollMaxMs ?? 700) || 700);
    const searchReadyRetryCount = Math.max(1, Number(params.searchReadyRetryCount ?? 3) || 3);


    const submitSearchPhaseStart = Date.now();
    const guardBeforeInput = await assertNoGuard('submit_search_before_input');
    if (guardBeforeInput) return guardBeforeInput;

    const input = await readSearchInputImpl(profileId);
    if (!input || input.ok !== true || !input.center) {
      throw new Error('SEARCH_INPUT_NOT_FOUND');
    }

    const tFillPhase = Date.now();
    pushTrace({ kind: 'fill_start', stage: 'submit_search', target: 'search_input' });
    let currentInput = input;
    let currentValue = String(currentInput?.value || '');
    if (keyword) {
      // 锚点等待：填充前等待输入框就绪（最大 actionDelayMaxMs，出现即返回）
      await waitForAnchor(profileId, { selectors: ['#search-input', 'input.search-input'], timeoutMs: Math.min(actionDelayMaxMs, 5000), intervalMs: 300, description: 'submit_pre_fill_anchor' });
      let fillResult;
      try {
        fillResult = await fillInputValue(
          profileId,
          ['#search-input', 'input.search-input'],
          keyword,
          { timeoutMs: 5000 },
        );
      } catch (fillError) {
        pushTrace({ kind: 'fill_input_error', stage: 'submit_search', error: String(fillError?.message || fillError) });
        return {
          ok: false,
          code: 'SEARCH_INPUT_FILL_FAILED',
          message: String(fillError?.message || fillError || 'fillInputValue failed'),
          data: { expected: keyword },
        };
      }
      pushTrace({
        kind: 'fill_input',
        stage: 'submit_search',
        target: 'search_input',
        selector: fillResult.selector,
        value: fillResult.value,
      });

      // 锚点等待：填充后等待输入框稳定（最大 actionDelayMaxMs，出现即返回）
      await waitForAnchor(profileId, { selectors: ['#search-input', 'input.search-input'], timeoutMs: Math.min(actionDelayMaxMs, 5000), intervalMs: 300, description: 'submit_after_fill_anchor' });
      currentInput = await readSearchInputImpl(profileId);
      if (!currentInput || currentInput.ok !== true) {
        return {
          ok: false,
          code: 'SEARCH_INPUT_VERIFY_FAILED',
          message: 'search input cannot be read after fill',
          data: { expected: keyword },
        };
      }
      currentValue = String(currentInput.value || '');
      const normalizedValue = currentValue.replace(/\s+/g, '').trim();
      const normalizedKeyword = keyword.replace(/\s+/g, '').trim();
      if (normalizedValue !== normalizedKeyword) {
        pushTrace({ kind: 'input_mismatch_final', stage: 'submit_search', expected: keyword, actual: currentValue, softFail: false });
        return {
          ok: false,
          code: 'SEARCH_INPUT_MISMATCH',
          message: 'search input mismatch after fill',
          data: { expected: keyword, actual: currentValue },
        };
      }
    }

    const tVerifyPhase = Date.now();
    const guardBeforeSubmit = await assertNoGuard('submit_search_before_submit');
    if (guardBeforeSubmit) return guardBeforeSubmit;

    const tSubmitPhase = Date.now();
    const beforeUrl = await readLocationImpl(profileId);
    let via = method;
    // 单一真源：默认只使用 Enter 提交搜索（Windows 可按 submitMethod=click 启用按钮提交）
    const triggerSubmitOnce = async (attempt = 1) => {
      if (method === 'click') {
        await waitForAnchor(profileId, {
          selectors: ['.input-button', '.input-button .search-icon'],
          timeoutMs: Math.min(actionDelayMaxMs, 5000),
          intervalMs: 300,
          description: 'submit_search_button_anchor',
        });
        const button = await readSearchButton(profileId);
        if (!button?.ok || !button.center) {
          throw new Error(`SEARCH_BUTTON_NOT_FOUND:${String(button?.reason || 'unknown')}`);
        }
        try {
          await clickPoint(profileId, button.center, { timeoutMs: 8000,
            postAnchor: { type: 'exist', selector: '#search-result, .search-result-container, .note-item', timeoutMs: 5000 } });
          pushTrace({ kind: 'click', stage: 'submit_search', target: 'search_button', attempt });
        } catch (error) {
          pushTrace({ kind: 'click_error', stage: 'submit_search', target: 'search_button', attempt, error: String(error?.message || error) });
        }
        via = 'click';
        return;
      }
      try {
        await pressKeyImpl(profileId, 'Enter');
        pushTrace({ kind: 'key', stage: 'submit_search', key: 'Enter', attempt });
      } catch (error) {
        pushTrace({ kind: 'key_error', stage: 'submit_search', key: 'Enter', attempt, error: String(error?.message || error) });
      }
      via = 'Enter';
    };

    const waitSearchReadyOnce = async (attempt = 1) => {
      const startedAt = Date.now();
      let lastSnapshot = null;
      while ((Date.now() - startedAt) < searchReadyTimeoutMs) {
        const guardDuringWait = await assertNoGuard(`submit_search_wait_ready_${attempt}`);
        if (guardDuringWait) return { ready: false, guardResult: guardDuringWait };
        try {
          lastSnapshot = await readSearchViewportReadyImpl(profileId);
        } catch (error) {
          const errText = String(error?.code || error?.message || error);
          pushTrace({
            kind: 'error',
            stage: 'submit_wait_viewport_ready',
            attempt,
            error: errText,
          });
          lastSnapshot = {
            readySelector: '',
            visibleNoteCount: 0,
            hasList: false,
            hasInput: false,
            inputHasValue: false,
            href: '',
            error: errText,
          };
        }
        const readySelector = String(lastSnapshot?.readySelector || '').trim();
        const visibleNoteCount = Math.max(0, Number(lastSnapshot?.visibleNoteCount || 0) || 0);
        const anchorFound = lastSnapshot?.anchorFound === true || lastSnapshot?.hasList === true;
        const currentHref = String(lastSnapshot?.href || '');
        // 单一真源：搜索成功必须 URL 发生变化（不能仍在 /explore）
        const urlChanged = currentHref !== beforeUrl && !currentHref.includes('/explore');
        if ((readySelector || visibleNoteCount > 0 || anchorFound) && urlChanged) {
          return {
            ready: true,
            readySelector: readySelector || (anchorFound ? '.search-result-list' : null),
            visibleNoteCount,
            elapsedMs: Math.max(0, Date.now() - startedAt),
            href: String(lastSnapshot?.href || ''),
            lastSnapshot,
          };
        }
        const waitMs = randomBetween(searchReadyPollMinMs, searchReadyPollMaxMs);
        pushTrace({ kind: 'wait', stage: 'submit_wait_viewport_ready', attempt, waitMs, elapsedMs: Math.max(0, Date.now() - startedAt), visibleNoteCount });
        // 锚点等待：不是傻等，最长 waitMs，锚点出现立即返回
        await waitForAnchor(profileId, {
          selectors: ['#search-result .note-item:has(a.cover)', '.search-result-list', '.feeds-container .note-item:has(a.cover)'],
          timeoutMs: waitMs,
          intervalMs: Math.max(120, Math.min(300, Math.floor(waitMs / 2))),
          description: 'submit_search_wait_ready_anchor',
        });
      }
      return { ready: false, readySelector: null, visibleNoteCount: 0, elapsedMs: searchReadyTimeoutMs, href: String(lastSnapshot?.href || ''), lastSnapshot };
    };

    await triggerSubmitOnce(1);
    const readyResult = await waitSearchReadyOnce(1);
    pushTrace({ kind: 'elapsed', stage: 'submit_search', phase: 'submit_and_wait', elapsedMs: Date.now() - tSubmitPhase });
    if (readyResult.guardResult) return readyResult.guardResult;
    if (!readyResult.ready) {
      for (let retry = 2; retry <= searchReadyRetryCount; retry += 1) {
        const guardBeforeRetry = await assertNoGuard(`submit_search_before_retry_${retry}`);
        if (guardBeforeRetry) return guardBeforeRetry;
        await triggerSubmitOnce(retry);
        const retryResult = await waitSearchReadyOnce(retry);
        if (retryResult.guardResult) return retryResult.guardResult;
        if (retryResult.ready) {
          readyResult.ready = true;
          readyResult.readySelector = retryResult.readySelector;
          readyResult.visibleNoteCount = retryResult.visibleNoteCount;
          readyResult.elapsedMs = retryResult.elapsedMs;
          readyResult.href = retryResult.href;
          readyResult.lastSnapshot = retryResult.lastSnapshot || readyResult.lastSnapshot;
          break;
        }
      }
    }
    if (!readyResult.ready) {
      const inputAfter = await readSearchInputImpl(profileId).catch(() => null);
      return {
        ok: false,
        code: 'SEARCH_VIEWPORT_READY_TIMEOUT',
        message: 'search viewport not ready within timeout',
        data: {
          readySelector: readyResult.readySelector || null,
          visibleNoteCount: readyResult.visibleNoteCount || 0,
          href: readyResult.href || null,
          lastSnapshot: readyResult.lastSnapshot || null,
          anchorFound: readyResult.lastSnapshot?.anchorFound === true,
          anchor: readyResult.lastSnapshot?.anchor || null,
          inputValue: String(inputAfter?.value || ''),
          timeoutMs: searchReadyTimeoutMs,
          retries: searchReadyRetryCount,
        },
      };
    }

    const windowBefore = await readCandidateWindowImpl(profileId, Number(params.index ?? 0));
    const afterUrl = await readLocationImpl(profileId);
    const windowAfter = await readCandidateWindowImpl(profileId, Number(params.index ?? 0));
    profileState.keyword = keyword || profileState.keyword;
    profileState.env = env || profileState.env;
    profileState.outputRoot = outputRoot || profileState.outputRoot;
    profileState.downloadRoot = outputRoot || profileState.downloadRoot;
    profileState.rootDir = outputRoot || profileState.rootDir;
    profileState.lastListUrl = afterUrl || beforeUrl || null;
    metrics.searchCount = Math.max(0, Number(metrics.searchCount || 0) || 0) + 1;
    metrics.lastSearchAt = new Date().toISOString();

          totalElapsedMs: Date.now() - submitSearchPhaseStart,
    emitActionTrace(context, actionTrace, { stage: 'xhs_submit_search' });
    return { ok: true, code: 'OPERATION_DONE', message: 'xhs_submit_search done', data: { keyword: keyword || null, method: via, beforeUrl, afterUrl, searchReady: readyResult.ready, readySelector: readyResult.readySelector || null, visibleNoteCount: readyResult.visibleNoteCount, elapsedMs: readyResult.elapsedMs, searchCount: metrics.searchCount, indexWindowBefore: windowBefore, indexWindowAfter: windowAfter } };
  }, { timeoutMs: lockTimeoutMs }).catch((error) => {
    if (String(error?.code || '') === 'LOCK_TIMEOUT') {
      return {
        ok: false,
        code: 'LOCK_TIMEOUT',
        message: 'submit_search lock wait timeout',
        data: { lockId, timeoutMs: lockTimeoutMs },
      };
    }
    throw error;
  });
}

export async function executeCollectLinksOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const testingOverrides = context?.testingOverrides && typeof context.testingOverrides === 'object'
    ? context.testingOverrides
    : null;
  const readJsonlRowsImpl = typeof testingOverrides?.readJsonlRows === 'function' ? testingOverrides.readJsonlRows : readJsonlRows;
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
  const env = String(params.env || state.env || 'debug').trim();
  const outputRoot = String(params.outputRoot || params.downloadRoot || params.rootDir || state.outputRoot || '').trim();
  state.keyword = keyword || state.keyword;
  state.env = env || state.env;
  state.outputRoot = outputRoot || state.outputRoot;
  state.downloadRoot = outputRoot || state.downloadRoot;
  state.rootDir = outputRoot || state.rootDir;
  const outputCtx = resolveXhsOutputContext({
    params: {
      keyword,
      env,
      outputRoot,
      runId: String(context.runId || null).trim(),
    },
    state,
  });
  const explicitLinksPath = String(params.sharedHarvestPath || params.sharedClaimPath || '').trim();
  const linksPath = explicitLinksPath || outputCtx.safeDetailPath || outputCtx.linksPath;
  const phase2LinksPath = null;

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

  // Terminal state tracking
  state.collectScrollStuckRounds = typeof state.collectScrollStuckRounds === 'number' ? state.collectScrollStuckRounds : 0;
  state.collectDuplicateOnlyRounds = typeof state.collectDuplicateOnlyRounds === 'number' ? state.collectDuplicateOnlyRounds : 0;
  state.collectLastScrollHeight = typeof state.collectLastScrollHeight === 'number' ? state.collectLastScrollHeight : 0;
  state.collectScrollRollbackNeeded = false;
  const maxScrollStuckRounds = 3;
  const maxDuplicateOnlyRounds = 5;

  const readListScrollInfo = async () => {
    const script = `(() => { const listNode = document.querySelector(".feeds-container"); return { scrollTop: listNode ? listNode.scrollTop : 0, scrollHeight: listNode ? listNode.scrollHeight : 0, clientHeight: listNode ? listNode.clientHeight : 0 }; })()`;
    const payload = await evaluateReadonly(profileId, script, { timeoutMs: 6000, onTimeout: 'return' });
    return { scrollTop: Number(payload?.scrollTop || 0), scrollHeight: Number(payload?.scrollHeight || 0), clientHeight: Number(payload?.clientHeight || 0) };
  };
  state.collectLastUrl = state.collectLastUrl || null;

  if (state.preCollectedNoteIds.length === 0) {
    const existing = await readJsonlRowsImpl(linksPath);
    for (const row of existing) {
      const noteIdRaw = String(row?.noteId || row?.noteUrl || row?.safeDetailUrl || '').trim();
      const noteId = normalizeBaseNoteId(noteIdRaw);
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

  state.collectScrollStuckRounds = 0;
  state.collectDuplicateOnlyRounds = 0;
  state.collectLastScrollHeight = 0;
  state.collectScrollRollbackNeeded = false;
  const lastProgressAt = () => Number(state.collectLastProgressAt || 0) || 0;
  const markProgress = () => { state.collectLastProgressAt = Date.now(); };
  const markNoProgress = () => {
    state.collectNoProgressRounds = (state.collectNoProgressRounds || 0) + 1;
  };
  const resetNoProgress = () => { state.collectNoProgressRounds = 0; };
  const markAddedZero = () => { state.collectAddedZeroRounds = (state.collectAddedZeroRounds || 0) + 1; };
  const resetAddedZero = () => { state.collectAddedZeroRounds = 0; };

  const markScrollStuck = () => { state.collectScrollStuckRounds = (state.collectScrollStuckRounds || 0) + 1; };
  const resetScrollStuck = () => { state.collectScrollStuckRounds = 0; };
  const markDuplicateOnly = () => { state.collectDuplicateOnlyRounds = (state.collectDuplicateOnlyRounds || 0) + 1; };
  const resetDuplicateOnly = () => { state.collectDuplicateOnlyRounds = 0; };

  const checkScrollMove = async (beforeScroll, afterScroll) => {
    const moved = Math.abs(afterScroll.scrollTop - beforeScroll.scrollTop) > 5 || Math.abs(afterScroll.scrollHeight - beforeScroll.scrollHeight) > 5;
    return moved;
  };

  const executeScroll = async () => {
    if (state.collectScrollRollbackNeeded) {
      const before = await readSearchViewportReady(profileId).catch(() => null);
      await pressKey(profileId, 'PageUp');
      await waitCollectSettle(profileId, { timeoutMs: 5000, description: 'collect_scroll_settle' });
      const after = await readSearchViewportReady(profileId).catch(() => null);
      state.collectScrollRollbackNeeded = false;
      return { before, after };
    }
    const before = await readSearchViewportReady(profileId).catch(() => null);
    await pressKey(profileId, 'PageDown');
    await waitCollectSettle(profileId, { timeoutMs: 5000, description: 'collect_scroll_settle' });
    const after = await readSearchViewportReady(profileId).catch(() => null);
    return { before, after };
  };
  const seedProgress = () => { if (!lastProgressAt()) markProgress(); };
  seedProgress();
  while (state.collectCount < maxNotes) {
    let progressedThisRound = false;
    const selectorsMeta = await loadSearchSelectors();

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
         // Only persist links with valid token (detailUrl will be empty if token is missing/invalid)
          if (!resolved?.detailUrl || !resolved.noteId) return null;
          const baseNoteId = normalizeBaseNoteId(resolved.noteId || resolved.detailUrl);
          if (!baseNoteId) return null;
         return {
           noteId: baseNoteId,
           safeDetailUrl: resolved.detailUrl,
           noteUrl: resolved.detailUrl,
           listUrl: state.lastListUrl,
           collectedAt,
         };
       }).filter(Boolean);

       if (candidates.length > 0) {
          const remaining = Math.max(0, maxNotes - state.collectPersistedCount);
          if (remaining <= 0) {
            continue;
          }
          const filtered = [];
          for (const candidate of candidates) {
            const noteIdRaw = String(candidate?.noteId || candidate?.noteUrl || candidate?.safeDetailUrl || '').trim();
            const noteId = normalizeBaseNoteId(noteIdRaw);
            if (noteId && !state.preCollectedNoteIds.includes(noteId)) {
              state.preCollectedNoteIds.push(noteId);
              filtered.push({ ...candidate, noteId });
            }
            if (filtered.length >= remaining) break;
          }
          if (filtered.length === 0) {
            markAddedZero();
            markDuplicateOnly();
            progressedThisRound = false;
          } else {
          const beforeCount = state.collectPersistedCount;
          emitOperationProgress(context, { kind: 'collect_candidate', stage: 'search_result_tokens', candidateCount: filtered.length, persistPath: linksPath });
          const mergeResult = await mergeLinksJsonl({ filePath: linksPath, links: filtered });
          if (phase2LinksPath) {
            await mergeLinksJsonl({ filePath: phase2LinksPath, links: filtered }).catch(() => {});
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
            const lastCandidate = candidates[candidates.length - 1];
            state.collectLastAnchor = lastCandidate?.noteId || state.collectLastAnchor;
            state.collectLastUrl = lastCandidate?.safeDetailUrl || state.collectLastUrl || state.lastListUrl || null;
          } else {
            markAddedZero();
            markDuplicateOnly();
            progressedThisRound = false;
          }
          if (state.collectCount >= maxNotes) {
            continue;
          }
       }
       }
     }
   }
   if (anchorSnapshot.visibleCount === 0) {
     await pressKey(profileId, 'PageDown');
      // Anchor wait: wait for search anchors to appear after PageDown
      for (let i = 0; i < 6; i += 1) {
        const retried = await readSearchAnchors(profileId, {
          listSelector: selectorsMeta.listSelector,
          anchorSelector: selectorsMeta.anchorSelector,
          selectorsMeta: selectorsMeta.selectors,
        });
        if (retried.visibleCount > 0) {
          anchorSnapshot = retried;
          state.collectAnchorsSample = normalizeAnchorsSample(await readAnchorsSample(profileId));
          break;
        }
        await sleep(120);
      }
   }
   if (anchorSnapshot.visibleCount === 0 && anchorSnapshot.containerVisible === false) {
      state.collectAnchorEmptyRounds = (state.collectAnchorEmptyRounds || 0) + 1;
    } else {
      state.collectAnchorEmptyRounds = 0;
    }
    if (state.collectAnchorEmptyRounds >= collectAnchorEmptyRounds) {
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
    if (!progressedThisRound && state.collectCount < maxNotes) {
      markNoProgress();
    }



    // Terminal state checks before scroll
    const bottomMarker = await readSearchBottomMarker(profileId);
    if (bottomMarker && bottomMarker.found) {
      const lastUrl = await readLocation(profileId, { timeoutMs: 3000 });
      throw buildCollectReachedBottomError({
        stage: 'collect_links',
        expected: maxNotes,
        actual: state.collectPersistedCount,
        persistPath: linksPath,
        lastUrl,
        marker: bottomMarker,
      });
    }

    // Check if all links are duplicates
    if (progressedThisRound === false && state.collectCount < maxNotes) {
      markDuplicateOnly();    } else {
      resetDuplicateOnly();    }
    if (state.collectDuplicateOnlyRounds >= maxDuplicateOnlyRounds) {
      const lastUrl = await readLocation(profileId, { timeoutMs: 3000 });      const error = new Error('COLLECT_DUPLICATE_EXHAUSTED');
      error.code = 'COLLECT_DUPLICATE_EXHAUSTED';
      error.details = {
        stage: 'collect_links',
        expected: maxNotes,
        actual: state.collectPersistedCount,
        persistPath: linksPath,
        lastUrl,
        duplicateRounds: state.collectDuplicateOnlyRounds,
        anchorsSample: state.collectAnchorsSample,
     };
     throw error;
   }
   // Scroll with rollback check
   const beforeScroll = await readListScrollInfo();
   await pressKey(profileId, 'PageDown');
    // Anchor wait: wait for scroll to move after PageDown
    let moved = false;
    for (let i = 0; i < 6; i += 1) {
      const afterScroll = await readListScrollInfo();
      moved = await checkScrollMove(beforeScroll, afterScroll);
      if (moved) break;
      await sleep(120);
    }
   if (!moved) {
     if (state.collectScrollRollbackNeeded) {
       markScrollStuck();
       state.collectScrollRollbackNeeded = false;
     } else {
       state.collectScrollRollbackNeeded = true;
       resetScrollStuck();
     }
   } else {
     resetScrollStuck();
     state.collectScrollRollbackNeeded = false;
   }
   if (state.collectScrollStuckRounds >= maxScrollStuckRounds) {
     const lastUrl = await readLocation(profileId, { timeoutMs: 3000 });      throw buildCollectScrollStuckError({
        stage: 'collect_links',
        expected: maxNotes,
        actual: state.collectPersistedCount,
        persistPath: linksPath,
        lastUrl,
        noScrollRounds: state.collectScrollStuckRounds,
        maxNoScrollRounds: maxScrollStuckRounds,
      });
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
