import { ipcMain } from 'electron';

export function registerAiHandlers() {
  ipcMain.handle('ai:listModels', async (_evt, input: { baseUrl: string; apiKey: string; path?: string }) => {
    try {
      const baseUrl = String(input?.baseUrl || '').trim().replace(/\/+$/, '');
      const apiKey = String(input?.apiKey || '').trim();
      const apiPath = String(input?.path || '/v1/models').trim() || '/v1/models';
      if (!baseUrl) return { ok: false, models: [], rawCount: 0, error: 'baseUrl is required' };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}${apiPath}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        return {
          ok: false,
          models: [],
          rawCount: 0,
          error: (json as any)?.error?.message || `HTTP ${res.status}`,
        };
      }

      const data = Array.isArray((json as any)?.data) ? (json as any).data : [];
      const models = data.map((m: any) => String(m?.id || '')).filter(Boolean);
      return { ok: true, models, rawCount: data.length };
    } catch (e: any) {
      return { ok: false, models: [], rawCount: 0, error: e?.message || String(e) };
    }
  });

  ipcMain.handle(
    'ai:testChatCompletion',
    async (_evt, input: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number }) => {
      const startedAt = Date.now();
      try {
        const baseUrl = String(input?.baseUrl || '').trim().replace(/\/+$/, '');
        const apiKey = String(input?.apiKey || '').trim();
        const model = String(input?.model || '').trim();
        const timeoutMs = Math.max(5000, Number(input?.timeoutMs || 25000));

        if (!baseUrl) return { ok: false, latencyMs: 0, model, error: 'baseUrl is required' };
        if (!model) return { ok: false, latencyMs: 0, model, error: 'model is required' };

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 8,
            temperature: 0,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          return {
            ok: false,
            latencyMs: Date.now() - startedAt,
            model,
            error: (json as any)?.error?.message || `HTTP ${res.status}`,
          };
        }

        return {
          ok: true,
          latencyMs: Date.now() - startedAt,
          model,
        };
      } catch (e: any) {
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          model: String(input?.model || ''),
          error: e?.message || String(e),
        };
      }
    },
  );
}
