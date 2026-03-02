import path from 'node:path';
import fsp from 'node:fs/promises';
import { asErrorPayload, normalizeArray } from '../../container/runtime-core/utils.mjs';
import { callAPI } from '../../utils/browser-service.mjs';
import {
  extractEvaluateResultData,
  extractScreenshotBase64,
  runEvaluateScript,
} from './xhs/common.mjs';
import {
  compileLikeRules,
  matchLikeText,
  normalizeText,
} from './xhs/like-rules.mjs';
import {
  appendLikedSignature,
  ensureDir,
  loadLikedSignatures,
  makeLikeSignature,
  readJsonlRows,
  mergeLinksJsonl,
  mergeCommentsJsonl,
  resolveXhsOutputContext,
  savePngBase64,
  writeJsonFile,
} from './xhs/persistence.mjs';
import {
  defaultProfileState,
  getProfileState,
  withSerializedLock,
} from './xhs/state.mjs';
import {
  emitOperationProgress,
  emitActionTrace,
  buildTraceRecorder,
} from './xhs/trace.mjs';
import {
  replaceEvaluateResultData,
  normalizeNoteIdList,
  extractNoteIdFromHref,
  readXsecTokenFromUrl,
  resolveSharedClaimPath,
  resolveSearchLockKey,
  clamp,
  randomBetween,
  normalizeInlineText,
  sanitizeAuthorText,
  buildElementCollectability,
  handleRaiseError,
} from './xhs/utils.mjs';
import {
  sleep,
  withTimeout,
  evaluateReadonly,
  readLocation,
  clickPoint,
  wheel,
  pressKey,
  clearAndType,
  resolveSelectorTarget,
} from './xhs/dom-ops.mjs';
import {
  readSearchInput,
  readSearchCandidates,
  readSearchCandidateByNoteId,
  readSearchHitAtPoint,
  ensureSearchCandidateFullyVisible,
  readSearchViewportReady,
  paintSearchCandidates,
} from './xhs/search-ops.mjs';
import {
  isDetailVisible,
  readDetailCloseTarget,
  closeDetailToSearch,
  readDetailSnapshot,
  readExpandButtons,
} from './xhs/detail-ops.mjs';
import {
  readCommentsSnapshot,
  readLikeTargetByIndex,
  readReplyTargetByIndex,
  readReplyInputTarget,
  readReplyInputValue,
  readReplySendButtonTarget,
} from './xhs/comments-ops.mjs';

async function sleepRandom(minMs, maxMs, pushTrace, stage, extra = {}) {
  const delay = randomBetween(minMs, maxMs);
  if (typeof pushTrace === 'function') {
    pushTrace({
      action: 'sleep',
      stage,
      delay,
      ...extra,
    });
  }
  await sleep(delay);
  return delay;
}
async function captureScreenshotToFile({ profileId, filePath }) {
  try {
    const payload = await callAPI('screenshot', { profileId, fullPage: false });
    const base64 = extractScreenshotBase64(payload);
    if (!base64) return null;
    return savePngBase64(filePath, base64);
  } catch {
    return null;
  }
}

function sanitizeFileComponent(value, fallback = 'unknown') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const cleaned = text.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || fallback;
}

async function captureOperationFailure({
  profileId,
  params = {},
  context = {},
  stage = 'operation',
  noteId = '',
  reason = 'operation_failed',
  extra = {},
}) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({
    params,
    state,
    noteId: state.currentNoteId || noteId || params.noteId,
  });
  const diagnosticsDir = path.join(output.keywordDir, 'diagnostics', 'operation-failures');
  await ensureDir(diagnosticsDir);

  const runId = String(params.runId || context.runId || '').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `failure-${sanitizeFileComponent(runId, 'run')}-${sanitizeFileComponent(stage, 'stage')}-${sanitizeFileComponent(noteId || 'note', 'note')}-${stamp}`;
  const jsonPath = path.join(diagnosticsDir, `${baseName}.json`);
  const pngPath = path.join(diagnosticsDir, `${baseName}.png`);

  const screenshotPath = await captureScreenshotToFile({ profileId, filePath: pngPath });
  const payload = {
    runId: runId || null,
    stage,
    noteId: String(noteId || '').trim() || null,
    reason: String(reason || '').trim() || null,
    keyword: params.keyword || output.keyword,
    env: params.env || output.env,
    outputRoot: output.root,
    capturedAt: new Date().toISOString(),
    screenshotPath,
    extra,
  };

  await writeJsonFile(jsonPath, payload);

  emitOperationProgress(context, {
    kind: 'failure_snapshot',
    stage,
    noteId: payload.noteId,
    reason: payload.reason,
    jsonPath,
    screenshotPath,
  });

  return { jsonPath, screenshotPath };
}

function buildTimeoutDomSnapshotScript() {
  return `(() => {
    const detailSelectors = [
      '.note-detail-mask',
      '.note-detail-page',
      '.note-detail-dialog',
      '.note-detail-mask .detail-container',
      '.note-detail-mask .media-container',
      '.note-detail-mask .note-scroller',
      '.note-detail-mask .note-content',
      '.note-detail-mask .interaction-container',
      '.note-detail-mask .comments-container',
      '.note-scroller',
      '.note-content',
      '.interaction-container',
      '.media-container',
      '.comments-container',
      '.comments-el',
    ];
    const searchSelectors = ['.note-item', '.search-result-list', '#search-input', '.feeds-page'];
    const isVisible = (node, opts = {}) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        const opacity = Number.parseFloat(String(style.opacity || '1'));
        if (Number.isFinite(opacity) && opacity <= 0.01) return false;
      } catch {
        return false;
      }
      const requireHit = opts?.requireHit !== false;
      if (!requireHit) return true;
      const sampleX = Math.max(0, Math.min((window.innerWidth || 1) - 1, rect.left + rect.width / 2));
      const sampleY = Math.max(0, Math.min((window.innerHeight || 1) - 1, rect.top + rect.height / 2));
      const top = document.elementFromPoint(sampleX, sampleY);
      if (!top) return false;
      return top === node || node.contains(top) || top.contains(node);
    };
    const hasVisible = (selectors, opts) => selectors.some((selector) => isVisible(document.querySelector(selector), opts));
    const href = String(location.href || '');
    const detailUrlHit = /xsec_token=/i.test(href) || /\/explore\//i.test(href) || /\/discovery\/item\//i.test(href);
    const detailVisible = detailUrlHit || hasVisible(detailSelectors, { requireHit: false });
    const searchVisible = hasVisible(searchSelectors, { requireHit: true });
    const closeNode = document.querySelector('.note-detail-mask .close-icon, .note-detail-mask button.close-icon, .note-detail-close');
    const closeRect = closeNode ? closeNode.getBoundingClientRect() : null;
    const html = document.documentElement ? document.documentElement.outerHTML : '';
    const active = document.activeElement instanceof Element ? document.activeElement : null;
    return {
      href,
      title: String(document.title || ''),
      readyState: String(document.readyState || ''),
      viewport: {
        width: Number(window.innerWidth || 0),
        height: Number(window.innerHeight || 0),
        scrollX: Number(window.scrollX || 0),
        scrollY: Number(window.scrollY || 0),
      },
      detailVisible,
      searchVisible,
      counts: {
        noteItem: Number(document.querySelectorAll('.note-item').length || 0),
        commentItem: Number(document.querySelectorAll('.comment-item, [class*="comment-item"]').length || 0),
      },
      active: active
        ? {
          tag: String(active.tagName || ''),
          id: String(active.id || ''),
          className: String(active.className || '').slice(0, 180),
        }
        : null,
      closeRect: closeRect
        ? {
          left: Number(closeRect.left || 0),
          top: Number(closeRect.top || 0),
          width: Number(closeRect.width || 0),
          height: Number(closeRect.height || 0),
        }
        : null,
      domLength: html.length,
      domSnippet: html.slice(0, 50000),
      capturedAt: new Date().toISOString(),
    };
  })()`;
}

async function executeTimeoutSnapshotOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({
    params,
    state,
    noteId: state.currentNoteId || params.noteId,
  });
  const diagnosticsDir = path.join(output.keywordDir, 'diagnostics', 'timeouts');
  await ensureDir(diagnosticsDir);

  const runId = String(params.runId || context.runId || '').trim();
  const operationId = String(params.operationId || params.operationAction || 'operation').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `timeout-${sanitizeFileComponent(runId, 'run')}-${sanitizeFileComponent(operationId, 'operation')}-${stamp}`;
  const jsonPath = path.join(diagnosticsDir, `${baseName}.json`);
  const pngPath = path.join(diagnosticsDir, `${baseName}.png`);

  let domSnapshot = null;
  let domError = null;
  try {
    domSnapshot = await evaluateReadonly(profileId, buildTimeoutDomSnapshotScript());
  } catch (err) {
    domError = String(err?.message || err || 'dom_snapshot_failed');
  }

  const screenshotPath = await captureScreenshotToFile({ profileId, filePath: pngPath });

  const payload = {
    runId: runId || null,
    operationId: params.operationId || null,
    operationAction: params.operationAction || null,
    timeoutMs: Number(params.timeoutMs || 0),
    failureCode: params.failureCode || null,
    failureMessage: params.failureMessage || null,
    subscriptionId: params.subscriptionId || null,
    keyword: params.keyword || output.keyword,
    env: params.env || output.env,
    outputRoot: output.root,
    capturedAt: new Date().toISOString(),
    screenshotPath,
    domError,
    domSnapshot,
  };

  await writeJsonFile(jsonPath, payload);

  emitOperationProgress(context, {
    kind: 'timeout_snapshot',
    jsonPath,
    screenshotPath,
    href: domSnapshot?.href || null,
    detailVisible: domSnapshot?.detailVisible === true,
    searchVisible: domSnapshot?.searchVisible === true,
  });

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_timeout_snapshot done',
    data: {
      jsonPath,
      screenshotPath,
      domError,
      detailVisible: domSnapshot?.detailVisible === true,
      searchVisible: domSnapshot?.searchVisible === true,
    },
  };
}

function buildAssertLoggedInScript(params = {}) {
  const selectors = Array.isArray(params.loginSelectors) && params.loginSelectors.length > 0
    ? params.loginSelectors.map((item) => String(item || '').trim()).filter(Boolean)
    : [
      '.login-container',
      '.login-dialog',
      '#login-container',
    ];
  const loginPattern = String(
    params.loginPattern || '登录|扫码|验证码|手机号|请先登录|注册|sign\\s*in',
  ).trim();

  return `(() => {
    const guardSelectors = ${JSON.stringify(selectors)};
    const loginPattern = new RegExp(${JSON.stringify(loginPattern || '登录|扫码|验证码|手机号|请先登录|注册|sign\\\\s*in')}, 'i');

    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const guardNodes = guardSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const visibleGuardNodes = guardNodes.filter((node) => isVisible(node));
    const guardTexts = visibleGuardNodes
      .slice(0, 10)
      .map((node) => normalize(node.textContent || ''))
      .filter(Boolean);
    const mergedGuardText = guardTexts.join(' ');
    const hasLoginText = loginPattern.test(mergedGuardText);
    const loginUrl = /\\/login|signin|passport|account\\/login/i.test(String(location.href || ''));

    let accountId = '';
    try {
      const initialState = (typeof window !== 'undefined' && window.__INITIAL_STATE__) || null;
      const rawUserInfo = initialState && initialState.user && initialState.user.userInfo
        ? (
          (initialState.user.userInfo._rawValue && typeof initialState.user.userInfo._rawValue === 'object' && initialState.user.userInfo._rawValue)
          || (initialState.user.userInfo._value && typeof initialState.user.userInfo._value === 'object' && initialState.user.userInfo._value)
          || (typeof initialState.user.userInfo === 'object' ? initialState.user.userInfo : null)
        )
        : null;
      accountId = normalize(rawUserInfo?.user_id || rawUserInfo?.userId || '');
    } catch {}

    if (!accountId) {
      const selfAnchor = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'))
        .find((node) => {
          const text = normalize(node.textContent || '');
          const title = normalize(node.getAttribute('title') || '');
          const aria = normalize(node.getAttribute('aria-label') || '');
          return ['我', '我的', '个人主页', '我的主页'].includes(text)
            || ['我', '我的', '个人主页', '我的主页'].includes(title)
            || ['我', '我的', '个人主页', '我的主页'].includes(aria);
        });
      if (selfAnchor) {
        const href = normalize(selfAnchor.getAttribute('href') || '');
        const matched = href.match(/\\/user\\/profile\\/([^/?#]+)/);
        if (matched && matched[1]) accountId = normalize(matched[1]);
      }
    }

    const hasAccountSignal = Boolean(accountId);
    const hasLoginGuard = (visibleGuardNodes.length > 0 && hasLoginText) || loginUrl;

    return {
      hasLoginGuard,
      hasAccountSignal,
      accountId: accountId || null,
      url: String(location.href || ''),
      visibleGuardCount: visibleGuardNodes.length,
      guardTextPreview: mergedGuardText.slice(0, 240),
      loginUrl,
      hasLoginText,
      guardSelectors,
    };
  })()`;
}

async function executeAssertLoggedInOperation({ profileId, params = {} }) {
  const payload = await runEvaluateScript({
    profileId,
    script: buildAssertLoggedInScript(params),
    highlight: false,
  });
  const data = extractEvaluateResultData(payload) || {};
  if (data?.hasLoginGuard === true) {
    const code = String(params.code || 'LOGIN_GUARD_DETECTED').trim() || 'LOGIN_GUARD_DETECTED';
    return asErrorPayload('OPERATION_FAILED', code, { guard: data });
  }
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_assert_logged_in done',
    data,
  };
}

async function executeSubmitSearchOperation({
  profileId,
  params = {},
  context = {},
}) {
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
        const target = await resolveSelectorTarget(profileId, [
          '.input-button .search-icon',
          '.input-button',
          'button.min-width-search-icon',
        ], { requireViewport: true });
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
          return {
            ready: true,
            readySelector: readySelector || null,
            visibleNoteCount,
            elapsedMs: Math.max(0, Date.now() - startedAt),
            href: String(lastSnapshot?.href || ''),
          };
        }
        const waitMs = randomBetween(searchReadyPollMinMs, searchReadyPollMaxMs);
        pushTrace({
          kind: 'wait',
          stage: 'submit_wait_viewport_ready',
          attempt,
          waitMs,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          visibleNoteCount,
        });
        await sleep(waitMs);
      }
      return {
        ready: false,
        readySelector: String(lastSnapshot?.readySelector || '').trim() || null,
        visibleNoteCount: Math.max(0, Number(lastSnapshot?.visibleNoteCount || 0) || 0),
        elapsedMs: Math.max(0, Date.now() - startedAt),
        href: String(lastSnapshot?.href || ''),
      };
    };

    let searchReady = null;
    for (let attempt = 1; attempt <= searchReadyRetryCount; attempt += 1) {
      await triggerSubmitOnce(attempt);
      searchReady = await waitSearchReadyOnce(attempt);
      if (searchReady?.ready) break;
      if (attempt < searchReadyRetryCount) {
        const retryWaitMs = randomBetween(settleMinMs, settleMaxMs);
        pushTrace({
          kind: 'wait',
          stage: 'submit_retry_backoff',
          attempt,
          waitMs: retryWaitMs,
        });
        await sleep(retryWaitMs);
      }
    }
    if (!searchReady?.ready) {
      throw new Error('SEARCH_RESULTS_NOT_READY');
    }

    const afterUrl = await readLocation(profileId);

    metrics.searchCount = Number(metrics.searchCount || 0) + 1;
    metrics.lastSearchAt = new Date().toISOString();
    if (keyword) profileState.keyword = keyword;

    emitActionTrace(context, actionTrace, { stage: 'xhs_submit_search' });

    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_submit_search done',
      data: {
        submitted: true,
        via,
        beforeUrl,
        afterUrl,
        method,
        readySelector: searchReady?.readySelector || null,
        readyVisibleNotes: Math.max(0, Number(searchReady?.visibleNoteCount || 0) || 0),
        readyElapsedMs: Math.max(0, Number(searchReady?.elapsedMs || 0) || 0),
        searchCount: Number(metrics.searchCount || 0),
      },
    };
  });
}

async function executeOpenDetailOperation({
  profileId,
  params = {},
  context = {},
}) {
  const claimPath = resolveSharedClaimPath(params);
  const lockKey = claimPath ? `xhs_open_detail:${claimPath}` : '';

  const mapOpenDetailError = (err, paramsRef = {}) => {
    const message = String(err?.message || err || '');
    const mode = String(paramsRef?.mode || '').trim().toLowerCase();
    if (message.includes('AUTOSCRIPT_DONE_NO_MORE_NOTES') || message.includes('AUTOSCRIPT_DONE_MAX_NOTES')) {
      return {
        ok: true,
        code: 'AUTOSCRIPT_DONE_NO_MORE_NOTES',
        message: 'no more notes',
        data: { stopReason: 'no_more_notes' },
      };
    }
    if (message.includes('NO_SEARCH_RESULT_ITEM')) {
      if (mode === 'collect') {
        return {
          ok: true,
          code: 'AUTOSCRIPT_DONE_NO_MORE_NOTES',
          message: 'no notes collected',
          data: { stopReason: 'no_more_notes' },
        };
      }
      return null;
    }
    return null;
  };

  const runWithExclude = async (excludeNoteIds) => {
    const profileState = getProfileState(profileId);
    const metrics = profileState.metrics || (profileState.metrics = {});
    const { actionTrace, pushTrace } = buildTraceRecorder();
    const mode = String(params.mode || 'first').trim().toLowerCase();
    const stage = String(params.stage || '').trim().toLowerCase();
    const detailOnlyMode = stage === 'detail';
    const maxNotes = Math.max(1, Number(params.maxNotes ?? params.limit ?? 20) || 20);
    const keyword = String(params.keyword || '').trim();
    const resume = params.resume !== false;
    const incrementalMax = params.incrementalMax !== false;
    const preservePreCollected = params.preservePreCollected === true;
    const excluded = new Set(normalizeNoteIdList(excludeNoteIds));
    const captureOpenSkipSnapshot = async ({ noteId, reason, stage }) => {
      try {
        await executeTimeoutSnapshotOperation({
          profileId,
          params: {
            runId: context.runId,
            operationId: stage,
            operationAction: stage,
            failureCode: reason,
            failureMessage: reason,
            noteId,
            keyword: params.keyword,
            env: params.env,
          },
          context,
        });
      } catch {
        // ignore snapshot failures
      }
    };

    const previousKeyword = String(profileState.keyword || '').trim();
    const keywordChanged = Boolean(keyword && previousKeyword && keyword !== previousKeyword);
    if (mode === 'collect') {
      if (!resume || keywordChanged) {
        profileState.visitedNoteIds = [];
        if (detailOnlyMode) metrics.detailLoopCount = 0;
        profileState.preCollectedNoteIds = [];
        profileState.preCollectedAt = null;
        profileState.preCollectedLinks = [];
        profileState.preCollectedLinksAt = null;
        profileState.preCollectedLinkCursor = 0;
        profileState.preCollectedLinks = [];
        profileState.preCollectedLinksAt = null;
        profileState.preCollectedLinkCursor = 0;
      }
      if (incrementalMax && resume && !keywordChanged) {
        profileState.maxNotes = Number(normalizeNoteIdList(profileState.preCollectedNoteIds).length || 0) + maxNotes;
      } else {
        profileState.maxNotes = maxNotes;
      }
    } else if (mode === 'first') {
      if (!resume || keywordChanged) {
        profileState.visitedNoteIds = [];
        if (detailOnlyMode) metrics.detailLoopCount = 0;
        if (!preservePreCollected) {
          profileState.preCollectedNoteIds = [];
          profileState.preCollectedAt = null;
        }
      }
      if (incrementalMax && resume && !keywordChanged) {
        const baseCount = detailOnlyMode
          ? Math.max(0, Number(metrics.detailLoopCount || 0) || 0)
          : Number(normalizeNoteIdList(profileState.visitedNoteIds).length || 0);
        profileState.maxNotes = baseCount + maxNotes;
      } else {
        profileState.maxNotes = maxNotes;
      }
    } else if (!Number.isFinite(Number(profileState.maxNotes)) || Number(profileState.maxNotes) <= 0) {
      profileState.maxNotes = maxNotes;
    }
    if (keyword) profileState.keyword = keyword;

    const visitedQuotaCount = detailOnlyMode
      ? Math.max(0, Number(metrics.detailLoopCount || 0) || 0)
      : Number(normalizeNoteIdList(profileState.visitedNoteIds).length || 0);
    if (mode === 'next' && visitedQuotaCount >= Number(profileState.maxNotes || maxNotes)) {
      throw new Error('AUTOSCRIPT_DONE_MAX_NOTES');
    }

    const seedCollectCount = Math.max(0, Number(params.seedCollectCount || 0) || 0);
    const seedCollectMaxRounds = Math.max(0, Number(params.seedCollectMaxRounds || 0) || 0);
    const seedCollectStep = Math.max(120, Number(params.seedCollectStep || 420) || 420);
    const seedCollectSettleMs = Math.max(200, Number(params.seedCollectSettleMs || 480) || 480);
    const seedResetToTop = params.seedResetToTop !== false;
    const targetSeedCollectCount = Math.max(1, seedCollectCount || Number(profileState.maxNotes || maxNotes) || maxNotes);
    const targetSeedCollectMaxRounds = Math.max(
      1,
      seedCollectMaxRounds || Math.max(6, Math.ceil(targetSeedCollectCount / 2)),
    );

    const seekStepRaw = Number(params.nextSeekStep ?? 0);
    const seekStep = Number.isFinite(seekStepRaw) && seekStepRaw > 0
      ? Math.max(240, Math.floor(seekStepRaw))
      : 0;
    const seekSettleMs = Math.max(280, Number(params.nextSeekSettleMs || 620) || 620);

    const preClickDelayMinMs = Math.max(500, Number(params.preClickDelayMinMs ?? 600) || 600);
    const preClickDelayMaxMs = Math.max(preClickDelayMinMs, Number(params.preClickDelayMaxMs ?? 1800) || 1800);
    const pollDelayMinMs = Math.max(200, Number(params.pollDelayMinMs ?? 260) || 260);
    const pollDelayMaxMs = Math.max(pollDelayMinMs, Number(params.pollDelayMaxMs ?? 600) || 600);
    const postOpenDelayMinMs = Math.max(500, Number(params.postOpenDelayMinMs ?? 5000) || 5000);
    const postOpenDelayMaxMs = Math.max(postOpenDelayMinMs, Number(params.postOpenDelayMaxMs ?? 10000) || 10000);
    const openDetailMinVisibleRatio = clamp(Number(params.openDetailMinVisibleRatio ?? 0.5) || 0.5, 0, 1);
    const collectOpenLinksOnly = params.collectOpenLinksOnly === true;
    const openByLinks = params.openByLinks === true
      || String(params.openByLinks || '').trim().toLowerCase() === 'true';
    const openByLinksMaxAttempts = Math.max(1, Number(params.openByLinksMaxAttempts ?? 3) || 3);
    const operationTimeoutMs = Math.max(1000, Number(params.operationTimeoutMs ?? params.operationTimeout ?? 10000) || 10000);
    const operationStartedAt = Date.now();
    const timeRemaining = () => (Number.isFinite(operationTimeoutMs) && operationTimeoutMs > 0
      ? operationTimeoutMs - (Date.now() - operationStartedAt)
      : Number.POSITIVE_INFINITY);
    const ensureTimeRemaining = () => {
      if (timeRemaining() <= 0) throw new Error('DETAIL_OPEN_TIMEOUT');
    };
    const sleepWithBudget = async (ms) => {
      ensureTimeRemaining();
      const remaining = timeRemaining();
      const waitMs = Math.max(0, Math.min(Number(ms) || 0, remaining));
      if (waitMs <= 0) return 0;
      await sleep(waitMs);
      return waitMs;
    };
    const sleepRandomWithBudget = async (minMs, maxMs, trace, stage, extra = {}) => {
      ensureTimeRemaining();
      const remaining = timeRemaining();
      const boundedMax = Math.max(0, Math.min(Number(maxMs) || 0, remaining));
      const boundedMin = Math.max(0, Math.min(Number(minMs) || 0, boundedMax));
      return sleepRandom(boundedMin, Math.max(boundedMin, boundedMax), trace, stage, extra);
    };

    const waitDetailReady = async () => {
      for (let i = 0; i < 60; i += 1) {
        ensureTimeRemaining();
        const snapshot = await isDetailVisible(profileId);
        if (snapshot?.detailReady === true) return true;
        const remaining = timeRemaining();
        const waitMs = Math.max(0, Math.min(randomBetween(pollDelayMinMs, pollDelayMaxMs), remaining));
        if (waitMs <= 0) return false;
        await sleep(waitMs);
      }
      return false;
    };
    const waitDetailReadyOnce = async (maxWaitMs = 3200) => {
      const startedAt = Date.now();
      while ((Date.now() - startedAt) < maxWaitMs) {
        ensureTimeRemaining();
        const snapshot = await isDetailVisible(profileId);
        if (snapshot?.detailReady === true) return true;
        const remaining = Math.min(timeRemaining(), maxWaitMs - (Date.now() - startedAt));
        const waitMs = Math.max(0, Math.min(randomBetween(pollDelayMinMs, pollDelayMaxMs), remaining));
        if (waitMs <= 0) return false;
        await sleep(waitMs);
      }
      return false;
    };
    const recoverSearchViewportAfterOpenFailure = async ({ noteId, reason, attempt }) => {
      const snapshot = await isDetailVisible(profileId).catch(() => null);
      if (snapshot?.detailVisible === true) {
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'detail_open_detected',
          detailVisible: true,
          noteId: String(noteId || '').trim() || null,
          reason,
          attempt,
        });
        await closeDetailToSearch(profileId, pushTrace).catch(() => false);
        await sleep(Math.max(180, Math.floor(seedCollectSettleMs / 2)));
      }
      const pageUpCount = Math.max(3, Math.min(5, Math.floor(randomBetween(3, 6))));
      for (let i = 0; i < pageUpCount; i += 1) {
        await pressKey(profileId, 'PageUp');
        await sleep(100);
      }
      await pressKey(profileId, 'PageDown');
      await sleep(Math.max(200, Math.floor(seedCollectSettleMs / 2)));
    };
    const clickOpenDetailWithRetry = async ({
      noteId,
      point,
      progressStage,
      traceMode = '',
      recoverOnFailure = false,
    }) => {
      let targetPoint = {
        x: Math.max(1, Math.round(Number(point?.x) || 1)),
        y: Math.max(1, Math.round(Number(point?.y) || 1)),
      };
      const normalizedNoteId = String(noteId || '').trim();
      const verifyAnchor = async (block) => {
        const hit = await readSearchHitAtPoint(profileId, targetPoint).catch(() => null);
        const actualNoteId = String(hit?.noteId || '').trim();
        const ok = hit?.ok === true && (!normalizedNoteId || actualNoteId === normalizedNoteId);
        emitOperationProgress(context, {
          kind: 'block',
          stage: progressStage,
          block,
          noteId: normalizedNoteId || null,
          actualNoteId: actualNoteId || null,
          ok,
          point: { ...targetPoint },
          hitTag: hit?.hitTag || null,
          hitClass: hit?.hitClass || null,
          coverClass: hit?.coverClass || null,
          reason: hit?.reason || null,
        });
        return { ok, hit };
      };
      const ensureAnchorMatch = async (block) => {
        let check = await verifyAnchor(block);
        if (check.ok) return true;
        if (!normalizedNoteId) return false;
        const refreshed = await readSearchCandidateByNoteId(profileId, normalizedNoteId, {
          visibilityMargin: 8,
          minVisibleRatio: openDetailMinVisibleRatio,
        }).catch(() => null);
        if (refreshed?.found && refreshed.center) {
          targetPoint = {
            x: Math.max(1, Math.round(Number(refreshed.center.x) || 1)),
            y: Math.max(1, Math.round(Number(refreshed.center.y) || 1)),
          };
        }
        check = await verifyAnchor(`${block}_retry`);
        return check.ok;
      };
      let lastError = null;
      const maxAttempts = 3;
      const openDetailTimeoutMs = 10000;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (attempt > 1) {
          emitOperationProgress(context, {
            kind: 'block',
            stage: progressStage,
            block: 'open_detail_retry',
            noteId: String(noteId || '').trim() || null,
            attempt,
            reason: String(lastError?.message || lastError || 'DETAIL_NOT_READY'),
          });
          await sleepRandomWithBudget(220, 520, pushTrace, 'open_detail_retry_wait', {
            noteId: String(noteId || '').trim() || null,
            mode: traceMode,
            attempt,
          });
        } else {
          await sleepRandomWithBudget(preClickDelayMinMs, preClickDelayMaxMs, pushTrace, 'open_detail_pre_click', {
            noteId: String(noteId || '').trim() || null,
            mode: traceMode,
            attempt,
          });
        }
        const anchorOk = await ensureAnchorMatch('open_detail_pre_anchor');
        if (!anchorOk) {
          throw new Error('OPEN_DETAIL_PRE_ANCHOR_MISMATCH');
        }
        pushTrace({
          kind: 'click',
          stage: 'open_detail',
          noteId: String(noteId || '').trim() || null,
          selector: 'a.cover',
          mode: traceMode,
          attempt,
        });
        try {
          await clickPoint(profileId, targetPoint, {
            steps: 4,
            nudgeBefore: attempt > 1,
          });
        } catch (error) {
          lastError = error;
          const openedAfterClickError = await waitDetailReadyOnce(openDetailTimeoutMs);
          if (openedAfterClickError) return;
          continue;
        }
        const detailReady = await waitDetailReadyOnce(openDetailTimeoutMs);
        if (detailReady) return;
        const postState = await isDetailVisible(profileId).catch(() => null);
        if (postState?.detailVisible === true) return;
        await ensureAnchorMatch('open_detail_post_anchor');
        lastError = new Error('DETAIL_OPEN_TIMEOUT');
      }
      if (recoverOnFailure) {
        await recoverSearchViewportAfterOpenFailure({
          noteId,
          reason: String(lastError?.message || lastError || 'DETAIL_OPEN_FAILED'),
          attempt: maxAttempts,
        });
      }
      if (recoverOnFailure) {
        await recoverSearchViewportAfterOpenFailure({
          noteId,
          reason: String(lastError?.message || lastError || 'DETAIL_OPEN_FAILED'),
          attempt: 3,
        });
      }
      if (lastError instanceof Error) throw lastError;
      throw new Error(String(lastError || 'DETAIL_OPEN_FAILED'));
    };

    const collectVisibleRows = async () => {
      const snapshot = await readSearchCandidates(profileId);
      const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
      return rows;
    };

    const hydratePreCollectedFromPersistedLinks = async () => {
      const output = resolveXhsOutputContext({
        params,
        state: profileState,
        noteId: 'links',
      });
      const rows = await readJsonlRows(output.linksPath);
      const normalizedLinks = rows
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const noteUrl = String(row.noteUrl || row.url || '').trim();
          if (!noteUrl) return null;
          const xsecToken = String(row.xsecToken || readXsecTokenFromUrl(noteUrl)).trim();
          if (!xsecToken) return null;
          const noteId = String(row.noteId || extractNoteIdFromHref(noteUrl)).trim();
          return {
            noteId,
            noteUrl,
            listUrl: String(row.listUrl || '').trim(),
            xsecToken,
          };
        })
        .filter(Boolean);
      const noteIds = normalizeNoteIdList(normalizedLinks.map((row) => row.noteId));
      if (normalizedLinks.length > 0) {
        profileState.preCollectedLinks = normalizedLinks;
        profileState.preCollectedLinksAt = new Date().toISOString();
      }
      if (noteIds.length > 0) {
        profileState.preCollectedNoteIds = noteIds;
        profileState.preCollectedAt = new Date().toISOString();
      }
      return {
        linksPath: output.linksPath,
        noteIds,
        links: normalizedLinks,
      };
    };

    const collectLinksFirst = async () => {
      const seedCollectedSet = new Set();
      const collectVisible = async () => {
        const rows = await collectVisibleRows();
        for (const row of rows) {
          if (row?.noteId) seedCollectedSet.add(String(row.noteId));
        }
        return rows;
      };

      let rows = await collectVisible();
      if (rows.length === 0) throw new Error('NO_SEARCH_RESULT_ITEM');

      for (let round = 0; round < targetSeedCollectMaxRounds && seedCollectedSet.size < targetSeedCollectCount; round += 1) {
        pushTrace({ kind: 'scroll', stage: 'collect_links', round: round + 1, deltaY: seedCollectStep });
        await wheel(profileId, seedCollectStep);
        await sleep(seedCollectSettleMs);
        rows = await collectVisible();
      }
      if (seedResetToTop) {
        for (let i = 0; i < 6; i += 1) {
          pushTrace({ kind: 'scroll', stage: 'collect_links_reset', round: i + 1, deltaY: -900 });
          await wheel(profileId, -900);
          await sleep(Math.max(140, Math.floor(seedCollectSettleMs / 2)));
        }
        rows = await collectVisible();
      }
      const collectedNoteIds = normalizeNoteIdList(Array.from(seedCollectedSet));
      profileState.preCollectedNoteIds = collectedNoteIds;
      profileState.preCollectedAt = new Date().toISOString();
      return { rows, collectedNoteIds };
    };

    const collectLinksByOpening = async () => {
      const captureSkipSnapshot = async ({ noteId, reason, stage }) => {
        try {
          await executeTimeoutSnapshotOperation({
            profileId,
            params: {
              runId: context.runId,
              operationId: stage,
              operationAction: stage,
              failureCode: reason,
              failureMessage: reason,
              noteId,
              keyword: params.keyword,
              env: params.env,
            },
            context,
          });
        } catch {
          // ignore snapshot failures
        }
      };
      const output = resolveXhsOutputContext({
        params,
        state: profileState,
        noteId: 'links',
      });
      const visitedSet = new Set(normalizeNoteIdList(profileState.visitedNoteIds));
      const collectedSet = new Set(normalizeNoteIdList(profileState.preCollectedNoteIds));
      const nonCollectibleSet = new Set([...visitedSet, ...collectedSet]);
      const targetCount = Number(profileState.maxNotes || maxNotes);
      let stagnantRounds = 0;
      const maxStagnantRounds = Math.max(8, targetSeedCollectMaxRounds);
      const collectStallTimeoutMs = Math.max(30_000, Number(params.collectStallTimeoutMs || 180_000) || 180_000);
      let lastProgressAt = Date.now();
      let lastCollectedCount = collectedSet.size;
      const pickRandom = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rows[Math.floor(Math.random() * rows.length)] || null;
      };
      const runSearchReadyBlock = async () => {
        let detailClosed = false;
        const detailSnapshot = await isDetailVisible(profileId);
        if (detailSnapshot?.detailVisible === true) {
          emitOperationProgress(context, {
            kind: 'block',
            stage: 'collect_links',
            block: 'detail_open_detected',
            detailVisible: true,
          });
          detailClosed = await closeDetailToSearch(profileId, pushTrace).catch(() => false);
          await sleep(Math.max(180, Math.floor(seedCollectSettleMs / 2)));
        }
        const snapshot = await readSearchViewportReady(profileId);
        const readySelector = String(snapshot?.readySelector || '').trim();
        const visibleNoteCount = Math.max(0, Number(snapshot?.visibleNoteCount || 0) || 0);
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'search_ready',
          readySelector: readySelector || null,
          visibleNoteCount,
          detailClosed,
        });
        if (!readySelector && visibleNoteCount <= 0) {
          emitOperationProgress(context, {
            kind: 'block',
            stage: 'collect_links',
            block: 'search_not_ready',
            readySelector: readySelector || null,
            visibleNoteCount,
            detailClosed,
          });
          return false;
        }
        return true;
      };
      const runListSelectBlock = async () => {
        const rows = await collectVisibleRows();
        if (rows.length === 0) {
          if (collectedSet.size === 0) throw new Error('NO_SEARCH_RESULT_ITEM');
          return { kind: 'done' };
        }
        const eligibleInViewport = rows.filter((row) => (
          row
          && row.inViewport === true
          && row.center
          && !excluded.has(String(row.noteId || '').trim())
          && !nonCollectibleSet.has(String(row.noteId || '').trim())
        ));
        const eligibleVisibleEnough = eligibleInViewport.filter((row) => row.visibleEnough === true);
        const selectableRows = eligibleVisibleEnough;
        const candidateIds = normalizeNoteIdList(eligibleVisibleEnough.map((row) => row.noteId));
        const processedIds = normalizeNoteIdList(Array.from(nonCollectibleSet));
        await paintSearchCandidates(profileId, {
          candidateNoteIds: candidateIds,
          selectedNoteId: '',
          processedNoteIds: processedIds,
        });
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'list_select',
          candidateCount: candidateIds.length,
          processedCount: processedIds.length,
        });
        if (eligibleVisibleEnough.length === 0) {
          stagnantRounds += 1;
          if (stagnantRounds > maxStagnantRounds) return { kind: 'done' };
          pushTrace({
            kind: 'scroll',
            stage: 'collect_links_list_select_scroll',
            round: stagnantRounds,
            deltaY: seedCollectStep,
          });
          emitOperationProgress(context, {
            kind: 'block',
            stage: 'collect_links',
            block: 'list_select_scroll',
            round: stagnantRounds,
            deltaY: seedCollectStep,
          });
          await wheel(profileId, seedCollectStep);
          await sleep(seedCollectSettleMs);
          return { kind: 'continue' };
        }
        stagnantRounds = 0;
        const next = pickRandom(selectableRows);
        if (!next?.center) return { kind: 'continue' };
        await paintSearchCandidates(profileId, {
          candidateNoteIds: candidateIds,
          selectedNoteId: String(next.noteId || '').trim(),
          processedNoteIds: processedIds,
        });
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'list_select_target',
          targetNoteId: String(next.noteId || '').trim(),
        });
        return {
          kind: 'selected',
          next,
          candidateIds,
          processedIds,
        };
      };
      const runOpenDetailBlock = async (next) => {
        const noteId = String(next?.noteId || '').trim();
        const visibility = await ensureSearchCandidateFullyVisible(profileId, noteId, {
          maxScrollAttempts: 3,
          visibilityMargin: 8,
          minVisibleRatio: openDetailMinVisibleRatio,
          settleMs: Math.max(140, Math.floor(seedCollectSettleMs / 2)),
        });
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'open_detail_visibility',
          noteId,
          autoScrolled: visibility.autoScrolled,
          fullyVisible: visibility.target?.fullyVisible === true,
          visibleEnough: visibility.ok,
          visibleRatio: Number(visibility?.target?.visibleRatio || 0),
          centerHitOk: visibility.target?.centerHitOk === true,
          centerHitTag: visibility.target?.centerHitTag || null,
          centerHitClass: visibility.target?.centerHitClass || null,
          minVisibleRatio: Number.isFinite(visibility?.target?.minVisibleRatio)
            ? Number(visibility.target.minVisibleRatio)
            : 0.5,
          code: visibility.code,
        });
        if (!visibility.ok) throw new Error(`${visibility.code}:${noteId}`);
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'open_detail',
          noteId,
        });
        const beforeUrl = await readLocation(profileId);
        await clickOpenDetailWithRetry({
          noteId,
          point: visibility.target?.center || next.center,
          progressStage: 'collect_links',
          traceMode: 'collect',
          recoverOnFailure: true,
        });
        await sleepRandomWithBudget(postOpenDelayMinMs, postOpenDelayMaxMs, pushTrace, 'open_detail_post_open', { noteId, mode: 'collect' });
        return { beforeUrl };
      };
      const runCaptureUrlBlock = async (next, beforeUrl) => {
        const afterUrl = await readLocation(profileId);
        const resolvedNoteId = extractNoteIdFromHref(afterUrl) || String(next?.noteId || '').trim();
        if (!resolvedNoteId) throw new Error('LINK_NOTE_ID_MISSING');
        if (!String(afterUrl || '').includes('xsec_token=')) {
          throw new Error(`LINK_WITHOUT_XSEC_TOKEN:${resolvedNoteId}`);
        }
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'capture_url',
          noteId: resolvedNoteId,
          hasXsecToken: true,
        });
        return {
          resolvedNoteId,
          noteUrl: afterUrl,
          listUrl: beforeUrl || null,
        };
      };
      const runCloseDetailBlock = async (resolvedNoteId) => {
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'close_detail',
          noteId: resolvedNoteId,
        });
        const closed = await closeDetailToSearch(profileId, pushTrace);
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'close_detail_result',
          noteId: resolvedNoteId,
          closed,
        });
        if (!closed) {
          emitOperationProgress(context, {
            kind: 'block',
            stage: 'collect_links',
            block: 'close_detail_failed',
            noteId: resolvedNoteId,
          });
          await sleep(Math.max(220, Math.floor(seedCollectSettleMs / 2)));
        }
      };

      while (collectedSet.size < targetCount) {
        emitOperationProgress(context, {
          kind: 'loop',
          stage: 'collect_links',
          collectedCount: collectedSet.size,
          targetCount,
          stagnantRounds,
          stallTimeoutMs: collectStallTimeoutMs,
          elapsedSinceProgressMs: Math.max(0, Date.now() - lastProgressAt),
        });
        if ((Date.now() - lastProgressAt) > collectStallTimeoutMs) {
          throw new Error(`COLLECT_LINKS_STALL:${collectedSet.size}/${targetCount}`);
        }

        const searchReady = await runSearchReadyBlock();
        if (!searchReady) {
          await sleep(Math.max(220, Math.floor(seedCollectSettleMs / 2)));
          continue;
        }
        const selection = await runListSelectBlock();
        if (!selection || selection.kind === 'continue') continue;
        if (selection.kind === 'done') break;
        const next = selection.next;
        const nextNoteId = String(next?.noteId || '').trim();
        let openResult = null;
        try {
          openResult = await runOpenDetailBlock(next);
        } catch (openErr) {
          const reason = String(openErr?.message || openErr || 'OPEN_DETAIL_FAILED');
          if (nextNoteId) nonCollectibleSet.add(nextNoteId);
          lastProgressAt = Date.now();
          emitOperationProgress(context, {
            kind: 'block',
            stage: 'collect_links',
            block: 'open_detail_skip',
            noteId: nextNoteId || null,
            reason,
          });
          await captureSkipSnapshot({ noteId: nextNoteId || null, reason, stage: 'collect_links_open_detail' });
          pushTrace({
            kind: 'warn',
            stage: 'open_detail_skip',
            noteId: nextNoteId || null,
            reason,
          });
          await closeDetailToSearch(profileId, pushTrace).catch(() => false);
          await paintSearchCandidates(profileId, {
            candidateNoteIds: selection.candidateIds,
            selectedNoteId: '',
            processedNoteIds: normalizeNoteIdList(Array.from(nonCollectibleSet)),
          });
          await captureOperationFailure({
            profileId,
            params,
            context,
            stage: 'collect_links',
            noteId: nextNoteId || '',
            reason,
            extra: { block: 'open_detail_skip' },
          }).catch(() => null);
          await sleep(Math.max(220, Math.floor(seedCollectSettleMs / 2)));
          continue;
        }
        let captured = null;
        try {
          captured = await runCaptureUrlBlock(next, openResult.beforeUrl);
        } catch (captureErr) {
          const reason = String(captureErr?.message || captureErr || 'CAPTURE_URL_FAILED');
          if (nextNoteId) nonCollectibleSet.add(nextNoteId);
          lastProgressAt = Date.now();
          emitOperationProgress(context, {
            kind: 'block',
            stage: 'collect_links',
            block: 'capture_url_skip',
            noteId: nextNoteId || null,
            reason,
          });
          await captureSkipSnapshot({ noteId: nextNoteId || null, reason, stage: 'collect_links_capture_url' });
          pushTrace({
            kind: 'warn',
            stage: 'capture_url_skip',
            noteId: nextNoteId || null,
            reason,
          });
          await closeDetailToSearch(profileId, pushTrace).catch(() => false);
          await paintSearchCandidates(profileId, {
            candidateNoteIds: selection.candidateIds,
            selectedNoteId: '',
            processedNoteIds: normalizeNoteIdList(Array.from(nonCollectibleSet)),
          });
          await captureOperationFailure({
            profileId,
            params,
            context,
            stage: 'collect_links',
            noteId: nextNoteId || '',
            reason,
            extra: { block: 'capture_url_skip' },
          }).catch(() => null);
          await sleep(Math.max(220, Math.floor(seedCollectSettleMs / 2)));
          continue;
        }
        const resolvedNoteId = captured.resolvedNoteId;

        collectedSet.add(resolvedNoteId);
        nonCollectibleSet.add(resolvedNoteId);
        profileState.currentNoteId = resolvedNoteId;
        profileState.currentHref = captured.noteUrl || null;
        profileState.lastListUrl = captured.listUrl || null;
        if (collectedSet.size > lastCollectedCount) {
          lastCollectedCount = collectedSet.size;
          lastProgressAt = Date.now();
        }

        await mergeLinksJsonl({
          filePath: output.linksPath,
          links: [{
            noteId: resolvedNoteId,
            noteUrl: captured.noteUrl,
            listUrl: captured.listUrl,
          }],
        });

        await paintSearchCandidates(profileId, {
          candidateNoteIds: selection.candidateIds,
          selectedNoteId: '',
          processedNoteIds: normalizeNoteIdList(Array.from(nonCollectibleSet)),
        });

        await runCloseDetailBlock(resolvedNoteId);
      }

      const collectedNoteIds = normalizeNoteIdList(Array.from(collectedSet));
      profileState.preCollectedNoteIds = collectedNoteIds;
      profileState.preCollectedAt = new Date().toISOString();
      await paintSearchCandidates(profileId, {
        candidateNoteIds: [],
        selectedNoteId: '',
        processedNoteIds: normalizeNoteIdList(Array.from(nonCollectibleSet)),
      });
      return {
        collectedNoteIds,
        linksPath: output.linksPath,
      };
    };

    let nodes = [];
    if (mode === 'collect') {
      const persisted = await hydratePreCollectedFromPersistedLinks();
      const persistedNoteIds = normalizeNoteIdList(persisted.noteIds);
      if (collectOpenLinksOnly && persistedNoteIds.length >= targetSeedCollectCount) {
        emitActionTrace(context, actionTrace, { stage: 'xhs_collect_links' });
        return {
          operationResult: {
            ok: true,
            code: 'OPERATION_DONE',
            message: 'xhs_collect_links done',
            data: {
              collected: persistedNoteIds.length,
              target: targetSeedCollectCount,
              maxRounds: targetSeedCollectMaxRounds,
              noteIds: persistedNoteIds,
              seedCollectedCount: persistedNoteIds.length,
              seedCollectedNoteIds: persistedNoteIds,
              linksPath: persisted.linksPath || null,
              linksWithXsecToken: persistedNoteIds.length,
              searchOnly: false,
              source: 'persisted_links',
            },
          },
          payload: {
            opened: false,
            source: 'collect_links',
            collected: persistedNoteIds.length,
            target: targetSeedCollectCount,
            maxRounds: targetSeedCollectMaxRounds,
            noteIds: persistedNoteIds,
            seedCollectedCount: persistedNoteIds.length,
            seedCollectedNoteIds: persistedNoteIds,
            linksPath: persisted.linksPath || null,
            linksWithXsecToken: persistedNoteIds.length,
            searchOnly: false,
          },
        };
      }
      nodes = await collectVisibleRows();
      if (nodes.length === 0) throw new Error('NO_SEARCH_RESULT_ITEM');
      const collected = collectOpenLinksOnly
        ? await collectLinksByOpening()
        : await collectLinksFirst();
      const collectedNoteIds = normalizeNoteIdList(collected?.collectedNoteIds);
      emitActionTrace(context, actionTrace, { stage: 'xhs_collect_links' });
      return {
        operationResult: {
          ok: true,
          code: 'OPERATION_DONE',
          message: 'xhs_collect_links done',
          data: {
            collected: collectedNoteIds.length,
            target: targetSeedCollectCount,
            maxRounds: targetSeedCollectMaxRounds,
            noteIds: collectedNoteIds,
            seedCollectedCount: collectedNoteIds.length,
            seedCollectedNoteIds: collectedNoteIds,
            linksPath: collected?.linksPath || null,
            linksWithXsecToken: collectOpenLinksOnly ? collectedNoteIds.length : 0,
            searchOnly: collectOpenLinksOnly !== true,
          },
        },
        payload: {
          opened: false,
          source: 'collect_links',
          collected: collectedNoteIds.length,
          target: targetSeedCollectCount,
          maxRounds: targetSeedCollectMaxRounds,
          noteIds: collectedNoteIds,
          seedCollectedCount: collectedNoteIds.length,
          seedCollectedNoteIds: collectedNoteIds,
          linksPath: collected?.linksPath || null,
          linksWithXsecToken: collectOpenLinksOnly ? collectedNoteIds.length : 0,
          searchOnly: collectOpenLinksOnly !== true,
        },
      };
    }

    nodes = await collectVisibleRows();

    let preCollectedSet = new Set(normalizeNoteIdList(profileState.preCollectedNoteIds));
    if (preCollectedSet.size === 0) {
      const persisted = await hydratePreCollectedFromPersistedLinks();
      preCollectedSet = new Set(normalizeNoteIdList(persisted.noteIds));
    }
    if (!detailOnlyMode && preCollectedSet.size === 0) {
      throw new Error('PRECOLLECTED_LINKS_REQUIRED');
    }

    const visitedSet = new Set(normalizeNoteIdList(profileState.visitedNoteIds));
    if (!detailOnlyMode && preCollectedSet.size > 0 && mode === 'next') {
      const pending = Array.from(preCollectedSet).filter((noteId) => !visitedSet.has(noteId) && !excluded.has(noteId));
      if (pending.length === 0) {
        throw new Error('AUTOSCRIPT_DONE_NO_MORE_NOTES');
      }
    }
    if (openByLinks) {
      const normalizeLinkRow = (row) => {
        if (!row || typeof row !== 'object') return null;
        const noteUrl = String(row.noteUrl || row.url || '').trim();
        if (!noteUrl) return null;
        const xsecToken = String(row.xsecToken || readXsecTokenFromUrl(noteUrl)).trim();
        if (!xsecToken) return null;
        const noteId = String(row.noteId || extractNoteIdFromHref(noteUrl)).trim();
        if (!noteId) return null;
        return {
          noteId,
          noteUrl,
          listUrl: String(row.listUrl || '').trim(),
          xsecToken,
        };
      };

      let preCollectedLinks = normalizeArray(profileState.preCollectedLinks)
        .map((row) => normalizeLinkRow(row))
        .filter(Boolean);
      if (preCollectedLinks.length === 0) {
        const persisted = await hydratePreCollectedFromPersistedLinks();
        preCollectedLinks = normalizeArray(persisted.links)
          .map((row) => normalizeLinkRow(row))
          .filter(Boolean);
      }
      if (preCollectedLinks.length === 0) {
        throw new Error('PRECOLLECTED_LINKS_REQUIRED');
      }

      const linkNoteIds = normalizeNoteIdList(preCollectedLinks.map((row) => row.noteId));
      if (linkNoteIds.length > 0) {
        preCollectedSet = new Set(linkNoteIds);
        profileState.preCollectedNoteIds = linkNoteIds;
        profileState.preCollectedAt = new Date().toISOString();
      }
      profileState.preCollectedLinks = preCollectedLinks;
      profileState.preCollectedLinksAt = new Date().toISOString();
      profileState.preCollectedLinkCursor = Math.max(0, Number(profileState.preCollectedLinkCursor || 0) || 0);

      const isEligibleLink = (row) => {
        if (!row || typeof row !== 'object') return false;
        const noteId = String(row.noteId || '').trim();
        if (!noteId) return false;
        if (excluded.has(noteId)) return false;
        if (preCollectedSet.size > 0 && !preCollectedSet.has(noteId)) return false;
        if (visitedSet.has(noteId)) return false;
        return true;
      };

      const pickNextLink = () => {
        const total = preCollectedLinks.length;
        if (total === 0) return null;
        const startAt = Math.max(0, Number(profileState.preCollectedLinkCursor || 0) || 0);
        for (let offset = 0; offset < total; offset += 1) {
          const idx = (startAt + offset) % total;
          const row = preCollectedLinks[idx];
          if (!isEligibleLink(row)) continue;
          profileState.preCollectedLinkCursor = (idx + 1) % total;
          return { ...row, index: idx };
        }
        return null;
      };

      let lastError = null;
      for (let attempt = 1; attempt <= openByLinksMaxAttempts; attempt += 1) {
        const nextLink = pickNextLink();
        if (!nextLink) {
          throw new Error('AUTOSCRIPT_DONE_NO_MORE_NOTES');
        }
        const progressStage = mode === 'next' ? 'open_next_detail' : 'open_first_detail';
        const noteId = String(nextLink.noteId || '').trim();
        const beforeUrl = await readLocation(profileId);
        emitOperationProgress(context, {
          kind: 'block',
          stage: progressStage,
          block: 'open_detail_by_link',
          noteId,
          linkIndex: Number.isFinite(Number(nextLink.index)) ? Number(nextLink.index) : null,
          url: nextLink.noteUrl,
          attempt,
        });
        pushTrace({
          kind: 'nav',
          stage: 'open_detail_by_link',
          noteId,
          url: nextLink.noteUrl,
          attempt,
        });

        try {
          await callAPI('goto', { profileId, url: nextLink.noteUrl });
        } catch (error) {
          lastError = error;
          if (noteId) {
            visitedSet.add(noteId);
            profileState.visitedNoteIds = Array.from(visitedSet);
          }
          emitOperationProgress(context, {
            kind: 'block',
            stage: progressStage,
            block: 'open_detail_by_link_failed',
            noteId,
            attempt,
            error: error?.message || String(error),
          });
          await captureOperationFailure({
            profileId,
            params,
            context,
            stage: progressStage,
            noteId,
            reason: error?.message || String(error),
            extra: { block: 'open_detail_by_link_failed', attempt },
          }).catch(() => null);
          continue;
        }

        const ready = await waitDetailReady();
        if (!ready) {
          lastError = new Error('DETAIL_OPEN_TIMEOUT');
          if (noteId) {
            visitedSet.add(noteId);
            profileState.visitedNoteIds = Array.from(visitedSet);
          }
          emitOperationProgress(context, {
            kind: 'block',
            stage: progressStage,
            block: 'open_detail_by_link_timeout',
            noteId,
            attempt,
          });
          await captureOperationFailure({
            profileId,
            params,
            context,
            stage: progressStage,
            noteId,
            reason: 'DETAIL_OPEN_TIMEOUT',
            extra: { block: 'open_detail_by_link_timeout', attempt },
          }).catch(() => null);
          continue;
        }


        const afterUrl = await readLocation(profileId);
        if (noteId && !visitedSet.has(noteId)) {
          visitedSet.add(noteId);
          profileState.visitedNoteIds = Array.from(visitedSet);
        }
        if (detailOnlyMode) {
          metrics.detailLoopCount = Math.max(0, Number(metrics.detailLoopCount || 0) || 0) + 1;
        }
        profileState.currentNoteId = noteId;
        profileState.currentHref = afterUrl || nextLink.noteUrl || null;
        profileState.lastListUrl = beforeUrl || null;

        emitActionTrace(context, actionTrace, { stage: 'xhs_open_detail' });

        return {
          operationResult: {
            ok: true,
            code: 'OPERATION_DONE',
            message: 'xhs_open_detail done',
            data: {
              opened: true,
              source: progressStage,
              noteId,
              visited: profileState.visitedNoteIds.length,
              maxNotes: Number(profileState.maxNotes || maxNotes),
              openByClick: false,
              openByLink: true,
              noteUrl: nextLink.noteUrl,
              beforeUrl,
              afterUrl,
              excludedCount: excluded.size,
              seedCollectedCount: preCollectedSet.size,
              seedCollectedNoteIds: Array.from(preCollectedSet),
            },
          },
          payload: {
            opened: true,
            source: progressStage,
            noteId,
            visited: profileState.visitedNoteIds.length,
            maxNotes: Number(profileState.maxNotes || maxNotes),
            openByClick: false,
            openByLink: true,
            noteUrl: nextLink.noteUrl,
            beforeUrl,
            afterUrl,
            excludedCount: excluded.size,
            seedCollectedCount: preCollectedSet.size,
            seedCollectedNoteIds: Array.from(preCollectedSet),
          },
        };
      }

      if (lastError instanceof Error) throw lastError;
      throw new Error(String(lastError || 'DETAIL_OPEN_FAILED'));
    }

    const isEligible = (row) => {
      if (!row || typeof row !== 'object') return false;
      const noteId = String(row.noteId || '').trim();
      if (!noteId) return false;
      if (excluded.has(noteId)) return false;
      if (detailOnlyMode) return true;
      if (visitedSet.has(noteId)) return false;
      if (preCollectedSet.size > 0 && !preCollectedSet.has(noteId)) return false;
      return true;
    };
    const getPendingPreCollectedNoteIds = () => {
      if (detailOnlyMode) return [];
      return Array.from(preCollectedSet).filter((noteId) => !visitedSet.has(noteId) && !excluded.has(noteId));
    };

    const pickRandom = (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows[Math.floor(Math.random() * rows.length)] || null;
    };
    const pickNode = (rows) => {
      const eligibleRows = rows.filter((row) => isEligible(row));
      const inViewport = eligibleRows.filter((row) => row.inViewport === true);
      const visibleEnough = inViewport.filter((row) => row.visibleEnough === true);
      const candidateRows = visibleEnough;
      const next = pickRandom(candidateRows);
      return { next, candidateRows };
    };
    const paintDetailSelection = async (rows, selectedNoteId = '') => {
      const candidateIds = normalizeNoteIdList((Array.isArray(rows) ? rows : []).map((row) => row?.noteId));
      const processedIds = normalizeNoteIdList(Array.from(visitedSet));
      await paintSearchCandidates(profileId, {
        candidateNoteIds: candidateIds,
        selectedNoteId: String(selectedNoteId || '').trim(),
        processedNoteIds: processedIds,
      });
      emitOperationProgress(context, {
        kind: 'block',
        stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
        block: 'list_select',
        candidateCount: candidateIds.length,
        selectedNoteId: String(selectedNoteId || '').trim() || null,
        processedCount: processedIds.length,
      });
    };

    const maxOpenAttempts = Math.max(3, Number(params.openDetailMaxAttempts ?? 6) || 6);
    let lastOpenError = null;
    for (let openAttempt = 1; openAttempt <= maxOpenAttempts; openAttempt += 1) {
      let activeNoteId = null;
      try {
        let picked = pickNode(nodes);
    if (mode === 'first' || mode === 'next') {
      const detailSnapshot = await isDetailVisible(profileId);
      if (detailSnapshot?.detailVisible === true) {
        emitOperationProgress(context, {
          kind: 'block',
          stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
          block: 'close_detail_before_open',
        });
        const closed = await closeDetailToSearch(profileId, pushTrace);
        emitOperationProgress(context, {
          kind: 'block',
          stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
          block: 'close_detail_before_open_result',
          closed,
        });
        if (!closed) {
          throw new Error('DETAIL_CLOSE_BEFORE_OPEN_FAILED');
        }
        await sleep(Math.max(120, Math.floor(seekSettleMs / 2)));
        nodes = await collectVisibleRows();
        picked = pickNode(nodes);
      }
    }
    await paintDetailSelection(picked.candidateRows, '');
    let next = picked.next;
    const dynamicSeekStep = seekStep || Math.max(260, Math.floor((Number(nodes?.[0]?.viewport?.height || 900) || 900) * 0.9));
    if (!next) {
      let downRound = 0;
      while (!next) {
        const pending = getPendingPreCollectedNoteIds();
        if (pending.length === 0) break;
        downRound += 1;
        const deltaY = dynamicSeekStep;
        pushTrace({ kind: 'scroll', stage: 'seek_next_detail', round: downRound, deltaY, direction: 'down' });
        emitOperationProgress(context, {
          kind: 'block',
          stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
          block: 'seek_down',
          round: downRound,
          deltaY,
          pendingCount: pending.length,
        });
        let wheelOk = false;
        let wheelError = null;
        for (let wheelAttempt = 1; wheelAttempt <= 3; wheelAttempt += 1) {
          try {
            await wheel(profileId, deltaY);
            wheelOk = true;
            if (wheelAttempt > 1) {
              emitOperationProgress(context, {
                kind: 'block',
                stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
                block: 'seek_down_retry_ok',
                round: downRound,
                wheelAttempt,
                deltaY,
              });
            }
            break;
          } catch (error) {
            wheelError = error;
            emitOperationProgress(context, {
              kind: 'block',
              stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
              block: 'seek_down_retry_failed',
              round: downRound,
              wheelAttempt,
              deltaY,
              error: error?.message || String(error),
            });
            if (wheelAttempt < 3) {
              await sleep(randomBetween(350, 900));
            }
          }
        }
        if (!wheelOk) {
          const rollbackPages = randomBetween(3, 5);
          const rollbackStep = Math.max(420, Math.floor(dynamicSeekStep * 0.8));
          emitOperationProgress(context, {
            kind: 'block',
            stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
            block: 'seek_down_rollback_start',
            round: downRound,
            rollbackPages,
            rollbackStep,
          });
          for (let rollback = 1; rollback <= rollbackPages; rollback += 1) {
            try {
              await wheel(profileId, -rollbackStep);
            } catch (error) {
              emitOperationProgress(context, {
                kind: 'block',
                stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
                block: 'seek_down_rollback_failed',
                round: downRound,
                rollback,
                rollbackPages,
                rollbackStep,
                error: error?.message || String(error),
              });
              continue;
            }
            await sleep(randomBetween(180, 420));
          }
          await sleep(randomBetween(220, 520));
          try {
            await wheel(profileId, deltaY);
            wheelOk = true;
            emitOperationProgress(context, {
              kind: 'block',
              stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
              block: 'seek_down_rollback_recover_ok',
              round: downRound,
              deltaY,
            });
          } catch (error) {
            wheelError = error || wheelError;
            emitOperationProgress(context, {
              kind: 'block',
              stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
              block: 'seek_down_rollback_recover_failed',
              round: downRound,
              deltaY,
              error: error?.message || String(error),
            });
          }
        }
        if (!wheelOk) {
          throw wheelError instanceof Error ? wheelError : new Error(String(wheelError || 'SEEK_DOWN_SCROLL_FAILED'));
        }
        await sleep(seekSettleMs);
        nodes = await collectVisibleRows();
        picked = pickNode(nodes);
        await paintDetailSelection(picked.candidateRows, '');
        next = picked.next;
      }
    }

    if (!next) {
      const pending = getPendingPreCollectedNoteIds();
      if (pending.length > 0) {
        throw new Error(`PENDING_PRECOLLECTED_NOT_IN_VIEWPORT:${pending.length}`);
      }
      throw new Error('AUTOSCRIPT_DONE_NO_MORE_NOTES');
    }
    activeNoteId = next.noteId;
    await paintDetailSelection(picked.candidateRows, next.noteId);
    const visibility = await ensureSearchCandidateFullyVisible(profileId, next.noteId, {
      maxScrollAttempts: 3,
      visibilityMargin: 8,
      minVisibleRatio: openDetailMinVisibleRatio,
      settleMs: Math.max(160, Math.floor(seekSettleMs / 2)),
    });
    emitOperationProgress(context, {
      kind: 'block',
      stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
      block: 'open_detail_visibility',
      noteId: next.noteId,
      autoScrolled: visibility.autoScrolled,
      fullyVisible: visibility.target?.fullyVisible === true,
      visibleEnough: visibility.ok,
      visibleRatio: Number(visibility?.target?.visibleRatio || 0),
      centerHitOk: visibility.target?.centerHitOk === true,
      centerHitTag: visibility.target?.centerHitTag || null,
      centerHitClass: visibility.target?.centerHitClass || null,
      minVisibleRatio: Number.isFinite(visibility?.target?.minVisibleRatio)
        ? Number(visibility.target.minVisibleRatio)
        : 0.5,
      code: visibility.code,
    });
    if (!visibility.ok) {
      throw new Error(`${visibility.code}:${next.noteId}`);
    }

    const beforeUrl = await readLocation(profileId);
    await clickOpenDetailWithRetry({
      noteId: next.noteId,
      point: visibility.target?.center || next.center,
      progressStage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
      traceMode: mode,
      recoverOnFailure: true,
    });

    await sleepRandomWithBudget(postOpenDelayMinMs, postOpenDelayMaxMs, pushTrace, 'open_detail_post_open', { noteId: next.noteId });
    const afterUrl = await readLocation(profileId);

    if (detailOnlyMode) {
      metrics.detailLoopCount = Math.max(0, Number(metrics.detailLoopCount || 0) || 0) + 1;
    } else if (!visitedSet.has(next.noteId)) {
      visitedSet.add(next.noteId);
      profileState.visitedNoteIds = Array.from(visitedSet);
    }
    profileState.currentNoteId = next.noteId;
    profileState.currentHref = next.href || null;
    profileState.lastListUrl = beforeUrl || null;

    emitActionTrace(context, actionTrace, { stage: 'xhs_open_detail' });

    return {
      operationResult: {
        ok: true,
        code: 'OPERATION_DONE',
        message: 'xhs_open_detail done',
        data: {
          opened: true,
          source: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
          noteId: next.noteId,
          visited: detailOnlyMode
            ? Math.max(0, Number(metrics.detailLoopCount || 0) || 0)
            : profileState.visitedNoteIds.length,
          maxNotes: Number(profileState.maxNotes || maxNotes),
          openByClick: true,
          beforeUrl,
          afterUrl,
          excludedCount: excluded.size,
          seedCollectedCount: preCollectedSet.size,
          seedCollectedNoteIds: Array.from(preCollectedSet),
        },
      },
      payload: {
        opened: true,
        source: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
        noteId: next.noteId,
        visited: profileState.visitedNoteIds.length,
        maxNotes: Number(profileState.maxNotes || maxNotes),
        openByClick: true,
        beforeUrl,
        afterUrl,
        excludedCount: excluded.size,
        seedCollectedCount: preCollectedSet.size,
        seedCollectedNoteIds: Array.from(preCollectedSet),
      },
    };
      }
      catch (error) {
        const reason = String(error?.message || error || 'OPEN_DETAIL_FAILED');
        lastOpenError = error instanceof Error ? error : new Error(reason);
        if (activeNoteId) {
          excluded.add(activeNoteId);
          visitedSet.add(activeNoteId);
          profileState.visitedNoteIds = Array.from(visitedSet);
        }
        emitOperationProgress(context, {
          kind: 'block',
          stage: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
          block: 'open_detail_skip',
          noteId: activeNoteId || null,
          reason,
          attempt: openAttempt,
        });
        await captureOpenSkipSnapshot({ noteId: activeNoteId || null, reason, stage: 'open_detail_attempt' });
        await closeDetailToSearch(profileId, pushTrace).catch(() => false);
        await sleep(Math.max(200, Math.floor(seekSettleMs / 2)));
        nodes = await collectVisibleRows();
        continue;
      }
    }

    if (lastOpenError instanceof Error) throw lastOpenError;
    throw new Error('OPEN_DETAIL_ATTEMPTS_EXHAUSTED');
  };

  if (!claimPath) {
    try {
      const { operationResult } = await runWithExclude([]);
      return operationResult;
    } catch (err) {
      const mapped = mapOpenDetailError(err, params);
      if (mapped) return mapped;
      throw err;
    }
  }

  const runLocked = async () => {
    const claimDoc = await loadSharedClaimDoc(claimPath);
    const excludeNoteIds = normalizeNoteIdList(claimDoc.noteIds);
    const { operationResult, payload } = await runWithExclude(excludeNoteIds);

    const claimSet = new Set(excludeNoteIds);
    const claimAdded = [];
    const markClaim = (noteId, source = 'open_detail') => {
      const id = String(noteId || '').trim();
      if (!id || claimSet.has(id)) return;
      claimSet.add(id);
      claimAdded.push(id);
      claimDoc.byNoteId[id] = {
        noteId: id,
        profileId,
        source,
        ts: new Date().toISOString(),
      };
    };

    const seeded = normalizeNoteIdList(payload.seedCollectedNoteIds);
    for (const noteId of seeded) markClaim(noteId, 'seed_collect');
    if (payload.opened === true) markClaim(payload.noteId, 'open_detail');
    claimDoc.noteIds = Array.from(claimSet);
    if (claimAdded.length > 0) {
      await saveSharedClaimDoc(claimPath, claimDoc);
    }

    const mergedPayload = {
      ...payload,
      sharedClaimPath: claimPath,
      sharedClaimCount: claimDoc.noteIds.length,
      sharedClaimAdded: claimAdded,
      dedupExcluded: excludeNoteIds.length,
    };
    const mergedData = operationResult.data && typeof operationResult.data === 'object'
      ? { ...operationResult.data, result: mergedPayload }
      : { result: mergedPayload };

    return {
      ...operationResult,
      data: mergedData,
    };
  };

  try {
    return await withSerializedLock(lockKey, runLocked);
  } catch (err) {
    const mapped = mapOpenDetailError(err, params);
    if (mapped) return mapped;
    throw err;
  }
}

async function readXhsRuntimeState(profileId) {
  const state = getProfileState(profileId);
  return {
    keyword: state.keyword || null,
    currentNoteId: state.currentNoteId || null,
    lastCommentsHarvest: state.lastCommentsHarvest && typeof state.lastCommentsHarvest === 'object'
      ? state.lastCommentsHarvest
      : null,
  };
}

async function executeDetailHarvestOperation({ profileId, context = {} }) {
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

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_detail_harvest done',
    data: {
      harvested: true,
      detail: state.lastDetail,
      collectability: elementMeta.collectability,
      skippedElements: elementMeta.skippedElements,
      fallbackCaptured: elementMeta.fallbackCaptured,
    },
  };
}

async function executeExpandRepliesOperation({ profileId, context = {} }) {
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const seen = new Set();
  let expanded = 0;
  let scanned = 0;

  for (let round = 0; round < 8; round += 1) {
    const snapshot = await readExpandButtons(profileId);
    const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
    scanned = Math.max(scanned, rows.length);
    const next = rows.find((row) => row && row.center && !seen.has(row.signature));
    if (!next) break;
    seen.add(next.signature);

    await sleepRandom(500, 1200, pushTrace, 'expand_pre_click', { round: round + 1, text: String(next.text || '').slice(0, 40) });
    await clickPoint(profileId, next.center, { steps: 3 });
    pushTrace({ kind: 'click', stage: 'xhs_expand_replies', round: round + 1, text: String(next.text || '').slice(0, 40) });
    expanded += 1;
    await sleepRandom(700, 1800, pushTrace, 'expand_post_click', { round: round + 1 });
  }

  emitActionTrace(context, actionTrace, { stage: 'xhs_expand_replies' });

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_expand_replies done',
    data: {
      expanded,
      scanned,
    },
  };
}

async function executeCommentsHarvestOperation({
  profileId,
  params = {},
  context = {},
}) {
  const state = getProfileState(profileId);
  const metricsState = state.metrics || (state.metrics = {});
  metricsState.searchCount = Number(metricsState.searchCount || 0);

  const { actionTrace, pushTrace } = buildTraceRecorder();

  const maxRounds = Math.max(1, Number(params.maxRounds ?? params.maxScrollRounds ?? 24) || 24);
  const scrollStepMin = Math.max(120, Number(params.scrollStepMin ?? params.scrollStep ?? 420) || 420);
  const scrollStepMax = Math.max(scrollStepMin, Number(params.scrollStepMax ?? scrollStepMin) || scrollStepMin);
  const settleMinMs = Math.max(500, Number(params.settleMinMs ?? params.settleMs ?? 900) || 900);
  const settleMaxMs = Math.max(settleMinMs, Number(params.settleMaxMs ?? 2200) || 2200);
  const stallRounds = Math.max(2, Number(params.stallRounds ?? 5) || 5);
  const requireBottom = params.requireBottom !== false;
  const includeComments = params.includeComments !== false;
  const commentsLimit = Math.max(0, Number(params.commentsLimit ?? 0) || 0);
  const detailSnapshot = await readDetailSnapshot(profileId).catch(() => ({}));

  let detailVisible = false;
  let commentsReady = false;
  let precheckSnapshot = null;
  for (let probe = 0; probe < 40; probe += 1) {
    const snapshot = await readCommentsSnapshot(profileId);
    precheckSnapshot = snapshot;
    if (snapshot?.detailVisible === true) {
      detailVisible = true;
    }
    if (snapshot?.detailVisible === true && snapshot?.hasCommentsContext === true) {
      commentsReady = true;
      break;
    }
    await sleepRandom(settleMinMs, settleMaxMs, pushTrace, 'comments_precheck', { probe: probe + 1 });
  }
  const elementMeta = buildElementCollectability(detailSnapshot, precheckSnapshot);
  const returnSkippedComments = (commentsSkippedReason) => {
    const now = new Date().toISOString();
    state.currentComments = [];
    state.commentsCollectedAt = now;
    state.lastCommentsHarvest = {
      noteId: state.currentNoteId || detailSnapshot?.noteIdFromUrl || null,
      searchCount: Number(metricsState.searchCount || 0),
      collected: 0,
      expectedCommentsCount: Number.isFinite(Number(precheckSnapshot?.expectedCommentsCount))
        ? Number(precheckSnapshot.expectedCommentsCount)
        : null,
      commentCoverageRate: null,
      recoveries: 0,
      maxRecoveries: Math.max(0, Number(params.maxRecoveries ?? 2) || 2),
      reachedBottom: false,
      exitReason: commentsSkippedReason,
      rounds: 0,
      configuredMaxRounds: maxRounds,
      maxRounds,
      maxRoundsSource: 'configured',
      budgetExpectedCommentsCount: null,
      scroll: precheckSnapshot?.metrics && typeof precheckSnapshot.metrics === 'object'
        ? {
          scrollTop: Number(precheckSnapshot.metrics.scrollTop || 0),
          scrollHeight: Number(precheckSnapshot.metrics.scrollHeight || 0),
          clientHeight: Number(precheckSnapshot.metrics.clientHeight || 0),
        }
        : { scrollTop: 0, scrollHeight: 0, clientHeight: 0 },
      collectability: elementMeta.collectability,
      skippedElements: elementMeta.skippedElements,
      fallbackCaptured: elementMeta.fallbackCaptured,
      commentsSkippedReason,
      at: now,
    };
    let payload = {
      noteId: state.currentNoteId || detailSnapshot?.noteIdFromUrl || null,
      searchCount: Number(metricsState.searchCount || 0),
      collected: 0,
      expectedCommentsCount: state.lastCommentsHarvest.expectedCommentsCount,
      commentCoverageRate: null,
      recoveries: 0,
      maxRecoveries: state.lastCommentsHarvest.maxRecoveries,
      firstComment: null,
      reachedBottom: false,
      exitReason: commentsSkippedReason,
      commentsSkippedReason,
      rounds: 0,
      configuredMaxRounds: maxRounds,
      maxRounds,
      maxRoundsSource: 'configured',
      budgetExpectedCommentsCount: null,
      scroll: state.lastCommentsHarvest.scroll,
      collectability: elementMeta.collectability,
      skippedElements: elementMeta.skippedElements,
      fallbackCaptured: elementMeta.fallbackCaptured,
      actionTrace,
    };
    if (includeComments) {
      payload = {
        ...payload,
        comments: [],
        commentsTruncated: false,
      };
    }
    emitActionTrace(context, actionTrace, { stage: 'xhs_comments_harvest' });
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_comments_harvest done',
      data: {
        ...payload,
        commentsPath: null,
        commentsAdded: 0,
        commentsTotal: 0,
      },
    };
  };
  if (!detailVisible) {
    return returnSkippedComments('detail_not_ready_before_scroll');
  }
  if (!commentsReady) {
    return returnSkippedComments('comments_context_missing');
  }

  const commentMap = new Map();
  let rounds = 0;
  let reachedBottom = false;
  let exitReason = 'max_rounds_reached';
  let noProgressRounds = 0;
  let recoveries = 0;
  const maxRecoveries = Math.max(0, Number(params.maxRecoveries ?? 2) || 2);

  let expectedCommentsCount = null;
  let lastMetrics = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
  let lastScrollerCenter = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    rounds = round;
    const beforeSnapshot = await readCommentsSnapshot(profileId);
    if (beforeSnapshot?.detailVisible !== true) {
      exitReason = 'detail_hidden';
      break;
    }

    if (Number.isFinite(Number(beforeSnapshot?.expectedCommentsCount)) && Number(beforeSnapshot.expectedCommentsCount) >= 0) {
      expectedCommentsCount = Number(beforeSnapshot.expectedCommentsCount);
    }

    const beforeCount = commentMap.size;
    const rows = Array.isArray(beforeSnapshot?.rows) ? beforeSnapshot.rows : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const text = normalizeInlineText(row.text);
      if (!text) continue;
      const author = sanitizeAuthorText(row.userName || '', text);
      const key = `${author}::${text}`;
      if (commentMap.has(key)) continue;
      commentMap.set(key, {
        index: Number(row.index),
        userName: author,
        userId: String(row.userId || ''),
        text,
        timestamp: String(row.timestamp || ''),
        liked: row.alreadyLiked === true,
        firstSeenRound: round,
      });
    }

    lastMetrics = beforeSnapshot?.metrics && typeof beforeSnapshot.metrics === 'object'
      ? {
        scrollTop: Number(beforeSnapshot.metrics.scrollTop || 0),
        scrollHeight: Number(beforeSnapshot.metrics.scrollHeight || 0),
        clientHeight: Number(beforeSnapshot.metrics.clientHeight || 0),
      }
      : lastMetrics;
    lastScrollerCenter = beforeSnapshot?.scrollerCenter && typeof beforeSnapshot.scrollerCenter === 'object'
      ? beforeSnapshot.scrollerCenter
      : lastScrollerCenter;

    const beforeDiff = Number(lastMetrics.scrollHeight - (lastMetrics.scrollTop + lastMetrics.clientHeight));
    if (Number.isFinite(beforeDiff) && beforeDiff <= 6) {
      reachedBottom = true;
      exitReason = 'bottom_reached';
      break;
    }

    if (commentsLimit > 0 && commentMap.size >= commentsLimit && !requireBottom) {
      exitReason = 'comments_limit_reached';
      break;
    }

    const roundStep = randomBetween(scrollStepMin, scrollStepMax);
    pushTrace({ kind: 'scroll', stage: 'xhs_comments_harvest', round, deltaY: roundStep });
    await wheel(profileId, roundStep);
    await sleepRandom(settleMinMs, settleMaxMs, pushTrace, 'comments_settle', { round });

    const afterSnapshot = await readCommentsSnapshot(profileId);
    const afterRows = Array.isArray(afterSnapshot?.rows) ? afterSnapshot.rows : [];
    for (const row of afterRows) {
      if (!row || typeof row !== 'object') continue;
      const text = normalizeInlineText(row.text);
      if (!text) continue;
      const author = sanitizeAuthorText(row.userName || '', text);
      const key = `${author}::${text}`;
      if (commentMap.has(key)) continue;
      commentMap.set(key, {
        index: Number(row.index),
        userName: author,
        userId: String(row.userId || ''),
        text,
        timestamp: String(row.timestamp || ''),
        liked: row.alreadyLiked === true,
        firstSeenRound: round,
      });
    }

    const afterMetrics = afterSnapshot?.metrics && typeof afterSnapshot.metrics === 'object'
      ? {
        scrollTop: Number(afterSnapshot.metrics.scrollTop || 0),
        scrollHeight: Number(afterSnapshot.metrics.scrollHeight || 0),
        clientHeight: Number(afterSnapshot.metrics.clientHeight || 0),
      }
      : lastMetrics;
    lastMetrics = afterMetrics;

    const moved = Math.abs(Number(afterMetrics.scrollTop || 0) - Number(beforeSnapshot?.metrics?.scrollTop || 0)) > 1;
    const increased = commentMap.size > beforeCount;
    if (!moved && !increased) {
      noProgressRounds += 1;
    } else {
      noProgressRounds = 0;
    }

    const afterDiff = Number(afterMetrics.scrollHeight - (afterMetrics.scrollTop + afterMetrics.clientHeight));
    if (Number.isFinite(afterDiff) && afterDiff <= 6) {
      reachedBottom = true;
      exitReason = 'bottom_reached';
      break;
    }

    if (commentsLimit > 0 && commentMap.size >= commentsLimit && !requireBottom) {
      exitReason = 'comments_limit_reached';
      break;
    }

    if (noProgressRounds >= stallRounds) {
      if (recoveries < maxRecoveries) {
        recoveries += 1;
        noProgressRounds = 0;
        pushTrace({ kind: 'scroll', stage: 'xhs_comments_harvest_recovery', round, recovery: recoveries, deltaY: -420 });
        await wheel(profileId, -420);
        await sleepRandom(settleMinMs, settleMaxMs, pushTrace, 'comments_recovery_settle', { round, recovery: recoveries });
        pushTrace({ kind: 'scroll', stage: 'xhs_comments_harvest_recovery', round, recovery: recoveries, deltaY: 760 });
        await wheel(profileId, 760);
        await sleepRandom(settleMinMs, settleMaxMs, pushTrace, 'comments_recovery_settle', { round, recovery: recoveries, pass: 'down' });
      } else if (!requireBottom) {
        exitReason = 'no_new_comments';
        break;
      } else {
        exitReason = 'scroll_stalled_after_recovery';
        break;
      }
    }

    if (round === maxRounds) {
      exitReason = 'max_rounds_reached';
    }
  }

  const comments = Array.from(commentMap.values())
    .sort((a, b) => Number(a.firstSeenRound || 0) - Number(b.firstSeenRound || 0))
    .map((item, index) => ({
      index,
      author: item.userName,
      userName: item.userName,
      userId: item.userId,
      text: item.text,
      liked: item.liked,
      timestamp: item.timestamp,
    }));

  const commentCoverageRate = Number.isFinite(Number(expectedCommentsCount)) && Number(expectedCommentsCount) > 0
    ? Number(Math.min(1, comments.length / Number(expectedCommentsCount)).toFixed(4))
    : null;

  state.currentComments = comments;
  state.commentsCollectedAt = new Date().toISOString();
  state.lastCommentsHarvest = {
    noteId: state.currentNoteId || null,
    searchCount: Number(metricsState.searchCount || 0),
    collected: comments.length,
    expectedCommentsCount,
    commentCoverageRate,
    recoveries,
    maxRecoveries,
    reachedBottom,
    exitReason,
    rounds,
    configuredMaxRounds: maxRounds,
    maxRounds,
    maxRoundsSource: 'configured',
    budgetExpectedCommentsCount: expectedCommentsCount,
    scroll: lastMetrics,
    collectability: elementMeta.collectability,
    skippedElements: elementMeta.skippedElements,
    fallbackCaptured: elementMeta.fallbackCaptured,
    commentsSkippedReason: null,
    at: state.commentsCollectedAt,
  };

  let payload = {
    noteId: state.currentNoteId || null,
    searchCount: Number(metricsState.searchCount || 0),
    collected: comments.length,
    expectedCommentsCount,
    commentCoverageRate,
    recoveries,
    maxRecoveries,
    firstComment: comments[0] || null,
    reachedBottom,
    exitReason,
    rounds,
    configuredMaxRounds: maxRounds,
    maxRounds,
    maxRoundsSource: 'configured',
    budgetExpectedCommentsCount: expectedCommentsCount,
    scroll: lastMetrics,
    collectability: elementMeta.collectability,
    skippedElements: elementMeta.skippedElements,
    fallbackCaptured: elementMeta.fallbackCaptured,
    commentsSkippedReason: null,
    actionTrace,
  };
  if (includeComments) {
    const bounded = commentsLimit > 0 ? comments.slice(0, commentsLimit) : comments;
    payload = {
      ...payload,
      comments: bounded,
      commentsTruncated: commentsLimit > 0 && comments.length > commentsLimit,
    };
  }

  emitActionTrace(context, actionTrace, { stage: 'xhs_comments_harvest' });

  const shouldPersistComments = params.persistComments === true || params.persistCollectedComments === true;
  const includePayloadComments = params.includeComments !== false;
  const payloadComments = Array.isArray(payload.comments) ? payload.comments : [];

  if (!shouldPersistComments || !includePayloadComments || payloadComments.length === 0) {
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_comments_harvest done',
      data: {
        ...payload,
        commentsPath: null,
        commentsAdded: 0,
        commentsTotal: Number(payload.collected || payloadComments.length || 0),
      },
    };
  }

  const runtimeState = await readXhsRuntimeState(profileId);
  const output = resolveXhsOutputContext({
    params,
    state: runtimeState,
    noteId: payload.noteId || runtimeState.currentNoteId || params.noteId,
  });

  const merged = await mergeCommentsJsonl({
    filePath: output.commentsPath,
    noteId: output.noteId,
    comments: payloadComments,
  });

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comments_harvest done',
    data: {
      ...payload,
      commentsPath: merged.filePath,
      commentsAdded: merged.added,
      commentsTotal: merged.total,
      outputNoteDir: output.noteDir,
    },
  };
}

async function executeCommentMatchOperation({ profileId, params = {} }) {
  const state = getProfileState(profileId);
  const rows = Array.isArray(state.currentComments) ? state.currentComments : [];
  const keywords = normalizeArray(params.keywords || params.matchKeywords)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (keywords.length === 0) {
    const text = String(params.keywords || params.matchKeywords || '').trim();
    if (text) {
      for (const token of text.split(',')) {
        const normalized = String(token || '').trim();
        if (normalized) keywords.push(normalized);
      }
    }
  }

  const mode = String(params.mode || params.matchMode || 'any').trim();
  const minHits = Math.max(1, Number(params.minHits ?? params.matchMinHits ?? 1) || 1);
  const tokens = keywords
    .map((item) => String(item || '').toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const matches = [];
  for (const row of rows) {
    const text = String(row?.text || row?.content || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text || tokens.length === 0) continue;
    const hits = tokens.filter((token) => text.includes(token));
    if (mode === 'all' && hits.length < tokens.length) continue;
    if (mode === 'atLeast' && hits.length < minHits) continue;
    if (mode !== 'all' && mode !== 'atLeast' && hits.length === 0) continue;
    matches.push({ index: Number(row?.index || 0), hits });
  }

  state.matchedComments = matches;
  state.matchRule = { tokens, mode, minHits };

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comment_match done',
    data: {
      matchCount: matches.length,
      mode,
      minHits,
    },
  };
}

async function executeCommentLikeOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const maxLikes = Math.max(1, Number(params.maxLikes ?? params.maxLikesPerRound ?? 1) || 1);
  const rawKeywords = normalizeArray(params.keywords || params.likeKeywords);
  const rules = compileLikeRules(rawKeywords);
  const dryRun = params.dryRun === true;
  const saveEvidence = params.saveEvidence !== false;
  const persistLikeState = params.persistLikeState !== false;
  const persistComments = params.persistComments === true || params.persistCollectedComments === true;
  const fallbackPickOne = params.pickOneIfNoNew !== false;

  const snapshot = await readCommentsSnapshot(profileId);
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  if (rows.length > 0) {
    state.currentComments = rows.map((row, idx) => ({
      index: Number(row.index ?? idx),
      userName: String(row.userName || ''),
      userId: String(row.userId || ''),
      text: String(row.text || ''),
      timestamp: String(row.timestamp || ''),
      liked: row.alreadyLiked === true,
    }));
  }

  const runtimeState = await readXhsRuntimeState(profileId);
  const output = resolveXhsOutputContext({
    params,
    state: runtimeState,
    noteId: snapshot?.noteIdFromUrl || runtimeState.currentNoteId || params.noteId,
  });
  const evidenceDir = dryRun ? output.virtualLikeEvidenceDir : output.likeEvidenceDir;
  if (saveEvidence) {
    await ensureDir(evidenceDir);
  }

  const likedSignatures = persistLikeState ? await loadLikedSignatures(output.likeStatePath) : new Set();
  const likedComments = [];

  let hitCount = 0;
  let likedCount = 0;
  let dedupSkipped = 0;
  let alreadyLikedSkipped = 0;
  let missingLikeControl = 0;
  let clickFailed = 0;
  let verifyFailed = 0;

  if (persistComments && rows.length > 0) {
    await mergeCommentsJsonl({
      filePath: output.commentsPath,
      noteId: output.noteId,
      comments: rows,
    }).catch(() => null);
  }

  const { actionTrace, pushTrace } = buildTraceRecorder();

  const candidates = rows.map((row) => ({
    ...row,
    text: normalizeText(row.text),
  })).filter((row) => row.text);

  const tryLikeRow = async (row, matchedRule = 'fallback') => {
    const operationTimeoutMs = Math.max(1000, Number(params.operationTimeoutMs ?? params.operationTimeout ?? 10000) || 10000);
    const startedAt = Date.now();
    const timeRemaining = () => operationTimeoutMs - (Date.now() - startedAt);
    const signature = makeLikeSignature({
      noteId: output.noteId,
      userId: String(row.userId || ''),
      userName: String(row.userName || ''),
      text: row.text,
    });

    if (signature && likedSignatures.has(signature)) {
      dedupSkipped += 1;
      return false;
    }

    if (!row.hasLikeControl) {
      missingLikeControl += 1;
      return false;
    }

    if (row.alreadyLiked) {
      alreadyLikedSkipped += 1;
      if (persistLikeState && signature) {
        likedSignatures.add(signature);
        await appendLikedSignature(output.likeStatePath, signature, {
          noteId: output.noteId,
          userId: String(row.userId || ''),
          userName: String(row.userName || ''),
          reason: 'already_liked',
        }).catch(() => null);
      }
      return false;
    }

    if (dryRun) return false;

    const beforePath = saveEvidence
      ? await captureScreenshotToFile({
        profileId,
        filePath: path.join(evidenceDir, `like-before-idx-${String(row.index).padStart(3, '0')}-${Date.now()}.png`),
      })
      : null;

    let likedOk = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (timeRemaining() <= 0) break;
      const targetBefore = await readLikeTargetByIndex(profileId, row.index);
      if (!targetBefore || targetBefore.ok !== true || !targetBefore.center) {
        clickFailed += 1;
        continue;
      }
      if (targetBefore.alreadyLiked) {
        alreadyLikedSkipped += 1;
        return false;
      }

      try {
        await clickPoint(profileId, targetBefore.center, { steps: 4 });
      } catch {
        clickFailed += 1;
      }
      pushTrace({ kind: 'click', stage: 'xhs_comment_like', commentIndex: Number(row.index), attempt });
      await sleepRandom(500, 1600, pushTrace, 'like_post_click', { commentIndex: Number(row.index), attempt });

      const targetAfter = await readLikeTargetByIndex(profileId, row.index);
      if (targetAfter && targetAfter.ok === true && targetAfter.alreadyLiked) {
        likedOk = true;
        break;
      }
      verifyFailed += 1;
    }
    const afterPath = saveEvidence
      ? await captureScreenshotToFile({
        profileId,
        filePath: path.join(evidenceDir, `like-after-idx-${String(row.index).padStart(3, '0')}-${Date.now()}.png`),
      })
      : null;

    if (!likedOk) {
      await captureOperationFailure({
        profileId,
        params,
        context,
        stage: 'xhs_comment_like',
        noteId: output.noteId,
        reason: 'like_verify_failed',
        extra: { commentIndex: Number(row.index) },
      }).catch(() => null);
      return false;
    }

    likedCount += 1;
    if (persistLikeState && signature) {
      likedSignatures.add(signature);
      await appendLikedSignature(output.likeStatePath, signature, {
        noteId: output.noteId,
        userId: String(row.userId || ''),
        userName: String(row.userName || ''),
        reason: 'liked',
      }).catch(() => null);
    }
    likedComments.push({
      index: Number(row.index),
      userId: String(row.userId || ''),
      userName: String(row.userName || ''),
      content: row.text,
      timestamp: String(row.timestamp || ''),
      matchedRule,
      screenshots: {
        before: beforePath,
        after: afterPath,
      },
    });
    return true;
  };

  for (const row of candidates) {
    if (likedCount >= maxLikes) break;
    let match = null;
    if (rules.length === 0) {
      const matchedByState = Array.isArray(state.matchedComments)
        && state.matchedComments.some((item) => Number(item?.index) === Number(row.index));
      if (!matchedByState) continue;
      match = { ok: true, reason: 'state_match', matchedRule: 'state_match' };
    } else {
      match = matchLikeText(row.text, rules);
      if (!match.ok) continue;
    }
    hitCount += 1;
    await tryLikeRow(row, match.matchedRule || match.reason || 'match');
  }

  if (!dryRun && fallbackPickOne && likedCount < maxLikes) {
    for (const row of candidates) {
      if (likedCount >= maxLikes) break;
      hitCount += 1;
      const ok = await tryLikeRow(row, 'fallback_first_available');
      if (ok) break;
    }
  }

  emitActionTrace(context, actionTrace, { stage: 'xhs_comment_like', noteId: output.noteId });

  const skippedCount = missingLikeControl + clickFailed + verifyFailed;
  const likedTotal = likedCount + dedupSkipped + alreadyLikedSkipped;
  const hitCheckOk = likedTotal + skippedCount === hitCount;
  const summary = {
    noteId: output.noteId,
    keyword: output.keyword,
    env: output.env,
    likeKeywords: rawKeywords,
    maxLikes,
    scannedCount: rows.length,
    hitCount,
    likedCount,
    skippedCount,
    likedTotal,
    hitCheckOk,
    skippedBreakdown: {
      missingLikeControl,
      clickFailed,
      verifyFailed,
    },
    likedBreakdown: {
      newLikes: likedCount,
      alreadyLiked: alreadyLikedSkipped,
      dedup: dedupSkipped,
    },
    reachedBottom: snapshot?.metrics
      ? Number(snapshot.metrics.scrollHeight || 0) - (Number(snapshot.metrics.scrollTop || 0) + Number(snapshot.metrics.clientHeight || 0)) <= 6
      : false,
    stopReason: String(state.lastCommentsHarvest?.exitReason || '').trim() || null,
    likedComments,
    ts: new Date().toISOString(),
  };

  let summaryPath = null;
  if (saveEvidence) {
    summaryPath = await writeJsonFile(path.join(evidenceDir, `summary-${Date.now()}.json`), summary).catch(() => null);
  }

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comment_like done',
    data: {
      noteId: output.noteId,
      scannedCount: rows.length,
      hitCount,
      likedCount,
      skippedCount,
      likedTotal,
      hitCheckOk,
      dedupSkipped,
      alreadyLikedSkipped,
      missingLikeControl,
      clickFailed,
      verifyFailed,
      likedComments,
      commentsPath: persistComments ? output.commentsPath : null,
      likeStatePath: persistLikeState ? output.likeStatePath : null,
      evidenceDir: saveEvidence ? evidenceDir : null,
      summaryPath,
      reachedBottom: summary.reachedBottom,
      stopReason: summary.stopReason,
    },
  };
}

async function executeCommentReplyOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const replyText = String(params.replyText || '').trim();
  if (!replyText) {
    return asErrorPayload('OPERATION_FAILED', 'replyText is required');
  }

  const matches = Array.isArray(state.matchedComments) ? state.matchedComments : [];
  if (matches.length === 0) {
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_comment_reply done',
      data: { typed: false, reason: 'no_match' },
    };
  }

  const index = Number(matches[0]?.index || 0);
  const { actionTrace, pushTrace } = buildTraceRecorder();

  const target = await readReplyTargetByIndex(profileId, index);
  if (!target || target.ok !== true || !target.center) {
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_comment_reply done',
      data: { typed: false, reason: 'match_not_visible', index },
    };
  }

  await clickPoint(profileId, target.center, { steps: 3 });
  pushTrace({ kind: 'click', stage: 'xhs_comment_reply', target: 'comment', index });
  await sleepRandom(500, 1200, pushTrace, 'reply_after_comment_click', { index });

  const inputTarget = await readReplyInputTarget(profileId);
  if (!inputTarget || !inputTarget.center) {
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_comment_reply done',
      data: { typed: false, reason: 'reply_input_not_found', index },
    };
  }

  await clickPoint(profileId, inputTarget.center, { steps: 2 });
  pushTrace({ kind: 'click', stage: 'xhs_comment_reply', target: 'reply_input', index });
  await sleepRandom(500, 1100, pushTrace, 'reply_pre_type', { index });
  await clearAndType(profileId, replyText, Number(params.keyDelayMs ?? 65) || 65);
  pushTrace({ kind: 'type', stage: 'xhs_comment_reply', target: 'reply_input', length: replyText.length, index });
  await sleepRandom(500, 1400, pushTrace, 'reply_post_type', { index });

  const sendCenter = await readReplySendButtonTarget(profileId);
  if (sendCenter) {
    await clickPoint(profileId, sendCenter, { steps: 2 });
    pushTrace({ kind: 'click', stage: 'xhs_comment_reply', target: 'reply_send', index });
  }

  state.lastReply = { typed: true, index, at: new Date().toISOString() };
  emitActionTrace(context, actionTrace, { stage: 'xhs_comment_reply', index });

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_comment_reply done',
    data: state.lastReply,
  };
}

async function executeCloseDetailOperation({ profileId, context = {} }) {
  const state = getProfileState(profileId);
  const metrics = state.metrics || (state.metrics = {});
  metrics.searchCount = Number(metrics.searchCount || 0);
  metrics.rollbackCount = Number(metrics.rollbackCount || 0);
  metrics.returnToSearchCount = Number(metrics.returnToSearchCount || 0);

  const harvest = state.lastCommentsHarvest && typeof state.lastCommentsHarvest === 'object'
    ? state.lastCommentsHarvest
    : null;
  const exitMeta = {
    pageExitReason: String(harvest?.exitReason || 'close_without_harvest').trim(),
    reachedBottom: typeof harvest?.reachedBottom === 'boolean' ? harvest.reachedBottom : null,
    commentsCollected: Number.isFinite(Number(harvest?.collected)) ? Number(harvest.collected) : null,
    expectedCommentsCount: Number.isFinite(Number(harvest?.expectedCommentsCount)) ? Number(harvest.expectedCommentsCount) : null,
    commentCoverageRate: Number.isFinite(Number(harvest?.commentCoverageRate)) ? Number(harvest.commentCoverageRate) : null,
    scrollRecoveries: Number.isFinite(Number(harvest?.recoveries)) ? Number(harvest.recoveries) : 0,
    harvestRounds: Number.isFinite(Number(harvest?.rounds)) ? Number(harvest.rounds) : null,
  };

  const { actionTrace, pushTrace } = buildTraceRecorder();
  const firstSnapshot = await isDetailVisible(profileId);
  if (firstSnapshot?.detailVisible !== true) {
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'xhs_close_detail done',
      data: {
        closed: true,
        via: 'already_closed',
        searchVisible: firstSnapshot?.searchVisible === true,
        searchCount: Number(metrics.searchCount || 0),
        rollbackCount: Number(metrics.rollbackCount || 0),
        returnToSearchCount: Number(metrics.returnToSearchCount || 0),
        returnedToSearch: false,
        ...exitMeta,
      },
    };
  }

  metrics.rollbackCount += 1;
  metrics.lastRollbackAt = new Date().toISOString();

  const waitForCloseAnimation = async () => {
    for (let i = 0; i < 45; i += 1) {
      const s = await isDetailVisible(profileId);
      if (s?.detailVisible !== true) return true;
      await sleep(120);
    }
    const s = await isDetailVisible(profileId);
    return s?.detailVisible !== true;
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await pressKey(profileId, 'Escape');
    pushTrace({ kind: 'key', stage: 'xhs_close_detail', key: 'Escape', attempt });
    await sleep(randomBetween(220, 480));
    if (await waitForCloseAnimation()) {
      const s = await isDetailVisible(profileId);
      const searchVisible = s?.searchVisible === true;
      if (searchVisible) {
        metrics.returnToSearchCount += 1;
        metrics.lastReturnToSearchAt = new Date().toISOString();
      }
      emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
      return {
        ok: true,
        code: 'OPERATION_DONE',
        message: 'xhs_close_detail done',
        data: {
          closed: true,
          via: 'escape',
          attempts: attempt,
          searchVisible,
          searchCount: Number(metrics.searchCount || 0),
          rollbackCount: Number(metrics.rollbackCount || 0),
          returnToSearchCount: Number(metrics.returnToSearchCount || 0),
          returnedToSearch: searchVisible,
          ...exitMeta,
        },
      };
    }
  }
  const finalSnapshot = await isDetailVisible(profileId);
  await executeTimeoutSnapshotOperation({
    profileId,
    params: {
      runId: context.runId,
      operationId: 'close_detail',
      operationAction: 'xhs_close_detail',
      failureCode: 'CLOSE_DETAIL_TIMEOUT',
      failureMessage: 'detail not closed after escape retries',
      keyword: state.keyword || null,
      env: context?.params?.env,
    },
    context,
  });
  emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
  return asErrorPayload('OPERATION_FAILED', 'CLOSE_DETAIL_TIMEOUT', {
    detailVisible: finalSnapshot?.detailVisible === true,
    searchVisible: finalSnapshot?.searchVisible === true,
    searchCount: Number(metrics.searchCount || 0),
    rollbackCount: Number(metrics.rollbackCount || 0),
    returnToSearchCount: Number(metrics.returnToSearchCount || 0),
    ...exitMeta,
  });
}

async function handleRaiseError({ params }) {
  const code = String(params.code || params.message || 'AUTOSCRIPT_ABORT').trim();
  return asErrorPayload('OPERATION_FAILED', code || 'AUTOSCRIPT_ABORT');
}

const XHS_ACTION_HANDLERS = {
  raise_error: handleRaiseError,
  xhs_assert_logged_in: executeAssertLoggedInOperation,
  xhs_submit_search: executeSubmitSearchOperation,
  xhs_open_detail: executeOpenDetailOperation,
  xhs_detail_harvest: executeDetailHarvestOperation,
  xhs_expand_replies: executeExpandRepliesOperation,
  xhs_comments_harvest: executeCommentsHarvestOperation,
  xhs_comment_match: executeCommentMatchOperation,
  xhs_comment_like: executeCommentLikeOperation,
  xhs_comment_reply: executeCommentReplyOperation,
  xhs_close_detail: executeCloseDetailOperation,
  xhs_timeout_snapshot: executeTimeoutSnapshotOperation,
};

export function isXhsAutoscriptAction(action) {
  const normalized = String(action || '').trim();
  return normalized === 'raise_error' || normalized.startsWith('xhs_');
}

export async function executeXhsAutoscriptOperation({
  profileId,
  action,
  params = {},
  operation = null,
  context = {},
}) {
  const handler = XHS_ACTION_HANDLERS[action];
  if (!handler) {
    return asErrorPayload('UNSUPPORTED_OPERATION', `Unsupported xhs operation: ${action}`);
  }
  try {
    return await handler({ profileId, params, operation, context });
  } catch (err) {
    const message = String(err?.message || err || '');
    if (message.includes('forbidden_js_action')) {
      return asErrorPayload('JS_DISABLED', message);
    }
    return asErrorPayload('OPERATION_FAILED', message);
  }
}

export function __unsafe_getProfileStateForTests(profileId) {
  return getProfileState(profileId);
}
