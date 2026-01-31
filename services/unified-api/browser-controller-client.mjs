/**
 * Browser Controller Client (Unified API)
 * 用于替代 modules/browser/src/controller/client.mjs 的遗留引用
 */

export function createBrowserControllerClient(config = {}) {
  const host = config.host || '127.0.0.1';
  const port = config.port || 7701;
  const base = `http://${host}:${port}/v1/controller/action`;

  async function post(action, payload = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: controller.signal
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`Controller ${action} failed: ${resp.status} ${text}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        return { success: false, raw: text };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return { post };
}
