import { callAPI } from '../../../utils/browser-service.mjs';
import { clamp } from './utils.mjs';
import { normalizeArray } from '../../../container/runtime-core/utils.mjs';
import { extractEvaluateResultData, runEvaluateScript } from './common.mjs';
import { withSerializedLock, getProfileState } from './state.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

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

export async function evaluateReadonly(profileId, script, options = {}) {
  const timeoutMs = Math.max(2000, Number(options?.timeoutMs) || 12000);
  try {
    const payload = await withTimeout(
      runEvaluateScript({
        profileId,
        script,
        highlight: false,
        timeoutMs,
      }),
      timeoutMs + 1500,
      'EVALUATE_TIMEOUT',
    );
    return extractEvaluateResultData(payload) || payload?.result || payload?.data || payload || {};
  } catch (error) {
    if (String(error?.code || '') === 'EVALUATE_TIMEOUT' && options?.onTimeout === 'return') {
      return {
        ok: false,
        code: 'EVALUATE_TIMEOUT',
        timeout: true,
      };
    }
    throw error;
  }
}

const HIGHLIGHT_STATE_STYLE = {
  matched: {
    color: 'rgba(34, 197, 94, 0.96)',
    fill: 'rgba(34, 197, 94, 0.10)',
    point: 'rgba(34, 197, 94, 0.98)',
  },
  focus: {
    color: 'rgba(250, 204, 21, 0.98)',
    fill: 'rgba(250, 204, 21, 0.12)',
    point: 'rgba(250, 204, 21, 0.98)',
  },
  processed: {
    color: 'rgba(59, 130, 246, 0.98)',
    fill: 'rgba(59, 130, 246, 0.12)',
    point: 'rgba(59, 130, 246, 0.98)',
  },
};

function resolveHighlightStyle(state = 'focus') {
  return HIGHLIGHT_STATE_STYLE[String(state || 'focus').trim().toLowerCase()] || HIGHLIGHT_STATE_STYLE.focus;
}

function buildVisualHighlightScript(config = {}) {
  return `(() => {
    const config = ${JSON.stringify(config)};
    const layerId = '__xhs_operation_visual_layer';
    const registryKey = '__xhsOperationVisualRegistry';
    const ensureLayer = () => {
      let layer = document.getElementById(layerId);
      if (!(layer instanceof HTMLElement)) {
        layer = document.createElement('div');
        layer.id = layerId;
        layer.style.cssText = [
          'position:fixed',
          'inset:0',
          'pointer-events:none',
          'z-index:2147483647',
        ].join(';');
        document.documentElement.appendChild(layer);
      }
      return layer;
    };
    const registry = window[registryKey] && typeof window[registryKey] === 'object'
      ? window[registryKey]
      : (window[registryKey] = Object.create(null));
    const clearChannel = (channel) => {
      if (!channel) return;
      const entry = registry[channel];
      if (!entry) return;
      if (entry.timer) {
        try { clearTimeout(entry.timer); } catch {}
      }
      const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
      for (const node of nodes) {
        try { node.remove(); } catch {}
      }
      delete registry[channel];
    };
    if (config.clearOnly === true) {
      clearChannel(String(config.channel || 'default'));
      return { ok: true, cleared: true, channel: String(config.channel || 'default') };
    }
    const channel = String(config.channel || 'default');
    clearChannel(channel);
    const layer = ensureLayer();
    const nodes = [];
    const color = String(config.color || 'rgba(250, 204, 21, 0.98)');
    const fill = String(config.fill || 'rgba(250, 204, 21, 0.12)');
    const pointColor = String(config.pointColor || color);
    const label = String(config.label || '').trim();
    const addNode = (node) => {
      if (!(node instanceof HTMLElement)) return;
      layer.appendChild(node);
      nodes.push(node);
    };
    const rect = config.rect && typeof config.rect === 'object' ? config.rect : null;
    if (rect && Number(rect.width || 0) > 1 && Number(rect.height || 0) > 1) {
      const box = document.createElement('div');
      box.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'box-sizing:border-box',
        'border-radius:10px',
        'box-shadow:0 0 0 2px ' + color + ', 0 0 0 9999px rgba(0,0,0,0)',
        'border:2px solid ' + color,
        'background:' + fill,
        'transition:opacity 120ms ease',
      ].join(';');
      box.style.left = Math.round(Number(rect.left || 0)) + 'px';
      box.style.top = Math.round(Number(rect.top || 0)) + 'px';
      box.style.width = Math.max(2, Math.round(Number(rect.width || 0))) + 'px';
      box.style.height = Math.max(2, Math.round(Number(rect.height || 0))) + 'px';
      addNode(box);
      if (label) {
        const tag = document.createElement('div');
        tag.textContent = label;
        tag.style.cssText = [
          'position:fixed',
          'pointer-events:none',
          'padding:2px 8px',
          'border-radius:999px',
          'font:600 12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          'letter-spacing:0.02em',
          'background:' + color,
          'color:#111827',
          'box-shadow:0 6px 18px rgba(0,0,0,0.18)',
          'white-space:nowrap',
        ].join(';');
        tag.style.left = Math.max(4, Math.round(Number(rect.left || 0))) + 'px';
        tag.style.top = Math.max(4, Math.round(Number(rect.top || 0) - 26)) + 'px';
        addNode(tag);
      }
    }
    const center = config.center && typeof config.center === 'object' ? config.center : null;
    if (center && Number.isFinite(Number(center.x)) && Number.isFinite(Number(center.y))) {
      const x = Math.round(Number(center.x || 0));
      const y = Math.round(Number(center.y || 0));
      const dot = document.createElement('div');
      dot.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'width:16px',
        'height:16px',
        'border-radius:999px',
        'border:3px solid ' + pointColor,
        'background:rgba(255,255,255,0.92)',
        'transform:translate(-50%, -50%)',
        'box-shadow:0 0 0 4px rgba(17,24,39,0.12)',
      ].join(';');
      dot.style.left = x + 'px';
      dot.style.top = y + 'px';
      addNode(dot);
      const crossH = document.createElement('div');
      crossH.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'width:24px',
        'height:2px',
        'background:' + pointColor,
        'transform:translate(-50%, -50%)',
      ].join(';');
      crossH.style.left = x + 'px';
      crossH.style.top = y + 'px';
      addNode(crossH);
      const crossV = document.createElement('div');
      crossV.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'width:2px',
        'height:24px',
        'background:' + pointColor,
        'transform:translate(-50%, -50%)',
      ].join(';');
      crossV.style.left = x + 'px';
      crossV.style.top = y + 'px';
      addNode(crossV);
    }
    const sticky = config.sticky === true;
    const duration = Math.max(0, Number(config.duration || 0));
    const entry = { nodes, timer: null };
    if (!sticky && duration > 0) {
      entry.timer = setTimeout(() => clearChannel(channel), duration);
    }
    registry[channel] = entry;
    return { ok: true, channel, count: nodes.length };
  })()`;
}

export async function highlightVisualTarget(profileId, target, options = {}) {
  const timeoutMs = Math.max(30000, Number(options.timeoutMs ?? 60000) || 60000);
  const style = resolveHighlightStyle(options.state || 'focus');
  const rect = target?.rect && typeof target.rect === 'object'
    ? {
        left: Number(target.rect.left || 0),
        top: Number(target.rect.top || 0),
        width: Number(target.rect.width || 0),
        height: Number(target.rect.height || 0),
      }
    : null;
  const center = target?.center && typeof target.center === 'object'
    ? {
        x: Math.max(1, Math.round(Number(target.center.x) || 1)),
        y: Math.max(1, Math.round(Number(target.center.y) || 1)),
      }
    : null;
  await runEvaluateScript({
    profileId,
    script: buildVisualHighlightScript({
      channel: String(options.channel || 'default').trim() || 'default',
      color: options.color || style.color,
      fill: options.fill || style.fill,
      pointColor: options.pointColor || style.point,
      label: String(options.label || '').trim(),
      sticky: options.sticky === true,
      duration: Math.max(0, Number(options.duration ?? 1800) || 0),
      rect,
      center,
    }),
    highlight: false,
    allowUnsafeJs: true,
    timeoutMs,
  });
}

export async function clearVisualHighlight(profileId, channel) {
  await runEvaluateScript({
    profileId,
    script: buildVisualHighlightScript({
      channel: String(channel || 'default').trim() || 'default',
      clearOnly: true,
    }),
    highlight: false,
    allowUnsafeJs: true,
  });
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
  const timeoutMs = Math.max(0, Number(options?.timeoutMs ?? 0) || 0);
  const payload = {
    profileId,
    x: Math.max(1, Math.round(Number(point.x) || 1)),
    y: Math.max(1, Math.round(Number(point.y) || 1)),
    button: String(options.button || 'left').trim() || 'left',
    clicks: Math.max(1, Number(options.clicks ?? 1) || 1),
    ...(nudgeBefore ? { nudgeBefore: true } : {}),
  };
  try {
    const task = callAPI('mouse:click', payload);
    await (timeoutMs > 0 ? withTimeout(task, timeoutMs, 'CLICK_POINT_TIMEOUT') : task);
  } catch (error) {
    if (!retryOnFailure) throw error;
    const retryTask = callAPI('mouse:click', { ...payload, nudgeBefore: true });
    await (timeoutMs > 0 ? withTimeout(retryTask, timeoutMs, 'CLICK_POINT_RETRY_TIMEOUT') : retryTask);
  }
  const waitMs = Math.max(0, Number(options.afterClickSleepMs ?? 0) || 0);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

export async function scrollBySelector(profileId, selector, options = {}) {
  const normalizedSelector = String(selector || '').trim();
  if (!normalizedSelector) throw new Error('scrollBySelector requires selector');
  const amount = Math.max(1, Math.round(Number(options.amount ?? 300) || 300));
  const direction = String(options.direction || 'down').trim().toLowerCase() === 'up' ? 'up' : 'down';
  const shouldEnsureFocus = options.ensureScrollFocus !== false;
  const target = await evaluateReadonly(profileId, `(() => {
    const node = document.querySelector("${normalizedSelector}");
    if (!(node instanceof Element)) return { found: false, reason: 'selector_not_found' };
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width <= 1 || rect.height <= 1) return { found: false, reason: 'selector_not_visible' };
    return {
      found: true,
      rect: {
        left: Number(rect.left || 0),
        top: Number(rect.top || 0),
        width: Number(rect.width || 0),
        height: Number(rect.height || 0),
      },
      center: {
        x: Math.max(1, Math.round(rect.left + rect.width / 2)),
        y: Math.max(1, Math.round(rect.top + Math.min(rect.height / 2, 48))),
      },
    };
  })()`);
  if (!target?.found || !target?.center) {
    throw new Error(`scrollBySelector target unavailable: ${target?.reason || 'unknown'}`);
  }
  if (shouldEnsureFocus) {
    await evaluateReadonly(profileId, `(() => {
      const node = document.querySelector("${normalizedSelector}");
      if (!(node instanceof Element)) return { ok: false, reason: 'selector_not_found' };
      try {
        if (typeof node.tabIndex !== 'number' || node.tabIndex < 0) node.tabIndex = 0;
        node.focus?.();
        return { ok: document.activeElement === node, tabIndex: node.tabIndex };
      } catch (error) {
        return { ok: false, reason: String(error?.message || error) };
      }
    })()`);
  }
  const focusTarget = options.focusTarget && typeof options.focusTarget === 'object' && options.focusTarget.center
    ? {
        ...target,
        rect: options.focusTarget.rect && typeof options.focusTarget.rect === 'object'
          ? { ...options.focusTarget.rect }
          : target.rect,
        center: {
          x: Math.max(1, Math.round(Number(options.focusTarget.center.x) || target.center.x || 1)),
          y: Math.max(1, Math.round(Number(options.focusTarget.center.y) || target.center.y || 1)),
        },
      }
    : target;
  if (options.highlight !== false) {
    // Fire-and-forget: highlight is cosmetic (red border flash), don't block scrolling
    highlightVisualTarget(profileId, focusTarget, {
      channel: 'xhs-scroll-anchor',
      state: 'focus',
      label: `scroll ${direction}`,
      duration: 1800,
    }).catch(() => { /* ignore highlight errors during scroll */ });
  }
  const focusClickTimeoutMs = Math.max(800, Number(options.focusClickTimeoutMs ?? options.clickTimeoutMs ?? 5000) || 5000);
  if (options.skipFocusClick !== true) {
    await clickPoint(profileId, focusTarget.center, {
      button: 'left',
      clicks: 1,
      nudgeBefore: false,
      timeoutMs: focusClickTimeoutMs,
      afterClickSleepMs: 1200,
    });
  } else {
    await sleep(240);
  }
  // Skip mouse:wheel and go directly to keyboard-based scrolling
  // mouse:wheel with anchor coordinates often fails to scroll the correct container
  // Keyboard PageUp/PageDown is more reliable for container-specific scrolling
  const axis = direction === 'up' || direction === 'down' ? 'vertical' : 'horizontal';
  const primaryKey = direction === 'up' ? 'PageUp' : direction === 'down' ? 'PageDown' : direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
  const fallbackKey = direction === 'up' ? 'ArrowUp' : direction === 'down' ? 'ArrowDown' : primaryKey;
  const steps = axis === 'vertical'
    ? Math.max(2, Math.min(8, Math.round(amount / 420) + 1))
    : Math.max(1, Math.min(6, Math.round(amount / 240) + 1));
  for (let step = 0; step < steps; step += 1) {
    await callAPI('keyboard:press', { profileId, key: primaryKey });
    await sleep(220);
  }
  if (axis === 'vertical') {
    await callAPI('keyboard:press', { profileId, key: fallbackKey });
    await sleep(180);
  }
  return { ok: true, mode: 'keyboard', key: primaryKey, fallbackKey, steps, amount, selector: normalizedSelector };
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

export async function pressKey(profileId, key, options = {}) {
  const timeoutMs = Math.max(500, Number(options?.timeoutMs ?? 8000) || 8000);
  await withTimeout(
    callAPI('keyboard:press', {
      profileId,
      key: String(key || '').trim(),
    }),
    timeoutMs,
    'KEY_PRESS_TIMEOUT',
  );
}

export async function typeText(profileId, text, keyDelayMs = 60, options = {}) {
  const typeDelayMs = Math.max(0, Number(keyDelayMs) || 0);
  const estimatedTypeMs = Math.max(1200, String(text || '').length * Math.max(1, typeDelayMs) + 3200);
  const typeTimeoutMs = Math.max(1500, Number(options?.typeTimeoutMs ?? estimatedTypeMs) || estimatedTypeMs);
  await withTimeout(
    callAPI('keyboard:type', {
      profileId,
      text: String(text || ''),
      delay: typeDelayMs,
    }),
    typeTimeoutMs,
    'TYPE_TEXT_TIMEOUT',
  );
}

export async function clearAndType(profileId, text, keyDelayMs = 60, options = {}) {
  const actionTimeoutMs = Math.max(1500, Number(options?.actionTimeoutMs ?? 8000) || 8000);
  const typeDelayMs = Math.max(0, Number(keyDelayMs) || 0);
  const estimatedTypeMs = Math.max(1200, String(text || '').length * Math.max(1, typeDelayMs) + 3200);
  const typeTimeoutMs = Math.max(actionTimeoutMs, Number(options?.typeTimeoutMs ?? estimatedTypeMs) || estimatedTypeMs);
  const allowSelectFallback = options?.allowSelectFallback !== false;
  const skipSelectAll = options?.skipSelectAll === true;
  const allowProceedOnSelectFailure = options?.allowProceedOnSelectFailure === true;
  const primarySelectKey = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
  const fallbackSelectKey = process.platform === 'darwin' ? 'Control+A' : 'Meta+A';

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
    callAPI('keyboard:type', {
      profileId,
      text: String(text || ''),
      delay: typeDelayMs,
    }),
    typeTimeoutMs,
    'CLEAR_AND_TYPE_TYPE_TIMEOUT',
  );
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

/**
 * 直接设置输入框的值，绕过输入法和 input pipeline。
 * 使用 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set 
 * 来避免 React/Vue 等框架的 value 受控组件限制。
 * 
 * 注意：此方法不触发键盘事件，只触发 input/change 事件。
 * 适用于输入法可能干扰 keyboard.type 的场景。
 */
export async function fillInputValue(profileId, selectors, value, options = {}) {
  const normalizedSelectors = normalizeArray(selectors)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (normalizedSelectors.length === 0) {
    throw new Error('FILL_INPUT_NO_SELECTORS');
  }
  
  const timeoutMs = Math.max(1000, Number(options?.timeoutMs ?? 5000) || 5000);
  const script = `
    (function() {
      const selectors = ${JSON.stringify(normalizedSelectors)};
      const value = ${JSON.stringify(String(value || ''))};
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.tagName === 'INPUT') {
          // 先聚焦元素，确保后续键盘事件能正确发送
          el.focus();
          el.click();
          
          // 使用原生 setter 绕过 React/Vue 受控组件
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          ).set;
          nativeInputValueSetter.call(el, value);
          
          // 触发 input 和 change 事件
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          
          return {
            ok: true,
            selector: sel,
            value: el.value,
            length: el.value.length
          };
        }
      }
      return { ok: false, error: 'INPUT_NOT_FOUND', selectors };
    })()
  `;
  
  const result = await runEvaluateScript({ profileId, script, timeoutMs, allowUnsafeJs: true });
  const data = extractEvaluateResultData(result);
  
  if (!data?.ok) {
    throw new Error(data?.error || 'FILL_INPUT_FAILED');
  }
  
  return data;
}

/**
 * waitForAnchor - 锚点驱动的等待函数
 * 最大等待时间内轮询检查锚点，锚点出现立即返回。不是傻等。
 *
 * @param {string} profileId
 * @param {object} options
 * @param {string|string[]} options.selectors - CSS selectors（任一匹配=成功）
 * @param {function} options.probe - 自定义 async probe（返回 truthy=成功）
 * @param {number} options.timeoutMs - 单次最大等待时间（default 5000）
 * @param {number} options.retryCount - 最大重试次数（default 3）
 * @param {number} options.intervalMs - 轮询间隔（default 300）
 * @returns {{ ok: boolean, elapsed: number, reason: string|null, result: any|null }}
 */
export async function waitForAnchor(profileId, options = {}) {
  const {
    selectors = [],
    probe = null,
    timeoutMs = 5000,
    retryCount = 3,
    intervalMs = 300,
    description = 'waitForAnchor',
  } = options;

  const normalizedSelectors = (Array.isArray(selectors) ? selectors : [String(selectors)]).filter(Boolean);
  const hasSelectors = normalizedSelectors.length > 0;
  const hasProbe = typeof probe === 'function';
  if (!hasSelectors && !hasProbe) {
    return { ok: false, elapsed: 0, reason: 'no_selectors_or_probe', result: null };
  }

  const start = Date.now();
  const effectiveInterval = Math.max(100, Math.min(2000, Number(intervalMs) || 300));
  const effectiveTimeout = Math.max(1000, Number(timeoutMs) || 5000);
  const effectiveRetryCount = Math.max(1, Number(retryCount) || 3);

  const checkSelectors = async () => {
    if (!hasSelectors) return null;
    const script = `(() => {
      const selectors = ${JSON.stringify(normalizedSelectors)};
      for (const sel of selectors) {
        const node = document.querySelector(sel);
        if (node) {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          if (style && style.display !== 'none' && style.visibility !== 'hidden') {
            return { found: true, selector: sel, count: document.querySelectorAll(sel).length };
          }
        }
      }
      return { found: false };
    })()`;
    try {
      return await evaluateReadonly(profileId, script, { timeoutMs: 3000, onTimeout: 'return' });
    } catch {
      return { found: false };
    }
  };

  for (let attempt = 1; attempt <= effectiveRetryCount; attempt += 1) {
    const attemptStart = Date.now();
    while (Date.now() - attemptStart < effectiveTimeout) {
      if (hasSelectors) {
        const selResult = await checkSelectors();
        if (selResult?.found) {
          return {
            ok: true,
            elapsed: Date.now() - start,
            reason: 'selector_found',
            result: selResult,
            attempt,
          };
        }
      }
      if (hasProbe) {
        try {
          const probeResult = await probe();
          if (probeResult) {
            return {
              ok: true,
              elapsed: Date.now() - start,
              reason: 'probe_succeeded',
              result: probeResult,
              attempt,
            };
          }
        } catch {
          // probe error = not ready, continue polling
        }
      }
      await sleep(Math.max(80, effectiveInterval));
    }
  }

  return {
    ok: false,
    elapsed: Date.now() - start,
    reason: 'timeout',
    result: null,
    attempts: effectiveRetryCount,
  };
}
