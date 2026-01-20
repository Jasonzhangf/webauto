/**
 * SearchGate helper
 *
 * 处理搜索节流请求，避免因频繁搜索触发风控
 */

export interface SearchGateConfig {
  profileId: string;
  windowMs?: number;
  maxCount?: number;
  gateUrl?: string;
  maxRetries?: number;
}

export interface SearchGateResult {
  allowed: boolean;
  waitMs: number;
}

export async function waitSearchPermit(config: SearchGateConfig): Promise<void> {
  const {
    profileId,
    windowMs = 60_000,
    maxCount = 2,
    gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790/permit',
    maxRetries = 5
  } = config;

  async function requestOnce(): Promise<SearchGateResult> {
    const response = await fetch(gateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId,
        windowMs,
        maxCount
      }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`SearchGate HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return {
      allowed: Boolean(data.allowed),
      waitMs: Number(data.waitMs || 0)
    };
  }

  try {
    for (let i = 0; i < maxRetries; i++) {
      const { allowed, waitMs } = await requestOnce();
      if (allowed) {
        console.log('[SearchGate] Permit granted');
        return;
      }
      const safeWait = Math.min(Math.max(waitMs, 5_000), 65_000);
      console.log(`[SearchGate] Throttling, wait ${safeWait}ms`);
      await new Promise(resolve => setTimeout(resolve, safeWait));
    }
    throw new Error('SearchGate throttling: too many retries');
  } catch (err: any) {
    console.error('[SearchGate] Not available:', err.message);
    throw new Error('SearchGate not available, 请先在另一终端运行 node scripts/search-gate-server.mjs');
  }
}