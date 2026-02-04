/**
 * Workflow Block: WaitSearchPermitBlock
 *
 * 职责：
 * 1. 向 SearchGate 申请搜索许可
 * 2. 如果未获许可，自动等待并重试
 * 3. 只有拿到许可后才成功返回
 */
export async function execute(input) {
    const { sessionId, keyword, gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790', serviceUrl = 'http://127.0.0.1:7701', maxWaitMs = 300_000 } = input;
    const skipIfAlreadyOnSearchResult = typeof input.skipIfAlreadyOnSearchResult === 'boolean' ? input.skipIfAlreadyOnSearchResult : true;
    const dev = typeof input.dev === 'boolean'
        ? input.dev
        : (process.env.DEBUG === '1');
    const devTag = typeof input.devTag === 'string' && input.devTag.trim()
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
                signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
            });
            const data = await resp.json().catch(() => ({}));
            const url = data?.data?.result || data?.result || '';
            if (typeof url === 'string' && url.includes('/search_result') && urlKeywordEquals(url, keyword)) {
                console.log(`[WaitSearchPermit] skip: already on search_result for "${keyword}"`);
                return { success: true, granted: true, waitedMs: 0, skipped: true };
            }
        }
        catch {
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
                signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                return { ok: false, retry: true, error: `HTTP ${response.status}${text ? `: ${text}` : ''}` };
            }
            const data = await response.json().catch(() => ({}));
            return {
                ok: true,
                allowed: Boolean(data.allowed),
                waitMs: Number(data.waitMs || 0),
                retryAfterMs: typeof data.retryAfterMs === 'number' ? Number(data.retryAfterMs) : null,
                reason: typeof data.reason === 'string' ? data.reason : null,
                keyword: typeof data.keyword === 'string' ? data.keyword : null,
                consecutive: typeof data.consecutive === 'number' ? data.consecutive : null,
                deny: data.deny && typeof data.deny === 'object'
                    ? {
                        code: String(data.deny.code || 'unknown'),
                        message: String(data.deny.message || 'denied'),
                        retryAfterMs: typeof data.deny.retryAfterMs === 'number' ? Number(data.deny.retryAfterMs) : null,
                        details: data.deny.details ?? null,
                        suggestedActions: Array.isArray(data.deny.suggestedActions)
                            ? data.deny.suggestedActions.map((s) => String(s))
                            : [],
                    }
                    : null,
                retry: false
            };
        }
        catch (err) {
            return { ok: false, retry: true, error: err.message };
        }
    }
    console.log(`[WaitSearchPermit] Requesting permit for ${sessionId}...${typeof keyword === 'string' && keyword.trim() ? ` keyword="${keyword.trim()}"` : ''}`);
    while (Date.now() - start < maxWaitMs) {
        const result = await requestPermit();
        if (result.ok && result.allowed) {
            console.log(`[WaitSearchPermit] ✅ Permit granted (waited ${(Date.now() - start) / 1000}s)`);
            return { success: true, granted: true, waitedMs: Date.now() - start, reason: result.reason ?? null };
        }
        if (result.ok && !result.allowed) {
            // 开发阶段：禁止连续三次同 keyword 搜索，直接失败（不要无脑重试）
            if (result.reason === 'dev_consecutive_keyword_limit' || result.deny?.code === 'dev_consecutive_keyword_limit') {
                const denyMsg = result.deny?.message || '';
                const actions = (result.deny?.suggestedActions || []).length > 0
                    ? (result.deny?.suggestedActions || [])
                    : [
                        'Stop and inspect logs/screenshots; do not spam search retries.',
                        'If this is a dev-only rerun and you must search the same keyword again, restart SearchGate to clear in-memory dev keyword history.',
                        'Alternatively, wait until the dev keyword history expires (default keeps 24h).',
                    ];
                console.error(`[WaitSearchPermit] ❌ SearchGate denied: dev_consecutive_keyword_limit (keyword="${String(result.keyword || keyword || '')}", consecutive=${String(result.consecutive ?? '')})${denyMsg ? ` | ${denyMsg}` : ''}`);
                for (const action of actions) {
                    console.error(`[WaitSearchPermit]   - ${action}`);
                }
                return {
                    success: false,
                    granted: false,
                    waitedMs: Date.now() - start,
                    reason: result.reason ?? null,
                    retryAfterMs: result.retryAfterMs ?? result.deny?.retryAfterMs ?? null,
                    deny: result.deny ?? null,
                    error: `SearchGate denied: dev_consecutive_keyword_limit (keyword="${String(result.keyword || keyword || '')}", consecutive=${String(result.consecutive ?? '')})`,
                };
            }
            // 只在服务端真正计算出需要等待时才等待
            const waitMs = Math.max(0, Number(result.retryAfterMs ?? result.waitMs ?? 0));
            if (waitMs > 0) {
                console.log(`[WaitSearchPermit] ⏳ Throttled${result.reason ? ` (${result.reason})` : ''}, waiting ${Math.ceil(waitMs / 1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }
            else {
                // waitMs=0：可能是服务端拒绝但未给出等待时间；避免 busy-loop，稍等再试
                console.warn(`[WaitSearchPermit] ⚠️ Gate denied but waitMs=0${result.reason ? ` (reason=${result.reason})` : ''}, retrying in 1s...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
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
//# sourceMappingURL=WaitSearchPermitBlock.js.map