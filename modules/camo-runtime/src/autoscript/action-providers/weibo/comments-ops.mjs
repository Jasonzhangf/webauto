import { sleep, parseDevtoolsJson, devtoolsEval } from './common.mjs';

export async function readCommentPanelState(profileId) {
  const script = `(() => {
    // Find the comment panel by locating vue-recycle-scroller and walking up to its woo-panel-main ancestor.
    // querySelector('.woo-panel-main.woo-panel-bottom') incorrectly matches the nav bar first.
    const scroller = document.querySelector('.vue-recycle-scroller');
    let panel = null;
    if (scroller) {
      let el = scroller;
      while (el) {
        if (el.classList && el.classList.contains('woo-panel-main')) { panel = el; break; }
        el = el.parentElement;
      }
    }
    if (!panel) return { hasPanel: false, commentCount: 0, isEmpty: true, bottomReached: false };

    const scrollerItems = panel.querySelectorAll('.wbpro-scroller-item');
    const dynamicItems = panel.querySelectorAll('[class*="_item_1z046"]');

    const bottomEl = panel.querySelector('[class*="_box_1px0u"]');
    const bottomText = bottomEl ? String(bottomEl.textContent || '').trim() : '';
    const bottomReached = bottomText.includes('没有更多') || bottomText.includes('已过滤部分评论');

    const titleEl = panel.querySelector('.wbpro-layer-tit-text');
    const titleText = titleEl ? String(titleEl.textContent || '').trim() : '';

    const hasVueScroller = Boolean(scroller);

    return {
      hasPanel: true,
      commentCount: Math.max(scrollerItems.length, dynamicItems.length),
      isEmpty: scrollerItems.length === 0 && dynamicItems.length === 0,
      bottomReached,
      bottomText,
      titleText,
      hasVueScroller,
      scrollerHeight: scroller ? scroller.scrollHeight : 0,
    };
  })()`;
  return devtoolsEval(profileId, script);
}

export async function scrollCommentToLoadMore(profileId) {
  const script = `(() => {
    const scroller = document.querySelector('.vue-recycle-scroller');
    const items = document.querySelectorAll('.wbpro-scroller-item');
    if (scroller && items.length > 0) {
      // vue-recycle-scroller has overflow=visible, scrollTop assignment is ignored.
      // Use scrollIntoView on the last comment item to trigger lazy loading.
      items[items.length - 1].scrollIntoView({ behavior: 'instant', block: 'end' });
    } else if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    } else {
      window.scrollTo(0, document.body.scrollHeight);
    }
    return { scrolled: true };
  })()`;
  return devtoolsEval(profileId, script);
}

export async function scrollCommentsToBottom(profileId, options = {}) {
  const maxScrolls = Number(options.maxScrolls) || 50;
  const scrollIntervalMs = Number(options.scrollIntervalMs) || 800;
  const bottomSelector = options.bottomSelector || 'div[class*="_box_1px0u"]';
  const bottomText = options.bottomText || '没有更多';
  const maxComments = Number(options.maxComments) || 0;

  let scrollCount = 0;
  let lastCommentCount = 0;
  let stableCount = 0;

  while (scrollCount < maxScrolls) {
    await scrollCommentToLoadMore(profileId);
    scrollCount++;
    await sleep(scrollIntervalMs);

    const state = await readCommentPanelState(profileId).catch(() => null);
    if (!state) continue;

    if (state.bottomReached) {
      return { ok: true, scrollCount, commentCount: state.commentCount, reason: 'bottom_reached' };
    }

    if (maxComments > 0 && state.commentCount >= maxComments) {
      return { ok: true, scrollCount, commentCount: state.commentCount, reason: 'max_comments' };
    }

    if (state.commentCount === lastCommentCount) {
      stableCount++;
      if (stableCount >= 5) {
        return { ok: true, scrollCount, commentCount: state.commentCount, reason: 'stable_count' };
      }
    } else {
      stableCount = 0;
      lastCommentCount = state.commentCount;
    }
  }

  return { ok: false, scrollCount, commentCount: lastCommentCount, reason: 'max_scrolls_exceeded' };
}

export async function extractComments(profileId) {
  const script = `(() => {
    const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim();
    // Locate comment panel via vue-recycle-scroller ancestor (same fix as readCommentPanelState)
    const scroller = document.querySelector('.vue-recycle-scroller');
    let panel = null;
    if (scroller) {
      let el = scroller;
      while (el) {
        if (el.classList && el.classList.contains('woo-panel-main')) { panel = el; break; }
        el = el.parentElement;
      }
    }
    if (!panel) return { comments: [], total: 0 };

    const items = panel.querySelectorAll('.wbpro-scroller-item');
    if (items.length === 0) {
      return { comments: [], total: 0 };
    }

    const comments = [];
    for (const item of items) {
      const textDiv = item.querySelector('.text');
      const authorEl = textDiv ? textDiv.querySelector('a[href^="/u/"]') : null;
      const author = authorEl ? normalize(authorEl.textContent) : '';

      let text = '';
      if (textDiv) {
        const parts = [];
        for (const node of textDiv.childNodes) {
          if (node.nodeType === 3) {
            parts.push(node.textContent);
          } else if (node.nodeType === 1) {
            if (node.tagName === 'A' && node.getAttribute('href') && node.getAttribute('href').startsWith('/u/')) continue;
            if (node.tagName === 'IMG') {
              parts.push(node.alt || node.title || '');
            } else {
              const img = node.querySelector('img');
              if (img) parts.push(img.alt || img.title || '');
              else parts.push(node.textContent);
            }
          }
        }
        const raw = parts.join('').replace(/\s+/g, ' ').trim().replace(/^[:\s]+/, '');
        if (raw.startsWith(author)) text = raw.slice(author.length).replace(/^[:\s]+/, '');
        else text = raw;
      }

      const con1 = item.querySelector('.con1');
      const fromEl = con1 ? con1.querySelector('.from') : null;
      const timestamp = fromEl ? normalize(fromEl.textContent) : '';
      const likeEl = item.querySelector('[class*="like"] [class*="num"]') || item.querySelector('.woo-like-count');
      const likes = likeEl ? normalize(likeEl.textContent) : '0';

      const subItems = item.querySelectorAll('.list2 .item2');
      const replies = [];
      for (const sub of subItems) {
        const subTextDiv = sub.querySelector('.text');
        const subAuthor = subTextDiv ? subTextDiv.querySelector('a[href^="/u/"]') : sub.querySelector('a[href^="/u/"]');
        let subText = '';
        if (subTextDiv) {
          const subParts = [];
          for (const node of subTextDiv.childNodes) {
            if (node.nodeType === 3) {
              subParts.push(node.textContent);
            } else if (node.nodeType === 1) {
              if (node.tagName === 'A' && node.getAttribute('href') && node.getAttribute('href').startsWith('/u/')) continue;
              if (node.tagName === 'IMG') {
                subParts.push(node.alt || node.title || '');
              } else {
                const img = node.querySelector('img');
                if (img) subParts.push(img.alt || img.title || '');
                else subParts.push(node.textContent);
              }
            }
          }
          subText = normalize(subParts.join('').replace(/\s+/g, ' ').trim().replace(/^[:\s]+/, ''));
        }
        const subCon1 = sub.querySelector('.con1');
        const subFromEl = subCon1 ? subCon1.querySelector('.from') : null;
        replies.push({
          author: subAuthor ? normalize(subAuthor.textContent) : '',
          text: subText,
          timestamp: subFromEl ? normalize(subFromEl.textContent) : '',
        }); if (subText.includes("条回复")) { replies.pop(); }
      }

      comments.push({
        author,
        text,
        timestamp,
        likes,
        replyCount: replies.length,
        replies,
      });
    }

    return { comments, total: comments.length };
  })()`;
  return devtoolsEval(profileId, script);
}

export async function isCommentPanelEmpty(profileId) {
  const state = await readCommentPanelState(profileId).catch(() => null);
  return state?.isEmpty !== false;
}

export async function expandAllSubReplies(profileId, options = {}) {
  const maxRounds = Number(options.maxRounds) || 5;
  const clickDelayMs = Number(options.clickDelayMs) || 600;

  const script = `(() => {
    const scroller = document.querySelector('.vue-recycle-scroller');
    let panel = null;
    if (scroller) {
      let el = scroller;
      while (el) {
        if (el.classList && el.classList.contains('woo-panel-main')) { panel = el; break; }
        el = el.parentElement;
      }
    }
    if (!panel) return { expanded: 0, total: 0 };

    const buttons = [];
    const allText = panel.querySelectorAll('span, a, div, button');
    for (const el of allText) {
      const text = String(el.textContent || '').trim();
      if (/展开\\d+条回复/.test(text) || /展开回复/.test(text)) {
        const btn = el.closest('a') || el.closest('button') || el.closest('[role="button"]') || el;
        if (btn && !buttons.includes(btn)) buttons.push(btn);
      }
    }
    return { total: buttons.length, expanded: buttons.length };
  })()`;

  let totalExpanded = 0;
  for (let round = 0; round < maxRounds; round++) {
    try {
      const result = await devtoolsEval(profileId, script);
      const count = result?.total || 0;
      if (count === 0) break;

      const clickScript = `(() => {
        const scroller = document.querySelector('.vue-recycle-scroller');
        let panel = null;
        if (scroller) {
          let el = scroller;
          while (el) {
            if (el.classList && el.classList.contains('woo-panel-main')) { panel = el; break; }
            el = el.parentElement;
          }
        }
        if (!panel) return 0;
        let clicked = 0;
        const allText = panel.querySelectorAll('span, a, div, button');
        for (const el of allText) {
          const text = String(el.textContent || '').trim();
          if (/展开\\d+条回复/.test(text) || /展开回复/.test(text)) {
            const btn = el.closest('a') || el.closest('button') || el.closest('[role="button"]') || el;
            if (btn) { btn.click(); clicked++; }
          }
        }
        return clicked;
      })()`;
      const clicked = await devtoolsEval(profileId, clickScript);
      totalExpanded += (clicked || 0);
      await sleep(clickDelayMs);
    } catch {
      break;
    }
  }

  return { expanded: totalExpanded };
}
