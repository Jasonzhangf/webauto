import { callAPI } from '../../../utils/browser-service.mjs';
import { asErrorPayload } from '../../../container/runtime-core/utils.mjs';
import {
  extractEvaluateResultData,
  extractScreenshotBase64,
  runEvaluateScript,
} from './common.mjs';
import {
  getProfileState,
  withSerializedLock,
} from './state.mjs';
import {
  emitOperationProgress,
  emitActionTrace,
  buildTraceRecorder,
} from './trace.mjs';
import {
  resolveSearchLockKey,
  resolveSharedClaimPath,
  normalizeNoteIdList,
  randomBetween,
} from './utils.mjs';
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
} from './persistence.mjs';
import {
  sleep,
  sleepRandom,
  withTimeout,
  evaluateReadonly,
  readLocation,
  clickPoint,
  wheel,
  pressKey,
  clearAndType,
  resolveSelectorTarget,
} from './dom-ops.mjs';
import {
  readSearchInput,
  readSearchCandidates,
  readSearchCandidateByNoteId,
  readSearchHitAtPoint,
  ensureSearchCandidateFullyVisible,
  readSearchViewportReady,
  paintSearchCandidates,
} from './search-ops.mjs';
import {
  isDetailVisible,
  readDetailCloseTarget,
  closeDetailToSearch,
  readDetailSnapshot,
  readExpandButtons,
} from './detail-ops.mjs';
import {
  readCommentsSnapshot,
  readLikeTargetByIndex,
  readReplyTargetByIndex,
  readReplyInputTarget,
  readReplyInputValue,
  readReplySendButtonTarget,
} from './comments-ops.mjs';
import { buildElementCollectability, normalizeInlineText, sanitizeAuthorText } from './utils.mjs';

export async function captureScreenshotToFile({ profileId, filePath }) {
  const payload = await callAPI('screenshot:capture', { profileId });
  const base64 = extractScreenshotBase64(payload);
  if (!base64) throw new Error('SCREENSHOT_CAPTURE_FAILED');
  await savePngBase64(base64, filePath);
  return filePath;
}

export function sanitizeFileComponent(value, fallback = 'unknown') {
  const text = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return text || fallback;
}

export async function captureOperationFailure({ profileId, params = {}, context = {}, stage = '', noteId = '', reason = '', extra = {} }) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({ params, state, noteId: noteId || state.currentNoteId || params.noteId });
  const diagnosticsDir = path.join(output.keywordDir, 'diagnostics', 'failures');
  await ensureDir(diagnosticsDir);
  const runId = String(params.runId || context.runId || '').trim();
  const operationId = String(params.operationId || params.operationAction || stage || 'operation').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `failure-${sanitizeFileComponent(runId, 'run')}-${sanitizeFileComponent(operationId, 'op')}-${stamp}`;
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
    failureCode: reason || params.failureCode || 'OPERATION_FAILURE',
    failureMessage: params.failureMessage || null,
    subscriptionId: params.subscriptionId || null,
    keyword: params.keyword || output.keyword,
    env: params.env || output.env,
    outputRoot: output.root,
    stage,
    noteId: noteId || state.currentNoteId || null,
    extra,
    capturedAt: new Date().toISOString(),
    screenshotPath,
    domError,
    domSnapshot,
  };
  await writeJsonFile(jsonPath, payload);
  emitOperationProgress(context, { kind: 'failure_snapshot', jsonPath, screenshotPath, reason, stage, noteId });
  return { jsonPath, screenshotPath };
}

export function buildTimeoutDomSnapshotScript() {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
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
      return true;
    };
    const detailSelectors = ['.note-detail-mask', '.note-detail-page', '.note-detail-dialog'];
    const searchSelectors = ['.feeds-page', '.note-item', '.search-result-list'];
    const detailVisible = detailSelectors.some((selector) => isVisible(document.querySelector(selector)));
    const searchVisible = searchSelectors.some((selector) => isVisible(document.querySelector(selector)));
    const html = document.documentElement?.outerHTML || '';
    const active = document.activeElement;
    const closeRect = (function() {
      const btn = document.querySelector('.note-detail-mask .close-btn, .note-detail-page .close-btn, .close-btn');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })();
    return {
      detailVisible,
      searchVisible,
      href: normalize(location.href || ''),
      title: normalize(document.title || ''),
      activeElement: active ? { id: String(active.id || ''), className: String(active.className || '').slice(0, 180) } : null,
      closeRect: closeRect ? { left: Number(closeRect.left || 0), top: Number(closeRect.top || 0), width: Number(closeRect.width || 0), height: Number(closeRect.height || 0) } : null,
      domLength: html.length,
      domSnippet: html.slice(0, 50000),
      capturedAt: new Date().toISOString(),
    };
  })()`;
}

export async function executeTimeoutSnapshotOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({ params, state, noteId: state.currentNoteId || params.noteId });
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
  emitOperationProgress(context, { kind: 'timeout_snapshot', jsonPath, screenshotPath, href: domSnapshot?.href || null, detailVisible: domSnapshot?.detailVisible === true, searchVisible: domSnapshot?.searchVisible === true });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_timeout_snapshot done', data: { jsonPath, screenshotPath, domError, detailVisible: domSnapshot?.detailVisible === true, searchVisible: domSnapshot?.searchVisible === true } };
}

export function buildAssertLoggedInScript(params = {}) {
  const selectors = Array.isArray(params.loginSelectors) && params.loginSelectors.length > 0
    ? params.loginSelectors.map((item) => String(item || '').trim()).filter(Boolean)
    : ['.login-container', '.login-dialog', '#login-container'];
  const loginPattern = String(params.loginPattern || '登录 | 扫码 | 验证码 | 手机号 | 请先登录 | 注册 |sign\\s*in').trim();
  return `(() => {
    const guardSelectors = ${JSON.stringify(selectors)};
    const loginPattern = new RegExp(${JSON.stringify(loginPattern || '登录 | 扫码 | 验证码 | 手机号 | 请先登录 | 注册 |sign\\\\s*in')}, 'i');
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
    const guardTexts = visibleGuardNodes.slice(0, 10).map((node) => normalize(node.textContent || '')).filter(Boolean);
    const mergedGuardText = guardTexts.join(' ');
    const hasLoginText = loginPattern.test(mergedGuardText);
    const loginUrl = /\\/login|signin|passport|account\\/login/i.test(String(location.href || ''));
    let accountId = '';
    try {
      const initialState = (typeof window !== 'undefined' && window.__INITIAL_STATE__) || null;
      const rawUserInfo = initialState && initialState.user && initialState.user.userInfo
        ? ((initialState.user.userInfo._rawValue && typeof initialState.user.userInfo._rawValue === 'object' && initialState.user.userInfo._rawValue) || (initialState.user.userInfo._value && typeof initialState.user.userInfo._value === 'object' && initialState.user.userInfo._value) || (typeof initialState.user.userInfo === 'object' ? initialState.user.userInfo : null))
        : null;
      accountId = normalize(rawUserInfo?.user_id || rawUserInfo?.userId || '');
    } catch {}
    if (!accountId) {
      const selfAnchor = Array.from(document.querySelectorAll('a[href*="/user/profile/"]')).find((node) => {
        const text = normalize(node.textContent || '');
        const title = normalize(node.getAttribute('title') || '');
        const aria = normalize(node.getAttribute('aria-label') || '');
        return ['我', '我的', '个人主页', '我的主页'].includes(text) || ['我', '我的', '个人主页', '我的主页'].includes(title) || ['我', '我的', '个人主页', '我的主页'].includes(aria);
      });
      if (selfAnchor) {
        const href = normalize(selfAnchor.getAttribute('href') || '');
        const matched = href.match(/\\/user\\/profile\\/([^/?#]+)/);
        if (matched && matched[1]) accountId = normalize(matched[1]);
      }
    }
    const hasAccountSignal = Boolean(accountId);
    const hasLoginGuard = (visibleGuardNodes.length > 0 && hasLoginText) || loginUrl;
    return { hasLoginGuard, hasAccountSignal, accountId: accountId || null, url: String(location.href || ''), visibleGuardCount: visibleGuardNodes.length, guardTextPreview: mergedGuardText.slice(0, 240), loginUrl, hasLoginText, guardSelectors };
  })()`;
}

export async function executeAssertLoggedInOperation({ profileId, params = {} }) {
  const payload = await runEvaluateScript({ profileId, script: buildAssertLoggedInScript(params), highlight: false });
  const data = extractEvaluateResultData(payload) || {};
  if (data?.hasLoginGuard === true) {
    const code = String(params.code || 'LOGIN_GUARD_DETECTED').trim() || 'LOGIN_GUARD_DETECTED';
    return asErrorPayload('OPERATION_FAILED', code, { guard: data });
  }
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_assert_logged_in done', data };
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
    const afterUrl = await readLocation(profileId);
    profileState.keyword = keyword || profileState.keyword;
    profileState.lastListUrl = afterUrl || beforeUrl || null;
    metrics.searchCount = Math.max(0, Number(metrics.searchCount || 0) || 0) + 1;
    metrics.lastSearchAt = new Date().toISOString();
    emitActionTrace(context, actionTrace, { stage: 'xhs_submit_search' });
    return { ok: true, code: 'OPERATION_DONE', message: 'xhs_submit_search done', data: { keyword: keyword || null, method: via, beforeUrl, afterUrl, searchReady: readyResult.ready, readySelector: readyResult.readySelector || null, visibleNoteCount: readyResult.visibleNoteCount, elapsedMs: readyResult.elapsedMs, searchCount: metrics.searchCount } };
  });
}

export async function executeOpenDetailOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const noteId = String(params.noteId || '').trim();
  const noteUrl = String(params.noteUrl || '').trim();
  const openMode = String(params.mode || '').trim();
  const shouldCollectIndex = openMode === 'collect';
  const beforeUrl = await readLocation(profileId);
  const detailVisible = await isDetailVisible(profileId);
  if (detailVisible?.detailVisible === true) {
    await closeDetailToSearch(profileId, pushTrace);
    await sleep(300);
  }

  if (!noteId && !noteUrl && !shouldCollectIndex) {
    return asErrorPayload('INVALID_PARAMS', 'noteId or noteUrl required');
  }

  if (noteUrl) {
    await callAPI('goto', { profileId, url: noteUrl });
    await sleep(1000);
  } else if (shouldCollectIndex) {
    const candidates = await readSearchCandidates(profileId);
    const rows = Array.isArray(candidates?.rows) ? candidates.rows : [];
    const total = rows.length;
    if (total <= 0) {
      return asErrorPayload('COLLECT_INDEX_NOT_FOUND', 'no search candidates');
    }
    const collectIndexMaxAttempts = Math.max(1, Number(params.collectIndexMaxAttempts ?? 3) || 3);
    const collectIndexFailurePolicy = String(params.collectIndexFailurePolicy || 'retry').trim().toLowerCase();
    let collectIndex = Number(params.collectIndexStart ?? 0) || 0;
    collectIndex = Math.max(0, Math.min(collectIndex, Math.max(0, total - 1)));
    let opened = false;
    let collectAttempts = 0;
    while (collectAttempts < collectIndexMaxAttempts && total > 0) {
      collectAttempts += 1;
      const target = rows.find((row) => row.index === collectIndex) || null;
      if (!target || !target.center) {
        if (collectIndexFailurePolicy === 'skip') {
          collectIndex += 1;
          continue;
        }
        return asErrorPayload('COLLECT_INDEX_NOT_FOUND', `Index ${collectIndex} not found`);
      }
      if (!target.inViewport) {
        await ensureSearchCandidateFullyVisible(profileId, target.noteId || '');
      }
      await clickPoint(profileId, target.center, { steps: 3 });
      pushTrace({ kind: 'click', stage: 'open_detail', noteId: target.noteId, selector: target.selector, collectIndex });
      await sleep(1500);
      const detailSnapshot = await readDetailSnapshot(profileId);
      if (detailSnapshot?.noteIdFromUrl) {
        opened = true;
        state.currentNoteId = detailSnapshot.noteIdFromUrl;
        state.currentHref = detailSnapshot.href || null;
        break;
      }
      if (collectIndexFailurePolicy === 'skip') {
        collectIndex += 1;
      }
    }
    if (!opened) {
      return asErrorPayload('COLLECT_INDEX_OPEN_FAILED', `Index ${collectIndex} open failed after ${collectAttempts}`);
    }
  } else {
    const candidate = await readSearchCandidateByNoteId(profileId, noteId);
    if (!candidate?.found) {
      return asErrorPayload('NOTE_NOT_FOUND', `Note ${noteId} not in viewport`);
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
  state.currentNoteId = noteId || detailSnapshot?.noteIdFromUrl || state.currentNoteId || null;
  state.currentHref = afterUrl || null;
  state.lastListUrl = beforeUrl || null;
  emitActionTrace(context, actionTrace, { stage: 'xhs_open_detail' });
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_open_detail done',
    data: {
      opened: true,
      noteId: noteId || detailSnapshot?.noteIdFromUrl || state.currentNoteId || null,
      beforeUrl,
      afterUrl,
      detailVisible: true,
      collectIndex: shouldCollectIndex ? Number(params.collectIndexStart ?? 0) || 0 : null,
    },
  };
}

export async function executeCloseDetailOperation({ profileId, context = {} }) {
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const closed = await closeDetailToSearch(profileId, pushTrace);
  emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
  return { ok: closed, code: closed ? 'OPERATION_DONE' : 'CLOSE_FAILED', message: 'xhs_close_detail done', data: { closed } };
}

export function handleRaiseError({ params }) {
  const code = String(params.code || params.message || 'AUTOSCRIPT_ABORT').trim();
  return asErrorPayload('OPERATION_FAILED', code || 'AUTOSCRIPT_ABORT');
}
