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
      const maxW = Number(metrics?.availWidth || metrics?.screenWidth || 0);
      const maxH = Number(metrics?.availHeight || metrics?.screenHeight || 0);
      const innerW = Number(metrics?.innerWidth || 0);
      const innerH = Number(metrics?.innerHeight || 0);
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

      const safeMaxW = effectiveMaxW > 0 ? Math.max(900, effectiveMaxW - 40) : 1920;
      const safeMaxH = effectiveMaxH > 0 ? Math.max(700, effectiveMaxH - 40) : 1200;

      const widthBase = effectiveMaxW > 0 ? effectiveMaxW - 40 : (innerW > 0 ? innerW : 1440);
      const heightBase = effectiveMaxH > 0 ? effectiveMaxH - 40 : (innerH > 0 ? innerH : 900);

      const width = clamp(widthBase, 900, safeMaxW);
      const height = clamp(heightBase, 700, safeMaxH);

      console.log(
        `[Phase1StartProfile] display metrics: browser=${maxW}x${maxH} display=${displayW}x${displayH} inner=${innerW}x${innerH}`,
      );
      return { width: Math.floor(width), height: Math.floor(height) };
    } catch {
      return { width: 1440, height: 900 };
    }
  }

  await browserServiceCommand('start', {
    profileId: profile,
    headless,
    url,
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
