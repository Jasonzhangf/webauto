import { callAPI, getDomSnapshotByProfile } from '../../utils/browser-service.mjs';
import {
  asErrorPayload,
  buildSelectorCheck,
  ensureActiveSession,
  getCurrentUrl,
  isCheckpointRiskUrl,
  maybeSelector,
  normalizeArray,
} from './utils.mjs';

export const XHS_CHECKPOINTS = {
  search_ready: [
    '#search-input',
    'input.search-input',
    '.search-result-list',
  ],
  home_ready: [
    '.feeds-page',
    '.note-item',
  ],
  detail_ready: [
    '.note-scroller',
    '.note-content',
    '.interaction-container',
  ],
  comments_ready: [
    '.comments-container',
    '.comment-item',
  ],
  login_guard: [
    '.login-container',
    '.login-dialog',
    '#login-container',
  ],
  risk_control: [
    '.qrcode-box',
    '.captcha-container',
    '[class*="captcha"]',
  ],
};

function extractEvaluateResult(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.result && typeof payload.result === 'object') return payload.result;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return payload;
}

async function detectXhsLoginSignal(profileId) {
  const script = `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const selectors = ${JSON.stringify(XHS_CHECKPOINTS.login_guard)};
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
    const guardText = visibleNodes
      .slice(0, 10)
      .map((node) => normalize(node.textContent || ''))
      .filter(Boolean)
      .join(' ');
    const hasLoginText = /登录|扫码|验证码|手机号|请先登录|注册|sign\\s*in/i.test(guardText);
    const loginUrl = /\\/login|signin|passport|account\\/login/i.test(String(location.href || ''));

    let accountId = '';
    try {
      const initialState = (typeof window !== 'undefined' && window.__INITIAL_STATE__) || null;
      const rawUserInfo = initialState && initialState.user && initialState.user.userInfo
        ? (
          (initialState.user.userInfo._rawValue && typeof initialState.user.userInfo._rawValue === 'object' && initialState.user.userInfo._rawValue)
          || (initialState.user.userInfo._value && typeof initialState.user.userInfo._value === 'object' && initialState.user.userInfo._value)
          || (typeof initialState.user.userInfo === 'object' ? initialState.user.userInfo : null)
        )
        : null;
      accountId = normalize(rawUserInfo?.user_id || rawUserInfo?.userId || '');
    } catch {}

    if (!accountId) {
      const selfAnchor = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'))
        .find((node) => {
          const text = normalize(node.textContent || '');
          const title = normalize(node.getAttribute('title') || '');
          const aria = normalize(node.getAttribute('aria-label') || '');
          return ['我', '我的', '个人主页', '我的主页'].includes(text)
            || ['我', '我的', '个人主页', '我的主页'].includes(title)
            || ['我', '我的', '个人主页', '我的主页'].includes(aria);
        });
      if (selfAnchor) {
        const href = normalize(selfAnchor.getAttribute('href') || '');
        const matched = href.match(/\\/user\\/profile\\/([^/?#]+)/);
        if (matched && matched[1]) accountId = normalize(matched[1]);
      }
    }

    const hasAccountSignal = Boolean(accountId);
    const hasLoginGuard = ((visibleNodes.length > 0 && hasLoginText) || loginUrl) && !hasAccountSignal;
    return {
      hasLoginGuard,
      hasLoginText,
      hasAccountSignal,
      accountId: accountId || null,
      visibleGuardCount: visibleNodes.length,
      guardTextPreview: guardText.slice(0, 240),
      loginUrl,
    };
  })()`;

  try {
    const ret = await callAPI('evaluate', { profileId, script });
    const data = extractEvaluateResult(ret);
    return {
      hasLoginGuard: data?.hasLoginGuard === true,
      hasLoginText: data?.hasLoginText === true,
      hasAccountSignal: data?.hasAccountSignal === true,
      accountId: String(data?.accountId || '').trim() || null,
      visibleGuardCount: Math.max(0, Number(data?.visibleGuardCount || 0) || 0),
      guardTextPreview: String(data?.guardTextPreview || '').trim(),
      loginUrl: data?.loginUrl === true,
      ok: true,
    };
  } catch {
    return {
      hasLoginGuard: false,
      hasLoginText: false,
      hasAccountSignal: false,
      accountId: null,
      visibleGuardCount: 0,
      guardTextPreview: '',
      loginUrl: false,
      ok: false,
    };
  }
}

export async function detectCheckpoint({ profileId, platform = 'xiaohongshu' }) {
  if (platform !== 'xiaohongshu') {
    return asErrorPayload('UNSUPPORTED_PLATFORM', `Unsupported platform: ${platform}`);
  }

  try {
    const session = await ensureActiveSession(profileId);
    const resolvedProfile = session.profileId || profileId;
    const [url, snapshot] = await Promise.all([
      getCurrentUrl(resolvedProfile),
      getDomSnapshotByProfile(resolvedProfile),
    ]);

    const signals = [];
    const counter = {};
    const addCount = (label, selectors) => {
      for (const css of selectors) {
        const count = buildSelectorCheck(snapshot, css).length;
        if (count > 0) {
          counter[css] = count;
          signals.push(`${label}:${css}`);
        }
      }
    };

    addCount('search_ready', XHS_CHECKPOINTS.search_ready);
    addCount('home_ready', XHS_CHECKPOINTS.home_ready);
    addCount('detail_ready', XHS_CHECKPOINTS.detail_ready);
    addCount('comments_ready', XHS_CHECKPOINTS.comments_ready);
    addCount('login_guard', XHS_CHECKPOINTS.login_guard);
    addCount('risk_control', XHS_CHECKPOINTS.risk_control);

    const loginSignal = await detectXhsLoginSignal(resolvedProfile);
    const loginGuardBySelector = signals.some((item) => item.startsWith('login_guard:'));
    const loginGuardConfirmed = loginSignal.ok
      ? loginSignal.hasLoginGuard
      : loginGuardBySelector;

    let checkpoint = 'unknown';
    if (!url || !url.includes('xiaohongshu.com')) checkpoint = 'offsite';
    else if (isCheckpointRiskUrl(url)) checkpoint = 'risk_control';
    else if (loginGuardConfirmed) checkpoint = 'login_guard';
    else if (signals.some((item) => item.startsWith('comments_ready:'))) checkpoint = 'comments_ready';
    else if (signals.some((item) => item.startsWith('detail_ready:'))) checkpoint = 'detail_ready';
    else if (signals.some((item) => item.startsWith('search_ready:'))) checkpoint = 'search_ready';
    else if (signals.some((item) => item.startsWith('home_ready:'))) checkpoint = 'home_ready';

    return {
      ok: true,
      code: 'CHECKPOINT_DETECTED',
      message: 'Checkpoint detected',
      data: {
        profileId: resolvedProfile,
        platform,
        checkpoint,
        url,
        signals,
        selectorHits: counter,
        loginSignal,
      },
    };
  } catch (err) {
    return asErrorPayload('CHECKPOINT_DETECT_FAILED', err?.message || String(err));
  }
}

export async function captureCheckpoint({
  profileId,
  containerId = null,
  selector = null,
  platform = 'xiaohongshu',
}) {
  try {
    const session = await ensureActiveSession(profileId);
    const resolvedProfile = session.profileId || profileId;
    const checkpointRes = await detectCheckpoint({ profileId: resolvedProfile, platform });
    const effectiveSelector = maybeSelector({ profileId: resolvedProfile, containerId, selector });
    const snapshot = await getDomSnapshotByProfile(resolvedProfile);
    const matched = effectiveSelector ? buildSelectorCheck(snapshot, effectiveSelector) : [];

    return {
      ok: true,
      code: 'CHECKPOINT_CAPTURED',
      message: 'Checkpoint captured',
      data: {
        profileId: resolvedProfile,
        checkpoint: checkpointRes?.data?.checkpoint || 'unknown',
        checkpointUrl: checkpointRes?.data?.url || '',
        containerId,
        selector: effectiveSelector,
        selectorCount: matched.length,
        capturedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return asErrorPayload('CHECKPOINT_CAPTURE_FAILED', err?.message || String(err));
  }
}

export async function restoreCheckpoint({
  profileId,
  checkpoint = null,
  action,
  containerId = null,
  selector = null,
  targetCheckpoint = null,
  platform = 'xiaohongshu',
}) {
  try {
    const session = await ensureActiveSession(profileId);
    const resolvedProfile = session.profileId || profileId;
    const effectiveSelector = maybeSelector({ profileId: resolvedProfile, containerId, selector });
    let actionResult = null;

    if (action === 'requery_container') {
      if (!effectiveSelector) return asErrorPayload('CONTAINER_NOT_FOUND', 'Selector is required for requery_container');
      const snapshot = await getDomSnapshotByProfile(resolvedProfile);
      const matches = buildSelectorCheck(snapshot, effectiveSelector);
      if (matches.length === 0) return asErrorPayload('CONTAINER_NOT_FOUND', `Container selector not found: ${effectiveSelector}`);
      actionResult = { selector: effectiveSelector, count: matches.length };
    } else if (action === 'scroll_into_view') {
      if (!effectiveSelector) return asErrorPayload('CONTAINER_NOT_FOUND', 'Selector is required for scroll_into_view');
      actionResult = await callAPI('evaluate', {
        profileId: resolvedProfile,
        script: `(async () => {
          const el = document.querySelector(${JSON.stringify(effectiveSelector)});
          if (!el) throw new Error('Element not found');
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
          return { ok: true, selector: ${JSON.stringify(effectiveSelector)} };
        })()`,
      });
    } else if (action === 'page_back') {
      actionResult = await callAPI('page:back', { profileId: resolvedProfile });
    } else if (action === 'goto_checkpoint_url') {
      const url = checkpoint?.checkpointUrl || checkpoint?.url || '';
      if (!url) return asErrorPayload('CHECKPOINT_RESTORE_FAILED', 'checkpointUrl is required for goto_checkpoint_url');
      actionResult = await callAPI('goto', { profileId: resolvedProfile, url });
    } else {
      return asErrorPayload('UNSUPPORTED_RECOVERY_ACTION', `Unsupported recovery action: ${action}`);
    }

    const checkpointAfter = await detectCheckpoint({ profileId: resolvedProfile, platform });
    const reached = checkpointAfter?.data?.checkpoint || 'unknown';
    const targetMatched = targetCheckpoint ? reached === targetCheckpoint : true;
    return {
      ok: true,
      code: targetMatched ? 'CHECKPOINT_RESTORED' : 'CHECKPOINT_RESTORE_PARTIAL',
      message: targetMatched ? 'Checkpoint restored' : 'Recovery action completed but target checkpoint not reached',
      data: {
        profileId: resolvedProfile,
        action,
        actionResult,
        reachedCheckpoint: reached,
        targetCheckpoint,
      },
    };
  } catch (err) {
    return asErrorPayload('CHECKPOINT_RESTORE_FAILED', err?.message || String(err));
  }
}
