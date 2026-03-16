import { evaluateReadonly, pressKey, sleep } from './dom-ops.mjs';
import { getProfileState } from './state.mjs';

export async function readDetailLinks(profileId) {
  const href = await evaluateReadonly(profileId, 'String(location.href || "")');
  const noteMatch = href?.match?.(/\/explore\/([^/?#]+)/);
  return {
    currentUrl: href || null,
    noteIdFromUrl: noteMatch && noteMatch[1] ? String(noteMatch[1]) : null,
  };
}

export async function readDetailState(profileId) {
  const script = `(() => {
    const href = String(location.href || '');
    let noteIdFromUrl = null;
    try {
      const url = new URL(href);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'explore' && parts[1]) noteIdFromUrl = String(parts[1]);
    } catch { /* ignore */ }
    const detailSelectors = [
      '.note-detail-mask',
      '.note-detail-page',
      '.note-detail-dialog',
      '#noteContainer',
      '.note-container',
      '.note-detail-mask .detail-container',
      '.note-detail-mask .media-container',
      '.note-detail-mask .note-scroller',
      '.note-detail-page .detail-container',
      '.note-detail-page .media-container',
      '.note-detail-page .note-scroller',
    ];
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
    const matchedSelector = detailSelectors.find((selector) => isVisible(document.querySelector(selector))) || null;
    return {
      href,
      noteIdFromUrl,
      detailVisible: Boolean(matchedSelector),
      selector: matchedSelector,
      commentsContextAvailable: Boolean(document.querySelector('.comments-container, .comment-list, .comment-item, [class*="comment-item"], .note-scroller')),
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readDetailSnapshot(profileId) {
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
      } catch { return false; }
      return true;
    };
    const detailRoot = document.querySelector('.note-detail-mask') || document.querySelector('.note-detail-page') || document.querySelector('.note-detail-dialog') || document.body;
    const text = (selector) => normalize(detailRoot?.querySelector(selector)?.textContent || '');
    const title = text('.note-title').slice(0, 200);
    const contentText = text('.note-content');
    const href = String(location.href || '');
    let noteIdFromUrl = null;
    try {
      const url = new URL(href);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'explore' && parts[1]) {
        noteIdFromUrl = String(parts[1]);
      }
    } catch { /* ignore */ }
    const resolveAuthorInfo = () => {
      const wrapper = detailRoot?.querySelector?.('.author-wrapper')
        || detailRoot?.querySelector?.('.author')
        || detailRoot?.querySelector?.('[class*="author"]')
        || document.querySelector('.author-wrapper')
        || document.querySelector('.author')
        || document.querySelector('[class*="author"]');
      const nameNode = wrapper?.querySelector?.('.name, .nickname, .author-name, [class*="name"], [class*="nickname"]') || wrapper;
      const authorName = normalize(nameNode?.textContent || '');
      const linkNode = wrapper?.querySelector?.('a[href]') || document.querySelector('.author-wrapper a[href]') || null;
      const rawLink = normalize(linkNode?.href || linkNode?.getAttribute?.('href') || '');
      const dataSources = [wrapper, linkNode].filter(Boolean);
      let authorId = '';
      for (const node of dataSources) {
        const ds = node?.dataset || {};
        authorId = normalize(ds.userId || ds.userid || ds.uid || ds.id || ds.authorId || '') || authorId;
        if (!authorId && node?.getAttribute) {
          authorId = normalize(node.getAttribute('data-user-id') || node.getAttribute('data-userid') || node.getAttribute('data-uid') || node.getAttribute('data-id') || node.getAttribute('data-author-id') || '') || authorId;
        }
        if (authorId) break;
      }
      if (!authorId && rawLink) {
        try {
          const linkUrl = new URL(rawLink, location.origin);
          const parts = linkUrl.pathname.split('/').filter(Boolean);
          if (parts[0] === 'user' && parts[1] === 'profile' && parts[2]) {
            authorId = String(parts[2]);
          } else if (parts[0] === 'user' && parts[1]) {
            authorId = String(parts[1]);
          }
        } catch { /* ignore */ }
      }
      return { authorName, authorId: authorId || null, authorLink: rawLink || null };
    };
    const author = resolveAuthorInfo();
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
    const commentsContextAvailable = Boolean(detailRoot?.querySelector?.('.comments-container') || detailRoot?.querySelector?.('.comment-list') || detailRoot?.querySelector?.('.comment-item') || detailRoot?.querySelector?.('[class*="comment-item"]') || detailRoot?.querySelector?.('.note-scroller'));
    return {
      title,
      contentLength: contentText.length,
      contentText,
      contentPreview: contentText.slice(0, 500),
      noteIdFromUrl,
      href,
      authorName: author.authorName || null,
      authorId: author.authorId || null,
      authorLink: author.authorLink || null,
      textPresent: Boolean(title || contentText),
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

export async function readExpandButtons(profileId) {
  const script = `(() => {
    const minVisibleRatio = 0.5;
    const selectors = ['.note-detail-mask .show-more', '.note-detail-mask .reply-expand', '.note-detail-mask [class*="expand"]', '.note-detail-page .show-more', '.note-detail-page .reply-expand', '.note-detail-page [class*="expand"]'];
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
      } catch { return false; }
      return true;
    };
    const out = [];
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = String(node.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) continue;
      const rect = node.getBoundingClientRect();
      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(vw, rect.right);
      const visibleBottom = Math.min(vh, rect.bottom);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleArea = visibleWidth * visibleHeight;
      const totalArea = Math.max(1, Number(rect.width || 0) * Number(rect.height || 0));
      const visibleRatio = Math.max(0, Math.min(1, visibleArea / totalArea));
      if (visibleRatio < minVisibleRatio) continue;
      out.push({
        text, signature: String(text) + '::' + String(Math.round(rect.left)) + '::' + String(Math.round(rect.top)) + '::' + String(Math.round(rect.width)) + '::' + String(Math.round(rect.height)),
        center: { x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))), y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))) },
        visibleRatio,
      });
    }
    return { rows: out };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function isDetailVisible(profileId) {
  const script = `(() => {
    const selectors = [
      '.note-detail-mask',
      '.note-detail-page',
      '.note-detail-dialog',
      '#noteContainer',
      '.note-detail-mask .detail-container',
      '.note-detail-mask .media-container',
      '.note-detail-mask .note-scroller',
      '.note-detail-page .detail-container',
      '.note-detail-page .media-container',
      '.note-detail-page .note-scroller',
      // Direct-open detail pages (no modal) should still be treated as detail-visible
      '.note-title',
      '.note-content',
      '.comment-item',
      '[class*="comment-item"]',
      '.comments-container',
      '[class*="comment"]',
    ];
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
      } catch { return false; }
      return true;
    };
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && isVisible(node)) {
        return { detailVisible: true, selector, href: String(location.href || '') };
      }
    }
    return { detailVisible: false, selector: null, href: String(location.href || '') };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readDetailCloseTarget(profileId) {
  const script = `(() => {
    const selectors = ['.note-detail-mask .close-btn', '.note-detail-mask [class*="close"]', '.note-detail-page .close-btn', '.note-detail-dialog .close-btn', '.close-btn'];
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (!btn) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      return {
        found: true,
        selector,
        center: { x: Math.max(1, Math.round(rect.left + rect.width / 2)), y: Math.max(1, Math.round(rect.top + rect.height / 2)) },
        viewport: { width: vw, height: vh },
      };
    }
    return { found: false };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function closeDetailToSearch(profileId, pushTrace = null) {
  await pressKey(profileId, 'Escape');
  if (typeof pushTrace === 'function') {
    pushTrace({ kind: 'key', stage: 'close_detail', key: 'Escape' });
  }
  // Anchor wait: wait for detail to close after Escape
  for (let i = 0; i < 8; i += 1) {
    const escVisible = await isDetailVisible(profileId);
    if (!escVisible?.detailVisible) return { ok: true, method: 'esc' };
    await sleep(120);
  }
  const escVisible = await isDetailVisible(profileId);
  if (!escVisible?.detailVisible) return { ok: true, method: 'esc' };

  const closeTarget = await readDetailCloseTarget(profileId);
  if (!closeTarget?.found) return { ok: false, reason: 'no_close_button' };
  const { clickPoint } = await import('./dom-ops.mjs');
  await clickPoint(profileId, closeTarget.center);
  if (typeof pushTrace === 'function') {
    pushTrace({ kind: 'click', stage: 'close_detail', selector: closeTarget.selector || null });
  }
  // Anchor wait: wait for detail to close after click
  for (let i = 0; i < 8; i += 1) {
    const visible = await isDetailVisible(profileId);
    if (!visible?.detailVisible) return { ok: true, method: 'x' };
    await sleep(120);
  }
  const visible = await isDetailVisible(profileId);
  return { ok: !visible?.detailVisible, method: 'x' };
}
