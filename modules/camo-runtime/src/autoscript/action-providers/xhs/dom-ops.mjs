import { callAPI } from '../../../utils/browser-service.mjs';
import { clamp } from './utils.mjs';
import { normalizeArray } from '../../../container/runtime-core/utils.mjs';
import { extractEvaluateResultData, runEvaluateScript } from './common.mjs';
import { withSerializedLock, getProfileState } from './state.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

function withTimeout(promise, timeoutMs, code = 'OP_TIMEOUT') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(code);
      (error).code = code;
      reject(error);
    }, Math.max(0, timeoutMs));
    promise.then((result) => { clearTimeout(timer); resolve(result); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

export async function evaluateReadonly(profileId, script) {
  const payload = await runEvaluateScript({
    profileId,
    script,
    highlight: false,
  });
  return extractEvaluateResultData(payload) || payload?.result || payload?.data || payload || {};
}

export async function readLocation(profileId, options = {}) {
  const timeoutMs = Math.max(300, Number(options.timeoutMs ?? 8000) || 8000);
  const fallback = String(options.fallback ?? '');
  const throwOnError = options.throwOnError === true;
  try {
    const payload = await withTimeout(
      evaluateReadonly(profileId, '(() => String(location.href || ""))()'),
      timeoutMs,
      'READ_LOCATION_TIMEOUT',
    );
    return String(payload || '');
  } catch (error) {
    if (throwOnError) throw error;
    return fallback;
  }
}

export async function clickPoint(profileId, point, options = {}) {
  const nudgeBefore = options?.nudgeBefore === true;
  const retryOnFailure = options?.retryOnFailure !== false && !nudgeBefore;
  const payload = {
    profileId,
    x: Math.max(1, Math.round(Number(point.x) || 1)),
    y: Math.max(1, Math.round(Number(point.y) || 1)),
    button: String(options.button || 'left').trim() || 'left',
    clicks: Math.max(1, Number(options.clicks ?? 1) || 1),
    ...(nudgeBefore ? { nudgeBefore: true } : {}),
  };
  try {
    await callAPI('mouse:click', payload);
  } catch (error) {
    if (!retryOnFailure) throw error;
    await callAPI('mouse:click', { ...payload, nudgeBefore: true });
  }
}

export async function wheel(profileId, deltaY) {
  const raw = Number(deltaY) || 0;
  const key = raw >= 0 ? 'PageDown' : 'PageUp';
  const steps = Math.max(1, Math.min(8, Math.round(Math.abs(raw) / 420) || 1));
  for (let step = 0; step < steps; step += 1) {
    await pressKey(profileId, key);
    await sleep(80);
  }
}

export async function pressKey(profileId, key) {
  await callAPI('keyboard:press', {
    profileId,
    key: String(key || '').trim(),
  });
}

export async function clearAndType(profileId, text, keyDelayMs = 60) {
  await pressKey(profileId, process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await pressKey(profileId, 'Backspace');
  await callAPI('keyboard:type', {
    profileId,
    text: String(text || ''),
    delay: Math.max(0, Number(keyDelayMs) || 0),
  });
}

export { sleep, withTimeout };

export async function resolveSelectorTarget(profileId, selectors, options = {}) {
  const normalizedSelectors = normalizeArray(selectors)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (normalizedSelectors.length === 0) return null;
  const minVisibleRatio = clamp(Number(options.minVisibleRatio ?? 0) || 0, 0, 1);
  const script = `(() => {
    const selectors = ${JSON.stringify(normalizedSelectors)};
    const requireViewport = ${options.requireViewport !== false ? 'true' : 'false'};
    const includeText = ${options.includeText === true ? 'true' : 'false'};
    const minVisibleRatio = ${JSON.stringify(minVisibleRatio)};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        const opacity = Number.parseFloat(String(style.opacity || '1'));
        if (Number.isFinite(opacity) && opacity <= 0.01) return false;
      } catch {
        return false;
      }
      return true;
    };
    const inViewport = (rect) => {
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      return rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
    };
    const hitVisible = (node, rect) => {
      if (!(node instanceof Element) || !rect) return false;
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      if (vw <= 0 || vh <= 0) return false;
      const x = Math.max(0, Math.min(vw - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(vh - 1, rect.top + rect.height / 2));
      const top = document.elementFromPoint(x, y);
      if (!top) return false;
      return top === node || node.contains(top) || top.contains(node);
    };
    const toPayload = (selector, node) => {
      const rect = node.getBoundingClientRect();
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      const center = {
        x: Math.max(1, Math.min(Math.max(1, vw - 1), Math.round(rect.left + rect.width / 2))),
        y: Math.max(1, Math.min(Math.max(1, vh - 1), Math.round(rect.top + rect.height / 2))),
      };
      const payload = {
        selector,
        center,
        rect: {
          left: Number(rect.left || 0),
          top: Number(rect.top || 0),
          width: Number(rect.width || 0),
          height: Number(rect.height || 0),
        },
        viewport: { width: vw, height: vh },
      };
      if (includeText) payload.text = String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      return payload;
    };
    const meetsVisibleRatio = (rect) => {
      if (!rect) return false;
      if (minVisibleRatio <= 0) return true;
      const vw = Number(window.innerWidth || 0);
      const vh = Number(window.innerHeight || 0);
      if (vw <= 0 || vh <= 0) return false;
      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(vw, rect.right);
      const visibleBottom = Math.min(vh, rect.bottom);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleArea = visibleWidth * visibleHeight;
      const totalArea = Math.max(1, Number(rect.width || 0) * Number(rect.height || 0));
      const visibleRatio = Math.max(0, Math.min(1, visibleArea / totalArea));
      return visibleRatio >= minVisibleRatio;
    };
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const rect = node.getBoundingClientRect();
        if (!meetsVisibleRatio(rect)) continue;
        if (requireViewport && !inViewport(rect)) continue;
        if (requireViewport && !hitVisible(node, rect)) continue;
        return { ok: true, target: toPayload(selector, node) };
      }
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const rect = node.getBoundingClientRect();
        if (!meetsVisibleRatio(rect)) continue;
        return { ok: true, target: toPayload(selector, node) };
      }
    }
    return { ok: false };
  })()`;
  const payload = await evaluateReadonly(profileId, script);
  if (!payload || payload.ok !== true || !payload.target?.center) return null;
  return payload.target;
}
