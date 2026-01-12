/**
 * Workflow Block: WaitSearchPermitBlock
 *
 * 职责：
 * 1. 向 SearchGate 申请搜索许可
 * 2. 如果未获许可，自动等待并重试
 * 3. 只有拿到许可后才成功返回
 */

export interface WaitSearchPermitInput {
  sessionId: string;
  gateUrl?: string;
  maxWaitMs?: number;
}

export interface WaitSearchPermitOutput {
  success: boolean;
  granted: boolean;
  waitedMs: number;
  error?: string;
}

export async function execute(input: WaitSearchPermitInput): Promise<WaitSearchPermitOutput> {
  const {
    sessionId,
    gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790',
    maxWaitMs = 300_000
  } = input;

  const permitEndpoint = `${gateUrl.replace(/\/$/, '')}/permit`;
  const start = Date.now();

  async function requestPermit() {
    try {
      const response = await fetch(permitEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: sessionId,
          windowMs: 60_000,
          maxCount: 2
        }),
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined
      });

      if (!response.ok) {
        return { ok: false, retry: true, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return {
        ok: true,
        allowed: data.allowed,
        waitMs: data.waitMs,
        retry: false
      };
    } catch (err: any) {
      return { ok: false, retry: true, error: err.message };
    }
  }

  console.log(`[WaitSearchPermit] Requesting permit for ${sessionId}...`);

  while (Date.now() - start < maxWaitMs) {
    const result = await requestPermit();

    if (result.ok && result.allowed) {
      console.log(`[WaitSearchPermit] ✅ Permit granted (waited ${(Date.now() - start) / 1000}s)`);
      return { success: true, granted: true, waitedMs: Date.now() - start };
    }

    if (result.ok && !result.allowed) {
      // 只在服务端真正计算出需要等待时才等待
      if (result.waitMs > 0) {
        console.log(`[WaitSearchPermit] ⏳ Throttled, waiting ${result.waitMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, result.waitMs));
        continue;
      } else {
        // waitMs=0 说明服务端逻辑错误或未达上限，立即重试
        console.warn(`[WaitSearchPermit] ⚠️ Gate denied but waitMs=0, retrying immediately...`);
        continue;
      }
    }

    if (!result.ok && result.retry) {
      console.warn(`[WaitSearchPermit] ⚠️ Gate error (${result.error}), retrying in 5s...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }

    break;
  }

  return {
    success: false,
    granted: false,
    waitedMs: Date.now() - start,
    error: `WaitSearchPermit timeout after ${maxWaitMs / 1000}s`
  };
}
