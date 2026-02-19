import { callAPI } from '../../../../modules/camo-runtime/src/utils/browser-service.mjs';
import { listAccountProfiles, markProfileInvalid, markProfilePending, upsertProfileAccountState } from './account-store.mjs';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function buildDetectScript() {
  return `(() => {
    const guard = Boolean(document.querySelector('.login-container, .login-dialog, #login-container'));
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

    const searchHistoryKey = Object.keys(localStorage || {}).find((key) => String(key || '').startsWith('xhs-pc-search-history-'));
    if (searchHistoryKey) {
      const matched = String(searchHistoryKey).match(/^xhs-pc-search-history-(.+)$/);
      if (matched && matched[1]) {
        pushCandidate(matched[1], null, 'localStorage.search_history');
      }
    }

    const selfNavEntry = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'))
      .find((node) => {
        const text = String(node.textContent || '').replace(/\\s+/g, ' ').trim();
        return text === '我' || text === '我的' || text === '个人主页';
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
      pushCandidate(matched[1], alias, 'anchor');
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
      || candidates.find((item) => item.source === 'localStorage.search_history')
      || candidates.find((item) => item.source === 'nav.self')
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
    if (!alias) {
      const picked = findAliasFromDom();
      if (picked) alias = picked;
    }
    return {
      url: location.href,
      hasLoginGuard: guard,
      accountId: best ? best.id : null,
      alias: alias || null,
      source: best ? best.source : null,
      candidates,
    };
  })()`;
}

export async function detectXhsAccountIdentity(profileId) {
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
}

export async function syncXhsAccountByProfile(profileId, options = {}) {
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedProfileId) throw new Error('profileId is required');
  const pendingWhileLogin = options?.pendingWhileLogin === true;
  try {
    const detected = await detectXhsAccountIdentity(normalizedProfileId);
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
        const existing = listAccountProfiles().profiles.find((item) => String(item?.profileId || '').trim() === normalizedProfileId);
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
