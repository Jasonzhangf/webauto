import { buildTraceRecorder, emitActionTrace } from './trace.mjs';
import { getProfileState } from './state.mjs';

function resolveSearchGateUrl() {
  const fromEnv = String(process.env.WEBAUTO_SEARCH_GATE_URL || '').trim();
  if (fromEnv) return fromEnv;
  const port = String(process.env.WEBAUTO_SEARCH_GATE_PORT || '7790').trim();
  return `http://127.0.0.1:${port}/permit`;
}

export async function executeWaitSearchPermitOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const { actionTrace, pushTrace } = buildTraceRecorder();
  const keyword = String(params.keyword || state.keyword || '').trim();
  const key = String(params.key || params.searchKey || profileId || '').trim() || profileId;
  const windowMs = Number(params.windowMs ?? params.windowMsOverride ?? 60_000) || 60_000;
  const maxCount = Number(params.maxCount ?? params.maxCountOverride ?? 2) || 2;
  const maxWaitMs = Math.max(1000, Number(params.maxWaitMs ?? 300_000) || 300_000);
  const gateUrl = String(params.searchGateUrl || resolveSearchGateUrl()).trim();

  const startedAt = Date.now();
  let attempts = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    attempts += 1;
    const payload = { key, windowMs, maxCount, keyword };
    let response = null;
    try {
      const res = await fetch(gateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      response = await res.json().catch(() => null);
    } catch (error) {
      const message = error?.message || String(error);
      pushTrace({ kind: 'permit', stage: 'wait_search_permit', ok: false, error: message, attempt: attempts });
      throw new Error(`SEARCH_GATE_UNREACHABLE ${message}`);
    }

    const allowed = response?.allowed === true || response?.ok === true;
    const waitMs = Number(response?.waitMs ?? response?.wait ?? 0) || 0;
    pushTrace({ kind: 'permit', stage: 'wait_search_permit', ok: allowed, attempt: attempts, waitMs });
    if (allowed) {
      emitActionTrace(context, actionTrace, { stage: 'xhs_wait_search_permit' });
      return { ok: true, code: 'PERMIT_GRANTED', message: 'search permit granted', data: { attempts, waitMs, response } };
    }
    const sleepMs = Math.max(500, Math.min(waitMs || 1500, 15_000));
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  const error = new Error('SEARCH_GATE_TIMEOUT');
  error.code = 'SEARCH_GATE_TIMEOUT';
  throw error;
}
