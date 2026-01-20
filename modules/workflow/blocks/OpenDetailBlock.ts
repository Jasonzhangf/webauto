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

    // 关键：避免点到作者/头像等交互区（通常在卡片下方区域）
    // 优先点封面上方区域
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
          const isUserProfile = href.includes('/user/profile') || href.includes('/user/') && href.includes('profile');
          const textSnippet = el && el.textContent ? String(el.textContent).trim().slice(0, 60) : null;
          return { inCover, href: href || null, isUserProfile, tag, className, textSnippet };
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res ?? {};
      return {
        inCover: Boolean(payload?.inCover),
        closestHref: typeof payload?.href === 'string' ? payload.href : null,
        isUserProfile: Boolean(payload?.isUserProfile),
        tag: typeof payload?.tag === 'string' ? payload.tag : null,
        className: typeof payload?.className === 'string' ? payload.className : null,
        textSnippet: typeof payload?.textSnippet === 'string' ? payload.textSnippet : null,
      };
    } catch {
      return {
        inCover: false,
        closestHref: null,
        isUserProfile: false,
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
      if (probe.inCover && !probe.isUserProfile) {
        return { x: p0.x, y: p0.y, probe };
      }
    }
    const fallback = computeSafeClickPoint(rect, viewport);
    return { x: fallback.x, y: fallback.y, probe: await probeClickTarget(fallback) };
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

      const shot = await controllerAction('browser:screenshot', {
        profileId: profile,
        fullPage: false,
      });
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
      // 0.x 视口安全：避免卡片被顶部 sticky tab/筛选条遮挡（y 太靠上时 elementFromPoint 会命中 tab bar）
      // 处理方式：不直接“硬点位”，而是先系统滚动把封面整体下移，再重新计算封面 rect。
      const OVERLAY_SAFE_TOP = 180;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!clickedItemRect || typeof clickedItemRect.y !== 'number') break;
        if (clickedItemRect.y >= OVERLAY_SAFE_TOP) break;

        const delta = Math.min(800, Math.max(220, Math.floor(OVERLAY_SAFE_TOP - clickedItemRect.y + 160)));
        console.warn(
          `[OpenDetail] cover rect y=${clickedItemRect.y} too close to top overlay, scroll down delta=${delta} (attempt=${attempt + 1})`,
        );
        await saveDebugScreenshot('cover-rect-under-overlay', {
          url: startUrl,
          containerId,
          clickedItemRect,
          attempt: attempt + 1,
          delta,
        });

        await viewportTools
          .scrollTowardVisibility('down', delta, containerId)
          .catch(() => false);

        const coverByNoteId2 =
          normalizedExpectedNoteId ? await computeCoverRectByNoteId(normalizedExpectedNoteId) : undefined;
        if (coverByNoteId2) {
          clickedItemRect = coverByNoteId2;
          continue;
        }
        if (typeof domIndex === 'number') {
          const coverByIndex2 = await computeCoverRectByIndex(domIndex);
          if (coverByIndex2) {
            clickedItemRect = coverByIndex2;
            continue;
          }
        }
        // 无法重新计算则退出循环，由后续 probe 判定失败并落盘截图
        break;
      }

      const viewport = await getViewportMetrics();
      const chosen = await chooseSafeClickPoint(clickedItemRect, viewport);
      const okCover = Boolean(chosen.probe?.inCover) || (await isPointInsideCover({ x: chosen.x, y: chosen.y }));
      const unsafeProfile = Boolean(chosen.probe?.isUserProfile);
      if (!okCover || unsafeProfile) {
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
          error: !okCover ? 'click_point_not_in_cover' : 'click_point_hits_user_profile',
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
          error: !okCover ? 'click_point_not_in_cover' : 'click_point_hits_user_profile',
        };
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
      const chosen = await chooseSafeClickPoint(clickedItemRect, viewport);
      const x = chosen.x;
      const y = chosen.y;
      await saveDebugScreenshot('pre-click', {
        url: startUrl,
        clickedItemRect,
        clickPoint: { x, y },
        clickTarget: chosen.probe,
      });

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
