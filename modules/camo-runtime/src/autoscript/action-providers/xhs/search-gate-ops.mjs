import { buildTraceRecorder, emitActionTrace } from './trace.mjs';
import { getProfileState } from './state.mjs';
import {
  createSearchGateState,
  initDetailLinkQueue as initDetailLinkQueueState,
  claimDetailLink as claimDetailLinkState,
  completeDetailLink as completeDetailLinkState,
  releaseDetailLink as releaseDetailLinkState,
  clearDetailLinkQueue as clearDetailLinkQueueState,
} from '../../../../../../runtime/infra/utils/search-gate-core.mjs';

function resolveSearchGateUrl() {
  const fromEnv = String(process.env.WEBAUTO_SEARCH_GATE_URL || '').trim();
  if (fromEnv) return fromEnv;
  const port = String(process.env.WEBAUTO_SEARCH_GATE_PORT || '7790').trim();
  return `http://127.0.0.1:${port}/permit`;
}

function resolveSearchGateConfirmUrl() {
  const base = resolveSearchGateUrl();
  return base.replace(/\/permit$/i, '/confirm');
}

function resolveDetailLinksGateUrl(pathname) {
  const base = resolveSearchGateUrl();
  const normalizedPath = String(pathname || '').trim();
  return base.replace(/\/permit$/i, normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`);
}

function ensureTestingDetailGateState(testingOverrides) {
  if (!testingOverrides || typeof testingOverrides !== 'object') return null;
  if (!testingOverrides.__detailLinkGateState || typeof testingOverrides.__detailLinkGateState !== 'object') {
    testingOverrides.__detailLinkGateState = createSearchGateState();
  }
  return testingOverrides.__detailLinkGateState;
}

function postDetailLinksGateInMemory(pathname, payload, testingOverrides) {
  const state = ensureTestingDetailGateState(testingOverrides);
  if (!state) return null;
  if (pathname === '/detail-links/init') return initDetailLinkQueueState(state, payload || {});
  if (pathname === '/detail-links/next') return claimDetailLinkState(state, payload || {});
  if (pathname === '/detail-links/done') return completeDetailLinkState(state, payload || {});
  if (pathname === '/detail-links/release') return releaseDetailLinkState(state, payload || {});
  if (pathname === '/detail-links/clear') return clearDetailLinkQueueState(state, payload || {});
  return null;
}

function normalizePermitKind(kind, fallback = 'search') {
  const value = String(kind || fallback).trim().toLowerCase();
  if (value === 'open' || value === 'open_detail' || value === 'open-link' || value === 'open_link') return 'open_link';
  if (value === 'like') return 'like';
  return 'search';
}

export function buildGateRejectionError(code, response = null) {
  const error = new Error(code);
  error.code = code;
  error.response = response;
  return error;
}

export async function requestXhsGatePermit({
  profileId,
  params = {},
  state = null,
  pushTrace = () => {},
  stage = 'wait_search_permit',
  attempt = 1,
  testingOverrides = null,
} = {}) {
  const currentState = state || getProfileState(profileId);
  const keyword = String(params.keyword || currentState.keyword || '').trim();
  const key = String(params.key || params.searchKey || params.gateKey || profileId || '').trim() || profileId;
  const kind = normalizePermitKind(params.kind, params.like === true ? 'like' : 'search');
  const windowMs = Number(params.windowMs ?? params.windowMsOverride ?? (kind === 'open_link' ? 180_000 : 60_000)) || (kind === 'open_link' ? 180_000 : 60_000);
  const maxCount = Number(params.maxCount ?? params.maxCountOverride ?? (kind === 'open_link' ? 12 : 2)) || (kind === 'open_link' ? 12 : 2);
  const sameResourceMaxConsecutive = Number(params.sameResourceMaxConsecutive ?? 2) || 2;
  const denyOnConsecutiveSame = params.denyOnConsecutiveSame !== false;
  const gateUrl = String(params.searchGateUrl || params.gateUrl || resolveSearchGateUrl()).trim();
  const resourceKey = String(params.resourceKey || (kind === 'search' ? keyword : '') || '').trim() || null;
  const payload = {
    key,
    keyword,
    kind,
    resourceKey,
    windowMs,
    maxCount,
    sameResourceMaxConsecutive,
    denyOnConsecutiveSame,
  };
  const requestTimeoutMs = Math.max(1000, Number(params.requestTimeoutMs ?? params.gateTimeoutMs ?? 8000) || 8000);

  let response = null;
  try {
    if (typeof testingOverrides?.requestGatePermit === 'function') {
      response = await testingOverrides.requestGatePermit(payload);
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
      const res = await fetch(gateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      response = await res.json().catch(() => null);
    }
  } catch (error) {
    const message = error?.message || String(error);
    pushTrace({ kind: 'permit', stage, ok: false, error: message, attempt, gateKind: kind, resourceKey, keyword: keyword || null });
    throw buildGateRejectionError('SEARCH_GATE_UNREACHABLE', { message });
  }

  const allowed = response?.allowed === true || response?.ok === true;
  const waitMs = Number(response?.waitMs ?? response?.wait ?? 0) || 0;
  const deny = String(response?.deny || '').trim() || null;
  pushTrace({
    kind: 'permit',
    stage,
    ok: allowed,
    attempt,
    waitMs,
    deny,
    gateKind: kind,
    resourceKey,
    keyword: keyword || null,
    consecutiveCount: Number(response?.consecutiveCount || 0) || 0,
  });
  if (deny) {
    const code = deny === 'consecutive_same_resource_limit'
      ? (kind === 'open_link' ? 'OPEN_LINK_GATE_REJECTED' : 'SEARCH_GATE_REJECTED')
      : (kind === 'open_link' ? 'OPEN_LINK_GATE_DENIED' : 'SEARCH_GATE_DENIED');
    throw buildGateRejectionError(code, response);
  }
  return {
    allowed,
    waitMs,
    response,
    payload,
  };
}

export async function confirmXhsGateUsage({
  profileId,
  params = {},
  state = null,
  pushTrace = () => {},
  stage = 'confirm_gate_usage',
  testingOverrides = null,
} = {}) {
  const currentState = state || getProfileState(profileId);
  const keyword = String(params.keyword || currentState.keyword || '').trim();
  const key = String(params.key || params.searchKey || params.gateKey || profileId || '').trim() || profileId;
  const kind = normalizePermitKind(params.kind, params.like === true ? 'like' : 'search');
  const windowMs = Number(params.windowMs ?? params.windowMsOverride ?? (kind === 'open_link' ? 180_000 : 60_000)) || (kind === 'open_link' ? 180_000 : 60_000);
  const maxCount = Number(params.maxCount ?? params.maxCountOverride ?? (kind === 'open_link' ? 12 : 2)) || (kind === 'open_link' ? 12 : 2);
  const sameResourceMaxConsecutive = Number(params.sameResourceMaxConsecutive ?? 2) || 2;
  const denyOnConsecutiveSame = params.denyOnConsecutiveSame !== false;
  const gateUrl = String(params.searchGateConfirmUrl || params.confirmUrl || resolveSearchGateConfirmUrl()).trim();
  const resourceKey = String(params.resourceKey || (kind === 'search' ? keyword : '') || '').trim() || null;
  const payload = {
    key,
    keyword,
    kind,
    resourceKey,
    windowMs,
    maxCount,
    sameResourceMaxConsecutive,
    denyOnConsecutiveSame,
  };

  let response = null;
  try {
    if (typeof testingOverrides?.confirmGateUsage === 'function') {
      response = await testingOverrides.confirmGateUsage(payload);
    } else {
      const res = await fetch(gateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      response = await res.json().catch(() => null);
    }
  } catch (error) {
    const message = error?.message || String(error);
    pushTrace({ kind: 'confirm', stage, ok: false, error: message, gateKind: kind, resourceKey, keyword: keyword || null });
    throw buildGateRejectionError('SEARCH_GATE_CONFIRM_UNREACHABLE', { message });
  }

  pushTrace({
    kind: 'confirm',
    stage,
    ok: response?.ok === true,
    gateKind: kind,
    resourceKey,
    keyword: keyword || null,
    countInWindow: Number(response?.countInWindow || 0) || 0,
    reason: String(response?.reason || '').trim() || null,
  });

  return {
    response,
    payload,
  };
}

async function postDetailLinksGate({
  pathname,
  payload,
  testingOverrides = null,
  overrideName = null,
  unreachableCode = 'DETAIL_LINK_GATE_UNREACHABLE',
}) {
  const fnName = String(overrideName || '').trim();
  if (fnName && typeof testingOverrides?.[fnName] === 'function') {
    return testingOverrides[fnName](payload);
  }
  if (testingOverrides && typeof testingOverrides === 'object') {
    const inMemoryResponse = postDetailLinksGateInMemory(pathname, payload, testingOverrides);
    if (inMemoryResponse) return inMemoryResponse;
  }
  const gateUrl = resolveDetailLinksGateUrl(pathname);
  try {
    const res = await fetch(gateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json().catch(() => null);
  } catch (error) {
    const message = error?.message || String(error);
    throw buildGateRejectionError(unreachableCode, { message, pathname, payload });
  }
}

export async function initXhsDetailLinkQueue({
  profileId,
  params = {},
  state = null,
  pushTrace = () => {},
  stage = 'detail_links_init',
  testingOverrides = null,
} = {}) {
  const currentState = state || getProfileState(profileId);
  const key = String(params.key || params.searchKey || params.gateKey || profileId || '').trim() || profileId;
  const payload = {
    key,
    links: Array.isArray(params.links) ? params.links : [],
  };
  const response = await postDetailLinksGate({
    pathname: '/detail-links/init',
    payload,
    testingOverrides,
    overrideName: 'initDetailLinks',
    unreachableCode: 'DETAIL_LINK_GATE_INIT_UNREACHABLE',
  });
  currentState.detailGateState = {
    ...(currentState.detailGateState && typeof currentState.detailGateState === 'object' ? currentState.detailGateState : {}),
    key,
    initializedAt: new Date().toISOString(),
    totalLinks: Math.max(0, Number(response?.totalLinks || 0) || 0),
  };
  pushTrace({ kind: 'detail_gate', stage, action: 'init', key, totalLinks: Number(response?.totalLinks || 0) || 0 });
  return { response, payload };
}

export async function claimXhsDetailLink({
  profileId,
  params = {},
  state = null,
  pushTrace = () => {},
  stage = 'detail_links_claim',
  testingOverrides = null,
} = {}) {
  const currentState = state || getProfileState(profileId);
  const key = String(params.key || params.searchKey || params.gateKey || profileId || '').trim() || profileId;
  const consumerId = String(params.consumerId || params.tabId || '').trim() || null;
  const payload = { key, consumerId };
  const response = await postDetailLinksGate({
    pathname: '/detail-links/next',
    payload,
    testingOverrides,
    overrideName: 'claimDetailLink',
    unreachableCode: 'DETAIL_LINK_GATE_CLAIM_UNREACHABLE',
  });
  currentState.detailGateState = {
    ...(currentState.detailGateState && typeof currentState.detailGateState === 'object' ? currentState.detailGateState : {}),
    key,
    lastClaimAt: new Date().toISOString(),
    lastClaimedLinkKey: String(response?.linkKey || '').trim() || null,
  };
  pushTrace({
    kind: 'detail_gate',
    stage,
    action: 'claim',
    key,
    consumerId,
    found: response?.found === true,
    exhausted: response?.exhausted === true,
    blocked: response?.blocked === true,
    linkKey: String(response?.linkKey || '').trim() || null,
  });
  return { response, payload };
}

export async function completeXhsDetailLink({
  profileId,
  params = {},
  state = null,
  pushTrace = () => {},
  stage = 'detail_links_done',
  testingOverrides = null,
} = {}) {
  const currentState = state || getProfileState(profileId);
  const key = String(params.key || params.searchKey || params.gateKey || profileId || '').trim() || profileId;
  const consumerId = String(params.consumerId || params.tabId || '').trim() || null;
  const payload = {
    key,
    consumerId,
    noteId: params.noteId,
    noteUrl: params.noteUrl,
    url: params.url,
    link: params.link,
    resourceKey: params.resourceKey,
    reason: params.reason,
    skip: params.skip,
  };
  const response = await postDetailLinksGate({
    pathname: '/detail-links/done',
    payload,
    testingOverrides,
    overrideName: 'completeDetailLink',
    unreachableCode: 'DETAIL_LINK_GATE_DONE_UNREACHABLE',
  });
  currentState.detailGateState = {
    ...(currentState.detailGateState && typeof currentState.detailGateState === 'object' ? currentState.detailGateState : {}),
    key,
    lastDoneAt: new Date().toISOString(),
    lastDoneLinkKey: String(response?.linkKey || '').trim() || null,
  };
  pushTrace({ kind: 'detail_gate', stage, action: 'done', key, consumerId, removed: response?.removed === true, linkKey: String(response?.linkKey || '').trim() || null });
  return { response, payload };
}

export async function releaseXhsDetailLink({
  profileId,
  params = {},
  state = null,
  pushTrace = () => {},
  stage = 'detail_links_release',
  testingOverrides = null,
} = {}) {
  const currentState = state || getProfileState(profileId);
  const key = String(params.key || params.searchKey || params.gateKey || profileId || '').trim() || profileId;
  const consumerId = String(params.consumerId || params.tabId || '').trim() || null;
  const payload = {
    key,
    consumerId,
    noteId: params.noteId,
    noteUrl: params.noteUrl,
    url: params.url,
    link: params.link,
    resourceKey: params.resourceKey,
    reason: params.reason,
    skip: params.skip,
  };
  const response = await postDetailLinksGate({
    pathname: '/detail-links/release',
    payload,
    testingOverrides,
    overrideName: 'releaseDetailLink',
    unreachableCode: 'DETAIL_LINK_GATE_RELEASE_UNREACHABLE',
  });
  currentState.detailGateState = {
    ...(currentState.detailGateState && typeof currentState.detailGateState === 'object' ? currentState.detailGateState : {}),
    key,
    lastReleaseAt: new Date().toISOString(),
    lastReleasedLinkKey: String(response?.linkKey || '').trim() || null,
  };
  pushTrace({ kind: 'detail_gate', stage, action: 'release', key, consumerId, released: response?.released === true, linkKey: String(response?.linkKey || '').trim() || null });
  return { response, payload };
}

export async function clearXhsDetailLinkQueue({
  profileId,
  params = {},
  state = null,
  pushTrace = () => {},
  stage = 'detail_links_clear',
  testingOverrides = null,
} = {}) {
  const currentState = state || getProfileState(profileId);
  const key = String(params.key || params.searchKey || params.gateKey || profileId || '').trim() || profileId;
  const payload = { key };
  const response = await postDetailLinksGate({
    pathname: '/detail-links/clear',
    payload,
    testingOverrides,
    overrideName: 'clearDetailLinks',
    unreachableCode: 'DETAIL_LINK_GATE_CLEAR_UNREACHABLE',
  });
  currentState.detailGateState = {
    ...(currentState.detailGateState && typeof currentState.detailGateState === 'object' ? currentState.detailGateState : {}),
    key,
    clearedAt: new Date().toISOString(),
  };
  pushTrace({ kind: 'detail_gate', stage, action: 'clear', key, cleared: response?.cleared === true });
  return { response, payload };
}

export async function executeWaitSearchPermitOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const maxWaitMs = Math.max(1000, Number(params.maxWaitMs ?? 300_000) || 300_000);
  const testingOverrides = context?.testingOverrides && typeof context.testingOverrides === 'object'
    ? context.testingOverrides
    : null;

  const startedAt = Date.now();
  let attempts = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    attempts += 1;
    try {
      pushTrace({ kind: 'permit', stage: 'wait_search_permit_start', attempt: attempts });
      const permit = await requestXhsGatePermit({
        profileId,
        params,
        state,
        pushTrace,
        stage: 'wait_search_permit',
        attempt: attempts,
        testingOverrides,
      });
      if (permit.allowed) {
        emitActionTrace(context, actionTrace, { stage: 'xhs_wait_search_permit' });
        return {
          ok: true,
          code: 'PERMIT_GRANTED',
          message: 'search permit granted',
          data: { attempts, waitMs: permit.waitMs, response: permit.response, payload: permit.payload },
        };
      }
      const sleepMs = Math.max(500, Math.min(permit.waitMs || 1500, 15_000));
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    } catch (error) {
      if (error?.code === 'SEARCH_GATE_REJECTED') {
        pushTrace({ kind: 'permit', stage: 'wait_search_permit', ok: false, code: 'SEARCH_GATE_REJECTED', error: 'Gate rejected due to consecutive same keyword - will retry after backoff', attempt: attempts, consecutiveSameRetry: true });
        const backoffMs = Math.min(5000 * Math.pow(1.5, Math.min(attempts - 1, 10)), 60_000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      if (error?.code === 'SEARCH_GATE_DENIED') {
        pushTrace({ kind: 'permit', stage: 'wait_search_permit', ok: false, code: 'SEARCH_GATE_DENIED', error: 'Gate denied - will retry after backoff', attempt: attempts, gateDeniedRetry: true });
        const backoffMs = Math.min(3000 * Math.pow(1.2, Math.min(attempts - 1, 10)), 30_000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      if (error?.code === 'SEARCH_GATE_UNREACHABLE') {
        pushTrace({ kind: 'permit', stage: 'wait_search_permit', ok: false, code: 'SEARCH_GATE_UNREACHABLE', error: 'Gate unreachable - will retry after backoff', attempt: attempts, gateUnreachableRetry: true });
        const backoffMs = Math.min(4000 * Math.pow(1.3, Math.min(attempts - 1, 10)), 45_000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      if (error?.code === 'OPEN_LINK_GATE_REJECTED' || error?.code === 'OPEN_LINK_GATE_DENIED') {
        throw error;
      }
      const message = error?.message || String(error);
      throw new Error(`${error?.code || 'SEARCH_GATE_UNREACHABLE'} ${message}`);
    }
  }

  const error = new Error('SEARCH_GATE_TIMEOUT');
  error.code = 'SEARCH_GATE_TIMEOUT';
  throw error;
}
