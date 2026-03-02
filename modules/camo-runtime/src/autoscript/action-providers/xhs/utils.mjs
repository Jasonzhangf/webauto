import fsp from 'node:fs/promises';
import { asErrorPayload } from '../../../container/runtime-core/utils.mjs';

export function replaceEvaluateResultData(rawData, payload) {
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

export function normalizeNoteIdList(items) {
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

export function extractNoteIdFromHref(href) {
  const text = String(href || '').trim();
  if (!text) return '';
  const match = text.match(/\/explore\/([^/?#]+)/);
  if (match && match[1]) return String(match[1]).trim();
  const seg = text.split('/').filter(Boolean).pop() || '';
  return String(seg || '').trim();
}

export function readXsecTokenFromUrl(rawUrl) {
  const text = String(rawUrl || '').trim();
  if (!text) return '';
  const matched = text.match(/[?&]xsec_token=([^&#]+)/);
  return matched && matched[1] ? String(matched[1]).trim() : '';
}

export function resolveSharedClaimPath(params = {}) {
  const explicit = String(params.sharedClaimPath || params.sharedHarvestPath || '').trim();
  if (explicit) return explicit;
  return String(params.sharedHarvestPath || '').trim();
}

export function resolveSearchLockKey(params = {}) {
  const explicit = String(params.searchSerialKey || params.searchKey || '').trim();
  if (explicit) return explicit;
  const keyword = String(params.keyword || '').trim();
  const env = String(params.env || '').trim();
  return keyword && env ? `${env}:${keyword}` : keyword || env || '';
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function randomBetween(min, max) {
  const a = Math.max(0, Number(min) || 0);
  const b = Math.max(a, Number(max) || 0);
  if (b <= a) return a;
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function normalizeInlineText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text;
}

export function sanitizeAuthorText(raw, commentText = '') {
  const text = normalizeInlineText(raw);
  const normalized = text.replace(/[:：]$/, '').trim();
  if (!normalized) {
    const fallback = normalizeInlineText(commentText).slice(0, 12);
    return fallback || '匿名用户';
  }
  return normalized;
}

export function buildElementCollectability(detail = {}, commentsSnapshot = null) {
  const collectability = {
    detailContextAvailable: detail?.detailVisible === true,
    commentsContextAvailable: commentsSnapshot?.hasCommentsContext === true,
  };

  const skippedElements = [];
  if (!collectability.detailContextAvailable) {
    skippedElements.push({
      element: 'detail',
      reason: 'detail_context_missing',
    });
  }
  if (!collectability.commentsContextAvailable) {
    skippedElements.push({
      element: 'comments',
      reason: 'comments_context_missing',
    });
  }

  const fallbackCaptured = {};
  if (detail?.detailUrl) fallbackCaptured.noteUrl = detail.detailUrl;
  if (detail?.videoPresent) fallbackCaptured.videoUrl = detail.videoUrl || detail.detailUrl || null;

  return {
    collectability,
    skippedElements,
    fallbackCaptured,
  };
}

export async function readJsonIfExists(filePath, fallback = {}) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function handleRaiseError({ params }) {
  const code = String(params.code || params.message || 'AUTOSCRIPT_ABORT').trim();
  return asErrorPayload('OPERATION_FAILED', code || 'AUTOSCRIPT_ABORT');
}
