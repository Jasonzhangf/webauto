/**
 * @module shared/dom-ops
 * Cross-platform DOM operation primitives.
 * No business logic, no platform-specific imports.
 * Source: extracted from xhs/dom-ops.mjs (platform-specific functions excluded).
 *
 * Functions EXCLUDED (xhs-specific deps): evaluateReadonly, highlightVisualTarget,
 * clearVisualHighlight, resolveSelectorTarget, fillInputValue, waitForAnchor.
 * Those remain in their respective action-provider directories.
 */

import { callAPI } from './api-client.mjs';

// ---------------------------------------------------------------------------
// Post-anchor verification
// ---------------------------------------------------------------------------

/**
 * Error thrown when post-anchor verification fails.
 */
export class AnchorError extends Error {
  constructor(code, anchor, details = {}) {
    super(`Anchor verification failed: ${code}`);
    this.name = 'AnchorError';
    this.code = code;
    this.anchor = anchor;
    this.details = details;
  }
}

/**
 * Verify page state after a DOM write operation.
 * @param {string} profileId
 * @param {object} anchor - Anchor configuration
 * @param {string} anchor.type - 'exist' | 'visible' | 'not_exist' | 'url_contains'
 * @param {string} [anchor.selector] - CSS selector
 * @param {number} [anchor.minCount=1] - Minimum count for visible
 * @param {string} [anchor.urlPattern] - URL pattern for url_contains
 * @param {number} [anchor.timeoutMs=5000] - Max wait time
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function verifyPostAnchor(profileId, anchor) {
  if (!anchor || !anchor.type) return { ok: true };
  const timeoutMs = Math.max(100, Number(anchor.timeoutMs) || 5000);
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await callAPI('evaluate', {
        profileId,
        script: buildAnchorCheckScript(anchor),
      });
      if (result?.ok && result?.result?.passed) return { ok: true };
      if (result?.result?.isLoginPage) return { ok: false, error: 'login_required' };
      if (result?.result?.isRiskControl) return { ok: false, error: 'risk_control' };
    } catch (e) { /* continue polling */ }
    await sleep(200);
  }
  return { ok: false, error: 'timeout' };
}

function buildAnchorCheckScript(anchor) {
  const { type, selector, minCount = 1, urlPattern } = anchor;
  if (type === 'exist') {
    return `(\(\) => ({ passed: document.querySelectorAll(\"${selector}\").length > 0 }))()`;
  }
  if (type === 'visible') {
    return `(\(\) => { const els = Array.from(document.querySelectorAll(\"${selector}\")).filter(e => e.offsetParent !== null); return { passed: els.length >= ${minCount}, count: els.length }; })()`;
  }
  if (type === 'not_exist') {
    return `(\(\) => ({ passed: document.querySelectorAll(\"${selector}\").length === 0 }))()`;
  }
  if (type === 'url_contains') {
    return `(\(\) => ({ passed: location.href.includes(\"${urlPattern}\") }))()`;
  }
  return `(\(\) => ({ passed: false }))()`;
}


// ---------------------------------------------------------------------------
// Low-level utilities
// ---------------------------------------------------------------------------

/**
 * Promise-based delay (no anchor, use sparingly).
 * @param {number} ms - Milliseconds to wait
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Wrap a promise with a hard timeout.
 * @param {Promise} promise
 * @param {number} timeoutMs
 * @param {string} code - Error code on timeout
 * @returns {Promise}
 */
export function withTimeout(promise, timeoutMs, code = 'OP_TIMEOUT') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(code);
      error.code = code;
      reject(error);
    }, Math.max(0, timeoutMs));
    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Random sleep between [min, max] ms.
 * @param {number} minMs
 * @param {number} maxMs
 * @param {function} [pushTrace] - Optional trace recorder
 * @param {string} [stage='sleep_random']
 * @returns {number} Actual wait time
 */
export async function sleepRandom(minMs, maxMs, pushTrace, stage = 'sleep_random') {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  const waitMs = Math.floor(min + Math.random() * (max - min + 1));
  if (typeof pushTrace === 'function') {
    pushTrace({ kind: 'wait', stage, waitMs, minMs: min, maxMs: max });
  }
  await sleep(waitMs);
  return waitMs;
}

// ---------------------------------------------------------------------------
// Mouse operations
// ---------------------------------------------------------------------------

/**
 * Click at a screen coordinate.
 * @param {string} profileId
 * @param {{ x: number, y: number }} point
 * @param {object} [options]
 * @param {boolean} [options.nudgeBefore=false]
 * @param {boolean} [options.retryOnFailure=true]
 * @param {number} [options.timeoutMs=0]
 * @param {number} [options.afterClickSleepMs=0]
 * @param {string} [options.button='left']
 * @param {number} [options.clicks=1]
 */
export async function clickPoint(profileId, point, options = {}) {
  const nudgeBefore = options && options.nudgeBefore === true;
  const retryOnFailure = options && options.retryOnFailure !== false && !nudgeBefore;
  const timeoutMs = Math.max(0, Number((options && options.timeoutMs) || 0));
  const postAnchor = options && options.postAnchor;
  const payload = {
    profileId,
    x: Math.max(1, Math.round(Number((point && point.x) || 1))),
    y: Math.max(1, Math.round(Number((point && point.y) || 1))),
    button: String((options && options.button) || 'left').trim() || 'left',
    clicks: Math.max(1, Number((options && options.clicks) || 1)),
    ...(nudgeBefore ? { nudgeBefore: true } : {}),
  };
  try {
    const task = callAPI('mouse:click', payload);
    await (timeoutMs > 0 ? withTimeout(task, timeoutMs, 'CLICK_POINT_TIMEOUT') : task);
  } catch (error) {
    if (!retryOnFailure) throw error;
    const retryTask = callAPI('mouse:click', Object.assign({}, payload, { nudgeBefore: true }));
    await (timeoutMs > 0 ? withTimeout(retryTask, timeoutMs, 'CLICK_POINT_RETRY_TIMEOUT') : retryTask);
  }
  const waitMs = Math.max(0, Number((options && options.afterClickSleepMs) || 0));
  if (waitMs > 0) await sleep(waitMs);

  // Post-anchor verification
  if (postAnchor) {
    const anchorResult = await verifyPostAnchor(profileId, postAnchor);
    if (!anchorResult.ok) {
      throw new AnchorError('post_anchor_failed', postAnchor, anchorResult);
    }
  }
}

// ---------------------------------------------------------------------------
// Keyboard operations
// ---------------------------------------------------------------------------

/**
 * Press a single key (shortcut).
 * @param {string} profileId
 * @param {string} key - e.g. 'Enter', 'Meta+A', 'Backspace'
 * @param {object} [options]
 * @param {number} [options.timeoutMs=8000]
 */
export async function pressKey(profileId, key, options) {
  const opts = options || {};
  const timeoutMs = Math.max(500, Number(opts.timeoutMs || 8000));
  const postAnchor = opts.postAnchor;
  await withTimeout(
    callAPI('keyboard:press', { profileId, key: String(key || '').trim() }),
    timeoutMs,
    'KEY_PRESS_TIMEOUT',
  );

  // Post-anchor verification
  if (postAnchor) {
    const anchorResult = await verifyPostAnchor(profileId, postAnchor);
    if (!anchorResult.ok) {
      throw new AnchorError('post_anchor_failed', postAnchor, anchorResult);
    }
  }
}

/**
 * Type text via keyboard pipeline.
 * @deprecated Use fillInputValue instead (IME-safe). This function uses keyboard:type which is intercepted by CJK IME.
 * @param {string} profileId
 * @param {string} text
 * @param {number} [keyDelayMs=60]
 * @param {object} [options]
 */
export async function typeText(profileId, text, keyDelayMs, options) {
  const typeDelayMs = Math.max(0, Number(keyDelayMs) || 0);
  const estimatedTypeMs = Math.max(1200, String(text || '').length * Math.max(1, typeDelayMs) + 3200);
  const opts = options || {};
  const typeTimeoutMs = Math.max(1500, Number(opts.typeTimeoutMs || estimatedTypeMs));
  await withTimeout(
    callAPI('keyboard:type', { profileId, text: String(text || ''), delay: typeDelayMs }),
    typeTimeoutMs,
    'TYPE_TEXT_TIMEOUT',
  );
}

/**
 * Select-all + backspace + type text.
 * @deprecated Use fillInputValue instead (IME-safe).
 * @param {string} profileId
 * @param {string} text
 * @param {number} [keyDelayMs=60]
 * @param {object} [options]
 */
export async function clearAndType(profileId, text, keyDelayMs, options) {
  const opts = options || {};
  const actionTimeoutMs = Math.max(1500, Number(opts.actionTimeoutMs || 8000));
  const typeDelayMs = Math.max(0, Number(keyDelayMs) || 0);
  const estimatedTypeMs = Math.max(1200, String(text || '').length * Math.max(1, typeDelayMs) + 3200);
  const typeTimeoutMs = Math.max(actionTimeoutMs, Number(opts.typeTimeoutMs || estimatedTypeMs));
  const allowSelectFallback = opts.allowSelectFallback !== false;
  const skipSelectAll = opts.skipSelectAll === true;
  const allowProceedOnSelectFailure = opts.allowProceedOnSelectFailure === true;
  const primarySelectKey = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
  const fallbackSelectKey = process.platform === 'darwin' ? 'Control+A' : 'Meta+A';
  const postAnchor = opts.postAnchor;

  let selectOk = false;
  try {
    await withTimeout(
      skipSelectAll ? Promise.resolve() : pressKey(profileId, primarySelectKey),
      actionTimeoutMs,
      'CLEAR_AND_TYPE_SELECT_TIMEOUT',
    );
    if (!skipSelectAll) selectOk = true;
  } catch (error) {
    if (skipSelectAll) { /* skip */ }
    else if (!allowSelectFallback) {
      if (!allowProceedOnSelectFailure) throw error;
    } else {
      try {
        await withTimeout(
          skipSelectAll ? Promise.resolve() : pressKey(profileId, fallbackSelectKey),
          actionTimeoutMs,
          'CLEAR_AND_TYPE_SELECT_FALLBACK_TIMEOUT',
        );
        if (!skipSelectAll) selectOk = true;
      } catch (fallbackError) {
        if (!allowProceedOnSelectFailure) throw fallbackError;
      }
    }
  }
  try {
    await withTimeout(
      skipSelectAll ? Promise.resolve() : pressKey(profileId, 'Backspace'),
      actionTimeoutMs,
      'CLEAR_AND_TYPE_BACKSPACE_TIMEOUT',
    );
  } catch (error) {
    if (!allowProceedOnSelectFailure || selectOk) throw error;
  }
  await withTimeout(
    callAPI('keyboard:type', { profileId, text: String(text || ''), delay: typeDelayMs }),
    typeTimeoutMs,
    'CLEAR_AND_TYPE_TYPE_TIMEOUT',
  );

  // Post-anchor verification
  if (postAnchor) {
    const anchorResult = await verifyPostAnchor(profileId, postAnchor);
    if (!anchorResult.ok) {
      throw new AnchorError('post_anchor_failed', postAnchor, anchorResult);
    }
  }
}



/**
 * Simulate mouse wheel (PageDown/PageUp keys).
 * @param {string} profileId
 * @param {number} deltaY - Positive = down, negative = up
 */
export async function wheel(profileId, deltaY, options) {
  const opts = options || {};
  const postAnchor = opts.postAnchor;
  const raw = Number(deltaY) || 0;
  const key = raw >= 0 ? 'PageDown' : 'PageUp';
  const steps = Math.max(1, Math.min(8, Math.round(Math.abs(raw) / 420) || 1));
  for (let step = 0; step < steps; step += 1) {
    await pressKey(profileId, key);
    await sleep(80);
  }

  // Post-anchor verification
  if (postAnchor) {
    const anchorResult = await verifyPostAnchor(profileId, postAnchor);
    if (!anchorResult.ok) {
      throw new AnchorError('post_anchor_failed', postAnchor, anchorResult);
    }
  }
}
