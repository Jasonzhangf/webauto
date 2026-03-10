import { callAPI } from '../../../utils/browser-service.mjs';
import { asErrorPayload, isCheckpointRiskUrl } from '../../../container/runtime-core/utils.mjs';
import { runEvaluateScript, extractEvaluateResultData } from './common.mjs';
import { normalizeXhsLoginSignal } from '../../../utils/xhs-login-signal.mjs';
import { clearXhsPendingQueues } from './state.mjs';

export const XHS_LOGIN_GUARD_SELECTORS = ['.login-container', '.login-dialog', '#login-container'];
export const XHS_RISK_GUARD_SELECTORS = ['.qrcode-box', '.captcha-container', '[class*="captcha"]'];
export const XHS_RISK_STOP_CODES = new Set(['LOGIN_GUARD_DETECTED', 'RISK_CONTROL_DETECTED']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function buildAssertLoggedInScript(params = {}) {
  const selectors = Array.isArray(params.loginSelectors) && params.loginSelectors.length > 0
    ? params.loginSelectors.map((item) => String(item || '').trim()).filter(Boolean)
    : XHS_LOGIN_GUARD_SELECTORS;
  const loginPattern = String(params.loginPattern || '登录 | 扫码 | 验证码 | 手机号 | 请先登录 | 注册 |sign\\s*in').trim();
  return `(() => {
    const guardSelectors = ${JSON.stringify(selectors)};
    const loginPattern = new RegExp(${JSON.stringify(loginPattern)}, 'i');
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const guardNodes = guardSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const visibleGuardNodes = guardNodes.filter((node) => isVisible(node));
    const guardTexts = visibleGuardNodes.slice(0, 10).map((node) => normalize(node.textContent || '')).filter(Boolean);
    const mergedGuardText = guardTexts.join(' ');
    const hasLoginText = loginPattern.test(mergedGuardText);
    const loginUrl = /\\/login|signin|passport|account\\/login/i.test(String(location.href || ''));
    let accountId = '';
    try {
      const initialState = (typeof window !== 'undefined' && window.__INITIAL_STATE__) || null;
      const rawUserInfo = initialState && initialState.user && initialState.user.userInfo
        ? ((initialState.user.userInfo._rawValue && typeof initialState.user.userInfo._rawValue === 'object' && initialState.user.userInfo._rawValue) || (initialState.user.userInfo._value && typeof initialState.user.userInfo._value === 'object' && initialState.user.userInfo._value) || (typeof initialState.user.userInfo === 'object' ? initialState.user.userInfo : null))
        : null;
      accountId = normalize(rawUserInfo?.user_id || rawUserInfo?.userId || '');
    } catch {}
    if (!accountId) {
      const selfAnchor = Array.from(document.querySelectorAll('a[href*="/user/profile/"]')).find((node) => {
        const text = normalize(node.textContent || '');
        const title = normalize(node.getAttribute('title') || '');
        const aria = normalize(node.getAttribute('aria-label') || '');
        return ['我', '我的', '个人主页', '我的主页'].includes(text) || ['我', '我的', '个人主页', '我的主页'].includes(title) || ['我', '我的', '个人主页', '我的主页'].includes(aria);
      });
      if (selfAnchor) {
        const href = normalize(selfAnchor.getAttribute('href') || '');
        const matched = href.match(/\\/user\\/profile\\/([^/?#]+)/);
        if (matched && matched[1]) accountId = normalize(matched[1]);
      }
    }
    return { hasLoginGuard: (visibleGuardNodes.length > 0 && hasLoginText) || loginUrl, hasAccountSignal: Boolean(accountId), accountId: accountId || null, url: String(location.href || ''), visibleGuardCount: visibleGuardNodes.length, guardTextPreview: mergedGuardText.slice(0, 240), loginUrl, hasLoginText, guardSelectors };
  })()`;
}

export function buildRiskGuardScript(params = {}) {
  const selectors = Array.isArray(params.riskSelectors) && params.riskSelectors.length > 0
    ? params.riskSelectors.map((item) => String(item || '').trim()).filter(Boolean)
    : XHS_RISK_GUARD_SELECTORS;
  return `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const nodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const visibleNodes = nodes.filter((node) => isVisible(node));
    const texts = visibleNodes.slice(0, 10).map((node) => normalize(node.textContent || '')).filter(Boolean);
    const href = String(location.href || '');
    const lower = href.toLowerCase();
    const riskUrl = lower.includes('/website-login/error')
      || lower.includes('/website-login/captcha')
      || lower.includes('/website-login/verify')
      || lower.includes('/website-login/security')
      || lower.includes('httpstatus=461')
      || lower.includes('verifytype=400')
      || lower.includes('verifyuuid=')
      || lower.includes('verifybiz=');
    return {
      hasRiskGuard: visibleNodes.length > 0 || riskUrl,
      visibleRiskCount: visibleNodes.length,
      riskTextPreview: texts.join(' ').slice(0, 240),
      riskUrl,
      url: href,
      riskSelectors: selectors,
    };
  })()`;
}

export function buildLoginGuardCloseTargetScript(params = {}) {
  const selectors = Array.isArray(params.loginCloseSelectors) && params.loginCloseSelectors.length > 0
    ? params.loginCloseSelectors.map((item) => String(item || '').trim()).filter(Boolean)
    : [
        '.login-container .close-button',
        '.login-dialog .close-button',
        '#login-container .close-button',
        '.login-container .icon-btn-wrapper.close-button',
        '.login-dialog .icon-btn-wrapper.close-button',
        '#login-container .icon-btn-wrapper.close-button',
        '.icon-btn-wrapper.close-button',
        '.login-container [class*="close"]',
        '.login-dialog [class*="close"]',
        '#login-container [class*="close"]',
      ];
  return `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    for (const selector of selectors) {
      const target = Array.from(document.querySelectorAll(selector)).find((node) => isVisible(node));
      if (!target) continue;
      const rect = target.getBoundingClientRect();
      return {
        found: true,
        selector,
        text: normalize(target.textContent || ''),
        ariaLabel: normalize(target.getAttribute('aria-label') || ''),
        title: normalize(target.getAttribute('title') || ''),
        center: {
          x: Math.max(1, Math.round(rect.left + rect.width / 2)),
          y: Math.max(1, Math.round(rect.top + rect.height / 2)),
        },
      };
    }
    return { found: false, selectors };
  })()`;
}

async function evaluateLoginScript({ profileId, script, testingOverrides = null }) {
  if (typeof testingOverrides?.evaluate === 'function') {
    return testingOverrides.evaluate({ profileId, script });
  }
  return runEvaluateScript({ profileId, script, highlight: false });
}

async function readLoginSignal({ profileId, params, testingOverrides }) {
  const payload = await evaluateLoginScript({
    profileId,
    script: buildAssertLoggedInScript(params),
    testingOverrides,
  });
  return normalizeXhsLoginSignal(extractEvaluateResultData(payload) || payload?.result || payload || {});
}

export async function readXhsInteractionGuard({ profileId, params = {}, testingOverrides = null }) {
  if (typeof testingOverrides?.readGuardSignal === 'function') {
    const raw = await testingOverrides.readGuardSignal({ profileId, params });
    const login = normalizeXhsLoginSignal(raw || {});
    const riskUrl = raw?.riskUrl === true || isCheckpointRiskUrl(raw?.url || '');
    const hasRiskGuard = raw?.hasRiskGuard === true || riskUrl;
    const stopCode = login.hasLoginGuard ? 'LOGIN_GUARD_DETECTED' : (hasRiskGuard ? 'RISK_CONTROL_DETECTED' : null);
    return {
      ...raw,
      ...login,
      riskUrl,
      hasRiskGuard,
      visibleRiskCount: Math.max(0, Number(raw?.visibleRiskCount || 0) || 0),
      riskTextPreview: String(raw?.riskTextPreview || '').trim(),
      stopCode,
    };
  }

  const login = await readLoginSignal({ profileId, params, testingOverrides });
  const riskPayload = await evaluateLoginScript({
    profileId,
    script: buildRiskGuardScript(params),
    testingOverrides,
  });
  const riskData = extractEvaluateResultData(riskPayload) || riskPayload?.result || riskPayload || {};
  const riskUrl = riskData?.riskUrl === true || isCheckpointRiskUrl(riskData?.url || '');
  const hasRiskGuard = riskData?.hasRiskGuard === true || riskUrl;
  const stopCode = login.hasLoginGuard ? 'LOGIN_GUARD_DETECTED' : (hasRiskGuard ? 'RISK_CONTROL_DETECTED' : null);
  return {
    ...login,
    riskUrl,
    hasRiskGuard,
    visibleRiskCount: Math.max(0, Number(riskData?.visibleRiskCount || 0) || 0),
    riskTextPreview: String(riskData?.riskTextPreview || '').trim(),
    url: String(riskData?.url || login?.url || '').trim(),
    stopCode,
  };
}

export function buildXhsGuardFailure({ profileId, guard = {}, stage = null, codeMode = 'guard' } = {}) {
  const stopCode = String(guard?.stopCode || '').trim() || 'RISK_CONTROL_DETECTED';
  clearXhsPendingQueues(profileId, {
    code: stopCode,
    reason: stopCode,
    stage,
  });
  const payload = {
    guard: {
      ...guard,
      stage: stage ? String(stage).trim() || null : null,
    },
  };
  if (codeMode === 'operation_failed') {
    return asErrorPayload('OPERATION_FAILED', stopCode, payload);
  }
  return {
    ok: false,
    code: stopCode,
    message: stopCode,
    data: payload,
  };
}

export async function executeAssertLoggedInOperation({ profileId, params = {}, context = {} }) {
  const testingOverrides = context?.testingOverrides && typeof context.testingOverrides === 'object'
    ? context.testingOverrides
    : null;
  const data = await readXhsInteractionGuard({ profileId, params, testingOverrides });
  if (data?.stopCode) {
    return buildXhsGuardFailure({
      profileId,
      guard: {
        ...data,
        stopCode: String(params.code || data.stopCode || 'LOGIN_GUARD_DETECTED').trim() || 'LOGIN_GUARD_DETECTED',
      },
      stage: 'assert_logged_in',
      codeMode: 'operation_failed',
    });
  }
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_assert_logged_in done', data };
}

export function handleRaiseError({ params }) {
  const code = String(params.code || params.message || 'AUTOSCRIPT_ABORT').trim();
  return asErrorPayload('OPERATION_FAILED', code || 'AUTOSCRIPT_ABORT');
}
