/**
 * System Input Helper (browser-service)
 *
 * 缁熶竴灏佽绯荤粺绾ч紶鏍?閿洏/婊氳疆鎿嶄綔锛岄伩鍏嶅湪鍚?Block 鍐呴噸澶嶅疄鐜般€?
 * 娉ㄦ剰锛氳繖閲屽彧鍋?绯荤粺浜嬩欢鍙戦€?锛屼笉鍋氫换浣?DOM click/scroll 绛?JS 琛屼负銆?
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { isDebugArtifactsEnabled } from './debugArtifacts.js';
import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
  logError,
  logOperation,
} from './operationLogger.js';

// 璋冭瘯鎴浘淇濆瓨鐩綍
function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && home.trim()) return path.join(home, '.webauto', 'download');
  return path.join(os.homedir(), '.webauto', 'download');
}

const DEBUG_ENABLED = isDebugArtifactsEnabled();
const DEBUG_SCREENSHOT_DIR = DEBUG_ENABLED
  ? path.join(resolveDownloadRoot(), 'logs', 'debug-screenshots')
  : '';
const DEFAULT_CONTROLLER_URL = process.env.WEBAUTO_CONTROLLER_URL || 'http://127.0.0.1:7701/v1/controller/action';

/**
 * 淇濆瓨璋冭瘯鎴浘
 */
async function saveDebugScreenshot(
  kind: string,
  sessionId: string,
  meta: Record<string, any> = {},
): Promise<{ pngPath?: string; jsonPath?: string }> {
  if (!DEBUG_ENABLED) return {};
  try {
    await fs.mkdir(DEBUG_SCREENSHOT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${ts}-${kind}-${sessionId}`;
    const pngPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.png`);
    const jsonPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.json`);

    const controllerUrl = DEFAULT_CONTROLLER_URL;

    // 鎴浘
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

    // 鎻愬彇 base64
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

    // 淇濆瓨鍏冩暟鎹?
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
  const opId = logControllerActionStart(action, payload, { source: 'systemInput' });
  try {
    const response = await fetch(DEFAULT_CONTROLLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(12000) : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json().catch(() => ({}));
    const result = data.data || data;
    logControllerActionResult(opId, action, result, { source: 'systemInput' });
    return result;
  } catch (error) {
    logControllerActionError(opId, action, error, payload, { source: 'systemInput' });
    throw error;
  }
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
        const isCaptcha = Boolean(modal) || modalText.includes('璇烽€氳繃楠岃瘉') || modalText.includes('鎵爜楠岃瘉');

        // 鍥剧墖鏌ョ湅鍣?濯掍綋棰勮灞傦細鍑虹幇鏃剁姝㈢户缁偣鍑伙紙寮€鍙戦樁娈典笉鍋氬厹搴曠籂閿欙級
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
          titleText.includes('璇烽€氳繃楠岃瘉') ||
          modalText.includes('璇烽€氳繃楠岃瘉') ||
          modalText.includes('鎵爜楠岃瘉') ||
          modalText.includes('浜岀淮鐮?) ||
          modalText.includes('闂鍙嶉')
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
  // 璇︽儏椤?璇勮鐩稿叧鐨勫潗鏍囩偣鍑伙細绂佹钀藉湪鍥剧墖/瑙嗛涓婏紙閬垮厤鎵撳紑鍥剧墖鏌ョ湅鍣ㄨЕ鍙戦鎺э級
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
  // 寮€鍙戦樁娈碉細璇勮/婊氬姩鐩稿叧浠讳綍鐐瑰嚮閬囧埌濯掍綋鏌ョ湅鍣紝鐩存帴鍋?
  return c.includes('scroll') || c.includes('comment') || c.includes('reply');
}

function isDangerousHrefInDetail(href: string | null): boolean {
  const h = typeof href === 'string' ? href : '';
  if (!h) return false;
  // 鍦ㄨ鎯?璇勮鍖哄煙锛岀偣鍑诲埌閾炬帴閫氬父鎰忓懗鐫€璇偣锛堝ご鍍?璇濋/鎺ㄨ崘绛夛級
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
  return;
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
        // 浼樺厛楂樹寒鈥滃彲鐐瑰嚮鐩爣鈥濇湰韬紙灞曞紑鍥炲/鏇村璇勮绛夛級锛岄伩鍏嶅彧鐢讳竴涓偣鐪嬩笉鍑虹偣浜嗗暐
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
  _profileId: string,
  _x: number,
  _y: number,
  _browserServiceUrl = 'http://127.0.0.1:7704',
): Promise<void> {
  return;
}

export async function systemClickAt(
  profileId: string,
  x: number,
  y: number,
  browserServiceUrl = 'http://127.0.0.1:7704',
  context?: string,
): Promise<void> {
  const probe = await probePoint(profileId, x, y);
  const clickOpId = logOperation({
    kind: 'system_click_attempt',
    action: 'mouse:click',
    sessionId: profileId,
    context: context || null,
    reason: context || null,
    target: { x, y, probe },
  });

  // 椋庢帶/楠岃瘉鐮侊細鍑虹幇灏辩珛鍗冲仠涓嬶紙寮€鍙戦樁娈典笉鍋氶噸璇?鍏滃簳锛夛紝淇濈暀璇佹嵁渚夸簬浜哄伐澶勭悊
  if (probe.isCaptcha) {
    await saveDebugScreenshot(`captcha_detected_${context || 'system'}`, profileId, { x, y, context, probe });
    logError({
      kind: 'system_click_blocked',
      action: 'mouse:click',
      sessionId: profileId,
      context: context || null,
      reason: 'captcha_detected',
      error: 'captcha_modal_detected',
      payload: { x, y, probe },
      opId: clickOpId,
    });
    throw new Error(`captcha_modal_detected (context=${context || 'system'})`);
  }

  // 濯掍綋鏌ョ湅鍣?棰勮灞傦細鍑虹幇灏辩珛鍗冲仠涓嬶紙閬垮厤涔辩偣锛?
  if (shouldStopOnMediaViewer(context) && probe.isMediaViewerOpen) {
    await saveDebugScreenshot(`media_viewer_open_${context || 'system'}`, profileId, { x, y, context, probe });
    logError({
      kind: 'system_click_blocked',
      action: 'mouse:click',
      sessionId: profileId,
      context: context || null,
      reason: 'media_viewer_open',
      error: 'media_viewer_open',
      payload: { x, y, probe },
      opId: clickOpId,
    });
    throw new Error(`media_viewer_open (context=${context || 'system'})`);
  }

  // 璇︽儏椤?璇勮鐩稿叧鐐瑰嚮锛氱姝㈢偣鍒伴摼鎺ワ紙閫氬父鏄ご鍍?璇濋/鎺ㄨ崘/澶栭摼锛?
  if (shouldGuardAgainstImageClick(context) && isDangerousHrefInDetail(probe.href)) {
    await saveDebugScreenshot(`unsafe_click_href_${context || 'system'}`, profileId, { x, y, context, probe });
    logError({
      kind: 'system_click_blocked',
      action: 'mouse:click',
      sessionId: profileId,
      context: context || null,
      reason: 'unsafe_click_href_in_detail',
      error: 'unsafe_click_href_in_detail',
      payload: { x, y, probe },
      opId: clickOpId,
    });
    throw new Error(`unsafe_click_href_in_detail (context=${context || 'system'})`);
  }

  // 璇︽儏椤?璇勮婊氬姩鐩稿叧鐐瑰嚮锛氱姝㈢偣鍒板浘鐗?瑙嗛锛堜細鎵撳紑鏌ョ湅鍣?鏂板眰锛?
  if (shouldGuardAgainstImageClick(context) && probe.isImageLike) {
    await saveDebugScreenshot(`unsafe_click_image_${context || 'system'}`, profileId, { x, y, context, probe });
    logError({
      kind: 'system_click_blocked',
      action: 'mouse:click',
      sessionId: profileId,
      context: context || null,
      reason: 'unsafe_click_image_in_detail',
      error: 'unsafe_click_image_in_detail',
      payload: { x, y, probe },
      opId: clickOpId,
    });
    throw new Error(`unsafe_click_image_in_detail (context=${context || 'system'})`);
  }

  // 楂樹寒鍚庡啀鎴浘锛堜究浜庡鐩樼偣浣嶆槸鍚︽纭級
  const hi = await highlightTargetRectAtPoint({
    profileId,
    x,
    y,
    context,
    color: '#ff3b30',
    durationMs: 1100,
  });
  // 鍚屾椂淇濈暀鐐逛綅灏忓渾鐐癸紝渚夸簬纭鈥滅偣鍒扮殑纭垏鍧愭爣鈥?
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
  logOperation({
    kind: 'system_click_done',
    action: 'mouse:click',
    sessionId: profileId,
    context: context || null,
    reason: context || null,
    target: { x, y, probe },
    meta: { opId: clickOpId },
  });
}

export function isDevMode(): boolean {
  const raw = String(process.env.WEBAUTO_DEV || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'dev';
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
    context,
  } = options;

  // 椋庢帶/楠岃瘉鐮侊細鍑虹幇灏辩珛鍗冲仠涓嬶紙寮€鍙戦樁娈典笉鍋氶噸璇?鍏滃簳锛夛紝淇濈暀璇佹嵁渚夸簬浜哄伐澶勭悊
  if (await isCaptchaOverlayVisible(profileId)) {
    await saveDebugScreenshot(`captcha_detected_wheel_${context || 'system'}`, profileId, { deltaY, focusPoint, context });
    logError({
      kind: 'system_scroll_blocked',
      action: 'keyboard:press',
      sessionId: profileId,
      context: context || null,
      reason: 'captcha_detected',
      error: 'captcha_modal_detected',
      payload: { deltaY, focusPoint },
    });
    throw new Error(`captcha_modal_detected (context=${context || 'system'})`);
  }
  const scrollOpId = logOperation({
    kind: 'system_scroll_attempt',
    action: 'keyboard:press',
    sessionId: profileId,
    context: context || null,
    reason: context || null,
    target: { deltaY, focusPoint },
  });

  try {
    const key = Number(deltaY) >= 0 ? 'PageDown' : 'PageUp';
    const steps = Math.max(1, Math.min(8, Math.round(Math.abs(Number(deltaY) || 0) / 420) || 1));
    for (let step = 0; step < steps; step += 1) {
      await browserServiceCommand(
        browserServiceUrl,
        'keyboard:press',
        { profileId, key },
        8000,
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    logOperation({
      kind: 'system_scroll_done',
      action: 'keyboard:press',
      sessionId: profileId,
      context: context || null,
      reason: context || null,
      target: { deltaY, focusPoint },
      meta: { opId: scrollOpId },
    });
    return;
  } catch (err: any) {
    logError({
      kind: 'system_scroll_failed',
      action: 'keyboard:press',
      sessionId: profileId,
      context: context || null,
      reason: context || null,
      error: err instanceof Error ? err.message : String(err),
      payload: { deltaY, focusPoint },
      opId: scrollOpId,
    });
    throw err;
  }
}



