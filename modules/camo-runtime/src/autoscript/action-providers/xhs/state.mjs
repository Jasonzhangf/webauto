const XHS_OPERATION_LOCKS = new Map();
const XHS_PROFILE_STATE = new Map();

export function defaultProfileState() {
  return {
    keyword: null,
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
