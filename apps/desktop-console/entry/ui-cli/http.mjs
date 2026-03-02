import {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_HTTP_RETRIES,
  DEFAULT_ACTION_HTTP_TIMEOUT_MS,
  parseIntSafe,
  buildUiCliClientMeta,
} from './constants.mjs';
import { sleep } from './process.mjs';

export async function requestJson(endpoint, pathname, init = {}) {
  const url = `http://${endpoint.host}:${endpoint.port}${pathname}`;
  const timeoutMs = parseIntSafe(init?.timeoutMs, DEFAULT_HTTP_TIMEOUT_MS);
  const retries = Math.max(0, parseIntSafe(init?.retries, DEFAULT_HTTP_RETRIES));
  const retryDelayMs = parseIntSafe(init?.retryDelayMs, 300);
  const requestInit = { ...init };
  delete requestInit.timeoutMs;
  delete requestInit.retries;
  delete requestInit.retryDelayMs;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...requestInit, signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }

  const msg = lastErr?.name === 'AbortError'
    ? `request_timeout:${pathname}:${timeoutMs}`
    : (lastErr?.message || String(lastErr));
  throw new Error(msg);
}

export async function sendAction(args, endpoint, payload) {
  const actionBudgetMs = payload?.action === 'wait'
    ? parseIntSafe(payload?.timeoutMs, 15_000) + 5_000
    : DEFAULT_ACTION_HTTP_TIMEOUT_MS;
  const timeoutMs = Math.max(DEFAULT_HTTP_TIMEOUT_MS, actionBudgetMs);
  const retries = payload?.action === 'wait' ? 0 : DEFAULT_HTTP_RETRIES;
  const baseCmd = String(args._?.[0] || '').trim();
  const bodyPayload = {
    ...(payload || {}),
    _client: buildUiCliClientMeta(baseCmd || payload?.action || ''),
  };
  return requestJson(endpoint, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
    timeoutMs,
    retries,
  });
}
