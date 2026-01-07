/**
 * Workflow Block: WaitSearchPermitBlock
 *
 * 职责：
 * 1. 向 SearchGate 申请搜索许可
 * 2. 如果未获许可，自动等待并重试
 * 3. 只有拿到许可后才成功返回
 *
 * 依赖：
 * - 外部运行的 SearchGate 服务（scripts/search-gate-server.mjs）
 */

export interface WaitSearchPermitInput {
  sessionId: string;
  gateUrl?: string; // 默认 http://127.0.0.1:7790
  maxWaitMs?: number; // 最大等待总时长，默认 300_000 (5分钟)
}

export interface WaitSearchPermitOutput {
  success: boolean;
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
          key: sessionId, // 使用 sessionId 作为流控 key
          windowMs: 60_000,
          maxCount: 2
        }),
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined
      });

      if (!response.ok) {
        // 服务存在但返回错误
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
      // 服务连不上，视为临时故障，可重试
      return { ok: false, retry: true, error: err.message };
    }
  }

  console.log(`[WaitSearchPermit] Requesting permit for ${sessionId}...`);

  while (Date.now() - start < maxWaitMs) {
    const result = await requestPermit();

    // 1. 拿到许可
    if (result.ok && result.allowed) {
      console.log(`[WaitSearchPermit] ✅ Permit granted (waited ${(Date.now() - start)/1000}s)`);
      return { success: true, waitedMs: Date.now() - start };
    }

    // 2. 被限流，需要等待
    if (result.ok && !result.allowed) {
      const waitTime = Math.max(result.waitMs || 1000, 2000);
      console.log(`[WaitSearchPermit] ⏳ Throttled, waiting ${waitTime/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // 3. 服务报错或连不上
    if (!result.ok && result.retry) {
      console.warn(`[WaitSearchPermit] ⚠️ Gate error (${result.error}), retrying in 5s...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }

    // 4. 不可恢复错误
    break;
  }

  return {
    success: false,
    waitedMs: Date.now() - start,
    error: `WaitSearchPermit timeout after ${maxWaitMs/1000}s`
  };
}
