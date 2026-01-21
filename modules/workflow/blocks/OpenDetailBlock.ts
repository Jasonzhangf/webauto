/**
 * Workflow Block: OpenDetailBlock
 *
 * 打开详情页（通过容器 click 触发模态框）
 */

import { createOpenDetailControllerClient } from './helpers/openDetailController.js';
import { waitForDetail, type OpenDetailWaiterDeps } from './helpers/openDetailWaiter.js';
import { createOpenDetailViewportTools, type OpenDetailViewportToolsConfig } from './helpers/openDetailViewport.js';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OpenDetailInput {
  sessionId: string;
  containerId: string;
  domIndex?: number;
  clickRect?: Rect;
  expectedNoteId?: string;
  expectedHref?: string;
  debugDir?: string;
  serviceUrl?: string;
}

export interface OpenDetailOutput {
  success: boolean;
  detailReady: boolean;
  pageDelta?: {
    before?: { count: number; activeIndex: number; pages: Array<{ index: number; url: string; active?: boolean }> };
    after?: { count: number; activeIndex: number; pages: Array<{ index: number; url: string; active?: boolean }> };
    newPages?: Array<{ index: number; url: string }>;
  };
  entryAnchor?: {
    containerId: string;
    clickedItemRect?: Rect;
    verified?: boolean;
  };
  exitAnchor?: {
    containerId: string;
    detailRect?: Rect;
    verified?: boolean;
  };
  steps?: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    error?: string;
    anchor?: {
      containerId?: string;
      clickedItemRect?: Rect;
      detailRect?: Rect;
      verified?: boolean;
    };
    meta?: Record<string, any>;
  }>;
  anchor?: {
    clickedItemContainerId: string;
    clickedItemRect?: Rect;
    detailContainerId?: string;
    detailRect?: Rect;
    verified?: boolean;
  };
  safeDetailUrl?: string;
  noteId?: string;
  error?: string;
}

/**
 * 打开详情页
 */
export async function execute(input: OpenDetailInput): Promise<OpenDetailOutput> {
  const {
    sessionId,
    containerId,
    domIndex,
    clickRect,
    expectedNoteId,
    expectedHref,
    debugDir,
    serviceUrl = 'http://127.0.0.1:7701',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const steps: NonNullable<OpenDetailOutput['steps']> = [];
  let entryAnchor: OpenDetailOutput['entryAnchor'];
  let exitAnchor: OpenDetailOutput['exitAnchor'];
  let clickedItemRect: Rect | undefined;

  function pushStep(step: NonNullable<OpenDetailOutput['steps']>[number]) {
    steps.push(step);
    try {
      console.log(
        '[OpenDetail][step]',
        JSON.stringify(
          {
            id: step.id,
            status: step.status,
            error: step.error,
            anchor: step.anchor,
            meta: step.meta,
          },
          null,
          2,
        ),
      );
    } catch {
      console.log('[OpenDetail][step]', step.id, step.status);
    }
  }

  // 创建 helper 客户端
  const controllerClient = createOpenDetailControllerClient({ profile, controllerUrl });
  const { controllerAction, getCurrentUrl } = controllerClient;

  const waiterDeps: OpenDetailWaiterDeps = {
    getCurrentUrl,
    controllerAction,
    profile,
    serviceUrl,
  };

  const viewportTools = createOpenDetailViewportTools({
    controllerAction,
    profile,
    serviceUrl,
  });

  const {
    getViewportMetrics,
    computeCoverRectByIndex,
    computeCoverRectByNoteId,
    computeCardRectByIndex,
    computeCardRectByNoteId,
    isPointInsideCover,
    highlightRect,
    dumpViewportDiagnostics,
  } = viewportTools;

  function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  function computeSafeClickPoint(rect: Rect, viewport: { innerWidth?: number; innerHeight?: number }) {
    const viewportW = typeof viewport.innerWidth === 'number' && viewport.innerWidth > 0 ? viewport.innerWidth : 1440;
    const viewportH = typeof viewport.innerHeight === 'number' && viewport.innerHeight > 0 ? viewport.innerHeight : 900;

    const minX = Math.round(rect.x + 12);
    const maxX = Math.round(rect.x + rect.width - 12);
    const minY = Math.round(rect.y + 12);
    const maxY = Math.round(rect.y + rect.height - 12);

    // 目标为封面（a.cover）时，点中心即可；
    // 这里保留“上半区”作为兜底（仅当上游传入的 rect 不是封面 rect 时也尽量降低误点作者区概率）。
    let x = Math.round(rect.x + rect.width / 2);
    let y = Math.round(rect.y + rect.height * 0.12);

    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);

    // 避免点击到顶部固定栏/遮挡层：仅在点位落到顶部栏范围时抬高
    const headerSafeY = 120;
    if (y < headerSafeY) {
      y = clamp(headerSafeY, minY, maxY);
    }

    x = clamp(x, 30, viewportW - 30);
    y = clamp(y, 30, viewportH - 30);
    // 再次确保仍在 rect 内
    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);

    return { x, y };
  }

  async function probeClickTarget(point: { x: number; y: number }, coverRect?: Rect): Promise<{
    inCover: boolean;
    closestHref: string | null;
    isUserProfile: boolean;
    isHashtag: boolean;
    inQueryNoteWrapper: boolean;
    isSearchKeywordLink: boolean;
    tag: string | null;
    className: string | null;
    textSnippet: string | null;
    outOfBounds: boolean;
    overlapsAvatar: boolean;
  }> {
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const p = ${JSON.stringify(point)};
          const coverRect = ${coverRect ? JSON.stringify(coverRect) : 'undefined'};
          const el = document.elementFromPoint(p.x, p.y);
          const tag = el && el.tagName ? String(el.tagName) : null;
          const className = el && el.className ? String(el.className) : null;
          const a = el && el.closest ? el.closest('a') : null;
          const href = a ? (a.getAttribute('href') || a.href || '') : '';
          const inCover = !!(el && el.closest && el.closest('a.cover'));
          const inQueryNoteWrapper = !!(el && el.closest && el.closest('.query-note-wrapper'));
          const isSearchKeywordLink =
            href.includes('/search_result') &&
            (href.includes('keyword=') || href.includes('?keyword=') || href.includes('&keyword='));
          const isUserProfile =
            href.includes('/user/profile') ||
            href.includes('/user/') ||
            href.includes('/profile/') ||
            href.includes('/profile');
          const textSnippet = el && el.textContent ? String(el.textContent).trim().slice(0, 60) : null;
          const isHashtag = !!(el && el.closest && el.closest('a[href*="search_result"][href*="#"], a[href*="/search_result"][href*="#"], a[href*="search_result"][href*="%23"], a[href*="/search_result"][href*="%23"]'));

          // 检查点是否在封面 rect 内
          let outOfBounds = false;
          if (coverRect) {
            outOfBounds = p.x < coverRect.x || p.x > coverRect.x + coverRect.width ||
                          p.y < coverRect.y || p.y > coverRect.y + coverRect.height;
          }

          // 检查是否与用户头像元素重合（通过 class 和 href 双重判定）
          let overlapsAvatar = false;
          if (el) {
            const avatarClass = el.className && (
              el.className.includes('avatar') ||
              el.className.includes('user') ||
              el.className.includes('author')
            );
            const avatarParent = el.closest && el.closest('.avatar, .user-avatar, .author-avatar, [class*="avatar"], [class*="user"]');
            const avatarHref = href.includes('/user/') || href.includes('/profile/');
            overlapsAvatar = Boolean(avatarClass || avatarParent || avatarHref);
          }

          return { inCover, inQueryNoteWrapper, isSearchKeywordLink, href: href || null, isUserProfile, isHashtag, tag, className, textSnippet, outOfBounds, overlapsAvatar };
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res ?? {};
      return {
        inCover: Boolean(payload?.inCover),
        closestHref: typeof payload?.href === 'string' ? payload.href : null,
        isUserProfile: Boolean(payload?.isUserProfile),
        isHashtag: Boolean(payload?.isHashtag),
        inQueryNoteWrapper: Boolean(payload?.inQueryNoteWrapper),
        isSearchKeywordLink: Boolean(payload?.isSearchKeywordLink),
        tag: typeof payload?.tag === 'string' ? payload.tag : null,
        className: typeof payload?.className === 'string' ? payload.className : null,
        textSnippet: typeof payload?.textSnippet === 'string' ? payload.textSnippet : null,
        outOfBounds: Boolean(payload?.outOfBounds),
        overlapsAvatar: Boolean(payload?.overlapsAvatar),
      };
    } catch {
      return {
        inCover: false,
        closestHref: null,
        isUserProfile: false,
        isHashtag: false,
        inQueryNoteWrapper: false,
        isSearchKeywordLink: false,
        tag: null,
        className: null,
        textSnippet: null,
        outOfBounds: true,
        overlapsAvatar: false,
      };
    }
  }

  async function chooseSafeClickPoint(
    rect: Rect,
    viewport: { innerWidth?: number; innerHeight?: number },
  ): Promise<{ x: number; y: number; probe: any }> {
    const viewportW =
      typeof viewport.innerWidth === 'number' && viewport.innerWidth > 0 ? viewport.innerWidth : 1440;
    const viewportH =
      typeof viewport.innerHeight === 'number' && viewport.innerHeight > 0 ? viewport.innerHeight : 900;

    const minX = Math.round(rect.x + 12);
    const maxX = Math.round(rect.x + rect.width - 12);
    const minY = Math.round(rect.y + 12);
    const maxY = Math.round(rect.y + rect.height - 12);

    const headerSafeY = 120;

    function computePointByFraction(fx: number, fy: number): { x: number; y: number } {
      let x = Math.round(rect.x + rect.width * fx);
      let y = Math.round(rect.y + rect.height * fy);

      x = clamp(x, minX, maxX);
      y = clamp(y, minY, maxY);

      if (y < headerSafeY) {
        y = clamp(headerSafeY, minY, maxY);
      }

      x = clamp(x, 30, viewportW - 30);
      y = clamp(y, 30, viewportH - 30);

      x = clamp(x, minX, maxX);
      y = clamp(y, minY, maxY);

      return { x, y };
    }

    const candidates: Array<{ fx: number; fy: number }> = [
      // 搜索结果卡片常见：下半部分是作者/互动区，点太靠下容易误入个人主页
      // 优先点封面上半区（更接近"封面中心"而不是"卡片中心"）
      { fx: 0.5, fy: 0.28 },
      { fx: 0.5, fy: 0.22 },
      { fx: 0.5, fy: 0.32 },
      { fx: 0.55, fy: 0.28 },
      { fx: 0.45, fy: 0.28 },
      // 次选：中心（某些纯封面卡片只有 cover）
      { fx: 0.5, fy: 0.5 },
    ];
    for (const c of candidates) {
      const p0 = computePointByFraction(c.fx, c.fy);
      // 探测时传入封面 rect，检查是否在 rect 内且不与头像重合
      const probe = await probeClickTarget(p0, rect);
      // 严格保护：必须在 rect 内，在 cover 内，且不与头像重合
      if (
        probe.inCover &&
        !probe.isUserProfile &&
        !probe.isHashtag &&
        !probe.inQueryNoteWrapper &&
        !probe.isSearchKeywordLink &&
        !probe.outOfBounds &&
        !probe.overlapsAvatar
      ) {
        return { x: p0.x, y: p0.y, probe };
      }
      // 如果探测到超出封面 rect 或与头像重合，记录日志继续尝试下一个点
      if (probe.outOfBounds || probe.overlapsAvatar) {
        console.log(`[chooseSafeClickPoint] Candidate (${c.fx}, ${c.fy}) rejected: outOfBounds=${probe.outOfBounds}, overlapsAvatar=${probe.overlapsAvatar}`);
      }
    }
    const fallback = computeSafeClickPoint(rect, viewport);
    return { x: fallback.x, y: fallback.y, probe: await probeClickTarget(fallback, rect) };
  }

  async function highlightClickPoint(point: { x: number; y: number }, durationMs = 4000) {
    try {
      await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const p = ${JSON.stringify(point)};
          let dot = document.getElementById('webauto-click-point');
          if (!dot) {
            dot = document.createElement('div');
            dot.id = 'webauto-click-point';
            dot.style.position = 'fixed';
            dot.style.pointerEvents = 'none';
            dot.style.zIndex = '2147483647';
            dot.style.width = '14px';
            dot.style.height = '14px';
            dot.style.borderRadius = '999px';
            dot.style.border = '3px solid #ff0033';
            dot.style.background = 'rgba(255,0,51,0.15)';
            dot.style.boxSizing = 'border-box';
            dot.style.transform = 'translate(-50%, -50%)';
            document.body.appendChild(dot);
          }
          dot.style.left = p.x + 'px';
          dot.style.top = p.y + 'px';
          setTimeout(() => {
            const el = document.getElementById('webauto-click-point');
            if (el && el.parentElement) el.parentElement.removeChild(el);
          }, ${Math.max(500, Math.floor(durationMs))});
          return true;
        })()`,
      });
    } catch {
      // ignore
    }
  }

  function isRectFullyVisible(
    rect: Rect,
    viewport: { innerWidth?: number; innerHeight?: number },
    safe: { top: number; bottom: number; left: number; right: number },
  ): boolean {
    const viewportW = typeof viewport.innerWidth === 'number' && viewport.innerWidth > 0 ? viewport.innerWidth : 0;
    const viewportH = typeof viewport.innerHeight === 'number' && viewport.innerHeight > 0 ? viewport.innerHeight : 0;
    if (!viewportH || !rect || rect.width <= 0 || rect.height <= 0) return false;

    const topOk = rect.y >= safe.top;
    const bottomOk = rect.y + rect.height <= viewportH - safe.bottom;

    if (!viewportW) return topOk && bottomOk;
    const leftOk = rect.x >= safe.left;
    const rightOk = rect.x + rect.width <= viewportW - safe.right;
    return topOk && bottomOk && leftOk && rightOk;
  }

  async function ensureCoverFullyVisible(params: {
    rect: Rect;
    viewport: { innerWidth?: number; innerHeight?: number };
    containerId: string;
    expectedNoteId?: string;
    domIndex?: number;
    maxAttempts?: number;
  }): Promise<Rect | null> {
    const {
      rect: initialRect,
      viewport,
      containerId,
      expectedNoteId,
      domIndex,
      maxAttempts = 10,
    } = params;

    // 安全边距：避免顶部 sticky tab/筛选条、底部悬浮层遮挡
    const SAFE = { top: 180, bottom: 140, left: 24, right: 24 };

    let rect: Rect | null = initialRect;
    for (let i = 0; i < maxAttempts; i += 1) {
      if (!rect) return null;

      const nid = typeof expectedNoteId === 'string' ? expectedNoteId.trim() : '';
      const cardRect =
        nid ? await computeCardRectByNoteId(nid) : typeof domIndex === 'number' ? await computeCardRectByIndex(domIndex) : undefined;
      const coverOk = isRectFullyVisible(rect, viewport, SAFE);
      const cardOk = cardRect ? isRectFullyVisible(cardRect, viewport, SAFE) : true;

      // ✅ 必须“封面 + 整个卡片”都完全可见才允许点击（禁止点击显示不全的 note item）
      if (coverOk && cardOk) return rect;

      const targetRect = !cardOk && cardRect ? cardRect : rect;

      const viewportH =
        typeof viewport.innerHeight === 'number' && viewport.innerHeight > 0 ? viewport.innerHeight : 1100;

      const top = targetRect.y;
      const bottom = targetRect.y + targetRect.height;

      let direction: 'up' | 'down' = 'down';
      let delta = 0;

      if (top < SAFE.top) {
        // rect 太靠上（可能被 sticky overlay 遮挡），向上滚动（让内容下移）
        direction = 'up';
        delta = SAFE.top - top + 160;
      } else if (bottom > viewportH - SAFE.bottom) {
        // rect 太靠下，向下滚动（让内容上移）
        direction = 'down';
        delta = bottom - (viewportH - SAFE.bottom) + 160;
      } else {
        // 理论上不会进入此分支（否则应该 fullyVisible），但兜底微调一下
        direction = 'down';
        delta = 260;
      }

      delta = Math.min(800, Math.max(220, Math.floor(delta)));

      await saveDebugScreenshot('cover-rect-adjust-scroll', {
        attempt: i + 1,
        containerId,
        rect,
        cardRect: cardRect || null,
        coverOk,
        cardOk,
        direction,
        delta,
      });

      await viewportTools.scrollTowardVisibility(direction, delta, containerId).catch(() => false);

      // 滚动后必须重新计算封面 rect（虚拟列表/重排）
      if (nid) {
        const r2 = await computeCoverRectByNoteId(nid);
        rect = r2 || rect;
        continue;
      }
      if (typeof domIndex === 'number') {
        const r2 = await computeCoverRectByIndex(domIndex);
        rect = r2 || rect;
        continue;
      }
    }

    // 超过尝试次数仍无法 fully-visible，返回 null 让上层 fail-fast
    return null;
  }

  function sanitizeFilenamePart(value: string): string {
    return String(value || '')
      .trim()
      .replace(/[\\/:"*?<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  function extractBase64FromScreenshotResponse(raw: any): string | undefined {
    const v =
      raw?.data?.data ??
      raw?.data?.body?.data ??
      raw?.body?.data ??
      raw?.result?.data ??
      raw?.result ??
      raw?.data ??
      raw;
    return typeof v === 'string' && v.length > 10 ? v : undefined;
  }

  async function saveDebugScreenshot(
    kind: string,
    meta: Record<string, any>,
  ): Promise<{ pngPath?: string; jsonPath?: string }> {
    if (!debugDir) return {};
    try {
      await mkdir(debugDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const notePart = sanitizeFilenamePart(expectedNoteId || '');
      const idxPart = Number.isFinite(domIndex as number) ? `idx${domIndex}` : 'idxna';
      const base = `${ts}-${kind}-${idxPart}${notePart ? `-${notePart}` : ''}`;
      const pngPath = path.join(debugDir, `${base}.png`);
      const jsonPath = path.join(debugDir, `${base}.json`);

      // debug 截图：允许更长超时（10s 在某些场景会误触发 AbortSignal timeout）
      const takeShot = async (): Promise<any> => {
        const resp = await fetch(controllerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'browser:screenshot',
            payload: { profileId: profile, fullPage: false },
          }),
          signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(25000) : undefined,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
        const data = await resp.json().catch(() => ({}));
        return data.data || data;
      };

      let shot: any = null;
      let shotError: string | null = null;
      try {
        shot = await takeShot();
      } catch {
        // 再试一次（避免偶发超时导致缺少关键复盘截图）
        try {
          shot = await takeShot();
        } catch (e2: any) {
          shot = null;
          shotError = e2?.message || String(e2);
        }
      }
      const b64 = extractBase64FromScreenshotResponse(shot);
      if (b64) {
        await writeFile(pngPath, Buffer.from(b64, 'base64'));
      }
      await writeFile(
        jsonPath,
        JSON.stringify(
          {
            ts,
            kind,
            sessionId: profile,
            domIndex: Number.isFinite(domIndex as number) ? domIndex : null,
            expectedNoteId: expectedNoteId || null,
            expectedHref: expectedHref || null,
            ...meta,
            pngPath: b64 ? pngPath : null,
            ...(shotError ? { screenshotError: shotError } : {}),
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`[OpenDetail][debug] saved ${kind}: ${pngPath}`);
      return { pngPath: b64 ? pngPath : undefined, jsonPath };
    } catch (e: any) {
      console.warn(`[OpenDetail][debug] save screenshot failed (${kind}): ${e?.message || String(e)}`);
      return {};
    }
  }

  function rectFromOperationRect(raw: any): Rect | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    if (
      typeof raw.x === 'number' &&
      typeof raw.y === 'number' &&
      typeof raw.width === 'number' &&
      typeof raw.height === 'number'
    ) {
      return { x: raw.x, y: raw.y, width: raw.width, height: raw.height };
    }
    if (
      typeof raw.x1 === 'number' &&
      typeof raw.y1 === 'number' &&
      typeof raw.x2 === 'number' &&
      typeof raw.y2 === 'number'
    ) {
      return { x: raw.x1, y: raw.y1, width: raw.x2 - raw.x1, height: raw.y2 - raw.y1 };
    }
    if (
      typeof raw.left === 'number' &&
      typeof raw.top === 'number' &&
      typeof raw.right === 'number' &&
      typeof raw.bottom === 'number'
    ) {
      return { x: raw.left, y: raw.top, width: raw.right - raw.left, height: raw.bottom - raw.top };
    }
    return undefined;
  }

	  try {
	    const { highlightContainer, getContainerRect } = await import('./helpers/anchorVerify.js');

	    const startUrl = await getCurrentUrl();
	    console.log(`[OpenDetail] Start URL: ${startUrl}`);

	    // 0. 点击前：严格要求点击封面区域（避免点到作者/广告）
	    const normalizedExpectedNoteId = typeof expectedNoteId === 'string' ? expectedNoteId.trim() : '';
	    const normalizedExpectedHref = typeof expectedHref === 'string' ? expectedHref.trim() : '';

	    const normalizeHrefForCompare = (raw: string): string => {
	      const href = String(raw || '').trim();
	      if (!href) return '';
	      try {
	        const u = new URL(href, 'https://www.xiaohongshu.com');
	        // xsec_source 在不同上下文下可能缺失/不同，不能作为“点错”的判据
	        u.searchParams.delete('xsec_source');
	        // 参数排序，避免同值不同序导致误判
	        const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
	        const p = new URL('https://www.xiaohongshu.com' + u.pathname);
	        for (const [k, v] of entries) p.searchParams.append(k, v);
	        return `${p.pathname}${p.search || ''}`;
	      } catch {
	        // fallback：仅做最小归一化（去掉 xsec_source）
	        return href.replace(/([?&])xsec_source=[^&]*(&|$)/i, '$1').replace(/[?&]$/, '');
	      }
	    };

    // 0.0 优先：如果上游已经给了视口内 Rect，直接使用（最稳：不依赖 domIndex/selector）
    if (
      clickRect &&
      typeof clickRect.x === 'number' &&
      typeof clickRect.y === 'number' &&
      typeof clickRect.width === 'number' &&
      typeof clickRect.height === 'number' &&
      clickRect.width > 0 &&
      clickRect.height > 0
    ) {
      clickedItemRect = clickRect;
    }

    // 0.2 点击必须发生在封面（a.cover）内
    const coverByNoteId =
      normalizedExpectedNoteId ? await computeCoverRectByNoteId(normalizedExpectedNoteId) : undefined;
    if (coverByNoteId) {
      clickedItemRect = coverByNoteId;
    } else if (!clickedItemRect && typeof domIndex === 'number') {
      const coverByIndex = await computeCoverRectByIndex(domIndex);
      if (coverByIndex) {
        clickedItemRect = coverByIndex;
      }
    }

    if (!clickedItemRect) {
      await saveDebugScreenshot('cover-rect-not-found', {
        url: startUrl,
        containerId,
        domIndex: typeof domIndex === 'number' ? domIndex : null,
        expectedNoteId: normalizedExpectedNoteId || null,
        expectedHref: typeof expectedHref === 'string' ? expectedHref : null,
      });
      pushStep({
        id: 'verify_result_item_anchor',
        status: 'failed',
        anchor: { containerId, clickedItemRect: undefined, verified: false },
        error: 'cover_rect_not_found',
      });
      return {
        success: false,
        detailReady: false,
        entryAnchor: undefined,
        exitAnchor: undefined,
        steps,
        anchor: {
          clickedItemContainerId: containerId,
          clickedItemRect: undefined,
          detailContainerId: undefined,
          detailRect: undefined,
          verified: false,
        },
        error: 'cover_rect_not_found',
      };
    }

    if (clickedItemRect) {
      const viewport = await getViewportMetrics();
      const ensuredCover = await ensureCoverFullyVisible({
        rect: clickedItemRect,
        viewport,
        containerId,
        expectedNoteId: normalizedExpectedNoteId || undefined,
        domIndex: typeof domIndex === 'number' ? domIndex : undefined,
      });
      if (!ensuredCover) {
        await saveDebugScreenshot('cover-rect-not-fully-visible', {
          url: startUrl,
          containerId,
          clickedItemRect,
          viewport,
        });
        pushStep({
          id: 'verify_result_item_anchor',
          status: 'failed',
          anchor: { containerId, clickedItemRect, verified: false },
          error: 'cover_rect_not_fully_visible',
        });
        return {
          success: false,
          detailReady: false,
          entryAnchor: undefined,
          exitAnchor: undefined,
          steps,
          anchor: {
            clickedItemContainerId: containerId,
            clickedItemRect,
            detailContainerId: undefined,
            detailRect: undefined,
            verified: false,
          },
          error: 'cover_rect_not_fully_visible',
        };
      }
      clickedItemRect = ensuredCover;

      // ✅ 每次点击前必须可视化确认：先高亮容器，再高亮封面 Rect
      try {
        if (typeof domIndex === 'number' && Number.isFinite(domIndex)) {
          await controllerAction('container:operation', {
            containerId,
            operationId: 'highlight',
            sessionId: profile,
            config: { index: domIndex, style: '3px solid #00ff00', duration: 1200 },
          });
        } else {
          await controllerAction('container:operation', {
            containerId,
            operationId: 'highlight',
            sessionId: profile,
            config: { style: '3px solid #00ff00', duration: 1200 },
          });
        }
      } catch {
        // ignore highlight failures (debug only)
      }
      try {
        await highlightRect(clickedItemRect, 1200, '#00ff00');
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 650));

      const chosen = await chooseSafeClickPoint(clickedItemRect, viewport);
      const okCover = Boolean(chosen.probe?.inCover) || (await isPointInsideCover({ x: chosen.x, y: chosen.y }));
      const unsafeProfile = Boolean(chosen.probe?.isUserProfile);
      const unsafeHashtag = Boolean(chosen.probe?.isHashtag);
      const unsafeQuery = Boolean(chosen.probe?.inQueryNoteWrapper);
      const unsafeSearchKeywordLink = Boolean(chosen.probe?.isSearchKeywordLink) && !unsafeHashtag;
      const unsafeHashText =
        typeof chosen.probe?.textSnippet === 'string' && chosen.probe.textSnippet.includes('#');
      const outOfBounds = Boolean(chosen.probe?.outOfBounds);
      const overlapsAvatar = Boolean(chosen.probe?.overlapsAvatar);
      if (
        !okCover ||
        unsafeProfile ||
        unsafeHashtag ||
        unsafeQuery ||
        unsafeSearchKeywordLink ||
        unsafeHashText ||
        outOfBounds ||
        overlapsAvatar
      ) {
        await saveDebugScreenshot('click-point-not-in-cover', {
          url: startUrl,
          containerId,
          clickedItemRect,
          probe: { x: chosen.x, y: chosen.y, ...chosen.probe },
        });
        pushStep({
          id: 'verify_result_item_anchor',
          status: 'failed',
          anchor: { containerId, clickedItemRect, verified: false },
          error: outOfBounds
            ? 'click_point_out_of_bounds'
            : overlapsAvatar
              ? 'click_point_overlaps_avatar'
              : !okCover
                ? 'click_point_not_in_cover'
                : unsafeProfile
                  ? 'click_point_hits_user_profile'
                  : unsafeHashtag
                    ? 'click_point_hits_hashtag'
                    : unsafeQuery
                      ? 'click_point_hits_query_note_wrapper'
                      : unsafeSearchKeywordLink
                        ? 'click_point_hits_search_keyword_link'
                        : 'click_point_hits_hash_text',
          meta: { probe: { x: chosen.x, y: chosen.y, ...chosen.probe } },
        });
        return {
          success: false,
          detailReady: false,
          entryAnchor: undefined,
          exitAnchor: undefined,
          steps,
          anchor: {
            clickedItemContainerId: containerId,
            clickedItemRect,
            detailContainerId: undefined,
            detailRect: undefined,
            verified: false,
          },
          error: outOfBounds
            ? 'click_point_out_of_bounds'
            : overlapsAvatar
              ? 'click_point_overlaps_avatar'
              : !okCover
                ? 'click_point_not_in_cover'
                : unsafeProfile
                  ? 'click_point_hits_user_profile'
                  : unsafeHashtag
                    ? 'click_point_hits_hashtag'
                    : unsafeQuery
                      ? 'click_point_hits_query_note_wrapper'
                      : unsafeSearchKeywordLink
                        ? 'click_point_hits_search_keyword_link'
                        : 'click_point_hits_hash_text',
        };
      }

      // 若 probe 到的 href 能解析出 noteId，则必须与 expectedNoteId 严格一致（否则直接判定为“点错卡片”）
      if (normalizedExpectedNoteId && chosen.probe?.closestHref) {
        const href = String(chosen.probe.closestHref || '');
        if (/[#]|%23/i.test(href)) {
          await saveDebugScreenshot('click-point-hashtag-href', {
            url: startUrl,
            containerId,
            clickedItemRect,
            probe: { x: chosen.x, y: chosen.y, ...chosen.probe },
          });
          pushStep({
            id: 'verify_result_item_anchor',
            status: 'failed',
            anchor: { containerId, clickedItemRect, verified: false },
            error: 'click_point_hits_hashtag',
            meta: { href, probe: { x: chosen.x, y: chosen.y, ...chosen.probe } },
          });
          return {
            success: false,
            detailReady: false,
            entryAnchor: undefined,
            exitAnchor: undefined,
            steps,
            anchor: {
              clickedItemContainerId: containerId,
              clickedItemRect,
              detailContainerId: undefined,
              detailRect: undefined,
              verified: false,
            },
            error: 'click_point_hits_hashtag',
          };
        }
      }

      // 若 probe 到的 href 能解析出 noteId，则必须与 expectedNoteId 严格一致（否则直接判定为“点错卡片”）
      if (normalizedExpectedNoteId && chosen.probe?.closestHref) {
        const href = String(chosen.probe.closestHref || '');
        const m = href.match(/\/(?:explore|search_result)\/([0-9a-z]+)/i);
        const probedNoteId = m ? String(m[1] || '') : '';
        if (probedNoteId && probedNoteId !== normalizedExpectedNoteId) {
          await saveDebugScreenshot('click-point-noteid-mismatch', {
            url: startUrl,
            containerId,
            clickedItemRect,
            probe: { x: chosen.x, y: chosen.y, ...chosen.probe },
            expectedNoteId: normalizedExpectedNoteId,
            probedNoteId,
          });
          pushStep({
            id: 'verify_result_item_anchor',
            status: 'failed',
            anchor: { containerId, clickedItemRect, verified: false },
            error: 'click_point_noteid_mismatch',
            meta: { expectedNoteId: normalizedExpectedNoteId, probedNoteId, href },
          });
          return {
            success: false,
            detailReady: false,
            entryAnchor: undefined,
            exitAnchor: undefined,
            steps,
            anchor: {
              clickedItemContainerId: containerId,
              clickedItemRect,
              detailContainerId: undefined,
              detailRect: undefined,
              verified: false,
            },
            error: 'click_point_noteid_mismatch',
          };
        }
      }

	      if (normalizedExpectedHref && chosen.probe?.closestHref) {
	        const href = String(chosen.probe.closestHref || '');
	        // 如果已经验证过 noteId，则允许 href query 差异（例如 xsec_source 的不同/缺失）
	        const m = href.match(/\/(?:explore|search_result)\/([0-9a-z]+)/i);
	        const probedNoteId = m ? String(m[1] || '') : '';
	        if (normalizedExpectedNoteId) {
	          // expectedNoteId 存在但 probe 的 href 不是 note 链接：直接判定为点错（例如点到用户/话题/相关搜索）
	          if (!probedNoteId) {
	            await saveDebugScreenshot('click-point-href-not-note', {
	              url: startUrl,
	              containerId,
	              clickedItemRect,
	              probe: { x: chosen.x, y: chosen.y, ...chosen.probe },
	              expectedNoteId: normalizedExpectedNoteId,
	              expectedHref: normalizedExpectedHref || null,
	              probedHref: href,
	            });
	            pushStep({
	              id: 'verify_result_item_anchor',
	              status: 'failed',
	              anchor: { containerId, clickedItemRect, verified: false },
	              error: 'click_point_href_not_note',
	              meta: { expectedNoteId: normalizedExpectedNoteId, expectedHref: normalizedExpectedHref, probedHref: href },
	            });
	            return {
	              success: false,
	              detailReady: false,
	              entryAnchor: undefined,
	              exitAnchor: undefined,
	              steps,
	              anchor: {
	                clickedItemContainerId: containerId,
	                clickedItemRect,
	                detailContainerId: undefined,
	                detailRect: undefined,
	                verified: false,
	              },
	              error: 'click_point_href_not_note',
	            };
	          }
	        } else if (href && normalizeHrefForCompare(href) !== normalizeHrefForCompare(normalizedExpectedHref)) {
	          await saveDebugScreenshot('click-point-href-mismatch', {
	            url: startUrl,
	            containerId,
	            clickedItemRect,
	            probe: { x: chosen.x, y: chosen.y, ...chosen.probe },
	            expectedHref: normalizedExpectedHref,
	            probedHref: href,
	          });
	          pushStep({
	            id: 'verify_result_item_anchor',
	            status: 'failed',
	            anchor: { containerId, clickedItemRect, verified: false },
	            error: 'click_point_href_mismatch',
	            meta: {
	              expectedHref: normalizedExpectedHref,
	              probedHref: href,
	              expectedNorm: normalizeHrefForCompare(normalizedExpectedHref),
	              probedNorm: normalizeHrefForCompare(href),
	            },
	          });
	          return {
	            success: false,
	            detailReady: false,
	            entryAnchor: undefined,
            exitAnchor: undefined,
            steps,
            anchor: {
              clickedItemContainerId: containerId,
              clickedItemRect,
              detailContainerId: undefined,
              detailRect: undefined,
              verified: false,
            },
	            error: 'click_point_href_mismatch',
	          };
	        }
	      }
	    }

    // 0.1 入口锚点验证
    const viewport = await getViewportMetrics();
    const entryInViewport = Boolean(
      clickedItemRect &&
        clickedItemRect.width > 0 &&
        clickedItemRect.height > 0 &&
        (viewport.innerHeight ? clickedItemRect.y >= 0 && clickedItemRect.y + clickedItemRect.height <= viewport.innerHeight : true),
    );

    if (entryInViewport) {
      entryAnchor = {
        containerId,
        clickedItemRect,
        verified: true,
      };
      console.log('[OpenDetail][entryAnchor]', JSON.stringify(entryAnchor, null, 2));
      pushStep({
        id: 'verify_result_item_anchor',
        status: 'success',
        anchor: {
          containerId,
          clickedItemRect,
          verified: true,
        },
      });
    } else {
      entryAnchor = {
        containerId,
        clickedItemRect,
        verified: false,
      };
      console.warn('[OpenDetail] clickedItemRect missing or invalid, aborting detail open');
      pushStep({
        id: 'verify_result_item_anchor',
        status: 'failed',
        anchor: {
          containerId,
          clickedItemRect,
          verified: false,
        },
        error: 'invalid_or_missing_clickedItemRect',
      });
      return {
        success: false,
        detailReady: false,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          clickedItemContainerId: containerId,
          clickedItemRect,
          detailContainerId: undefined,
          detailRect: undefined,
          verified: false,
        },
        error: 'Result item anchor not ready (offscreen or invalid rect)',
      };
    }

    // 1. 打开详情
    try {
      // ✅ 每次点击前先高亮目标（容器 + 封面 Rect），并等待 1-2 秒便于肉眼确认与截图复盘
      try {
        if (typeof domIndex === 'number' && Number.isFinite(domIndex)) {
          await controllerAction('container:operation', {
            containerId,
            operationId: 'highlight',
            sessionId: profile,
            config: { index: domIndex, style: '3px solid #00ff00', duration: 2200 },
          });
        } else {
          await controllerAction('container:operation', {
            containerId,
            operationId: 'highlight',
            sessionId: profile,
            config: { style: '3px solid #00ff00', duration: 2200 },
          });
        }
      } catch {
        // ignore
      }
      await highlightRect(clickedItemRect, 2200, '#00ff00').catch(() => {});
      await new Promise((r) => setTimeout(r, 900));

      const chosen = await chooseSafeClickPoint(clickedItemRect, viewport);
      const x = chosen.x;
      const y = chosen.y;

      // 记录点击前页面列表，用于诊断“误点打开新 tab”
      let pagesBefore: any = null;
      try {
        const r = await controllerAction('browser:page:list', { profileId: profile });
        pagesBefore = (r as any)?.data ?? r;
      } catch {
        pagesBefore = null;
      }

      await highlightClickPoint({ x, y }, 2600);
      await new Promise((r) => setTimeout(r, 650));
      await saveDebugScreenshot('pre-click', {
        url: startUrl,
        clickedItemRect,
        clickPoint: { x, y },
        clickTarget: chosen.probe,
        pagesBefore,
      });
      await new Promise((r) => setTimeout(r, 280));

      const clickResp = await controllerAction('container:operation', {
        containerId,
        operationId: 'click',
        config: { x, y },
        sessionId: profile,
      });
      const clickOk = Boolean((clickResp as any)?.success ?? (clickResp as any)?.data?.success);
      if (!clickOk) {
        await saveDebugScreenshot('click-failed', { url: startUrl, clickedItemRect, clickPoint: { x, y }, clickResp });
        return {
          success: false,
          detailReady: false,
          pageDelta: undefined,
          entryAnchor,
          exitAnchor: undefined,
          steps,
          anchor: {
            clickedItemContainerId: containerId,
            clickedItemRect,
            detailContainerId: undefined,
            detailRect: undefined,
            verified: false,
          },
          error: 'container_click_failed',
        };
      }

      // 点击后：检查是否意外打开了新 tab（常见于点到用户主页/推荐词）
      let pagesAfter: any = null;
      try {
        const r = await controllerAction('browser:page:list', { profileId: profile });
        pagesAfter = (r as any)?.data ?? r;
      } catch {
        pagesAfter = null;
      }

      type PageInfo = { index: number; url: string; active: boolean };
      type PageList = { count: number; activeIndex: number; pages: PageInfo[] };

      const normalizeList = (raw: any): PageList => {
        const pagesRaw: unknown[] = Array.isArray(raw?.pages)
          ? (raw.pages as unknown[])
          : Array.isArray(raw?.data?.pages)
            ? (raw.data.pages as unknown[])
            : [];
        const activeIndex = Number(raw?.activeIndex ?? raw?.data?.activeIndex ?? 0) || 0;
        const pages: PageInfo[] = pagesRaw
          .map((p): PageInfo => {
            const obj = (p && typeof p === 'object') ? (p as any) : {};
            return {
              index: Number(obj?.index ?? 0),
              url: String(obj?.url ?? ''),
              active: Boolean(obj?.active),
            };
          })
          .filter((p) => Number.isFinite(p.index));
        return { pages, activeIndex, count: pages.length };
      };

      const before = pagesBefore ? normalizeList(pagesBefore) : null;
      const after = pagesAfter ? normalizeList(pagesAfter) : null;
      const beforeUrls = new Set((before?.pages ?? []).map((p) => `${p.index}:${p.url}`));
      const newPages =
        after && before
          ? after.pages
              .filter((p) => !beforeUrls.has(`${p.index}:${p.url}`))
              .map((p) => ({ index: p.index, url: p.url }))
          : [];
      const openedNewTab = before && after ? after.count > before.count : false;

      if (openedNewTab) {
        await saveDebugScreenshot('new-tab-opened', {
          url: startUrl,
          clickedItemRect,
          clickPoint: { x, y },
          clickTarget: chosen.probe,
          pagesBefore: before,
          pagesAfter: after,
          newPages,
        });
        return {
          success: false,
          detailReady: false,
          pageDelta: {
            before: before || undefined,
            after: after || undefined,
            newPages,
          },
          entryAnchor,
          exitAnchor: undefined,
          steps,
          anchor: {
            clickedItemContainerId: containerId,
            clickedItemRect,
            detailContainerId: undefined,
            detailRect: undefined,
            verified: false,
          },
          error: 'unexpected_new_tab_opened',
        };
      }

      pushStep({
        id: 'system_click_detail_item',
        status: 'success',
        anchor: {
          containerId,
          clickedItemRect,
          verified: true,
        },
        meta: { via: 'container:operation click(xy)' },
      });
    } catch (e: any) {
      console.warn(
        '[OpenDetail] system click threw error:',
        e.message || e,
      );
      return {
        success: false,
        detailReady: false,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          clickedItemContainerId: containerId,
          clickedItemRect,
          detailContainerId: undefined,
          detailRect: undefined,
          verified: false,
        },
        error: `System click threw error: ${e.message || String(e)}`,
      };
    }

    await new Promise((r) => setTimeout(r, 3000));

    let midUrl = await getCurrentUrl();
    console.log(`[OpenDetail] Post-click URL: ${midUrl}`);

    // 若误点进入个人页：直接失败（不做任何兜底/重试）
    if (midUrl.includes('/user/profile') && clickedItemRect) {
      console.warn('[OpenDetail] Detected navigation to user profile (misclick), stopping');
      await saveDebugScreenshot('misclick-user-profile', { url: midUrl, clickedItemRect });
      return {
        success: false,
        detailReady: false,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          clickedItemContainerId: containerId,
          clickedItemRect,
          detailContainerId: undefined,
          detailRect: undefined,
          verified: false,
        },
        error: 'clicked_user_profile',
      };
    }

    // 2. 等待详情模态出现
    let detailState = await waitForDetail(waiterDeps);
    let detailReady = detailState.ready;

    if (
      detailReady &&
      normalizedExpectedNoteId &&
      detailState.noteId &&
      detailState.noteId !== normalizedExpectedNoteId
    ) {
      pushStep({
        id: 'wait_detail_dom_ready',
        status: 'failed',
        error: 'opened_unexpected_note',
        anchor: {
          containerId,
          clickedItemRect,
          verified: false,
        },
        meta: {
          expectedNoteId: normalizedExpectedNoteId,
          openedNoteId: detailState.noteId,
          safeDetailUrl: detailState.safeUrl || null,
        },
      });
      return {
        success: false,
        detailReady: false,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          clickedItemContainerId: containerId,
          clickedItemRect,
          detailContainerId: undefined,
          detailRect: undefined,
          verified: false,
        },
        error: `Opened unexpected noteId: expected=${normalizedExpectedNoteId}, got=${detailState.noteId}`,
      };
    }

    if (!detailReady) {
      console.warn(
        '[OpenDetail] detail not ready after system click, dumping viewport diagnostics for analysis',
      );
      await saveDebugScreenshot('detail-not-ready', { url: midUrl, clickedItemRect });
      await dumpViewportDiagnostics();
    }

    pushStep({
      id: 'wait_detail_dom_ready',
      status: detailReady ? 'success' : 'failed',
      anchor: {
        containerId,
        clickedItemRect,
        verified: detailReady,
      },
      meta: {
        safeDetailUrl: detailState.safeUrl || null,
        noteId: detailState.noteId || null,
        url: midUrl,
      },
      error: detailReady ? undefined : 'detail_not_ready',
    });

    // 3. 详情出现后，对 modal_shell 做锚点高亮 + Rect 回环
    let detailContainerId: string | undefined;
    let detailRect: Rect | undefined;
    let verified = false;

    if (detailReady) {
      try {
        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');

        const candidateIds = ['xiaohongshu_detail.modal_shell', 'xiaohongshu_detail'];

        for (const cid of candidateIds) {
          const anchor = await verifyAnchorByContainerId(
            cid,
            profile,
            serviceUrl,
            '3px solid #ff4444',
            2000,
          );
          if (!anchor.found || !anchor.rect) {
            continue;
          }

          detailContainerId = cid;
          detailRect = anchor.rect as Rect;
          console.log(`[OpenDetail] Detail container rect: ${JSON.stringify(detailRect)}`);

          verified =
            detailRect.width > 400 &&
            detailRect.height > 400 &&
            detailRect.y < 200;
          break;
        }

        if (!detailContainerId) {
          console.warn('[OpenDetail] Detail anchor verify failed: no modal_shell/detail container visible');
        }
      } catch (e: any) {
        console.warn(`[OpenDetail] Detail anchor verify error: ${e.message}`);
      }
    }

    if (detailContainerId && detailRect) {
      exitAnchor = {
        containerId: detailContainerId,
        detailRect,
        verified,
      };
      console.log('[OpenDetail][exitAnchor]', JSON.stringify(exitAnchor, null, 2));
      pushStep({
        id: 'verify_detail_anchor',
        status: verified ? 'success' : 'success',
        anchor: {
          containerId: detailContainerId,
          detailRect,
          verified,
        },
        meta: {
          safeDetailUrl: detailState.safeUrl || null,
          noteId: detailState.noteId || null,
        },
      });
    } else {
      pushStep({
        id: 'verify_detail_anchor',
        status: 'failed',
        anchor: detailContainerId
          ? {
              containerId: detailContainerId,
              detailRect,
              verified: false,
            }
          : undefined,
        error: 'detail_anchor_not_found',
      });
    }

    return {
      success: true,
      detailReady,
      entryAnchor,
      exitAnchor,
      steps,
      safeDetailUrl: detailState.safeUrl,
      noteId: detailState.noteId,
      anchor: {
        clickedItemContainerId: containerId,
        clickedItemRect,
        detailContainerId,
        detailRect,
        verified
      }
    };
  } catch (error: any) {
    return {
      success: false,
      detailReady: false,
      error: `OpenDetail failed: ${error.message}`
    };
  }
}
