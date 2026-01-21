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
  keyword?: string;
  gateUrl?: string;
  serviceUrl?: string;
  maxWaitMs?: number;
  // 开发阶段：如果已经在正确的 search_result(keyword) 页面，则不需要申请 permit（避免无意义计数/重复搜索）
  skipIfAlreadyOnSearchResult?: boolean;
  // 开发阶段：给 SearchGate 一个标记（用于附加规则，例如禁止连续三次同 keyword 搜索）
  dev?: boolean;
  devTag?: string;
}

export interface WaitSearchPermitOutput {
  success: boolean;
  granted: boolean;
  waitedMs: number;
  skipped?: boolean;
  error?: string;
}

export async function execute(input: WaitSearchPermitInput): Promise<WaitSearchPermitOutput> {
  const {
    sessionId,
    keyword,
    gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790',
    serviceUrl = 'http://127.0.0.1:7701',
    maxWaitMs = 300_000
  } = input;

  const skipIfAlreadyOnSearchResult =
    typeof input.skipIfAlreadyOnSearchResult === 'boolean' ? input.skipIfAlreadyOnSearchResult : true;
  const dev =
    typeof input.dev === 'boolean'
      ? input.dev
      : (process.env.DEBUG === '1' || process.env.NODE_ENV !== 'production');
  const devTag =
    typeof input.devTag === 'string' && input.devTag.trim()
      ? String(input.devTag).trim()
      : (dev ? 'dev' : '');

  // 若已经在正确的搜索结果页，直接跳过（避免重复申请 permit 造成“看起来像连续搜索”）
  if (skipIfAlreadyOnSearchResult && typeof keyword === 'string' && keyword.trim()) {
    try {
      const { urlKeywordEquals } = await import('./helpers/searchPageState.js');
      const controllerUrl = `${serviceUrl.replace(/\/$/, '')}/v1/controller/action`;
      const resp = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:execute',
          payload: { profile: sessionId, script: 'location.href' },
        }),
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined,
      });
      const data = await resp.json().catch(() => ({} as any));
      const url = (data as any)?.data?.result || (data as any)?.result || '';
      if (typeof url === 'string' && url.includes('/search_result') && urlKeywordEquals(url, keyword)) {
        console.log(`[WaitSearchPermit] skip: already on search_result for "${keyword}"`);
        return { success: true, granted: true, waitedMs: 0, skipped: true };
      }
    } catch {
      // ignore
    }
  }

  const permitEndpoint = `${gateUrl.replace(/\/$/, '')}/permit`;
  const start = Date.now();

  async function requestPermit() {
    try {
      const response = await fetch(permitEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: sessionId,
          ...(typeof keyword === 'string' && keyword.trim() ? { keyword: keyword.trim() } : {}),
          ...(dev ? { dev: true } : {}),
          ...(devTag ? { devTag } : {}),
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
        reason: data.reason,
        keyword: data.keyword,
        consecutive: data.consecutive,
        retry: false
      };
    } catch (err: any) {
      return { ok: false, retry: true, error: err.message };
    }
  }

  console.log(
    `[WaitSearchPermit] Requesting permit for ${sessionId}...${typeof keyword === 'string' && keyword.trim() ? ` keyword="${keyword.trim()}"` : ''}`,
  );

  while (Date.now() - start < maxWaitMs) {
    const result = await requestPermit();

    if (result.ok && result.allowed) {
      console.log(`[WaitSearchPermit] ✅ Permit granted (waited ${(Date.now() - start) / 1000}s)`);
      return { success: true, granted: true, waitedMs: Date.now() - start };
    }

    if (result.ok && !result.allowed) {
      // 开发阶段：禁止连续三次同 keyword 搜索，直接失败（不要无脑重试）
      if (result.reason === 'dev_consecutive_keyword_limit') {
        return {
          success: false,
          granted: false,
          waitedMs: Date.now() - start,
          error: `dev_consecutive_keyword_limit (keyword="${String(result.keyword || keyword || '')}", consecutive=${String(result.consecutive ?? '')})`,
        };
      }

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
