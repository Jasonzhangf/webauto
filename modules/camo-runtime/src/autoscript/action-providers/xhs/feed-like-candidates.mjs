import { evaluateReadonly } from './dom-ops.mjs';
import { NOTE_ITEM_SELECTOR, NOTE_LIKED_USE_SELECTORS } from './feed-like-shared.mjs';

export async function readFeedLikeCandidates(profileId, options = {}) {
  const maxCandidates = Math.max(1, Number(options.maxCandidates || 50) || 50);
  const minTopSafePx = Math.max(60, Number(options.minTopSafePx || 90) || 90);

  const script = `(() => {
    const items = Array.from(document.querySelectorAll('${NOTE_ITEM_SELECTOR}'));
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);

    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom <= 0 || rect.top >= vh) return false;
      try {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      } catch { return false; }
      return true;
    };

    const candidates = [];
    for (let i = 0; i < items.length && candidates.length < ${maxCandidates}; i++) {
      const item = items[i];
      if (!isVisible(item)) continue;

      const likeBtn = item.querySelector('.like-wrapper svg.reds-icon.like-icon, svg.reds-icon.like-icon, .like-lottie');
      if (!likeBtn) continue;

      const likedUse = item.querySelector(${JSON.stringify(NOTE_LIKED_USE_SELECTORS.join(', '))});
      const likedHref = String(likedUse?.getAttribute('href') || likedUse?.getAttribute('xlink:href') || '').trim();
      const liked = likedHref === '#liked';

      const cover = item.querySelector('a.cover');
      const href = cover ? String(cover.getAttribute('href') || '') : '';
      const noteIdMatch = href.match(/\/(?:explore|search_result)\/([a-zA-Z0-9]+)/);
      const noteId = noteIdMatch ? noteIdMatch[1] : null;

      const rect = likeBtn.getBoundingClientRect();
      if (!rect || rect.width <= 2 || rect.height <= 2) continue;
      if (rect.top < ${minTopSafePx}) continue;
      if (rect.bottom > vh - 8) continue;
      const center = {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };

      const hit = document.elementFromPoint(center.x, center.y);
      const stack = (typeof document.elementsFromPoint === 'function')
        ? document.elementsFromPoint(center.x, center.y)
        : (hit ? [hit] : []);
      const hitMatches = stack.some((node) => {
        if (!node) return false;
        return (
          node === likeBtn
          || likeBtn.contains(node)
          || node.contains(likeBtn)
          || !!node.closest('svg.reds-icon.like-icon')
          || !!node.closest('.like-lottie')
          || !!node.closest('.like-wrapper')
        );
      });
      if (!hitMatches) continue;

      candidates.push({
        index: i,
        noteId,
        href,
        liked,
        center,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    return {
      ok: true,
      candidates,
      totalCount: candidates.length,
      likedCount: candidates.filter(c => c.liked).length,
      unlikedCount: candidates.filter(c => !c.liked).length,
    };
  })()`;

  return evaluateReadonly(profileId, script, { timeoutMs: 8000, onTimeout: 'return' });
}

export async function readNoteLikeStatus(profileId, noteId) {
  const safeId = String(noteId || '').trim();
  if (!safeId) return { ok: false, liked: null };
  const script = `(() => {
    const cover = document.querySelector('.note-item a.cover[href*="${safeId}"]');
    const item = cover ? cover.closest('.note-item') : null;
    if (!item) return { ok: false, liked: null };
    const likedUse = item.querySelector(${JSON.stringify(NOTE_LIKED_USE_SELECTORS.join(', '))});
    const likedHref = String(likedUse?.getAttribute('href') || likedUse?.getAttribute('xlink:href') || '').trim();
    return { ok: true, liked: likedHref === '#liked' };
  })()`;
  return evaluateReadonly(profileId, script, { timeoutMs: 3000, onTimeout: 'return' });
}

