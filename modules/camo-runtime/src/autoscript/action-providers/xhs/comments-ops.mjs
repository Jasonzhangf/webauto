import { evaluateReadonly } from './dom-ops.mjs';
import { getProfileState } from './state.mjs';
import { normalizeInlineText, sanitizeAuthorText, clamp } from './utils.mjs';

export async function readCommentEntryPoint(profileId) {
  const script = `(() => {
    const detailRoot = document.querySelector('.note-detail-mask')
      || document.querySelector('.note-detail-page')
      || document.querySelector('.note-detail-dialog')
      || document.querySelector('.note-container')
      || document.querySelector('.outer-link-container')
      || document.querySelector('.main-content');
    if (!detailRoot) return { found: false, reason: 'no_detail_root' };
    const toVisiblePoint = (rect) => {
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      const left = Math.max(1, Math.min(vw - 1, Number(rect.left || 0)));
      const right = Math.max(left + 1, Math.min(vw - 1, Number(rect.right || (Number(rect.left || 0) + Number(rect.width || 0)))));
      const top = Math.max(1, Math.min(vh - 1, Number(rect.top || 0)));
      const bottom = Math.max(top + 1, Math.min(vh - 1, Number(rect.bottom || (Number(rect.top || 0) + Number(rect.height || 0)))));
      return {
        x: Math.max(1, Math.round(left + Math.max(8, (right - left) * 0.5))),
        y: Math.max(1, Math.round(top + Math.max(8, Math.min(bottom - top - 8, (bottom - top) * 0.65)))),
      };
    };
    const interaction = detailRoot.querySelector('.interaction-container');
    if (!interaction) return { found: false, reason: 'no_interaction_container' };
    const wrapper = interaction.querySelector('.chat-wrapper');
    if (!wrapper) return { found: false, reason: 'no_chat_wrapper' };
    const countEl = wrapper.querySelector('.count');
    const countText = String(countEl?.textContent || '').trim();
    const countNum = Number.parseInt(countText || '0', 10);
    if (!Number.isFinite(countNum) || countNum < 0) return { found: false, reason: 'invalid_count' };
    const target = countEl || wrapper;
    const rect = target.getBoundingClientRect?.();
    if (!rect || rect.width <= 1 || rect.height <= 1) return { found: false, reason: 'not_visible' };
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      found: true,
      selector: countEl ? '.chat-wrapper .count' : '.chat-wrapper',
      count: countNum,
      center: toVisiblePoint(rect),
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readCommentTotalTarget(profileId) {
  const script = `(() => {
    const detailRoot = document.querySelector('.note-detail-mask')
      || document.querySelector('.note-detail-page')
      || document.querySelector('.note-detail-dialog')
      || document.querySelector('.note-container')
      || document.querySelector('.outer-link-container')
      || document.querySelector('.main-content');
    if (!detailRoot) return { found: false, reason: 'no_detail_root' };
    const totals = Array.from(detailRoot.querySelectorAll('.total'));
    const target = totals.find((node) => {
      const text = String(node?.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return false;
      return /条评论/.test(text) || /评论/.test(text);
    });
    if (!target) return { found: false, reason: 'no_total' };
    const rect = target.getBoundingClientRect?.();
    if (!rect || rect.width <= 1 || rect.height <= 1) return { found: false, reason: 'not_visible' };
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const visibleLeft = Math.max(1, Math.min(vw - 1, Number(rect.left || 0)));
    const visibleRight = Math.max(visibleLeft + 1, Math.min(vw - 1, Number(rect.right || (Number(rect.left || 0) + Number(rect.width || 0)))));
    const visibleTop = Math.max(1, Math.min(vh - 1, Number(rect.top || 0)));
    const visibleBottom = Math.max(visibleTop + 1, Math.min(vh - 1, Number(rect.bottom || (Number(rect.top || 0) + Number(rect.height || 0)))));
    return {
      found: true,
      selector: '.total',
      text: String(target.textContent || '').trim(),
      center: {
        x: Math.max(1, Math.round(visibleLeft + Math.max(8, (visibleRight - visibleLeft) * 0.5))),
        y: Math.max(1, Math.round(visibleTop + Math.max(10, Math.min(visibleBottom - visibleTop - 6, (visibleBottom - visibleTop) * 0.72)))),
      },
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readVisibleCommentTarget(profileId) {
  const script = `(() => {
    const detailRoot = document.querySelector('.note-detail-mask')
      || document.querySelector('.note-detail-page')
      || document.querySelector('.note-detail-dialog')
      || document.querySelector('.note-container')
      || document.querySelector('.outer-link-container')
      || document.querySelector('.main-content');
    if (!detailRoot) return { found: false, reason: 'no_detail_root' };
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const selectors = ['.note-scroller', '.comments-container', '.comment-list', '.comments-el'];
    const readRect = (node) => node?.getBoundingClientRect?.() || null;
    const toVisiblePoint = (rect) => {
      const left = Math.max(1, Math.min(vw - 1, Number(rect.left || 0)));
      const right = Math.max(left + 1, Math.min(vw - 1, Number(rect.right || (Number(rect.left || 0) + Number(rect.width || 0)))));
      const top = Math.max(1, Math.min(vh - 1, Number(rect.top || 0)));
      const bottom = Math.max(top + 1, Math.min(vh - 1, Number(rect.bottom || (Number(rect.top || 0) + Number(rect.height || 0)))));
      return {
        x: Math.max(1, Math.round(left + (right - left) * 0.5)),
        y: Math.max(1, Math.round(top + (bottom - top) * 0.45)),
      };
    };
    const intersectionArea = (a, b) => {
      const left = Math.max(Number(a.left || 0), Number(b.left || 0));
      const right = Math.min(Number(a.right || 0), Number(b.right || 0));
      const top = Math.max(Number(a.top || 0), Number(b.top || 0));
      const bottom = Math.min(Number(a.bottom || 0), Number(b.bottom || 0));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      return width * height;
    };
    const viewportRect = { left: 0, top: 0, right: vw, bottom: vh };
    const isElementVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = readRect(node);
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      if (rect.bottom <= 0 || rect.right <= 0 || rect.left >= vw || rect.top >= vh) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (Number(style.opacity || '1') <= 0.01) return false;
      } catch {
        return false;
      }
      return true;
    };
    const scrollContainer = selectors
      .map((selector) => detailRoot.querySelector(selector))
      .find((node) => isElementVisible(node));
    const containerRect = readRect(scrollContainer || detailRoot);
    if (!containerRect || containerRect.width <= 1 || containerRect.height <= 1) {
      return { found: false, reason: 'no_comment_container' };
    }
    const nodes = Array.from((scrollContainer || detailRoot).querySelectorAll('.comment-item, [class*="comment-item"]'));
    const scored = nodes
      .map((node) => {
        if (!(node instanceof Element)) return null;
        const rect = readRect(node);
        if (!rect || rect.width <= 1 || rect.height <= 1) return null;
        const visibleInViewport = intersectionArea(rect, viewportRect);
        const visibleInContainer = intersectionArea(rect, containerRect);
        const area = Math.max(1, Number(rect.width || 0) * Number(rect.height || 0));
        const visibleRatio = Math.min(1, visibleInViewport / area);
        const inContainerRatio = Math.min(1, visibleInContainer / area);
        if (visibleRatio < 0.25 || inContainerRatio < 0.35) return null;
        const center = toVisiblePoint(rect);
        if (center.x < Math.max(1, containerRect.left) || center.x > Math.min(vw - 1, containerRect.right)) return null;
        if (center.y < Math.max(1, containerRect.top) || center.y > Math.min(vh - 1, containerRect.bottom)) return null;
        return {
          node,
          rect,
          center,
          score: (inContainerRatio * 10) + (visibleRatio * 5) - Math.abs(center.y - Math.max(containerRect.top, 0)) * 0.002,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const picked = scored[0] || null;
    if (!picked) return { found: false, reason: 'no_visible_comment' };
    const rect = picked.rect;
    return {
      found: true,
      selector: '.comment-item',
      rect: {
        left: Number(rect.left || 0),
        top: Number(rect.top || 0),
        width: Number(rect.width || 0),
        height: Number(rect.height || 0),
      },
      center: picked.center,
      viewport: { width: vw, height: vh },
      containerRect: {
        left: Number(containerRect.left || 0),
        top: Number(containerRect.top || 0),
        width: Number(containerRect.width || 0),
        height: Number(containerRect.height || 0),
      },
      text: String(picked.node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readCommentScrollContainerTarget(profileId) {
  const script = `(() => {
    const detailRoot = document.querySelector('.note-detail-mask')
      || document.querySelector('.note-detail-page')
      || document.querySelector('.note-detail-dialog')
      || document.querySelector('.note-container')
      || document.querySelector('.outer-link-container')
      || document.querySelector('.main-content');
    if (!detailRoot) return { found: false, reason: 'no_detail_root' };
    const toVisiblePoint = (rect) => {
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      const left = Math.max(1, Math.min(vw - 1, Number(rect.left || 0)));
      const right = Math.max(left + 1, Math.min(vw - 1, Number(rect.right || (Number(rect.left || 0) + Number(rect.width || 0)))));
      const top = Math.max(1, Math.min(vh - 1, Number(rect.top || 0)));
      const bottom = Math.max(top + 1, Math.min(vh - 1, Number(rect.bottom || (Number(rect.top || 0) + Number(rect.height || 0)))));
      return {
        x: Math.max(1, Math.round(left + (right - left) * 0.5)),
        y: Math.max(1, Math.round(top + (bottom - top) * 0.16)),
      };
    };
    const selectors = ['.note-scroller', '.comments-container', '.comment-list', '.comments-el'];
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
    const isScrollable = (node) => {
      if (!(node instanceof Element)) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        const overflowY = String(style.overflowY || '');
        const overflowX = String(style.overflowX || '');
        const yScrollable = (overflowY.includes('auto') || overflowY.includes('scroll') || overflowY.includes('overlay'))
          && (Number(node.scrollHeight || 0) - Number(node.clientHeight || 0) > 2);
        const xScrollable = (overflowX.includes('auto') || overflowX.includes('scroll') || overflowX.includes('overlay'))
          && (Number(node.scrollWidth || 0) - Number(node.clientWidth || 0) > 2);
        return yScrollable || xScrollable;
      } catch {
        return false;
      }
    };
    const hasCommentContext = (node) => Boolean(
      node?.querySelector?.('.comment-item')
      || node?.querySelector?.('[class*="comment-item"]')
      || node?.querySelector?.('.total')
      || node?.querySelector?.('.comments-container')
      || node?.querySelector?.('.comments-el')
      || node?.querySelector?.('.comment-list')
    );
    const candidates = [];
    for (const selector of selectors) {
      const nodes = Array.from(detailRoot.querySelectorAll(selector));
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        if (!hasCommentContext(node) && !node.matches?.('.note-scroller')) continue;
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.width <= 1 || rect.height <= 1) continue;
        const viewportHeight = Number(window.innerHeight || 0);
        const viewportWidth = Number(window.innerWidth || 0);
        const visibleTop = Math.max(0, rect.top);
        const visibleLeft = Math.max(0, rect.left);
        const visibleRight = Math.min(viewportWidth, rect.right);
        const visibleBottom = Math.min(viewportHeight, rect.bottom);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibleArea = visibleWidth * visibleHeight;
        const totalArea = Math.max(1, Number(rect.width || 0) * Number(rect.height || 0));
        const visibleRatio = Math.max(0, Math.min(1, visibleArea / totalArea));
        if (visibleRatio < 0.55) continue;
        const canScroll = isScrollable(node);
        const includesTotal = Boolean(node.querySelector?.('.total'));
        const includesItems = Boolean(node.querySelector?.('.comment-item, [class*="comment-item"]'));
        const score = (canScroll ? 0 : 20)
          + (selector === '.note-scroller' ? 0 : 6)
          + (includesTotal ? 0 : 6)
          + (includesItems ? 0 : 8)
          + Math.max(0, Math.round(rect.top));
        candidates.push({ selector, rect, canScroll, score, className: String(node.className || '').trim(), visibleRatio, includesTotal, includesItems });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const target = candidates[0] || null;
    if (!target) return { found: false, reason: 'no_scroll_container' };
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      found: true,
      selector: target.selector,
      className: target.className || null,
      canScroll: target.canScroll === true,
      visibleRatio: Number(target.visibleRatio || 0),
      includesTotal: target.includesTotal === true,
      includesItems: target.includesItems === true,
      rect: {
        left: Number(target.rect.left || 0),
        top: Number(target.rect.top || 0),
        width: Number(target.rect.width || 0),
        height: Number(target.rect.height || 0),
      },
      center: toVisiblePoint(target.rect),
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readCommentFocusTarget(profileId) {
  const script = `(() => {
    const detailRoot = document.querySelector('.note-detail-mask') || document.querySelector('.note-detail-page');
    if (!detailRoot) return { found: false, reason: 'no_detail_root' };
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
    const candidates = Array.from(detailRoot.querySelectorAll('.comments-container .comment-item, .comment-list .comment-item, .comments-el .comment-item, .comments-container [class*="comment-item"], .comment-list [class*="comment-item"], .comments-el [class*="comment-item"]'));
    const target = candidates.find((node) => {
      if (!isVisible(node)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect) return false;
      const root = node.closest('.comments-container, .comment-list, .comments-el');
      if (!root) return false;
      return rect.top >= 0 && rect.left >= 0;
    });
    if (!target) return { found: false, reason: 'no_comment_focus_target' };
    const rect = target.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      found: true,
      selector: '.comment-item',
      center: { x: Math.max(1, Math.round(rect.left + rect.width / 2)), y: Math.max(1, Math.round(rect.top + Math.min(rect.height / 2, 24))) },
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readCommentsSnapshot(profileId) {
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
      } catch { return false; }
      return true;
    };
    const detailSelectors = ['.note-detail-mask', '.note-detail-page', '.note-detail-dialog', '.note-detail-mask .detail-container', '.note-detail-mask .media-container', '.note-detail-mask .note-scroller', '.note-detail-mask .note-content', '.note-detail-mask .interaction-container', '.note-detail-mask .comments-container', '.note-scroller', '.note-content', '.interaction-container', '.media-container', '.comments-container', '.comments-el'];
    const detailVisible = detailSelectors.some((selector) => isVisible(document.querySelector(selector)));
    const hasCommentsContext = Boolean(document.querySelector('.comments-container') || document.querySelector('.comment-list') || document.querySelector('.comment-item') || document.querySelector('[class*="comment-item"]') || document.querySelector('.comments-el') || document.querySelector('.note-scroller'));
    const scopeSelectors = ['.note-detail-mask .interaction-container', '.note-detail-mask .comments-container', '.note-detail-page .interaction-container', '.note-detail-page .comments-container', '.interaction-container', '.comments-container', '.comments-el', '.note-scroller', '.note-detail-mask', '.note-detail-page'];
    const patterns = [
      new RegExp('([0-9]+(?:\\\\.[0-9]+)?(?:\\\\u4e07|w|W)?)\\\\s*\\\\u6761?\\\\u8bc4\\\\u8bba'),
      new RegExp('\\\\u8bc4\\\\u8bba\\\\s*([0-9]+(?:\\\\.[0-9]+)?(?:\\\\u4e07|w|W)?)'),
      new RegExp('\\\\u5171\\\\s*([0-9]+(?:\\\\.[0-9]+)?(?:\\\\u4e07|w|W)?)\\\\s*\\\\u6761'),
    ];
    let expectedCommentsCount = null;
    const chatCountEl = document.querySelector('.chat-wrapper .count');
    const chatCountText = String(chatCountEl?.textContent || '').trim();
    const chatCountParsed = chatCountText ? parseCountToken(chatCountText) : null;
    if (Number.isFinite(chatCountParsed) && chatCountParsed >= 0) {
      expectedCommentsCount = chatCountParsed;
    }
    for (const selector of scopeSelectors) {
      const root = document.querySelector(selector);
      if (!root) continue;
      const text = String(root.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) continue;
      for (const re of patterns) {
        const matched = text.match(re);
        if (!matched || !matched[1]) continue;
        const parsed = parseCountToken(matched[1]);
        if (Number.isFinite(parsed) && parsed >= 0) { expectedCommentsCount = parsed; break; }
      }
      if (expectedCommentsCount != null) break;
    }
    const commentNodes = Array.from(document.querySelectorAll('.comment-item, [class*="comment-item"]'));
    const comments = [];
    let scroll = null;
    const scrollNode = document.querySelector('.note-scroller') || document.querySelector('.comments-container') || document.querySelector('.comment-list') || document.querySelector('.comments-el');
    if (scrollNode instanceof Element) {
      const scrollTop = Number(scrollNode.scrollTop || 0);
      const clientHeight = Number(scrollNode.clientHeight || 0);
      const scrollHeight = Number(scrollNode.scrollHeight || 0);
      scroll = {
        top: scrollTop,
        clientHeight,
        scrollHeight,
        atTop: scrollTop <= 2,
        atBottom: scrollHeight > 0 ? (scrollTop + clientHeight >= scrollHeight - 4) : false,
      };
    }
    for (let index = 0; index < commentNodes.length; index += 1) {
      const node = commentNodes[index];
      if (!isVisible(node)) continue;
      const rect = node.getBoundingClientRect();
      const authorEl = node.querySelector('.author, .nickname, [class*="author"], [class*="nickname"]');
      const contentEl = node.querySelector('.content, .comment-text, [class*="content"], [class*="comment-text"]');
      const nodeId = node.getAttribute('data-id') || node.getAttribute('data-comment-id') || node.id || '';
      const metaUserId = node.getAttribute('data-user-id') || node.getAttribute('data-userid') || node.getAttribute('data-uid') || '';
      const authorLinkEl = authorEl?.querySelector?.('a[href]') || null;
      const authorLink = String(authorLinkEl?.href || authorLinkEl?.getAttribute?.('href') || '').trim();
      let authorId = String(metaUserId || '').trim();
      if (!authorId && authorLink) {
        try {
          const linkUrl = new URL(authorLink, location.origin);
          const parts = linkUrl.pathname.split('/').filter(Boolean);
          if (parts[0] === 'user' && parts[1] === 'profile' && parts[2]) {
            authorId = String(parts[2]);
          } else if (parts[0] === 'user' && parts[1]) {
            authorId = String(parts[1]);
          }
        } catch { /* ignore */ }
      }
      const levelToken = node.getAttribute('data-level') || node.getAttribute('data-layer') || '';
      const level = Number.isFinite(Number(levelToken)) ? Number(levelToken) : (node.classList?.contains('sub-comment') ? 2 : 1);
      const author = String(authorEl?.textContent || '').replace(/[:：]$/, '').trim() || '匿名用户';
      const content = String(contentEl?.textContent || '').trim();
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      comments.push({
        index,
        commentId: String(nodeId || ''),
        author,
        authorId: authorId || null,
        authorLink: authorLink || null,
        content,
        level,
        inViewport: rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh,
        rect: { left: Number(rect.left || 0), top: Number(rect.top || 0), width: Number(rect.width || 0), height: Number(rect.height || 0) },
      });
    }
    return { detailVisible, hasCommentsContext, expectedCommentsCount, commentCount: comments.length, comments, commentCountFromUi: chatCountParsed ?? null, commentCountFromUiText: chatCountText || null, scroll };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readLikeTargetByIndex(profileId, index) {
  const idx = Math.max(0, Number(index) || 0);
  const script = `(() => {
    const idx = ${idx};
    const nodes = Array.from(document.querySelectorAll('.comment-item, [class*="comment-item"]'));
    const node = nodes[idx];
    if (!node) return { found: false };
    const likeBtn = node.querySelector('[class*="like"], .like-btn, .like');
    if (!likeBtn) return { found: false, hasNode: true };
    const rect = likeBtn.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      found: true, index: idx,
      center: { x: Math.max(1, Math.round(rect.left + rect.width / 2)), y: Math.max(1, Math.round(rect.top + rect.height / 2)) },
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readReplyTargetByIndex(profileId, index) {
  const idx = Math.max(0, Number(index) || 0);
  const script = `(() => {
    const idx = ${idx};
    const nodes = Array.from(document.querySelectorAll('.comment-item, [class*="comment-item"]'));
    const node = nodes[idx];
    if (!node) return { found: false };
    const replyBtn = node.querySelector('[class*="reply"], .reply-btn, .reply');
    if (!replyBtn) return { found: false, hasNode: true };
    const rect = replyBtn.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      found: true, index: idx,
      center: { x: Math.max(1, Math.round(rect.left + rect.width / 2)), y: Math.max(1, Math.round(rect.top + rect.height / 2)) },
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readReplyInputTarget(profileId) {
  const script = `(() => {
    const input = document.querySelector('.comment-input, [class*="comment-input"], textarea[class*="reply"]');
    if (!input) return { found: false };
    const rect = input.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      found: true,
      tagName: input.tagName,
      center: { x: Math.max(1, Math.round(rect.left + rect.width / 2)), y: Math.max(1, Math.round(rect.top + rect.height / 2)) },
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readReplyInputValue(profileId) {
  const script = `(() => {
    const input = document.querySelector('.comment-input, [class*="comment-input"], textarea[class*="reply"]');
    if (!input) return { found: false };
    return { found: true, value: String(input.value || input.textContent || '').trim() };
  })()`;
  return evaluateReadonly(profileId, script);
}

export async function readReplySendButtonTarget(profileId) {
  const script = `(() => {
    const btn = document.querySelector('.send-btn, [class*="send"], button[type="submit"]');
    if (!btn) return { found: false };
    const rect = btn.getBoundingClientRect();
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    return {
      found: true,
      center: { x: Math.max(1, Math.round(rect.left + rect.width / 2)), y: Math.max(1, Math.round(rect.top + rect.height / 2)) },
      viewport: { width: vw, height: vh },
    };
  })()`;
  return evaluateReadonly(profileId, script);
}
