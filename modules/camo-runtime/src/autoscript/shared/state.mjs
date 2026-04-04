/**
 * @module shared/state
 * Cross-platform profile state management factory.
 * Source: extracted from xhs/state.mjs and weibo/state.mjs.
 *
 * Usage:
 *   import { createProfileStateManager, withSerializedLock } from './state.mjs';
 *   const { getState, defaultState } = createProfileStateManager({
 *     namespace: 'xhs',
 *     defaultState: { keyword: null, ... },
 *   });
 */

const PROFILE_STATE_REGISTRY = new Map();
const OPERATION_LOCKS = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a profile state manager for a namespace.
 * @param {object} options
 * @param {string} options.namespace - e.g. 'xhs', 'weibo'
 * @param {object} options.defaultState - Initial state template (function or object)
 * @returns {{ getState: (profileId: string) => object, defaultState: object }}
 */
export function createProfileStateManager({ namespace, defaultState: defaultStateInput }) {
  const ns = String(namespace || 'default').trim();
  const resolveDefault = typeof defaultStateInput === 'function'
    ? defaultStateInput
    : () => ({ ...defaultStateInput });

  const getState = (profileId) => {
    const key = `${ns}:${String(profileId || '').trim() || 'default'}`;
    if (!PROFILE_STATE_REGISTRY.has(key)) {
      PROFILE_STATE_REGISTRY.set(key, resolveDefault());
    }
    return PROFILE_STATE_REGISTRY.get(key);
  };

  return { getState, defaultState: resolveDefault() };
}

// ---------------------------------------------------------------------------
// Serialized lock (for exclusive operation on a profile)
// ---------------------------------------------------------------------------

function toLockKey(text, fallback = '') {
  return String(text || '').trim() || fallback;
}

/**
 * Run a function under an exclusive per-key lock.
 * If timeoutMs is set and the previous holder is still running, throw after timeout.
 * @param {string} lockKey
 * @param {function} fn
 * @param {object} [options]
 * @param {number} [options.timeoutMs=0] - 0 = no timeout
 * @returns {Promise<*>}
 */
export async function withSerializedLock(lockKey, fn, options = {}) {
  const key = toLockKey(lockKey);
  if (!key) return fn();
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
  const previous = OPERATION_LOCKS.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  OPERATION_LOCKS.set(key, previous.catch(() => null).then(() => gate));
  const waitForPrev = previous.catch(() => null);
  if (timeoutMs > 0) {
    await Promise.race([
      waitForPrev,
      sleep(timeoutMs).then(() => {
        const error = new Error(`LOCK_TIMEOUT:${key}`);
        error.code = 'LOCK_TIMEOUT';
        throw error;
      }),
    ]);
  } else {
    await waitForPrev;
  }
  try {
    return await fn();
  } finally {
    release();
    if (OPERATION_LOCKS.get(key) === gate) OPERATION_LOCKS.delete(key);
  }
}
