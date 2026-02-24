import { callAPI } from '../../../../modules/camo-runtime/src/utils/browser-service.mjs';
import { listAccountProfiles, markProfileInvalid, markProfilePending, upsertProfileAccountState } from './account-store.mjs';

const XHS_PROFILE_URL = 'https://www.xiaohongshu.com/user/profile';
const WEIBO_HOME_URL = 'https://weibo.com';
const WEIBO_PROFILE_INFO_ENDPOINT = '/ajax/profile/info';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractResult(payload) {
  if (payload && typeof payload === 'object') {
    if (Object.prototype.hasOwnProperty.call(payload, 'result')) return payload.result;
    if (Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
  }
  return payload || {};
}

function normalizeWeiboUid(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const matched = text.match(/\d{4,}/);
  if (!matched || !matched[0]) return null;
  return matched[0];
}

function isDomainCookie(cookie, domain) {
  const cookieDomain = String(cookie?.domain || '').trim().toLowerCase();
  if (!cookieDomain) return false;
  const wanted = String(domain || '').trim().toLowerCase();
  if (!wanted) return false;
  return cookieDomain === wanted || cookieDomain === `.${wanted}` || cookieDomain.endsWith(`.${wanted}`);
}

function isCookieExpired(cookie) {
  const expires = Number(cookie?.expires);
  if (!Number.isFinite(expires)) return false;
  if (expires <= 0) return false;
  return expires * 1000 <= Date.now();
}

function hasCookie(cookies, name, domain) {
  const wantedName = String(name || '').trim().toUpperCase();
  if (!wantedName) return false;
  return (Array.isArray(cookies) ? cookies : []).some((cookie) => (
    String(cookie?.name || '').trim().toUpperCase() === wantedName
    && isDomainCookie(cookie, domain)
    && !isCookieExpired(cookie)
  ));
}

async function getProfileCookies(profileId) {
  const payload = await callAPI('getCookies', { profileId });
  const body = extractResult(payload);
  if (Array.isArray(body?.cookies)) return body.cookies;
  if (Array.isArray(body)) return body;
  return [];
}

function buildDetectScript() {
  return `(() => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const loginGuardSelectors = [
      '.login-container',
      '.login-dialog',
      '#login-container',
    ];
    const loginGuardNodes = loginGuardSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const visibleLoginGuardNodes = loginGuardNodes.filter((node) => isVisible(node));
    const loginGuardText = visibleLoginGuardNodes
      .slice(0, 6)
      .map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim())
      .join(' ');
    const hasLoginText = /登录|扫码|验证码|手机号|请先登录|注册|sign\\s*in/i.test(loginGuardText);
    const loginUrl = /\\/login|signin|passport|account\\/login/i.test(String(location.href || ''));
    const hasGuardSignal = (visibleLoginGuardNodes.length > 0 && hasLoginText) || loginUrl;
    const candidates = [];
    const normalizeAlias = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      if (!text) return null;
      if (text === '我' || text === '我的' || text === '个人主页') return null;
      return text;
    };
    const isSelfLabel = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      if (!text) return false;
      return (
        text === '我'
        || text === '我的'
        || text === '个人主页'
        || text === '我的主页'
        || text === '我的账号'
      );
    };
    const readLabelCandidates = (node) => {
      if (!node) return [];
      const text = String(node.textContent || '').replace(/\\s+/g, ' ').trim();
      const title = String(node.getAttribute ? (node.getAttribute('title') || '') : '').trim();
      const aria = String(node.getAttribute ? (node.getAttribute('aria-label') || '') : '').trim();
      return [text, title, aria].filter((item) => Boolean(item));
    };
    const cleanAlias = (value) => {
      let text = normalizeAlias(value);
      if (!text) return null;
      text = text.replace(/\\s*[-–—]\\s*(小红书|XiaoHongShu|xiaohongshu).*$/i, '').trim();
      if (!text) return null;
      const blocked = ['小红书', '登录', '注册', '搜索'];
      if (blocked.includes(text)) return null;
      return text;
    };
    const pushCandidate = (id, alias, source) => {
      const value = String(id || '').trim();
      if (!value) return;
      candidates.push({
        id: value,
        alias: cleanAlias(alias),
        source: String(source || '').trim() || null,
      });
    };
    const findAliasFromDom = () => {
      const selectors = [
        '[class*="user"] [class*="name"]',
        '[class*="nickname"]',
        '[class*="account"] [class*="name"]',
        'a[href*="/user/profile"] span',
        'header a[href*="/user"] span',
        'nav a[href*="/user"] span',
      ];
      const picks = [];
      for (const sel of selectors) {
        const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 6);
        for (const node of nodes) {
          const text = cleanAlias(node.textContent || '');
          if (text) picks.push({ text, source: sel });
        }
      }
      const metaTitle = document.querySelector('meta[property="og:title"], meta[name="og:title"]');
      const metaText = cleanAlias(metaTitle ? metaTitle.getAttribute('content') || '' : '');
      if (metaText) picks.push({ text: metaText, source: 'meta:og:title' });
      const title = cleanAlias(document.title || '');
      if (title) picks.push({ text: title, source: 'document.title' });
      const picked = picks.find((item) => item.text && item.text.length >= 2) || null;
      return picked ? picked.text : null;
    };

    const initialState = (typeof window !== 'undefined' && window.__INITIAL_STATE__) || null;
    const rawUserInfo = initialState && initialState.user && initialState.user.userInfo
      ? (
        (initialState.user.userInfo._rawValue && typeof initialState.user.userInfo._rawValue === 'object' && initialState.user.userInfo._rawValue)
        || (initialState.user.userInfo._value && typeof initialState.user.userInfo._value === 'object' && initialState.user.userInfo._value)
        || (typeof initialState.user.userInfo === 'object' ? initialState.user.userInfo : null)
      )
      : null;
    if (rawUserInfo) {
      const initUserId = String(rawUserInfo.user_id || rawUserInfo.userId || '').trim();
      const initNickname = cleanAlias(rawUserInfo.nickname || rawUserInfo.name || rawUserInfo.nickName || null);
      if (initUserId) {
        pushCandidate(initUserId, initNickname, 'initial_state.user_info');
      }
    }

    const selfNavEntry = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'))
      .find((node) => {
        const labels = readLabelCandidates(node);
        return labels.some(isSelfLabel);
      });
    if (selfNavEntry) {
      const href = String(selfNavEntry.getAttribute('href') || '').trim();
      const matched = href.match(/\\/user\\/profile\\/([^/?#]+)/);
      if (matched && matched[1]) {
        pushCandidate(matched[1], String(selfNavEntry.textContent || '').trim() || null, 'nav.self');
      }
    }

    const anchors = Array.from(document.querySelectorAll('a[href*="/user/profile/"], a[href*="/user/"]'));
    for (const anchor of anchors) {
      const href = String(anchor.getAttribute('href') || '').trim();
      if (!href) continue;
      let matched = href.match(/\\/user\\/profile\\/([^/?#]+)/);
      if (!matched) matched = href.match(/\\/user\\/([^/?#]+)/);
      if (!matched || !matched[1]) continue;
      const alias = String(anchor.textContent || '').trim();
      const labels = readLabelCandidates(anchor);
      if (labels.some(isSelfLabel)) {
        pushCandidate(matched[1], alias, 'anchor.self');
      }
    }

    const avatar = document.querySelector('img[alt], [class*="avatar"] img[alt]');
    if (avatar) {
      const alt = String(avatar.getAttribute('alt') || '').trim();
      if (alt) {
        const first = candidates[0] || null;
        if (first && !first.alias) first.alias = alt;
      }
    }

    const best = candidates
      .find((item) => item.source === 'initial_state.user_info')
      || candidates.find((item) => item.source === 'nav.self')
      || candidates.find((item) => item.source === 'anchor.self')
      || candidates.find((item) => item.id && item.id.length >= 6)
      || candidates[0]
      || null;
    let alias = best ? best.alias : null;
    if (!alias && best && best.id) {
      const aliasNode = Array.from(document.querySelectorAll('a[href*="/user/profile/"], [class*="user"] a[href*="/user/profile/"]'))
        .find((node) => String(node.getAttribute && node.getAttribute('href') || '').includes(best.id));
      const text = aliasNode ? String(aliasNode.textContent || '').replace(/\\s+/g, ' ').trim() : '';
      const picked = cleanAlias(text);
      if (picked) alias = picked;
    }
    if (!alias && (!best || !best.id)) {
      const picked = findAliasFromDom();
      if (picked) alias = picked;
    }
    const hasAccountSignal = Boolean(best && best.id);
    return {
      url: location.href,
      hasLoginGuard: hasGuardSignal,
      accountId: best ? best.id : null,
      alias: alias || null,
      source: best ? best.source : null,
      candidates,
    };
  })()`;
}

function buildAliasResolveScript() {
  return `(() => {
    const candidates = [];
    const normalizeAlias = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      if (!text) return null;
      if (text === '我' || text === '我的' || text === '个人主页') return null;
      return text;
    };
    const cleanAlias = (value) => {
      let text = normalizeAlias(value);
      if (!text) return null;
      text = text.replace(/\\s*[-—–]\\s*(小红书|xiaohongshu).*$/i, '').trim();
      if (!text) return null;
      const blocked = ['小红书', '登录', '注册', '搜索'];
      if (blocked.includes(text)) return null;
      return text;
    };
    const pushCandidate = (text, source) => {
      const alias = cleanAlias(text);
      if (!alias) return;
      candidates.push({ text: alias, source });
    };
    const initialState = (typeof window !== 'undefined' && window.__INITIAL_STATE__) || null;
    const rawUserInfo = initialState && initialState.user && initialState.user.userInfo
      ? (
        (initialState.user.userInfo._rawValue && typeof initialState.user.userInfo._rawValue === 'object' && initialState.user.userInfo._rawValue)
        || (initialState.user.userInfo._value && typeof initialState.user.userInfo._value === 'object' && initialState.user.userInfo._value)
        || (typeof initialState.user.userInfo === 'object' ? initialState.user.userInfo : null)
      )
      : null;
    if (rawUserInfo) {
      pushCandidate(rawUserInfo.nickname || rawUserInfo.name || rawUserInfo.nickName || null, 'initial_state.user_info');
    }
    const selectors = [
      '[class*="user"] [class*="name"]',
      '[class*="user"] [class*="nickname"]',
      '[class*="nickname"]',
      '[class*="user-name"]',
      'header [class*="name"]',
      'header h1',
      'header h2',
    ];
    for (const sel of selectors) {
      const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 8);
      for (const node of nodes) {
        pushCandidate(node.textContent || '', sel);
      }
    }
    const metaTitle = document.querySelector('meta[property="og:title"], meta[name="og:title"]');
    if (metaTitle) pushCandidate(metaTitle.getAttribute('content') || '', 'meta:og:title');
    pushCandidate(document.title || '', 'document.title');
    const picked = candidates.find((item) => item.text && item.text.length >= 2) || null;
    return {
      alias: picked ? picked.text : null,
      source: picked ? picked.source : null,
      candidates,
    };
  })()`;
}

function buildGotoSelfTabScript() {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isSelfLabel = (value) => {
      const text = normalize(value);
      if (!text) return false;
      return text === '我' || text === '我的' || text === '个人主页' || text === '我的主页';
    };
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const candidates = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="link"], [class*="tab"]'))
      .map((node) => {
        const text = normalize(node.textContent || '');
        const title = normalize(node.getAttribute?.('title') || '');
        const aria = normalize(node.getAttribute?.('aria-label') || '');
        return {
          node,
          text,
          title,
          aria,
        };
      })
      .filter((item) => isSelfLabel(item.text) || isSelfLabel(item.title) || isSelfLabel(item.aria));
    const target = candidates.find((item) => isVisible(item.node)) || candidates[0] || null;
    if (!target?.node) {
      return { clicked: false, reason: 'self_tab_not_found' };
    }
    try {
      target.node.click();
      return {
        clicked: true,
        reason: 'ok',
        label: target.text || target.title || target.aria || null,
      };
    } catch (error) {
      return { clicked: false, reason: String(error?.message || error || 'click_failed') };
    }
  })()`;
}

async function resolveAliasFromSelfTab(profileId) {
  if (!profileId) return null;
  try {
    await callAPI('evaluate', { profileId, script: buildGotoSelfTabScript() });
    await sleep(900);
    const payload = await callAPI('evaluate', { profileId, script: buildAliasResolveScript() });
    const result = payload?.result || payload?.data || payload || {};
    const alias = normalizeText(result.alias);
    if (!alias) return null;
    return {
      alias,
      source: normalizeText(result.source) ? `self_tab:${normalizeText(result.source)}` : 'self_tab',
      candidates: Array.isArray(result.candidates) ? result.candidates : [],
    };
  } catch {
    return null;
  }
}

async function resolveAliasFromProfilePage(profileId, accountId) {
  if (!profileId || !accountId) return null;
  const fromSelfTab = await resolveAliasFromSelfTab(profileId);
  if (fromSelfTab?.alias) {
    return fromSelfTab;
  }
  let originalUrl = null;
  try {
    const urlPayload = await callAPI('evaluate', { profileId, script: 'window.location.href' });
    originalUrl = normalizeText(urlPayload?.result || urlPayload?.data?.result || urlPayload?.url);
  } catch {
    originalUrl = null;
  }
  const targetUrl = `${XHS_PROFILE_URL}/${accountId}`;
  const shouldNavigate = !originalUrl || !String(originalUrl).includes(`/user/profile/${accountId}`);
  try {
    if (shouldNavigate) {
      await callAPI('goto', { profileId, url: targetUrl });
      await sleep(1200);
    }
    const payload = await callAPI('evaluate', { profileId, script: buildAliasResolveScript() });
    const result = payload?.result || payload?.data || payload || {};
    return {
      alias: normalizeText(result.alias),
      source: normalizeText(result.source) || 'profile_page',
      candidates: Array.isArray(result.candidates) ? result.candidates : [],
    };
  } catch {
    return null;
  } finally {
    if (shouldNavigate && originalUrl) {
      try {
        await callAPI('goto', { profileId, url: originalUrl });
      } catch {
        // ignore restore failures
      }
    }
  }
}

export async function detectXhsAccountIdentity(profileId, options = {}) {
  const runDetect = async () => {
    const payload = await callAPI('evaluate', {
      profileId,
      script: buildDetectScript(),
    });
    const result = payload?.result || payload?.data || payload || {};
    return {
      profileId: String(profileId || '').trim(),
      url: normalizeText(result.url),
      hasLoginGuard: result.hasLoginGuard === true,
      accountId: normalizeText(result.accountId),
      alias: normalizeText(result.alias),
      source: normalizeText(result.source),
      candidates: Array.isArray(result.candidates) ? result.candidates : [],
    };
  };

  let detected = await runDetect();
  const shouldRetry = (
    !detected.accountId
    || !detected.alias
    || detected.hasLoginGuard
  );
  if (shouldRetry) {
    await sleep(1200);
    const retry = await runDetect();
    if (retry.accountId && !detected.accountId) {
      detected.accountId = retry.accountId;
      detected.source = retry.source || detected.source;
      detected.candidates = retry.candidates;
    }
    if (retry.alias && !detected.alias) {
      detected.alias = retry.alias;
      if (!detected.source) detected.source = retry.source || detected.source;
    }
    if (retry.url && !detected.url) detected.url = retry.url;
    if (detected.hasLoginGuard && !retry.hasLoginGuard) {
      detected.hasLoginGuard = false;
    }
  }
  if (options?.resolveAlias === true && detected.accountId && !detected.alias) {
    const resolved = await resolveAliasFromProfilePage(detected.profileId, detected.accountId);
    if (resolved?.alias) {
      detected.alias = resolved.alias;
      detected.source = resolved.source || detected.source;
    }
  }
  return detected;
}

export async function syncXhsAccountByProfile(profileId, options = {}) {
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedProfileId) throw new Error('profileId is required');
  const pendingWhileLogin = options?.pendingWhileLogin === true;
  try {
    const existing = listAccountProfiles({ platform: 'xiaohongshu' }).profiles.find(
      (item) => String(item?.profileId || '').trim() === normalizedProfileId,
    );
    const shouldResolveAlias = options?.resolveAlias === true
      || (!existing?.alias && options?.resolveAlias !== false);
    const detected = await detectXhsAccountIdentity(normalizedProfileId, {
      resolveAlias: shouldResolveAlias,
    });
    if (detected.hasLoginGuard) {
      if (pendingWhileLogin) {
        return markProfilePending(normalizedProfileId, 'waiting_login_guard');
      }
      return markProfileInvalid(normalizedProfileId, 'login_guard');
    }
    if (!detected.accountId) {
      if (pendingWhileLogin) {
        return markProfilePending(normalizedProfileId, 'waiting_login');
      }
      return markProfileInvalid(normalizedProfileId, 'missing_account_id');
    }
    return upsertProfileAccountState({
      profileId: normalizedProfileId,
      platform: 'xiaohongshu',
      accountId: detected.accountId,
      alias: detected.alias,
      reason: null,
      detectedAt: new Date().toISOString(),
    });
  } catch (error) {
    const msg = String(error?.message || error || '');
    if (msg.toLowerCase().includes('operation is insecure')) {
      try {
        const existing = listAccountProfiles({ platform: 'xiaohongshu' }).profiles.find((item) => String(item?.profileId || '').trim() === normalizedProfileId);
        if (existing && existing.valid) return existing;
      } catch {
        // ignore fallback lookup
      }
    }
    if (pendingWhileLogin) {
      return markProfilePending(normalizedProfileId, `waiting_login_sync:${error?.message || String(error)}`);
    }
    return markProfileInvalid(normalizedProfileId, `sync_failed:${error?.message || String(error)}`);
  }
}

export async function syncXhsAccountsByProfiles(profileIds = [], options = {}) {
  const list = Array.from(new Set((Array.isArray(profileIds) ? profileIds : []).map((item) => String(item || '').trim()).filter(Boolean)));
  const out = [];
  for (const profileId of list) {
    const state = await syncXhsAccountByProfile(profileId, options);
    out.push(state);
  }
  return out;
}

function buildWeiboDetectScript() {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const toAlias = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (text === '微博' || text === '首页' || text === '登录') return null;
      return text;
    };
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const href = String(location.href || '');
    const host = String(location.host || '');
    const loginUrl = (
      host.includes('passport.weibo.com')
      || /\\/signin|\\/login|passport/i.test(href)
    );
    const guardSelectors = [
      '.LoginCard',
      'div[class*="LoginCard"]',
      'div[class*="login"]',
      'form[action*="passport"]',
      'input[name="username"]',
      'input[type="password"]'
    ];
    const guardNodes = guardSelectors
      .flatMap((sel) => Array.from(document.querySelectorAll(sel)))
      .filter((node) => isVisible(node));
    const guardText = guardNodes
      .slice(0, 8)
      .map((node) => normalize(node.textContent || ''))
      .join(' ');
    const hasLoginText = /登录|注册|验证码|手机号|扫码|sign\\s*in|password/i.test(guardText);
    const hasLoginGuard = loginUrl || (guardNodes.length > 0 && hasLoginText);

    const uidCandidates = [];
    const aliasCandidates = [];
    const pushUid = (value, source) => {
      const text = normalize(value);
      if (!text) return;
      uidCandidates.push({ value: text, source: source || null });
    };
    const pushAlias = (value, source) => {
      const text = toAlias(value);
      if (!text) return;
      aliasCandidates.push({ value: text, source: source || null });
    };

    const config = (typeof window !== 'undefined' && window.$CONFIG) || null;
    if (config && typeof config === 'object') {
      pushUid(config.uid, 'config.uid');
      pushUid(config.oid, 'config.oid');
      pushAlias(config.nick || config.nickName || config.name, 'config.nick');
    }

    const initialState = (typeof window !== 'undefined' && window.__INITIAL_STATE__) || null;
    if (initialState && typeof initialState === 'object') {
      const me = initialState.user || initialState.login || initialState.loginInfo || initialState.userInfo || null;
      if (me && typeof me === 'object') {
        pushUid(me.uid || me.idstr || me.id || me.userId || null, 'state.user');
        pushAlias(me.screen_name || me.nick || me.nickname || me.name || null, 'state.user');
      }
    }

    const meLink = Array.from(document.querySelectorAll('a[href*="/u/"], a[href*="/n/"]'))
      .find((node) => {
        const text = normalize(node.textContent || '');
        const title = normalize(node.getAttribute?.('title') || '');
        return text === '我' || text === '我的' || title === '我' || title === '我的';
      });
    if (meLink) {
      const meHref = String(meLink.getAttribute('href') || '').trim();
      const uidMatch = meHref.match(/\\/u\\/(\\d{4,})/);
      if (uidMatch && uidMatch[1]) pushUid(uidMatch[1], 'anchor.self');
      pushAlias(meLink.textContent || '', 'anchor.self');
    }

    const anchors = Array.from(document.querySelectorAll('a[href*="/u/"], a[href*="/n/"]')).slice(0, 120);
    for (const anchor of anchors) {
      const ahref = String(anchor.getAttribute('href') || '').trim();
      if (!ahref) continue;
      const uidMatch = ahref.match(/\\/u\\/(\\d{4,})/);
      if (uidMatch && uidMatch[1]) pushUid(uidMatch[1], 'anchor.any');
      if (uidMatch && uidMatch[1]) pushAlias(anchor.textContent || '', 'anchor.any');
    }

    const aliasSelectors = [
      'h1',
      'header h1',
      '[class*="ProfileHeader_name"]',
      '[class*="profile"] [class*="name"]',
      '[class*="userinfo"] [class*="name"]',
      'a[href*="/u/"] span'
    ];
    for (const sel of aliasSelectors) {
      const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 8);
      for (const node of nodes) {
        pushAlias(node.textContent || node.getAttribute?.('title') || '', sel);
      }
    }
    const title = normalize(document.title || '').replace(/\\s*[-|_].*$/, '').trim();
    if (title) pushAlias(title, 'document.title');

    const uid = uidCandidates[0]?.value || null;
    const alias = aliasCandidates[0]?.value || null;
    return {
      url: href,
      hasLoginGuard,
      uid,
      alias,
      uidCandidates,
      aliasCandidates,
    };
  })()`;
}

function buildWeiboWhoamiScript(uid) {
  return `(async () => {
    const expectedUid = String(${JSON.stringify(String(uid || ''))}).trim();
    if (!expectedUid) {
      return { ok: false, uid: null, reason: 'missing_uid' };
    }
    const endpoint = ${JSON.stringify(WEIBO_PROFILE_INFO_ENDPOINT)};
    const url = endpoint + '?uid=' + encodeURIComponent(expectedUid);
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'accept': 'application/json, text/plain, */*' },
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        return {
          ok: false,
          uid: null,
          status: response.status,
          reason: 'invalid_json',
          bodySnippet: String(text || '').slice(0, 120),
        };
      }
      const dataUser = (json && json.data && (json.data.user || json.data)) || {};
      const foundUid = String(
        (dataUser && (dataUser.idstr || dataUser.id || dataUser.uid))
        || json.uid
        || '',
      ).trim();
      const hasData = Boolean(foundUid);
      const code = json && (json.code || json.errno || json.status) ? String(json.code || json.errno || json.status) : null;
      const okFlag = response.ok && (json.ok === 1 || json.ok === true || hasData);
      return {
        ok: okFlag,
        uid: foundUid || null,
        status: response.status,
        code,
      };
    } catch (error) {
      return {
        ok: false,
        uid: null,
        reason: String(error?.message || error || 'whoami_failed'),
      };
    }
  })()`;
}

export async function detectWeiboAccountIdentity(profileId) {
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedProfileId) throw new Error('profileId is required');
  const runDetect = async () => {
    const payload = await callAPI('evaluate', {
      profileId: normalizedProfileId,
      script: buildWeiboDetectScript(),
    });
    const result = extractResult(payload);
    const uidCandidates = Array.isArray(result?.uidCandidates) ? result.uidCandidates : [];
    const normalizedCandidates = uidCandidates
      .map((item) => ({
        value: normalizeWeiboUid(item?.value),
        source: normalizeText(item?.source),
      }))
      .filter((item) => Boolean(item.value));
    const accountId = normalizeWeiboUid(result?.uid) || normalizedCandidates[0]?.value || null;
    const alias = normalizeText(result?.alias) || null;
    return {
      profileId: normalizedProfileId,
      url: normalizeText(result?.url) || WEIBO_HOME_URL,
      hasLoginGuard: result?.hasLoginGuard === true,
      accountId,
      alias,
      uidCandidates: normalizedCandidates,
    };
  };

  let detected = await runDetect();
  if (!detected.accountId || detected.hasLoginGuard) {
    await sleep(1200);
    const retry = await runDetect();
    if (!detected.accountId && retry.accountId) detected.accountId = retry.accountId;
    if (!detected.alias && retry.alias) detected.alias = retry.alias;
    if (detected.hasLoginGuard && !retry.hasLoginGuard) detected.hasLoginGuard = false;
    if (!detected.url && retry.url) detected.url = retry.url;
    if ((!detected.uidCandidates || detected.uidCandidates.length === 0) && retry.uidCandidates?.length) {
      detected.uidCandidates = retry.uidCandidates;
    }
  }

  let cookies = [];
  try {
    cookies = await getProfileCookies(normalizedProfileId);
  } catch {
    cookies = [];
  }
  const hasSub = hasCookie(cookies, 'SUB', 'weibo.com');
  const hasSubp = hasCookie(cookies, 'SUBP', 'weibo.com');
  const hasCookieAuth = hasSub && hasSubp;

  let apiVerified = false;
  let apiUid = null;
  let apiReason = null;
  if (detected.accountId && !detected.hasLoginGuard && hasCookieAuth) {
    try {
      const payload = await callAPI('evaluate', {
        profileId: normalizedProfileId,
        script: buildWeiboWhoamiScript(detected.accountId),
      });
      const probe = extractResult(payload);
      apiUid = normalizeWeiboUid(probe?.uid);
      const uidMatched = !apiUid || apiUid === detected.accountId;
      apiVerified = probe?.ok === true && uidMatched;
      if (!apiVerified) {
        apiReason = normalizeText(probe?.reason) || normalizeText(probe?.code) || 'whoami_failed';
      }
    } catch (error) {
      apiVerified = false;
      apiReason = `whoami_failed:${error?.message || String(error)}`;
    }
  } else if (!hasCookieAuth) {
    apiReason = 'cookie_missing';
  }

  return {
    ...detected,
    hasCookieAuth,
    cookieSignals: {
      SUB: hasSub,
      SUBP: hasSubp,
    },
    apiVerified,
    apiUid,
    apiReason,
  };
}

export async function syncWeiboAccountByProfile(profileId, options = {}) {
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedProfileId) throw new Error('profileId is required');
  const pendingWhileLogin = options?.pendingWhileLogin === true;
  try {
    const detected = await detectWeiboAccountIdentity(normalizedProfileId);
    if (detected.hasLoginGuard) {
      if (pendingWhileLogin) return markProfilePending(normalizedProfileId, 'waiting_login_guard', 'weibo');
      return markProfileInvalid(normalizedProfileId, 'login_guard', 'weibo');
    }
    if (!detected.hasCookieAuth) {
      if (pendingWhileLogin) return markProfilePending(normalizedProfileId, 'waiting_cookie_auth', 'weibo');
      return markProfileInvalid(normalizedProfileId, 'cookie_missing', 'weibo');
    }
    if (!detected.accountId) {
      if (pendingWhileLogin) return markProfilePending(normalizedProfileId, 'waiting_account_id', 'weibo');
      return markProfileInvalid(normalizedProfileId, 'missing_account_id', 'weibo');
    }
    if (!detected.apiVerified) {
      if (pendingWhileLogin) return markProfilePending(normalizedProfileId, `waiting_whoami:${detected.apiReason || 'whoami_failed'}`, 'weibo');
      return markProfileInvalid(normalizedProfileId, `whoami_failed:${detected.apiReason || 'unknown'}`, 'weibo');
    }
    return upsertProfileAccountState({
      profileId: normalizedProfileId,
      platform: 'weibo',
      accountId: detected.accountId,
      alias: detected.alias,
      reason: null,
      detectedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (pendingWhileLogin) {
      return markProfilePending(normalizedProfileId, `waiting_login_sync:${error?.message || String(error)}`, 'weibo');
    }
    return markProfileInvalid(normalizedProfileId, `sync_failed:${error?.message || String(error)}`, 'weibo');
  }
}

export async function syncWeiboAccountsByProfiles(profileIds = [], options = {}) {
  const list = Array.from(new Set((Array.isArray(profileIds) ? profileIds : []).map((item) => String(item || '').trim()).filter(Boolean)));
  const out = [];
  for (const profileId of list) {
    const state = await syncWeiboAccountByProfile(profileId, options);
    out.push(state);
  }
  return out;
}
