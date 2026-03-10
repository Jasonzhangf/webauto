const XHS_OPERATION_LOCKS = new Map();
const XHS_PROFILE_STATE = new Map();

export function defaultProfileState() {
  return {
    keyword: null,
    env: null,
    outputRoot: null,
    downloadRoot: null,
    rootDir: null,
    currentNoteId: null,
    currentHref: null,
    lastListUrl: null,
    visitedNoteIds: [],
    preCollectedNoteIds: [],
    preCollectedAt: null,
    maxNotes: 0,
    currentComments: [],
    matchedComments: [],
    matchRule: null,
    lastCommentsHarvest: null,
    lastDetail: null,
    lastReply: null,
    metrics: {
      searchCount: 0,
      rollbackCount: 0,
      returnToSearchCount: 0,
      lastSearchAt: null,
      lastRollbackAt: null,
      lastReturnToSearchAt: null,
    },
  };
}

export function getProfileState(profileId) {
  const key = String(profileId || '').trim() || 'default';
  if (!XHS_PROFILE_STATE.has(key)) {
    XHS_PROFILE_STATE.set(key, defaultProfileState());
  }
  return XHS_PROFILE_STATE.get(key);
}

export function clearXhsPendingQueues(profileId, meta = {}) {
  const state = getProfileState(profileId);
  const now = new Date().toISOString();
  const code = String(meta.code || 'RISK_CONTROL_DETECTED').trim() || 'RISK_CONTROL_DETECTED';
  const reason = String(meta.reason || code).trim() || code;
  state.linksState = {
    sourcePath: state?.linksState?.sourcePath || null,
    queue: [],
    byTab: {},
    completed: state?.linksState?.completed && typeof state.linksState.completed === 'object'
      ? { ...state.linksState.completed }
      : {},
    exhausted: state?.linksState?.exhausted && typeof state.linksState.exhausted === 'object'
      ? { ...state.linksState.exhausted }
      : {},
  };
  state.detailLinkState = {
    ...(state?.detailLinkState && typeof state.detailLinkState === 'object' ? state.detailLinkState : {}),
    activeTabIndex: null,
    activeLink: null,
    activeLinkRetryCount: 0,
    activeFailed: true,
    lastFailureCode: code,
    lastFailureAt: now,
    lastRequeue: {
      requeued: false,
      exhausted: true,
      guardStop: true,
      reason,
      code,
      clearedAt: now,
    },
  };
  state.guardStop = {
    code,
    reason,
    stage: meta.stage ? String(meta.stage).trim() || null : null,
    detectedAt: now,
  };
  return state;
}

function toLockKey(text, fallback = '') {
  const value = String(text || '').trim();
  return value || fallback;
}

export async function withSerializedLock(lockKey, fn) {
  const key = toLockKey(lockKey);
  if (!key) return fn();
  const previous = XHS_OPERATION_LOCKS.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  XHS_OPERATION_LOCKS.set(key, previous.catch(() => null).then(() => gate));
  await previous.catch(() => null);
  try {
    return await fn();
  } finally {
    release();
    if (XHS_OPERATION_LOCKS.get(key) === gate) XHS_OPERATION_LOCKS.delete(key);
  }
}
