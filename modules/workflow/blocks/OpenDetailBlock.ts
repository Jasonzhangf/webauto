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

  async function probeClickTarget(point: { x: number; y: number }): Promise<{
    inCover: boolean;
    closestHref: string | null;
    isUserProfile: boolean;
    isHashtag: boolean;
    inQueryNoteWrapper: boolean;
    isSearchKeywordLink: boolean;
    tag: string | null;
    className: string | null;
    textSnippet: string | null;
  }> {
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const p = ${JSON.stringify(point)};
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
          const isUserProfile = href.includes('/user/profile') || (href.includes('/user/') && href.includes('profile'));
          const textSnippet = el && el.textContent ? String(el.textContent).trim().slice(0, 60) : null;
          const isHashtag = !!(el && el.closest && el.closest('a[href*="search_result"][href*="#"], a[href*="/search_result"][href*="#"], a[href*="search_result"][href*="%23"], a[href*="/search_result"][href*="%23"]'));
          return { inCover, inQueryNoteWrapper, isSearchKeywordLink, href: href || null, isUserProfile, isHashtag, tag, className, textSnippet };
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
      // 首选：中心点
      { fx: 0.5, fy: 0.5 },
      { fx: 0.5, fy: 0.12 },
      { fx: 0.5, fy: 0.08 },
      { fx: 0.55, fy: 0.12 },
      { fx: 0.45, fy: 0.12 },
      { fx: 0.5, fy: 0.16 },
    ];
    for (const c of candidates) {
      const p0 = computePointByFraction(c.fx, c.fy);
      // computeSafeClickPoint 已经做了 clamp；这里直接用其返回值，再做一次 cover + profile 判定
      const probe = await probeClickTarget(p0);
      if (probe.inCover && !probe.isUserProfile && !probe.isHashtag) {
        return { x: p0.x, y: p0.y, probe };
      }
    }
    const fallback = computeSafeClickPoint(rect, viewport);
    return { x: fallback.x, y: fallback.y, probe: await probeClickTarget(fallback) };
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
      if (rect && isRectFullyVisible(rect, viewport, SAFE)) return rect;

      if (!rect) return null;

      const viewportH =
        typeof viewport.innerHeight === 'number' && viewport.innerHeight > 0 ? viewport.innerHeight : 1100;

      const top = rect.y;
      const bottom = rect.y + rect.height;

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
        direction,
        delta,
      });

      await viewportTools.scrollTowardVisibility(direction, delta, containerId).catch(() => false);

      // 滚动后必须重新计算封面 rect（虚拟列表/重排）
      const nid = typeof expectedNoteId === 'string' ? expectedNoteId.trim() : '';
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
      try {
        shot = await takeShot();
      } catch {
        // 再试一次（避免偶发超时导致缺少关键复盘截图）
        shot = await takeShot();
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

      const chosen = await chooseSafeClickPoint(clickedItemRect, viewport);
      const okCover = Boolean(chosen.probe?.inCover) || (await isPointInsideCover({ x: chosen.x, y: chosen.y }));
      const unsafeProfile = Boolean(chosen.probe?.isUserProfile);
      const unsafeHashtag = Boolean(chosen.probe?.isHashtag);
      const unsafeQuery = Boolean(chosen.probe?.inQueryNoteWrapper);
      const unsafeSearchKeywordLink = Boolean(chosen.probe?.isSearchKeywordLink) && !unsafeHashtag;
      const unsafeHashText =
        typeof chosen.probe?.textSnippet === 'string' && chosen.probe.textSnippet.includes('#');
      if (
        !okCover ||
        unsafeProfile ||
        unsafeHashtag ||
        unsafeQuery ||
        unsafeSearchKeywordLink ||
        unsafeHashText
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
          error: !okCover
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
          error: !okCover
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
        if (href && href !== normalizedExpectedHref) {
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
            meta: { expectedHref: normalizedExpectedHref, probedHref: href },
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
      await highlightRect(clickedItemRect, 1000, '#00ccff').catch(() => {});
      // 操作之间要等待：给高亮与页面布局一点稳定时间（避免误点 overlay）
      await new Promise((r) => setTimeout(r, 450));
      const chosen = await chooseSafeClickPoint(clickedItemRect, viewport);
      const x = chosen.x;
      const y = chosen.y;
      await saveDebugScreenshot('pre-click', {
        url: startUrl,
        clickedItemRect,
        clickPoint: { x, y },
        clickTarget: chosen.probe,
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
