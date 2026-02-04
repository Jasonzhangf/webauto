/**
 * Phase 1 Block: 启动/复用 Profile 会话
 */

export interface StartProfileInput {
  profile: string;
  url?: string;
  headless?: boolean;
  browserServiceUrl?: string;
}

export interface StartProfileOutput {
  started: boolean;
  profile: string;
  url: string;
  headless: boolean;
}

async function browserServiceCommand(action: string, args: any, serviceUrl: string) {
  const res = await fetch(`${serviceUrl}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || 'browser-service error');
  return data;
}

export async function execute(input: StartProfileInput): Promise<StartProfileOutput> {
  const {
    profile,
    url = 'https://www.xiaohongshu.com',
    headless = false,
    browserServiceUrl = 'http://127.0.0.1:7704',
  } = input;

  console.log(`[Phase1StartProfile] 启动 profile=${profile} headless=${headless}`);

  function clamp(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  }

  function pickFirstPositive(...values: Array<number | null | undefined>): number {
    for (const value of values) {
      const parsed = Number(value ?? 0);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  function resolveEffectiveMax(displayValue: number, browserValue: number): number {
    if (displayValue > 0 && browserValue > 0) {
      return Math.min(displayValue, browserValue);
    }
    return displayValue > 0 ? displayValue : browserValue;
  }

  async function resolveViewportSize(): Promise<{ width: number; height: number }> {
    try {
      const displayRes = await browserServiceCommand(
        'system:display',
        {},
        browserServiceUrl,
      );
      const res = await browserServiceCommand(
        'evaluate',
        {
          profileId: profile,
          script: `(() => ({
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            screenWidth: window.screen?.width,
            screenHeight: window.screen?.height,
            availWidth: window.screen?.availWidth,
            availHeight: window.screen?.availHeight
          }))()`,
        },
        browserServiceUrl,
      );
      const payload = res?.body || res?.data || res;
      const metrics = payload?.result || payload?.data?.result || null;
      const displayPayload = displayRes?.body || displayRes?.data || displayRes;
      const display = displayPayload?.metrics || displayPayload?.data?.metrics || null;
      // These reflect *browser* idea of available size (can be scaled / not equal to physical pixels).
      const maxW = Number(metrics?.availWidth || metrics?.screenWidth || 0);
      const maxH = Number(metrics?.availHeight || metrics?.screenHeight || 0);
      const innerW = Number(metrics?.innerWidth || 0);
      const innerH = Number(metrics?.innerHeight || 0);
      // Prefer OS work area (excludes taskbar/dock), fall back to total screen size.
      // IMPORTANT: do not let browser metrics override OS metrics when present.
      const displayW = pickFirstPositive(display?.workWidth, display?.width, display?.nativeWidth);
      const displayH = pickFirstPositive(display?.workHeight, display?.height, display?.nativeHeight);
      // Use inner dimensions as the floor - browser cannot render smaller than its inner window
      const innerFloorW = Math.max(innerW, 900);
      const innerFloorH = Math.max(innerH, 720);
      const effectiveMaxW = resolveEffectiveMax(displayW, maxW);
      const effectiveMaxH = resolveEffectiveMax(displayH, maxH);

      // Hard requirement: use OS work area as the viewport when available.
      // Only fall back to browser metrics if OS metrics are missing.
      const targetW = displayW > 0 ? displayW : (maxW > 0 ? maxW : 1920);
      const targetH = displayH > 0 ? displayH : (maxH > 0 ? maxH : 1400);

      // Keep a reasonable minimum, but do NOT clamp max height/width; use real screen size.
      const width = Math.max(innerFloorW, Math.floor(targetW));
      const height = Math.max(innerFloorH, Math.floor(targetH));

      console.log(
        `[Phase1StartProfile] display metrics: browser=${maxW}x${maxH} display=${displayW}x${displayH} ` +
        `effective=${effectiveMaxW}x${effectiveMaxH} inner=${innerW}x${innerH} ` +
        `target=${targetW}x${targetH} finalViewport=${width}x${height}`,
      );
      return { width, height };
    } catch {
      return { width: 1440, height: 1080 };
    }
  }

  await browserServiceCommand('start', {
    profileId: profile,
    headless,
    url,
    ownerPid: process.pid,
  }, browserServiceUrl);

  const viewport = await resolveViewportSize();
  await browserServiceCommand('page:setViewport', {
    profileId: profile,
    width: viewport.width,
    height: viewport.height,
  }, browserServiceUrl);
  console.log(`[Phase1StartProfile] viewport set: ${viewport.width}x${viewport.height}`);

  return {
    started: true,
    profile,
    url,
    headless,
  };
}
