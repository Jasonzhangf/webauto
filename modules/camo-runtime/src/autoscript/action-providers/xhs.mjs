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

const XHS_OPERATION_LOCKS = new Map();
const XHS_PROFILE_STATE = new Map();

function defaultProfileState() {
  return {
    keyword: null,
    currentNoteId: null,
    currentHref: null,
    lastListUrl: null,
    visitedNoteIds: [],
    preCollectedNoteIds: [],
    preCollectedAt: null,
    maxNotes: 0,
    currentComments: [],
    matchedComments: [],
    matchRule: null,
    lastCommentsHarvest: null,
    lastDetail: null,
    lastReply: null,
    metrics: {
      searchCount: 0,
      rollbackCount: 0,
      returnToSearchCount: 0,
      lastSearchAt: null,
      lastRollbackAt: null,
      lastReturnToSearchAt: null,
    },
  };
}

function getProfileState(profileId) {
  const key = String(profileId || '').trim() || 'default';
  if (!XHS_PROFILE_STATE.has(key)) {
    XHS_PROFILE_STATE.set(key, defaultProfileState());
  }
  return XHS_PROFILE_STATE.get(key);
}

function emitOperationProgress(context, payload = {}) {
  const emit = context?.emitProgress;
  if (typeof emit !== 'function') return;
  emit(payload);
}

function emitActionTrace(context, actionTrace = [], extra = {}) {
  if (!Array.isArray(actionTrace) || actionTrace.length === 0) return;
  for (let i = 0; i < actionTrace.length; i += 1) {
    const row = actionTrace[i];
    if (!row || typeof row !== 'object') continue;
    const kind = String(row.kind || row.action || '').trim().toLowerCase() || 'trace';
    emitOperationProgress(context, {
      kind,
      step: i + 1,
      ...extra,
      ...row,
    });
  }
}

function replaceEvaluateResultData(rawData, payload) {
  if (rawData && typeof rawData === 'object') {
    if (Object.prototype.hasOwnProperty.call(rawData, 'result')) {
      return { ...rawData, result: payload };
    }
    if (rawData.data && typeof rawData.data === 'object' && Object.prototype.hasOwnProperty.call(rawData.data, 'result')) {
      return { ...rawData, data: { ...rawData.data, result: payload } };
    }
  }
  return payload;
}

function toLockKey(text, fallback = '') {
  const value = String(text || '').trim();
  return value || fallback;
}

async function withSerializedLock(lockKey, fn) {
  const key = toLockKey(lockKey);
  if (!key) return fn();
  const previous = XHS_OPERATION_LOCKS.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  XHS_OPERATION_LOCKS.set(key, previous.catch(() => null).then(() => gate));
  await previous.catch(() => null);
  try {
    return await fn();
  } finally {
    release();
    if (XHS_OPERATION_LOCKS.get(key) === gate) XHS_OPERATION_LOCKS.delete(key);
  }
}

function normalizeNoteIdList(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const noteId = String(item || '').trim();
    if (!noteId || seen.has(noteId)) continue;
    seen.add(noteId);
    out.push(noteId);
  }
  return out;
}

function extractNoteIdFromHref(href) {
  const text = String(href || '').trim();
  if (!text) return '';
  const match = text.match(/\/explore\/([^/?#]+)/);
  if (match && match[1]) return String(match[1]).trim();
  const seg = text.split('/').filter(Boolean).pop() || '';
  return String(seg).split('?')[0].split('#')[0].trim();
}

function resolveSharedClaimPath(params = {}) {
  const raw = String(params.sharedHarvestPath || params.sharedClaimPath || '').trim();
  return raw ? path.resolve(raw) : '';
}

function resolveSearchLockKey(params = {}) {
  const raw = String(params.searchSerialKey || params.searchLockKey || '').trim();
  if (raw) return raw;
  const claimPath = resolveSharedClaimPath(params);
  return claimPath ? `claim:${claimPath}` : '';
}

async function loadSharedClaimDoc(filePath) {
  if (!filePath) {
    return { noteIds: [], byNoteId: {}, updatedAt: null };
  }
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const noteIds = normalizeNoteIdList(parsed?.noteIds);
    const byNoteId = parsed?.byNoteId && typeof parsed.byNoteId === 'object' ? parsed.byNoteId : {};
    return {
      noteIds,
      byNoteId,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return { noteIds: [], byNoteId: {}, updatedAt: null };
  }
}

async function saveSharedClaimDoc(filePath, doc) {
  if (!filePath) return;
  const noteIds = normalizeNoteIdList(doc?.noteIds);
  const payload = {
    updatedAt: new Date().toISOString(),
    noteIds,
    byNoteId: doc?.byNoteId && typeof doc.byNoteId === 'object' ? doc.byNoteId : {},
  };
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  const lo = Math.max(0, Math.floor(Number(min) || 0));
  const hi = Math.max(lo, Math.floor(Number(max) || 0));
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function buildTraceRecorder() {
  const actionTrace = [];
  const pushTrace = (payload) => {
    actionTrace.push({
      ts: new Date().toISOString(),
      ...payload,
    });
  };
  return { actionTrace, pushTrace };
}

function normalizeInlineText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeAuthorText(raw, commentText = '') {
  const text = normalizeInlineText(raw);
  if (!text) return '';
  if (commentText && text === commentText) return '';
  if (text.length > 40) return '';
  if (/^(回复|展开|收起|查看更多|评论|赞|分享|发送)$/.test(text)) return '';
  return text;
}

function buildElementCollectability(detail = {}, commentsSnapshot = null) {
  const href = String(detail?.href || '').trim();
  const videoUrl = String(detail?.videoUrl || '').trim();
  const videoPresent = detail?.videoPresent === true;
  const commentsContextAvailable = commentsSnapshot?.hasCommentsContext === true || detail?.commentsContextAvailable === true;
  const collectability = {
    canCollectText: detail?.textPresent === true,
    canCollectImages: Number(detail?.imageCount || 0) > 0,
    canCollectComments: commentsContextAvailable,
    canCollectVideo: false,
  };

  const skippedElements = [];
  if (videoPresent) {
    skippedElements.push({
      element: 'video',
      reason: 'video_capture_not_supported',
    });
  }
  if (!commentsContextAvailable) {
    skippedElements.push({
      element: 'comments',
      reason: 'comments_context_missing',
    });
  }

  const fallbackCaptured = {};
  if (href) fallbackCaptured.noteUrl = href;
  if (videoPresent) fallbackCaptured.videoUrl = videoUrl || href || null;

  return {
    collectability,
    skippedElements,
    fallbackCaptured,
  };
}

async function sleep(ms) {
  const waitMs = Math.max(0, Number(ms) || 0);
  if (waitMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function sleepRandom(minMs, maxMs, pushTrace, stage, extra = {}) {
  const waitMs = randomBetween(minMs, maxMs);
  if (typeof pushTrace === 'function') {
    pushTrace({ kind: 'wait', stage, waitMs, ...extra });
  }
  await sleep(waitMs);
  return waitMs;
}

async function withTimeout(promise, timeoutMs, code = 'OP_TIMEOUT') {
  const ms = Math.max(0, Number(timeoutMs) || 0);
  if (ms <= 0) return promise;
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(code);
          error.code = code;
          reject(error);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function evaluateReadonly(profileId, script) {
  const payload = await runEvaluateScript({
    profileId,
    script,
    highlight: false,
  });
  return extractEvaluateResultData(payload) || payload?.result || payload?.data || payload || {};
}

async function readLocation(profileId, options = {}) {
  const timeoutMs = Math.max(300, Number(options.timeoutMs ?? 8000) || 8000);
  const fallback = String(options.fallback ?? '');
  const throwOnError = options.throwOnError === true;
  try {
    const payload = await withTimeout(
      evaluateReadonly(profileId, '(() => String(location.href || ""))()'),
      timeoutMs,
      'READ_LOCATION_TIMEOUT',
    );
    return String(payload || '');
  } catch (error) {
    if (throwOnError) throw error;
    return fallback;
  }
}

async function clickPoint(profileId, point, options = {}) {
  await callAPI('mouse:click', {
    profileId,
    x: Math.max(1, Math.round(Number(point.x) || 1)),
    y: Math.max(1, Math.round(Number(point.y) || 1)),
    button: String(options.button || 'left').trim() || 'left',
    clicks: Math.max(1, Number(options.clicks ?? 1) || 1),
  });
}

async function wheel(profileId, deltaY) {
  await callAPI('mouse:wheel', {
    profileId,
    deltaX: 0,
    deltaY: clamp(Math.round(Number(deltaY) || 0), -1200, 1200),
  });
}

async function pressKey(profileId, key) {
  await callAPI('keyboard:press', {
    profileId,
    key: String(key || '').trim(),
  });
}

async function clearAndType(profileId, text, keyDelayMs = 60) {
  await pressKey(profileId, process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await pressKey(profileId, 'Backspace');
  await callAPI('keyboard:type', {
    profileId,
    text: String(text || ''),
    delay: Math.max(0, Number(keyDelayMs) || 0),
  });
}

async function resolveSelectorTarget(profileId, selectors, options = {}) {
  const normalizedSelectors = normalizeArray(selectors)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (normalizedSelectors.length === 0) return null;
  const script = `(() => {
    const selectors = ${JSON.stringify(normalizedSelectors)};
    const requireViewport = ${options.requireViewport !== false ? 'true' : 'false'};
    const includeText = ${options.includeText === true ? 'true' : 'false'};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
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
      return true;
    };
    const inViewport = (rect) => {
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      return rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
    };
    const hitVisible = (node, rect) => {
      if (!(node instanceof Element) || !rect) return false;
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      if (vw <= 0 || vh <= 0) return false;
      const x = Math.max(0, Math.min(vw - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(vh - 1, rect.top + rect.height / 2));
      const top = document.elementFromPoint(x, y);
      if (!top) return false;
      return top === node || node.contains(top) || top.contains(node);
    };
    const toPayload = (selector, node) => {
      const rect = node.getBoundingClientRect();
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      const center = {
        x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
        y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
      };
      const payload = {
        selector,
        center,
        rect: {
          left: Number(rect.left || 0),
          top: Number(rect.top || 0),
          width: Number(rect.width || 0),
          height: Number(rect.height || 0),
        },
        viewport: { width: vw, height: vh },
      };
      if (includeText) payload.text = String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      return payload;
    };
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const rect = node.getBoundingClientRect();
        if (requireViewport && !inViewport(rect)) continue;
        if (requireViewport && !hitVisible(node, rect)) continue;
        return { ok: true, target: toPayload(selector, node) };
      }
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        return { ok: true, target: toPayload(selector, node) };
      }
    }
    return { ok: false };
  })()`;
  const payload = await evaluateReadonly(profileId, script);
  if (!payload || payload.ok !== true || !payload.target?.center) return null;
  return payload.target;
}

async function isDetailVisible(profileId) {
  const script = `(() => {
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
    ];
    const searchSelectors = ['.note-item', '.search-result-list', '#search-input', '.feeds-page'];
    const isVisible = (node) => {
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
      const sampleX = Math.max(0, Math.min((window.innerWidth || 1) - 1, rect.left + rect.width / 2));
      const sampleY = Math.max(0, Math.min((window.innerHeight || 1) - 1, rect.top + rect.height / 2));
      const top = document.elementFromPoint(sampleX, sampleY);
      if (!top) return false;
      return top === node || node.contains(top) || top.contains(node);
    };
    const hasVisible = (selectors) => selectors.some((selector) => isVisible(document.querySelector(selector)));
    const detailVisible = hasVisible(detailSelectors);
    const searchVisible = hasVisible(searchSelectors);
    const href = String(location.href || '');
    return {
      detailVisible,
      searchVisible,
      detailReady: detailVisible,
      href,
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function closeDetailToSearch(profileId, pushTrace = null) {
  const waitForCloseAnimation = async () => {
    for (let i = 0; i < 45; i += 1) {
      const s = await isDetailVisible(profileId);
      if (s?.detailVisible !== true && s?.searchVisible === true) return true;
      await sleep(120);
    }
    const s = await isDetailVisible(profileId);
    return s?.detailVisible !== true && s?.searchVisible === true;
  };

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await pressKey(profileId, 'Escape');
    if (typeof pushTrace === 'function') {
      pushTrace({ kind: 'key', stage: 'collect_links_close', key: 'Escape', attempt });
    }
    await sleep(randomBetween(220, 480));
    if (await waitForCloseAnimation()) return true;
  }

  const snapshot = await isDetailVisible(profileId);
  return snapshot?.detailVisible !== true && snapshot?.searchVisible === true;
}

async function readSearchInput(profileId) {
  const script = `(() => {
    const input = document.querySelector('#search-input, input.search-input');
    if (!(input instanceof HTMLInputElement)) return { ok: false };
    const rect = input.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const center = {
      x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
      y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
    };
    return {
      ok: true,
      value: String(input.value || ''),
      center,
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function readSearchCandidates(profileId) {
  const script = `(() => {
    const minVisibleRatio = 0.5;
    const nodes = Array.from(document.querySelectorAll('.note-item'));
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
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
      return true;
    };
    const rows = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const item = nodes[index];
      const cover = item.querySelector('a.cover');
      if (!(cover instanceof Element)) continue;
      if (!isVisible(cover)) continue;
      const href = String(cover.getAttribute('href') || '').trim();
      const seg = href.split('/').filter(Boolean).pop() || '';
      const noteId = (seg.split('?')[0].split('#')[0] || ('idx_' + index)).trim();
      const rect = cover.getBoundingClientRect();
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      const inViewport = rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
      const fullyVisible = rect.left >= 0 && rect.top >= 0 && rect.right <= vw && rect.bottom <= vh;
      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(vw, rect.right);
      const visibleBottom = Math.min(vh, rect.bottom);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleArea = visibleWidth * visibleHeight;
      const totalArea = Math.max(1, Number(rect.width || 0) * Number(rect.height || 0));
      const visibleRatio = Math.max(0, Math.min(1, visibleArea / totalArea));
      const visibleEnough = visibleRatio >= minVisibleRatio;
      rows.push({
        index,
        noteId,
        href,
        inViewport,
        fullyVisible,
        visibleRatio,
        visibleEnough,
        center: {
          x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
          y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
        },
        rect: {
          left: Number(rect.left || 0),
          top: Number(rect.top || 0),
          width: Number(rect.width || 0),
          height: Number(rect.height || 0),
        },
      });
    }
    return {
      rows,
      page: {
        href: String(location.href || ''),
        innerHeight: Number(window.innerHeight || 0),
      },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function readSearchCandidateByNoteId(profileId, noteId, options = {}) {
  const normalizedNoteId = String(noteId || '').trim();
  if (!normalizedNoteId) return { found: false };
  const visibilityMargin = Math.max(0, Number(options.visibilityMargin ?? 8) || 8);
  const minVisibleRatio = clamp(Number(options.minVisibleRatio ?? 0) || 0, 0, 1);
  const script = `(() => {
    const noteId = ${JSON.stringify(normalizedNoteId)};
    const visibilityMargin = ${JSON.stringify(visibilityMargin)};
    const minVisibleRatio = ${JSON.stringify(minVisibleRatio)};
    const nodes = Array.from(document.querySelectorAll('.note-item a.cover'));
    const toNoteId = (href, idx) => {
      const raw = String(href || '').trim();
      const seg = raw.split('/').filter(Boolean).pop() || '';
      return (seg.split('?')[0].split('#')[0] || ('idx_' + idx)).trim();
    };
    for (let index = 0; index < nodes.length; index += 1) {
      const cover = nodes[index];
      if (!(cover instanceof Element)) continue;
      const href = String(cover.getAttribute('href') || '').trim();
      const rowNoteId = toNoteId(href, index);
      if (rowNoteId !== noteId) continue;
      const rect = cover.getBoundingClientRect();
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      const inViewport = rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
      const safeLeft = visibilityMargin;
      const safeTop = visibilityMargin;
      const safeRight = Math.max(safeLeft, vw - visibilityMargin);
      const safeBottom = Math.max(safeTop, vh - visibilityMargin);
      const fullyVisible = rect.left >= visibilityMargin
        && rect.top >= visibilityMargin
        && rect.right <= safeRight
        && rect.bottom <= safeBottom;
      const visibleLeft = Math.max(safeLeft, rect.left);
      const visibleTop = Math.max(safeTop, rect.top);
      const visibleRight = Math.min(safeRight, rect.right);
      const visibleBottom = Math.min(safeBottom, rect.bottom);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleArea = visibleWidth * visibleHeight;
      const totalArea = Math.max(1, Number(rect.width || 0) * Number(rect.height || 0));
      const visibleRatio = Math.max(0, Math.min(1, visibleArea / totalArea));
      const visibleEnough = visibleRatio >= minVisibleRatio;
      let recommendedDeltaY = 0;
      if (!visibleEnough) {
        if (rect.top < visibilityMargin) {
          recommendedDeltaY = rect.top - visibilityMargin;
        } else if (rect.bottom > safeBottom) {
          recommendedDeltaY = rect.bottom - safeBottom;
        }
      }
      return {
        found: true,
        noteId: rowNoteId,
        href,
        inViewport,
        fullyVisible,
        visibleEnough,
        visibleRatio,
        minVisibleRatio,
        recommendedDeltaY,
        center: {
          x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
          y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
        },
        rect: {
          left: Number(rect.left || 0),
          top: Number(rect.top || 0),
          width: Number(rect.width || 0),
          height: Number(rect.height || 0),
          right: Number(rect.right || 0),
          bottom: Number(rect.bottom || 0),
        },
        viewport: {
          width: vw,
          height: vh,
        },
      };
    }
    return { found: false };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function ensureSearchCandidateFullyVisible(profileId, noteId, options = {}) {
  const maxScrollAttempts = Math.max(1, Number(options.maxScrollAttempts ?? 3) || 3);
  const visibilityMargin = Math.max(0, Number(options.visibilityMargin ?? 8) || 8);
  const minVisibleRatioRaw = Number(options.minVisibleRatio ?? 0);
  const minVisibleRatio = clamp(Number.isFinite(minVisibleRatioRaw) ? minVisibleRatioRaw : 0, 0, 1);
  const settleMs = Math.max(60, Number(options.settleMs ?? 260) || 260);
  let latest = null;

  for (let attempt = 0; attempt <= maxScrollAttempts; attempt += 1) {
    latest = await readSearchCandidateByNoteId(profileId, noteId, { visibilityMargin, minVisibleRatio });
    if (!latest?.found) {
      return { ok: false, code: 'NOTE_TARGET_NOT_FOUND', autoScrolled: attempt, target: null };
    }
    if (latest.inViewport === true && latest.visibleEnough === true) {
      return { ok: true, code: 'TARGET_READY', autoScrolled: attempt, target: latest };
    }
    if (attempt >= maxScrollAttempts) break;
    let deltaY = Number(latest.recommendedDeltaY || 0);
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 12) {
      const top = Number(latest?.rect?.top || 0);
      deltaY = top < visibilityMargin ? -260 : 260;
    }
    await wheel(profileId, clamp(Math.round(deltaY), -900, 900));
    await sleep(settleMs);
  }

  return {
    ok: false,
    code: 'TARGET_NOT_VISIBLE_ENOUGH',
    autoScrolled: maxScrollAttempts,
    target: latest,
  };
}

async function readSearchViewportReady(profileId) {
  const script = `(() => {
    const selectors = [
      '.note-item a.cover',
      '.search-result-list',
      '.feeds-page',
      '#search-input',
    ];
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
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
      return true;
    };
    const inViewport = (rect) => {
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      return rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
    };
    const hitVisible = (node, rect) => {
      if (!(node instanceof Element) || !rect) return false;
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      if (vw <= 0 || vh <= 0) return false;
      const x = Math.max(0, Math.min(vw - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(vh - 1, rect.top + rect.height / 2));
      const top = document.elementFromPoint(x, y);
      if (!top) return false;
      return top === node || node.contains(top) || top.contains(node);
    };
    let readySelector = '';
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const rect = node.getBoundingClientRect();
        if (!inViewport(rect)) continue;
        if (!hitVisible(node, rect)) continue;
        readySelector = selector;
        break;
      }
      if (readySelector) break;
    }
    const noteNodes = Array.from(document.querySelectorAll('.note-item a.cover'));
    let visibleNoteCount = 0;
    for (const node of noteNodes) {
      if (!isVisible(node)) continue;
      const rect = node.getBoundingClientRect();
      if (!inViewport(rect)) continue;
      if (!hitVisible(node, rect)) continue;
      visibleNoteCount += 1;
    }
    return {
      ready: Boolean(readySelector),
      readySelector: readySelector || null,
      visibleNoteCount,
      href: String(location.href || ''),
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function paintSearchCandidates(profileId, {
  candidateNoteIds = [],
  selectedNoteId = '',
  processedNoteIds = [],
} = {}) {
  const script = `(() => {
    const candidateColor = '#3b82f6';
    const selectedColor = '#facc15';
    const processedColor = '#8b5cf6';
    const candidate = new Set(${JSON.stringify(normalizeNoteIdList(candidateNoteIds))});
    const processed = new Set(${JSON.stringify(normalizeNoteIdList(processedNoteIds))});
    const selected = ${JSON.stringify(String(selectedNoteId || '').trim())};
    const parseNoteId = (item, index) => {
      const cover = item?.querySelector?.('a.cover');
      const href = String(cover?.getAttribute?.('href') || '').trim();
      if (!href) return 'idx_' + index;
      const match = href.match(/\\/explore\\/([^/?#]+)/);
      if (match && match[1]) return String(match[1]).trim();
      const seg = href.split('/').filter(Boolean).pop() || '';
      return String(seg).split('?')[0].split('#')[0].trim() || ('idx_' + index);
    };
    const clearMark = (node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.webautoXhsMark !== '1') return;
      node.style.outline = '';
      node.style.outlineOffset = '';
      node.style.boxShadow = '';
      node.dataset.webautoXhsMark = '0';
    };
    const applyMark = (node, color) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.outline = '2px solid ' + color;
      node.style.outlineOffset = '2px';
      node.style.boxShadow = 'inset 0 0 0 2px ' + color;
      node.dataset.webautoXhsMark = '1';
    };
    const rows = Array.from(document.querySelectorAll('.note-item'));
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const noteId = parseNoteId(row, i);
      if (noteId && processed.has(noteId)) {
        applyMark(row, processedColor);
      } else if (noteId && selected && noteId === selected) {
        applyMark(row, selectedColor);
      } else if (noteId && candidate.has(noteId)) {
        applyMark(row, candidateColor);
      } else {
        clearMark(row);
      }
    }
    return { ok: true, count: rows.length };
  })()`;
  return evaluateReadonly(profileId, script).catch(() => ({ ok: false }));
}

async function readDetailSnapshot(profileId) {
  const script = `(() => {
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
      } catch {
        return false;
      }
      return true;
    };
    const detailRoot = document.querySelector('.note-detail-mask')
      || document.querySelector('.note-detail-page')
      || document.querySelector('.note-detail-dialog')
      || document.body;
    const text = (selector) => normalize(detailRoot?.querySelector(selector)?.textContent || '');
    const title = text('.note-title').slice(0, 200);
    const content = text('.note-content');
    const href = String(location.href || '');
    const noteMatch = href.match(/\\/explore\\/([^/?#]+)/);
    const imageNodes = Array.from(detailRoot?.querySelectorAll?.('.note-content img, .swiper-wrapper img, .media-container img, img') || []);
    const imageSet = new Set();
    for (const node of imageNodes) {
      if (!(node instanceof HTMLImageElement)) continue;
      if (!isVisible(node)) continue;
      const src = normalize(node.currentSrc || node.src || node.getAttribute('src') || '');
      if (!src) continue;
      imageSet.add(src);
    }
    const videoNodes = Array.from(detailRoot?.querySelectorAll?.('video, .player video, [class*="video"] video') || []);
    let videoUrl = '';
    let videoPresent = false;
    for (const node of videoNodes) {
      if (!(node instanceof HTMLVideoElement)) continue;
      if (!isVisible(node)) continue;
      videoPresent = true;
      const src = normalize(node.currentSrc || node.src || node.getAttribute('src') || '');
      if (!videoUrl && src) videoUrl = src;
    }
    const commentsContextAvailable = Boolean(
      detailRoot?.querySelector?.('.comments-container')
      || detailRoot?.querySelector?.('.comment-list')
      || detailRoot?.querySelector?.('.comment-item')
      || detailRoot?.querySelector?.('[class*="comment-item"]')
      || detailRoot?.querySelector?.('.note-scroller')
    );
    return {
      title,
      contentLength: content.length,
      contentPreview: content.slice(0, 500),
      noteIdFromUrl: noteMatch && noteMatch[1] ? String(noteMatch[1]) : null,
      href,
      textPresent: Boolean(title || content),
      imageCount: imageSet.size,
      imageUrls: Array.from(imageSet).slice(0, 24),
      videoPresent,
      videoUrl: videoUrl || null,
      commentsContextAvailable,
      capturedAt: new Date().toISOString(),
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function readExpandButtons(profileId) {
  const script = `(() => {
    const selectors = [
      '.note-detail-mask .show-more',
      '.note-detail-mask .reply-expand',
      '.note-detail-mask [class*="expand"]',
      '.note-detail-page .show-more',
      '.note-detail-page .reply-expand',
      '.note-detail-page [class*="expand"]',
    ];
    const nodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      } catch {
        return false;
      }
      return true;
    };
    const out = [];
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const rect = node.getBoundingClientRect();
      out.push({
        text,
        signature: String(text)
          + '::' + String(Math.round(rect.left))
          + '::' + String(Math.round(rect.top))
          + '::' + String(Math.round(rect.width))
          + '::' + String(Math.round(rect.height)),
        center: {
          x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
          y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
        },
      });
    }
    return { rows: out };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function readCommentsSnapshot(profileId) {
  const script = `(() => {
    const parseCountToken = (raw) => {
      const token = String(raw || '').trim();
      const matched = token.match(/^([0-9]+(?:\\.[0-9]+)?)(万|w|W)?$/);
      if (!matched) return null;
      const base = Number(matched[1]);
      if (!Number.isFinite(base)) return null;
      if (!matched[2]) return Math.round(base);
      return Math.round(base * 10000);
    };
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      } catch {
        return false;
      }
      return true;
    };
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
    ];
    const detailVisible = detailSelectors.some((selector) => isVisible(document.querySelector(selector)));
    const hasCommentsContext = Boolean(
      document.querySelector('.comments-container')
      || document.querySelector('.comment-list')
      || document.querySelector('.comment-item')
      || document.querySelector('[class*="comment-item"]')
      || document.querySelector('.note-scroller')
    );
    const scopeSelectors = [
      '.note-detail-mask .interaction-container',
      '.note-detail-mask .comments-container',
      '.note-detail-page .interaction-container',
      '.note-detail-page .comments-container',
      '.note-detail-mask',
      '.note-detail-page',
    ];
    const patterns = [
      /([0-9]+(?:\\.[0-9]+)?(?:万|w|W)?)\\s*条?评论/,
      /评论\\s*([0-9]+(?:\\.[0-9]+)?(?:万|w|W)?)/,
      /共\\s*([0-9]+(?:\\.[0-9]+)?(?:万|w|W)?)\\s*条/,
    ];
    let expectedCommentsCount = null;
    for (const selector of scopeSelectors) {
      const root = document.querySelector(selector);
      if (!root) continue;
      const text = String(root.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) continue;
      for (const re of patterns) {
        const matched = text.match(re);
        if (!matched || !matched[1]) continue;
        const parsed = parseCountToken(matched[1]);
        if (Number.isFinite(parsed) && parsed >= 0) {
          expectedCommentsCount = parsed;
          break;
        }
      }
      if (expectedCommentsCount !== null) break;
    }

    const scroller = document.querySelector('.note-scroller')
      || document.querySelector('.comments-el')
      || document.querySelector('.comments-container')
      || document.scrollingElement
      || document.documentElement;
    const scrollerRect = scroller?.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 };
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const scrollerCenter = {
      x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(scrollerRect.left + scrollerRect.width / 2))),
      y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(scrollerRect.top + Math.min(scrollerRect.height * 0.6, Math.max(80, scrollerRect.height - 60))))),
    };

    const readText = (item, selectors) => {
      for (const selector of selectors) {
        const node = item.querySelector(selector);
        const text = String(node?.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) return text;
      }
      return '';
    };
    const readAttr = (item, attrs) => {
      for (const attr of attrs) {
        const value = String(item.getAttribute?.(attr) || '').trim();
        if (value) return value;
      }
      return '';
    };
    const readUserName = (item, commentText) => {
      const attrNames = ['data-user-name', 'data-username', 'data-user_nickname', 'data-nickname'];
      for (const attr of attrNames) {
        const value = String(item.getAttribute?.(attr) || '').replace(/\\s+/g, ' ').trim();
        if (value && value !== commentText && value.length <= 40) return value;
      }
      const selectors = [
        '.comment-user .name',
        '.comment-user .username',
        '.comment-user .user-name',
        '.author .name',
        '.author',
        '.user-name',
        '.username',
        '.name',
        'a[href*="/user/profile/"]',
        'a[href*="/user/"]',
      ];
      for (const selector of selectors) {
        const node = item.querySelector(selector);
        if (!node) continue;
        const title = String(node.getAttribute?.('title') || '').replace(/\\s+/g, ' ').trim();
        if (title && title !== commentText && title.length <= 40) return title;
        const text = String(node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text && text !== commentText && text.length <= 40) return text;
      }
      return '';
    };
    const readUserId = (item) => {
      const value = readAttr(item, ['data-user-id', 'data-userid', 'data-user_id']);
      if (value) return value;
      const anchor = item.querySelector('a[href*="/user/profile/"], a[href*="/user/"]');
      const href = String(anchor?.getAttribute?.('href') || '').trim();
      const matched = href.match(/\\/user\\/(?:profile\\/)?([a-zA-Z0-9_-]+)/);
      return matched && matched[1] ? matched[1] : '';
    };
    const findLikeControl = (item) => {
      const selectors = [
        '.like-wrapper',
        '.comment-like',
        '.interactions .like-wrapper',
        '.interactions [class*="like"]',
        'button[class*="like"]',
        '[aria-label*="赞"]',
      ];
      for (const selector of selectors) {
        const node = item.querySelector(selector);
        if (node instanceof Element) return node;
      }
      return null;
    };
    const isAlreadyLiked = (node) => {
      if (!node) return false;
      const className = String(node.className || '').toLowerCase();
      const ariaPressed = String(node.getAttribute?.('aria-pressed') || '').toLowerCase();
      const text = String(node.textContent || '');
      return /(?:^|\\s)like-active(?:\\s|$)/.test(className) || ariaPressed === 'true' || /已赞|取消赞/.test(text);
    };

    const rows = [];
    const commentNodes = Array.from(document.querySelectorAll('.comment-item, [class*="comment-item"]'));
    for (let index = 0; index < commentNodes.length; index += 1) {
      const item = commentNodes[index];
      const text = readText(item, ['.content', '.comment-content', 'p']);
      if (!text) continue;
      const userName = readUserName(item, text);
      const userId = readUserId(item);
      const timestamp = readText(item, ['.date', '.time', '.timestamp', '[class*="time"]']);
      const likeControl = findLikeControl(item);
      rows.push({
        index,
        text,
        userName,
        userId,
        timestamp,
        hasLikeControl: Boolean(likeControl),
        alreadyLiked: isAlreadyLiked(likeControl),
      });
    }

    const href = String(location.href || '');
    const noteMatch = href.match(/\\/explore\\/([^/?#]+)/);
    return {
      detailVisible,
      hasCommentsContext,
      noteIdFromUrl: noteMatch && noteMatch[1] ? String(noteMatch[1]) : null,
      metrics: {
        scrollTop: Number(scroller?.scrollTop || 0),
        scrollHeight: Number(scroller?.scrollHeight || 0),
        clientHeight: Number(scroller?.clientHeight || window.innerHeight || 0),
      },
      expectedCommentsCount,
      rows,
      scrollerCenter,
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function readLikeTargetByIndex(profileId, index) {
  const idx = Math.max(0, Number(index) || 0);
  const script = `(() => {
    const index = Number(${JSON.stringify(idx)});
    const findLikeControl = (item) => {
      const selectors = [
        '.like-wrapper',
        '.comment-like',
        '.interactions .like-wrapper',
        '.interactions [class*="like"]',
        'button[class*="like"]',
        '[aria-label*="赞"]',
      ];
      for (const selector of selectors) {
        const node = item.querySelector(selector);
        if (node instanceof Element) return node;
      }
      return null;
    };
    const isAlreadyLiked = (node) => {
      if (!node) return false;
      const className = String(node.className || '').toLowerCase();
      const ariaPressed = String(node.getAttribute?.('aria-pressed') || '').toLowerCase();
      const text = String(node.textContent || '');
      return /(?:^|\\s)like-active(?:\\s|$)/.test(className) || ariaPressed === 'true' || /已赞|取消赞/.test(text);
    };
    const nodes = Array.from(document.querySelectorAll('.comment-item, [class*="comment-item"]'));
    const target = nodes[index];
    if (!(target instanceof Element)) return { ok: false, reason: 'comment_item_not_found' };
    const likeNode = findLikeControl(target);
    if (!(likeNode instanceof Element)) return { ok: false, reason: 'like_control_not_found' };
    const rect = likeNode.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      ok: true,
      index,
      alreadyLiked: isAlreadyLiked(likeNode),
      center: {
        x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
        y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
      },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function readReplyTargetByIndex(profileId, index) {
  const idx = Math.max(0, Number(index) || 0);
  const script = `(() => {
    const index = Number(${JSON.stringify(idx)});
    const rows = Array.from(document.querySelectorAll('.comment-item, [class*="comment-item"]'));
    const target = rows[index];
    if (!(target instanceof Element)) return { ok: false, reason: 'match_not_visible' };
    const targetRect = target.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const center = {
      x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(targetRect.left + targetRect.width / 2))),
      y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(targetRect.top + Math.min(32, Math.max(12, targetRect.height / 3))))),
    };
    return { ok: true, center };
  })()`;
  return evaluateReadonly(profileId, script);
}

async function readReplyInputTarget(profileId) {
  return resolveSelectorTarget(profileId, [
    'textarea',
    'input[placeholder*="说点"]',
    '[contenteditable="true"]',
  ]);
}

async function readReplySendButtonTarget(profileId) {
  const script = `(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      } catch {
        return false;
      }
      return true;
    };
    const target = buttons.find((button) => {
      if (!isVisible(button)) return false;
      const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
      return /发送|回复/.test(text);
    }) || null;
    if (!target) return { ok: false };
    const rect = target.getBoundingClientRect();
    return {
      ok: true,
      center: {
        x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
        y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
      },
    };
  })()`;
  const payload = await evaluateReadonly(profileId, script);
  return payload?.ok === true && payload.center ? payload.center : null;
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

    const previousKeyword = String(profileState.keyword || '').trim();
    const keywordChanged = Boolean(keyword && previousKeyword && keyword !== previousKeyword);
    if (mode === 'collect') {
      if (!resume || keywordChanged) {
        profileState.visitedNoteIds = [];
        if (detailOnlyMode) metrics.detailLoopCount = 0;
        profileState.preCollectedNoteIds = [];
        profileState.preCollectedAt = null;
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
    const openDetailMinVisibleRatio = clamp(Number(params.openDetailMinVisibleRatio ?? 0) || 0, 0, 1);
    const collectOpenLinksOnly = params.collectOpenLinksOnly === true;

    const waitDetailReady = async () => {
      for (let i = 0; i < 60; i += 1) {
        const snapshot = await isDetailVisible(profileId);
        if (snapshot?.detailReady === true) return true;
        await sleep(randomBetween(pollDelayMinMs, pollDelayMaxMs));
      }
      return false;
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
      const noteIds = normalizeNoteIdList(rows.map((row) => row?.noteId));
      if (noteIds.length > 0) {
        profileState.preCollectedNoteIds = noteIds;
        profileState.preCollectedAt = new Date().toISOString();
      }
      return {
        linksPath: output.linksPath,
        noteIds,
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
        const snapshot = await readSearchViewportReady(profileId);
        const readySelector = String(snapshot?.readySelector || '').trim();
        const visibleNoteCount = Math.max(0, Number(snapshot?.visibleNoteCount || 0) || 0);
        emitOperationProgress(context, {
          kind: 'block',
          stage: 'collect_links',
          block: 'search_ready',
          readySelector: readySelector || null,
          visibleNoteCount,
        });
        if (!readySelector && visibleNoteCount <= 0) {
          throw new Error('SEARCH_VIEWPORT_NOT_READY');
        }
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
        const selectableRows = eligibleVisibleEnough.length > 0 ? eligibleVisibleEnough : eligibleInViewport;
        const candidateIds = normalizeNoteIdList(eligibleInViewport.map((row) => row.noteId));
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
        if (eligibleInViewport.length === 0) {
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
          minVisibleRatio: Number(visibility?.target?.minVisibleRatio || 0.5),
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
        await sleepRandom(preClickDelayMinMs, preClickDelayMaxMs, pushTrace, 'open_detail_pre_click', { noteId, mode: 'collect' });
        pushTrace({ kind: 'click', stage: 'open_detail', noteId, selector: 'a.cover', mode: 'collect' });
        await clickPoint(profileId, visibility.target?.center || next.center, { steps: 4 });
        const detailReady = await waitDetailReady();
        if (!detailReady) throw new Error('DETAIL_OPEN_TIMEOUT');
        await sleepRandom(postOpenDelayMinMs, postOpenDelayMaxMs, pushTrace, 'open_detail_post_open', { noteId, mode: 'collect' });
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
        if (!closed) throw new Error(`DETAIL_CLOSE_FAILED:${resolvedNoteId}`);
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

        await runSearchReadyBlock();
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
          emitOperationProgress(context, {
            kind: 'block',
            stage: 'collect_links',
            block: 'open_detail_skip',
            noteId: nextNoteId || null,
            reason,
          });
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
          await sleep(Math.max(220, Math.floor(seedCollectSettleMs / 2)));
          continue;
        }
        const captured = await runCaptureUrlBlock(next, openResult.beforeUrl);
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

    let nodes = await collectVisibleRows();
    if (mode === 'collect' && nodes.length === 0) throw new Error('NO_SEARCH_RESULT_ITEM');

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
      const candidateRows = visibleEnough.length > 0 ? visibleEnough : inViewport;
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
        await wheel(profileId, deltaY);
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
      minVisibleRatio: Number(visibility?.target?.minVisibleRatio || 0.5),
      code: visibility.code,
    });
    if (!visibility.ok) {
      throw new Error(`${visibility.code}:${next.noteId}`);
    }

    const beforeUrl = await readLocation(profileId);
    await sleepRandom(preClickDelayMinMs, preClickDelayMaxMs, pushTrace, 'open_detail_pre_click', { noteId: next.noteId });
    pushTrace({ kind: 'click', stage: 'open_detail', noteId: next.noteId, selector: 'a.cover' });
    await clickPoint(profileId, visibility.target?.center || next.center, { steps: 4 });

    let detailReady = false;
    for (let i = 0; i < 60; i += 1) {
      const snapshot = await isDetailVisible(profileId);
      if (snapshot?.detailReady === true) {
        detailReady = true;
        break;
      }
      await sleep(randomBetween(pollDelayMinMs, pollDelayMaxMs));
    }
    if (!detailReady) {
      throw new Error('DETAIL_OPEN_TIMEOUT');
    }

    await sleepRandom(postOpenDelayMinMs, postOpenDelayMaxMs, pushTrace, 'open_detail_post_open', { noteId: next.noteId });
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

    const targetBefore = await readLikeTargetByIndex(profileId, row.index);
    if (!targetBefore || targetBefore.ok !== true || !targetBefore.center) {
      clickFailed += 1;
      return false;
    }
    if (targetBefore.alreadyLiked) {
      alreadyLikedSkipped += 1;
      return false;
    }

    await clickPoint(profileId, targetBefore.center, { steps: 4 });
    pushTrace({ kind: 'click', stage: 'xhs_comment_like', commentIndex: Number(row.index) });
    await sleepRandom(500, 1600, pushTrace, 'like_post_click', { commentIndex: Number(row.index) });

    const targetAfter = await readLikeTargetByIndex(profileId, row.index);
    const afterPath = saveEvidence
      ? await captureScreenshotToFile({
        profileId,
        filePath: path.join(evidenceDir, `like-after-idx-${String(row.index).padStart(3, '0')}-${Date.now()}.png`),
      })
      : null;

    if (!targetAfter || targetAfter.ok !== true) {
      verifyFailed += 1;
      return false;
    }
    if (!targetAfter.alreadyLiked) {
      verifyFailed += 1;
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
      if (s?.detailVisible !== true && s?.searchVisible === true) return true;
      await sleep(120);
    }
    const s = await isDetailVisible(profileId);
    return s?.detailVisible !== true && s?.searchVisible === true;
  };

  for (let attempt = 1; attempt <= 4; attempt += 1) {
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
  emitActionTrace(context, actionTrace, { stage: 'xhs_close_detail' });
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_close_detail done',
    data: {
      closed: false,
      via: 'escape_failed',
      detailVisible: finalSnapshot?.detailVisible === true,
      searchVisible: finalSnapshot?.searchVisible === true,
      searchCount: Number(metrics.searchCount || 0),
      rollbackCount: Number(metrics.rollbackCount || 0),
      returnToSearchCount: Number(metrics.returnToSearchCount || 0),
      returnedToSearch: false,
      ...exitMeta,
    },
  };
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
