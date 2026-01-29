/**
 * Workflow Block: EnsureSession
 *
 * 确保浏览器 Session 存在并处于登录状态
 */

import os from 'node:os';

export interface EnsureSessionInput {
  profileId: string;
  url?: string;
  serviceUrl?: string;
  viewport?: { width: number; height: number };
  /**
   * When starting a new session, whether to run browser in headless mode.
   * Note: if the session already exists, EnsureSession will reuse it and will NOT restart it.
   */
  headless?: boolean;
}

export interface EnsureSessionOutput {
  sessionId: string;
  status: 'active' | 'created';
  currentPage: string;
  error?: string;
}

/**
 * 确保浏览器 Session 存在
 *
 * @param input - 输入参数
 * @returns Promise<EnsureSessionOutput>
 */
export async function execute(input: EnsureSessionInput): Promise<EnsureSessionOutput> {
  const { profileId, url, serviceUrl = 'http://127.0.0.1:7704', viewport } = input;
  const headless = typeof input.headless === 'boolean' ? input.headless : false;

  if (!profileId) {
    return {
      sessionId: '',
      status: 'active',
      currentPage: '',
      error: 'Missing profileId'
    };
  }

  try {
    const statusUrl = `${serviceUrl}/command`;
    const desiredViewport = viewport || {
      width: Number(process.env.WEBAUTO_VIEWPORT_WIDTH || 1440),
      height: Number(process.env.WEBAUTO_VIEWPORT_HEIGHT || 1100),
    };
    const zoomRaw = String(process.env.WEBAUTO_VIEWPORT_ZOOM ?? '').trim().toLowerCase();
    const browserZoomRaw = String(process.env.WEBAUTO_BROWSER_ZOOM ?? '').trim().toLowerCase();

    function clamp(n: number, min: number, max: number) {
      if (!Number.isFinite(n)) return min;
      return Math.min(Math.max(n, min), max);
    }

    async function getScreenMetrics(): Promise<{
      innerWidth?: number;
      innerHeight?: number;
      screenWidth?: number;
      screenHeight?: number;
      availWidth?: number;
      availHeight?: number;
      devicePixelRatio?: number;
    } | null> {
      try {
        const res = await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'evaluate',
            args: {
              profileId,
              script: `(() => ({
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                screenWidth: window.screen?.width,
                screenHeight: window.screen?.height,
                availWidth: window.screen?.availWidth,
                availHeight: window.screen?.availHeight,
                devicePixelRatio: window.devicePixelRatio
              }))()`,
            },
          }),
        }).then((r) => r.json().catch(() => ({} as any)));
        const payload = res?.body || res?.data || res;
        const result = payload?.result || payload?.data?.result;
        if (!result || typeof result !== 'object') return null;
        return result;
      } catch {
        return null;
      }
    }

    let cachedMetrics: Awaited<ReturnType<typeof getScreenMetrics>> | null = null;
    let cachedDisplay: {
      width?: number;
      height?: number;
      workWidth?: number;
      workHeight?: number;
      nativeWidth?: number;
      nativeHeight?: number;
      source?: string;
    } | null = null;

    async function loadMetrics() {
      if (cachedMetrics) return cachedMetrics;
      cachedMetrics = await getScreenMetrics();
      return cachedMetrics;
    }

    async function getDisplayMetrics() {
      try {
        const res = await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'system:display' }),
        }).then((r) => r.json().catch(() => ({} as any)));
        const payload = res?.body || res?.data || res;
        const metrics = payload?.metrics || payload?.data?.metrics || null;
        if (!metrics || typeof metrics !== 'object') return null;
        return metrics;
      } catch {
        return null;
      }
    }

    async function loadDisplay() {
      if (cachedDisplay) return cachedDisplay;
      cachedDisplay = await getDisplayMetrics();
      return cachedDisplay;
    }

    async function resolveViewportSize(): Promise<{ width: number; height: number }> {
      const metrics = await loadMetrics();
      const maxW = Number(metrics?.availWidth || metrics?.screenWidth || 0);
      const maxH = Number(metrics?.availHeight || metrics?.screenHeight || 0);
      const innerW = Number(metrics?.innerWidth || 0);
      const innerH = Number(metrics?.innerHeight || 0);
      const display = await loadDisplay();
      const displayW = Math.max(
        0,
        Number(display?.nativeWidth || 0),
        Number(display?.width || 0),
        Number(display?.workWidth || 0),
      );
      const displayH = Math.max(
        0,
        Number(display?.nativeHeight || 0),
        Number(display?.height || 0),
        Number(display?.workHeight || 0),
      );
      const effectiveMaxW = displayW > 0 ? Math.max(displayW, maxW) : maxW;
      const effectiveMaxH = displayH > 0 ? Math.max(displayH, maxH) : maxH;

      const widthCandidate = Number.isFinite(desiredViewport.width) ? desiredViewport.width : 1440;
      const heightCandidate = Number.isFinite(desiredViewport.height) ? desiredViewport.height : 900;

      const safeMaxW = effectiveMaxW > 0 ? Math.max(900, effectiveMaxW - 40) : 1920;
      const safeMaxH = effectiveMaxH > 0 ? Math.max(700, effectiveMaxH - 40) : 1200;

      const widthBase = effectiveMaxW > 0 ? effectiveMaxW - 40 : (innerW > 0 ? innerW : widthCandidate);
      const heightBase = effectiveMaxH > 0 ? effectiveMaxH - 40 : (innerH > 0 ? innerH : heightCandidate);

      const width = clamp(widthBase, 900, safeMaxW);
      const height = clamp(heightBase, 700, safeMaxH);

      console.log(
        `[EnsureSession] display metrics: browser=${maxW}x${maxH} display=${displayW}x${displayH} inner=${innerW}x${innerH}`,
      );
      return { width: Math.floor(width), height: Math.floor(height) };
    }

    function resolveZoom(metrics: Awaited<ReturnType<typeof getScreenMetrics>> | null): number | null {
      if (!zoomRaw) return null;
      if (zoomRaw === 'auto') {
        const dpr = Number(metrics?.devicePixelRatio || 0);
        if (Number.isFinite(dpr) && dpr > 1.05) {
          return clamp(1 / dpr, 0.5, 1);
        }
        return 1;
      }
      if (zoomRaw) {
        const parsed = Number(zoomRaw);
        if (Number.isFinite(parsed)) return clamp(parsed, 0.25, 1);
      }
      return 1;
    }

    async function applyZoom(): Promise<void> {
      if (!profileId.startsWith('xiaohongshu_')) return;
      const metrics = await loadMetrics();
      const zoom = resolveZoom(metrics);
      if (zoom === null) return;
      try {
        await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'evaluate',
            args: {
              profileId,
              script: `(() => {
                const z = ${JSON.stringify(zoom)};
                const normalized = Math.abs(z - 1) < 0.01 ? '' : String(z);
                if (document.documentElement) document.documentElement.style.zoom = normalized;
                if (document.body) document.body.style.zoom = normalized;
                return { zoom: z };
              })()`,
            },
          }),
        }).then((r) => r.json().catch(() => ({} as any)));
        console.log(`[EnsureSession] zoom set: ${zoom} (profile=${profileId})`);
      } catch (error: any) {
        console.warn(`[EnsureSession] zoom set failed: ${error?.message || String(error)}`);
      }
    }

    function parseZoomValue(raw: string): number | null {
      if (!raw) return null;
      if (raw.endsWith('%')) {
        const parsed = Number(raw.replace('%', '').trim());
        if (Number.isFinite(parsed) && parsed > 0) return parsed / 100;
        return null;
      }
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      return null;
    }

    function resolveBrowserZoomTarget(): number | null {
      if (browserZoomRaw === '0' || browserZoomRaw === '1' || browserZoomRaw === '100%') return null;
      const explicit = parseZoomValue(browserZoomRaw);
      if (explicit) return explicit;
      return null;
    }

    async function applyBrowserZoom(): Promise<void> {
      if (!profileId.startsWith('xiaohongshu_')) return;
      const target = resolveBrowserZoomTarget();
      if (!target || Math.abs(target - 1) < 0.01) return;
      const zoomOutSteps = [0.9, 0.8, 0.67, 0.5, 0.33, 0.25];
      const zoomInSteps = [1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
      const steps =
        target < 1
          ? Math.max(
              1,
              zoomOutSteps.reduce((best, value, idx) => {
                const diff = Math.abs(value - target);
                return diff < best.diff ? { diff, idx } : best;
              }, { diff: Number.POSITIVE_INFINITY, idx: 0 }).idx + 1,
            )
          : Math.max(
              1,
              zoomInSteps.reduce((best, value, idx) => {
                const diff = Math.abs(value - target);
                return diff < best.diff ? { diff, idx } : best;
              }, { diff: Number.POSITIVE_INFINITY, idx: 0 }).idx + 1,
            );

      const key = os.platform() === 'darwin'
        ? (target < 1 ? 'Meta+-' : 'Meta++')
        : (target < 1 ? 'Control+-' : 'Control++');

      for (let i = 0; i < steps; i += 1) {
        try {
          await fetch(statusUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'keyboard:press',
              args: { profileId, key },
            }),
          }).then((r) => r.json().catch(() => ({} as any)));
          await new Promise((r) => setTimeout(r, 80));
        } catch (error: any) {
          console.warn(`[EnsureSession] browser zoom step failed: ${error?.message || String(error)}`);
          break;
        }
      }
      console.log(`[EnsureSession] browser zoom applied target~${target} steps=${steps} key=${key} profile=${profileId}`);
    }

    async function resetBrowserZoom(): Promise<void> {
      if (!profileId.startsWith('xiaohongshu_')) return;
      if (process.env.WEBAUTO_RESET_BROWSER_ZOOM === '0') return;
      const key = os.platform() === 'darwin' ? 'Meta+0' : 'Control+0';
      try {
        await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'keyboard:press',
            args: { profileId, key },
          }),
        }).then((r) => r.json().catch(() => ({} as any)));
        console.log(`[EnsureSession] browser zoom reset (${key}) profile=${profileId}`);
      } catch (error: any) {
        console.warn(`[EnsureSession] browser zoom reset failed: ${error?.message || String(error)}`);
      }
    }

    async function setViewport(): Promise<{ ok: boolean; error?: string }> {
      const resolvedViewport = await resolveViewportSize();
      const res = await fetch(statusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'page:setViewport',
          args: {
            profileId,
            width: resolvedViewport.width,
            height: resolvedViewport.height,
          },
        }),
      }).then((r) => r.json().catch(() => ({} as any)));

      const ok = !(res?.ok === false || res?.success === false);
      if (!ok) return { ok: false, error: res?.error || 'viewport_set_failed' };
      console.log(
        `[EnsureSession] viewport set: ${resolvedViewport.width}x${resolvedViewport.height} (profile=${profileId})`,
      );
      await resetBrowserZoom();
      await applyBrowserZoom();
      await applyZoom();
      return { ok: true };
    }

    const statusRes = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getStatus' })
    });

    const statusData = await statusRes.json();
    const sessions =
      statusData.sessions ||
      statusData.data?.sessions ||
      statusData.body?.sessions ||
      (Array.isArray(statusData.data) ? statusData.data : []) ||
      [];
    const existing = Array.isArray(sessions)
      ? sessions.find((s: any) => s?.profileId === profileId)
      : null;

    if (existing) {
      if (url && existing.url !== url) {
        await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'goto',
            args: { profileId, url }
          })
        });
      }

      // Phase1 关键约束：保证视口高度足够（避免第二排卡片误点）
      const vp = await setViewport();
      if (!vp.ok) {
        return {
          sessionId: existing.sessionId || existing.id || profileId,
          status: 'active',
          currentPage: url || existing.url,
          error: vp.error,
        };
      }

      return {
        sessionId: existing.sessionId || existing.id || profileId,
        status: 'active',
        currentPage: url || existing.url
      };
    }

    const startRes = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        args: {
          profileId,
          url,
          headless
        }
      })
    });

    const startData = await startRes.json();
    if (!startData.ok) {
      throw new Error(startData.error || 'Failed to start session');
    }

    const vp = await setViewport();
    if (!vp.ok) {
      return {
        sessionId: startData.sessionId || profileId,
        status: 'created',
        currentPage: url || '',
        error: vp.error,
      };
    }

    return {
      sessionId: startData.sessionId || profileId,
      status: 'created',
      currentPage: url || ''
    };
  } catch (error: any) {
    return {
      sessionId: '',
      status: 'active',
      currentPage: '',
      error: `Session error: ${error.message}`
    };
  }
}
