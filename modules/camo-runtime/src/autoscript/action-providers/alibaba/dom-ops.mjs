// Alibaba.com DOM 操作模块 - 使用 camo 协议级操作
// 禁止使用页面 JS 触发任何交互行为

import { callAPI } from '../../../utils/browser-service.mjs';
import { extractEvaluateResultData, runEvaluateScript } from '../../shared/eval-ops.mjs';
import { sleep, withTimeout, sleepRandom } from '../../shared/dom-ops.mjs';

export { sleep, sleepRandom };

// evaluateReadonly - 仅用于锚点检测（低频单次调用）
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
      return { ok: false, code: 'EVALUATE_TIMEOUT', timeout: true };
    }
    throw error;
  }
}

// gotoUrl - 页面导航（协议级，action: 'goto'）
export async function gotoUrl(profileId, url, options = {}) {
  const timeoutMs = Math.max(5000, Number(options?.timeoutMs) || 15000);
  const result = await withTimeout(
    callAPI('goto', { profileId, url }),
    timeoutMs,
    'GOTO_TIMEOUT',
  );
  return result;
}

// clickPoint - 系统级点击（协议级，action: 'mouse:click'）
export async function clickPoint(profileId, point, options = {}) {
  const timeoutMs = Math.max(0, Number(options?.timeoutMs ?? 0) || 0);
  const payload = {
    profileId,
    x: Math.max(1, Math.round(Number(point.x) || 1)),
    y: Math.max(1, Math.round(Number(point.y) || 1)),
    button: String(options.button || 'left').trim() || 'left',
    clicks: Math.max(1, Number(options.clicks ?? 1) || 1),
  };
  const task = callAPI('mouse:click', payload);
  await (timeoutMs > 0 ? withTimeout(task, timeoutMs, 'CLICK_POINT_TIMEOUT') : task);
  const waitMs = Math.max(0, Number(options.afterClickSleepMs ?? 0) || 0);
  if (waitMs > 0) await sleep(waitMs);
}

// scrollPage - 系统级滚动（协议级）
export async function scrollPage(profileId, options = {}) {
  const amount = Math.max(1, Math.round(Number(options.amount ?? 300) || 300));
  const direction = String(options.direction || 'down').trim().toLowerCase();
  const payload = {
    profileId,
    direction,
    amount,
  };
  return callAPI('scroll', payload);
}

// pressKey - 系统���按键（协议级，action: 'keyboard:press'）
export async function pressKey(profileId, key, options = {}) {
  const timeoutMs = Math.max(0, Number(options?.timeoutMs ?? 0) || 0);
  const task = callAPI('keyboard:press', { profileId, key });
  await (timeoutMs > 0 ? withTimeout(task, timeoutMs, 'PRESS_KEY_TIMEOUT') : task);
}

// typeText - 系统级输入（协议级，action: 'keyboard:type'）
export async function typeText(profileId, text, options = {}) {
  const timeoutMs = Math.max(0, Number(options?.timeoutMs ?? 0) || 0);
  const task = callAPI('keyboard:type', { profileId, text });
  await (timeoutMs > 0 ? withTimeout(task, timeoutMs, 'TYPE_TEXT_TIMEOUT') : task);
}

// clickBySelector - 通过 selector 点击（先获取坐标，再 clickPoint）
export async function clickBySelector(profileId, selector, options = {}) {
  const target = await evaluateReadonly(profileId, `(() => {
    const node = document.querySelector("${selector}");
    if (!(node instanceof Element)) return { found: false, reason: 'selector_not_found' };
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width <= 1 || rect.height <= 1) return { found: false, reason: 'selector_not_visible' };
    return {
      found: true,
      center: {
        x: Math.max(1, Math.round(rect.left + rect.width / 2)),
        y: Math.max(1, Math.round(rect.top + rect.height / 2)),
      },
    };
  })()`);
  
  if (!target?.found || !target?.center) {
    return { ok: false, reason: target?.reason || 'target_not_found' };
  }
  
  await clickPoint(profileId, target.center, options);
  return { ok: true, selector, center: target.center };
}

// waitForAnchor - 等待锚点出现（轮询检测）
export async function waitForAnchor(profileId, selectors, options = {}) {
  const timeoutMs = Math.max(1000, Number(options?.timeoutMs) || 10000);
  const intervalMs = Math.max(100, Number(options?.intervalMs) || 500);
  const startTime = Date.now();
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await evaluateReadonly(profileId, `(() => {
      const selectors = ${JSON.stringify(selectorList)};
      for (const sel of selectors) {
        const node = document.querySelector(sel);
        if (node && node.offsetParent !== null) {
          const rect = node.getBoundingClientRect?.();
          if (rect && rect.width > 1 && rect.height > 1) {
            return { found: true, selector: sel };
          }
        }
      }
      return { found: false };
    })()`);
    
    if (result?.found) {
      return { ok: true, found: true, selector: result.selector };
    }
    
    await sleep(intervalMs);
  }
  
  return { ok: false, reason: 'timeout', timeoutMs };
}
