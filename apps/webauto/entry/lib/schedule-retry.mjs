/**
 * Schedule retry/backoff utilities.
 * Design: docs/daemon-design.md
 */

/** Error type classification */
export function classifyError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '').toLowerCase();

  // Non-retryable: risk control
  if (code === 'RISK_CONTROL' || code === 'risk_control') return 'risk_control';
  if (message.includes('risk_control') || message.includes('风控')) return 'risk_control';

  // Non-retryable: authentication
  if (message.includes('login') || message.includes('auth')) return 'auth_error';
  if (code === 'AUTH_ERROR' || code === 'LOGIN_REQUIRED') return 'auth_error';

  // Non-retryable: configuration
  if (message.includes('invalid_config') || message.includes('missing_profile')) return 'config_error';
  if (code === 'CONFIG_ERROR' || code === 'MISSING_PROFILE') return 'config_error';

  // Retryable: timeout
  if (code === 'TIMEOUT' || code === 'ETIMEDOUT') return 'timeout';
  if (message.includes('timeout')) return 'timeout';

  // Retryable: network
  if (code === 'NETWORK' || code === 'ENETUNREACH' || code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'network';
  if (message.includes('network') || message.includes('econnrefused') || message.includes('econnreset')) return 'network';

  // Retryable: page/navigation
  if (message.includes('navigation') || message.includes('page_load')) return 'page_error';
  if (code === 'PAGE_LOAD_ERROR' || code === 'NAVIGATION_ERROR') return 'page_error';

  // Default: unknown (retryable)
  return 'unknown';
}

/** Non-retryable error types */
const NON_RETRYABLE = new Set(['risk_control', 'auth_error', 'config_error']);

/** Check if an error type should be retried */
export function shouldRetry(errorType) {
  return !NON_RETRYABLE.has(errorType);
}

/** Retry configuration defaults */
export const RETRY_DEFAULTS = {
  baseMs: 60000,        // 1 minute base
  multiplier: 2,        // exponential backoff
  maxMs: 3600000,       // 1 hour max
  maxAttempts: 3,       // max 3 retries
};

/**
 * Calculate exponential backoff delay.
 * @param {number} attempt - Current attempt number (1-indexed)
 * @param {object} options - Backoff options
 * @returns {number} Delay in milliseconds
 */
export function calcBackoffMs(attempt, options = {}) {
  const { baseMs = RETRY_DEFAULTS.baseMs, multiplier = RETRY_DEFAULTS.multiplier, maxMs = RETRY_DEFAULTS.maxMs } = options;
  if (attempt < 1) return baseMs;
  const delay = baseMs * Math.pow(multiplier, attempt - 1);
  return Math.min(delay, maxMs);
}

/**
 * Calculate retry timestamp.
 * @param {number} failCount - Current failure count
 * @param {object} retryConfig - Retry configuration (optional)
 * @returns {string} ISO timestamp for next retry
 */
export function calcRetryAt(failCount, retryConfig = {}) {
  const { baseMs, multiplier, maxMs } = { ...RETRY_DEFAULTS, ...retryConfig };
  const delayMs = calcBackoffMs(failCount + 1, { baseMs, multiplier, maxMs });
  const retryAt = new Date(Date.now() + delayMs);
  return retryAt.toISOString();
}

/**
 * Check if a task should be retried based on error and configuration.
 * @param {Error} error - The error that occurred
 * @param {object} task - The task object (for failCount check)
 * @param {object} retryConfig - Retry configuration
 * @returns {{ shouldRetry: boolean, errorType: string, retryAt?: string }}
 */
export function evaluateRetry(error, task = {}, retryConfig = {}) {
  const { maxAttempts = RETRY_DEFAULTS.maxAttempts } = { ...RETRY_DEFAULTS, ...retryConfig };
  const errorType = classifyError(error);
  const failCount = Number(task.failCount || 0);

  // Check if error type is retryable
  if (!shouldRetry(errorType)) {
    return { shouldRetry: false, errorType };
  }

  // Check if max attempts reached
  if (failCount >= maxAttempts) {
    return { shouldRetry: false, errorType, reason: 'max_attempts_reached' };
  }

  // Calculate retry time
  const retryAt = calcRetryAt(failCount, retryConfig);
  return { shouldRetry: true, errorType, retryAt };
}
