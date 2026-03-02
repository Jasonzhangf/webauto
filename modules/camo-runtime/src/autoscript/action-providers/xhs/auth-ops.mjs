import { asErrorPayload } from '../../../container/runtime-core/utils.mjs';
import { runEvaluateScript, extractEvaluateResultData } from './common.mjs';

export function buildAssertLoggedInScript(params = {}) {
  const selectors = Array.isArray(params.loginSelectors) && params.loginSelectors.length > 0
    ? params.loginSelectors.map((item) => String(item || '').trim()).filter(Boolean)
    : ['.login-container', '.login-dialog', '#login-container'];
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

export async function executeAssertLoggedInOperation({ profileId, params = {} }) {
  const payload = await runEvaluateScript({ profileId, script: buildAssertLoggedInScript(params), highlight: false });
  const data = extractEvaluateResultData(payload) || {};
  if (data?.hasLoginGuard === true) {
    const code = String(params.code || 'LOGIN_GUARD_DETECTED').trim() || 'LOGIN_GUARD_DETECTED';
    return asErrorPayload('OPERATION_FAILED', code, { guard: data });
  }
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_assert_logged_in done', data };
}

export function handleRaiseError({ params }) {
  const code = String(params.code || params.message || 'AUTOSCRIPT_ABORT').trim();
  return asErrorPayload('OPERATION_FAILED', code || 'AUTOSCRIPT_ABORT');
}
