/**
 * @module shared/eval-ops
 * Cross-platform evaluate-script utilities.
 * Source: extracted from xhs/common.mjs (evaluate-related exports).
 */

import { callAPI } from './api-client.mjs';

// ---------------------------------------------------------------------------
// JS policy guard (optional — skip if js-policy.mjs not available)
// ---------------------------------------------------------------------------

let assertNoForbiddenJsAction = () => {};
try {
  const mod = await import('../../../utils/js-policy.mjs');
  if (typeof mod.assertNoForbiddenJsAction === 'function') {
    assertNoForbiddenJsAction = mod.assertNoForbiddenJsAction;
  }
} catch {
  // js-policy not available — skip forbidden action checks
}

// ---------------------------------------------------------------------------
// Operation highlight
// ---------------------------------------------------------------------------

/**
 * Wrap an evaluate script with a visual highlight flash (viewport + activeElement).
 * @param {string} script - JS expression to evaluate
 * @param {string} [color='#ff7a00'] - Highlight color
 * @returns {string} Wrapped script
 */
export function withOperationHighlight(script, color = '#ff7a00') {
  return `(() => {
    const flashNode = (node, duration = 420) => {
      if (!(node instanceof HTMLElement)) return;
      const prevOutline = node.style.outline;
      const prevOffset = node.style.outlineOffset;
      const prevTransition = node.style.transition;
      node.style.transition = 'outline 80ms ease';
      node.style.outline = '2px solid ${color}';
      node.style.outlineOffset = '2px';
      setTimeout(() => {
        node.style.outline = prevOutline;
        node.style.outlineOffset = prevOffset;
        node.style.transition = prevTransition;
      }, duration);
    };
    const flashViewport = (duration = 420) => {
      const root = document.documentElement;
      if (!(root instanceof HTMLElement)) return;
      const prevShadow = root.style.boxShadow;
      const prevTransition = root.style.transition;
      root.style.transition = 'box-shadow 80ms ease';
      root.style.boxShadow = 'inset 0 0 0 3px ${color}';
      setTimeout(() => {
        root.style.boxShadow = prevShadow;
        root.style.transition = prevTransition;
      }, duration);
    };
    flashViewport();
    const target = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : (document.body || document.documentElement);
    flashNode(target);
    return (${script});
  })()`;
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

const RUNTIME_EVAL_TIMEOUT_MS = 30000;

/**
 * Evaluate a script in the browser context via browser-service.
 * Includes runtime timeout protection and optional JS policy check.
 * @param {object} params
 * @param {string} params.profileId
 * @param {string} params.script - JS expression to evaluate
 * @param {boolean} [params.highlight=true]
 * @param {boolean} [params.allowUnsafeJs=false]
 * @param {number} [params.timeoutMs]
 * @returns {Promise<object>} Raw payload from browser-service
 */
export async function runEvaluateScript({
  profileId,
  script,
  highlight = true,
  allowUnsafeJs = false,
  timeoutMs,
}) {
  const sourceScript = String(script || '');
  if (!allowUnsafeJs) {
    assertNoForbiddenJsAction(sourceScript, 'shared:evaluate');
  }
  const wrappedScript = highlight ? withOperationHighlight(sourceScript) : sourceScript;
  const finalTimeoutMs = Number(timeoutMs) > 0 ? timeoutMs : undefined;
  const runtimeTimeoutMs = Number(timeoutMs) > 0
    ? Math.min(Number(timeoutMs), RUNTIME_EVAL_TIMEOUT_MS)
    : RUNTIME_EVAL_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`evaluate runtime timeout after ${runtimeTimeoutMs}ms`)),
      runtimeTimeoutMs,
    );
    callAPI('evaluate', { profileId, script: wrappedScript }, { timeoutMs: finalTimeoutMs })
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });
}

/**
 * Extract the result data from an evaluate payload.
 * Handles multiple response shapes: { result }, { data: { result } }, etc.
 * @param {object} payload
 * @returns {*}
 */
export function extractEvaluateResultData(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if ('result' in payload) return payload.result;
  if (payload.data && typeof payload.data === 'object' && 'result' in payload.data) {
    return payload.data.result;
  }
  return null;
}

/**
 * Extract base64 screenshot data from a screenshot payload.
 * @param {object} payload
 * @returns {string}
 */
export function extractScreenshotBase64(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.data === 'string' && payload.data) return payload.data;
  if (payload.result && typeof payload.result === 'object' && typeof payload.result.data === 'string') {
    return payload.result.data;
  }
  if (payload.data && typeof payload.data === 'object' && typeof payload.data.data === 'string') {
    return payload.data.data;
  }
  return '';
}

/**
 * Convenience: evaluate a script and return a standardised result.
 * @param {object} params
 * @returns {Promise<{ok: boolean, code: string, message: string, data: *}>}
 */
export async function evaluateWithScript({ profileId, script, message, highlight }) {
  const result = await runEvaluateScript({ profileId, script, highlight });
  return { ok: true, code: 'OPERATION_DONE', message, data: result };
}

/**
 * Create an evaluate-based action handler from a message and script builder.
 * @param {string} message
 * @param {function} buildScript - (params) => string
 * @returns {function({ profileId: string, params: object }): Promise<object>}
 */
export function createEvaluateHandler(message, buildScript) {
  return async ({ profileId, params }) => {
    const script = buildScript(params);
    const highlight = params.highlight !== false;
    return evaluateWithScript({ profileId, script, message, highlight });
  };
}
