/**
 * openDetailViewport.ts
 *
 * 视口与 DOM 相关的辅助工具：
 * - 视口指标获取
 * - 滚动容器推断
 * - 滚动操作
 * - 元素在视口内的确保（highlight + scroll 循环）
 * - 封面 Rect 计算（by index / by noteId）
 * - 点在封面内验证
 * - Rect 高亮
 * - 视口诊断信息 dump
 */

import type { Rect } from './openDetailTypes.js';

export interface OpenDetailViewportToolsConfig {
  controllerAction: (action: string, payload?: any) => Promise<any>;
  profile: string;
  serviceUrl: string;
}

export interface ViewportMetrics {
  innerHeight: number;
  innerWidth: number;
}

/**
 * 创建 OpenDetail 专用的视口工具集合
 */
export function createOpenDetailViewportTools(config: OpenDetailViewportToolsConfig) {
  const { controllerAction, profile, serviceUrl } = config;

  async function getViewportMetrics(): Promise<ViewportMetrics> {
    try {
      const result = await controllerAction('browser:execute', {
        profile,
        script: '({ innerHeight: window.innerHeight || 0, innerWidth: window.innerWidth || 0 })',
      });
      const payload = result?.result ?? result?.data?.result ?? result;
      return {
        innerHeight: Number(payload?.innerHeight ?? 0),
        innerWidth: Number(payload?.innerWidth ?? 0),
      };
    } catch {
      return { innerHeight: 0, innerWidth: 0 };
    }
  }

  function inferScrollContainerId(itemContainerId: string): string | null {
    if (itemContainerId.includes('xiaohongshu_search.search_result_item')) {
      return 'xiaohongshu_search.search_result_list';
    }
    if (itemContainerId.includes('xiaohongshu_home.feed_item')) {
      return 'xiaohongshu_home.feed_list';
    }
    return null;
  }

  async function scrollTowardVisibility(
    direction: 'up' | 'down',
    amount: number,
    containerId: string,
  ): Promise<boolean> {
    const scrollContainerId = inferScrollContainerId(containerId);
    const scrollAmount = Math.min(800, Math.max(120, Math.floor(Math.abs(amount))));

    // 首选：列表容器滚动（系统滚轮/键盘），避免页面级 JS 滚动
    if (scrollContainerId) {
      try {
        const op = await controllerAction('container:operation', {
          containerId: scrollContainerId,
          operationId: 'scroll',
          sessionId: profile,
          config: { direction, amount: scrollAmount },
        });
        const payload = (op as any)?.data ?? op;
        const ok = Boolean(
          payload?.success ?? (payload as any)?.data?.success ?? (op as any)?.success,
        );
        if (ok) {
          await new Promise((r) => setTimeout(r, 900));
          return true;
        }
      } catch {
        // fall through
      }
    }

    // 兜底：PageUp/PageDown（系统级）
    try {
      await controllerAction('keyboard:press', {
        profileId: profile,
        key: direction === 'up' ? 'PageUp' : 'PageDown',
      });
      await new Promise((r) => setTimeout(r, 900));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 通过 container:operation highlight + rect 提取
   */
  async function highlightByIndex(
    containerId: string,
    index: number,
    duration = 1200,
  ): Promise<Rect | undefined> {
    const highlightResp = await controllerAction('container:operation', {
      containerId,
      operationId: 'highlight',
      sessionId: profile,
      config: { index, duration },
    });
    return rectFromOperationResponse(highlightResp);
  }

  /**
   * 通过 selector highlight + rect 提取
   */
  async function highlightBySelector(
    containerId: string,
    selector: string,
    duration = 1200,
  ): Promise<Rect | undefined> {
    const highlightResp = await controllerAction('container:operation', {
      containerId,
      operationId: 'highlight',
      sessionId: profile,
      config: { selector, index: 0, target: 'self', duration },
    });
    return rectFromOperationResponse(highlightResp);
  }

  /**
   * 确保 selector 对应的元素完全在视口内（通过 highlight + scroll 循环）
   */
  async function ensureSelectorFullyInViewport(
    containerId: string,
    selector: string,
  ): Promise<Rect | undefined> {
    const viewport = await getViewportMetrics();
    const innerHeight = viewport.innerHeight || 0;

    let rect = await highlightBySelector(containerId, selector, 800);
    if (!rect) return undefined;

    if (!innerHeight) return rect;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const top = rect.y;
      const bottom = rect.y + rect.height;
      const fullyVisible =
        rect.width > 0 && rect.height > 0 && top >= 0 && bottom <= innerHeight;

      if (fullyVisible) return rect;

      const direction: 'up' | 'down' = top < 0 ? 'up' : 'down';
      const delta = top < 0 ? Math.abs(top) : Math.max(0, bottom - innerHeight);
      const ok = await scrollTowardVisibility(direction, Math.min(800, delta + 160), containerId);
      if (!ok) break;

      rect = await highlightBySelector(containerId, selector, 800);
      if (!rect) break;
    }

    return rect;
  }

  /**
   * 确保 domIndex 对应的元素完全在视口内
   */
  async function ensureDomIndexFullyInViewport(
    containerId: string,
    index: number,
  ): Promise<Rect | undefined> {
    const viewport = await getViewportMetrics();
    const innerHeight = viewport.innerHeight || 0;

    let rect = await highlightByIndex(containerId, index, 800);
    if (!rect) return undefined;

    if (!innerHeight) return rect;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const top = rect.y;
      const bottom = rect.y + rect.height;
      const fullyVisible =
        rect.width > 0 && rect.height > 0 && top >= 0 && bottom <= innerHeight;

      if (fullyVisible) return rect;

      const direction: 'up' | 'down' = top < 0 ? 'up' : 'down';
      const delta = top < 0 ? Math.abs(top) : Math.max(0, bottom - innerHeight);
      const ok = await scrollTowardVisibility(direction, Math.min(800, delta + 160), containerId);
      if (!ok) break;

      rect = await highlightByIndex(containerId, index, 800);
      if (!rect) break;
    }

    return rect;
  }

  /**
   * 通过 domIndex 计算封面（a.cover）的 Rect
   */
  async function computeCoverRectByIndex(index: number): Promise<Rect | undefined> {
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const cards = Array.from(document.querySelectorAll('.note-item'));
          const card = cards[${index}];
          if (!card) return null;
          const cover = card.querySelector('a.cover');
          if (!cover) return null;
          const media = cover.querySelector('img,video');
          const target = media || cover;
          const r = target.getBoundingClientRect();
          if (!r || !r.width || !r.height) return null;
          const innerH = window.innerHeight || 0;
          const inViewport = innerH ? (r.bottom > 0 && r.top < innerH) : true;
          return { x: r.x, y: r.y, width: r.width, height: r.height, inViewport };
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
      if (
        payload &&
        typeof payload.x === 'number' &&
        typeof payload.y === 'number' &&
        typeof payload.width === 'number' &&
        typeof payload.height === 'number'
      ) {
        return { x: payload.x, y: payload.y, width: payload.width, height: payload.height };
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * 通过 domIndex 计算卡片（.note-item）的 Rect
   * 用于“禁止点击显示不全的 note item”场景：必须确保整个卡片完全在视口安全区内。
   */
  async function computeCardRectByIndex(index: number): Promise<Rect | undefined> {
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const cards = Array.from(document.querySelectorAll('.note-item'));
          const card = cards[${index}];
          if (!card) return null;
          const r = card.getBoundingClientRect();
          if (!r || !r.width || !r.height) return null;
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
      if (
        payload &&
        typeof payload.x === 'number' &&
        typeof payload.y === 'number' &&
        typeof payload.width === 'number' &&
        typeof payload.height === 'number'
      ) {
        return { x: payload.x, y: payload.y, width: payload.width, height: payload.height };
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * 通过 noteId 精确查找封面（a.cover）的 Rect
   */
  async function computeCoverRectByNoteId(noteId: string): Promise<Rect | undefined> {
    const nid = String(noteId || '').trim();
    if (!nid) return undefined;
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const noteId = ${JSON.stringify(nid)};
          const cards = Array.from(document.querySelectorAll('.note-item'));
          for (const card of cards) {
            try {
              const cover = card.querySelector('a.cover');
              if (!cover) continue;
              const href = cover.getAttribute('href') || cover.href || '';
              if (!href || href.indexOf(noteId) === -1) continue;
              const media = cover.querySelector('img,video');
              const target = media || cover;
              const r = target.getBoundingClientRect();
              if (!r || !r.width || !r.height) continue;
              const innerH = window.innerHeight || 0;
              const inViewport = innerH ? (r.bottom > 0 && r.top < innerH) : true;
              return { x: r.x, y: r.y, width: r.width, height: r.height, inViewport };
            } catch (_) {}
          }
          return null;
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
      if (
        payload &&
        typeof payload.x === 'number' &&
        typeof payload.y === 'number' &&
        typeof payload.width === 'number' &&
        typeof payload.height === 'number'
      ) {
        return { x: payload.x, y: payload.y, width: payload.width, height: payload.height };
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * 通过 noteId 精确查找卡片（.note-item）的 Rect
   */
  async function computeCardRectByNoteId(noteId: string): Promise<Rect | undefined> {
    const nid = String(noteId || '').trim();
    if (!nid) return undefined;
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const noteId = ${JSON.stringify(nid)};
          const cards = Array.from(document.querySelectorAll('.note-item'));
          for (const card of cards) {
            try {
              const cover = card.querySelector('a.cover');
              if (!cover) continue;
              const href = cover.getAttribute('href') || cover.href || '';
              if (!href || href.indexOf(noteId) === -1) continue;
              const r = card.getBoundingClientRect();
              if (!r || !r.width || !r.height) continue;
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            } catch (_) {}
          }
          return null;
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
      if (
        payload &&
        typeof payload.x === 'number' &&
        typeof payload.y === 'number' &&
        typeof payload.width === 'number' &&
        typeof payload.height === 'number'
      ) {
        return { x: payload.x, y: payload.y, width: payload.width, height: payload.height };
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * 验证某个坐标点是否在封面（a.cover）内
   */
  async function isPointInsideCover(point: { x: number; y: number }): Promise<boolean> {
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const p = ${JSON.stringify(point)};
          const el = document.elementFromPoint(p.x, p.y);
          if (!el) return false;
          const a = el.closest && el.closest('a.cover');
          if (!a) return false;
          const media = a.querySelector && a.querySelector('img,video');
          const target = media || a;
          const r = target.getBoundingClientRect();
          if (!r || !r.width || !r.height) return false;
          return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
      return Boolean(payload);
    } catch {
      return false;
    }
  }

  /**
   * 在页面上绘制高亮 Rect（用于视觉确认）
   */
  async function highlightRect(rect: Rect, durationMs = 1200, color = '#00ff00') {
    try {
      await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const r = ${JSON.stringify(rect)};
          let overlay = document.getElementById('webauto-click-rect');
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'webauto-click-rect';
            overlay.style.position = 'fixed';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '2147483647';
            document.body.appendChild(overlay);
          }
          overlay.style.left = r.x + 'px';
          overlay.style.top = r.y + 'px';
          overlay.style.width = r.width + 'px';
          overlay.style.height = r.height + 'px';
          overlay.style.border = '3px solid ${color}';
          overlay.style.boxSizing = 'border-box';
          setTimeout(() => overlay && overlay.parentElement && overlay.parentElement.removeChild(overlay), ${durationMs});
          return true;
        })()`,
      });
    } catch {
      // ignore
    }
  }

  /**
   * 诊断：dump 当前视口内所有 .note-item 的 rect / title / href
   */
  async function dumpViewportDiagnostics() {
    try {
      const result = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
          const innerHeight = window.innerHeight || 0;
          const items = Array.from(document.querySelectorAll('.note-item'));
          const summary = items.map((el, idx) => {
            const rect = el.getBoundingClientRect();
            const titleEl = el.querySelector('.note-title, .title, [data-role="note-title"]');
            const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
            let href = '';
            const link = el.querySelector('a[href*="/explore/"], a[href*="/search_result/"]');
            if (link instanceof HTMLAnchorElement) {
              href = link.href || link.getAttribute('href') || '';
            }
            return {
              index: idx,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              title: titleText,
              href,
              inViewport: rect.top >= 0 && rect.top < innerHeight,
            };
          });
          return {
            scrollY,
            innerHeight,
            totalItems: items.length,
            visibleItems: summary.filter(i => i.inViewport).length,
            items: summary.slice(0, 40),
          };
        })()`,
      });
      const diag = result.result || result.data?.result || result;
      console.log('[OpenDetail][diagnostic] viewport summary:', JSON.stringify(diag));
    } catch (e: any) {
      console.warn('[OpenDetail][diagnostic] dump viewport failed:', e.message || String(e));
    }
  }

  return {
    getViewportMetrics,
    inferScrollContainerId,
    scrollTowardVisibility,
    highlightByIndex,
    highlightBySelector,
    ensureSelectorFullyInViewport,
    ensureDomIndexFullyInViewport,
    computeCoverRectByIndex,
    computeCoverRectByNoteId,
    computeCardRectByIndex,
    computeCardRectByNoteId,
    isPointInsideCover,
    highlightRect,
    dumpViewportDiagnostics,
  };
}

/**
 * 从 container:operation 响应中提取 Rect
 */
function rectFromOperationResponse(raw: any): Rect | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const payload = (raw as any)?.data ?? raw;
  const rectData = payload?.rect ?? (payload as any)?.data?.rect;

  if (!rectData || typeof rectData !== 'object') return undefined;

  if (
    typeof rectData.x === 'number' &&
    typeof rectData.y === 'number' &&
    typeof rectData.width === 'number' &&
    typeof rectData.height === 'number'
  ) {
    return { x: rectData.x, y: rectData.y, width: rectData.width, height: rectData.height };
  }

  if (
    typeof rectData.x1 === 'number' &&
    typeof rectData.y1 === 'number' &&
    typeof rectData.x2 === 'number' &&
    typeof rectData.y2 === 'number'
  ) {
    return {
      x: rectData.x1,
      y: rectData.y1,
      width: rectData.x2 - rectData.x1,
      height: rectData.y2 - rectData.y1,
    };
  }

  if (
    typeof rectData.left === 'number' &&
    typeof rectData.top === 'number' &&
    typeof rectData.right === 'number' &&
    typeof rectData.bottom === 'number'
  ) {
    return {
      x: rectData.left,
      y: rectData.top,
      width: rectData.right - rectData.left,
      height: rectData.bottom - rectData.top,
    };
  }

  return undefined;
}
