import { evaluateReadonly } from './dom-ops.mjs';
import { getProfileState } from './state.mjs';
import { normalizeInlineText, sanitizeAuthorText, clamp } from './utils.mjs';

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
    const patterns = [/([0-9]+(?:\\.[0-9]+)?(?:万|w|W)?)\\s*条?评论/, /评论\\s*([0-9]+(?:\\.[0-9]+)?(?:万|w|W)?)/, /共\\s*([0-9]+(?:\\.[0-9]+)?(?:万|w|W)?)\\s*条/];
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
        const match = authorLink.match(/\/user\/profile\/([^/?#]+)/) || authorLink.match(/\/user\/([^/?#]+)/);
        if (match && match[1]) authorId = String(match[1]);
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
    return { detailVisible, hasCommentsContext, expectedCommentsCount, commentCount: comments.length, comments, commentCountFromUi: chatCountParsed ?? null, commentCountFromUiText: chatCountText || null };
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
