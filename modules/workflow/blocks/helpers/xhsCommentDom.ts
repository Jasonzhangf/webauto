/**
 * XHS Comment DOM Probes
 *
 * 仅做只读 DOM 查询 + rect/文本提取，用于计算坐标、统计、判断是否到底。
 * 禁止在这里做 element.click()/scrollIntoView()/location 跳转等行为。
 */

export interface Viewport {
  innerWidth: number;
  innerHeight: number;
}

export interface FocusPoint {
  x: number;
  y: number;
}

export interface CommentStats {
  hasRoot: boolean;
  count: number;
  hasMore: boolean;
  total: number | null;
}

export interface CommentEndState {
  endMarkerVisible: boolean;
  emptyStateVisible: boolean;
}

export interface ViewportFirstComment {
  key: string;
  top: number;
  bottom: number;
  user: string;
  textSample: string;
}

export interface ScrollContainerInfo {
  x: number;
  y: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ScrollStats {
  found: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  atTop: boolean;
  atBottom: boolean;
}

export async function controllerAction(
  controllerUrl: string,
  action: string,
  payload: any = {},
  timeoutMs = 10000,
): Promise<any> {
  const response = await fetch(controllerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: (AbortSignal as any).timeout
      ? (AbortSignal as any).timeout(timeoutMs)
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  return data.data || data;
}

export async function getViewport(
  controllerUrl: string,
  profile: string,
): Promise<Viewport> {
  try {
    const result = await controllerAction(controllerUrl, 'browser:execute', {
      profile,
      script: '({ innerWidth: window.innerWidth || 0, innerHeight: window.innerHeight || 0 })',
    });
    const payload = (result as any).result || (result as any).data?.result || result;
    return {
      innerWidth: Number(payload?.innerWidth ?? 0),
      innerHeight: Number(payload?.innerHeight ?? 0),
    };
  } catch {
    return { innerWidth: 0, innerHeight: 0 };
  }
}

export function computeVisibleFocusPoint(
  rect: { x: number; y: number; width: number; height: number },
  viewport: Viewport,
): FocusPoint | null {
  const w = Number(viewport?.innerWidth || 0) || 0;
  const h = Number(viewport?.innerHeight || 0) || 0;
  const xCenter = rect.x + rect.width / 2;
  const x = w ? clamp(xCenter, 20, w - 20) : xCenter;

  const rectTop = rect.y;
  const rectBottom = rect.y + rect.height;
  const safeTop = 160;
  const safeBottom = 120;
  const topVisible = Math.max(rectTop, safeTop);
  const bottomVisible = h ? Math.min(rectBottom, h - safeBottom) : rectBottom;
  if (bottomVisible <= topVisible) return null;
  const y = (topVisible + bottomVisible) / 2;
  return { x, y };
}

export async function isInputFocused(
  controllerUrl: string,
  profile: string,
): Promise<boolean> {
  try {
    const result = await controllerAction(controllerUrl, 'browser:execute', {
      profile,
      script: `(() => {
        const el = document.activeElement;
        const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
        const type = (el && (el as any).type) ? String((el as any).type) : '';
        const isInput = tag === 'input' || tag === 'textarea' || (el && (el as any).isContentEditable);
        return { tag, type, isInput };
      })()`,
    });
    const payload = (result as any).result || (result as any).data?.result || result;
    return Boolean(payload?.isInput);
  } catch {
    return false;
  }
}

/**
 * 聚焦评论区（只读计算坐标 + 可选 outline），返回可用于系统 click 的坐标。
 */
export async function locateCommentsFocusPoint(
  controllerUrl: string,
  profile: string,
): Promise<FocusPoint | null> {
  try {
    const focusResult = await controllerAction(controllerUrl, 'browser:execute', {
      profile,
      script: `(() => {
        const root =
          document.querySelector('.comments-el') ||
          document.querySelector('.comment-list') ||
          document.querySelector('.comments-container') ||
          document.querySelector('[class*="comment-section"]');
        if (!root) return null;

        document.querySelectorAll('[data-webauto-highlight]').forEach((el) => {
          if (el instanceof HTMLElement) el.style.outline = '';
          el.removeAttribute('data-webauto-highlight');
        });

        const rect = root.getBoundingClientRect();
        const vx2 = window.innerWidth;
        const vy2 = window.innerHeight;

        const xCenter = rect.left + rect.width / 2;
        const x = Math.min(Math.max(xCenter, 10), vx2 - 10);

        const topVisible = Math.max(rect.top, 10);
        const bottomVisible = Math.min(rect.bottom, vy2 - 10);
        if (bottomVisible <= topVisible) return null;
        const y = (topVisible + bottomVisible) / 2;

        if (root instanceof HTMLElement) {
          root.style.outline = '4px solid magenta';
          root.setAttribute('data-webauto-highlight', 'true');
        }

        return { x, y };
      })()`,
    });

    const payload = (focusResult as any).result || (focusResult as any).data?.result || focusResult;
    if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') return null;
    return { x: Number(payload.x), y: Number(payload.y) };
  } catch {
    return null;
  }
}

export async function getCommentStats(
  controllerUrl: string,
  profile: string,
): Promise<CommentStats> {
  const result = await controllerAction(controllerUrl, 'browser:execute', {
    profile,
    script: `(() => {
      const root =
        document.querySelector('.comments-el') ||
        document.querySelector('.comment-list') ||
        document.querySelector('.comments-container') ||
        document.querySelector('[class*="comment-section"]');
      if (!root) {
        const chatCountEl =
          document.querySelector('.chat-wrapper .count') ||
          document.querySelector('[class*="chat-wrapper"] .count') ||
          document.querySelector('.chat-wrapper [class*="count"]');
        const parseCount = (raw) => {
          const t = (raw || '').toString().trim();
          if (!t) return null;
          const mWan = t.match(/^([0-9]+(?:\\.[0-9]+)?)\\s*万/);
          if (mWan) {
            const v = Number.parseFloat(mWan[1]);
            if (!Number.isFinite(v)) return null;
            return Math.round(v * 10000);
          }
          const digits = t.replace(/[^0-9]/g, '');
          if (!digits.length) return null;
          return Number(digits);
        };
        const parsed = parseCount(chatCountEl?.textContent || '');
        return { hasRoot: false, count: 0, hasMore: false, total: parsed };
      }

      const items = Array.from(root.querySelectorAll('.comment-item, [class*="comment-item"]'));
      const emptyEl =
        root.querySelector('.no-comments') ||
        root.querySelector('.comment-empty') ||
        root.querySelector('.empty-comment') ||
        root.querySelector('.note-comment-empty') ||
        root.querySelector('.empty-state');
      const emptyText = (emptyEl?.textContent || '').replace(/\\s+/g, ' ').trim();
      const rootText = (root.textContent || '').replace(/\\s+/g, ' ').trim();
      const emptyHint =
        Boolean(emptyEl) ||
        /荒地/.test(emptyText) ||
        /暂无评论|还没有评论|没有评论/.test(emptyText) ||
        /荒地/.test(rootText);

      // 空评论：允许以“空态”直接结束（符合“空评论也算结束”规则）
      if (items.length === 0 && emptyHint) {
        return { hasRoot: true, count: 0, hasMore: false, total: 0 };
      }

      const candidates = [];
      const pushText = (el) => {
        if (!el) return;
        const t = (el.textContent || '').trim();
        if (!t) return;
        candidates.push(t);
      };

      const headerContainers = Array.from(document.querySelectorAll('.comments-el, .note-detail-mask, .note-detail'));
      for (const container of headerContainers) {
        if (!container) continue;
        const els = container.querySelectorAll('*');
        els.forEach(pushText);
      }

      if (!candidates.length) {
        document.querySelectorAll('body *').forEach(el => {
          const t = (el.textContent || '').trim();
          if (!t) return;
          if (t.length > 80) return;
          if (/评论/.test(t) && /\\d+/.test(t)) {
            candidates.push(t);
          }
        });
      }

      let total = null;
      const pattern = /(?:共|全部)\\s*(\\d+)\\s*条评论/;
      for (const text of candidates) {
        const m = text.match(pattern);
        if (m) {
          total = Number(m[1]) || null;
          break;
        }
      }

      if (total === null) {
        // 仅在评论 root 内部寻找计数，避免误读页面其它区域（如推荐/频道/聊天计数）
        const chatCountEl =
          root.querySelector('.chat-wrapper .count') ||
          root.querySelector('[class*="chat-wrapper"] .count') ||
          root.querySelector('.chat-wrapper [class*="count"]');
        const parseCount = (raw) => {
          const t = (raw || '').toString().trim();
          if (!t) return null;
          const mWan = t.match(/^([0-9]+(?:\\.[0-9]+)?)\\s*万/);
          if (mWan) {
            const v = Number.parseFloat(mWan[1]);
            if (!Number.isFinite(v)) return null;
            return Math.round(v * 10000);
          }
          const digits = t.replace(/[^0-9]/g, '');
          if (!digits.length) return null;
          return Number(digits);
        };
        const parsed = parseCount(chatCountEl?.textContent || '');
        if (typeof parsed === 'number' && Number.isFinite(parsed)) {
          total = parsed;
        }
      }

      // hasMore：仅用于日志/参考，不作为“到底”判定依据
      // 这里保守地以“是否存在展开按钮/扩展控件”为参考信号
      const hasMore = !!root.querySelector('.show-more, .reply-expand, [class*="expand"]');

      return {
        hasRoot: true,
        count: items.length,
        hasMore,
        total
      };
    })()`,
  });

  const payload = (result as any).result || (result as any).data?.result || result;
  return {
    hasRoot: Boolean(payload?.hasRoot),
    count: Number(payload?.count || 0),
    hasMore: Boolean(payload?.hasMore),
    total: typeof payload?.total === 'number' ? (payload.total as number) : null,
  };
}

export async function getCommentEndState(
  controllerUrl: string,
  profile: string,
): Promise<CommentEndState> {
  try {
    const result = await controllerAction(controllerUrl, 'browser:execute', {
      profile,
      script: `(() => {
        const root =
          document.querySelector('.comments-el') ||
          document.querySelector('.comment-list') ||
          document.querySelector('.comments-container') ||
          document.querySelector('[class*="comment-section"]');
        if (!root) {
          return { endMarkerVisible: false, emptyStateVisible: false, reason: 'no root' };
        }

        const viewportH = window.innerHeight || 0;
        const viewportW = window.innerWidth || 0;

        const isVisible = (el) => {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const r = el.getBoundingClientRect();
          if (!r || r.width < 6 || r.height < 6) return false;
          if (r.bottom <= 0 || r.top >= viewportH) return false;
          if (r.right <= 0 || r.left >= viewportW) return false;
          return true;
        };

        // 以容器定义的 selector 为准（同义集合）
        const endSel = '.end-container, .comment-footer, .comment-end, [data-v-4a19279a][class*=\"end\"]';
        const emptySel =
          '.comment-empty, .empty-comment, .note-comment-empty, .empty-state, .no-comments, [class*=\"no-comments\"], [class*=\"empty\"][class*=\"comment\"]';

        const endEl = root.querySelector(endSel) || document.querySelector(endSel);
        const emptyEl = root.querySelector(emptySel) || document.querySelector(emptySel);

        return {
          endMarkerVisible: isVisible(endEl),
          emptyStateVisible: isVisible(emptyEl),
        };
      })()`,
    });
    const payload = (result as any).result || (result as any).data?.result || result;
    return {
      endMarkerVisible: Boolean(payload?.endMarkerVisible),
      emptyStateVisible: Boolean(payload?.emptyStateVisible),
    };
  } catch {
    return { endMarkerVisible: false, emptyStateVisible: false };
  }
}

export async function getViewportFirstComment(
  controllerUrl: string,
  profile: string,
): Promise<ViewportFirstComment | null> {
  try {
    const result = await controllerAction(controllerUrl, 'browser:execute', {
      profile,
      script: `(() => {
        const root =
          document.querySelector('.comments-el') ||
          document.querySelector('.comment-list') ||
          document.querySelector('.comments-container') ||
          document.querySelector('[class*="comment-section"]');
        if (!root) return null;

        const viewBottom = window.innerHeight || document.documentElement.clientHeight || 0;
        const items = Array.from(root.querySelectorAll('.comment-item, [class*="comment-item"]'));

        let picked = null;
        let pickedRect = null;

        for (const el of items) {
          if (!(el instanceof HTMLElement)) continue;
          const rect = el.getBoundingClientRect();
          const top = rect.top;
          const bottom = rect.bottom;
          const visibleTop = Math.max(top, 0);
          const visibleBottom = Math.min(bottom, viewBottom);
          if (visibleBottom <= visibleTop) continue;
          picked = el;
          pickedRect = rect;
          break;
        }

        if (!picked || !pickedRect) return null;

        const userEl =
          picked.querySelector('[class*="name"],[class*="username"],.user-name') ||
          picked.querySelector('[class*="author"]');
        const contentEl =
          picked.querySelector('[class*="content"],[class*="text"],.comment-content') ||
          picked;

        const id =
          picked.getAttribute('data-id') ||
          picked.getAttribute('data-comment-id') ||
          picked.getAttribute('id') ||
          '';
        const userText = (userEl?.textContent || '').trim();
        const contentText = (contentEl?.textContent || '').trim();

        const keyBase =
          id ||
          (userText ? userText.slice(0, 16) : '') + '|' + contentText.slice(0, 32);
        const key = keyBase || contentText.slice(0, 24) || 'unknown';

        return {
          key,
          top: pickedRect.top,
          bottom: pickedRect.bottom,
          user: userText.slice(0, 24),
          textSample: contentText.slice(0, 50)
        };
      })()`,
    });

    const payload = (result as any).result || (result as any).data?.result || result;
    if (!payload || typeof payload !== 'object') return null;
    if (typeof (payload as any).key !== 'string') return null;
    return {
      key: String((payload as any).key),
      top: Number((payload as any).top ?? 0),
      bottom: Number((payload as any).bottom ?? 0),
      user: typeof (payload as any).user === 'string' ? (payload as any).user : '',
      textSample:
        typeof (payload as any).textSample === 'string' ? (payload as any).textSample : '',
    };
  } catch {
    return null;
  }
}

export async function getScrollContainerInfo(
  controllerUrl: string,
  profile: string,
): Promise<ScrollContainerInfo | null> {
  const result = await controllerAction(controllerUrl, 'browser:execute', {
    profile,
    script: `(() => {
      const root =
        document.querySelector('.comments-el') ||
        document.querySelector('.comment-list') ||
        document.querySelector('.comments-container') ||
        document.querySelector('[class*="comment-section"]');
      if (!root) return null;

      let scrollContainer = null;
      let current = root;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY || '';
        const canScroll =
          (overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'overlay') &&
          current.scrollHeight - current.clientHeight > 12;
        if (canScroll) {
          scrollContainer = current;
          break;
        }
        current = current.parentElement;
      }

      if (!scrollContainer) return null;
      const rect = scrollContainer.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        scrollTop: scrollContainer.scrollTop,
        scrollHeight: scrollContainer.scrollHeight,
        clientHeight: scrollContainer.clientHeight
      };
    })()`,
  }).catch((): null => null);

  const payload = (result as any)?.result || (result as any)?.data?.result || result;
  if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') return null;
  return {
    x: Number(payload.x),
    y: Number(payload.y),
    scrollTop: Number(payload.scrollTop ?? 0),
    scrollHeight: Number(payload.scrollHeight ?? 0),
    clientHeight: Number(payload.clientHeight ?? 0),
  };
}

export async function getScrollContainerState(
  controllerUrl: string,
  profile: string,
): Promise<{ scrollTop: number; scrollHeight: number; clientHeight: number } | null> {
  const info = await getScrollContainerInfo(controllerUrl, profile);
  if (!info) return null;
  return {
    scrollTop: info.scrollTop,
    scrollHeight: info.scrollHeight,
    clientHeight: info.clientHeight,
  };
}

export async function getScrollStats(
  rootSelectors: string[],
  controllerUrl: string,
  profile: string,
): Promise<ScrollStats> {
  const selectors = Array.isArray(rootSelectors)
    ? rootSelectors.filter(Boolean)
    : [];

  try {
    const result = await controllerAction(controllerUrl, 'browser:execute', {
      profile,
      script: `(() => {
        const roots = ${JSON.stringify(selectors)};
        const pickRoot = () => {
          for (const sel of roots) {
            try {
              const el = document.querySelector(sel);
              if (el) return el;
            } catch (_) {}
          }
          return null;
        };

        const isScrollable = (el) => {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY || '';
          const canScroll =
            (overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'overlay') &&
            el.scrollHeight - el.clientHeight > 24;
          return canScroll;
        };

        const root = pickRoot();
        let best = null;
        if (root) {
          let current = root;
          let safetyUp = 0;
          while (current && current !== document.body && safetyUp < 60) {
            safetyUp += 1;
            if (isScrollable(current)) {
              best = current;
              break;
            }
            current = current.parentElement;
          }
        }
        if (!best) {
          if (root) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
            let node = walker.currentNode;
            let safety = 0;
            while (node && safety < 1200) {
              safety += 1;
              if (isScrollable(node)) {
                best = node;
                break;
              }
              node = walker.nextNode();
            }
          }
        }
        if (!best) {
          if (isScrollable(document.documentElement)) best = document.documentElement;
          else if (isScrollable(document.body)) best = document.body;
        }

        if (!best) {
          return {
            found: false,
            scrollTop: 0,
            scrollHeight: 0,
            clientHeight: 0,
            atTop: true,
            atBottom: false,
          };
        }

        const scrollTop = best.scrollTop || 0;
        const scrollHeight = best.scrollHeight || 0;
        const clientHeight = best.clientHeight || 0;
        const atTop = scrollTop <= 2;
        const noNeedScroll = scrollHeight > 0 && clientHeight > 0 && (scrollHeight - clientHeight) <= 24;
        const atBottom = noNeedScroll || (scrollHeight > 0 && clientHeight > 0 && (scrollTop + clientHeight) >= (scrollHeight - 8));

        return { found: true, scrollTop, scrollHeight, clientHeight, atTop, atBottom };
      })()`,
    });
    const payload = (result as any).result || (result as any).data?.result || result || {};
    return {
      found: Boolean(payload?.found),
      scrollTop: Number(payload?.scrollTop ?? 0),
      scrollHeight: Number(payload?.scrollHeight ?? 0),
      clientHeight: Number(payload?.clientHeight ?? 0),
      atTop: Boolean(payload?.atTop),
      atBottom: Boolean(payload?.atBottom),
    };
  } catch {
    return {
      found: false,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      atTop: true,
      atBottom: false,
    };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
