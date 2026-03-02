import { evaluateReadonly } from './dom-ops.mjs';
import { getProfileState } from './state.mjs';
import { clamp, extractNoteIdFromHref } from './utils.mjs';

export async function readSearchInput(profileId) {
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

export async function readSearchCandidates(profileId) {
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
      } catch { return false; }
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
        index, noteId, href, inViewport, fullyVisible, visibleRatio, visibleEnough,
        center: {
          x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
          y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
        },
        rect: { left: Number(rect.left || 0), top: Number(rect.top || 0), width: Number(rect.width || 0), height: Number(rect.height || 0) },
      });
    }
    return { rows, page: { href: String(location.href || ''), innerHeight: Number(window.innerHeight || 0) } };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readSearchCandidateByNoteId(profileId, noteId, options = {}) {
  const normalizedNoteId = String(noteId || '').trim();
  if (!normalizedNoteId) return { found: false };
  const visibilityMargin = Math.max(0, Number(options.visibilityMargin ?? 8) || 8);
  const script = `(() => {
    const targetId = ${JSON.stringify(normalizedNoteId)};
    const margin = ${visibilityMargin};
    const nodes = Array.from(document.querySelectorAll('.note-item'));
    for (let index = 0; index < nodes.length; index += 1) {
      const item = nodes[index];
      const cover = item.querySelector('a.cover');
      if (!(cover instanceof Element)) continue;
      const href = String(cover.getAttribute('href') || '').trim();
      const seg = href.split('/').filter(Boolean).pop() || '';
      const noteId = (seg.split('?')[0].split('#')[0] || '').trim();
      if (noteId !== targetId) continue;
      const rect = cover.getBoundingClientRect();
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      const center = {
        x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
        y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
      };
      const inViewport = rect.right > margin && rect.bottom > margin && rect.left < vw - margin && rect.top < vh - margin;
      return { found: true, index, noteId, href, center, rect: { left: Number(rect.left || 0), top: Number(rect.top || 0), width: Number(rect.width || 0), height: Number(rect.height || 0) }, inViewport, viewport: { width: vw, height: vh } };
    }
    return { found: false };
  })()`;
  const payload = await evaluateReadonly(profileId, script);
  if (!payload || payload.found !== true) return { found: false };
  return payload;
}

export async function readSearchHitAtPoint(profileId, point) {
  const x = Math.round(Number(point?.x) || 0);
  const y = Math.round(Number(point?.y) || 0);
  const script = `(() => {
    const x = ${x}; const y = ${y};
    const hit = document.elementFromPoint(x, y);
    if (!hit) return { found: false };
    const noteItem = hit.closest('.note-item');
    if (!noteItem) return { found: false, tagName: hit.tagName };
    const cover = noteItem.querySelector('a.cover');
    if (!cover) return { found: false, hasNoteItem: true };
    const href = String(cover.getAttribute('href') || '').trim();
    const seg = href.split('/').filter(Boolean).pop() || '';
    const noteId = (seg.split('?')[0].split('#')[0] || '').trim();
    return { found: true, noteId, href };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function ensureSearchCandidateFullyVisible(profileId, noteId, options = {}) {
  const visibilityMargin = Math.max(0, Number(options.visibilityMargin ?? 8) || 8);
  const candidate = await readSearchCandidateByNoteId(profileId, noteId, { visibilityMargin });
  if (!candidate?.found) return { ok: false, reason: 'not_found' };
  if (candidate.inViewport) return { ok: true, alreadyVisible: true };
  // Need to scroll - handled by caller
  return { ok: true, needsScroll: true, candidate };
}

export async function readSearchViewportReady(profileId) {
  const script = `(() => {
    const list = document.querySelector('.feeds-page, .note-item, .search-result-list');
    const input = document.querySelector('#search-input, input.search-input');
    return {
      hasList: !!list,
      hasInput: !!input,
      inputHasValue: input instanceof HTMLInputElement && !!input.value,
      href: String(location.href || ''),
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function paintSearchCandidates(profileId, { candidates = [] } = {}) {
  const script = `(() => {
    const candidates = ${JSON.stringify(candidates)};
    const overlay = document.createElement('div');
    overlay.id = 'xhs-candidate-paint';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999;';
    for (const c of candidates) {
      if (!c?.center) continue;
      const marker = document.createElement('div');
      marker.style.cssText = 'position:absolute;width:16px;height:16px;border-radius:50%;background:rgba(255,0,0,0.6);transform:translate(-50%,-50%);';
      marker.style.left = c.center.x + 'px';
      marker.style.top = c.center.y + 'px';
      overlay.appendChild(marker);
    }
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2000);
    return { painted: candidates.length };
  })()`;
  return evaluateReadonly(profileId, script);
}
