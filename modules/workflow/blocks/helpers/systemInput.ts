/**
 * System Input Helper (browser-service)
 *
 * 统一封装系统级鼠标/键盘/滚轮操作，避免在各 Block 内重复实现。
 * 注意：这里只做"系统事件发送"，不做任何 DOM click/scroll 等 JS 行为。
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

// 调试截图保存目录
const DEBUG_SCREENSHOT_DIR = path.join(os.homedir(), '.webauto', 'logs', 'debug-screenshots');
const DEFAULT_CONTROLLER_URL = process.env.WEBAUTO_CONTROLLER_URL || 'http://127.0.0.1:7701/v1/controller/action';

/**
 * 保存调试截图
 */
async function saveDebugScreenshot(
  kind: string,
  sessionId: string,
  meta: Record<string, any> = {},
): Promise<{ pngPath?: string; jsonPath?: string }> {
  try {
    await fs.mkdir(DEBUG_SCREENSHOT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${ts}-${kind}-${sessionId}`;
    const pngPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.png`);
    const jsonPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.json`);

    const controllerUrl = DEFAULT_CONTROLLER_URL;

    // 截图
    async function takeShot(): Promise<any> {
      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:screenshot',
          payload: { profileId: sessionId, fullPage: false },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json().catch(() => ({}));
      return data.data || data;
    }

    let shot: any = null;
    try {
      shot = await takeShot();
    } catch {
      try {
        shot = await takeShot();
      } catch {
        shot = null;
      }
    }

    // 提取 base64
    const b64 =
      shot?.data?.data ??
      shot?.data?.body?.data ??
      shot?.body?.data ??
      shot?.result?.data ??
      shot?.result ??
      shot?.data ??
      shot;
    if (typeof b64 === 'string' && b64.length > 10) {
      await fs.writeFile(pngPath, Buffer.from(b64, 'base64'));
    }

    // 保存元数据
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ ts, kind, sessionId, ...meta, pngPath: b64 ? pngPath : null }, null, 2),
      'utf-8',
    );

    console.log(`[systemInput][debug] saved ${kind}: ${pngPath}`);
    return { pngPath: b64 ? pngPath : undefined, jsonPath };
  } catch {
    return {};
  }
}

async function controllerAction(action: string, payload: any): Promise<any> {
  const response = await fetch(DEFAULT_CONTROLLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(12000) : undefined,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json().catch(() => ({}));
  return data.data || data;
}

async function probePoint(profileId: string, x: number, y: number): Promise<{
  tag: string | null;
  className: string | null;
  textSnippet: string | null;
  href: string | null;
  isCaptcha: boolean;
  isMediaViewerOpen: boolean;
  isImageLike: boolean;
  isCover: boolean;
}> {
  try {
    const res = await controllerAction('browser:execute', {
      profile: profileId,
      script: `(() => {
        const x = ${JSON.stringify(x)};
        const y = ${JSON.stringify(y)};
        const el = document.elementFromPoint(x, y);
        const tag = el && el.tagName ? String(el.tagName) : null;
        const className = el && el.className ? String(el.className) : null;
        const textSnippet = el && el.textContent ? String(el.textContent).trim().slice(0, 80) : null;
        const linkEl = el && el.closest ? el.closest('a[href]') : null;
        const href = linkEl ? (linkEl.getAttribute('href') || linkEl.href || '') : '';

        const modal = document.querySelector('.r-captcha-modal, .captcha-modal-content');
        const modalText = modal ? (modal.textContent || '') : '';
        const isCaptcha = Boolean(modal) || modalText.includes('请通过验证') || modalText.includes('扫码验证');

        // 图片查看器/媒体预览层：出现时禁止继续点击（开发阶段不做兜底纠错）
        const dialog = document.querySelector('[aria-modal=\"true\"], [role=\"dialog\"][aria-modal=\"true\"], [role=\"dialog\"]');
        const hasBigImage = Array.from(document.querySelectorAll('img')).some((img) => {
          try {
            const r = img.getBoundingClientRect();
            return r && r.width > (window.innerWidth || 0) * 0.55 && r.height > (window.innerHeight || 0) * 0.55;
          } catch {
            return false;
          }
        });
        const mediaOverlay =
          document.querySelector('.media-viewer, .image-viewer, .photo-viewer, .preview-modal, .viewer-modal') ||
          document.querySelector('[class*=\"viewer\"][class*=\"image\"], [class*=\"viewer\"][class*=\"photo\"], [class*=\"preview\"][class*=\"image\"], [class*=\"preview\"][class*=\"photo\"]');
        const isMediaViewerOpen = Boolean(mediaOverlay) || (Boolean(dialog) && hasBigImage);

        const isImageTag = tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS';
        const imageAncestor = el && el.closest ? el.closest('img,video,canvas') : null;
        const isImageLike = Boolean(isImageTag || imageAncestor);

        const cover = el && el.closest ? el.closest('a.cover') : null;
        const isCover = Boolean(cover);

        return { tag, className, textSnippet, href: href || null, isCaptcha, isMediaViewerOpen, isImageLike, isCover };
      })()`,
    });
    const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
    return {
      tag: typeof payload?.tag === 'string' ? payload.tag : null,
      className: typeof payload?.className === 'string' ? payload.className : null,
      textSnippet: typeof payload?.textSnippet === 'string' ? payload.textSnippet : null,
      href: typeof payload?.href === 'string' ? payload.href : null,
      isCaptcha: Boolean(payload?.isCaptcha),
      isMediaViewerOpen: Boolean(payload?.isMediaViewerOpen),
      isImageLike: Boolean(payload?.isImageLike),
      isCover: Boolean(payload?.isCover),
    };
  } catch {
    return {
      tag: null,
      className: null,
      textSnippet: null,
      href: null,
      isCaptcha: false,
      isMediaViewerOpen: false,
      isImageLike: false,
      isCover: false,
    };
  }
}

async function isCaptchaOverlayVisible(profileId: string): Promise<boolean> {
  try {
    const res = await controllerAction('browser:execute', {
      profile: profileId,
      script: `(() => {
        const modal =
          document.querySelector('.r-captcha-modal') ||
          document.querySelector('.captcha-modal-content') ||
          document.querySelector('[class*="captcha-modal"]') ||
          document.querySelector('[class*="captcha"][class*="modal"]');
        const title =
          document.querySelector('.captcha-modal-title') ||
          document.querySelector('.captcha-modal__header .text-h6-bold') ||
          null;
        const modalText = modal ? (modal.textContent || '') : '';
        const titleText = title ? (title.textContent || '') : '';
        return (
          Boolean(modal) ||
          titleText.includes('请通过验证') ||
          modalText.includes('请通过验证') ||
          modalText.includes('扫码验证') ||
          modalText.includes('二维码') ||
          modalText.includes('问题反馈')
        );
      })()`,
    });
    const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
    return Boolean(payload);
  } catch {
    return false;
  }
}

export async function assertNoCaptcha(profileId: string, context?: string): Promise<void> {
  const visible = await isCaptchaOverlayVisible(profileId);
  if (!visible) return;
  await saveDebugScreenshot(`captcha_detected_${context || 'system'}`, profileId, { context });
  throw new Error(`captcha_modal_detected (context=${context || 'system'})`);
}

function shouldGuardAgainstImageClick(context?: string): boolean {
  const c = String(context || '').trim();
  if (!c) return false;
  // 详情页/评论相关的坐标点击：禁止落在图片/视频上（避免打开图片查看器触发风控）
  return (
    c.includes('scroll') ||
    c.includes('comment') ||
    c.includes('reply') ||
    c.includes('select_latest_tab')
  );
}

function shouldStopOnMediaViewer(context?: string): boolean {
  const c = String(context || '').trim();
  if (!c) return false;
  // 开发阶段：评论/滚动相关任何点击遇到媒体查看器，直接停
  return c.includes('scroll') || c.includes('comment') || c.includes('reply');
}

function isDangerousHrefInDetail(href: string | null): boolean {
  const h = typeof href === 'string' ? href : '';
  if (!h) return false;
  // 在详情/评论区域，点击到链接通常意味着误点（头像/话题/推荐等）
  return (
    h.includes('/user/') ||
    h.includes('/user/profile') ||
    h.includes('/profile') ||
    h.includes('/search_result') ||
    h.startsWith('http://') ||
    h.startsWith('https://')
  );
}

async function highlightClickPoint(profileId: string, x: number, y: number, color = '#ff3b30', durationMs = 900) {
  try {
    const size = 18;
    await controllerAction('browser:execute', {
      profile: profileId,
      script: `(() => {
        const p = { x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)} };
        const size = ${JSON.stringify(size)};
        let el = document.getElementById('webauto-click-point');
        if (!el) {
          el = document.createElement('div');
          el.id = 'webauto-click-point';
          el.style.position = 'fixed';
          el.style.pointerEvents = 'none';
          el.style.zIndex = '2147483647';
          el.style.borderRadius = '50%';
          el.style.boxSizing = 'border-box';
          document.body.appendChild(el);
        }
        el.style.left = (p.x - size / 2) + 'px';
        el.style.top = (p.y - size / 2) + 'px';
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        el.style.border = '3px solid ${color}';
        el.style.background = 'rgba(255, 59, 48, 0.08)';
        setTimeout(() => {
          try { el && el.parentElement && el.parentElement.removeChild(el); } catch {}
        }, ${durationMs});
        return true;
      })()`,
    });
  } catch {
    // ignore
  }
}

async function highlightTargetRectAtPoint(options: {
  profileId: string;
  x: number;
  y: number;
  context?: string;
  color?: string;
  durationMs?: number;
}): Promise<{ rect?: { x: number; y: number; width: number; height: number }; tag?: string | null } | null> {
  const { profileId, x, y, context, color = '#ff3b30', durationMs = 1200 } = options;
  try {
    const res = await controllerAction('browser:execute', {
      profile: profileId,
      script: `(() => {
        const p = { x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)} };
        const context = ${JSON.stringify(String(context || ''))};
        const el = document.elementFromPoint(p.x, p.y);
        if (!el || !(el instanceof HTMLElement)) return null;

        const tag = el.tagName ? String(el.tagName) : null;
        // 优先高亮“可点击目标”本身（展开回复/更多评论等），避免只画一个点看不出点了啥
        let target = el;
        if (context.includes('reply') || context.includes('expand') || context.includes('comment')) {
          const t =
            el.closest('button') ||
            el.closest('[role=\"button\"]') ||
            el.closest('.show-more') ||
            el.closest('[class*=\"show-more\"]') ||
            el.closest('[class*=\"expand\"]') ||
            el.closest('[class*=\"more\"]');
          if (t && t instanceof HTMLElement) target = t;
        }
        const r = target.getBoundingClientRect();
        if (!r || !r.width || !r.height) return null;

        let overlay = document.getElementById('webauto-click-target-rect');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'webauto-click-target-rect';
          overlay.style.position = 'fixed';
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = '2147483647';
          overlay.style.boxSizing = 'border-box';
          overlay.style.borderRadius = '6px';
          document.body.appendChild(overlay);
        }
        overlay.style.left = r.left + 'px';
        overlay.style.top = r.top + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
        overlay.style.border = '3px solid ${color}';
        overlay.style.background = 'rgba(255, 59, 48, 0.05)';
        setTimeout(() => {
          try { overlay && overlay.parentElement && overlay.parentElement.removeChild(overlay); } catch {}
        }, ${durationMs});

        return { tag, rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
      })()`,
    });
    const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
    if (!payload) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface FocusPoint {
  x: number;
  y: number;
}

export async function browserServiceCommand(
  browserServiceUrl: string,
  action: string,
  args: Record<string, any>,
  timeoutMs = 8000,
): Promise<any> {
  const response = await fetch(`${browserServiceUrl}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: (AbortSignal as any).timeout
      ? (AbortSignal as any).timeout(timeoutMs)
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`browser-service HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json().catch(() => ({} as any));
  if (data?.ok === false || data?.success === false) {
    throw new Error(data?.error || 'browser-service command failed');
  }
  return data?.body || data?.data || data;
}

export async function systemHoverAt(
  profileId: string,
  x: number,
  y: number,
  browserServiceUrl = 'http://127.0.0.1:7704',
): Promise<void> {
  await browserServiceCommand(
    browserServiceUrl,
    'mouse:move',
    { profileId, x: Math.floor(x), y: Math.floor(y), steps: 3 },
    8000,
  ).catch(() => {});
}

export async function systemClickAt(
  profileId: string,
  x: number,
  y: number,
  browserServiceUrl = 'http://127.0.0.1:7704',
  context?: string,
): Promise<void> {
  const probe = await probePoint(profileId, x, y);

  // 风控/验证码：出现就立即停下（开发阶段不做重试/兜底），保留证据便于人工处理
  if (probe.isCaptcha) {
    await saveDebugScreenshot(`captcha_detected_${context || 'system'}`, profileId, { x, y, context, probe });
    throw new Error(`captcha_modal_detected (context=${context || 'system'})`);
  }

  // 媒体查看器/预览层：出现就立即停下（避免乱点）
  if (shouldStopOnMediaViewer(context) && probe.isMediaViewerOpen) {
    await saveDebugScreenshot(`media_viewer_open_${context || 'system'}`, profileId, { x, y, context, probe });
    throw new Error(`media_viewer_open (context=${context || 'system'})`);
  }

  // 详情页/评论相关点击：禁止点到链接（通常是头像/话题/推荐/外链）
  if (shouldGuardAgainstImageClick(context) && isDangerousHrefInDetail(probe.href)) {
    await saveDebugScreenshot(`unsafe_click_href_${context || 'system'}`, profileId, { x, y, context, probe });
    throw new Error(`unsafe_click_href_in_detail (context=${context || 'system'})`);
  }

  // 详情页/评论滚动相关点击：禁止点到图片/视频（会打开查看器/新层）
  if (shouldGuardAgainstImageClick(context) && probe.isImageLike) {
    await saveDebugScreenshot(`unsafe_click_image_${context || 'system'}`, profileId, { x, y, context, probe });
    throw new Error(`unsafe_click_image_in_detail (context=${context || 'system'})`);
  }

  // 高亮后再截图（便于复盘点位是否正确）
  const hi = await highlightTargetRectAtPoint({
    profileId,
    x,
    y,
    context,
    color: '#ff3b30',
    durationMs: 1100,
  });
  // 同时保留点位小圆点，便于确认“点到的确切坐标”
  await highlightClickPoint(profileId, x, y, '#ff3b30', 1100);
  await new Promise((r) => setTimeout(r, 180));
  await saveDebugScreenshot(`before_click_${context || 'system'}`, profileId, {
    x,
    y,
    context,
    probe,
    highlightRect: hi?.rect ?? null,
    highlightTag: hi?.tag ?? null,
  });

  await systemHoverAt(profileId, x, y, browserServiceUrl);
  await new Promise((r) => setTimeout(r, 80));
  await browserServiceCommand(
    browserServiceUrl,
    'mouse:click',
    {
      profileId,
      x: Math.floor(x),
      y: Math.floor(y),
      clicks: 1,
      delay: 40 + Math.floor(Math.random() * 60),
    },
    8000,
  );
}

export async function systemMouseWheel(options: {
  profileId: string;
  deltaY: number;
  focusPoint?: FocusPoint | null;
  browserServiceUrl?: string;
  browserWsUrl?: string;
  context?: string;
}): Promise<void> {
  const {
    profileId,
    deltaY,
    focusPoint,
    browserServiceUrl = 'http://127.0.0.1:7704',
    browserWsUrl = process.env.WEBAUTO_BROWSER_WS_URL || 'ws://127.0.0.1:8765',
    context,
  } = options;

  // 风控/验证码：出现就立即停下（开发阶段不做重试/兜底），保留证据便于人工处理
  if (await isCaptchaOverlayVisible(profileId)) {
    await saveDebugScreenshot(`captcha_detected_wheel_${context || 'system'}`, profileId, { deltaY, focusPoint, context });
    throw new Error(`captcha_modal_detected (context=${context || 'system'})`);
  }

  try {
    if (focusPoint) {
      await systemHoverAt(profileId, focusPoint.x, focusPoint.y, browserServiceUrl);
      await new Promise((r) => setTimeout(r, 60));
    }
    await browserServiceCommand(
      browserServiceUrl,
      'mouse:wheel',
      { profileId, deltaX: 0, deltaY },
      8000,
    );
    return;
  } catch (err: any) {
    console.warn(
      '[WarmupComments] browser-service mouse:wheel failed, fallback to ws:',
      err?.message || err,
    );
  }

  await browserServiceWsScroll({
    profileId,
    deltaY,
    browserWsUrl,
    coordinates: focusPoint ? { x: focusPoint.x, y: focusPoint.y } : null,
  });
}

async function browserServiceWsScroll(options: {
  profileId: string;
  deltaY: number;
  browserWsUrl: string;
  coordinates: { x: number; y: number } | null;
}): Promise<void> {
  const { profileId, deltaY, browserWsUrl, coordinates } = options;
  const { default: WebSocket } = await import('ws');
  const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error('browser-service ws timeout'));
    }, 15000);

    const ws = new WebSocket(browserWsUrl);

    const cleanup = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
    };

    ws.on('open', () => {
      try {
        ws.send(
          JSON.stringify({
            type: 'command',
            request_id: requestId,
            session_id: profileId,
            data: {
              command_type: 'user_action',
              action: 'operation',
              parameters: {
                operation_type: 'scroll',
                ...(coordinates ? { target: { coordinates } } : {}),
                deltaY,
              },
            },
          }),
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    ws.on('message', (buf: any) => {
      try {
        const msg = JSON.parse(String(buf || ''));
        if (msg?.type !== 'response') return;
        if (String(msg?.request_id || '') !== requestId) return;
        const payload = msg?.data || {};
        if (payload?.success === false) {
          cleanup();
          reject(new Error(payload?.error || 'browser-service ws scroll failed'));
          return;
        }
        cleanup();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    ws.on('error', (err: any) => {
      cleanup();
      reject(err);
    });
  });
}
