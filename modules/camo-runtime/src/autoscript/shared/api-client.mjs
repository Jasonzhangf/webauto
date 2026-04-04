/**
 * shared/api-client.mjs
 * Unified browser-service HTTP client for all action providers.
 * Source: extracted from xhs/common.mjs + weibo/common.mjs + utils/browser-service.mjs
 */

export const BROWSER_SERVICE_URL =
  process.env.CAMO_BROWSER_URL
  || process.env.CAMO_BROWSER_HTTP_URL
  || 'http://127.0.0.1:7704';

const DEFAULT_API_TIMEOUT_MS = 15000;
const DEFAULT_API_TIMEOUT_MULTIPLIER = 1;

function resolveApiTimeoutMs(options = {}) {
  const optionValue = Number(options?.timeoutMs);
  const optionMultiplier = Number(options?.timeoutMultiplier);
  const envMultiplier = Number(process.env.CAMO_API_TIMEOUT_MULTIPLIER || '');
  const timeoutMultiplier = Number.isFinite(optionMultiplier) && optionMultiplier >= 1
    ? Math.floor(optionMultiplier)
    : (Number.isFinite(envMultiplier) && envMultiplier >= 1
      ? Math.floor(envMultiplier)
      : DEFAULT_API_TIMEOUT_MULTIPLIER);

  const normalizeTimeout = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(1000, Math.floor(n));
  };

  const applyMultiplier = (value) => {
    const normalized = normalizeTimeout(value);
    if (normalized <= 0) return 0;
    return Math.min(15 * 60 * 1000, normalized * timeoutMultiplier);
  };

  if (Number.isFinite(optionValue) && optionValue > 0) {
    return applyMultiplier(optionValue);
  }
  const envValue = Number(process.env.CAMO_API_TIMEOUT_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return applyMultiplier(envValue);
  }
  return applyMultiplier(DEFAULT_API_TIMEOUT_MS);
}

function isTimeoutError(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    name.includes('timeout')
    || name.includes('abort')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('aborted')
  );
}

/**
 * Send a command to the browser-service (camo HTTP port).
 * @param {string} action - Command name (e.g. 'evaluate', 'keyboard:press')
 * @param {object} payload - Command arguments
 * @param {object} [options={}] - Options including timeoutMs, timeoutMultiplier
 * @returns {Promise<object>} Parsed JSON response
 */
export async function callAPI(action, payload = {}, options = {}) {
  const timeoutMs = resolveApiTimeoutMs(options);
  let r;
  try {
    r = await fetch(`${BROWSER_SERVICE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args: payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(`browser-service timeout after ${timeoutMs}ms: ${action}`);
    }
    throw error;
  }

  let body;
  try {
    body = await r.json();
  } catch {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }

  if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
  return body;
}

/**
 * Wrap a promise with a timeout.
 * @param {Promise} promise
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [label='withTimeout'] - Label for error message
 * @returns {Promise}
 */
export function withTimeout(promise, ms, label = 'withTimeout') {
  const effectiveMs = Math.max(100, Number(ms) || 10000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timeout after ${effectiveMs}ms`);
      err.code = 'TIMEOUT';
      reject(err);
    }, effectiveMs);
    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
